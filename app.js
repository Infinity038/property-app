// DUCAY PROPERTY PORTFOLIO v13
const parseDate = s => {
  if(!s) return new Date();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);}
  return new Date(s);
};
const CURRENCY='kr.';
const fmt=n=>Number(n||0).toLocaleString('da-DK',{minimumFractionDigits:0,maximumFractionDigits:0})+' '+CURRENCY;
const fmtShort=n=>{const v=Number(n||0);if(v>=1000000)return(v/1000000).toFixed(1)+'M '+CURRENCY;if(v>=1000)return Math.round(v/1000)+'k '+CURRENCY;return fmt(v);};
const parseNum=s=>parseFloat(String(s).replace(/[^\d.-]/g,''))||0;
const today=()=>new Date().toISOString().split('T')[0];

const CATS={
  Housing:{color:'#FAEEDA',icon:'ti-home-dollar',text:'#854F0B'},
  Food:{color:'#E6F1FB',icon:'ti-shopping-cart',text:'#185FA5'},
  Transport:{color:'#EAF3DE',icon:'ti-car',text:'#3B6D11'},
  Utilities:{color:'#EEEDFE',icon:'ti-bolt',text:'#534AB7'},
  Entertainment:{color:'#FBEAF0',icon:'ti-device-tv',text:'#993556'},
  Healthcare:{color:'#E1F5EE',icon:'ti-heart-rate-monitor',text:'#0F6E56'},
  Maintenance:{color:'#E1F5EE',icon:'ti-tools',text:'#0F6E56'},
  Renovation:{color:'#FAEEDA',icon:'ti-hammer',text:'#854F0B'},
  Business:{color:'#E6F1FB',icon:'ti-briefcase',text:'#185FA5'},
  Personal:{color:'#F4C0D1',icon:'ti-user',text:'#993556'},
  'Mortgage Prepayment':{color:'#D6E9F8',icon:'ti-coin',text:'#185FA5'},
  Other:{color:'#f1efe8',icon:'ti-dots',text:'#6b6b6b'},
};

