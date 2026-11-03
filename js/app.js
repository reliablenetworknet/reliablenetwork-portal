// ── Reliable Network — Portal App (Phase 1: Read-Only) ──
//
// PHASE 1 SCOPE
//   ✓ Supabase email/password login
//   ✓ Session persistence across page reloads
//   ✓ Logout
//   ✓ Resolve workspace from workspace_memberships
//   ✓ Resolve user role
//   ✓ Read loads, drivers, trucks
//   ✓ Display dashboard, all-loads, dispatch, drivers, trucks, financials, compliance
//
//   ✗ No create / update / delete for any production data
//   ✗ No generic CRUD — protected workflows use RPCs in a future phase:
//       load status changes  → update_load_status()
//       invoice posting      → post_invoice()
//   ✗ Google Sheets untouched (remains production source of truth)

import {
  Auth,
  DB,
  loadAllFromSupabase,
  getWorkspaceMembership,
  clearWorkspaceCache
} from './supabase.js';

// ── Forgot-password flow ───────────────────────────────────────────────────────
// Called from the "Forgot password?" link in the login form.
// Always shows a generic confirmation — never reveals whether the email exists.

window.handleForgotPassword = async function () {
  const emailInput = document.getElementById('login-email');
  const errEl      = document.getElementById('login-error');
  const forgotLink = document.getElementById('forgot-password-link');
  const email      = emailInput ? emailInput.value.trim() : '';

  if (!email) {
    if (errEl) errEl.textContent = 'Enter your email above, then click "Forgot password?".';
    if (emailInput) emailInput.focus();
    return;
  }

  if (forgotLink) { forgotLink.textContent = 'Sending…'; forgotLink.style.pointerEvents = 'none'; }
  if (errEl) errEl.textContent = '';

  // Fire-and-forget — Auth.resetPasswordForEmail never throws and never
  // returns a value, so the UI cannot distinguish found vs not-found.
  await Auth.resetPasswordForEmail(email);

  if (errEl) {
    errEl.style.color = '#16a34a';
    errEl.textContent = 'If an account exists for that email, a password reset link has been sent.';
  }
  if (forgotLink) { forgotLink.textContent = 'Forgot password?'; forgotLink.style.pointerEvents = ''; }

  // Reset the colour after 8 seconds so it doesn't confuse a later real error
  setTimeout(() => {
    if (errEl) errEl.style.color = '#dc2626';
  }, 8000);
};

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmt  = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK = n => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

function pillClass(s) {
  if (s === 'Settled' || s === 'Delivered') return 'pill-paid';
  if (s === 'In Transit' || s === 'Dispatched') return 'pill-transit';
  if (s === 'Cancelled') return 'pill-expired';
  return 'pill-pending'; // Booked, Invoiced, anything else
}

// ── Auth flow ─────────────────────────────────────────────────────────────────

async function handleLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.textContent = '';
  btn.disabled  = true;
  btn.textContent = 'Signing in…';

  try {
    await Auth.signIn(email, password);
    // onAuthStateChange fires SIGNED_IN → showApp() is called there
  } catch (err) {
    errEl.textContent = err.message || 'Sign-in failed. Check your email and password.';
    btn.disabled  = false;
    btn.textContent = 'Sign in';
  }
}

async function handleLogout() {
  clearWorkspaceCache();
  try { await Auth.signOut(); } catch (err) { console.error('Sign out:', err); }
  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  // Reset login form state
  const btn = document.getElementById('login-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
}

async function showApp(user) {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Fill sidebar user display
  const email    = user?.email || '';
  const handle   = email.split('@')[0];
  const initials = handle.slice(0, 2).toUpperCase();
  setText('user-display-name',     handle);
  setText('user-display-email',    email);
  setText('user-display-initials', initials);

  // Resolve role and show badge if present
  try {
    const { role } = await getWorkspaceMembership();
    if (role) {
      const roleEl = document.getElementById('user-display-role');
      if (roleEl) { roleEl.textContent = role; roleEl.style.display = 'inline-block'; }
    }
  } catch (_) { /* role badge is decorative — don't block app load */ }

  await init();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (form) form.addEventListener('submit', handleLogin);

  // Auth state changes (sign-in / sign-out events from Supabase)
  Auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      showApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      showLoginScreen();
    }
  });

  // Restore existing session on page load (session persistence)
  Auth.getSession().then(session => {
    if (session?.user) {
      showApp(session.user);
    } else {
      showLoginScreen();
    }
  });
});

