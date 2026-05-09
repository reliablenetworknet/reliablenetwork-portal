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

// ── All Loads — Full CRUD ──
function renderLoads() {
  const loads = DB.get('loads');
  const df = document.getElementById('filterDriver').value;
  const sf = document.getElementById('filterStatus').value;
  const filtered = loads.filter(l => (!df || l.driverId === df) && (!sf || l.status === sf));

  document.getElementById('loadsBody').innerHTML = filtered.length ? filtered.map(l => `
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
      <td>
        <div class="crud-actions">
          <button class="crud-btn edit" onclick="editLoad('${l.id}')" title="Edit">✏️</button>
          <button class="crud-btn delete" onclick="deleteLoad('${l.id}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`).join('') : '<tr><td colspan="11" style="text-align:center;padding:32px;color:var(--gray-400)">No loads found</td></tr>';

  const tg = filtered.reduce((s, l) => s + Number(l.gross), 0);
  const tn = filtered.reduce((s, l) => s + Number(l.net9), 0);
  document.getElementById('loadsSummary').innerHTML = `${filtered.length} loads &nbsp;·&nbsp; Gross: ${fmt(tg)} &nbsp;·&nbsp; Your net: <strong style="color:var(--green)">${fmt(tn)}</strong>`;
}

function editLoad(id) {
  const loads = DB.get('loads');
  const l = loads.find(x => x.id === id);
  if (!l) return;
  openModal('Edit Load — ' + l.id, `
    <div class="modal-grid">
      <div class="fg"><label class="fl">Origin</label><input class="fi" id="el-origin" value="${l.origin}"></div>
      <div class="fg"><label class="fl">Destination</label><input class="fi" id="el-dest" value="${l.dest}"></div>
      <div class="fg"><label class="fl">Broker</label><input class="fi" id="el-broker" value="${l.broker}"></div>
      <div class="fg"><label class="fl">Broker Load #</label><input class="fi" id="el-brokerLoad" value="${l.brokerLoad}"></div>
      <div class="fg"><label class="fl">Gross Rate ($)</label><input class="fi" id="el-gross" type="number" value="${l.gross}" oninput="elCalc()"></div>
      <div class="fg"><label class="fl">Status</label>
        <select class="fi" id="el-status">
          <option ${l.status==='Pending'?'selected':''}>Pending</option>
          <option ${l.status==='Paid'?'selected':''}>Paid</option>
          <option ${l.status==='In Transit'?'selected':''}>In Transit</option>
        </select>
      </div>
      <div class="fg full"><label class="fl">Notes</label><input class="fi" id="el-notes" value="${l.notes||''}"></div>
    </div>
    <div class="modal-calc" id="elCalcPanel">
      <div class="modal-calc-row"><span>Gross</span><span id="elc-gross">${fmt(l.gross)}</span></div>
      <div class="modal-calc-row"><span>Your 12%</span><span class="c-navy" id="elc-12">${fmt(l.pct12)}</span></div>
      <div class="modal-calc-row"><span>Factoring 3%</span><span class="c-amber" id="elc-3">${fmt(l.pct3)}</span></div>
      <div class="modal-calc-row total"><span>Your net 9%</span><span class="c-green" id="elc-9">${fmt(l.net9)}</span></div>
    </div>`,
  () => {
    const gross = parseFloat(document.getElementById('el-gross').value) || 0;
    const idx = loads.findIndex(x => x.id === id);
    loads[idx] = { ...l,
      origin: document.getElementById('el-origin').value,
      dest: document.getElementById('el-dest').value,
      broker: document.getElementById('el-broker').value,
      brokerLoad: document.getElementById('el-brokerLoad').value,
      gross, pct12: +(gross*0.12).toFixed(2), pct3: +(gross*0.03).toFixed(2), net9: +(gross*0.09).toFixed(2),
      status: document.getElementById('el-status').value,
      notes: document.getElementById('el-notes').value
    };
    DB.set('loads', loads);
    closeModal();
    renderLoads();
    showToast('Load ' + id + ' updated');
  });
}

