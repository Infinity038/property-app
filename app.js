// app.js — Ducay Property Portfolio App

const CURRENCY = 'kr.';
const fmt = n => Number(n||0).toLocaleString('da-DK', {minimumFractionDigits:0,maximumFractionDigits:0}) + ' ' + CURRENCY;
const fmtInput = n => Number(n||0).toLocaleString('da-DK', {minimumFractionDigits:0,maximumFractionDigits:0});
const parseNum = s => parseFloat(String(s).replace(/[^\d.]/g,'')) || 0;

const CAT_COLORS = {
  Housing:'#FAEEDA', Food:'#E6F1FB', Transport:'#EAF3DE',
  Utilities:'#EEEDFE', Entertainment:'#FBEAF0', Healthcare:'#E1F5EE',
  Maintenance:'#E1F5EE', Renovation:'#FAEEDA', Business:'#E6F1FB',
  Personal:'#F4C0D1', Other:'#f1efe8'
};
const CAT_ICONS = {
  Housing:'ti-home-dollar', Food:'ti-shopping-cart', Transport:'ti-car',
  Utilities:'ti-bolt', Entertainment:'ti-device-tv', Healthcare:'ti-heart-rate-monitor',
  Maintenance:'ti-tools', Renovation:'ti-hammer', Business:'ti-briefcase',
  Personal:'ti-user', Other:'ti-dots'
};
const CAT_TEXT = {
  Housing:'#854F0B', Food:'#185FA5', Transport:'#3B6D11',
  Utilities:'#534AB7', Entertainment:'#993556', Healthcare:'#0F6E56',
  Maintenance:'#0F6E56', Renovation:'#854F0B', Business:'#185FA5',
  Personal:'#993556', Other:'#6b6b6b'
};

const GOAL_ICONS = ['ti-shield-check','ti-building-bank','ti-hammer','ti-plane','ti-car','ti-heart','ti-star','ti-piggy-bank','ti-cash','ti-target'];

