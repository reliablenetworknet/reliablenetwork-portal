// ── Reliable Network — App Logic ──

const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

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
function navigate(pageId, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  if (el) el.classList.add('active');
  const titles = { dashboard: 'Dashboard', newload: 'New Load', loads: 'All Loads', dispatch: 'Dispatch Board', drivers: 'Drivers', trucks: 'Trucks', financials: 'Financials', compliance: 'Compliance' };
  document.getElementById('pageTitle').textContent = titles[pageId] || pageId;
  if (pageId === 'dashboard') renderDashboard();
  if (pageId === 'loads') renderLoads();
  if (pageId === 'dispatch') renderDispatch();
  if (pageId === 'drivers') renderDrivers();
  if (pageId === 'trucks') renderTrucks();
  if (pageId === 'financials') renderFinancials();
  if (pageId === 'compliance') renderCompliance();
}

// ── Init ──
function init() {
  const now = new Date();
  document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  populateDriverDropdowns();
  populateTruckDropdown();
  const d = new Date();
  document.getElementById('f-date').value = d.toISOString().split('T')[0];
  const loads = DB.get('loads');
  document.getElementById('f-loadId').value = 'LD-' + String(loads.length + 1).padStart(3, '0');
  renderDashboard();
}

function populateDriverDropdowns() {
  const drivers = DB.get('drivers');
  const sel = document.getElementById('f-driver');
  const filterSel = document.getElementById('filterDriver');
  drivers.forEach(d => {
    const opt = new Option(d.name + ' — ' + d.truck, d.id);
    sel.add(opt.cloneNode(true));
    filterSel.add(new Option(d.name, d.id));
  });
}

function populateTruckDropdown() {
  const trucks = DB.get('trucks');
  const sel = document.getElementById('f-truck');
  trucks.forEach(t => {
    sel.add(new Option(t.id + ' — ' + t.year + ' ' + t.make + ' ' + t.model, t.id));
  });
}

