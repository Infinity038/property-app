// Safe date parse that avoids UTC timezone shift on date-only strings
const parseDate = s => {
  if (!s) return new Date();
  // date-only strings like "2026-05-28" must be parsed as local, not UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y,m,d] = s.split('-').map(Number);
    return new Date(y, m-1, d);
  }
  return new Date(s);
};

const CURRENCY = 'kr.';
const fmt = n => Number(n||0).toLocaleString('da-DK', {minimumFractionDigits:0,maximumFractionDigits:0}) + ' ' + CURRENCY;
const parseNum = s => parseFloat(String(s).replace(/[^\d.-]/g,'')) || 0;

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

window.App = {
  state: {
    profiles:[], properties:[], expenses:[], goals:[],
    incomeEntries:[], rentalIncome:0,
    activeExp:'All', scanFile:null, scanCatSel:null,
    editingGoalId:null, editingPropId:null, editingIncomeId:null,
    expDateFrom:'', expDateTo:'', incDateFrom:'', incDateTo:''
  },

  async init() {
    this.updateClock();
    setInterval(()=>this.updateClock(), 30000);
    this.updateOnlineStatus();
    window.addEventListener('online', ()=>{ this.updateOnlineStatus(); DB.syncQueue(); this.showToast('Back online — syncing...','success'); });
    window.addEventListener('offline', ()=>{ this.updateOnlineStatus(); this.showToast('Offline — changes saved locally','warning'); });
    await this.loadAll();
    this.renderAll();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  },

  async loadAll() {
    const [profiles, properties, expenses, goals, rental, incomeEntries] = await Promise.all([
      DB.getAll('profiles'), DB.getAll('properties'), DB.getAll('expenses'),
      DB.getAll('goals'), DB.getAll('rental_income'), DB.getAll('income_entries')
    ]);
    this.state.profiles = profiles || [];
    this.state.properties = properties || [];
    this.state.expenses = expenses || [];
    this.state.goals = (goals||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    this.state.rentalIncome = rental?.[0]?.total_monthly || 0;
    this.state.incomeEntries = incomeEntries || [];
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
    const lbl = document.getElementById('sync-label');
    if (!dot) return;
    if (navigator.onLine) { dot.className='sync-dot'; if(lbl) lbl.textContent='Synced'; }
    else { dot.className='sync-dot offline'; if(lbl) lbl.textContent='Offline'; }
  },

  showToast(msg, type='') {
    let t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show ' + type;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(()=>t.classList.remove('show'), 3200);
  },

  // ── COMPUTED ──────────────────────────────────────────────────────────────
  getTotalSalary() {
    return this.state.profiles.reduce((s,p)=>s+parseNum(p.monthly_salary)+parseNum(p.bonus),0);
  },
  getThisMonthSideHustle() {
    const now = new Date(); const m=now.getMonth(), y=now.getFullYear();
    return this.state.incomeEntries.filter(e=>{ const d=parseDate(e.date); return d.getMonth()===m&&d.getFullYear()===y; }).reduce((s,e)=>s+parseNum(e.amount),0);
  },
  getTotalIncome() {
    return this.getTotalSalary() + parseNum(this.state.rentalIncome) + this.getThisMonthSideHustle();
  },
  getTotalExpenses() {
    const now = new Date(); const m=now.getMonth(), y=now.getFullYear();
    return this.state.expenses.filter(e=>{ const d=parseDate(e.date||e.created_at); return d.getMonth()===m&&d.getFullYear()===y; }).reduce((s,e)=>s+parseNum(e.amount),0);
  },
  getTotalRent() { return this.state.properties.reduce((s,p)=>s+parseNum(p.rent_income),0); },
  getTotalCashFlow() { return this.state.properties.reduce((s,p)=>s+parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax),0); },
  getTotalEquity() { return this.state.properties.reduce((s,p)=>s+parseNum(p.current_value)-parseNum(p.loan_balance),0); },
  getGoalsAllocated() {
    return this.state.goals.filter(g=>!g.completed&&g.goal_type!=='lifestyle').reduce((s,g)=>s+parseNum(g.monthly_allocation),0);
  },
  // Free cash = income minus tracked expenses minus goal allocations
  // Expenses tab tracks actual spending. Goals allocation is money set aside but not yet spent.
  getFreeCash() {
    return this.getTotalIncome() - this.getTotalExpenses() - this.getGoalsAllocated();
  },
  // Unassigned = income minus expenses minus goal allocations (what's truly unplanned)
  getUnassigned() {
    return this.getTotalIncome() - this.getTotalExpenses() - this.getGoalsAllocated();
  },
  getTotalOpeningBalance() {
    return this.state.profiles.reduce((s,p)=>s+parseNum(p.opening_balance),0);
  },
  getTotalSaved() {
    return this.state.goals.reduce((s,g)=>s+parseNum(g.goal_type==='lifestyle'?g.lifestyle_balance:g.saved),0);
  },

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  renderDashboard() {
    const p1 = this.state.profiles[0]||{name:'Jovannie Ducay'};
    const p2 = this.state.profiles[1]||{name:'Melody Ducay'};
    const n1 = p1.name.split(' ')[0], n2 = p2.name.split(' ')[0];
    const init1 = (p1.name[0]||'J')+(p1.name.split(' ')[1]?.[0]||'D');
    const init2 = (p2.name[0]||'M')+(p2.name.split(' ')[1]?.[0]||'D');
    const equity = this.getTotalEquity();
    const income = this.getTotalIncome();
    const expenses = this.getTotalExpenses();
    const savingsRate = income>0 ? Math.round((income-expenses)/income*100) : 0;
    const cashFlow = this.getTotalCashFlow();
    const freeCash = this.getFreeCash();
    const sideHustle = this.getThisMonthSideHustle();
    const nextGoal = this.state.goals.filter(g=>!g.completed&&g.goal_type!=='lifestyle').sort((a,b)=>parseNum(b.saved)/parseNum(b.target)-parseNum(a.saved)/parseNum(a.target))[0];

    const goalsAllocated = this.getGoalsAllocated();
    const unassigned = this.getUnassigned();
    const bannerColor = unassigned < 0 ? '#FCEBEB' : unassigned < 2000 ? '#FAEEDA' : '#E1F5EE';
    const bannerText = unassigned < 0 ? '#A32D2D' : unassigned < 2000 ? '#854F0B' : '#0F6E56';
    const bannerIcon = unassigned < 0 ? 'ti-alert-triangle' : unassigned < 2000 ? 'ti-alert-circle' : 'ti-piggy-bank';
    const bannerMsg = unassigned < 0
      ? `You're over budget by ${fmt(Math.abs(unassigned))} this month`
      : unassigned === 0 ? 'Every kr. is assigned — fully planned!'
      : `${fmt(unassigned)} unassigned this month — add to a goal?`;

    document.getElementById('dash-content').innerHTML = `
      <div class="dash-hd">
        <div class="dh-top">
          <div>
            <div class="dh-greeting">Good ${this.timeOfDay()},</div>
            <div class="dh-names">${n1} & ${n2} 👋</div>
          </div>
          <div style="display:flex">
            <div class="avatar">${init1}</div>
            <div class="avatar" style="margin-left:-8px">${init2}</div>
          </div>
        </div>
        <div class="net-worth">${fmt(equity)}</div>
        <div class="nw-sub">Total portfolio equity</div>
        <div class="badge-row">
          <span class="badge"><i class="ti ti-trending-up" style="font-size:11px"></i> +${fmt(cashFlow)}/mo cash flow</span>
          <span class="badge">${this.state.properties.length} ${this.state.properties.length===1?'property':'properties'}</span>
          ${sideHustle>0?`<span class="badge"><i class="ti ti-bolt" style="font-size:11px"></i> +${fmt(sideHustle)} side hustle</span>`:''}
        </div>
      </div>

      <!-- FREE CASH BANNER -->
      <div style="margin:12px 18px 0;background:${bannerColor};border-radius:14px;padding:13px 15px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="App.switchPage('goals')">
        <div style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i class="ti ${bannerIcon}" style="font-size:20px;color:${bannerText}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:800;color:${bannerText}">${fmt(unassigned)} free cash</div>
          <div style="font-size:12px;color:${bannerText};opacity:.8">${bannerMsg}</div>
        </div>
        <i class="ti ti-chevron-right" style="font-size:16px;color:${bannerText};opacity:.6"></i>
      </div>

      <div class="sec" style="margin-top:14px">
        <div class="sec-hd"><span class="sec-title">Monthly snapshot</span></div>
        <div class="cards2">
          <div class="mcard"><div class="lbl">Total income</div><div class="val">${fmt(income)}</div><div class="hint">salary + rental${sideHustle>0?' + hustle':''}</div></div>
          <div class="mcard"><div class="lbl">Expenses this mo.</div><div class="val">${fmt(expenses)}</div><div class="hint">tracked spending</div></div>
          <div class="mcard"><div class="lbl">Goal allocations</div><div class="val">${fmt(goalsAllocated)}</div><div class="hint">set aside/mo</div></div>
          <div class="mcard"><div class="lbl">Total saved</div><div class="val">${fmt(this.getTotalSaved())}</div><div class="hint">across all goals</div></div>
        </div>
      </div>
      <div class="sec" style="margin-top:14px">
        <div class="sec-hd"><span class="sec-title">Properties</span><button class="sec-action" onclick="App.switchPage('props')">View all</button></div>
        ${this.state.properties.length===0?`<div class="empty-state"><i class="ti ti-building"></i><div>No properties yet</div><button class="btn-sm" style="margin-top:10px" onclick="App.switchPage('props')"><i class="ti ti-plus"></i> Add first property</button></div>`:''}
        ${this.state.properties.slice(0,3).map(p=>{
          const cf=parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax);
          return `<div class="prop-card" onclick="App.switchPage('props')">
            <div class="prop-ico"><i class="ti ${p.name.toLowerCase().includes('condo')||p.name.toLowerCase().includes('apt')?'ti-building':'ti-home'}"></i></div>
            <div style="flex:1;min-width:0"><div class="pname">${p.name}</div><div class="paddr">${p.address||'No address'} — ${p.status||'Rented'}</div></div>
            <div><div class="prent">${fmt(p.rent_income)}/mo</div><div class="pcf">${cf>=0?'+':''}${fmt(cf)} cf</div></div>
          </div>`;
        }).join('')}
      </div>
      <div class="sec" style="margin-top:14px;padding-bottom:20px">
        <div class="sec-hd"><span class="sec-title">Goals at a glance</span><button class="sec-action" onclick="App.switchPage('goals')">View all</button></div>
        ${this.state.goals.length===0?`<div class="empty-state"><i class="ti ti-target"></i><div>No goals set yet</div><button class="btn-sm" style="margin-top:10px" onclick="App.switchPage('goals')"><i class="ti ti-plus"></i> Add goal</button></div>`:''}
        ${this.state.goals.slice(0,4).map(g=>{
          const isLife = g.goal_type==='lifestyle';
          const cur = isLife ? parseNum(g.lifestyle_balance) : parseNum(g.saved);
          const cap = isLife ? parseNum(g.lifestyle_cap) : parseNum(g.target);
          const pct = cap>0 ? Math.min(100,Math.round(cur/cap*100)) : 0;
          const done = !isLife && (pct>=100||g.completed);
          return `<div class="goal-card${done?' done':''}${isLife?' lifestyle-card':''}">
            <div class="g-hd">
              <div class="g-ico${done?' done-ico':''}${isLife?' lifestyle-ico':''}"><i class="ti ${g.icon||'ti-target'}"></i></div>
              <div><div class="g-title">${g.title}${isLife?'<span class="lifestyle-badge">Lifestyle</span>':''}${done?`<span class="done-badge"><i class="ti ti-check" style="font-size:10px"></i> Reached!</span>`:''}</div>
              <div class="g-sub">${fmt(cur)}${isLife?' available':' of '+fmt(cap)}</div></div>
            </div>
            <div class="bar-bg"><div class="bar-fill${isLife?' lifestyle-fill':''}" data-pct="${pct}" style="width:0%"></div></div>
            ${!done?`<div class="g-foot"><span>${isLife?'Cap: '+fmt(cap):fmt(g.monthly_allocation)+'/mo'}</span><span class="g-pct">${pct}%</span></div>`:''}
          </div>`;
        }).join('')}
      </div>`;
    setTimeout(()=>this.animateBars(),300);
  },

  // ── SALARY / INCOME ───────────────────────────────────────────────────────
  renderSalary() {
    const p1 = this.state.profiles[0]||{name:'Jovannie Ducay',monthly_salary:0,pay_frequency:'Monthly',bonus:0,salary_day:1,opening_balance:0};
    const p2 = this.state.profiles[1]||{name:'Melody Ducay',monthly_salary:0,pay_frequency:'Monthly',bonus:0,salary_day:1,opening_balance:0};
    const rental = parseNum(this.state.rentalIncome);
    const now = new Date();
    const monthEntries = this.state.incomeEntries.filter(e=>{ const d=parseDate(e.date); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); });
    const filteredIncome = this.getFilteredIncome();
    const totalThisMonth = parseNum(p1.monthly_salary)+parseNum(p1.bonus)+parseNum(p2.monthly_salary)+parseNum(p2.bonus)+rental+monthEntries.reduce((s,e)=>s+parseNum(e.amount),0);

    document.getElementById('salary-content').innerHTML = `
      <div class="inner-tabs">
        <button class="inner-tab active" onclick="App.showIncomeTab('jovannie',this)">Jovannie</button>
        <button class="inner-tab" onclick="App.showIncomeTab('melody',this)">Melody</button>
        <button class="inner-tab" onclick="App.showIncomeTab('rental',this)">Rental</button>
        <button class="inner-tab" onclick="App.showIncomeTab('sidehustle',this)">Side hustle</button>
      </div>

      <!-- Jovannie tab -->
      <div class="tab-pane active" id="inc-jovannie">
        <div class="form-wrap">
          <div style="background:var(--faint);border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:var(--muted)"><i class="ti ti-user" style="font-size:15px;vertical-align:-2px;margin-right:6px;color:var(--accent)"></i><strong>${p1.name}</strong></div>
          <div class="field"><label>Monthly salary (after tax)</label><input type="number" id="sal-p1" value="${parseNum(p1.monthly_salary)||''}" placeholder="0"></div>
          <div class="field"><label>Pay frequency</label><select id="freq-p1">${['Monthly','Bi-weekly','Weekly'].map(f=>`<option${p1.pay_frequency===f?' selected':''}>${f}</option>`).join('')}</select></div>
          <div class="field"><label>Salary pay day (day of month)</label><input type="number" id="day-p1" value="${p1.salary_day||1}" min="1" max="31" placeholder="1"></div>
          <div class="field"><label>Bonus / extra (avg/mo)</label><input type="number" id="bon-p1" value="${parseNum(p1.bonus)||''}" placeholder="0"></div>
          <div class="divider"></div>
          <div style="font-size:13px;font-weight:700;margin-bottom:10px">Current savings</div>
          <div class="field"><label>Opening balance (total savings right now)</label><input type="number" id="bal-p1" value="${parseNum(p1.opening_balance)||''}" placeholder="0"></div>
          <div class="field"><label>Balance as of date</label><input type="date" id="baldate-p1" value="${p1.savings_as_of||new Date().toISOString().split('T')[0]}"></div>
          <button class="btn-primary" onclick="App.saveProfile(0)"><i class="ti ti-device-floppy"></i> Save Jovannie's income</button>
        </div>
      </div>

      <!-- Melody tab -->
      <div class="tab-pane" id="inc-melody">
        <div class="form-wrap">
          <div style="background:var(--faint);border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:var(--muted)"><i class="ti ti-user" style="font-size:15px;vertical-align:-2px;margin-right:6px;color:var(--accent)"></i><strong>${p2.name}</strong></div>
          <div class="field"><label>Monthly salary (after tax)</label><input type="number" id="sal-p2" value="${parseNum(p2.monthly_salary)||''}" placeholder="0"></div>
          <div class="field"><label>Pay frequency</label><select id="freq-p2">${['Monthly','Bi-weekly','Weekly'].map(f=>`<option${p2.pay_frequency===f?' selected':''}>${f}</option>`).join('')}</select></div>
          <div class="field"><label>Salary pay day (day of month)</label><input type="number" id="day-p2" value="${p2.salary_day||1}" min="1" max="31" placeholder="1"></div>
          <div class="field"><label>Bonus / extra (avg/mo)</label><input type="number" id="bon-p2" value="${parseNum(p2.bonus)||''}" placeholder="0"></div>
          <div class="divider"></div>
          <div style="font-size:13px;font-weight:700;margin-bottom:10px">Current savings</div>
          <div class="field"><label>Opening balance (total savings right now)</label><input type="number" id="bal-p2" value="${parseNum(p2.opening_balance)||''}" placeholder="0"></div>
          <div class="field"><label>Balance as of date</label><input type="date" id="baldate-p2" value="${p2.savings_as_of||new Date().toISOString().split('T')[0]}"></div>
          <button class="btn-primary" onclick="App.saveProfile(1)"><i class="ti ti-device-floppy"></i> Save Melody's income</button>
        </div>
      </div>

      <!-- Rental tab -->
      <div class="tab-pane" id="inc-rental">
        <div class="form-wrap">
          <div class="field"><label>Total monthly rent received</label><input type="number" id="rental-total" value="${rental||''}" placeholder="0"></div>
          <div style="background:var(--faint);border-radius:12px;padding:10px 14px;margin:4px 0 12px;font-size:13px;color:var(--muted)">
            <i class="ti ti-info-circle" style="font-size:14px;vertical-align:-2px;margin-right:4px"></i>
            This is total rent across all properties. Individual property income is tracked in the Properties tab.
          </div>
          <button class="btn-primary" onclick="App.saveRental()"><i class="ti ti-device-floppy"></i> Save rental income</button>
        </div>
      </div>

      <!-- Side hustle tab -->
      <div class="tab-pane" id="inc-sidehustle">
        <div class="form-wrap">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <div style="font-size:15px;font-weight:800">Side hustle log</div>
            <button class="btn-sm" onclick="App.openAddIncome()"><i class="ti ti-plus" style="font-size:13px"></i> Add</button>
          </div>

          <!-- Date filter -->
          <div style="background:var(--faint);border-radius:12px;padding:10px 12px;margin-bottom:12px">
            <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px"><i class="ti ti-calendar" style="font-size:13px;vertical-align:-2px;margin-right:4px"></i>Filter by date</div>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="date" id="inc-from" value="${this.state.incDateFrom}" onchange="App.setIncFilter()" style="flex:1;border:1px solid var(--border);border-radius:8px;padding:7px 8px;font-size:12px;background:#fff;font-family:inherit">
              <span style="font-size:12px;color:var(--muted)">to</span>
              <input type="date" id="inc-to" value="${this.state.incDateTo}" onchange="App.setIncFilter()" style="flex:1;border:1px solid var(--border);border-radius:8px;padding:7px 8px;font-size:12px;background:#fff;font-family:inherit">
              ${this.state.incDateFrom||this.state.incDateTo?`<button onclick="App.clearIncFilter()" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:18px;padding:0"><i class="ti ti-x"></i></button>`:''}
            </div>
          </div>

          <div style="background:var(--accent-light);border-radius:12px;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px;color:var(--accent-dark);font-weight:700">${this.state.incDateFrom||this.state.incDateTo?'Filtered total':'This month total'}</span>
            <span style="font-size:18px;font-weight:800;color:var(--accent-dark)">${fmt(this.getFilteredIncomeTotal())}</span>
          </div>
          ${filteredIncome.length===0?`<div class="empty-state"><i class="ti ti-bolt"></i><div>No entries found</div></div>`:''}
          ${filteredIncome.sort((a,b)=>parseDate(b.date)-parseDate(a.date)).map(e=>`
            <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
              <div style="width:36px;height:36px;border-radius:10px;background:var(--accent-light);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-bolt" style="font-size:16px;color:var(--accent)"></i></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:600">${e.description}</div>
                <div style="font-size:11px;color:var(--muted)">${parseDate(e.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}${e.is_recurring?` · <span style="color:var(--accent)">↻ ${e.recurrence}</span>`:''}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:14px;font-weight:800;color:var(--accent)">${fmt(e.amount)}</div>
                <button onclick="App.deleteIncome('${e.id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;padding:0"><i class="ti ti-trash"></i></button>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div style="padding:14px 18px 20px;border-top:1px solid var(--border);margin-top:8px">
        <div class="total-box">
          <span class="tl">Total household income/mo</span>
          <span class="ta">${fmt(totalThisMonth)}</span>
        </div>
      </div>`;
  },

  showIncomeTab(id, btn) {
    document.querySelectorAll('#page-salary .tab-pane').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('#page-salary .inner-tab').forEach(b=>b.classList.remove('active'));
    document.getElementById('inc-'+id).classList.add('active');
    btn.classList.add('active');
  },

  async saveProfile(idx) {
    const p = this.state.profiles[idx];
    if (!p?.id) { this.showToast('Profile not found','error'); return; }
    const sfx = idx===0?'p1':'p2';
    const data = {
      monthly_salary: parseNum(document.getElementById(`sal-${sfx}`).value),
      pay_frequency: document.getElementById(`freq-${sfx}`).value,
      salary_day: parseInt(document.getElementById(`day-${sfx}`).value)||1,
      bonus: parseNum(document.getElementById(`bon-${sfx}`).value),
      opening_balance: parseNum(document.getElementById(`bal-${sfx}`).value),
      savings_as_of: document.getElementById(`baldate-${sfx}`).value,
    };
    await DB.update('profiles', p.id, data);
    Object.assign(this.state.profiles[idx], data);
    this.renderDashboard();
    this.showToast(`${p.name.split(' ')[0]}'s income saved!`, 'success');
  },

  async saveRental() {
    const val = parseNum(document.getElementById('rental-total').value);
    this.state.rentalIncome = val;
    const rentalRow = (DB.local.get('rental_income')||[])[0];
    if (rentalRow?.id) await DB.update('rental_income', rentalRow.id, {total_monthly:val});
    else await DB.insert('rental_income', {total_monthly:val});
    this.renderDashboard();
    this.showToast('Rental income saved!', 'success');
  },

  openAddIncome() {
    this.state.editingIncomeId = null;
    document.getElementById('income-desc').value='';
    document.getElementById('income-amount').value='';
    document.getElementById('income-date').value=new Date().toISOString().split('T')[0];
    document.getElementById('income-recurring').checked=false;
    document.getElementById('income-recurrence-row').style.display='none';
    this.openSheet('incomeSheet');
  },

  async saveIncome() {
    const desc = document.getElementById('income-desc').value.trim();
    const amount = parseNum(document.getElementById('income-amount').value);
    const date = document.getElementById('income-date').value;
    const isRecurring = document.getElementById('income-recurring').checked;
    const recurrence = isRecurring ? document.getElementById('income-recurrence').value : null;
    if (!desc||!amount) { this.showToast('Enter description & amount','error'); return; }
    const p1 = this.state.profiles[0];
    const entry = await DB.insert('income_entries',{ profile_id:p1?.id||null, description:desc, amount, date, is_recurring:isRecurring, recurrence });
    this.state.incomeEntries.unshift(entry);
    this.closeSheet('incomeSheet');
    this.renderSalary();
    this.renderDashboard();
    this.showToast('Income logged!','success');
  },

  async deleteIncome(id) {
    this.state.incomeEntries = this.state.incomeEntries.filter(e=>e.id!==id);
    await DB.delete('income_entries', id);
    this.renderSalary();
    setTimeout(()=>{ const tab=document.querySelector('#page-salary .inner-tab:nth-child(4)'); if(tab) this.showIncomeTab('sidehustle',tab); },10);
    this.renderDashboard();
    this.showToast('Entry deleted');
  },

  setIncFilter() {
    this.state.incDateFrom=document.getElementById('inc-from')?.value||'';
    this.state.incDateTo=document.getElementById('inc-to')?.value||'';
    this.renderSalary();
    setTimeout(()=>{ const tab=document.querySelector('#page-salary .inner-tab:nth-child(4)'); if(tab) this.showIncomeTab('sidehustle',tab); },10);
  },
  clearIncFilter() { this.state.incDateFrom=''; this.state.incDateTo=''; this.setIncFilter(); },
  getFilteredIncome() {
    if (!this.state.incDateFrom&&!this.state.incDateTo) {
      const now=new Date();
      return this.state.incomeEntries.filter(e=>{ const d=parseDate(e.date); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); });
    }
    return this.state.incomeEntries.filter(e=>{
      const d=parseDate(e.date);
      const from=this.state.incDateFrom?new Date(this.state.incDateFrom):new Date(0);
      const to=this.state.incDateTo?new Date(this.state.incDateTo+'T23:59:59'):new Date();
      return d>=from&&d<=to;
    });
  },
  getFilteredIncomeTotal() { return this.getFilteredIncome().reduce((s,e)=>s+parseNum(e.amount),0); },
  setExpFilter() { this.state.expDateFrom=document.getElementById('exp-from')?.value||''; this.state.expDateTo=document.getElementById('exp-to')?.value||''; this.renderExpenses(); },
  clearExpFilter() { this.state.expDateFrom=''; this.state.expDateTo=''; this.renderExpenses(); },
  renderExpenses() {
    const now = new Date(); const m=now.getMonth(), y=now.getFullYear();
    // Apply date range filter if set, otherwise show current month
    let filtered_src;
    if (this.state.expDateFrom || this.state.expDateTo) {
      filtered_src = this.state.expenses.filter(e=>{
        const d = parseDate(e.date||e.created_at);
        const from = this.state.expDateFrom ? new Date(this.state.expDateFrom) : new Date(0);
        const to = this.state.expDateTo ? new Date(this.state.expDateTo+'T23:59:59') : new Date();
        return d>=from && d<=to;
      });
    } else {
      filtered_src = this.state.expenses.filter(e=>{ const d=parseDate(e.date||e.created_at); return d.getMonth()===m&&d.getFullYear()===y; });
    }
    const filtered = this.state.activeExp==='All' ? filtered_src : filtered_src.filter(e=>e.category===this.state.activeExp);
    const total = filtered_src.reduce((s,e)=>s+parseNum(e.amount),0);
    const recurring = filtered_src.filter(e=>e.is_recurring);
    const cats = ['All',...new Set(filtered_src.map(e=>e.category))];
    const dateLabel = this.state.expDateFrom||this.state.expDateTo
      ? `${this.state.expDateFrom||'start'} → ${this.state.expDateTo||'today'}`
      : `${now.toLocaleString('default',{month:'long'})} ${y}`;

    document.getElementById('expenses-content').innerHTML = `
      <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="App.handleDrop(event)">
        <i class="ti ti-camera-plus"></i>
        <p>Take photo or upload receipt</p>
        <small>AI scans & suggests category automatically</small>
        <input type="file" id="file-input" accept="image/*" capture="environment" style="display:none" onchange="App.handleFileSelect(event)">
      </div>

      <!-- DATE FILTER -->
      <div style="padding:0 18px 10px">
        <div style="background:var(--faint);border-radius:12px;padding:10px 12px">
          <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px"><i class="ti ti-calendar" style="font-size:13px;vertical-align:-2px;margin-right:4px"></i>Date filter</div>
          <div style="display:flex;gap:8px;align-items:center">
            <div style="flex:1"><input type="date" id="exp-from" value="${this.state.expDateFrom}" onchange="App.setExpFilter()" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:7px 8px;font-size:12px;background:#fff;font-family:inherit"></div>
            <span style="font-size:12px;color:var(--muted);flex-shrink:0">to</span>
            <div style="flex:1"><input type="date" id="exp-to" value="${this.state.expDateTo}" onchange="App.setExpFilter()" style="width:100%;border:1px solid var(--border);border-radius:8px;padding:7px 8px;font-size:12px;background:#fff;font-family:inherit"></div>
            ${this.state.expDateFrom||this.state.expDateTo?`<button onclick="App.clearExpFilter()" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:18px;flex-shrink:0;padding:0"><i class="ti ti-x"></i></button>`:''}
          </div>
        </div>
      </div>

      ${recurring.length>0?`
      <div style="padding:0 18px 10px">
        <div style="background:#FAEEDA;border-radius:12px;padding:10px 14px;font-size:13px;color:#854F0B;display:flex;justify-content:space-between;align-items:center">
          <span><i class="ti ti-refresh" style="font-size:14px;vertical-align:-2px;margin-right:4px"></i> <strong>${recurring.length} recurring</strong> · ${fmt(recurring.reduce((s,e)=>s+parseNum(e.amount),0))}/mo</span>
        </div>
      </div>`:``}

      <div class="exp-hd">
        <span>${dateLabel}</span>
        <span style="color:var(--danger)">${fmt(total)}</span>
      </div>
      <div class="exp-filters">
        ${cats.map(c=>`<button class="filter-pill${this.state.activeExp===c?' active':''}" onclick="App.filterExp('${c}')">${c}</button>`).join('')}
      </div>
      ${filtered.length===0?`<div class="empty-state"><i class="ti ti-receipt"></i><div>No expenses found</div></div>`:''}
      <div id="exp-list">${filtered.sort((a,b)=>parseDate(b.date||b.created_at)-parseDate(a.date||a.created_at)).map(e=>this.expItemHTML(e)).join('')}</div>
      <div style="padding:14px 18px">
        <button class="add-card-btn" onclick="App.openAddExpense()"><i class="ti ti-plus" style="font-size:18px"></i> Add expense manually</button>
      </div>`;
  },

  setExpFilter() {
    this.state.expDateFrom = document.getElementById('exp-from')?.value||'';
    this.state.expDateTo = document.getElementById('exp-to')?.value||'';
    this.renderExpenses();
  },
  clearExpFilter() {
    this.state.expDateFrom=''; this.state.expDateTo='';
    this.renderExpenses();
  },

  expItemHTML(e) {
    const bg=CAT_COLORS[e.category]||'#f1efe8';
    const ico=CAT_ICONS[e.category]||'ti-dots';
    const col=CAT_TEXT[e.category]||'#6b6b6b';
    return `<div class="exp-item" id="exp-${e.id}">
      <div class="exp-cat-ico" style="background:${bg}"><i class="ti ${ico}" style="color:${col}"></i></div>
      <div style="flex:1;min-width:0">
        <div class="exp-name">${e.name}${e.is_recurring?` <span style="font-size:10px;background:#FAEEDA;color:#854F0B;padding:2px 6px;border-radius:10px;font-weight:700">↻ ${e.recurrence||'recurring'}</span>`:''}</div>
        <div class="exp-catname">${e.category} · ${parseDate(e.date||e.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}${e.receipt_url?` · <span style="color:var(--accent)">📎</span>`:''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="exp-amt">${fmt(e.amount)}</div>
        <button onclick="App.deleteExpense('${e.id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:0"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  },

  filterExp(cat) { this.state.activeExp=cat; this.renderExpenses(); },
  handleDrop(e) { e.preventDefault(); document.getElementById('upload-zone').classList.remove('drag'); const f=e.dataTransfer.files[0]; if(f&&f.type.startsWith('image/')) this.processScanFile(f); },
  handleFileSelect(e) { const f=e.target.files[0]; if(f) this.processScanFile(f); },

  processScanFile(file) {
    this.state.scanFile=file;
    const reader=new FileReader();
    reader.onload=(ev)=>{ const img=document.getElementById('scan-preview'); img.src=ev.target.result; img.style.display='block'; };
    reader.readAsDataURL(file);
    this.state.scanCatSel=null;
    document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('sel'));
    this.openAddExpense();
  },

  openAddExpense() {
    if (!this.state.scanFile) {
      document.getElementById('scan-preview').style.display='none';
      document.getElementById('scan-name').value='';
      document.getElementById('scan-amount').value='';
    }
    document.getElementById('scan-date').value=new Date().toISOString().split('T')[0];
    document.getElementById('exp-recurring-cb').checked=false;
    document.getElementById('exp-recurrence-row').style.display='none';
    this.openSheet('scanSheet');
  },

  selectCat(cat) {
    this.state.scanCatSel=cat;
    document.querySelectorAll('.cat-btn').forEach(b=>b.classList.toggle('sel',b.dataset.cat===cat));
  },

  async confirmExpense() {
    const name=document.getElementById('scan-name').value.trim();
    const amount=parseNum(document.getElementById('scan-amount').value);
    const date=document.getElementById('scan-date').value;
    const cat=this.state.scanCatSel||'Other';
    const isRecurring=document.getElementById('exp-recurring-cb').checked;
    const recurrence=isRecurring?document.getElementById('exp-recurrence').value:null;
    if (!name||!amount) { this.showToast('Enter name & amount','error'); return; }
    const btn=document.getElementById('confirm-expense-btn');
    btn.classList.add('loading'); btn.innerHTML='<span class="spinner"></span>';
    let receiptUrl=null;
    if (this.state.scanFile) receiptUrl=await this.uploadReceipt(this.state.scanFile).catch(()=>null);
    const exp=await DB.insert('expenses',{name,amount,category:cat,date,receipt_url:receiptUrl,is_recurring:isRecurring,recurrence});
    this.state.expenses.unshift(exp);
    this.state.scanFile=null;
    this.closeSheet('scanSheet');
    this.renderExpenses();
    this.renderDashboard();
    this.showToast('Expense added!','success');
    btn.classList.remove('loading'); btn.innerHTML='<i class="ti ti-check"></i> Save expense';
  },

  async uploadReceipt(file) {
    const ext=file.name.split('.').pop()||'jpg';
    const path=`receipts/${Date.now()}.${ext}`;
    const res=await fetch(`${DB.SUPABASE_URL}/storage/v1/object/receipts/${path}`,{method:'POST',headers:{'apikey':DB.SUPABASE_KEY,'Authorization':`Bearer ${DB.SUPABASE_KEY}`,'Content-Type':file.type},body:file});
    if (res.ok) return `${DB.SUPABASE_URL}/storage/v1/object/public/receipts/${path}`;
    return null;
  },

  async deleteExpense(id) {
    if (!confirm('Delete this expense?')) return;
    this.state.expenses=this.state.expenses.filter(e=>e.id!==id);
    await DB.delete('expenses',id);
    this.renderExpenses(); this.renderDashboard();
    this.showToast('Expense deleted');
  },

  // ── GOALS ─────────────────────────────────────────────────────────────────
  renderGoals() {
    const allocated=this.getGoalsAllocated();
    const income=this.getTotalIncome();
    const expenses=this.getTotalExpenses();
    const free=income-expenses-allocated;

    document.getElementById('goals-content').innerHTML = `
      <div style="padding:18px">
        <div class="section-hd-row">
          <span>Financial goals</span>
          <button class="btn-sm" onclick="App.openAddGoal()"><i class="ti ti-plus" style="font-size:13px"></i> Add goal</button>
        </div>
        <div style="background:var(--faint);border-radius:12px;padding:9px 14px;margin-bottom:14px;font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px">
          <i class="ti ti-arrows-up-down" style="font-size:14px"></i> Use ↑ ↓ buttons on each goal to reorder
        </div>
        ${this.state.goals.length===0?`<div class="empty-state"><i class="ti ti-target"></i><div>No goals yet — add your first!</div></div>`:''}
        <div id="goals-list">
          ${this.state.goals.map((g,i)=>this.goalCardHTML(g,i,this.state.goals.length)).join('')}
        </div>
        <div style="background:var(--faint);border-radius:14px;padding:14px;border:1px solid var(--border);margin-top:8px">
          <div style="font-size:12px;font-weight:800;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px">Monthly money flow</div>
          <div class="summary-row"><span class="sr-lbl">Salary (Jovannie + Melody)</span><span class="sr-val" style="color:var(--accent)">+${fmt(this.getTotalSalary())}/mo</span></div>
          <div class="summary-row"><span class="sr-lbl">Rental income</span><span class="sr-val" style="color:var(--accent)">+${fmt(parseNum(this.state.rentalIncome))}/mo</span></div>
          ${this.getThisMonthSideHustle()>0?`<div class="summary-row"><span class="sr-lbl">Side hustle (this month)</span><span class="sr-val" style="color:var(--accent)">+${fmt(this.getThisMonthSideHustle())}</span></div>`:''}
          <div class="summary-row"><span class="sr-lbl">= Total income</span><span class="sr-val" style="font-weight:800">${fmt(this.getTotalIncome())}/mo</span></div>
          <div class="summary-row"><span class="sr-lbl">− Tracked expenses</span><span class="sr-val" style="color:var(--danger)">−${fmt(this.getTotalExpenses())}</span></div>
          <div class="summary-row"><span class="sr-lbl">− Goal allocations</span><span class="sr-val">−${fmt(allocated)}/mo</span></div>
          <div class="summary-row" style="border-top:1.5px solid var(--border2);padding-top:8px;margin-top:4px">
            <span class="sr-lbl" style="font-weight:800;color:var(--text)">= Unassigned cash</span>
            <span class="sr-val" style="font-size:16px;color:${free>=0?'var(--accent)':'var(--danger)'}">${fmt(free)}</span>
          </div>
        </div>
      </div>`;
    setTimeout(()=>{ this.animateBars(); this.checkConfetti(); },300);
  },

  goalCardHTML(g, idx=0, total=1) {
    const isLife=g.goal_type==='lifestyle';
    const cur=isLife?parseNum(g.lifestyle_balance):parseNum(g.saved);
    const cap=isLife?parseNum(g.lifestyle_cap):parseNum(g.target);
    const pct=cap>0?Math.min(100,Math.round(cur/cap*100)):0;
    const done=!isLife&&(pct>=100||g.completed);
    const remaining=Math.max(0,cap-cur);
    const months=!isLife&&parseNum(g.monthly_allocation)>0?Math.ceil(remaining/parseNum(g.monthly_allocation)):null;

    return `<div class="goal-card${done?' done':''}${isLife?' lifestyle-card':''}" id="gcard-${g.id}">
      <div id="conf-${g.id}"></div>
      <div style="display:flex;align-items:flex-start;gap:6px">
        <div style="display:flex;flex-direction:column;gap:4px;padding-top:2px">
          <button onclick="App.moveGoal('${g.id}',-1)" ${idx===0?'disabled':''} style="background:${idx===0?'var(--faint)':'var(--accent-light)'};border:1px solid var(--border);border-radius:8px;width:28px;height:28px;cursor:${idx===0?'default':'pointer'};display:flex;align-items:center;justify-content:center;font-size:14px;color:${idx===0?'var(--muted)':'var(--accent)'}"><i class="ti ti-chevron-up"></i></button>
          <button onclick="App.moveGoal('${g.id}',1)" ${idx===total-1?'disabled':''} style="background:${idx===total-1?'var(--faint)':'var(--accent-light)'};border:1px solid var(--border);border-radius:8px;width:28px;height:28px;cursor:${idx===total-1?'default':'pointer'};display:flex;align-items:center;justify-content:center;font-size:14px;color:${idx===total-1?'var(--muted)':'var(--accent)'}"><i class="ti ti-chevron-down"></i></button>
        </div>
        <div style="flex:1;min-width:0">
          <div class="g-hd">
            <div class="g-ico${done?' done-ico':''}${isLife?' lifestyle-ico':''}"><i class="ti ${g.icon||'ti-target'}"></i></div>
            <div style="flex:1;min-width:0">
              <div class="g-title">${g.title}
                ${isLife?'<span class="lifestyle-badge">Lifestyle</span>':''}
                ${done?`<span class="done-badge"><i class="ti ti-check" style="font-size:10px"></i> Reached!</span>`:''}
              </div>
              <div class="g-sub">${isLife?`${fmt(cur)} available · cap ${fmt(cap)}`:`${fmt(cur)} of ${fmt(cap)}`}</div>
            </div>
          </div>
          <div class="bar-bg"><div class="bar-fill${isLife?' lifestyle-fill':''}" data-pct="${pct}" style="width:0%"></div></div>
          <div class="g-foot">
            <span>${isLife?`Flexible spend fund`:fmt(g.monthly_allocation)+'/mo'+(months?' · ~'+months+' mo left':'')}</span>
            <span class="g-pct">${pct}%</span>
          </div>
          <div class="g-actions">
            <button class="btn-outline" style="flex:1;justify-content:center;font-size:12px;padding:7px" onclick="App.openEditGoal('${g.id}')"><i class="ti ti-edit" style="font-size:14px"></i> Edit</button>
            ${isLife
              ?`<button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.withdrawLifestyle('${g.id}')"><i class="ti ti-arrow-up-left" style="font-size:14px"></i> Withdraw</button>
                <button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.addToGoal('${g.id}')"><i class="ti ti-plus" style="font-size:14px"></i> Top up</button>`
              :`<button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.addToGoal('${g.id}')"><i class="ti ti-plus" style="font-size:14px"></i> Add funds</button>`
            }
            <button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.deleteGoal('${g.id}')"><i class="ti ti-trash" style="font-size:14px;color:var(--danger)"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  },

  // Move goal up or down by direction (-1 or +1)
  moveGoal(id, dir) {
    const goals = this.state.goals;
    const idx = goals.findIndex(g=>g.id===id);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= goals.length) return;
    [goals[idx], goals[newIdx]] = [goals[newIdx], goals[idx]];
    goals.forEach((g,i)=>{ g.sort_order=i; DB.update('goals',g.id,{sort_order:i}); });
    this.renderGoals();
  },

  openAddGoal() {
    this.state.editingGoalId=null;
    document.getElementById('goal-sheet-title').textContent='New goal';
    document.getElementById('goal-title-in').value='';
    document.getElementById('goal-target-in').value='';
    document.getElementById('goal-saved-in').value='';
    document.getElementById('goal-alloc-in').value='';
    document.getElementById('goal-icon-sel').value='ti-target';
    document.getElementById('goal-type-sel').value='savings';
    this.toggleGoalType('savings');
    this.openSheet('goalSheet');
  },

  openEditGoal(id) {
    const g=this.state.goals.find(x=>x.id===id);
    if (!g) return;
    this.state.editingGoalId=id;
    document.getElementById('goal-sheet-title').textContent='Edit goal';
    document.getElementById('goal-title-in').value=g.title;
    document.getElementById('goal-type-sel').value=g.goal_type||'savings';
    document.getElementById('goal-icon-sel').value=g.icon||'ti-target';
    this.toggleGoalType(g.goal_type||'savings');
    if (g.goal_type==='lifestyle') {
      document.getElementById('goal-cap-in').value=parseNum(g.lifestyle_cap)||'';
      document.getElementById('goal-balance-in').value=parseNum(g.lifestyle_balance)||'';
    } else {
      document.getElementById('goal-target-in').value=parseNum(g.target)||'';
      document.getElementById('goal-saved-in').value=parseNum(g.saved)||'';
      document.getElementById('goal-alloc-in').value=parseNum(g.monthly_allocation)||'';
    }
    this.openSheet('goalSheet');
  },

  toggleGoalType(type) {
    const isSavings=type==='savings';
    document.getElementById('goal-savings-fields').style.display=isSavings?'block':'none';
    document.getElementById('goal-lifestyle-fields').style.display=isSavings?'none':'block';
  },

  async saveGoal() {
    const title=document.getElementById('goal-title-in').value.trim();
    const type=document.getElementById('goal-type-sel').value;
    const icon=document.getElementById('goal-icon-sel').value;
    if (!title) { this.showToast('Enter a goal name','error'); return; }
    let data={title,icon,goal_type:type};
    if (type==='lifestyle') {
      const cap=parseNum(document.getElementById('goal-cap-in').value);
      if (!cap) { this.showToast('Enter a spending cap','error'); return; }
      data={...data,lifestyle_cap:cap,lifestyle_balance:parseNum(document.getElementById('goal-balance-in').value),target:cap,saved:0,monthly_allocation:0};
    } else {
      const target=parseNum(document.getElementById('goal-target-in').value);
      if (!target) { this.showToast('Enter a target amount','error'); return; }
      const saved=parseNum(document.getElementById('goal-saved-in').value);
      data={...data,target,saved,monthly_allocation:parseNum(document.getElementById('goal-alloc-in').value),completed:saved>=target};
    }
    const sortOrder=this.state.editingGoalId?this.state.goals.find(g=>g.id===this.state.editingGoalId)?.sort_order||0:this.state.goals.length;
    data.sort_order=sortOrder;
    if (this.state.editingGoalId) {
      await DB.update('goals',this.state.editingGoalId,data);
      const idx=this.state.goals.findIndex(g=>g.id===this.state.editingGoalId);
      if (idx>=0) this.state.goals[idx]={...this.state.goals[idx],...data};
    } else {
      const g=await DB.insert('goals',data);
      this.state.goals.push(g);
    }
    this.closeSheet('goalSheet');
    this.renderGoals(); this.renderDashboard();
    this.showToast(this.state.editingGoalId?'Goal updated!':'Goal created!','success');
  },

  async addToGoal(id) {
    const g=this.state.goals.find(x=>x.id===id);
    if (!g) return;
    const amt=prompt(`Add funds to "${g.title}" (kr.):`);
    if (!amt||parseNum(amt)<=0) return;
    const isLife=g.goal_type==='lifestyle';
    if (isLife) {
      const newBal=Math.min(parseNum(g.lifestyle_cap),parseNum(g.lifestyle_balance)+parseNum(amt));
      await DB.update('goals',id,{lifestyle_balance:newBal});
      g.lifestyle_balance=newBal;
    } else {
      const newSaved=parseNum(g.saved)+parseNum(amt);
      const completed=newSaved>=parseNum(g.target);
      await DB.update('goals',id,{saved:newSaved,completed});
      g.saved=newSaved; g.completed=completed;
      if (completed) { setTimeout(()=>this.launchConfetti(id),400); this.showToast('🎉 Goal reached!','success'); return; }
    }
    this.renderGoals(); this.renderDashboard();
    this.showToast(`Added ${fmt(parseNum(amt))} to ${g.title}`,'success');
  },

  async withdrawLifestyle(id) {
    const g=this.state.goals.find(x=>x.id===id);
    if (!g) return;
    const amt=prompt(`Withdraw from "${g.title}" — available: ${fmt(g.lifestyle_balance)}\nAmount (kr.):`);
    if (!amt||parseNum(amt)<=0) return;
    const newBal=Math.max(0,parseNum(g.lifestyle_balance)-parseNum(amt));
    await DB.update('goals',id,{lifestyle_balance:newBal});
    g.lifestyle_balance=newBal;
    this.renderGoals(); this.renderDashboard();
    this.showToast(`Withdrew ${fmt(parseNum(amt))} from ${g.title}`);
  },

  async deleteGoal(id) {
    if (!confirm('Delete this goal?')) return;
    this.state.goals=this.state.goals.filter(g=>g.id!==id);
    await DB.delete('goals',id);
    this.renderGoals(); this.renderDashboard();
    this.showToast('Goal deleted');
  },

  launchConfetti(id) {
    const c=document.getElementById('conf-'+id); if (!c) return;
    const cols=['#1D9E75','#9FE1CB','#5DCAA5','#fff','#E1F5EE','#0F6E56'];
    c.innerHTML='';
    for (let i=0;i<24;i++) {
      const d=document.createElement('div'); d.className='conf';
      const x=(Math.random()*160-80)+'px';
      d.style.cssText=`left:${Math.random()*100}%;top:${50+Math.random()*40}%;background:${cols[i%cols.length]};--x:${x};animation-delay:${Math.random()*.6}s;animation-duration:${.9+Math.random()*.6}s;position:absolute`;
      c.appendChild(d);
    }
    setTimeout(()=>c.innerHTML='',3000);
  },

  checkConfetti() {
    this.state.goals.filter(g=>g.goal_type!=='lifestyle'&&(g.completed||parseNum(g.saved)>=parseNum(g.target))).forEach(g=>this.launchConfetti(g.id));
  },

  // ── PROPERTIES ────────────────────────────────────────────────────────────
  renderProperties() {
    const totalRent=this.getTotalRent(), totalCF=this.getTotalCashFlow(), totalEquity=this.getTotalEquity();
    document.getElementById('props-content').innerHTML = `
      <div class="prop-detail">
        <div class="section-hd-row">
          <span>Properties</span>
          <button class="btn-sm" onclick="App.openAddProp()"><i class="ti ti-plus" style="font-size:13px"></i> Add property</button>
        </div>
        <div class="cards2" style="margin-bottom:14px">
          <div class="mcard"><div class="lbl">Total rental income</div><div class="val">${fmt(totalRent)}</div><div class="hint">per month</div></div>
          <div class="mcard"><div class="lbl">Net cash flow</div><div class="val" style="color:${totalCF>=0?'var(--accent)':'var(--danger)'}">${fmt(totalCF)}</div><div class="hint">per month</div></div>
          <div class="mcard"><div class="lbl">Total equity</div><div class="val">${fmt(totalEquity)}</div><div class="hint">all properties</div></div>
          <div class="mcard"><div class="lbl">Properties</div><div class="val">${this.state.properties.length}</div><div class="hint">in portfolio</div></div>
        </div>
        ${this.state.properties.length===0?`<div class="empty-state"><i class="ti ti-building"></i><div>No properties yet</div></div>`:''}
        ${this.state.properties.map(p=>this.propDetailHTML(p)).join('')}
        <div class="sep"></div>
        <div class="prop-section-label" style="margin-top:12px">Rollover planner</div>
        ${this.rolloverHTML()}
        <button class="add-card-btn" onclick="App.openAddProp()"><i class="ti ti-plus" style="font-size:18px"></i> Add new property</button>
      </div>`;
  },

  propDetailHTML(p) {
    const cf=parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax);
    const equity=parseNum(p.current_value)-parseNum(p.loan_balance);
    const ltv=parseNum(p.current_value)>0?Math.round(parseNum(p.loan_balance)/parseNum(p.current_value)*100):0;
    const grossYield=parseNum(p.current_value)>0?(parseNum(p.rent_income)*12/parseNum(p.current_value)*100).toFixed(1):'—';
    const stCls=p.status==='Rented'?'pill-g':p.status==='Vacant'?'pill-r':'pill-o';
    return `<div style="margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="prop-section-label" style="margin:0">${p.name}</div>
        <div style="display:flex;gap:6px">
          <button class="btn-sm" onclick="App.openEditProp('${p.id}')"><i class="ti ti-edit" style="font-size:12px"></i></button>
          <button class="btn-sm" onclick="App.deleteProp('${p.id}')" style="color:var(--danger)"><i class="ti ti-trash" style="font-size:12px"></i></button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">${p.address||'No address'} · <span class="pill ${stCls}">${p.status||'Rented'}</span></div>
      <div class="calc-box">
        <h4>Monthly P&L</h4>
        <div class="crow"><span class="cl">Rental income</span><span style="color:var(--accent)">+${fmt(p.rent_income)}</span></div>
        <div class="crow"><span class="cl">Mortgage</span><span>−${fmt(p.mortgage)}</span></div>
        <div class="crow"><span class="cl">Insurance + tax</span><span>−${fmt(p.insurance_tax)}</span></div>
        <div class="crow"><span class="cl">Net cash flow</span><span style="color:${cf>=0?'var(--accent)':'var(--danger)'}">${cf>=0?'+':''}${fmt(cf)}</span></div>
      </div>
      <div class="cards2">
        <div class="mcard"><div class="lbl">Equity</div><div class="val">${fmt(equity)}</div></div>
        <div class="mcard"><div class="lbl">LTV</div><div class="val">${ltv}%</div></div>
        <div class="mcard"><div class="lbl">Gross yield</div><div class="val">${grossYield}%</div></div>
        <div class="mcard"><div class="lbl">Current value</div><div class="val">${fmt(p.current_value)}</div></div>
      </div>
    </div>`;
  },

  rolloverHTML() {
    const freeCash=this.getFreeCash();
    const nextGoal=this.state.goals.filter(g=>!g.completed&&g.goal_type!=='lifestyle').sort((a,b)=>parseNum(a.saved)/parseNum(a.target)-parseNum(b.saved)/parseNum(b.target))[0];
    const remaining=nextGoal?Math.max(0,parseNum(nextGoal.target)-parseNum(nextGoal.saved)):0;
    const months=nextGoal&&freeCash>0?Math.ceil(remaining/freeCash):null;
    return `<div class="calc-box" style="margin-bottom:14px">
      <h4>Next purchase estimate</h4>
      <div class="crow"><span class="cl">Monthly free cash</span><span>${fmt(freeCash)}/mo</span></div>
      ${nextGoal?`
      <div class="crow"><span class="cl">Target goal</span><span>${nextGoal.title}</span></div>
      <div class="crow"><span class="cl">Target amount</span><span>${fmt(nextGoal.target)}</span></div>
      <div class="crow"><span class="cl">Already saved</span><span style="color:var(--accent)">${fmt(nextGoal.saved)}</span></div>
      <div class="crow"><span class="cl">Months to target</span><span style="color:var(--accent)">~${months||'?'} months</span></div>
      `:`<div class="crow"><span class="cl">No active savings goals</span><span>—</span></div>`}
    </div>`;
  },

  openAddProp() {
    this.state.editingPropId=null;
    document.getElementById('prop-sheet-title').textContent='Add property';
    ['prop-name','prop-addr','prop-rent','prop-mortgage','prop-ins','prop-purchase','prop-value','prop-loan'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('prop-status').value='Rented';
    this.openSheet('propSheet');
  },

  openEditProp(id) {
    const p=this.state.properties.find(x=>x.id===id); if (!p) return;
    this.state.editingPropId=id;
    document.getElementById('prop-sheet-title').textContent='Edit property';
    document.getElementById('prop-name').value=p.name||'';
    document.getElementById('prop-addr').value=p.address||'';
    document.getElementById('prop-status').value=p.status||'Rented';
    document.getElementById('prop-rent').value=parseNum(p.rent_income)||'';
    document.getElementById('prop-mortgage').value=parseNum(p.mortgage)||'';
    document.getElementById('prop-ins').value=parseNum(p.insurance_tax)||'';
    document.getElementById('prop-purchase').value=parseNum(p.purchase_price)||'';
    document.getElementById('prop-value').value=parseNum(p.current_value)||'';
    document.getElementById('prop-loan').value=parseNum(p.loan_balance)||'';
    this.openSheet('propSheet');
  },

  async saveProp() {
    const data={
      name:document.getElementById('prop-name').value.trim(),
      address:document.getElementById('prop-addr').value.trim(),
      status:document.getElementById('prop-status').value,
      rent_income:parseNum(document.getElementById('prop-rent').value),
      mortgage:parseNum(document.getElementById('prop-mortgage').value),
      insurance_tax:parseNum(document.getElementById('prop-ins').value),
      purchase_price:parseNum(document.getElementById('prop-purchase').value),
      current_value:parseNum(document.getElementById('prop-value').value),
      loan_balance:parseNum(document.getElementById('prop-loan').value),
    };
    if (!data.name) { this.showToast('Enter property name','error'); return; }
    if (this.state.editingPropId) {
      await DB.update('properties',this.state.editingPropId,data);
      const idx=this.state.properties.findIndex(p=>p.id===this.state.editingPropId);
      if (idx>=0) this.state.properties[idx]={...this.state.properties[idx],...data};
    } else {
      const p=await DB.insert('properties',data);
      this.state.properties.unshift(p);
    }
    this.closeSheet('propSheet');
    this.renderProperties(); this.renderDashboard();
    this.showToast(this.state.editingPropId?'Property updated!':'Property added!','success');
  },

  async deleteProp(id) {
    if (!confirm('Delete this property?')) return;
    this.state.properties=this.state.properties.filter(p=>p.id!==id);
    await DB.delete('properties',id);
    this.renderProperties(); this.renderDashboard();
    this.showToast('Property deleted');
  },

  // ── UTILS ─────────────────────────────────────────────────────────────────
  switchPage(id) {
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('page-'+id).classList.add('active');
    document.getElementById('nav-'+id).classList.add('active');
    if (id==='goals') setTimeout(()=>{ this.animateBars(); this.checkConfetti(); },250);
  },

  animateBars() { document.querySelectorAll('.bar-fill[data-pct]').forEach(el=>{ el.style.width=el.dataset.pct+'%'; }); },
  openSheet(id) { document.getElementById(id).classList.add('show'); },
  closeSheet(id) { document.getElementById(id).classList.remove('show'); },
  timeOfDay() { const h=new Date().getHours(); return h<12?'morning':h<17?'afternoon':'evening'; }
};

document.addEventListener('DOMContentLoaded',()=>App.init());