window.App = {
  state: { profiles:[], properties:[], expenses:[], goals:[], rentalIncome:0, activeExp:'All', scanFile:null, scanCatSel:null, editingGoalId:null, editingExpId:null, editingPropId:null },

  async init() {
    this.updateClock();
    setInterval(()=>this.updateClock(),30000);
    this.updateOnlineStatus();
    window.addEventListener('online', ()=>this.updateOnlineStatus());
    window.addEventListener('offline', ()=>this.updateOnlineStatus());
    await this.loadAll();
    this.renderAll();
    // Register SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(()=>{});
    }
  },

  async loadAll() {
    const [profiles, properties, expenses, goals, rental] = await Promise.all([
      DB.getAll('profiles'), DB.getAll('properties'), DB.getAll('expenses'),
      DB.getAll('goals'), DB.getAll('rental_income')
    ]);
    this.state.profiles = profiles || [];
    this.state.properties = properties || [];
    this.state.expenses = expenses || [];
    this.state.goals = goals || [];
    this.state.rentalIncome = rental?.[0]?.total_monthly || 0;
  },

  renderAll() {
    this.renderDashboard();
    this.renderSalary();
    this.renderExpenses();
    this.renderGoals();
    this.renderProperties();
  },

  updateClock() {
    const el = document.getElementById('clock');
    if (el) el.textContent = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  },

  updateOnlineStatus() {
    const dot = document.getElementById('sync-dot');
    if (!dot) return;
    if (navigator.onLine) { dot.className='sync-dot'; dot.title='Online'; }
    else { dot.className='sync-dot offline'; dot.title='Offline'; }
  },

  showToast(msg, type='') {
    let t = document.getElementById('toast');
    if (!t) { t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
    t.textContent = msg; t.className = 'toast show ' + type;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(()=>t.classList.remove('show'), 3000);
  },

  // ── COMPUTED ──────────────────────────────────────────────────────────────
  getTotalIncome() {
    const sal = this.state.profiles.reduce((s,p)=>s+parseNum(p.monthly_salary)+parseNum(p.bonus),0);
    return sal + parseNum(this.state.rentalIncome);
  },
  getTotalExpenses() {
    const now = new Date(); const m=now.getMonth(), y=now.getFullYear();
    return this.state.expenses.filter(e=>{ const d=new Date(e.date||e.created_at); return d.getMonth()===m&&d.getFullYear()===y; }).reduce((s,e)=>s+parseNum(e.amount),0);
  },
  getTotalRent() { return this.state.properties.reduce((s,p)=>s+parseNum(p.rent_income),0); },
  getTotalCashFlow() { return this.state.properties.reduce((s,p)=>s+parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax),0); },
  getTotalEquity() { return this.state.properties.reduce((s,p)=>s+parseNum(p.current_value)-parseNum(p.loan_balance),0); },
  getGoalsAllocated() { return this.state.goals.reduce((s,g)=>s+parseNum(g.monthly_allocation),0); },
  getFreeCash() { return this.getTotalIncome() - this.getTotalExpenses(); },

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  renderDashboard() {
    const p1 = this.state.profiles[0]||{name:'Jovannie Ducay'};
    const p2 = this.state.profiles[1]||{name:'Melody Ducay'};
    const n1 = p1.name.split(' ')[0], n2 = p2.name.split(' ')[0];
    const init1 = (p1.name.split(' ')[0][0]||'J')+(p1.name.split(' ')[1]?.[0]||'D');
    const init2 = (p2.name.split(' ')[0][0]||'M')+(p2.name.split(' ')[1]?.[0]||'D');
    const equity = this.getTotalEquity();
    const income = this.getTotalIncome();
    const expenses = this.getTotalExpenses();
    const savingsRate = income > 0 ? Math.round((income-expenses)/income*100) : 0;
    const cashFlow = this.getTotalCashFlow();
    const freeCash = this.getFreeCash();

    // Nearest goal not complete
    const nextGoal = this.state.goals.filter(g=>!g.completed).sort((a,b)=>parseNum(b.saved)/parseNum(b.target)-parseNum(a.saved)/parseNum(a.target))[0];

    document.getElementById('dash-content').innerHTML = `
      <div class="dash-hd">
        <div class="dh-top">
          <div>
            <div class="dh-greeting">Good ${this.timeOfDay()},</div>
            <div class="dh-names">${n1} & ${n2} 👋</div>
          </div>
          <div style="display:flex;gap:-6px">
            <div class="avatar">${init1}</div>
            <div class="avatar" style="margin-left:-8px">${init2}</div>
          </div>
        </div>
        <div class="net-worth">${fmt(equity)}</div>
        <div class="nw-sub">Total portfolio equity</div>
        <div class="badge-row">
          <span class="badge"><i class="ti ti-trending-up" style="font-size:11px"></i> +${fmt(cashFlow)}/mo cash flow</span>
          <span class="badge">${this.state.properties.length} ${this.state.properties.length===1?'property':'properties'}</span>
        </div>
      </div>

      <div class="sec" style="margin-top:14px">
        <div class="sec-hd"><span class="sec-title">Monthly snapshot</span></div>
        <div class="cards2">
          <div class="mcard"><div class="lbl">Combined income</div><div class="val">${fmt(income)}</div><div class="hint">incl. ${fmt(parseNum(this.state.rentalIncome))} rental</div></div>
          <div class="mcard"><div class="lbl">This month exp.</div><div class="val">${fmt(expenses)}</div><div class="hint">tracked expenses</div></div>
          <div class="mcard"><div class="lbl">Savings rate</div><div class="val">${savingsRate}%</div><div class="hint">${fmt(freeCash)} free/mo</div></div>
          <div class="mcard"><div class="lbl">Next target</div><div class="val">${nextGoal?fmt(parseNum(nextGoal.target)-parseNum(nextGoal.saved)):'—'}</div><div class="hint">${nextGoal?nextGoal.title:'No goals set'}</div></div>
        </div>
      </div>

      <div class="sec" style="margin-top:14px">
        <div class="sec-hd"><span class="sec-title">Properties</span><button class="sec-action" onclick="App.switchPage('props')">View all</button></div>
        ${this.state.properties.length===0?`<div class="empty-state"><i class="ti ti-building"></i><div>No properties yet</div><button class="btn-sm" style="margin-top:10px" onclick="App.switchPage('props')"><i class="ti ti-plus"></i> Add first property</button></div>`:''}
        ${this.state.properties.slice(0,3).map(p=>{
          const cf = parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax);
          return `<div class="prop-card" onclick="App.switchPage('props')">
            <div class="prop-ico"><i class="ti ${p.name.toLowerCase().includes('condo')||p.name.toLowerCase().includes('apartment')?'ti-building':'ti-home'}"></i></div>
            <div style="flex:1;min-width:0"><div class="pname">${p.name}</div><div class="paddr">${p.address||'No address'} — ${p.status||'Rented'}</div></div>
            <div><div class="prent">${fmt(p.rent_income)}/mo</div><div class="pcf">${cf>=0?'+':''}${fmt(cf)} cf</div></div>
          </div>`;
        }).join('')}
      </div>

      <div class="sec" style="margin-top:14px;padding-bottom:20px">
        <div class="sec-hd"><span class="sec-title">Goals at a glance</span><button class="sec-action" onclick="App.switchPage('goals')">View all</button></div>
        ${this.state.goals.length===0?`<div class="empty-state"><i class="ti ti-target"></i><div>No goals set yet</div><button class="btn-sm" style="margin-top:10px" onclick="App.switchPage('goals')"><i class="ti ti-plus"></i> Add goal</button></div>`:''}
        ${this.state.goals.slice(0,3).map(g=>{
          const pct = Math.min(100, Math.round(parseNum(g.saved)/parseNum(g.target)*100));
          const done = pct>=100||g.completed;
          return `<div class="goal-card${done?' done':''}">
            <div class="g-hd">
              <div class="g-ico${done?' done-ico':''}"><i class="ti ${g.icon||'ti-target'}"></i></div>
              <div><div class="g-title">${g.title}${done?`<span class="done-badge"><i class="ti ti-check" style="font-size:10px"></i> Reached!</span>`:''}</div><div class="g-sub">${fmt(g.saved)} of ${fmt(g.target)}</div></div>
            </div>
            <div class="bar-bg"><div class="bar-fill" style="width:0%" data-pct="${pct}"></div></div>
            ${!done?`<div class="g-foot"><span>${fmt(g.monthly_allocation)}/mo</span><span class="g-pct">${pct}%</span></div>`:''}
          </div>`;
        }).join('')}
      </div>`;
    setTimeout(()=>this.animateBars(),300);
  },

  // ── SALARY ────────────────────────────────────────────────────────────────
  renderSalary() {
    const p1 = this.state.profiles[0]||{name:'Jovannie Ducay',monthly_salary:0,pay_frequency:'Monthly',bonus:0};
    const p2 = this.state.profiles[1]||{name:'Melody Ducay',monthly_salary:0,pay_frequency:'Monthly',bonus:0};
    const rental = parseNum(this.state.rentalIncome);
    const total = parseNum(p1.monthly_salary)+parseNum(p1.bonus)+parseNum(p2.monthly_salary)+parseNum(p2.bonus)+rental;
    document.getElementById('salary-content').innerHTML = `
      <div class="form-wrap">
        <h3>Income setup</h3>
        <div style="background:var(--faint);border-radius:12px;padding:10px 14px;margin-bottom:6px;font-size:13px;color:var(--muted);display:flex;gap:6px;align-items:center">
          <i class="ti ti-info-circle" style="font-size:16px;flex-shrink:0"></i>
          Both profiles auto-sync to dashboard in real-time
        </div>
        <div class="person-hd"><i class="ti ti-user" style="font-size:16px"></i>${p1.name}</div>
        <div class="field"><label>Monthly salary (after tax)</label><input type="number" id="sal-p1" value="${parseNum(p1.monthly_salary)}" placeholder="0" onchange="App.updateSalaryTotal()"></div>
        <div class="field"><label>Pay frequency</label><select id="freq-p1">${['Monthly','Bi-weekly','Weekly'].map(f=>`<option${p1.pay_frequency===f?' selected':''}>${f}</option>`).join('')}</select></div>
        <div class="field"><label>Bonus / extra income (avg/mo)</label><input type="number" id="bon-p1" value="${parseNum(p1.bonus)}" placeholder="0" onchange="App.updateSalaryTotal()"></div>
        <div class="divider"></div>
        <div class="person-hd"><i class="ti ti-user" style="font-size:16px"></i>${p2.name}</div>
        <div class="field"><label>Monthly salary (after tax)</label><input type="number" id="sal-p2" value="${parseNum(p2.monthly_salary)}" placeholder="0" onchange="App.updateSalaryTotal()"></div>
        <div class="field"><label>Pay frequency</label><select id="freq-p2">${['Monthly','Bi-weekly','Weekly'].map(f=>`<option${p2.pay_frequency===f?' selected':''}>${f}</option>`).join('')}</select></div>
        <div class="field"><label>Bonus / extra income (avg/mo)</label><input type="number" id="bon-p2" value="${parseNum(p2.bonus)}" placeholder="0" onchange="App.updateSalaryTotal()"></div>
        <div class="divider"></div>
        <div class="person-hd"><i class="ti ti-building" style="font-size:16px"></i>Rental income</div>
        <div class="field"><label>Total monthly rent received</label><input type="number" id="rental-total" value="${rental}" placeholder="0" onchange="App.updateSalaryTotal()"></div>
        <div class="total-box">
          <span class="tl">Total household income</span>
          <span class="ta" id="salary-total">${fmt(total)}</span>
        </div>
        <button class="btn-primary" onclick="App.saveSalary()"><i class="ti ti-device-floppy"></i> Save income</button>
      </div>`;
  },

  updateSalaryTotal() {
    const v = (id)=>parseNum(document.getElementById(id)?.value||0);
    const total = v('sal-p1')+v('bon-p1')+v('sal-p2')+v('bon-p2')+v('rental-total');
    const el = document.getElementById('salary-total');
    if (el) el.textContent = fmt(total);
  },

  async saveSalary() {
    const btn = document.querySelector('#page-salary .btn-primary');
    if (btn) { btn.classList.add('loading'); btn.innerHTML='<span class="spinner"></span> Saving...'; }
    const p1 = this.state.profiles[0], p2 = this.state.profiles[1];
    const d1 = { monthly_salary:parseNum(document.getElementById('sal-p1').value), pay_frequency:document.getElementById('freq-p1').value, bonus:parseNum(document.getElementById('bon-p1').value) };
    const d2 = { monthly_salary:parseNum(document.getElementById('sal-p2').value), pay_frequency:document.getElementById('freq-p2').value, bonus:parseNum(document.getElementById('bon-p2').value) };
    const rentalVal = parseNum(document.getElementById('rental-total').value);
    if (p1?.id) { await DB.update('profiles', p1.id, d1); Object.assign(this.state.profiles[0], d1); }
    if (p2?.id) { await DB.update('profiles', p2.id, d2); Object.assign(this.state.profiles[1], d2); }
    this.state.rentalIncome = rentalVal;
    const rentalRow = (DB.local.get('rental_income')||[])[0];
    if (rentalRow?.id) await DB.update('rental_income', rentalRow.id, {total_monthly:rentalVal});
    else await DB.insert('rental_income', {total_monthly:rentalVal});
    this.renderDashboard();
    if (btn) { btn.classList.remove('loading'); btn.innerHTML='<i class="ti ti-check"></i> Saved!'; setTimeout(()=>btn.innerHTML='<i class="ti ti-device-floppy"></i> Save income',2000); }
    this.showToast('Income saved!', 'success');
  },

  // ── EXPENSES ──────────────────────────────────────────────────────────────
  renderExpenses() {
    const now = new Date(); const m=now.getMonth(), y=now.getFullYear();
    const monthExp = this.state.expenses.filter(e=>{ const d=new Date(e.date||e.created_at); return d.getMonth()===m&&d.getFullYear()===y; });
    const filtered = this.state.activeExp==='All' ? monthExp : monthExp.filter(e=>e.category===this.state.activeExp);
    const total = monthExp.reduce((s,e)=>s+parseNum(e.amount),0);
    const cats = ['All',...new Set(monthExp.map(e=>e.category))];
    document.getElementById('expenses-content').innerHTML = `
      <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="App.handleDrop(event)">
        <i class="ti ti-camera-plus"></i>
        <p>Take photo or upload receipt</p>
        <small>AI scans & suggests category automatically</small>
        <input type="file" id="file-input" accept="image/*" capture="environment" style="display:none" onchange="App.handleFileSelect(event)">
      </div>
      <div class="exp-hd">
        <span>${now.toLocaleString('default',{month:'long'})} ${y}</span>
        <span style="color:var(--danger)">${fmt(total)} total</span>
      </div>
      <div class="exp-filters">
        ${cats.map(c=>`<button class="filter-pill${this.state.activeExp===c?' active':''}" onclick="App.filterExp('${c}')">${c}</button>`).join('')}
      </div>
      ${filtered.length===0?`<div class="empty-state"><i class="ti ti-receipt"></i><div>No expenses yet this month</div></div>`:''}
      <div id="exp-list">
        ${filtered.map(e=>this.expItemHTML(e)).join('')}
      </div>
      <div style="padding:14px 18px">
        <button class="add-card-btn" onclick="App.openAddExpense()"><i class="ti ti-plus" style="font-size:18px"></i> Add expense manually</button>
      </div>`;
  },

  expItemHTML(e) {
    const bg = CAT_COLORS[e.category]||'#f1efe8';
    const ico = CAT_ICONS[e.category]||'ti-dots';
    const col = CAT_TEXT[e.category]||'#6b6b6b';
    return `<div class="exp-item" id="exp-${e.id}">
      <div class="exp-cat-ico" style="background:${bg}"><i class="ti ${ico}" style="color:${col}"></i></div>
      <div style="flex:1;min-width:0"><div class="exp-name">${e.name}</div><div class="exp-catname">${e.category} · ${new Date(e.date||e.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}${e.receipt_url?` · <span style="color:var(--accent)">📎 receipt</span>`:''}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="exp-amt">${fmt(e.amount)}</div>
        <button onclick="App.deleteExpense('${e.id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:0"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  },

  filterExp(cat) {
    this.state.activeExp = cat;
    this.renderExpenses();
  },

  handleDrop(e) {
    e.preventDefault();
    document.getElementById('upload-zone').classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) this.processScanFile(file);
  },

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) this.processScanFile(file);
  },

  processScanFile(file) {
    this.state.scanFile = file;
    // Show scan modal with preview
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById('scan-preview').src = ev.target.result;
      document.getElementById('scan-preview').style.display = 'block';
    };
    reader.readAsDataURL(file);
    this.state.scanCatSel = null;
    document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('sel'));
    this.openSheet('scanSheet');
  },

  openAddExpense(prefill={}) {
    this.state.scanFile = null;
    document.getElementById('scan-preview').style.display='none';
    document.getElementById('scan-name').value = prefill.name||'';
    document.getElementById('scan-amount').value = prefill.amount||'';
    document.getElementById('scan-date').value = prefill.date||new Date().toISOString().split('T')[0];
    if (prefill.category) this.selectCat(prefill.category);
    this.openSheet('scanSheet');
  },

  selectCat(cat) {
    this.state.scanCatSel = cat;
    document.querySelectorAll('.cat-btn').forEach(b=>{
      b.classList.toggle('sel', b.dataset.cat===cat);
    });
  },

  async confirmExpense() {
    const name = document.getElementById('scan-name').value.trim();
    const amount = parseNum(document.getElementById('scan-amount').value);
    const date = document.getElementById('scan-date').value;
    const cat = this.state.scanCatSel || 'Other';
    if (!name || !amount) { this.showToast('Enter name & amount', 'error'); return; }
    const btn = document.getElementById('confirm-expense-btn');
    btn.classList.add('loading'); btn.innerHTML='<span class="spinner"></span>';

    let receiptUrl = null;
    if (this.state.scanFile) {
      receiptUrl = await this.uploadReceipt(this.state.scanFile).catch(()=>null);
    }
    const exp = await DB.insert('expenses', { name, amount, category:cat, date, receipt_url:receiptUrl });
    this.state.expenses.unshift(exp);
    this.closeSheet('scanSheet');
    this.renderExpenses();
    this.renderDashboard();
    this.showToast('Expense added!', 'success');
    btn.classList.remove('loading'); btn.innerHTML='<i class="ti ti-check"></i> Save expense';
  },

  async uploadReceipt(file) {
    // Upload to Supabase storage
    const ext = file.name.split('.').pop();
    const path = `receipts/${Date.now()}.${ext}`;
    const res = await fetch(`${DB.SUPABASE_URL}/storage/v1/object/receipts/${path}`, {
      method:'POST', headers:{ 'apikey':DB.SUPABASE_KEY, 'Authorization':`Bearer ${DB.SUPABASE_KEY}`, 'Content-Type':file.type },
      body: file
    });
    if (res.ok) return `${DB.SUPABASE_URL}/storage/v1/object/public/receipts/${path}`;
    return null;
  },

  async deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
    this.state.expenses = this.state.expenses.filter(e=>e.id!==id);
    await DB.delete('expenses', id);
    this.renderExpenses();
    this.renderDashboard();
    this.showToast('Expense deleted');
  },

  // ── GOALS ─────────────────────────────────────────────────────────────────
  renderGoals() {
    const allocated = this.getGoalsAllocated();
    const free = this.getTotalIncome() - allocated;
    document.getElementById('goals-content').innerHTML = `
      <div style="padding:18px">
        <div class="section-hd-row">
          <span>Financial goals</span>
          <button class="btn-sm" onclick="App.openAddGoal()"><i class="ti ti-plus" style="font-size:13px"></i> Add goal</button>
        </div>
        ${this.state.goals.length===0?`<div class="empty-state"><i class="ti ti-target"></i><div>No goals yet — add your first one!</div></div>`:''}
        <div id="goals-list">
          ${this.state.goals.map(g=>this.goalCardHTML(g)).join('')}
        </div>
        <div style="background:var(--faint);border-radius:14px;padding:14px;border:1px solid var(--border);margin-top:8px">
          <div style="font-size:12px;font-weight:800;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px">Monthly allocation</div>
          <div class="summary-row"><span class="sr-lbl">Allocated to goals</span><span class="sr-val">${fmt(allocated)}/mo</span></div>
          <div class="summary-row"><span class="sr-lbl">Total income</span><span class="sr-val">${fmt(this.getTotalIncome())}/mo</span></div>
          <div class="summary-row"><span class="sr-lbl">Remaining free cash</span><span class="sr-val" style="color:${free>=0?'var(--accent)':'var(--danger)'}">${fmt(free)}/mo</span></div>
        </div>
      </div>`;
    setTimeout(()=>this.animateBars(),300);
  },

  goalCardHTML(g) {
    const pct = Math.min(100, Math.round(parseNum(g.saved)/parseNum(g.target)*100));
    const done = pct>=100||g.completed;
    const remaining = Math.max(0, parseNum(g.target)-parseNum(g.saved));
    const months = parseNum(g.monthly_allocation)>0 ? Math.ceil(remaining/parseNum(g.monthly_allocation)) : null;
    return `<div class="goal-card${done?' done':''}" id="gcard-${g.id}">
      <div id="conf-${g.id}"></div>
      <div class="g-hd">
        <div class="g-ico${done?' done-ico':''}"><i class="ti ${g.icon||'ti-target'}"></i></div>
        <div style="flex:1;min-width:0">
          <div class="g-title">${g.title}${done?`<span class="done-badge"><i class="ti ti-check" style="font-size:10px"></i> Reached!</span>`:''}</div>
          <div class="g-sub">${fmt(g.saved)} of ${fmt(g.target)}</div>
        </div>
      </div>
      <div class="bar-bg"><div class="bar-fill" data-pct="${pct}" style="width:0%"></div></div>
      <div class="g-foot">
        <span>${fmt(g.monthly_allocation)}/mo${months?' · ~'+months+' mo left':''}</span>
        <span class="g-pct">${pct}%</span>
      </div>
      <div class="g-actions">
        <button class="btn-outline" style="flex:1;justify-content:center;font-size:12px;padding:7px" onclick="App.openEditGoal('${g.id}')"><i class="ti ti-edit" style="font-size:14px"></i> Edit</button>
        <button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.addToGoal('${g.id}')"><i class="ti ti-plus" style="font-size:14px"></i> Add funds</button>
        <button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.deleteGoal('${g.id}')"><i class="ti ti-trash" style="font-size:14px;color:var(--danger)"></i></button>
      </div>
    </div>`;
  },

  openAddGoal() {
    this.state.editingGoalId = null;
    document.getElementById('goal-sheet-title').textContent = 'New goal';
    document.getElementById('goal-title-in').value = '';
    document.getElementById('goal-target-in').value = '';
    document.getElementById('goal-saved-in').value = '';
    document.getElementById('goal-alloc-in').value = '';
    document.getElementById('goal-icon-sel').value = 'ti-target';
    this.openSheet('goalSheet');
  },

  openEditGoal(id) {
    const g = this.state.goals.find(x=>x.id===id);
    if (!g) return;
    this.state.editingGoalId = id;
    document.getElementById('goal-sheet-title').textContent = 'Edit goal';
    document.getElementById('goal-title-in').value = g.title;
    document.getElementById('goal-target-in').value = parseNum(g.target);
    document.getElementById('goal-saved-in').value = parseNum(g.saved);
    document.getElementById('goal-alloc-in').value = parseNum(g.monthly_allocation);
    document.getElementById('goal-icon-sel').value = g.icon||'ti-target';
    this.openSheet('goalSheet');
  },

  async saveGoal() {
    const title = document.getElementById('goal-title-in').value.trim();
    const target = parseNum(document.getElementById('goal-target-in').value);
    const saved = parseNum(document.getElementById('goal-saved-in').value);
    const alloc = parseNum(document.getElementById('goal-alloc-in').value);
    const icon = document.getElementById('goal-icon-sel').value;
    if (!title || !target) { this.showToast('Enter title & target amount', 'error'); return; }
    const data = { title, target, saved, monthly_allocation:alloc, icon, completed: saved>=target };
    if (this.state.editingGoalId) {
      await DB.update('goals', this.state.editingGoalId, data);
      const idx = this.state.goals.findIndex(g=>g.id===this.state.editingGoalId);
      if (idx>=0) this.state.goals[idx] = {...this.state.goals[idx],...data};
    } else {
      const g = await DB.insert('goals', data);
      this.state.goals.unshift(g);
    }
    this.closeSheet('goalSheet');
    this.renderGoals();
    this.renderDashboard();
    this.showToast(this.state.editingGoalId?'Goal updated!':'Goal created!','success');
  },

  async addToGoal(id) {
    const amt = prompt('How much to add (kr.)?');
    if (!amt) return;
    const g = this.state.goals.find(x=>x.id===id);
    if (!g) return;
    const newSaved = parseNum(g.saved) + parseNum(amt);
    const completed = newSaved >= parseNum(g.target);
    await DB.update('goals', id, { saved:newSaved, completed });
    g.saved = newSaved; g.completed = completed;
    this.renderGoals();
    this.renderDashboard();
    if (completed) { setTimeout(()=>this.launchConfetti(id), 400); this.showToast('🎉 Goal reached!','success'); }
    else this.showToast(`Added ${fmt(parseNum(amt))} to ${g.title}`, 'success');
  },

  async deleteGoal(id) {
    if (!confirm('Delete this goal?')) return;
    this.state.goals = this.state.goals.filter(g=>g.id!==id);
    await DB.delete('goals', id);
    this.renderGoals();
    this.renderDashboard();
    this.showToast('Goal deleted');
  },

  launchConfetti(id) {
    const c = document.getElementById('conf-'+id);
    if (!c) return;
    const cols = ['#1D9E75','#9FE1CB','#5DCAA5','#fff','#E1F5EE','#0F6E56'];
    c.innerHTML = '';
    for (let i=0;i<24;i++) {
      const d = document.createElement('div');
      d.className = 'conf';
      const x = (Math.random()*160-80)+'px';
      d.style.cssText = `left:${Math.random()*100}%;top:${50+Math.random()*40}%;background:${cols[i%cols.length]};--x:${x};animation-delay:${Math.random()*.6}s;animation-duration:${.9+Math.random()*.6}s;position:absolute`;
      c.appendChild(d);
    }
    setTimeout(()=>c.innerHTML='', 3000);
  },

  // ── PROPERTIES ────────────────────────────────────────────────────────────
  renderProperties() {
    const totalRent = this.getTotalRent();
    const totalCF = this.getTotalCashFlow();
    const totalEquity = this.getTotalEquity();
    document.getElementById('props-content').innerHTML = `
      <div class="prop-detail">
        <div class="section-hd-row">
          <span>Properties</span>
          <button class="btn-sm" onclick="App.openAddProp()"><i class="ti ti-plus" style="font-size:13px"></i> Add property</button>
        </div>
        <div class="cards2" style="margin-bottom:14px">
          <div class="mcard"><div class="lbl">Total rental income</div><div class="val">${fmt(totalRent)}</div><div class="hint">per month</div></div>
          <div class="mcard"><div class="lbl">Net cash flow</div><div class="val" style="color:${totalCF>=0?'var(--accent)':'var(--danger)'}">${fmt(totalCF)}</div><div class="hint">per month</div></div>
          <div class="mcard"><div class="lbl">Total equity</div><div class="val">${fmt(totalEquity)}</div><div class="hint">across all properties</div></div>
          <div class="mcard"><div class="lbl">Properties</div><div class="val">${this.state.properties.length}</div><div class="hint">in portfolio</div></div>
        </div>

        ${this.state.properties.length===0?`<div class="empty-state"><i class="ti ti-building"></i><div>No properties yet<br>Add your first one!</div></div>`:''}
        ${this.state.properties.map(p=>this.propDetailHTML(p)).join('')}

        <div class="sep"></div>
        <div class="prop-section-label" style="margin-top:12px">Rollover planner</div>
        ${this.rolloverHTML()}
        <button class="add-card-btn" onclick="App.openAddProp()"><i class="ti ti-plus" style="font-size:18px"></i> Add new property</button>
      </div>`;
  },

  propDetailHTML(p) {
    const cf = parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax);
    const equity = parseNum(p.current_value)-parseNum(p.loan_balance);
    const ltv = parseNum(p.current_value)>0 ? Math.round(parseNum(p.loan_balance)/parseNum(p.current_value)*100) : 0;
    const grossYield = parseNum(p.current_value)>0 ? (parseNum(p.rent_income)*12/parseNum(p.current_value)*100).toFixed(1) : '—';
    const statusClass = p.status==='Rented'?'pill-g':p.status==='Vacant'?'pill-r':'pill-o';
    return `<div style="margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="prop-section-label" style="margin:0">${p.name}</div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" onclick="App.openEditProp('${p.id}')"><i class="ti ti-edit" style="font-size:12px"></i></button>
          <button class="btn-sm" onclick="App.deleteProp('${p.id}')" style="color:var(--danger)"><i class="ti ti-trash" style="font-size:12px"></i></button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">${p.address||'No address'} · <span class="pill ${statusClass}">${p.status||'Rented'}</span></div>
      <div class="calc-box">
        <h4>Monthly P&L</h4>
        <div class="crow"><span class="cl">Rental income</span><span style="color:var(--accent)">+${fmt(p.rent_income)}</span></div>
        <div class="crow"><span class="cl">Mortgage payment</span><span>−${fmt(p.mortgage)}</span></div>
        <div class="crow"><span class="cl">Insurance + tax</span><span>−${fmt(p.insurance_tax)}</span></div>
        <div class="crow"><span class="cl">Net cash flow</span><span style="color:${cf>=0?'var(--accent)':'var(--danger)'}">${cf>=0?'+':''}${fmt(cf)}</span></div>
      </div>
      <div class="cards2">
        <div class="mcard"><div class="lbl">Equity</div><div class="val">${fmt(equity)}</div></div>
        <div class="mcard"><div class="lbl">LTV ratio</div><div class="val">${ltv}%</div></div>
        <div class="mcard"><div class="lbl">Gross yield</div><div class="val">${grossYield}%</div></div>
        <div class="mcard"><div class="lbl">Current value</div><div class="val">${fmt(p.current_value)}</div></div>
      </div>
    </div>`;
  },

  rolloverHTML() {
    const freeCash = this.getFreeCash();
    const nextGoal = this.state.goals.filter(g=>!g.completed).sort((a,b)=>parseNum(a.saved)/parseNum(a.target)-parseNum(b.saved)/parseNum(b.target))[0];
    const remaining = nextGoal ? parseNum(nextGoal.target)-parseNum(nextGoal.saved) : 0;
    const months = nextGoal && freeCash>0 ? Math.ceil(remaining/freeCash) : null;
    return `<div class="calc-box" style="margin-bottom:14px">
      <h4>Next purchase estimate</h4>
      <div class="crow"><span class="cl">Monthly free cash</span><span>${fmt(freeCash)}/mo</span></div>
      ${nextGoal?`
      <div class="crow"><span class="cl">Target</span><span>${nextGoal.title}</span></div>
      <div class="crow"><span class="cl">Target amount</span><span>${fmt(nextGoal.target)}</span></div>
      <div class="crow"><span class="cl">Already saved</span><span style="color:var(--accent)">${fmt(nextGoal.saved)}</span></div>
      <div class="crow"><span class="cl">Months to target</span><span style="color:var(--accent)">~${months||'?'} months</span></div>
      `:`<div class="crow"><span class="cl">No active goals</span><span>—</span></div>`}
    </div>`;
  },

  openAddProp() {
    this.state.editingPropId = null;
    document.getElementById('prop-sheet-title').textContent = 'Add property';
    ['prop-name','prop-addr','prop-rent','prop-mortgage','prop-ins','prop-purchase','prop-value','prop-loan'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('prop-status').value = 'Rented';
    this.openSheet('propSheet');
  },

  openEditProp(id) {
    const p = this.state.properties.find(x=>x.id===id);
    if (!p) return;
    this.state.editingPropId = id;
    document.getElementById('prop-sheet-title').textContent = 'Edit property';
    document.getElementById('prop-name').value = p.name||'';
    document.getElementById('prop-addr').value = p.address||'';
    document.getElementById('prop-status').value = p.status||'Rented';
    document.getElementById('prop-rent').value = parseNum(p.rent_income)||'';
    document.getElementById('prop-mortgage').value = parseNum(p.mortgage)||'';
    document.getElementById('prop-ins').value = parseNum(p.insurance_tax)||'';
    document.getElementById('prop-purchase').value = parseNum(p.purchase_price)||'';
    document.getElementById('prop-value').value = parseNum(p.current_value)||'';
    document.getElementById('prop-loan').value = parseNum(p.loan_balance)||'';
    this.openSheet('propSheet');
  },

  async saveProp() {
    const data = {
      name: document.getElementById('prop-name').value.trim(),
      address: document.getElementById('prop-addr').value.trim(),
      status: document.getElementById('prop-status').value,
      rent_income: parseNum(document.getElementById('prop-rent').value),
      mortgage: parseNum(document.getElementById('prop-mortgage').value),
      insurance_tax: parseNum(document.getElementById('prop-ins').value),
      purchase_price: parseNum(document.getElementById('prop-purchase').value),
      current_value: parseNum(document.getElementById('prop-value').value),
      loan_balance: parseNum(document.getElementById('prop-loan').value),
    };
    if (!data.name) { this.showToast('Enter property name', 'error'); return; }
    if (this.state.editingPropId) {
      await DB.update('properties', this.state.editingPropId, data);
      const idx = this.state.properties.findIndex(p=>p.id===this.state.editingPropId);
      if (idx>=0) this.state.properties[idx] = {...this.state.properties[idx],...data};
    } else {
      const p = await DB.insert('properties', data);
      this.state.properties.unshift(p);
    }
    this.closeSheet('propSheet');
    this.renderProperties();
    this.renderDashboard();
    this.showToast(this.state.editingPropId?'Property updated!':'Property added!','success');
  },

  async deleteProp(id) {
    if (!confirm('Delete this property?')) return;
    this.state.properties = this.state.properties.filter(p=>p.id!==id);
    await DB.delete('properties', id);
    this.renderProperties();
    this.renderDashboard();
    this.showToast('Property deleted');
  },

  // ── UTILS ─────────────────────────────────────────────────────────────────
  switchPage(id) {
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('page-'+id).classList.add('active');
    document.getElementById('nav-'+id).classList.add('active');
    if (id==='goals') setTimeout(()=>{ this.animateBars(); this.checkConfetti(); }, 250);
  },

  checkConfetti() {
    this.state.goals.filter(g=>g.completed||parseNum(g.saved)>=parseNum(g.target)).forEach(g=>{
      this.launchConfetti(g.id);
    });
  },

  animateBars() {
    document.querySelectorAll('.bar-fill[data-pct]').forEach(el=>{
      el.style.width = el.dataset.pct + '%';
    });
  },

  openSheet(id) { document.getElementById(id).classList.add('show'); },
  closeSheet(id) { document.getElementById(id).classList.remove('show'); },

  timeOfDay() {
    const h = new Date().getHours();
    if (h<12) return 'morning'; if (h<17) return 'afternoon'; return 'evening';
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
