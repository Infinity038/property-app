// db.js — offline-first storage with sync queue
const DB = {
  SUPABASE_URL: 'https://iahpyluxfoilbvsrtpwa.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhaHB5bHV4Zm9pbGJ2c3J0cHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTIyNjQsImV4cCI6MjA5NTQ4ODI2NH0.QaIp08oLq-ZieL8fksoBBB-faAxt3RcCV1mshoN77j4',

  headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.SUPABASE_KEY,
      'Authorization': `Bearer ${this.SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    };
  },

  isOnline() { return navigator.onLine; },

  // Local cache
  local: {
    get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
    queue: {
      get() { return JSON.parse(localStorage.getItem('_sync_queue') || '[]'); },
      add(op) {
        const q = this.get();
        q.push({ ...op, id: Date.now() + Math.random() });
        localStorage.setItem('_sync_queue', JSON.stringify(q));
      },
      clear() { localStorage.setItem('_sync_queue', '[]'); },
      remove(id) {
        const q = this.get().filter(x => x.id !== id);
        localStorage.setItem('_sync_queue', JSON.stringify(q));
      }
    }
  },

  async request(method, table, body = null, query = '') {
    const url = `${this.SUPABASE_URL}/rest/v1/${table}${query}`;
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(await res.text());
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  },

  async getAll(table) {
    if (!this.isOnline()) {
      return this.local.get(table) || [];
    }
    try {
      const data = await this.request('GET', table, null, '?order=created_at.desc');
      this.local.set(table, data);
      return data;
    } catch {
      return this.local.get(table) || [];
    }
  },

  async insert(table, row) {
    const tempId = 'temp_' + Date.now();
    const tempRow = { ...row, id: tempId, created_at: new Date().toISOString() };
    // update local cache immediately
    const cached = this.local.get(table) || [];
    cached.unshift(tempRow);
    this.local.set(table, cached);

    if (!this.isOnline()) {
      this.local.queue.add({ type: 'insert', table, row });
      return tempRow;
    }
    try {
      const [saved] = await this.request('POST', table, row);
      // replace temp with real
      const updated = (this.local.get(table) || []).map(r => r.id === tempId ? saved : r);
      this.local.set(table, updated);
      return saved;
    } catch {
      this.local.queue.add({ type: 'insert', table, row });
      return tempRow;
    }
  },

  async update(table, id, row) {
    const cached = this.local.get(table) || [];
    const updated = cached.map(r => r.id === id ? { ...r, ...row } : r);
    this.local.set(table, updated);

    if (!this.isOnline()) {
      this.local.queue.add({ type: 'update', table, id, row });
      return;
    }
    try {
      await this.request('PATCH', table, row, `?id=eq.${id}`);
    } catch {
      this.local.queue.add({ type: 'update', table, id, row });
    }
  },

  async delete(table, id) {
    const cached = (this.local.get(table) || []).filter(r => r.id !== id);
    this.local.set(table, cached);

    if (!this.isOnline()) {
      this.local.queue.add({ type: 'delete', table, id });
      return;
    }
    try {
      await this.request('DELETE', table, null, `?id=eq.${id}`);
    } catch {
      this.local.queue.add({ type: 'delete', table, id });
    }
  },

  async upsertSingle(table, row, matchCol = 'id') {
    // for single-row tables like rental_income
    const existing = (this.local.get(table) || [])[0];
    if (existing) {
      return this.update(table, existing.id, row);
    } else {
      return this.insert(table, row);
    }
  },

  async syncQueue() {
    if (!this.isOnline()) return;
    const queue = this.local.queue.get();
    for (const op of queue) {
      try {
        if (op.type === 'insert') await this.request('POST', op.table, op.row);
        if (op.type === 'update') await this.request('PATCH', op.table, op.row, `?id=eq.${op.id}`);
        if (op.type === 'delete') await this.request('DELETE', op.table, null, `?id=eq.${op.id}`);
        this.local.queue.remove(op.id);
      } catch {}
    }
    // refresh all caches after sync
    for (const t of ['profiles', 'properties', 'expenses', 'goals', 'rental_income']) {
      try {
        const data = await this.request('GET', t, null, '?order=created_at.desc');
        this.local.set(t, data);
      } catch {}
    }
  }
};

window.addEventListener('online', () => {
  DB.syncQueue();
  if (window.App) App.showToast('Back online — syncing...', 'success');
});
window.addEventListener('offline', () => {
  if (window.App) App.showToast('Offline — changes saved locally', 'warning');
});