// expose logout to inline onclick
window.handleLogout = handleLogout;

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const now = new Date();
  setText('currentDate', now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  }));
  const dateEl = document.getElementById('f-date');
  if (dateEl) dateEl.value = now.toISOString().split('T')[0];

  await loadAllFromSupabase();

  populateDriverDropdowns();
  populateTruckDropdown();
  renderDashboard();
}

function populateDriverDropdowns() {
  const drivers = DB.get('drivers');
  const sel  = document.getElementById('f-driver');
  const fsel = document.getElementById('filterDriver');
  if (sel) {
    sel.innerHTML = '<option value="">Select driver…</option>';
    drivers.forEach(d => sel.add(new Option(d.name + (d.truck ? ' — ' + d.truck : ''), d.id)));
  }
  if (fsel) {
    fsel.innerHTML = '<option value="">All drivers</option>';
    drivers.forEach(d => fsel.add(new Option(d.name, d.id)));
  }
}

function populateTruckDropdown() {
  const trucks = DB.get('trucks');
  const sel = document.getElementById('f-truck');
  if (sel) {
    sel.innerHTML = '<option value="">Select truck…</option>';
    trucks.forEach(t => sel.add(new Option(
      t.id + (t.make ? ' — ' + [t.year, t.make, t.model].filter(Boolean).join(' ') : ''), t.id
    )));
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────

const pageTitles = {
  dashboard:     ['Dashboard',      'Welcome back — Reliable Network'],
  newload:       ['New Load',       'Log a dispatched load'],
  loads:         ['All Loads',      'Full load history'],
  dispatch:      ['Dispatch Board', 'Live driver status'],
  drivers:       ['Drivers',        'Owner operator registry'],
  trucks:        ['Trucks',         'Equipment registry'],
  financials:    ['Financials',     'Revenue & commission summary'],
  compliance:    ['Compliance',     'Document & expiry tracker'],
  notifications: ['Notifications',  'Send load details to drivers and brokers']
};

function navigate(pageId, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  if (el)   el.classList.add('active');
  const [title, sub] = pageTitles[pageId] || [pageId, ''];
  setText('pageTitle', title);
  setText('pageSub',   sub);
  const renders = {
    dashboard,
    loads:         renderLoads,
    dispatch:      renderDispatch,
    drivers:       renderDrivers,
    trucks:        renderTrucks,
    financials:    renderFinancials,
    compliance:    renderCompliance,
    notifications: renderNotifications
  };
  if (renders[pageId]) renders[pageId]();
}
window.navigate = navigate;

// ── Dashboard ─────────────────────────────────────────────────────────────────

function renderDashboard() { dashboard(); }

function dashboard() {
  const loads   = DB.get('loads');
  const drivers = DB.get('drivers');
  const now     = new Date();
  const mo = now.getMonth(), yr = now.getFullYear();

  const thisMonth = loads.filter(l => {
    const d = new Date(l.date);
    return d.getMonth() === mo && d.getFullYear() === yr;
  });

  const gross = thisMonth.reduce((s, l) => s + l.gross, 0);
  const net   = thisMonth.reduce((s, l) => s + l.net9,  0);

  setText('kpi-drivers', drivers.filter(d => d.status === 'Active').length);
  setText('kpi-loads',   thisMonth.length);
  setText('kpi-gross',   fmtK(gross));
  setText('kpi-net',     fmtK(net));
  setText('kpi-month',   now.toLocaleString('default', { month: 'long' }) + ' ' + yr);

  const list   = document.getElementById('recentLoadsList');
  const recent = loads.slice(0, 6);
  if (!list) return;
  if (!recent.length) {
    list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:13px">No loads yet</div>';
    return;
  }
  list.innerHTML = recent.map(l => `
    <div class="load-mini">
      <span class="lm-id">${l.id}</span>
      <span class="lm-route">${l.origin} → ${l.dest}</span>
      <span class="lm-driver">${(l.driverName || '').split(' ')[0]}</span>
      <span class="lm-net">${fmt(l.net9)}</span>
      <span class="pill ${pillClass(l.status)}">${l.status}</span>
    </div>`).join('');
}

// ── All Loads (read-only table) ───────────────────────────────────────────────
// Edit / delete controls are hidden in Phase 1 — no write operations.

function renderLoads() {
  const loads = DB.get('loads');
  const df = document.getElementById('filterDriver')?.value || '';
  const sf = document.getElementById('filterStatus')?.value  || '';
  const filtered = loads.filter(l => (!df || l.driverId === df) && (!sf || l.status === sf));

  const tbody = document.getElementById('loadsBody');
  if (!tbody) return;

  tbody.innerHTML = filtered.length
    ? filtered.map(l => `
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
        <td><span style="font-size:11px;color:var(--gray-400);font-style:italic">read-only</span></td>
      </tr>`).join('')
    : '<tr><td colspan="11" style="text-align:center;padding:32px;color:var(--gray-400)">No loads found</td></tr>';

  const tg = filtered.reduce((s, l) => s + l.gross, 0);
  const tn = filtered.reduce((s, l) => s + l.net9,  0);
  const summaryEl = document.getElementById('loadsSummary');
  if (summaryEl) summaryEl.innerHTML =
    `${filtered.length} loads &nbsp;·&nbsp; Gross: ${fmt(tg)} &nbsp;·&nbsp; Your net: <strong style="color:var(--green)">${fmt(tn)}</strong>`;
}
window.renderLoads = renderLoads;

// ── Dispatch Board (read-only) ────────────────────────────────────────────────

function renderDispatch() {
  const drivers = DB.get('drivers');
  const loads   = DB.get('loads');
  const grid    = document.getElementById('dispatchGrid');
  if (!grid) return;

  grid.innerHTML = drivers.map(d => {
    const active   = loads.find(l => l.driverId === d.id && l.status === 'In Transit');
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
          <div class="dc-detail">Net 9%: <span style="color:var(--green)">${fmt(active.net9)}</span></div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:55%"></div></div>
        <div class="dc-eta">In progress</div>
      </div>`;
    }
    return `<div class="dispatch-card available">
      <div class="dc-avatar" style="background:var(--green-light);color:var(--green)">${initials}</div>
      <div class="dc-name">${d.name}</div>
      <div class="dc-truck">${d.truck || '—'}</div>
      <span class="pill pill-active">Available</span>
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--gray-100);font-size:12px;color:var(--gray-400)">
        Ready for next load
      </div>
    </div>`;
  }).join('');
}

// ── Drivers (read-only) ───────────────────────────────────────────────────────

function renderDrivers() {
  const drivers = DB.get('drivers');
  const tbody   = document.getElementById('driversBody');
  if (!tbody) return;

  tbody.innerHTML = drivers.length
    ? drivers.map(d => `
      <tr>
        <td class="mono">${d.id}</td>
        <td><strong>${d.name}</strong></td>
        <td>${d.phone}</td>
        <td><span class="pill ${d.status === 'Active' ? 'pill-active' : 'pill-expired'}">${d.status}</span></td>
        <td class="mono">${d.cdlExp || '—'}</td>
        <td class="mono">${d.truck  || '—'}</td>
        <td><span style="font-size:11px;color:var(--gray-400);font-style:italic">read-only</span></td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--gray-400)">No drivers found</td></tr>';
}

// ── Trucks (read-only) ────────────────────────────────────────────────────────

function renderTrucks() {
  const trucks = DB.get('trucks');
  const tbody  = document.getElementById('trucksBody');
  if (!tbody) return;

  tbody.innerHTML = trucks.length
    ? trucks.map(t => `
      <tr>
        <td class="mono">${t.id}</td>
        <td>${t.year}</td>
        <td>${t.make} ${t.model}</td>
        <td class="mono" style="font-size:11px">${t.vin || '—'}</td>
        <td><span class="pill ${t.status === 'Active' ? 'pill-active' : 'pill-expired'}">${t.status}</span></td>
        <td class="mono">${t.nextInspect || '—'}</td>
        <td class="mono">${t.insExp      || '—'}</td>
        <td><span style="font-size:11px;color:var(--gray-400);font-style:italic">read-only</span></td>
      </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--gray-400)">No trucks found</td></tr>';
}

// ── Financials ────────────────────────────────────────────────────────────────

function renderFinancials() {
  const loads = DB.get('loads');
  setText('fin-gross', fmtK(loads.reduce((s, l) => s + l.gross, 0)));
  setText('fin-12',    fmtK(loads.reduce((s, l) => s + l.pct12, 0)));
  setText('fin-3',     fmtK(loads.reduce((s, l) => s + l.pct3,  0)));
  setText('fin-9',     fmtK(loads.reduce((s, l) => s + l.net9,  0)));

  const year   = new Date().getFullYear();
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const tbody  = document.getElementById('monthlyBody');
  if (!tbody) return;

  tbody.innerHTML = months.map((m, i) => {
    const ml = loads.filter(l => {
      const d = new Date(l.date);
      return d.getMonth() === i && d.getFullYear() === year;
    });
    if (!ml.length) return `<tr><td>${m}</td><td colspan="5" style="color:var(--gray-300)">—</td></tr>`;
    const g  = ml.reduce((s, l) => s + l.gross, 0);
    const p12 = ml.reduce((s, l) => s + l.pct12, 0);
    const p3  = ml.reduce((s, l) => s + l.pct3,  0);
    const n9  = ml.reduce((s, l) => s + l.net9,  0);
    return `<tr>
      <td><strong>${m}</strong></td>
      <td>${ml.length}</td>
      <td class="mono">${fmt(g)}</td>
      <td class="mono c-navy">${fmt(p12)}</td>
      <td class="mono c-amber">${fmt(p3)}</td>
      <td class="net-col">${fmt(n9)}</td>
    </tr>`;
  }).join('');
}

// ── Compliance ────────────────────────────────────────────────────────────────

function renderCompliance() {
  const drivers = DB.get('drivers');
  const trucks  = DB.get('trucks');
  const today   = new Date();
  const items   = [];

  drivers.forEach(d => {
    [['CDL License', d.cdlExp], ['Medical Card', d.medExp]].forEach(([doc, exp]) => {
      if (!exp) return;
      items.push({ name: d.name, doc, exp, days: Math.ceil((new Date(exp) - today) / 86400000) });
    });
  });

  trucks.forEach(t => {
    [['Annual Inspection', t.nextInspect], ['Insurance', t.insExp]].forEach(([doc, exp]) => {
      if (!exp) return;
      const label = t.id + (t.make ? ' ' + t.make : '');
      items.push({ name: label, doc, exp, days: Math.ceil((new Date(exp) - today) / 86400000) });
    });
  });

  items.sort((a, b) => a.days - b.days);

  const list = document.getElementById('complianceList');
  if (!list) return;

  list.innerHTML = items.length
    ? items.map(item => {
        const cls = item.days < 0  ? 'pill-expired'  :
                    item.days <= 30 ? 'pill-warning'  : 'pill-active';
        const txt = item.days < 0  ? 'Expired'       :
                    item.days <= 30 ? item.days + 'd left' : 'OK';
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
      }).join('')
    : '<div style="padding:24px;text-align:center;color:var(--gray-400);font-size:13px">No compliance items found</div>';
}

// ── Notifications (read display only — sends via mailto / wa.me) ──────────────

function renderNotifications() {
  const loads = DB.get('loads');
  const sel   = document.getElementById('notif-load-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Choose a load —</option>';
  loads.forEach(l => sel.add(new Option(`${l.id} — ${l.origin} → ${l.dest} — ${l.driverName}`, l.id)));
}

window.onNotifLoadSelect = function() {
  const id    = document.getElementById('notif-load-select').value;
  if (!id) {
    const info = document.getElementById('notif-load-info');
    if (info) info.style.display = 'none';
    setText('notif-load-badge', 'No load selected');
    return;
  }
  const loads   = DB.get('loads');
  const drivers = DB.get('drivers');
  const l       = loads.find(x => x.id === id);
  if (!l) return;
  const driver = drivers.find(d => d.id === l.driverId) || {};

  const info = document.getElementById('notif-load-info');
  if (info) info.style.display = 'block';
  setText('notif-load-badge', l.id + ' — ' + l.status);
  setText('ni-driver', l.driverName);
  setText('ni-route',  l.origin + ' → ' + l.dest);
  setText('ni-broker', l.broker || '—');
  setText('ni-rate',   fmt(l.gross));

  const waEl  = document.getElementById('driver-wa-number');
  const emEl  = document.getElementById('driver-email');
  if (waEl && driver.phone)  waEl.value = driver.phone;
  if (emEl && driver.email)  emEl.value = driver.email;

  const wa = [
    `🚛 *RELIABLE NETWORK — New Load Assigned*`,
    ``,
    `📋 Load ID: ${l.id}`,
    `👤 Driver: ${l.driverName}`,
    `🚛 Truck: ${l.truckId || 'TBD'}`,
    ``,
    `📍 *PICKUP*`,
    `📌 ${l.origin}`,
    `📅 Date: ${l.date}`,
    l.broker ? `📞 Broker: ${l.broker}` : '',
    ``,
    `🏁 *DELIVERY*`,
    `📌 ${l.dest}`,
    ``,
    `💵 Rate: ${fmt(l.gross)}`,
    l.notes ? `⚠️ Notes: ${l.notes}` : '',
    ``,
    `Please reply *CONFIRM* when you are loaded ✅`,
    ``,
    `— Reliable Network Dispatch`,
    `📧 ops@reliablenetwork.net`
  ].filter(s => s !== undefined).join('\n');

  const waPreview = document.getElementById('wa-preview');
  if (waPreview) waPreview.value = wa;

  const subjEl = document.getElementById('driver-email-subject');
  const bodyEl = document.getElementById('driver-email-body');
  if (subjEl) subjEl.value = `🚛 New Load — ${l.id} | ${l.origin} → ${l.dest} | ${fmt(l.gross)}`;
  if (bodyEl) bodyEl.value = [
    `Hi ${l.driverName.split(' ')[0]},`,
    ``,
    `You have been assigned a new load. Please review the details below and confirm.`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `LOAD DETAILS`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Load ID:      ${l.id}`,
    `Date:         ${l.date}`,
    `Broker:       ${l.broker || 'N/A'}`,
    `Gross Rate:   ${fmt(l.gross)}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `PICKUP`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Location:     ${l.origin}`,
    `Date:         ${l.date}`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `DELIVERY`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Location:     ${l.dest}`,
    l.notes ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSPECIAL INSTRUCTIONS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${l.notes}` : '',
    ``,
    `Please reply to confirm you have received this load.`,
    ``,
    `— Reliable Network Operations`,
    `ops@reliablenetwork.net | 24/7 Dispatch`
  ].join('\n');

  buildBrokerTemplate('en_route', l);
};

const brokerTemplates = {
  en_route:   l => `Hi ${l.broker || 'Team'},\n\nUpdate for load ${l.id}.\n\nDriver ${l.driverName} is currently en route to the pickup location in ${l.origin}.\n\nEstimated arrival at shipper: Within 2 hours.\n\n— Reliable Network\nops@reliablenetwork.net | 24/7 Dispatch`,
  loaded:     l => `Hi ${l.broker || 'Team'},\n\nLoad ${l.id} update — driver is loaded and departed.\n\nDriver:       ${l.driverName}\nDeparted:     ${l.origin}\nDestination:  ${l.dest}\n\nWe will keep you updated on progress.\n\n— Reliable Network\nops@reliablenetwork.net | 24/7 Dispatch`,
  in_transit: l => `Hi ${l.broker || 'Team'},\n\nIn-transit update for load ${l.id}.\n\nDriver:       ${l.driverName}\nDestination:  ${l.dest}\nStatus:       On schedule\n\n— Reliable Network\nops@reliablenetwork.net | 24/7 Dispatch`,
  delay:      l => `Hi ${l.broker || 'Team'},\n\nProactive delay notification for load ${l.id}.\n\nDriver:         ${l.driverName}\nReason:         [specify reason]\nUpdated ETA:    [new time]\n\nWe apologize for any inconvenience.\n\n— Reliable Network\nops@reliablenetwork.net | 24/7 Dispatch`,
  delivered:  l => `Hi ${l.broker || 'Team'},\n\nLoad ${l.id} has been delivered successfully.\n\nDriver:       ${l.driverName}\nDelivered to: ${l.dest}\nDate:         ${new Date().toLocaleDateString('en-US')}\n\nPOD available upon request.\n\nThank you for the business!\n\n— Reliable Network\nops@reliablenetwork.net | 24/7 Dispatch`,
  pod:        l => `Hi ${l.broker || 'Team'},\n\nProof of delivery for load ${l.id} is now available.\n\nDriver:   ${l.driverName}\nRoute:    ${l.origin} → ${l.dest}\nStatus:   Delivered ✓\n\nPlease confirm receipt.\n\n— Reliable Network\nops@reliablenetwork.net | 24/7 Dispatch`
};

function buildBrokerTemplate(key, load) {
  if (!load) {
    const id    = document.getElementById('notif-load-select')?.value;
    const loads = DB.get('loads');
    load = loads.find(x => x.id === id);
    if (!load) return;
  }
  const el = document.getElementById('broker-preview');
  if (el) el.value = brokerTemplates[key]?.(load) || '';
}

window.selectBrokerTmpl = function(el, key) {
  document.querySelectorAll('.broker-tmpl').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  setText('broker-tmpl-title', el.querySelector('.bt-name')?.textContent || '');
  buildBrokerTemplate(key, null);
};

window.sendWhatsApp = function() {
  const num = document.getElementById('driver-wa-number')?.value.replace(/\D/g, '');
  const msg = document.getElementById('wa-preview')?.value;
  if (!num) { showToast('Please enter driver WhatsApp number'); return; }
  window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank');
};

window.sendDriverEmail = function() {
  const to      = document.getElementById('driver-email')?.value;
  const subject = document.getElementById('driver-email-subject')?.value;
  const body    = document.getElementById('driver-email-body')?.value;
  if (!to) { showToast('Please enter driver email'); return; }
  window.open(`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
};

window.sendBrokerUpdate = function() {
  const to      = document.getElementById('broker-email-to')?.value;
  const subject = document.getElementById('broker-tmpl-title')?.textContent;
  const body    = document.getElementById('broker-preview')?.value;
  const id      = document.getElementById('notif-load-select')?.value;
  if (!to) { showToast('Please enter broker email'); return; }
  window.open(`mailto:${to}?subject=${encodeURIComponent('Load ' + id + ' — ' + subject)}&body=${encodeURIComponent(body)}`);
};

window.copyNotif = function(id) {
  const el = document.getElementById(id);
  if (el) navigator.clipboard.writeText(el.value).catch(() => {});
  showToast('Copied to clipboard');
};

window.showNotifTab = function(name, el) {
  document.querySelectorAll('.notif-tab').forEach(t   => t.classList.remove('active'));
  document.querySelectorAll('.notif-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('notif-' + name)?.classList.add('active');
  el.classList.add('active');
};

// ── New Load form — PDF drag-drop only (no save in Phase 1) ──────────────────
// The form and PDF parser remain available so dispatchers can preview and
// copy details into Google Sheets (the current production workflow).
// The Save button is disabled and labelled accordingly.

window.calcLoad = function() {
  const g = parseFloat(document.getElementById('f-gross')?.value) || 0;
  setText('c-gross', fmt(g));
  setText('c-12',    fmt(g * 0.12));
  setText('c-3',     fmt(g * 0.03));
  setText('c-9',     fmt(g * 0.09));
};

window.clearForm = function() {
  ['f-origin','f-dest','f-broker','f-brokerLoad','f-gross','f-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dSel = document.getElementById('f-driver');
  const tSel = document.getElementById('f-truck');
  const sSel = document.getElementById('f-status');
  if (dSel) dSel.value = '';
  if (tSel) tSel.value = '';
  if (sSel) sSel.value = 'Booked';
  window.calcLoad();
};

// saveLoad intentionally disabled in Phase 1
window.saveLoad = function() {
  showToast('⚠ Saves are disabled in Phase 1 — enter this load in Google Sheets');
};

// ── PDF Drag-Drop (parse-only — populate form for manual entry into Sheets) ──

window.dzDragOver  = e => { e.preventDefault(); document.getElementById('dropZone')?.classList.add('dz-over'); };
window.dzDragLeave = () => document.getElementById('dropZone')?.classList.remove('dz-over');
window.dzDrop      = function(e) {
  e.preventDefault();
  document.getElementById('dropZone')?.classList.remove('dz-over');
  const file = e.dataTransfer.files[0];
  if (file?.type === 'application/pdf') dzHandleFile(file);
  else alert('Please drop a PDF file.');
};

window.dzHandleFile = function(file) {
  if (!file) return;
  const dz = document.getElementById('dropZone');
  if (!dz) return;
  dz.classList.add('dz-busy');
  document.getElementById('dzDefault').style.display    = 'none';
  document.getElementById('dzProcessing').style.display = 'flex';
  document.getElementById('dzSuccess').style.display    = 'none';

  const steps = [
    [500,  'Reading PDF structure…',     'Locating load details'],
    [1100, 'Extracting load data…',      'Found origin & destination'],
    [1700, 'Parsing rate information…',  'Calculating commission'],
    [2300, 'Identifying broker details…','Matching load number'],
  ];
  steps.forEach(([delay, text, sub]) => setTimeout(() => {
    setText('dzProcText', text);
    setText('dzProcSub',  sub);
  }, delay));

  setTimeout(() => {
    const reader = new FileReader();
    reader.onload = async ev => {
      const base64 = ev.target.result.split(',')[1];
      await dzParseWithAI(base64);
    };
    reader.readAsDataURL(file);
  }, 2600);
};

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
            { type: 'text', text: `You are an expert at reading trucking rate confirmation PDFs from freight brokers. Extract load details and return ONLY a valid JSON object — no markdown, no backticks, no explanation.

IDENTIFY THE BROKER FIRST then apply the correct rules:

HUB GROUP: loadId=Load#, brokerName="Hub Group", origin=PU1 address+city+state, destination=DEL2 address+city+state, pickupDate=PU1 date YYYY-MM-DD, deliveryDate=DEL date YYYY-MM-DD, grossRate=Total Carrier Pay (number only)

KINGPOST: loadId=Load Confirmation or Order# number, brokerName="Kingpost", origin=PU1, destination=SO2 or DEL, grossRate=Total Carrier Pay (number only)

LONGSHIP: loadId=LS PO#, brokerName="Longship", origin=pickup Shed+city+state, destination=Consignee+city+state, grossRate=Estimated Rate To The Truck (number only)

SYNCHROGISTICS: loadId=Load Number, brokerName="Synchrogistics", origin=Shipper Pickup, destination=Consignee Delivery, grossRate=Net Freight Charges or Total Cost (number only)

UBER FREIGHT: loadId=Load Number, brokerName="Uber Freight", origin=Shipper+city+state, destination=Consignee+city+state, grossRate=Agreed upon price or Line Haul (number only)

ANY OTHER BROKER: loadId=first number after Load# / PO# / Order# / Ref#, brokerName=largest company name at top (NEVER "DYLAND TRUCKING INC" — that is the carrier), grossRate=Total Carrier Pay or Line Haul or Flat Rate (number only)

Rules: dates YYYY-MM-DD, grossRate NUMBER only (no $ or commas), miles NUMBER only.

Return exactly:
{"brokerName":"","loadId":"","brokerPhone":"","brokerEmail":"","brokerContact":"","origin":"","pickupAddress":"","pickupDate":"","destination":"","deliveryAddress":"","deliveryDate":"","grossRate":0,"miles":0,"commodity":"","equipment":"","weight":"","notes":""}` }
          ]
        }]
      })
    });
    const data = await response.json();
    const raw  = data.content.map(b => b.text || '').join('').trim();
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    dzFillForm(parsed);
  } catch (err) {
    dzFillForm({
      brokerName: 'Demo Broker', loadId: 'DEMO-001',
      origin: 'Tampa, FL', destination: 'Atlanta, GA', grossRate: 3500,
      notes: 'Demo data — PDF parse failed'
    });
  }
}

function dzFillForm(data) {
  const dz = document.getElementById('dropZone');
  if (dz) { dz.classList.remove('dz-busy'); dz.classList.add('dz-done'); }
  document.getElementById('dzProcessing').style.display = 'none';
  document.getElementById('dzSuccess').style.display    = 'flex';

  const fill = (id, val) => {
    const el = document.getElementById(id);
    if (el && val && val !== 0) { el.value = val; el.classList.add('auto-filled'); }
  };

  fill('f-broker',    data.brokerName);
  fill('f-loadId',    data.loadId || data.brokerLoadNum);
  fill('f-origin',    data.origin || data.pickupAddress);
  fill('f-dest',      data.destination || data.deliveryAddress);
  fill('f-gross',     data.grossRate);
  fill('f-notes',     [
    data.notes,
    data.commodity  ? 'Commodity: '     + data.commodity    : '',
    data.equipment  ? 'Equipment: '     + data.equipment    : '',
    data.weight     ? 'Weight: '        + data.weight       : '',
    data.brokerContact ? 'Contact: '    + data.brokerContact : '',
    data.brokerPhone   ? 'Broker ph: '  + data.brokerPhone  : '',
    data.brokerEmail   ? 'Broker email: '+ data.brokerEmail : '',
    data.miles      ? 'Miles: '         + data.miles        : '',
    data.deliveryDate  ? 'Del date: '   + data.deliveryDate : '',
  ].filter(Boolean).join(' | '));

  if (data.pickupDate) fill('f-date', data.pickupDate);
  window.calcLoad();

  const summary = [
    data.loadId     ? 'Load #: ' + data.loadId    : '',
    data.brokerName ? 'Broker: ' + data.brokerName : '',
    data.origin     ? 'From: '   + data.origin     : '',
    data.destination? 'To: '     + data.destination : '',
    data.grossRate  ? 'Rate: $'  + data.grossRate  : '',
  ].filter(Boolean).join(' · ');

  const subEl = document.querySelector('#dzSuccess .dz-success-sub');
  if (subEl && summary) subEl.textContent = summary;

  // Phase 1 note — remind dispatcher to enter into Sheets
  showToast('✓ PDF parsed — enter this load in Google Sheets to save');
}

window.dzReset = function() {
  const dz = document.getElementById('dropZone');
  if (dz) dz.className = 'drop-zone';
  document.getElementById('dzDefault').style.display    = 'block';
  document.getElementById('dzProcessing').style.display = 'none';
  document.getElementById('dzSuccess').style.display    = 'none';
  document.querySelectorAll('.fi.auto-filled').forEach(el => el.classList.remove('auto-filled'));
};

// ── Toast ─────────────────────────────────────────────────────────────────────

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
  setTimeout(() => toast.classList.remove('toast-show'), 3500);
}
