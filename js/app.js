// ── Reliable Network — App Logic ──

const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = n => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pillClass = s => s === 'Paid' ? 'pill-paid' : s === 'In Transit' ? 'pill-transit' : 'pill-pending';

// ── Auth ──
function handleLogin() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  init();
}
function handleLogout() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

// ── Navigation ──
const pageTitles = {
  dashboard: ['Dashboard', 'Welcome back — Reliable Network'],
  newload: ['New Load', 'Log a dispatched load'],
  loads: ['All Loads', 'Full load history'],
  dispatch: ['Dispatch Board', 'Live driver status'],
  drivers: ['Drivers', 'Owner operator registry'],
  trucks: ['Trucks', 'Equipment registry'],
  financials: ['Financials', 'Revenue & commission summary'],
  compliance: ['Compliance', 'Document & expiry tracker'],
};

function navigate(pageId, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  if (el) el.classList.add('active');
  const [title, sub] = pageTitles[pageId] || [pageId, ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSub').textContent = sub;
  const renders = { dashboard: renderDashboard, loads: renderLoads, dispatch: renderDispatch, drivers: renderDrivers, trucks: renderTrucks, financials: renderFinancials, compliance: renderCompliance };
  if (renders[pageId]) renders[pageId]();
}

// ── Init ──
function init() {
  const now = new Date();
  document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  populateDriverDropdowns();
  populateTruckDropdown();
  document.getElementById('f-date').value = now.toISOString().split('T')[0];
  const loads = DB.get('loads');
  document.getElementById('f-loadId').value = 'LD-' + String(loads.length + 1).padStart(3, '0');
  renderDashboard();
}

function populateDriverDropdowns() {
  const drivers = DB.get('drivers');
  const sel = document.getElementById('f-driver');
  const fsel = document.getElementById('filterDriver');
  sel.innerHTML = '<option value="">Select driver...</option>';
  fsel.innerHTML = '<option value="">All drivers</option>';
  drivers.forEach(d => {
    sel.add(new Option(d.name + ' — ' + d.truck, d.id));
    fsel.add(new Option(d.name, d.id));
  });
}

function populateTruckDropdown() {
  const trucks = DB.get('trucks');
  const sel = document.getElementById('f-truck');
  sel.innerHTML = '<option value="">Select truck...</option>';
  trucks.forEach(t => sel.add(new Option(t.id + ' — ' + t.year + ' ' + t.make + ' ' + t.model, t.id)));
}

// ── Dashboard ──
function renderDashboard() {
  const loads = DB.get('loads');
  const drivers = DB.get('drivers');
  const now = new Date();
  const thisMonth = loads.filter(l => { const d = new Date(l.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const gross = thisMonth.reduce((s, l) => s + Number(l.gross), 0);
  const net = thisMonth.reduce((s, l) => s + Number(l.net9), 0);

  document.getElementById('kpi-drivers').textContent = drivers.filter(d => d.status === 'Active').length;
  document.getElementById('kpi-loads').textContent = thisMonth.length;
  document.getElementById('kpi-gross').textContent = fmtK(gross);
  document.getElementById('kpi-net').textContent = fmtK(net);
  document.getElementById('kpi-month').textContent = now.toLocaleString('default', { month: 'long' }) + ' ' + now.getFullYear();

  const list = document.getElementById('recentLoadsList');
  const recent = loads.slice(0, 6);
  if (!recent.length) { list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:13px">No loads logged yet</div>'; return; }
  list.innerHTML = recent.map(l => `
    <div class="load-mini">
      <span class="lm-id">${l.id}</span>
      <span class="lm-route">${l.origin} → ${l.dest}</span>
      <span class="lm-driver">${l.driverName.split(' ')[0]}</span>
      <span class="lm-net">${fmt(l.net9)}</span>
      <span class="pill ${pillClass(l.status)}">${l.status}</span>
    </div>`).join('');
}

// ── New Load ──
function calcLoad() {
  const g = parseFloat(document.getElementById('f-gross').value) || 0;
  document.getElementById('c-gross').textContent = fmt(g);
  document.getElementById('c-12').textContent = fmt(g * 0.12);
  document.getElementById('c-3').textContent = fmt(g * 0.03);
  document.getElementById('c-9').textContent = fmt(g * 0.09);
}

function clearForm() {
  ['f-origin','f-dest','f-broker','f-brokerLoad','f-gross','f-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-driver').value = '';
  document.getElementById('f-truck').value = '';
  document.getElementById('f-status').value = 'Pending';
  calcLoad();
}

function saveLoad() {
  const gross = parseFloat(document.getElementById('f-gross').value);
  const dSel = document.getElementById('f-driver');
  const driverName = dSel.options[dSel.selectedIndex]?.text.split(' — ')[0] || '';
  if (!document.getElementById('f-loadId').value || !gross || !dSel.value) { alert('Please fill in Load ID, Driver, and Gross Rate.'); return; }

  const load = {
    id: document.getElementById('f-loadId').value,
    date: document.getElementById('f-date').value,
    driverId: dSel.value,
    driverName,
    truckId: document.getElementById('f-truck').value,
    origin: document.getElementById('f-origin').value,
    dest: document.getElementById('f-dest').value,
    gross,
    pct12: +(gross * 0.12).toFixed(2),
    pct3: +(gross * 0.03).toFixed(2),
    net9: +(gross * 0.09).toFixed(2),
    broker: document.getElementById('f-broker').value,
    brokerLoad: document.getElementById('f-brokerLoad').value,
    status: document.getElementById('f-status').value,
    notes: document.getElementById('f-notes').value
  };

  const loads = DB.get('loads');
  loads.unshift(load);
  DB.set('loads', loads);
  document.getElementById('f-loadId').value = 'LD-' + String(loads.length + 1).padStart(3, '0');
  clearForm();
  alert('✅ Load ' + load.id + ' saved!');
  navigate('loads', document.querySelector('[data-page="loads"]'));
}

// ── All Loads ──
function renderLoads() {
  const loads = DB.get('loads');
  const df = document.getElementById('filterDriver').value;
  const sf = document.getElementById('filterStatus').value;
  const filtered = loads.filter(l => (!df || l.driverId === df) && (!sf || l.status === sf));

  document.getElementById('loadsBody').innerHTML = filtered.map(l => `
    <tr>
      <td class="mono">${l.id}</td>
      <td>${l.date}</td>
      <td>${l.driverName}</td>
      <td>${l.origin} → ${l.dest}</td>
      <td>${l.broker || '—'}</td>
      <td class="mono">${fmt(l.gross)}</td>
      <td class="mono c-navy">${fmt(l.pct12)}</td>
      <td class="mono c-amber">${fmt(l.pct3)}</td>
      <td class="net-col">${fmt(l.net9)}</td>
      <td><span class="pill ${pillClass(l.status)}">${l.status}</span></td>
    </tr>`).join('');

  const tg = filtered.reduce((s, l) => s + Number(l.gross), 0);
  const tn = filtered.reduce((s, l) => s + Number(l.net9), 0);
  document.getElementById('loadsSummary').innerHTML = `${filtered.length} loads &nbsp;·&nbsp; Gross: ${fmt(tg)} &nbsp;·&nbsp; Your net: <strong style="color:var(--green)">${fmt(tn)}</strong>`;
}

// ── Dispatch ──
function renderDispatch() {
  const drivers = DB.get('drivers');
  const loads = DB.get('loads');
  document.getElementById('dispatchGrid').innerHTML = drivers.map(d => {
    const active = loads.find(l => l.driverId === d.id && l.status === 'In Transit');
    const initials = d.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    if (active) {
      return `<div class="dispatch-card">
        <div class="dc-avatar">${initials}</div>
        <div class="dc-name">${d.name}</div>
        <div class="dc-truck">${d.truck}</div>
        <span class="pill pill-transit">In transit</span>
        <div style="margin-top:12px">
          <div class="dc-detail">Load: <span>${active.id}</span></div>
          <div class="dc-detail">Route: <span>${active.origin} → ${active.dest}</span></div>
          <div class="dc-detail">Gross: <span>${fmt(active.gross)}</span></div>
          <div class="dc-detail">Your net: <span style="color:var(--green)">${fmt(active.net9)}</span></div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:55%"></div></div>
        <div class="dc-eta">In progress</div>
      </div>`;
    }
    return `<div class="dispatch-card available">
      <div class="dc-avatar" style="background:var(--green-light);color:var(--green)">${initials}</div>
      <div class="dc-name">${d.name}</div>
      <div class="dc-truck">${d.truck}</div>
      <span class="pill pill-active">Available</span>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--gray-100)">
        <div style="font-size:13px;color:var(--gray-400);margin-bottom:10px">Ready for next load</div>
        <button class="btn btn-primary btn-sm" onclick="navigate('newload',document.querySelector('[data-page=newload]'))">Assign load</button>
      </div>
    </div>`;
  }).join('');
}

// ── Drivers ──
function renderDrivers() {
  const drivers = DB.get('drivers');
  document.getElementById('driversBody').innerHTML = drivers.map(d => `
    <tr>
      <td class="mono">${d.id}</td>
      <td><strong>${d.name}</strong></td>
      <td>${d.phone}</td>
      <td><span class="pill ${d.status === 'Active' ? 'pill-active' : 'pill-expired'}">${d.status}</span></td>
      <td class="mono">${d.cdlExp}</td>
      <td class="mono">${d.truck}</td>
    </tr>`).join('');
}

function showAddDriver() {
  const f = document.getElementById('addDriverForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

function saveDriver() {
  const drivers = DB.get('drivers');
  drivers.push({
    id: 'DRV-' + String(drivers.length + 1).padStart(3, '0'),
    name: document.getElementById('d-name').value,
    phone: document.getElementById('d-phone').value,
    email: document.getElementById('d-email').value,
    status: 'Active',
    cdl: document.getElementById('d-cdl').value,
    cdlExp: document.getElementById('d-cdlExp').value,
    truck: document.getElementById('d-truck').value,
    leaseStart: new Date().toISOString().split('T')[0]
  });
  DB.set('drivers', drivers);
  document.getElementById('addDriverForm').style.display = 'none';
  populateDriverDropdowns();
  renderDrivers();
}

// ── Trucks ──
function renderTrucks() {
  const trucks = DB.get('trucks');
  document.getElementById('trucksBody').innerHTML = trucks.map(t => `
    <tr>
      <td class="mono">${t.id}</td>
      <td>${t.year}</td>
      <td>${t.make} ${t.model}</td>
      <td class="mono" style="font-size:11px">${t.vin}</td>
      <td><span class="pill ${t.status === 'Active' ? 'pill-active' : 'pill-expired'}">${t.status}</span></td>
      <td class="mono">${t.nextInspect}</td>
      <td class="mono">${t.insExp}</td>
    </tr>`).join('');
}

function showAddTruck() {
  const f = document.getElementById('addTruckForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

function saveTruck() {
  const trucks = DB.get('trucks');
  trucks.push({
    id: document.getElementById('t-id').value,
    year: document.getElementById('t-year').value,
    make: document.getElementById('t-make').value,
    model: document.getElementById('t-model').value,
    vin: document.getElementById('t-vin').value,
    plate: document.getElementById('t-plate').value,
    status: 'Active',
    nextInspect: document.getElementById('t-inspect').value,
    insExp: document.getElementById('t-ins').value
  });
  DB.set('trucks', trucks);
  document.getElementById('addTruckForm').style.display = 'none';
  renderTrucks();
}

// ── Financials ──
function renderFinancials() {
  const loads = DB.get('loads');
  document.getElementById('fin-gross').textContent = fmtK(loads.reduce((s,l) => s+Number(l.gross),0));
  document.getElementById('fin-12').textContent = fmtK(loads.reduce((s,l) => s+Number(l.pct12),0));
  document.getElementById('fin-3').textContent = fmtK(loads.reduce((s,l) => s+Number(l.pct3),0));
  document.getElementById('fin-9').textContent = fmtK(loads.reduce((s,l) => s+Number(l.net9),0));

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const year = new Date().getFullYear();
  document.getElementById('monthlyBody').innerHTML = months.map((m, i) => {
    const ml = loads.filter(l => { const d = new Date(l.date); return d.getMonth() === i && d.getFullYear() === year; });
    if (!ml.length) return `<tr><td>${m}</td><td style="color:var(--gray-300)">—</td><td style="color:var(--gray-300)">—</td><td style="color:var(--gray-300)">—</td><td style="color:var(--gray-300)">—</td><td style="color:var(--gray-300)">—</td></tr>`;
    const g = ml.reduce((s,l)=>s+Number(l.gross),0);
    const p12 = ml.reduce((s,l)=>s+Number(l.pct12),0);
    const p3 = ml.reduce((s,l)=>s+Number(l.pct3),0);
    const n9 = ml.reduce((s,l)=>s+Number(l.net9),0);
    return `<tr><td><strong>${m}</strong></td><td>${ml.length}</td><td class="mono">${fmt(g)}</td><td class="mono c-navy">${fmt(p12)}</td><td class="mono c-amber">${fmt(p3)}</td><td class="net-col">${fmt(n9)}</td></tr>`;
  }).join('');
}

// ── Compliance ──
function renderCompliance() {
  const drivers = DB.get('drivers');
  const trucks = DB.get('trucks');
  const today = new Date();
  const items = [];

  drivers.forEach(d => {
    [['CDL License', d.cdlExp], ['Medical Card', d.medExp||'']].forEach(([doc, exp]) => {
      if (!exp) return;
      const days = Math.ceil((new Date(exp) - today) / 86400000);
      items.push({ name: d.name, doc, exp, days });
    });
  });

  trucks.forEach(t => {
    [['Annual Inspection', t.nextInspect], ['Insurance', t.insExp]].forEach(([doc, exp]) => {
      if (!exp) return;
      const days = Math.ceil((new Date(exp) - today) / 86400000);
      items.push({ name: t.id + ' ' + t.make + ' ' + t.model, doc, exp, days });
    });
  });

  items.sort((a, b) => a.days - b.days);

  document.getElementById('complianceList').innerHTML = items.map(item => {
    const cls = item.days < 0 ? 'pill-expired' : item.days <= 30 ? 'pill-warning' : 'pill-active';
    const txt = item.days < 0 ? 'Expired' : item.days <= 30 ? item.days + 'd left' : 'OK';
    return `<div class="comp-item">
      <div class="comp-left">
        <div class="comp-name">${item.name}</div>
        <div class="comp-doc">${item.doc}</div>
      </div>
      <div class="comp-right">
        <span class="comp-date">${item.exp}</span>
        <span class="pill ${cls}">${txt}</span>
      </div>
    </div>`;
  }).join('');
}
