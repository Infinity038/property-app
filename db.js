// db.js — offline-first + Supabase Auth
const DB = {
  SUPABASE_URL: 'https://iahpyluxfoilbvsrtpwa.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhaHB5bHV4Zm9pbGJ2c3J0cHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTIyNjQsImV4cCI6MjA5NTQ4ODI2NH0.QaIp08oLq-ZieL8fksoBBB-faAxt3RcCV1mshoN77j4',
  _session: null,

  // ── AUTH ──────────────────────────────────────────────────────────────────
  async signIn(email, password) {
    const res = await fetch(`${this.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': this.SUPABASE_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Login failed');
    this._session = data;
    localStorage.setItem('_session', JSON.stringify(data));
    return data;
  },

  async signUp(email, password) {
    const res = await fetch(`${this.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': this.SUPABASE_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Signup failed');
    return data;
  },

  async signOut() {
    const token = this._session?.access_token;
    if (token) {
      await fetch(`${this.SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': this.SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      }).catch(() => {});
    }
    this._session = null;
    localStorage.removeItem('_session');
  },

  async refreshSession() {
    const stored = localStorage.getItem('_session');
    if (!stored) return null;
    const s = JSON.parse(stored);
    // Try refreshing with refresh_token
    if (s.refresh_token) {
      try {
        const res = await fetch(`${this.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': this.SUPABASE_KEY },
          body: JSON.stringify({ refresh_token: s.refresh_token })
        });
        if (res.ok) {
          const data = await res.json();
          this._session = data;
          localStorage.setItem('_session', JSON.stringify(data));
          return data;
        }
      } catch {}
    }
    // Session expired
    localStorage.removeItem('_session');
    return null;
  },

  getSession() {
    if (this._session) return this._session;
    const s = localStorage.getItem('_session');
    if (s) { this._session = JSON.parse(s); return this._session; }
    return null;
  },

  isLoggedIn() { return !!this.getSession(); },

  headers() {
    const session = this.getSession();
    const token = session?.access_token || this.SUPABASE_KEY;
    return {
      'Content-Type': 'application/json',
      'apikey': this.SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer': 'return=representation'
    };
  },

  isOnline() { return navigator.onLine; },

  local: {
    get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
    queue: {
      get() { return JSON.parse(localStorage.getItem('_sync_queue') || '[]'); },
      add(op) { const q = this.get(); q.push({ ...op, id: Date.now() + Math.random() }); localStorage.setItem('_sync_queue', JSON.stringify(q)); },
      remove(id) { const q = this.get().filter(x => x.id !== id); localStorage.setItem('_sync_queue', JSON.stringify(q)); }
    }
  },

  async request(method, table, body = null, query = '') {
    const url = `${this.SUPABASE_URL}/rest/v1/${table}${query}`;
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) {
      // Token expired — try refresh
      const refreshed = await this.refreshSession();
      if (!refreshed) { window.location.reload(); return []; }
      const opts2 = { method, headers: this.headers() };
      if (body) opts2.body = JSON.stringify(body);
      const res2 = await fetch(url, opts2);
      if (!res2.ok) throw new Error(await res2.text());
      const t2 = await res2.text(); return t2 ? JSON.parse(t2) : [];
    }
    if (!res.ok) throw new Error(await res.text());
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  },

  async getAll(table) {
    if (!this.isOnline()) return this.local.get(table) || [];
    try {
      const data = await this.request('GET', table, null, '?order=created_at.desc');
      this.local.set(table, data);
      return data;
    } catch { return this.local.get(table) || []; }
  },

  async insert(table, row) {
    const tempId = 'temp_' + Date.now();
    const tempRow = { ...row, id: tempId, created_at: new Date().toISOString() };
    const cached = this.local.get(table) || [];
    cached.unshift(tempRow);
    this.local.set(table, cached);
    if (!this.isOnline()) { this.local.queue.add({ type: 'insert', table, row }); return tempRow; }
    try {
      const [saved] = await this.request('POST', table, row);
      const updated = (this.local.get(table) || []).map(r => r.id === tempId ? saved : r);
      this.local.set(table, updated);
      return saved;
    } catch { this.local.queue.add({ type: 'insert', table, row }); return tempRow; }
  },

  async update(table, id, row) {
    const cached = this.local.get(table) || [];
    this.local.set(table, cached.map(r => r.id === id ? { ...r, ...row } : r));
    if (!this.isOnline()) { this.local.queue.add({ type: 'update', table, id, row }); return; }
    try { await this.request('PATCH', table, row, `?id=eq.${id}`); }
    catch { this.local.queue.add({ type: 'update', table, id, row }); }
  },

  async delete(table, id) {
    this.local.set(table, (this.local.get(table) || []).filter(r => r.id !== id));
    if (!this.isOnline()) { this.local.queue.add({ type: 'delete', table, id }); return; }
    try { await this.request('DELETE', table, null, `?id=eq.${id}`); }
    catch { this.local.queue.add({ type: 'delete', table, id }); }
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
    for (const t of ['profiles','properties','expenses','goals','rental_income','tenants','maintenance_logs','budgets','income_entries']) {
      try { const d = await this.request('GET', t, null, '?order=created_at.desc'); this.local.set(t, d); } catch {}
    }
  }
};

window.addEventListener('online', () => { DB.syncQueue(); if (window.App) App.showToast('Back online — syncing...', 'success'); });
window.addEventListener('offline', () => { if (window.App) App.showToast('Offline — changes saved locally', 'warning'); });