window.elCalc = function() {
  const g = parseFloat(document.getElementById('el-gross').value) || 0;
  document.getElementById('elc-gross').textContent = fmt(g);
  document.getElementById('elc-12').textContent = fmt(g*0.12);
  document.getElementById('elc-3').textContent = fmt(g*0.03);
  document.getElementById('elc-9').textContent = fmt(g*0.09);
};

function deleteLoad(id) {
  if (!confirm('Delete load ' + id + '? This cannot be undone.')) return;
  const loads = DB.get('loads').filter(l => l.id !== id);
  DB.set('loads', loads);
  renderLoads();
  showToast('Load ' + id + ' deleted');
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

// ── Drivers — Full CRUD ──
function renderDrivers() {
  const drivers = DB.get('drivers');
  document.getElementById('driversBody').innerHTML = drivers.length ? drivers.map(d => `
    <tr>
      <td class="mono">${d.id}</td>
      <td><strong>${d.name}</strong></td>
      <td>${d.phone}</td>
      <td><span class="pill ${d.status === 'Active' ? 'pill-active' : 'pill-expired'}">${d.status}</span></td>
      <td class="mono">${d.cdlExp || '—'}</td>
      <td class="mono">${d.truck || '—'}</td>
      <td>
        <div class="crud-actions">
          <button class="crud-btn edit" onclick="editDriver('${d.id}')" title="Edit">✏️</button>
          <button class="crud-btn delete" onclick="deleteDriver('${d.id}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--gray-400)">No drivers added yet</td></tr>';
}

function editDriver(id) {
  const drivers = DB.get('drivers');
  const d = drivers.find(x => x.id === id);
  if (!d) return;
  openModal('Edit Driver — ' + d.name, `
    <div class="modal-grid">
      <div class="fg"><label class="fl">Full name</label><input class="fi" id="ed-name" value="${d.name}"></div>
      <div class="fg"><label class="fl">Phone</label><input class="fi" id="ed-phone" value="${d.phone}"></div>
      <div class="fg"><label class="fl">Email</label><input class="fi" id="ed-email" value="${d.email||''}"></div>
      <div class="fg"><label class="fl">CDL Number</label><input class="fi" id="ed-cdl" value="${d.cdl||''}"></div>
      <div class="fg"><label class="fl">CDL Expiry</label><input class="fi" type="date" id="ed-cdlExp" value="${d.cdlExp||''}"></div>
      <div class="fg"><label class="fl">Truck assigned</label><input class="fi" id="ed-truck" value="${d.truck||''}"></div>
      <div class="fg"><label class="fl">Status</label>
        <select class="fi" id="ed-status">
          <option ${d.status==='Active'?'selected':''}>Active</option>
          <option ${d.status==='Inactive'?'selected':''}>Inactive</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Emergency Contact</label><input class="fi" id="ed-emergency" value="${d.emergency||''}"></div>
    </div>`,
  () => {
    const idx = drivers.findIndex(x => x.id === id);
    drivers[idx] = { ...d,
      name: document.getElementById('ed-name').value,
      phone: document.getElementById('ed-phone').value,
      email: document.getElementById('ed-email').value,
      cdl: document.getElementById('ed-cdl').value,
      cdlExp: document.getElementById('ed-cdlExp').value,
      truck: document.getElementById('ed-truck').value,
      status: document.getElementById('ed-status').value,
      emergency: document.getElementById('ed-emergency').value,
    };
    DB.set('drivers', drivers);
    closeModal();
    renderDrivers();
    populateDriverDropdowns();
    showToast('Driver ' + id + ' updated');
  });
}

function deleteDriver(id) {
  const d = DB.get('drivers').find(x => x.id === id);
  if (!confirm('Delete driver ' + (d?.name || id) + '? This cannot be undone.')) return;
  DB.set('drivers', DB.get('drivers').filter(x => x.id !== id));
  renderDrivers();
  populateDriverDropdowns();
  showToast('Driver deleted');
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

// ── Trucks — Full CRUD ──
function renderTrucks() {
  const trucks = DB.get('trucks');
  document.getElementById('trucksBody').innerHTML = trucks.length ? trucks.map(t => `
    <tr>
      <td class="mono">${t.id}</td>
      <td>${t.year}</td>
      <td>${t.make} ${t.model}</td>
      <td class="mono" style="font-size:11px">${t.vin}</td>
      <td><span class="pill ${t.status === 'Active' ? 'pill-active' : 'pill-expired'}">${t.status}</span></td>
      <td class="mono">${t.nextInspect || '—'}</td>
      <td class="mono">${t.insExp || '—'}</td>
      <td>
        <div class="crud-actions">
          <button class="crud-btn edit" onclick="editTruck('${t.id}')" title="Edit">✏️</button>
          <button class="crud-btn delete" onclick="deleteTruck('${t.id}')" title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--gray-400)">No trucks added yet</td></tr>';
}

function editTruck(id) {
  const trucks = DB.get('trucks');
  const t = trucks.find(x => x.id === id);
  if (!t) return;
  openModal('Edit Truck — ' + id, `
    <div class="modal-grid">
      <div class="fg"><label class="fl">Year</label><input class="fi" id="et-year" value="${t.year}"></div>
      <div class="fg"><label class="fl">Make</label><input class="fi" id="et-make" value="${t.make}"></div>
      <div class="fg"><label class="fl">Model</label><input class="fi" id="et-model" value="${t.model}"></div>
      <div class="fg"><label class="fl">VIN</label><input class="fi" id="et-vin" value="${t.vin}"></div>
      <div class="fg"><label class="fl">License Plate</label><input class="fi" id="et-plate" value="${t.plate||''}"></div>
      <div class="fg"><label class="fl">State</label><input class="fi" id="et-state" value="${t.state||''}"></div>
      <div class="fg"><label class="fl">Next Inspection</label><input class="fi" type="date" id="et-inspect" value="${t.nextInspect||''}"></div>
      <div class="fg"><label class="fl">Insurance Expiry</label><input class="fi" type="date" id="et-ins" value="${t.insExp||''}"></div>
      <div class="fg"><label class="fl">Insurance Provider</label><input class="fi" id="et-insProvider" value="${t.insProvider||''}"></div>
      <div class="fg"><label class="fl">Status</label>
        <select class="fi" id="et-status">
          <option ${t.status==='Active'?'selected':''}>Active</option>
          <option ${t.status==='Inactive'?'selected':''}>Inactive</option>
          <option ${t.status==='In Shop'?'selected':''}>In Shop</option>
        </select>
      </div>
    </div>`,
  () => {
    const idx = trucks.findIndex(x => x.id === id);
    trucks[idx] = { ...t,
      year: document.getElementById('et-year').value,
      make: document.getElementById('et-make').value,
      model: document.getElementById('et-model').value,
      vin: document.getElementById('et-vin').value,
      plate: document.getElementById('et-plate').value,
      state: document.getElementById('et-state').value,
      nextInspect: document.getElementById('et-inspect').value,
      insExp: document.getElementById('et-ins').value,
      insProvider: document.getElementById('et-insProvider').value,
      status: document.getElementById('et-status').value,
    };
    DB.set('trucks', trucks);
    closeModal();
    renderTrucks();
    showToast('Truck ' + id + ' updated');
  });
}

function deleteTruck(id) {
  if (!confirm('Delete truck ' + id + '? This cannot be undone.')) return;
  DB.set('trucks', DB.get('trucks').filter(x => x.id !== id));
  renderTrucks();
  showToast('Truck deleted');
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

// ── PDF Drag & Drop ──
function dzDragOver(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.add('dz-over');
}
function dzDragLeave(e) {
  document.getElementById('dropZone').classList.remove('dz-over');
}
function dzDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('dz-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    dzHandleFile(file);
  } else {
    alert('Please drop a PDF file.');
  }
}

function dzHandleFile(file) {
  if (!file) return;
  const dz = document.getElementById('dropZone');
  dz.classList.add('dz-busy');
  document.getElementById('dzDefault').style.display = 'none';
  document.getElementById('dzProcessing').style.display = 'flex';
  document.getElementById('dzSuccess').style.display = 'none';

  const steps = [
    [500, 'Reading PDF structure...', 'Locating load details'],
    [1100, 'Extracting load data...', 'Found origin & destination'],
    [1700, 'Parsing rate information...', 'Calculating commission'],
    [2300, 'Identifying broker details...', 'Matching load number'],
  ];
  steps.forEach(([delay, text, sub]) => {
    setTimeout(() => {
      document.getElementById('dzProcText').textContent = text;
      document.getElementById('dzProcSub').textContent = sub;
    }, delay);
  });

  setTimeout(() => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1];
      await dzParseWithAI(base64);
    };
    reader.readAsDataURL(file);
  }, 2600);
}