// ── Dashboard ──
function renderDashboard() {
  const loads = DB.get('loads');
  const drivers = DB.get('drivers');
  const now = new Date();
  const thisMonth = loads.filter(l => {
    const d = new Date(l.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const gross = thisMonth.reduce((s, l) => s + Number(l.gross), 0);
  const net = thisMonth.reduce((s, l) => s + Number(l.net9), 0);
  document.getElementById('kpi-drivers').textContent = drivers.filter(d => d.status === 'Active').length;
  document.getElementById('kpi-loads').textContent = thisMonth.length;
  document.getElementById('kpi-gross').textContent = fmtShort(gross);
  document.getElementById('kpi-net').textContent = fmtShort(net);

  const recent = loads.slice(0, 5);
  const list = document.getElementById('recentLoadsList');
  list.innerHTML = recent.map(l => `
    <div class="load-mini-row">
      <span class="load-mini-id">${l.id}</span>
      <span class="load-mini-route">${l.origin} → ${l.dest}</span>
      <span class="load-mini-net">${fmt(l.net9)}</span>
      <span class="badge ${l.status === 'Paid' ? 'paid' : l.status === 'In Transit' ? 'transit' : 'pending'}">${l.status}</span>
    </div>
  `).join('');
}

// ── Load Form ──
function calcLoad() {
  const g = parseFloat(document.getElementById('f-gross').value) || 0;
  document.getElementById('c-gross').textContent = fmt(g);
  document.getElementById('c-12').textContent = fmt(g * 0.12);
  document.getElementById('c-3').textContent = fmt(g * 0.03);
  document.getElementById('c-9').textContent = fmt(g * 0.09);
}

function clearForm() {
  ['f-loadId','f-origin','f-dest','f-broker','f-brokerLoad','f-gross','f-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-driver').value = '';
  document.getElementById('f-truck').value = '';
  document.getElementById('f-status').value = 'Pending';
  calcLoad();
}

function saveLoad() {
  const gross = parseFloat(document.getElementById('f-gross').value);
  const driverSel = document.getElementById('f-driver');
  const driverOpt = driverSel.options[driverSel.selectedIndex];
  const driverName = driverOpt.text.split(' — ')[0];

  if (!document.getElementById('f-loadId').value || !gross || !driverSel.value) {
    alert('Please fill in Load ID, Driver, and Gross Rate.');
    return;
  }

  const load = {
    id: document.getElementById('f-loadId').value,
    date: document.getElementById('f-date').value,
    driverId: driverSel.value,
    driverName: driverName,
    truckId: document.getElementById('f-truck').value,
    origin: document.getElementById('f-origin').value,
    dest: document.getElementById('f-dest').value,
    gross: gross,
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

  const next = 'LD-' + String(loads.length + 1).padStart(3, '0');
  document.getElementById('f-loadId').value = next;
  clearForm();

  // refresh dropdowns
  document.getElementById('filterDriver').innerHTML = '<option value="">All drivers</option>';
  document.getElementById('f-driver').innerHTML = '<option value="">Select driver...</option>';
  populateDriverDropdowns();

  alert('Load ' + load.id + ' saved successfully!');
  navigate('loads', document.querySelector('[data-page="loads"]'));
}

// ── All Loads ──
function renderLoads() {
  const loads = DB.get('loads');
  const driverFilter = document.getElementById('filterDriver').value;
  const statusFilter = document.getElementById('filterStatus').value;

  const filtered = loads.filter(l => {
    if (driverFilter && l.driverId !== driverFilter) return false;
    if (statusFilter && l.status !== statusFilter) return false;
    return true;
  });

  const body = document.getElementById('loadsBody');
  body.innerHTML = filtered.map(l => `
    <tr>
      <td class="mono">${l.id}</td>
      <td>${l.date}</td>
      <td>${l.driverName}</td>
      <td>${l.origin} → ${l.dest}</td>
      <td>${l.broker || '—'}</td>
      <td class="mono">${fmt(l.gross)}</td>
      <td class="mono" style="color:var(--accent)">${fmt(l.pct12)}</td>
      <td class="mono" style="color:var(--amber)">${fmt(l.pct3)}</td>
      <td class="net-val">${fmt(l.net9)}</td>
      <td><span class="badge ${l.status === 'Paid' ? 'paid' : l.status === 'In Transit' ? 'transit' : 'pending'}">${l.status}</span></td>
    </tr>
  `).join('');

  const totGross = filtered.reduce((s, l) => s + Number(l.gross), 0);
  const totNet = filtered.reduce((s, l) => s + Number(l.net9), 0);
  document.getElementById('loadsSummary').innerHTML = `Showing ${filtered.length} loads · Gross: ${fmt(totGross)} · Your net: <strong style="color:var(--green)">${fmt(totNet)}</strong>`;
}

// ── Dispatch ──
function renderDispatch() {
  const drivers = DB.get('drivers');
  const loads = DB.get('loads');
  const grid = document.getElementById('dispatchGrid');

  grid.innerHTML = drivers.map(d => {
    const activeLoad = loads.find(l => l.driverId === d.id && l.status === 'In Transit');
    const initials = d.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    if (activeLoad) {
      return `
        <div class="driver-dispatch-card">
          <div class="dd-avatar">${initials}</div>
          <div class="dd-name">${d.name}</div>
          <div class="dd-truck">${d.truck}</div>
          <span class="badge transit">In transit</span>
          <div style="margin-top:12px">
            <div class="dd-detail">Load: <span>${activeLoad.id}</span></div>
            <div class="dd-detail">Route: <span>${activeLoad.origin} → ${activeLoad.dest}</span></div>
            <div class="dd-detail">Gross: <span>${fmt(activeLoad.gross)}</span></div>
            <div class="dd-detail">Your net: <span style="color:var(--green)">${fmt(activeLoad.net9)}</span></div>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:55%"></div></div>
          <div class="dd-eta">In progress</div>
        </div>`;
    } else {
      return `
        <div class="driver-dispatch-card available">
          <div class="dd-avatar">${initials}</div>
          <div class="dd-name">${d.name}</div>
          <div class="dd-truck">${d.truck}</div>
          <span class="badge active">Available</span>
          <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-200)">
            <div style="font-size:13px;color:var(--gray-400);margin-bottom:10px">Ready for next load</div>
            <button class="btn primary sm" onclick="navigate('newload',document.querySelector('[data-page=newload]'))">Assign load</button>
          </div>
        </div>`;
    }
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
      <td><span class="badge ${d.status === 'Active' ? 'active' : 'expired'}">${d.status}</span></td>
      <td class="mono">${d.cdlExp}</td>
      <td class="mono">${d.truck}</td>
    </tr>
  `).join('');
}

function showAddDriver() {
  const f = document.getElementById('addDriverForm');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

function saveDriver() {
  const drivers = DB.get('drivers');
  const id = 'DRV-' + String(drivers.length + 1).padStart(3, '0');
  drivers.push({
    id,
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
      <td><span class="badge ${t.status === 'Active' ? 'active' : 'expired'}">${t.status}</span></td>
      <td class="mono">${t.nextInspect}</td>
      <td class="mono">${t.insExp}</td>
    </tr>
  `).join('');
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
  const totGross = loads.reduce((s, l) => s + Number(l.gross), 0);
  const tot12 = loads.reduce((s, l) => s + Number(l.pct12), 0);
  const tot3 = loads.reduce((s, l) => s + Number(l.pct3), 0);
  const tot9 = loads.reduce((s, l) => s + Number(l.net9), 0);
  document.getElementById('fin-gross').textContent = fmtShort(totGross);
  document.getElementById('fin-12').textContent = fmtShort(tot12);
  document.getElementById('fin-3').textContent = fmtShort(tot3);
  document.getElementById('fin-9').textContent = fmtShort(tot9);

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const year = new Date().getFullYear();
  const body = document.getElementById('monthlyBody');
  body.innerHTML = months.map((m, i) => {
    const ml = loads.filter(l => { const d = new Date(l.date); return d.getMonth() === i && d.getFullYear() === year; });
    if (!ml.length) return `<tr><td>${m}</td><td style="color:var(--gray-400)">—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
    const g = ml.reduce((s,l) => s+Number(l.gross),0);
    const p12 = ml.reduce((s,l) => s+Number(l.pct12),0);
    const p3 = ml.reduce((s,l) => s+Number(l.pct3),0);
    const n9 = ml.reduce((s,l) => s+Number(l.net9),0);
    return `<tr><td><strong>${m}</strong></td><td>${ml.length}</td><td class="mono">${fmt(g)}</td><td class="mono" style="color:var(--accent)">${fmt(p12)}</td><td class="mono" style="color:var(--amber)">${fmt(p3)}</td><td class="net-val">${fmt(n9)}</td></tr>`;
  }).join('');
}

// ── Compliance ──
function renderCompliance() {
  const drivers = DB.get('drivers');
  const trucks = DB.get('trucks');
  const today = new Date();
  const items = [];

  drivers.forEach(d => {
    [['CDL License', d.cdlExp], ['Medical Card', d.medExp || '']].forEach(([doc, exp]) => {
      if (!exp) return;
      const expDate = new Date(exp);
      const days = Math.ceil((expDate - today) / 86400000);
      items.push({ name: d.name, doc, exp, days });
    });
  });

  trucks.forEach(t => {
    [['Annual Inspection', t.nextInspect], ['Insurance', t.insExp]].forEach(([doc, exp]) => {
      if (!exp) return;
      const expDate = new Date(exp);
      const days = Math.ceil((expDate - today) / 86400000);
      items.push({ name: t.id + ' ' + t.make + ' ' + t.model, doc, exp, days });
    });
  });

  items.sort((a, b) => a.days - b.days);

  const list = document.getElementById('complianceList');
  list.innerHTML = items.map(item => {
    const badgeClass = item.days < 0 ? 'expired' : item.days <= 30 ? 'warning' : 'active';
    const badgeText = item.days < 0 ? 'Expired' : item.days <= 30 ? `${item.days}d left` : 'OK';
    return `
      <div class="compliance-item">
        <div class="comp-left">
          <div class="comp-name">${item.name}</div>
          <div class="comp-doc">${item.doc}</div>
        </div>
        <div class="comp-right">
          <span class="comp-date">${item.exp}</span>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
      </div>`;
  }).join('');
}