window.App={
  state:{
    profiles:[],properties:[],expenses:[],goals:[],
    incomeEntries:[],rentalIncome:0,tenants:[],maintenance:[],budgets:[],
    activePage:'dash',activeExp:'All',
    scanFile:null,scanCatSel:null,
    editingGoalId:null,editingPropId:null,editingTenantId:null,editingMaintenanceId:null,
    expDateFrom:'',expDateTo:'',incDateFrom:'',incDateTo:'',
    reportMonth:new Date().getMonth(),reportYear:new Date().getFullYear(),
  },
  _prepayments:{},

  async init(){
    this.updateClock();setInterval(()=>this.updateClock(),30000);
    this.updateOnlineStatus();
    window.addEventListener('online',()=>{this.updateOnlineStatus();DB.syncQueue();this.showToast('Back online — syncing...','success');});
    window.addEventListener('offline',()=>{this.updateOnlineStatus();this.showToast('Offline — changes saved locally','warning');});
    await this.loadAll();
    this.renderAll();
    setTimeout(()=>this.checkSmartSuggestions(),2000);
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  },

  async loadAll(){
    const[profiles,properties,expenses,goals,rental,incomeEntries,tenants,maintenance,budgets]=await Promise.all([
      DB.getAll('profiles'),DB.getAll('properties'),DB.getAll('expenses'),
      DB.getAll('goals'),DB.getAll('rental_income'),DB.getAll('income_entries'),
      DB.getAll('tenants'),DB.getAll('maintenance_logs'),DB.getAll('budgets'),
    ]);
    this.state.profiles=profiles||[];
    this.state.properties=properties||[];
    this.state.expenses=expenses||[];
    this.state.goals=(goals||[]).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    this.state.rentalIncome=rental?.[0]?.total_monthly||0;
    this.state.incomeEntries=incomeEntries||[];
    this.state.tenants=tenants||[];
    this.state.maintenance=maintenance||[];
    this.state.budgets=budgets||[];
  },

  renderAll(){
    this.renderDashboard();this.renderSalary();this.renderExpenses();
    this.renderGoals();this.renderProperties();this.renderReports();
  },

  updateClock(){const el=document.getElementById('clock');if(el)el.textContent=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});},
  updateOnlineStatus(){
    const dot=document.getElementById('sync-dot'),lbl=document.getElementById('sync-label');
    if(!dot)return;
    dot.className=navigator.onLine?'sync-dot':'sync-dot offline';
    if(lbl)lbl.textContent=navigator.onLine?'Synced':'Offline';
  },
  showToast(msg,type=''){
    let t=document.getElementById('toast');
    t.textContent=msg;t.className='toast show '+type;
    clearTimeout(this._toastTimer);
    this._toastTimer=setTimeout(()=>t.classList.remove('show'),3200);
  },
  logActivity(action,entity,details){DB.insert('activity_log',{action,entity,details,created_at:new Date().toISOString()}).catch(()=>{});},

  // COMPUTED
  getTotalSalary(){return this.state.profiles.reduce((s,p)=>s+parseNum(p.monthly_salary)+parseNum(p.bonus),0);},
  getThisMonthSideHustle(){
    const now=new Date();const m=now.getMonth(),y=now.getFullYear();
    return this.state.incomeEntries.filter(e=>{const d=parseDate(e.date);return d.getMonth()===m&&d.getFullYear()===y;}).reduce((s,e)=>s+parseNum(e.amount),0);
  },
  getTotalIncome(){return this.getTotalSalary()+parseNum(this.state.rentalIncome)+this.getThisMonthSideHustle();},
  getTotalExpenses(month,year){
    const now=new Date();const m=month!==undefined?month:now.getMonth(),y=year||now.getFullYear();
    return this.state.expenses.filter(e=>{const d=parseDate(e.date||e.created_at);return d.getMonth()===m&&d.getFullYear()===y;}).reduce((s,e)=>s+parseNum(e.amount),0);
  },
  getTotalRent(){return this.state.properties.reduce((s,p)=>s+parseNum(p.rent_income),0);},
  getTotalCashFlow(){return this.state.properties.reduce((s,p)=>s+parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax),0);},
  getTotalEquity(){return this.state.properties.reduce((s,p)=>s+parseNum(p.current_value)-parseNum(p.loan_balance),0);},
  getTotalPortfolioValue(){return this.state.properties.reduce((s,p)=>s+parseNum(p.current_value),0);},
  getTotalLoanBalance(){return this.state.properties.reduce((s,p)=>s+parseNum(p.loan_balance),0);},
  getTotalActualGoalsSaved(){return this.state.goals.filter(g=>g.goal_type!=='lifestyle').reduce((s,g)=>s+parseNum(g.saved),0);},
  getGoalsAllocated(){return this.state.goals.filter(g=>g.goal_type!=='lifestyle').reduce((s,g)=>s+parseNum(g.monthly_allocation),0);},
  getUnassigned(){return this.getTotalIncome()-this.getTotalExpenses()-this.getTotalActualGoalsSaved();},
  getFreeCash(){return this.getUnassigned();},
  getCatExpenses(cat,month,year){
    const now=new Date();const m=month!==undefined?month:now.getMonth(),y=year||now.getFullYear();
    return this.state.expenses.filter(e=>{const d=parseDate(e.date||e.created_at);return e.category===cat&&d.getMonth()===m&&d.getFullYear()===y;}).reduce((s,e)=>s+parseNum(e.amount),0);
  },
  getBudgetAlert(cat){
    const budget=this.state.budgets.find(b=>b.category===cat);
    if(!budget)return null;
    const spent=this.getCatExpenses(cat);
    const pct=Math.round(spent/parseNum(budget.monthly_limit)*100);
    return{spent,limit:parseNum(budget.monthly_limit),pct,over:spent>parseNum(budget.monthly_limit)};
  },

  // SMART SUGGESTIONS
  checkSmartSuggestions(){
    const suggestions=[];
    const unassigned=this.getUnassigned();
    const goals=this.state.goals.filter(g=>!g.completed&&g.goal_type!=='lifestyle');
    if(unassigned>5000){
      const topGoal=goals.sort((a,b)=>parseNum(b.monthly_allocation)-parseNum(a.monthly_allocation))[0];
      if(topGoal)suggestions.push({icon:'ti-lightbulb',color:'#EF9F27',title:'Free cash sitting idle',msg:`You have ${fmt(unassigned)} unassigned. Adding it to "${topGoal.title}" could get you there ${Math.ceil((parseNum(topGoal.target)-parseNum(topGoal.saved))/unassigned)} months sooner.`});
    }
    const props=this.state.properties.filter(p=>parseNum(p.loan_balance)>0&&parseNum(p.interest_rate)>0);
    if(props.length>0&&unassigned>2000){
      const prop=props[0];
      const monthlyInterestCost=parseNum(prop.loan_balance)*(parseNum(prop.interest_rate)/100/12);
      suggestions.push({icon:'ti-trending-down',color:'#1D9E75',title:`Pay off ${prop.name} faster`,msg:`At ${prop.interest_rate}%, you pay ${fmt(monthlyInterestCost)} interest/mo. Extra payments now save months and thousands.`});
    }
    Object.keys(CATS).forEach(cat=>{
      const alert=this.getBudgetAlert(cat);
      if(alert&&alert.over)suggestions.push({icon:'ti-alert-triangle',color:'#E24B4A',title:`Over budget: ${cat}`,msg:`Spent ${fmt(alert.spent)} vs ${fmt(alert.limit)} budget (${alert.pct}%).`});
    });
    if(suggestions.length>0)this.showSmartBanner(suggestions[0]);
  },
  showSmartBanner(s){
    const el=document.getElementById('smart-banner');
    if(!el)return;
    el.innerHTML=`<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#fff;border-radius:14px;border:1px solid var(--border);margin:12px 18px 0;cursor:pointer" onclick="App.dismissSmartBanner()">
      <div style="width:38px;height:38px;border-radius:50%;background:${s.color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ${s.icon}" style="font-size:20px;color:${s.color}"></i></div>
      <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800;color:var(--text)">${s.title}</div><div style="font-size:12px;color:var(--muted);margin-top:2px;line-height:1.4">${s.msg}</div></div>
      <i class="ti ti-x" style="font-size:16px;color:var(--muted);flex-shrink:0"></i></div>`;
    el.style.display='block';
  },
  dismissSmartBanner(){const el=document.getElementById('smart-banner');if(el)el.style.display='none';},

  // DASHBOARD
  renderDashboard(){
    const p1=this.state.profiles[0]||{name:'Jovannie Ducay'};
    const p2=this.state.profiles[1]||{name:'Melody Ducay'};
    const n1=p1.name.split(' ')[0],n2=p2.name.split(' ')[0];
    const i1=(p1.name[0]||'J')+(p1.name.split(' ')[1]?.[0]||'D');
    const i2=(p2.name[0]||'M')+(p2.name.split(' ')[1]?.[0]||'D');
    const equity=this.getTotalEquity(),income=this.getTotalIncome();
    const expenses=this.getTotalExpenses(),cashFlow=this.getTotalCashFlow();
    const unassigned=this.getUnassigned(),sideHustle=this.getThisMonthSideHustle();
    const savingsRate=income>0?Math.round((income-expenses)/income*100):0;
    const bannerColor=unassigned<0?'#FCEBEB':unassigned<2000?'#FAEEDA':'#E1F5EE';
    const bannerText=unassigned<0?'#A32D2D':unassigned<2000?'#854F0B':'#0F6E56';
    const bannerIcon=unassigned<0?'ti-alert-triangle':unassigned<2000?'ti-alert-circle':'ti-piggy-bank';
    const bannerMsg=unassigned<0?`Over budget by ${fmt(Math.abs(unassigned))}`:unassigned===0?'Every kr. is assigned!':`${fmt(unassigned)} not yet spent or saved`;
    const nextGoal=this.state.goals.filter(g=>!g.completed&&g.goal_type!=='lifestyle').sort((a,b)=>parseNum(b.monthly_allocation)-parseNum(a.monthly_allocation))[0];
    const alerts=Object.keys(CATS).map(c=>({cat:c,a:this.getBudgetAlert(c)})).filter(x=>x.a&&x.a.over);

    document.getElementById('dash-content').innerHTML=`
      <div class="dash-hd">
        <div class="dh-top">
          <div><div class="dh-greeting">Good ${this.timeOfDay()},</div><div class="dh-names">${n1} & ${n2} 👋</div></div>
          <div style="display:flex"><div class="avatar">${i1}</div><div class="avatar" style="margin-left:-8px">${i2}</div></div>
        </div>
        <div class="net-worth">${fmt(equity)}</div>
        <div class="nw-sub">Portfolio equity · ${fmtShort(this.getTotalPortfolioValue())} total value</div>
        <div class="badge-row">
          <span class="badge"><i class="ti ti-trending-up" style="font-size:11px"></i> +${fmt(cashFlow)}/mo</span>
          <span class="badge">${this.state.properties.length} properties</span>
          ${sideHustle>0?`<span class="badge"><i class="ti ti-bolt" style="font-size:11px"></i> +${fmt(sideHustle)} hustle</span>`:''}
          <span class="badge"><i class="ti ti-percentage" style="font-size:11px"></i> ${savingsRate}% saved</span>
        </div>
      </div>
      <div id="smart-banner"></div>
      <div style="margin:12px 18px 0;background:${bannerColor};border-radius:14px;padding:13px 15px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="App.switchPage('goals')">
        <div style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ${bannerIcon}" style="font-size:20px;color:${bannerText}"></i></div>
        <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:800;color:${bannerText}">${fmt(unassigned)} free cash</div><div style="font-size:12px;color:${bannerText};opacity:.8">${bannerMsg}</div></div>
        <i class="ti ti-chevron-right" style="font-size:16px;color:${bannerText};opacity:.6"></i>
      </div>
      ${alerts.length>0?`<div style="margin:10px 18px 0">${alerts.map(x=>`<div style="background:#FCEBEB;border-radius:12px;padding:9px 12px;margin-bottom:6px;font-size:12px;color:#A32D2D;display:flex;align-items:center;gap:6px"><i class="ti ti-alert-triangle" style="font-size:14px"></i><span>Budget exceeded: <strong>${x.cat}</strong> (${x.a.pct}%)</span></div>`).join('')}</div>`:''}
      <div class="sec" style="margin-top:14px">
        <div class="sec-hd"><span class="sec-title">Monthly snapshot</span><button class="sec-action" onclick="App.switchPage('reports')">Full report</button></div>
        <div class="cards2">
          <div class="mcard"><div class="lbl">Total income</div><div class="val">${fmtShort(income)}</div><div class="hint">salary+rental${sideHustle>0?'+hustle':''}</div></div>
          <div class="mcard"><div class="lbl">Expenses</div><div class="val">${fmtShort(expenses)}</div><div class="hint">this month</div></div>
          <div class="mcard"><div class="lbl">In goals</div><div class="val">${fmtShort(this.getTotalActualGoalsSaved())}</div><div class="hint">total saved</div></div>
          <div class="mcard"><div class="lbl">Next target</div><div class="val">${nextGoal?fmtShort(parseNum(nextGoal.target)-parseNum(nextGoal.saved)):'—'}</div><div class="hint">${nextGoal?nextGoal.title:'No goals'}</div></div>
        </div>
      </div>
      <div class="sec" style="margin-top:14px">
        <div class="sec-hd"><span class="sec-title">Properties</span><button class="sec-action" onclick="App.switchPage('props')">View all</button></div>
        ${this.state.properties.length===0?`<div class="empty-state"><i class="ti ti-building"></i><div>No properties yet</div><button class="btn-sm" style="margin-top:10px" onclick="App.switchPage('props')"><i class="ti ti-plus"></i> Add first</button></div>`:''}
        ${this.state.properties.slice(0,3).map(p=>{
          const cf=parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax);
          const tenant=this.state.tenants.find(t=>t.property_id===p.id&&t.status==='Active');
          return `<div class="prop-card" onclick="App.switchPage('props')">
            <div class="prop-ico"><i class="ti ti-home"></i></div>
            <div style="flex:1;min-width:0"><div class="pname">${p.name}</div><div class="paddr">${p.address||'No address'} · ${tenant?tenant.name:p.status||'Rented'}</div></div>
            <div><div class="prent">${fmt(p.rent_income)}/mo</div><div class="pcf">${cf>=0?'+':''}${fmt(cf)} cf</div></div>
          </div>`;
        }).join('')}
      </div>
      <div class="sec" style="margin-top:14px;padding-bottom:20px">
        <div class="sec-hd"><span class="sec-title">Goals at a glance</span><button class="sec-action" onclick="App.switchPage('goals')">View all</button></div>
        ${this.state.goals.length===0?`<div class="empty-state"><i class="ti ti-target"></i><div>No goals</div></div>`:''}
        ${this.state.goals.filter(g=>!g.completed).slice(0,3).map(g=>{
          const isLife=g.goal_type==='lifestyle';
          const cur=isLife?parseNum(g.lifestyle_balance):parseNum(g.saved);
          const cap=isLife?parseNum(g.lifestyle_cap):parseNum(g.target);
          const pct=cap>0?Math.min(100,Math.round(cur/cap*100)):0;
          const milestone=pct>=75?'⚡ Final stretch!':pct>=50?'🔥 Halfway!':pct>=25?'🎯 25% done!':'';
          return `<div class="goal-card${isLife?' lifestyle-card':''}" onclick="App.switchPage('goals')">
            <div class="g-hd">
              <div class="g-ico${isLife?' lifestyle-ico':''}"><i class="ti ${g.icon||'ti-target'}"></i></div>
              <div><div class="g-title">${g.title}${isLife?'<span class="lifestyle-badge">Lifestyle</span>':''}</div><div class="g-sub">${fmt(cur)}${isLife?' available':' of '+fmt(cap)}</div></div>
            </div>
            <div class="bar-bg"><div class="bar-fill${isLife?' lifestyle-fill':''}" data-pct="${pct}" style="width:0%"></div></div>
            ${milestone?`<div style="font-size:11px;color:var(--accent);font-weight:700;margin-top:3px">${milestone}</div>`:''}
            <div class="g-foot"><span>${fmt(g.monthly_allocation)}/mo</span><span class="g-pct">${pct}%</span></div>
          </div>`;
        }).join('')}
      </div>`;
    setTimeout(()=>{this.animateBars();this.checkSmartSuggestions();},300);
  },

  // SALARY
  renderSalary(){
    const p1=this.state.profiles[0]||{name:'Jovannie Ducay',monthly_salary:0,pay_frequency:'Monthly',bonus:0,salary_day:1,opening_balance:0};
    const p2=this.state.profiles[1]||{name:'Melody Ducay',monthly_salary:0,pay_frequency:'Monthly',bonus:0,salary_day:1,opening_balance:0};
    const rental=parseNum(this.state.rentalIncome);
    const filteredIncome=this.getFilteredIncome();
    const totalThisMonth=parseNum(p1.monthly_salary)+parseNum(p1.bonus)+parseNum(p2.monthly_salary)+parseNum(p2.bonus)+rental+this.getThisMonthSideHustle();
    document.getElementById('salary-content').innerHTML=`
      <div class="inner-tabs">
        <button class="inner-tab active" onclick="App.showIncomeTab('jovannie',this)">Jovannie</button>
        <button class="inner-tab" onclick="App.showIncomeTab('melody',this)">Melody</button>
        <button class="inner-tab" onclick="App.showIncomeTab('rental',this)">Rental</button>
        <button class="inner-tab" onclick="App.showIncomeTab('sidehustle',this)">Side hustle</button>
      </div>
      <div class="tab-pane active" id="inc-jovannie"><div class="form-wrap">
        <div style="background:var(--faint);border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:var(--muted)"><i class="ti ti-user" style="font-size:15px;vertical-align:-2px;margin-right:6px;color:var(--accent)"></i><strong>${p1.name}</strong></div>
        <div class="field"><label>Monthly salary (after tax)</label><input type="number" id="sal-p1" value="${parseNum(p1.monthly_salary)||''}" placeholder="0"></div>
        <div class="field"><label>Pay frequency</label><select id="freq-p1">${['Monthly','Bi-weekly','Weekly'].map(f=>`<option${p1.pay_frequency===f?' selected':''}>${f}</option>`).join('')}</select></div>
        <div class="field"><label>Salary pay day</label><input type="number" id="day-p1" value="${p1.salary_day||1}" min="1" max="31"></div>
        <div class="field"><label>Bonus / extra (avg/mo)</label><input type="number" id="bon-p1" value="${parseNum(p1.bonus)||''}" placeholder="0"></div>
        <div class="divider"></div>
        <div class="field"><label>Opening balance (current savings)</label><input type="number" id="bal-p1" value="${parseNum(p1.opening_balance)||''}" placeholder="0"></div>
        <div class="field"><label>Balance as of date</label><input type="date" id="baldate-p1" value="${p1.savings_as_of||today()}"></div>
        <button class="btn-primary" onclick="App.saveProfile(0)"><i class="ti ti-device-floppy"></i> Save Jovannie's income</button>
      </div></div>
      <div class="tab-pane" id="inc-melody"><div class="form-wrap">
        <div style="background:var(--faint);border-radius:12px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:var(--muted)"><i class="ti ti-user" style="font-size:15px;vertical-align:-2px;margin-right:6px;color:var(--accent)"></i><strong>${p2.name}</strong></div>
        <div class="field"><label>Monthly salary (after tax)</label><input type="number" id="sal-p2" value="${parseNum(p2.monthly_salary)||''}" placeholder="0"></div>
        <div class="field"><label>Pay frequency</label><select id="freq-p2">${['Monthly','Bi-weekly','Weekly'].map(f=>`<option${p2.pay_frequency===f?' selected':''}>${f}</option>`).join('')}</select></div>
        <div class="field"><label>Salary pay day</label><input type="number" id="day-p2" value="${p2.salary_day||1}" min="1" max="31"></div>
        <div class="field"><label>Bonus / extra (avg/mo)</label><input type="number" id="bon-p2" value="${parseNum(p2.bonus)||''}" placeholder="0"></div>
        <div class="divider"></div>
        <div class="field"><label>Opening balance (current savings)</label><input type="number" id="bal-p2" value="${parseNum(p2.opening_balance)||''}" placeholder="0"></div>
        <div class="field"><label>Balance as of date</label><input type="date" id="baldate-p2" value="${p2.savings_as_of||today()}"></div>
        <button class="btn-primary" onclick="App.saveProfile(1)"><i class="ti ti-device-floppy"></i> Save Melody's income</button>
      </div></div>
      <div class="tab-pane" id="inc-rental"><div class="form-wrap">
        <div class="field"><label>Total monthly rent received</label><input type="number" id="rental-total" value="${rental||''}" placeholder="0"></div>
        <button class="btn-primary" onclick="App.saveRental()"><i class="ti ti-device-floppy"></i> Save rental income</button>
      </div></div>
      <div class="tab-pane" id="inc-sidehustle"><div class="form-wrap">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div style="font-size:15px;font-weight:800">Side hustle log</div><button class="btn-sm" onclick="App.openAddIncome()"><i class="ti ti-plus" style="font-size:13px"></i> Add</button></div>
        <div style="background:var(--faint);border-radius:12px;padding:10px 12px;margin-bottom:12px">
          <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Filter by date</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="date" id="inc-from" value="${this.state.incDateFrom}" onchange="App.setIncFilter()" style="flex:1;border:1px solid var(--border);border-radius:8px;padding:7px 8px;font-size:12px;background:#fff;font-family:inherit">
            <span style="font-size:12px;color:var(--muted)">to</span>
            <input type="date" id="inc-to" value="${this.state.incDateTo}" onchange="App.setIncFilter()" style="flex:1;border:1px solid var(--border);border-radius:8px;padding:7px 8px;font-size:12px;background:#fff;font-family:inherit">
            ${this.state.incDateFrom||this.state.incDateTo?`<button onclick="App.clearIncFilter()" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:18px;padding:0"><i class="ti ti-x"></i></button>`:''}
          </div>
        </div>
        <div style="background:var(--accent-light);border-radius:12px;padding:10px 14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;color:var(--accent-dark);font-weight:700">${this.state.incDateFrom||this.state.incDateTo?'Filtered':'This month'} total</span>
          <span style="font-size:18px;font-weight:800;color:var(--accent-dark)">${fmt(this.getFilteredIncomeTotal())}</span>
        </div>
        ${filteredIncome.length===0?`<div class="empty-state"><i class="ti ti-bolt"></i><div>No entries found</div></div>`:''}
        ${filteredIncome.sort((a,b)=>parseDate(b.date)-parseDate(a.date)).map(e=>`
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="width:36px;height:36px;border-radius:10px;background:var(--accent-light);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-bolt" style="font-size:16px;color:var(--accent)"></i></div>
            <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">${e.description}</div><div style="font-size:11px;color:var(--muted)">${parseDate(e.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}${e.is_recurring?` · <span style="color:var(--accent)">↻ ${e.recurrence}</span>`:''}</div></div>
            <div style="text-align:right"><div style="font-size:14px;font-weight:800;color:var(--accent)">${fmt(e.amount)}</div><button onclick="App.deleteIncome('${e.id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;padding:0"><i class="ti ti-trash"></i></button></div>
          </div>`).join('')}
      </div></div>
      <div style="padding:14px 18px 20px;border-top:1px solid var(--border);margin-top:8px">
        <div class="total-box"><span class="tl">Total household income/mo</span><span class="ta">${fmt(totalThisMonth)}</span></div>
      </div>`;
  },
  showIncomeTab(id,btn){
    document.querySelectorAll('#page-salary .tab-pane').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('#page-salary .inner-tab').forEach(b=>b.classList.remove('active'));
    document.getElementById('inc-'+id).classList.add('active');btn.classList.add('active');
  },
  async saveProfile(idx){
    const p=this.state.profiles[idx];if(!p?.id){this.showToast('Profile not found','error');return;}
    const sfx=idx===0?'p1':'p2';
    const data={monthly_salary:parseNum(document.getElementById(`sal-${sfx}`).value),pay_frequency:document.getElementById(`freq-${sfx}`).value,salary_day:parseInt(document.getElementById(`day-${sfx}`).value)||1,bonus:parseNum(document.getElementById(`bon-${sfx}`).value),opening_balance:parseNum(document.getElementById(`bal-${sfx}`).value),savings_as_of:document.getElementById(`baldate-${sfx}`).value};
    await DB.update('profiles',p.id,data);Object.assign(this.state.profiles[idx],data);
    this.renderDashboard();this.showToast(`${p.name.split(' ')[0]}'s income saved!`,'success');
  },
  async saveRental(){
    const val=parseNum(document.getElementById('rental-total').value);this.state.rentalIncome=val;
    const rentalRow=(DB.local.get('rental_income')||[])[0];
    if(rentalRow?.id)await DB.update('rental_income',rentalRow.id,{total_monthly:val});
    else await DB.insert('rental_income',{total_monthly:val});
    this.renderDashboard();this.showToast('Rental income saved!','success');
  },
  openAddIncome(){
    document.getElementById('income-desc').value='';document.getElementById('income-amount').value='';
    document.getElementById('income-date').value=today();document.getElementById('income-recurring').checked=false;
    document.getElementById('income-recurrence-row').style.display='none';this.openSheet('incomeSheet');
  },
  async saveIncome(){
    const desc=document.getElementById('income-desc').value.trim(),amount=parseNum(document.getElementById('income-amount').value),date=document.getElementById('income-date').value;
    const isRecurring=document.getElementById('income-recurring').checked,recurrence=isRecurring?document.getElementById('income-recurrence').value:null;
    if(!desc||!amount){this.showToast('Enter description & amount','error');return;}
    const entry=await DB.insert('income_entries',{profile_id:this.state.profiles[0]?.id||null,description:desc,amount,date,is_recurring:isRecurring,recurrence});
    this.state.incomeEntries.unshift(entry);this.closeSheet('incomeSheet');this.renderSalary();this.renderDashboard();this.showToast('Income logged!','success');
  },
  setIncFilter(){this.state.incDateFrom=document.getElementById('inc-from')?.value||'';this.state.incDateTo=document.getElementById('inc-to')?.value||'';this.renderSalary();setTimeout(()=>{const t=document.querySelector('#page-salary .inner-tab:nth-child(4)');if(t)this.showIncomeTab('sidehustle',t);},10);},
  clearIncFilter(){this.state.incDateFrom='';this.state.incDateTo='';this.setIncFilter();},
  getFilteredIncome(){
    if(!this.state.incDateFrom&&!this.state.incDateTo){const now=new Date();return this.state.incomeEntries.filter(e=>{const d=parseDate(e.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});}
    return this.state.incomeEntries.filter(e=>{const d=parseDate(e.date);const from=this.state.incDateFrom?parseDate(this.state.incDateFrom):new Date(0);const to=this.state.incDateTo?new Date(this.state.incDateTo+'T23:59:59'):new Date();return d>=from&&d<=to;});
  },
  getFilteredIncomeTotal(){return this.getFilteredIncome().reduce((s,e)=>s+parseNum(e.amount),0);},
  async deleteIncome(id){this.state.incomeEntries=this.state.incomeEntries.filter(e=>e.id!==id);await DB.delete('income_entries',id);this.renderSalary();setTimeout(()=>{const t=document.querySelector('#page-salary .inner-tab:nth-child(4)');if(t)this.showIncomeTab('sidehustle',t);},10);this.renderDashboard();this.showToast('Entry deleted');},

  // EXPENSES
  renderExpenses(){
    const now=new Date();const m=now.getMonth(),y=now.getFullYear();
    let src;
    if(this.state.expDateFrom||this.state.expDateTo){
      src=this.state.expenses.filter(e=>{const d=parseDate(e.date||e.created_at);const from=this.state.expDateFrom?parseDate(this.state.expDateFrom):new Date(0);const to=this.state.expDateTo?new Date(this.state.expDateTo+'T23:59:59'):new Date();return d>=from&&d<=to;});
    }else{src=this.state.expenses.filter(e=>{const d=parseDate(e.date||e.created_at);return d.getMonth()===m&&d.getFullYear()===y;});}
    const filtered=this.state.activeExp==='All'?src:src.filter(e=>e.category===this.state.activeExp);
    const total=src.reduce((s,e)=>s+parseNum(e.amount),0);
    const recurring=src.filter(e=>e.is_recurring);
    const cats=['All',...new Set(src.map(e=>e.category))];
    const dateLabel=this.state.expDateFrom||this.state.expDateTo?`${this.state.expDateFrom||'start'} → ${this.state.expDateTo||'today'}`:`${now.toLocaleString('default',{month:'long'})} ${y}`;
    const budgetAlerts=this.state.budgets.map(b=>{const spent=this.getCatExpenses(b.category);const pct=Math.round(spent/parseNum(b.monthly_limit)*100);return{cat:b.category,spent,limit:parseNum(b.monthly_limit),pct};}).filter(a=>a.pct>=80);

    document.getElementById('expenses-content').innerHTML=`
      <div class="upload-zone" id="upload-zone" onclick="document.getElementById('file-input').click()" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="App.handleDrop(event)">
        <i class="ti ti-camera-plus"></i><p>Take photo or upload receipt</p><small>AI scans & suggests category</small>
        <input type="file" id="file-input" accept="image/*" capture="environment" style="display:none" onchange="App.handleFileSelect(event)">
      </div>
      ${budgetAlerts.length>0?`<div style="padding:0 18px 8px">${budgetAlerts.map(a=>`<div style="background:${a.pct>=100?'#FCEBEB':'#FAEEDA'};border-radius:12px;padding:9px 12px;margin-bottom:6px;font-size:12px;color:${a.pct>=100?'#A32D2D':'#854F0B'};display:flex;justify-content:space-between"><span><i class="ti ti-alert-triangle" style="font-size:13px;vertical-align:-1px;margin-right:4px"></i>${a.cat}: ${fmt(a.spent)} of ${fmt(a.limit)}</span><span style="font-weight:800">${a.pct}%</span></div>`).join('')}</div>`:''}
      <div style="padding:0 18px 10px"><div style="background:var(--faint);border-radius:12px;padding:10px 12px">
        <div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Date filter</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="date" id="exp-from" value="${this.state.expDateFrom}" onchange="App.setExpFilter()" style="flex:1;border:1px solid var(--border);border-radius:8px;padding:7px 8px;font-size:12px;background:#fff;font-family:inherit">
          <span style="font-size:12px;color:var(--muted)">to</span>
          <input type="date" id="exp-to" value="${this.state.expDateTo}" onchange="App.setExpFilter()" style="flex:1;border:1px solid var(--border);border-radius:8px;padding:7px 8px;font-size:12px;background:#fff;font-family:inherit">
          ${this.state.expDateFrom||this.state.expDateTo?`<button onclick="App.clearExpFilter()" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:18px;flex-shrink:0;padding:0"><i class="ti ti-x"></i></button>`:''}
        </div>
      </div></div>
      ${recurring.length>0?`<div style="padding:0 18px 10px"><div style="background:#FAEEDA;border-radius:12px;padding:10px 14px;font-size:13px;color:#854F0B;display:flex;justify-content:space-between"><span><i class="ti ti-refresh" style="font-size:14px;vertical-align:-2px;margin-right:4px"></i><strong>${recurring.length} recurring</strong> · ${fmt(recurring.reduce((s,e)=>s+parseNum(e.amount),0))}/mo</span></div></div>`:''}
      <div class="exp-hd"><span>${dateLabel}</span><span style="color:var(--danger)">${fmt(total)}</span></div>
      <div class="exp-filters">${cats.map(c=>`<button class="filter-pill${this.state.activeExp===c?' active':''}" onclick="App.filterExp('${c}')">${c}</button>`).join('')}</div>
      <div style="padding:0 18px 8px;display:flex;gap:8px">
        <button class="btn-sm" onclick="App.openBudgetSheet()" style="font-size:11px"><i class="ti ti-adjustments" style="font-size:12px"></i> Set budgets</button>
        <button class="btn-sm" onclick="App.exportExpensesCSV()" style="font-size:11px"><i class="ti ti-download" style="font-size:12px"></i> Export CSV</button>
      </div>
      ${filtered.length===0?`<div class="empty-state"><i class="ti ti-receipt"></i><div>No expenses found</div></div>`:''}
      <div id="exp-list">${filtered.sort((a,b)=>parseDate(b.date||b.created_at)-parseDate(a.date||a.created_at)).map(e=>this.expItemHTML(e)).join('')}</div>
      <div style="padding:14px 18px"><button class="add-card-btn" onclick="App.openAddExpense()"><i class="ti ti-plus" style="font-size:18px"></i> Add expense manually</button></div>`;
  },
  expItemHTML(e){
    const cat=CATS[e.category]||CATS.Other;
    return `<div class="exp-item" id="exp-${e.id}">
      <div class="exp-cat-ico" style="background:${cat.color}"><i class="ti ${cat.icon}" style="color:${cat.text}"></i></div>
      <div style="flex:1;min-width:0"><div class="exp-name">${e.name}${e.is_recurring?` <span style="font-size:10px;background:#FAEEDA;color:#854F0B;padding:2px 6px;border-radius:10px;font-weight:700">↻ ${e.recurrence||'recurring'}</span>`:''}</div><div class="exp-catname">${e.category} · ${parseDate(e.date||e.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}${e.receipt_url?` · <span style="color:var(--accent)">📎</span>`:''}</div></div>
      <div style="display:flex;align-items:center;gap:8px"><div class="exp-amt">${fmt(e.amount)}</div><button onclick="App.deleteExpense('${e.id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:0"><i class="ti ti-trash"></i></button></div>
    </div>`;
  },
  setExpFilter(){this.state.expDateFrom=document.getElementById('exp-from')?.value||'';this.state.expDateTo=document.getElementById('exp-to')?.value||'';this.renderExpenses();},
  clearExpFilter(){this.state.expDateFrom='';this.state.expDateTo='';this.renderExpenses();},
  filterExp(cat){this.state.activeExp=cat;this.renderExpenses();},
  handleDrop(e){e.preventDefault();document.getElementById('upload-zone').classList.remove('drag');const f=e.dataTransfer.files[0];if(f&&f.type.startsWith('image/'))this.processScanFile(f);},
  handleFileSelect(e){const f=e.target.files[0];if(f)this.processScanFile(f);},
  processScanFile(file){
    this.state.scanFile=file;const reader=new FileReader();
    reader.onload=(ev)=>{const img=document.getElementById('scan-preview');img.src=ev.target.result;img.style.display='block';};
    reader.readAsDataURL(file);this.state.scanCatSel=null;document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('sel'));this.openAddExpense();
  },
  openAddExpense(){
    if(!this.state.scanFile){document.getElementById('scan-preview').style.display='none';document.getElementById('scan-name').value='';document.getElementById('scan-amount').value='';}
    document.getElementById('scan-date').value=today();document.getElementById('exp-recurring-cb').checked=false;document.getElementById('exp-recurrence-row').style.display='none';this.openSheet('scanSheet');
  },
  selectCat(cat){this.state.scanCatSel=cat;document.querySelectorAll('.cat-btn').forEach(b=>b.classList.toggle('sel',b.dataset.cat===cat));},
  async confirmExpense(){
    const name=document.getElementById('scan-name').value.trim(),amount=parseNum(document.getElementById('scan-amount').value),date=document.getElementById('scan-date').value;
    const cat=this.state.scanCatSel||'Other',isRecurring=document.getElementById('exp-recurring-cb').checked,recurrence=isRecurring?document.getElementById('exp-recurrence').value:null;
    if(!name||!amount){this.showToast('Enter name & amount','error');return;}
    const btn=document.getElementById('confirm-expense-btn');btn.classList.add('loading');btn.innerHTML='<span class="spinner"></span>';
    let receiptUrl=null;if(this.state.scanFile)receiptUrl=await this.uploadReceipt(this.state.scanFile).catch(()=>null);
    const exp=await DB.insert('expenses',{name,amount,category:cat,date,receipt_url:receiptUrl,is_recurring:isRecurring,recurrence});
    this.state.expenses.unshift(exp);this.state.scanFile=null;this.closeSheet('scanSheet');this.renderExpenses();this.renderDashboard();
    this.showToast('Expense added!','success');btn.classList.remove('loading');btn.innerHTML='<i class="ti ti-check"></i> Save expense';
    const alert=this.getBudgetAlert(cat);if(alert&&alert.pct>=80)this.showToast(`⚠️ ${cat} at ${alert.pct}% of budget`,'warning');
  },
  async uploadReceipt(file){const ext=file.name.split('.').pop()||'jpg';const path=`receipts/${Date.now()}.${ext}`;const res=await fetch(`${DB.SUPABASE_URL}/storage/v1/object/receipts/${path}`,{method:'POST',headers:{'apikey':DB.SUPABASE_KEY,'Authorization':`Bearer ${DB.SUPABASE_KEY}`,'Content-Type':file.type},body:file});if(res.ok)return`${DB.SUPABASE_URL}/storage/v1/object/public/receipts/${path}`;return null;},
  async deleteExpense(id){if(!confirm('Delete this expense?'))return;this.state.expenses=this.state.expenses.filter(e=>e.id!==id);await DB.delete('expenses',id);this.renderExpenses();this.renderDashboard();this.showToast('Expense deleted');},
  exportExpensesCSV(){
    const rows=[['Date','Name','Category','Amount','Recurring']];
    const now=new Date();const m=now.getMonth(),y=now.getFullYear();
    this.state.expenses.filter(e=>{const d=parseDate(e.date||e.created_at);return d.getMonth()===m&&d.getFullYear()===y;}).forEach(e=>rows.push([e.date||'',e.name,e.category,e.amount,e.is_recurring?'Yes':'No']));
    const csv=rows.map(r=>r.join(',')).join('\n');const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download=`expenses-${y}-${m+1}.csv`;a.click();this.showToast('CSV exported!','success');
  },
  openBudgetSheet(){
    const content=document.getElementById('budget-cats');
    content.innerHTML=Object.keys(CATS).map(cat=>{const b=this.state.budgets.find(x=>x.category===cat);const co=CATS[cat];return`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div style="width:32px;height:32px;border-radius:8px;background:${co.color};display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ${co.icon}" style="font-size:14px;color:${co.text}"></i></div><div style="flex:1;font-size:13px;font-weight:600">${cat}</div><input type="number" data-cat="${cat}" value="${b?parseNum(b.monthly_limit):''}" placeholder="No limit" style="width:100px;border:1px solid var(--border);border-radius:8px;padding:6px 8px;font-size:12px;text-align:right;font-family:inherit"></div>`;}).join('');
    this.openSheet('budgetSheet');
  },
  async saveBudgets(){
    const inputs=document.querySelectorAll('#budget-cats input[data-cat]');
    for(const input of inputs){const cat=input.dataset.cat,val=parseNum(input.value);const existing=this.state.budgets.find(b=>b.category===cat);if(val>0){if(existing){await DB.update('budgets',existing.id,{monthly_limit:val});existing.monthly_limit=val;}else{const b=await DB.insert('budgets',{category:cat,monthly_limit:val});this.state.budgets.push(b);}}else if(existing){await DB.delete('budgets',existing.id);this.state.budgets=this.state.budgets.filter(b=>b.id!==existing.id);}}
    this.closeSheet('budgetSheet');this.renderExpenses();this.showToast('Budgets saved!','success');
  },

  // GOALS
  renderGoals(){
    const allocated=this.getGoalsAllocated(),income=this.getTotalIncome(),expenses=this.getTotalExpenses();
    const actualSaved=this.getTotalActualGoalsSaved(),free=income-expenses-actualSaved;
    const activeGoals=this.state.goals.filter(g=>g.goal_type==='lifestyle'||(g.goal_type!=='lifestyle'&&!g.completed&&parseNum(g.saved)<parseNum(g.target)));
    const completedGoals=this.state.goals.filter(g=>g.goal_type!=='lifestyle'&&(g.completed||parseNum(g.saved)>=parseNum(g.target)));
    document.getElementById('goals-content').innerHTML=`
      <div style="padding:18px">
        <div class="section-hd-row"><span>Financial goals</span><button class="btn-sm" onclick="App.openAddGoal()"><i class="ti ti-plus" style="font-size:13px"></i> Add goal</button></div>
        <div style="background:var(--faint);border-radius:12px;padding:9px 14px;margin-bottom:14px;font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px"><i class="ti ti-arrows-up-down" style="font-size:14px"></i> Use ↑ ↓ buttons to reorder</div>
        ${activeGoals.length===0&&completedGoals.length===0?`<div class="empty-state"><i class="ti ti-target"></i><div>No goals yet!</div></div>`:''}
        <div id="goals-list">${activeGoals.map((g,i)=>this.goalCardHTML(g,i,activeGoals.length)).join('')}</div>
        ${completedGoals.length>0?`
        <div style="margin-top:20px">
          <div style="font-size:12px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;display:flex;align-items:center;gap:6px"><i class="ti ti-trophy" style="font-size:14px;color:#EF9F27"></i> Achieved goals (${completedGoals.length})</div>
          ${completedGoals.map(g=>{
            const pct=Math.min(100,Math.round(parseNum(g.saved)/parseNum(g.target)*100));
            const achievedDate=g.completed_at?parseDate(g.completed_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Date not recorded';
            return`<div class="goal-card done" id="gcard-${g.id}" style="opacity:.9"><div id="conf-${g.id}"></div>
              <div style="display:flex;align-items:flex-start;gap:6px"><div style="width:28px;flex-shrink:0"></div><div style="flex:1;min-width:0">
                <div class="g-hd"><div class="g-ico done-ico"><i class="ti ${g.icon||'ti-target'}"></i></div><div style="flex:1;min-width:0"><div class="g-title">${g.title} <span class="done-badge"><i class="ti ti-trophy" style="font-size:10px"></i> Achieved!</span></div><div class="g-sub">${fmt(g.saved)} saved · 🗓 ${achievedDate}</div></div></div>
                <div class="bar-bg"><div class="bar-fill" data-pct="100" style="width:0%;background:var(--accent)"></div></div>
                <div class="g-actions"><div style="flex:1;font-size:12px;color:var(--muted);padding:4px 0">🎉 Completed — keep as a record</div><button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.deleteGoal('${g.id}')"><i class="ti ti-trash" style="font-size:14px;color:var(--danger)"></i></button></div>
              </div></div>
            </div>`;
          }).join('')}
        </div>`:``}
        <div style="background:var(--faint);border-radius:14px;padding:14px;border:1px solid var(--border);margin-top:8px">
          <div style="font-size:12px;font-weight:800;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px">Monthly money flow</div>
          <div class="summary-row"><span class="sr-lbl">Salary (Jovannie + Melody)</span><span class="sr-val" style="color:var(--accent)">+${fmt(this.getTotalSalary())}/mo</span></div>
          <div class="summary-row"><span class="sr-lbl">Rental income</span><span class="sr-val" style="color:var(--accent)">+${fmt(parseNum(this.state.rentalIncome))}/mo</span></div>
          ${this.getThisMonthSideHustle()>0?`<div class="summary-row"><span class="sr-lbl">Side hustle (this month)</span><span class="sr-val" style="color:var(--accent)">+${fmt(this.getThisMonthSideHustle())}</span></div>`:''}
          <div class="summary-row" style="padding-bottom:8px;margin-bottom:4px;border-bottom:1px solid var(--border2)"><span class="sr-lbl" style="font-weight:800">= Total income</span><span class="sr-val" style="font-weight:800">${fmt(income)}</span></div>
          <div class="summary-row"><span class="sr-lbl">− Expenses (actual spending)</span><span class="sr-val" style="color:var(--danger)">−${fmt(expenses)}</span></div>
          <div class="summary-row"><span class="sr-lbl">− Money in goals (total saved)</span><span class="sr-val" style="color:var(--danger)">−${fmt(actualSaved)}</span></div>
          <div style="background:var(--faint);border-radius:8px;padding:6px 10px;margin:6px 0;font-size:11px;color:var(--muted)"><i class="ti ti-info-circle" style="font-size:12px;vertical-align:-1px;margin-right:4px"></i>Planned monthly allocation: ${fmt(allocated)}/mo</div>
          <div class="summary-row" style="border-top:1.5px solid var(--border2);padding-top:8px;margin-top:4px">
            <span class="sr-lbl" style="font-weight:800;color:var(--text)">= Unassigned cash</span>
            <span class="sr-val" style="font-size:16px;color:${free>=0?'var(--accent)':'var(--danger)'}">${fmt(free)}</span>
          </div>
        </div>
      </div>`;
    setTimeout(()=>{this.animateBars();this.checkConfetti();},300);
  },
  goalCardHTML(g,idx=0,total=1){
    const isLife=g.goal_type==='lifestyle';
    const cur=isLife?parseNum(g.lifestyle_balance):parseNum(g.saved);
    const cap=isLife?parseNum(g.lifestyle_cap):parseNum(g.target);
    const pct=cap>0?Math.min(100,Math.round(cur/cap*100)):0;
    const remaining=Math.max(0,cap-cur);
    const months=!isLife&&parseNum(g.monthly_allocation)>0?Math.ceil(remaining/parseNum(g.monthly_allocation)):null;
    const milestone=!isLife?(pct>=100?'🎉 Goal reached! Incredible!':(pct>=75?'⚡ 75% — final stretch!':(pct>=50?'🔥 Halfway there!':(pct>=25?'🎯 25% — great start!':'')))):'';
    return`<div class="goal-card${isLife?' lifestyle-card':''}" id="gcard-${g.id}">
      <div id="conf-${g.id}"></div>
      <div style="display:flex;align-items:flex-start;gap:6px">
        <div style="display:flex;flex-direction:column;gap:4px;padding-top:2px">
          <button onclick="App.moveGoal('${g.id}',-1)" ${idx===0?'disabled':''} style="background:${idx===0?'var(--faint)':'var(--accent-light)'};border:1px solid var(--border);border-radius:8px;width:28px;height:28px;cursor:${idx===0?'default':'pointer'};display:flex;align-items:center;justify-content:center;font-size:14px;color:${idx===0?'var(--muted)':'var(--accent)'}"><i class="ti ti-chevron-up"></i></button>
          <button onclick="App.moveGoal('${g.id}',1)" ${idx===total-1?'disabled':''} style="background:${idx===total-1?'var(--faint)':'var(--accent-light)'};border:1px solid var(--border);border-radius:8px;width:28px;height:28px;cursor:${idx===total-1?'default':'pointer'};display:flex;align-items:center;justify-content:center;font-size:14px;color:${idx===total-1?'var(--muted)':'var(--accent)'}"><i class="ti ti-chevron-down"></i></button>
        </div>
        <div style="flex:1;min-width:0">
          <div class="g-hd">
            <div class="g-ico${isLife?' lifestyle-ico':''}"><i class="ti ${g.icon||'ti-target'}"></i></div>
            <div style="flex:1;min-width:0"><div class="g-title">${g.title}${isLife?'<span class="lifestyle-badge">Lifestyle</span>':''}</div><div class="g-sub">${isLife?`${fmt(cur)} available · cap ${fmt(cap)}`:`${fmt(cur)} of ${fmt(cap)}`}</div></div>
          </div>
          <div class="bar-bg"><div class="bar-fill${isLife?' lifestyle-fill':''}" data-pct="${pct}" style="width:0%"></div></div>
          ${milestone?`<div style="font-size:12px;color:var(--accent);font-weight:700;margin:4px 0">${milestone}</div>`:''}
          <div class="g-foot"><span>${isLife?'Flexible spend':fmt(g.monthly_allocation)+'/mo'+(months?' · ~'+months+' mo left':'')}</span><span class="g-pct">${pct}%</span></div>
          <div class="g-actions">
            <button class="btn-outline" style="flex:1;justify-content:center;font-size:12px;padding:7px" onclick="App.openEditGoal('${g.id}')"><i class="ti ti-edit" style="font-size:14px"></i> Edit</button>
            ${isLife?`<button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.withdrawLifestyle('${g.id}')"><i class="ti ti-arrow-up-left" style="font-size:14px"></i> Withdraw</button><button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.addToGoal('${g.id}')"><i class="ti ti-plus" style="font-size:14px"></i> Top up</button>`:`<button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.addToGoal('${g.id}')"><i class="ti ti-plus" style="font-size:14px"></i> Add funds</button>`}
            <button class="btn-outline" style="font-size:12px;padding:7px 10px" onclick="App.deleteGoal('${g.id}')"><i class="ti ti-trash" style="font-size:14px;color:var(--danger)"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  },
  moveGoal(id,dir){const goals=this.state.goals;const idx=goals.findIndex(g=>g.id===id);const newIdx=idx+dir;if(newIdx<0||newIdx>=goals.length)return;[goals[idx],goals[newIdx]]=[goals[newIdx],goals[idx]];goals.forEach((g,i)=>{g.sort_order=i;DB.update('goals',g.id,{sort_order:i});});this.renderGoals();},
  openAddGoal(){this.state.editingGoalId=null;document.getElementById('goal-sheet-title').textContent='New goal';['goal-title-in','goal-target-in','goal-saved-in','goal-alloc-in','goal-cap-in','goal-balance-in'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('goal-type-sel').value='savings';document.getElementById('goal-icon-sel').value='ti-target';this.toggleGoalType('savings');this.openSheet('goalSheet');},
  openEditGoal(id){const g=this.state.goals.find(x=>x.id===id);if(!g)return;this.state.editingGoalId=id;document.getElementById('goal-sheet-title').textContent='Edit goal';document.getElementById('goal-title-in').value=g.title;document.getElementById('goal-type-sel').value=g.goal_type||'savings';document.getElementById('goal-icon-sel').value=g.icon||'ti-target';this.toggleGoalType(g.goal_type||'savings');if(g.goal_type==='lifestyle'){document.getElementById('goal-cap-in').value=parseNum(g.lifestyle_cap)||'';document.getElementById('goal-balance-in').value=parseNum(g.lifestyle_balance)||'';}else{document.getElementById('goal-target-in').value=parseNum(g.target)||'';document.getElementById('goal-saved-in').value=parseNum(g.saved)||'';document.getElementById('goal-alloc-in').value=parseNum(g.monthly_allocation)||'';}this.openSheet('goalSheet');},
  toggleGoalType(type){const isSavings=type==='savings';document.getElementById('goal-savings-fields').style.display=isSavings?'block':'none';document.getElementById('goal-lifestyle-fields').style.display=isSavings?'none':'block';},
  async saveGoal(){
    const title=document.getElementById('goal-title-in').value.trim(),type=document.getElementById('goal-type-sel').value,icon=document.getElementById('goal-icon-sel').value;
    if(!title){this.showToast('Enter a goal name','error');return;}
    let data={title,icon,goal_type:type};
    if(type==='lifestyle'){const cap=parseNum(document.getElementById('goal-cap-in').value);if(!cap){this.showToast('Enter a spending cap','error');return;}data={...data,lifestyle_cap:cap,lifestyle_balance:parseNum(document.getElementById('goal-balance-in').value),target:cap,saved:0,monthly_allocation:0};}
    else{const target=parseNum(document.getElementById('goal-target-in').value);if(!target){this.showToast('Enter a target amount','error');return;}const saved=parseNum(document.getElementById('goal-saved-in').value);const completed=saved>=target;data={...data,target,saved,monthly_allocation:parseNum(document.getElementById('goal-alloc-in').value),completed,completed_at:completed?today():null};}
    const sortOrder=this.state.editingGoalId?this.state.goals.find(g=>g.id===this.state.editingGoalId)?.sort_order||0:this.state.goals.length;data.sort_order=sortOrder;
    if(this.state.editingGoalId){await DB.update('goals',this.state.editingGoalId,data);const idx=this.state.goals.findIndex(g=>g.id===this.state.editingGoalId);if(idx>=0)this.state.goals[idx]={...this.state.goals[idx],...data};}
    else{const g=await DB.insert('goals',data);this.state.goals.push(g);}
    this.closeSheet('goalSheet');this.renderGoals();this.renderDashboard();this.showToast(this.state.editingGoalId?'Goal updated!':'Goal created! 🎯','success');
  },
  async addToGoal(id){
    const g=this.state.goals.find(x=>x.id===id);if(!g)return;
    const amt=prompt(`Add funds to "${g.title}" (kr.):`);if(!amt||parseNum(amt)<=0)return;
    const amount=parseNum(amt),isLife=g.goal_type==='lifestyle';
    if(isLife){const newBal=Math.min(parseNum(g.lifestyle_cap),parseNum(g.lifestyle_balance)+amount);await DB.update('goals',id,{lifestyle_balance:newBal});g.lifestyle_balance=newBal;}
    else{
      const newSaved=parseNum(g.saved)+amount,completed=newSaved>=parseNum(g.target);
      const completedAt=completed&&!g.completed?today():g.completed_at;
      await DB.update('goals',id,{saved:newSaved,completed,completed_at:completedAt});
      g.saved=newSaved;g.completed=completed;if(completedAt)g.completed_at=completedAt;
      // Milestones
      const pct=Math.round(newSaved/parseNum(g.target)*100);
      if(pct>=75&&!g.milestone_75){await DB.update('goals',id,{milestone_75:true});g.milestone_75=true;this.showToast(`⚡ 75% on ${g.title}!`,'success');}
      else if(pct>=50&&!g.milestone_50){await DB.update('goals',id,{milestone_50:true});g.milestone_50=true;this.showToast(`🔥 Halfway to ${g.title}!`,'success');}
      else if(pct>=25&&!g.milestone_25){await DB.update('goals',id,{milestone_25:true});g.milestone_25=true;this.showToast(`🎯 25% on ${g.title}!`,'success');}
      if(completed){setTimeout(()=>this.launchConfetti(id),400);this.showToast('🎉 GOAL REACHED! Amazing!','success');this.renderGoals();this.renderDashboard();return;}
    }
    this.renderGoals();this.renderDashboard();this.showToast(`Added ${fmt(amount)} to ${g.title}`,'success');
  },
  async withdrawLifestyle(id){const g=this.state.goals.find(x=>x.id===id);if(!g)return;const amt=prompt(`Withdraw from "${g.title}" — available: ${fmt(g.lifestyle_balance)}\nAmount (kr.):`);if(!amt||parseNum(amt)<=0)return;const newBal=Math.max(0,parseNum(g.lifestyle_balance)-parseNum(amt));await DB.update('goals',id,{lifestyle_balance:newBal});g.lifestyle_balance=newBal;this.renderGoals();this.renderDashboard();this.showToast(`Withdrew ${fmt(parseNum(amt))} from ${g.title}`);},
  async deleteGoal(id){if(!confirm('Delete this goal?'))return;this.state.goals=this.state.goals.filter(g=>g.id!==id);await DB.delete('goals',id);this.renderGoals();this.renderDashboard();this.showToast('Goal deleted');},
  launchConfetti(id){const c=document.getElementById('conf-'+id);if(!c)return;const cols=['#1D9E75','#9FE1CB','#5DCAA5','#fff','#E1F5EE','#0F6E56','#EF9F27','#FFD700'];c.innerHTML='';for(let i=0;i<30;i++){const d=document.createElement('div');d.className='conf';const x=(Math.random()*200-100)+'px';d.style.cssText=`left:${Math.random()*100}%;top:${40+Math.random()*50}%;background:${cols[i%cols.length]};--x:${x};animation-delay:${Math.random()*.8}s;animation-duration:${1+Math.random()*.8}s;position:absolute;width:${4+Math.random()*6}px;height:${4+Math.random()*6}px`;c.appendChild(d);}setTimeout(()=>c.innerHTML='',4000);},
  checkConfetti(){this.state.goals.filter(g=>g.goal_type!=='lifestyle'&&(g.completed||parseNum(g.saved)>=parseNum(g.target))).forEach(g=>this.launchConfetti(g.id));},

  // PROPERTIES
  renderProperties(){
    const totalRent=this.getTotalRent(),totalCF=this.getTotalCashFlow(),totalEquity=this.getTotalEquity();
    document.getElementById('props-content').innerHTML=`
      <div class="prop-detail">
        <div class="inner-tabs">
          <button class="inner-tab active" onclick="App.showPropTab('overview',this)">Overview</button>
          <button class="inner-tab" onclick="App.showPropTab('tenants',this)">Tenants</button>
          <button class="inner-tab" onclick="App.showPropTab('maintenance',this)">Maintenance</button>
        </div>
        <div class="tab-pane active" id="prop-overview"><div style="padding:18px">
          <div class="section-hd-row"><span>Properties</span><button class="btn-sm" onclick="App.openAddProp()"><i class="ti ti-plus" style="font-size:13px"></i> Add</button></div>
          <div class="cards2" style="margin-bottom:14px">
            <div class="mcard"><div class="lbl">Total rental</div><div class="val">${fmtShort(totalRent)}</div><div class="hint">per month</div></div>
            <div class="mcard"><div class="lbl">Net cash flow</div><div class="val" style="color:${totalCF>=0?'var(--accent)':'var(--danger)'}">${fmtShort(totalCF)}</div><div class="hint">per month</div></div>
            <div class="mcard"><div class="lbl">Total equity</div><div class="val">${fmtShort(totalEquity)}</div><div class="hint">all properties</div></div>
            <div class="mcard"><div class="lbl">Portfolio value</div><div class="val">${fmtShort(this.getTotalPortfolioValue())}</div><div class="hint">${this.state.properties.length} props</div></div>
          </div>
          ${this.state.properties.length===0?`<div class="empty-state"><i class="ti ti-building"></i><div>No properties yet</div></div>`:''}
          ${this.state.properties.map(p=>this.propDetailHTML(p)).join('')}
          <div class="sep"></div>
          <div class="prop-section-label" style="margin-top:12px">Rollover planner</div>
          ${this.rolloverHTML()}
          <button class="add-card-btn" onclick="App.openAddProp()"><i class="ti ti-plus" style="font-size:18px"></i> Add new property</button>
        </div></div>
        <div class="tab-pane" id="prop-tenants"><div style="padding:18px">
          <div class="section-hd-row"><span>Tenants</span><button class="btn-sm" onclick="App.openAddTenant()"><i class="ti ti-plus" style="font-size:13px"></i> Add tenant</button></div>
          ${this.state.tenants.length===0?`<div class="empty-state"><i class="ti ti-users"></i><div>No tenants yet</div></div>`:''}
          ${this.state.tenants.map(t=>this.tenantCardHTML(t)).join('')}
        </div></div>
        <div class="tab-pane" id="prop-maintenance"><div style="padding:18px">
          <div class="section-hd-row"><span>Maintenance log</span><button class="btn-sm" onclick="App.openAddMaintenance()"><i class="ti ti-plus" style="font-size:13px"></i> Add</button></div>
          ${this.state.maintenance.length===0?`<div class="empty-state"><i class="ti ti-tools"></i><div>No maintenance logs yet</div></div>`:''}
          ${this.state.maintenance.sort((a,b)=>parseDate(b.date)-parseDate(a.date)).map(m=>this.maintenanceCardHTML(m)).join('')}
        </div></div>
      </div>`;
  },
  showPropTab(id,btn){document.querySelectorAll('#page-props .tab-pane').forEach(p=>p.classList.remove('active'));document.querySelectorAll('#page-props .inner-tab').forEach(b=>b.classList.remove('active'));document.getElementById('prop-'+id).classList.add('active');btn.classList.add('active');},

  tenantCardHTML(t){
    const prop=this.state.properties.find(p=>p.id===t.property_id);
    const leaseEnd=t.lease_end?parseDate(t.lease_end):null;
    const daysLeft=leaseEnd?Math.round((leaseEnd-new Date())/(1000*60*60*24)):null;
    const leaseAlert=daysLeft!==null&&daysLeft<60;
    return`<div style="background:#fff;border:1px solid ${leaseAlert?'var(--warning)':'var(--border)'};border-radius:14px;padding:13px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--accent-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800;font-size:15px;color:var(--accent)">${t.name[0]}</div>
        <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700">${t.name}</div><div style="font-size:12px;color:var(--muted)">${prop?prop.name:'Unknown'} · <span class="pill ${t.status==='Active'?'pill-g':'pill-r'}">${t.status||'Active'}</span></div></div>
        <div style="display:flex;gap:6px"><button class="btn-sm" onclick="App.openEditTenant('${t.id}')"><i class="ti ti-edit" style="font-size:12px"></i></button><button class="btn-sm" onclick="App.deleteTenant('${t.id}')" style="color:var(--danger)"><i class="ti ti-trash" style="font-size:12px"></i></button></div>
      </div>
      <div class="cards2">
        <div class="mcard"><div class="lbl">Monthly rent</div><div class="val">${fmt(t.monthly_rent)}</div></div>
        <div class="mcard"><div class="lbl">Deposit held</div><div class="val">${fmt(t.deposit_held)}</div></div>
        <div class="mcard"><div class="lbl">Lease start</div><div class="val" style="font-size:13px">${t.lease_start?parseDate(t.lease_start).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}):'—'}</div></div>
        <div class="mcard" style="${leaseAlert?'background:#FAEEDA;border-color:#EF9F27':''}"><div class="lbl">Lease end</div><div class="val" style="font-size:13px;${leaseAlert?'color:#854F0B':''}">${leaseEnd?leaseEnd.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'}):'—'}${leaseAlert?` ⚠️ ${daysLeft}d`:''}</div></div>
      </div>
      ${t.email||t.phone?`<div style="font-size:12px;color:var(--muted);margin-top:8px;display:flex;gap:12px">${t.email?`<span><i class="ti ti-mail" style="font-size:13px;vertical-align:-2px;margin-right:3px"></i>${t.email}</span>`:''} ${t.phone?`<span><i class="ti ti-phone" style="font-size:13px;vertical-align:-2px;margin-right:3px"></i>${t.phone}</span>`:''}</div>`:''}
      ${t.notes?`<div style="font-size:12px;color:var(--muted);margin-top:6px;background:var(--faint);border-radius:8px;padding:6px 10px">${t.notes}</div>`:''}
    </div>`;
  },
  maintenanceCardHTML(m){
    const prop=this.state.properties.find(p=>p.id===m.property_id);
    const stCls=m.status==='Completed'?'pill-g':m.status==='Pending'?'pill-o':'pill-r';
    return`<div style="background:#fff;border:1px solid var(--border);border-radius:14px;padding:13px;margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
        <div style="width:36px;height:36px;border-radius:10px;background:var(--accent-light);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="ti ti-tools" style="font-size:16px;color:var(--accent)"></i></div>
        <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700">${m.title}</div><div style="font-size:12px;color:var(--muted)">${prop?prop.name:'Unknown'} · ${parseDate(m.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} · <span class="pill ${stCls}">${m.status}</span></div></div>
        <div style="text-align:right"><div style="font-size:14px;font-weight:700;color:var(--danger)">${fmt(m.cost)}</div><button onclick="App.deleteMaintenance('${m.id}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;padding:0;margin-top:4px"><i class="ti ti-trash"></i></button></div>
      </div>
      ${m.description?`<div style="font-size:12px;color:var(--muted);background:var(--faint);border-radius:8px;padding:6px 10px">${m.description}</div>`:''}
    </div>`;
  },

  openAddTenant(){this.state.editingTenantId=null;document.getElementById('tenant-sheet-title').textContent='Add tenant';['tenant-name','tenant-email','tenant-phone','tenant-rent','tenant-deposit','tenant-lease-start','tenant-lease-end','tenant-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('tenant-prop').value='';document.getElementById('tenant-status').value='Active';this.openSheet('tenantSheet');},
  openEditTenant(id){const t=this.state.tenants.find(x=>x.id===id);if(!t)return;this.state.editingTenantId=id;document.getElementById('tenant-sheet-title').textContent='Edit tenant';document.getElementById('tenant-name').value=t.name||'';document.getElementById('tenant-email').value=t.email||'';document.getElementById('tenant-phone').value=t.phone||'';document.getElementById('tenant-prop').value=t.property_id||'';document.getElementById('tenant-rent').value=parseNum(t.monthly_rent)||'';document.getElementById('tenant-deposit').value=parseNum(t.deposit_held)||'';document.getElementById('tenant-lease-start').value=t.lease_start||'';document.getElementById('tenant-lease-end').value=t.lease_end||'';document.getElementById('tenant-status').value=t.status||'Active';document.getElementById('tenant-notes').value=t.notes||'';this.openSheet('tenantSheet');},
  async saveTenant(){
    const name=document.getElementById('tenant-name').value.trim();if(!name){this.showToast('Enter tenant name','error');return;}
    const data={name,email:document.getElementById('tenant-email').value.trim(),phone:document.getElementById('tenant-phone').value.trim(),property_id:document.getElementById('tenant-prop').value||null,monthly_rent:parseNum(document.getElementById('tenant-rent').value),deposit_held:parseNum(document.getElementById('tenant-deposit').value),lease_start:document.getElementById('tenant-lease-start').value||null,lease_end:document.getElementById('tenant-lease-end').value||null,status:document.getElementById('tenant-status').value,notes:document.getElementById('tenant-notes').value.trim()};
    if(this.state.editingTenantId){await DB.update('tenants',this.state.editingTenantId,data);const idx=this.state.tenants.findIndex(t=>t.id===this.state.editingTenantId);if(idx>=0)this.state.tenants[idx]={...this.state.tenants[idx],...data};}
    else{const t=await DB.insert('tenants',data);this.state.tenants.unshift(t);}
    this.closeSheet('tenantSheet');this.renderProperties();this.renderDashboard();this.showToast(this.state.editingTenantId?'Tenant updated!':'Tenant added!','success');
  },
  async deleteTenant(id){if(!confirm('Delete tenant?'))return;this.state.tenants=this.state.tenants.filter(t=>t.id!==id);await DB.delete('tenants',id);this.renderProperties();this.showToast('Tenant deleted');},

  openAddMaintenance(){this.state.editingMaintenanceId=null;document.getElementById('maint-sheet-title').textContent='Log maintenance';['maint-title','maint-desc','maint-cost'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('maint-date').value=today();document.getElementById('maint-prop').value='';document.getElementById('maint-status').value='Completed';this.openSheet('maintSheet');},
  async saveMaintenance(){
    const title=document.getElementById('maint-title').value.trim();if(!title){this.showToast('Enter a title','error');return;}
    const data={title,description:document.getElementById('maint-desc').value.trim(),cost:parseNum(document.getElementById('maint-cost').value),date:document.getElementById('maint-date').value||today(),property_id:document.getElementById('maint-prop').value||null,status:document.getElementById('maint-status').value};
    const m=await DB.insert('maintenance_logs',data);this.state.maintenance.unshift(m);
    this.closeSheet('maintSheet');this.renderProperties();this.showToast('Maintenance logged!','success');
    if(data.cost>0){const exp=await DB.insert('expenses',{name:`Maintenance: ${title}`,amount:data.cost,category:'Maintenance',date:data.date,is_recurring:false});this.state.expenses.unshift(exp);this.renderExpenses();this.renderDashboard();}
  },
  async deleteMaintenance(id){if(!confirm('Delete log?'))return;this.state.maintenance=this.state.maintenance.filter(m=>m.id!==id);await DB.delete('maintenance_logs',id);this.renderProperties();this.showToast('Deleted');},

  propDetailHTML(p){
    const cf=parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax);
    const equity=parseNum(p.current_value)-parseNum(p.loan_balance);
    const ltv=parseNum(p.current_value)>0?Math.round(parseNum(p.loan_balance)/parseNum(p.current_value)*100):0;
    const grossYield=parseNum(p.current_value)>0?(parseNum(p.rent_income)*12/parseNum(p.current_value)*100).toFixed(1):'—';
    const stCls=p.status==='Rented'?'pill-g':p.status==='Vacant'?'pill-r':'pill-o';
    const ltvColor=ltv>90?'var(--danger)':ltv>75?'var(--warning)':'var(--accent)';
    const extraPayment=this._prepayments[p.id]||0;
    const amort=this.calcAmortization(p,extraPayment);
    const tenant=this.state.tenants.find(t=>t.property_id===p.id&&t.status==='Active');
    const maintTotal=this.state.maintenance.filter(m=>m.property_id===p.id).reduce((s,m)=>s+parseNum(m.cost),0);
    return`<div style="margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="prop-section-label" style="margin:0">${p.name}</div>
        <div style="display:flex;gap:6px"><button class="btn-sm" onclick="App.openEditProp('${p.id}')"><i class="ti ti-edit" style="font-size:12px"></i></button><button class="btn-sm" onclick="App.deleteProp('${p.id}')" style="color:var(--danger)"><i class="ti ti-trash" style="font-size:12px"></i></button></div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">${p.address||'No address'} · <span class="pill ${stCls}">${p.status||'Rented'}</span>${tenant?` · <span style="color:var(--accent);font-weight:600">👤 ${tenant.name}</span>`:''}</div>
      <div class="calc-box">
        <h4>Monthly P&L</h4>
        <div class="crow"><span class="cl">Rental income</span><span style="color:var(--accent)">+${fmt(p.rent_income)}</span></div>
        <div class="crow"><span class="cl">Mortgage</span><span>−${fmt(p.mortgage)}</span></div>
        <div class="crow"><span class="cl">Insurance + tax</span><span>−${fmt(p.insurance_tax)}</span></div>
        <div class="crow"><span class="cl">Net cash flow</span><span style="color:${cf>=0?'var(--accent)':'var(--danger)'}">${cf>=0?'+':''}${fmt(cf)}</span></div>
      </div>
      <div class="cards2" style="margin-bottom:12px">
        <div class="mcard"><div class="lbl">Equity</div><div class="val">${fmtShort(equity)}</div><div class="hint">value − loan</div></div>
        <div class="mcard"><div class="lbl">LTV ratio</div><div class="val" style="color:${ltvColor}">${ltv}%</div><div class="hint">${ltv<=80?'✓ Good':ltv<=90?'⚠ High':'⚠ Very high'}</div></div>
        <div class="mcard"><div class="lbl">Gross yield</div><div class="val">${grossYield}%</div><div class="hint">annual rent/value</div></div>
        <div class="mcard"><div class="lbl">Maintenance</div><div class="val">${fmtShort(maintTotal)}</div><div class="hint">all time</div></div>
      </div>
      ${amort?`
      <div class="calc-box">
        <h4>Mortgage breakdown</h4>
        <div class="crow"><span class="cl">Loan balance</span><span>${fmt(p.loan_balance)}</span></div>
        <div class="crow"><span class="cl">Interest rate</span><span>${p.interest_rate||0}%/yr</span></div>
        <div class="crow"><span class="cl">Normal payment</span><span>${fmt(p.mortgage)}/mo</span></div>
        <div class="crow"><span class="cl">↳ Interest portion</span><span style="color:var(--danger)">−${fmt(amort.monthlyInterest)}</span></div>
        <div class="crow"><span class="cl">↳ Principal portion</span><span style="color:var(--accent)">+${fmt(amort.monthlyPrincipal)}</span></div>
        <div class="crow"><span class="cl">Months remaining</span><span>${amort.monthsLeft} months</span></div>
        <div class="crow"><span class="cl">Paid off by</span><span style="color:var(--accent)">${amort.payoffDate}</span></div>
        <div class="crow"><span class="cl">Total interest left</span><span style="color:var(--danger)">${fmt(amort.totalInterestLeft)}</span></div>
      </div>
      <div style="background:#E6F1FB;border-radius:14px;padding:14px;margin-bottom:12px;border:1px solid #BDD5EE">
        <div style="font-size:12px;font-weight:800;color:#185FA5;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px"><i class="ti ti-calculator" style="font-size:14px;vertical-align:-2px;margin-right:4px"></i>Extra payment simulator</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
          <input type="number" id="prepay-${p.id}" value="${extraPayment||''}" placeholder="Extra kr./mo" style="flex:1;border:1px solid #BDD5EE;border-radius:10px;padding:9px 12px;font-size:14px;background:#fff;font-family:inherit">
          <button onclick="App.setPrepayment('${p.id}',document.getElementById('prepay-${p.id}').value)" style="background:#185FA5;color:#fff;border:none;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer">Calculate</button>
          ${extraPayment>0?`<button onclick="App.setPrepayment('${p.id}',0)" style="background:none;border:1px solid #BDD5EE;border-radius:10px;padding:9px 10px;cursor:pointer;color:#185FA5;font-size:13px">✕</button>`:''}
        </div>
        ${extraPayment>0&&amort.monthsSaved>0?`<div style="background:#fff;border-radius:10px;padding:12px;border:1px solid #BDD5EE">
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #E6F1FB"><span style="color:#185FA5">New payment</span><span style="font-weight:800;color:#185FA5">${fmt(parseNum(p.mortgage)+extraPayment)}/mo</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #E6F1FB"><span style="color:#185FA5">New payoff date</span><span style="font-weight:800;color:#185FA5">${amort.payoffDate}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid #E6F1FB"><span style="color:var(--accent)">⚡ Months saved</span><span style="font-weight:800;color:var(--accent)">${amort.monthsSaved} months!</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--accent)">💰 Interest saved</span><span style="font-weight:800;color:var(--accent)">${fmt(amort.interestSaved)}</span></div>
        </div>`:`<div style="font-size:12px;color:#185FA5;opacity:.7">Type an amount then tap Calculate</div>`}
      </div>
      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:800;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Amortization schedule (first 24 months)</div>
        <div style="overflow-x:auto;border-radius:12px;border:1px solid var(--border)">
          <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:380px">
            <thead><tr style="background:var(--faint)">
              <th style="padding:8px;text-align:left;color:var(--muted);font-weight:700">Month</th>
              <th style="padding:8px;text-align:right;color:var(--muted);font-weight:700">Balance</th>
              <th style="padding:8px;text-align:right;color:var(--danger);font-weight:700">Interest</th>
              <th style="padding:8px;text-align:right;color:var(--accent);font-weight:700">Principal</th>
              <th style="padding:8px;text-align:right;color:var(--muted);font-weight:700">Mo.Left</th>
            </tr></thead>
            <tbody>${amort.schedule.map((row,i)=>`<tr style="border-top:1px solid var(--border);background:${i%2===0?'#fff':'var(--faint)'}">
              <td style="padding:7px 8px;font-weight:600">${row.label}</td>
              <td style="padding:7px 8px;text-align:right">${fmt(row.balance)}</td>
              <td style="padding:7px 8px;text-align:right;color:var(--danger)">${fmt(row.interest)}</td>
              <td style="padding:7px 8px;text-align:right;color:var(--accent)">${fmt(row.principal)}</td>
              <td style="padding:7px 8px;text-align:right;color:var(--muted)">${row.monthsLeft}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>`:`<div style="background:var(--faint);border-radius:12px;padding:12px;font-size:13px;color:var(--muted);margin-bottom:12px"><i class="ti ti-info-circle" style="font-size:14px;vertical-align:-2px;margin-right:6px"></i>Edit property and add interest rate + start date for full mortgage breakdown</div>`}
    </div>`;
  },
  setPrepayment(propId,val){this._prepayments[propId]=parseNum(val);this.renderProperties();},
  calcAmortization(p,extraPayment=0){
    const balance=parseNum(p.loan_balance),rate=parseNum(p.interest_rate),payment=parseNum(p.mortgage)+extraPayment;
    if(!balance||!rate||!payment)return null;
    const monthlyRate=rate/100/12,monthlyInterest=balance*monthlyRate,monthlyPrincipal=payment-monthlyInterest;
    if(monthlyPrincipal<=0)return null;
    const basePayment=parseNum(p.mortgage);
    const monthsLeftBase=Math.ceil(Math.log(basePayment/(basePayment-balance*monthlyRate))/Math.log(1+monthlyRate));
    const monthsLeft=Math.ceil(Math.log(payment/(payment-balance*monthlyRate))/Math.log(1+monthlyRate));
    const now=new Date();
    const payoff=new Date(now.getFullYear(),now.getMonth()+monthsLeft,1);
    const payoffDate=payoff.toLocaleString('default',{month:'short',year:'numeric'});
    const totalInterestLeft=Math.max(0,(payment*monthsLeft)-balance);
    const totalInterestBase=Math.max(0,(basePayment*monthsLeftBase)-balance);
    const interestSaved=extraPayment>0?Math.max(0,totalInterestBase-totalInterestLeft):0;
    const monthsSaved=extraPayment>0?Math.max(0,monthsLeftBase-monthsLeft):0;
    const schedule=[];let bal=balance;
    for(let i=0;i<Math.min(24,monthsLeft);i++){
      const d=new Date(now.getFullYear(),now.getMonth()+i,1);
      const label=d.toLocaleString('default',{month:'short',year:'2-digit'});
      const interest=bal*monthlyRate,principal=Math.min(payment-interest,bal),actualPayment=Math.min(payment,bal+interest);
      bal=Math.max(0,bal-principal);
      schedule.push({label,balance:bal+principal,interest,principal,payment:actualPayment,monthsLeft:monthsLeft-i});
    }
    return{monthlyInterest,monthlyPrincipal:payment-monthlyInterest,monthsLeft,payoffDate,totalInterestLeft,interestSaved,monthsSaved,schedule};
  },
  openAddProp(){this.state.editingPropId=null;document.getElementById('prop-sheet-title').textContent='Add property';['prop-name','prop-addr','prop-rent','prop-mortgage','prop-ins','prop-purchase','prop-value','prop-loan','prop-interest','prop-start'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});document.getElementById('prop-status').value='Rented';this.openSheet('propSheet');},
  openEditProp(id){const p=this.state.properties.find(x=>x.id===id);if(!p)return;this.state.editingPropId=id;document.getElementById('prop-sheet-title').textContent='Edit property';document.getElementById('prop-name').value=p.name||'';document.getElementById('prop-addr').value=p.address||'';document.getElementById('prop-status').value=p.status||'Rented';document.getElementById('prop-rent').value=parseNum(p.rent_income)||'';document.getElementById('prop-mortgage').value=parseNum(p.mortgage)||'';document.getElementById('prop-ins').value=parseNum(p.insurance_tax)||'';document.getElementById('prop-purchase').value=parseNum(p.purchase_price)||'';document.getElementById('prop-value').value=parseNum(p.current_value)||'';document.getElementById('prop-loan').value=parseNum(p.loan_balance)||'';document.getElementById('prop-interest').value=p.interest_rate||'';document.getElementById('prop-start').value=p.mortgage_start||'';this.openSheet('propSheet');},
  async saveProp(){
    const data={name:document.getElementById('prop-name').value.trim(),address:document.getElementById('prop-addr').value.trim(),status:document.getElementById('prop-status').value,rent_income:parseNum(document.getElementById('prop-rent').value),mortgage:parseNum(document.getElementById('prop-mortgage').value),insurance_tax:parseNum(document.getElementById('prop-ins').value),purchase_price:parseNum(document.getElementById('prop-purchase').value),current_value:parseNum(document.getElementById('prop-value').value),loan_balance:parseNum(document.getElementById('prop-loan').value),interest_rate:parseFloat(document.getElementById('prop-interest').value)||0,mortgage_start:document.getElementById('prop-start').value||null};
    if(!data.name){this.showToast('Enter property name','error');return;}
    if(this.state.editingPropId){await DB.update('properties',this.state.editingPropId,data);const idx=this.state.properties.findIndex(p=>p.id===this.state.editingPropId);if(idx>=0)this.state.properties[idx]={...this.state.properties[idx],...data};}
    else{const p=await DB.insert('properties',data);this.state.properties.unshift(p);}
    this.closeSheet('propSheet');this.renderProperties();this.renderDashboard();this.showToast(this.state.editingPropId?'Property updated!':'Property added!','success');
  },
  async deleteProp(id){if(!confirm('Delete this property?'))return;this.state.properties=this.state.properties.filter(p=>p.id!==id);await DB.delete('properties',id);this.renderProperties();this.renderDashboard();this.showToast('Property deleted');},
  rolloverHTML(){
    const freeCash=this.getFreeCash();
    const nextGoal=this.state.goals.filter(g=>!g.completed&&g.goal_type!=='lifestyle').sort((a,b)=>parseNum(a.saved)/parseNum(a.target)-parseNum(b.saved)/parseNum(b.target))[0];
    const remaining=nextGoal?Math.max(0,parseNum(nextGoal.target)-parseNum(nextGoal.saved)):0;
    const months=nextGoal&&freeCash>0?Math.ceil(remaining/freeCash):null;
    return`<div class="calc-box" style="margin-bottom:14px"><h4>Next purchase estimate</h4>
      <div class="crow"><span class="cl">Monthly free cash</span><span>${fmt(freeCash)}/mo</span></div>
      ${nextGoal?`<div class="crow"><span class="cl">Target goal</span><span>${nextGoal.title}</span></div><div class="crow"><span class="cl">Target amount</span><span>${fmt(nextGoal.target)}</span></div><div class="crow"><span class="cl">Already saved</span><span style="color:var(--accent)">${fmt(nextGoal.saved)}</span></div><div class="crow"><span class="cl">Months to target</span><span style="color:var(--accent)">~${months||'?'} months</span></div>`:`<div class="crow"><span class="cl">No active savings goals</span><span>—</span></div>`}
    </div>`;
  },

  // REPORTS
  renderReports(){
    const m=this.state.reportMonth,y=this.state.reportYear;
    const monthLabel=new Date(y,m,1).toLocaleString('default',{month:'long',year:'numeric'});
    const expenses=this.state.expenses.filter(e=>{const d=parseDate(e.date||e.created_at);return d.getMonth()===m&&d.getFullYear()===y;});
    const totalExp=expenses.reduce((s,e)=>s+parseNum(e.amount),0);
    const income=this.getTotalIncome(),savings=income-totalExp;
    const byCat={};expenses.forEach(e=>{byCat[e.category]=(byCat[e.category]||0)+parseNum(e.amount);});
    const catList=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
    const colors=['#1D9E75','#E24B4A','#378ADD','#EF9F27','#993556','#534AB7','#3B6D11','#185FA5','#854F0B','#0F6E56','#5DCAA5','#FFD700'];
    const total=catList.reduce((s,[,v])=>s+v,0)||1;
    let cumAngle=0;
    const slices=catList.map(([,val],i)=>{const pct=val/total,angle=pct*360,startAngle=cumAngle;cumAngle+=angle;const x1=50+40*Math.cos((startAngle-90)*Math.PI/180),y1=50+40*Math.sin((startAngle-90)*Math.PI/180),x2=50+40*Math.cos((cumAngle-90)*Math.PI/180),y2=50+40*Math.sin((cumAngle-90)*Math.PI/180),large=angle>180?1:0;return`<path d="M50,50 L${x1},${y1} A40,40 0 ${large},1 ${x2},${y2} Z" fill="${colors[i%colors.length]}" opacity=".9"/>`;}).join('');

    document.getElementById('reports-content').innerHTML=`
      <div style="padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <span style="font-size:17px;font-weight:800">Reports</span>
          <div style="display:flex;align-items:center;gap:6px">
            <button onclick="App.prevReportMonth()" style="background:var(--faint);border:1px solid var(--border);border-radius:8px;padding:5px 10px;cursor:pointer;font-size:16px"><i class="ti ti-chevron-left"></i></button>
            <span style="font-size:13px;font-weight:700;min-width:110px;text-align:center">${monthLabel}</span>
            <button onclick="App.nextReportMonth()" style="background:var(--faint);border:1px solid var(--border);border-radius:8px;padding:5px 10px;cursor:pointer;font-size:16px"><i class="ti ti-chevron-right"></i></button>
          </div>
        </div>
        <div class="cards2" style="margin-bottom:16px">
          <div class="mcard"><div class="lbl">Total income</div><div class="val">${fmtShort(income)}</div></div>
          <div class="mcard"><div class="lbl">Total expenses</div><div class="val" style="color:var(--danger)">${fmtShort(totalExp)}</div></div>
          <div class="mcard"><div class="lbl">Net savings</div><div class="val" style="color:${savings>=0?'var(--accent)':'var(--danger)'}">${fmtShort(savings)}</div></div>
          <div class="mcard"><div class="lbl">Savings rate</div><div class="val">${income>0?Math.round(savings/income*100):0}%</div></div>
        </div>
        ${catList.length>0?`
        <div class="calc-box" style="margin-bottom:14px">
          <h4>Spending by category</h4>
          <div style="display:flex;gap:16px;align-items:center">
            <svg viewBox="0 0 100 100" style="width:100px;height:100px;flex-shrink:0">
              ${slices}
              <circle cx="50" cy="50" r="20" fill="white"/>
              <text x="50" y="52" text-anchor="middle" font-size="8" font-weight="bold" fill="#1a1a1a">${fmtShort(totalExp)}</text>
            </svg>
            <div style="flex:1;min-width:0">${catList.slice(0,7).map(([cat,val],i)=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px"><div style="width:10px;height:10px;border-radius:50%;background:${colors[i%colors.length]};flex-shrink:0"></div><span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat}</span><span style="font-size:12px;font-weight:700">${Math.round(val/total*100)}%</span></div>`).join('')}</div>
          </div>
        </div>
        <div class="calc-box" style="margin-bottom:14px">
          <h4>Category breakdown</h4>
          ${catList.map(([cat,val],i)=>{
            const budget=this.state.budgets.find(b=>b.category===cat);
            const pct=budget?Math.round(val/parseNum(budget.monthly_limit)*100):null;
            return`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
              <div style="width:10px;height:10px;border-radius:50%;background:${colors[i%colors.length]};flex-shrink:0"></div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;justify-content:space-between;font-size:13px"><span>${cat}</span><span style="font-weight:700">${fmt(val)}</span></div>
                ${budget?`<div style="font-size:11px;color:${pct>100?'var(--danger)':'var(--muted)'}">Budget: ${fmt(parseNum(budget.monthly_limit))} · ${pct}%${pct>100?' ⚠ OVER':''}</div><div style="height:4px;background:var(--border);border-radius:2px;margin-top:3px"><div style="height:100%;background:${pct>100?'var(--danger)':'var(--accent)'};border-radius:2px;width:${Math.min(100,pct)}%"></div></div>`:''}
              </div>
            </div>`;
          }).join('')}
        </div>`:''}
        ${this.state.properties.length>0?`
        <div class="calc-box" style="margin-bottom:14px">
          <h4>Property performance</h4>
          ${this.state.properties.map(p=>{
            const cf=parseNum(p.rent_income)-parseNum(p.mortgage)-parseNum(p.insurance_tax);
            const equity=parseNum(p.current_value)-parseNum(p.loan_balance);
            const ltv=parseNum(p.current_value)>0?Math.round(parseNum(p.loan_balance)/parseNum(p.current_value)*100):0;
            const grossYield=parseNum(p.current_value)>0?(parseNum(p.rent_income)*12/parseNum(p.current_value)*100).toFixed(1):0;
            return`<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-bottom:4px"><span>${p.name}</span><span style="color:${cf>=0?'var(--accent)':'var(--danger)'}">${cf>=0?'+':''}${fmt(cf)}/mo</span></div><div style="display:flex;gap:12px;font-size:11px;color:var(--muted)"><span>Equity: ${fmtShort(equity)}</span><span>LTV: ${ltv}%</span><span>Yield: ${grossYield}%</span></div></div>`;
          }).join('')}
        </div>`:''}
        <div style="display:flex;gap:8px">
          <button class="btn-outline" style="flex:1;justify-content:center" onclick="App.exportExpensesCSV()"><i class="ti ti-download" style="font-size:16px"></i> Export CSV</button>
        </div>
      </div>`;
  },
  prevReportMonth(){this.state.reportMonth--;if(this.state.reportMonth<0){this.state.reportMonth=11;this.state.reportYear--;}this.renderReports();},
  nextReportMonth(){this.state.reportMonth++;if(this.state.reportMonth>11){this.state.reportMonth=0;this.state.reportYear++;}this.renderReports();},

  // UTILS
  switchPage(id){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('page-'+id).classList.add('active');
    document.getElementById('nav-'+id).classList.add('active');
    this.state.activePage=id;
    if(id==='goals')setTimeout(()=>{this.animateBars();this.checkConfetti();},250);
    if(id==='reports')this.renderReports();
  },
  animateBars(){document.querySelectorAll('.bar-fill[data-pct]').forEach(el=>{el.style.width=el.dataset.pct+'%';});},
  openSheet(id){document.getElementById(id).classList.add('show');},
  closeSheet(id){document.getElementById(id).classList.remove('show');},
  timeOfDay(){const h=new Date().getHours();return h<12?'morning':h<17?'afternoon':'evening';},
};

document.addEventListener('DOMContentLoaded',()=>App.init());