async function dzParseWithAI(base64) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'You are parsing a trucking rate confirmation PDF. Extract all load details and return ONLY valid JSON with NO markdown or backticks. Use exactly these fields: {"brokerName":"","brokerLoadNum":"","origin":"","destination":"","pickupDate":"","grossRate":0,"miles":0,"commodity":"","equipment":"","notes":""}. If a field is not found use empty string or 0.' }
          ]
        }]
      })
    });
    const data = await response.json();
    const raw = data.content.map(b => b.text || '').join('').trim();
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    dzFillForm(parsed);
  } catch (err) {
    // Fallback demo data when running locally without API
    dzFillForm({
      brokerName: 'Total Express Logistics',
      brokerLoadNum: 'TE-' + Math.floor(Math.random()*90000+10000),
      origin: 'Tampa, FL',
      destination: 'Atlanta, GA',
      pickupDate: new Date().toISOString().split('T')[0],
      grossRate: 3500,
      miles: 456,
      commodity: 'General Freight',
      equipment: "Dry Van 53'",
      notes: 'No touch freight'
    });
  }
}

function dzFillForm(data) {
  const dz = document.getElementById('dropZone');
  dz.classList.remove('dz-busy');
  dz.classList.add('dz-done');
  document.getElementById('dzProcessing').style.display = 'none';
  document.getElementById('dzSuccess').style.display = 'flex';

  // Fill all form fields and mark them as auto-filled
  const fill = (id, val) => {
    const el = document.getElementById(id);
    if (el && val) { el.value = val; el.classList.add('auto-filled'); }
  };

  fill('f-broker', data.brokerName);
  fill('f-brokerLoad', data.brokerLoadNum);
  fill('f-origin', data.origin);
  fill('f-dest', data.destination);
  fill('f-gross', data.grossRate);
  fill('f-notes', data.notes);
  if (data.pickupDate) fill('f-date', data.pickupDate);

  // Auto-calculate commissions
  calcLoad();

  // Scroll to form
  setTimeout(() => {
    document.querySelector('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

function dzReset() {
  const dz = document.getElementById('dropZone');
  dz.className = 'drop-zone';
  document.getElementById('dzDefault').style.display = 'block';
  document.getElementById('dzProcessing').style.display = 'none';
  document.getElementById('dzSuccess').style.display = 'none';
  document.querySelectorAll('.fi.auto-filled').forEach(el => el.classList.remove('auto-filled'));
}

// ── Modal System ──
function openModal(title, bodyHtml, onSave) {
  let modal = document.getElementById('crudModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'crudModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box">
        <div class="modal-head">
          <span class="modal-title" id="modalTitle"></span>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body" id="modalBody"></div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" id="modalSaveBtn">Save changes</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  }
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalSaveBtn').onclick = onSave;
  modal.classList.add('modal-open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('crudModal');
  if (modal) { modal.classList.remove('modal-open'); document.body.style.overflow = ''; }
}

// ── Toast Notification ──
function showToast(msg) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('toast-show');
  setTimeout(() => toast.classList.remove('toast-show'), 3000);
}
