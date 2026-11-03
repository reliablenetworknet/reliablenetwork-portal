// ── Reliable Network — Supabase Layer (Phase 1: Read-Only) ──
//
// PHASE 1 SCOPE — this file intentionally does NOT export:
//   save / insert / update / delete helpers for loads, drivers, trucks
//   loadToSupabase / driverToSupabase / truckToSupabase
//
// Protected write workflows reserved for future phases:
//   Load status changes  → update_load_status() RPC
//   Invoice posting      → post_invoice() RPC
//   Settlement           → settle_load() RPC
//
// Google Sheets remains the production source of truth during Phase 1.
// This layer adds: Auth, session persistence, workspace resolution,
// role resolution, and read-only data display via Supabase.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://zsehstwtqbsmrsailgrn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HFPEGYZT1JVttUmOe0_T1Q_Er3kdQt4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const Auth = {
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Returns the Supabase Session object (includes .user) or null
  getSession: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  // Send a password recovery email.
  // redirectTo must be the full production URL of reset-password.html.
  // Always resolves — never throws — so the caller can show a generic
  // "if an account exists, a link has been sent" message without leaking
  // whether the email address exists in the system.
  resetPasswordForEmail: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://reliablenetwork.net/reset-password.html'
    });
    // Log the error internally for debugging, but do not surface it to the
    // caller — callers must always show a generic confirmation message.
    if (error) {
      console.warn('[RN] resetPasswordForEmail error (not exposed to UI):', error.status, error.message);
    }
    // Intentionally returns void in both success and error cases.
  },

  // Subscribe to auth state changes.
  // Callback receives (event, session) — event is 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | etc.
  onAuthStateChange: (callback) => supabase.auth.onAuthStateChange(callback)
};

// ── Workspace & role resolution ───────────────────────────────────────────────
// Resolved once per session and cached in module-level variables.
//
// Currently one workspace per user, but the resolver is written to support
// a future workspace selector: getWorkspaceMembership() returns ALL of the
// user's memberships as an array so a future selector can present the list.
// getWorkspaceId() picks the first one for now — swap this for a user-chosen
// value (stored in sessionStorage) when multi-workspace selection is built.

let _memberships = null;   // Array<{ workspaceId, role }> — all memberships for the user

export async function getWorkspaceMembership() {
  if (_memberships) return _memberships[0];   // fast path — already resolved

  const { data, error } = await supabase
    .from('workspace_memberships')
    .select('workspace_id, role');

  if (error) throw new Error('Could not resolve workspace membership: ' + error.message);
  if (!data || data.length === 0) throw new Error('No workspace membership found for this user.');

  // Cache the full list — enables a future workspace selector without a new query
  _memberships = data.map(row => ({ workspaceId: row.workspace_id, role: row.role || null }));

  return _memberships[0];
}

export async function getWorkspaceId() {
  const { workspaceId } = await getWorkspaceMembership();
  return workspaceId;
}

export async function getWorkspaceRole() {
  const { role } = await getWorkspaceMembership();
  return role;
}

// Returns all memberships for the authenticated user.
// Used by a future workspace selector — not yet wired into the UI.
export async function getAllWorkspaceMemberships() {
  if (!_memberships) await getWorkspaceMembership();   // populates cache
  return _memberships;
}

// Reset cached membership when the user signs out
export function clearWorkspaceCache() {
  _memberships = null;
}

// ── Local cache ───────────────────────────────────────────────────────────────
// Keeps the UI fast on repeat visits. Never used for write-back in Phase 1.

const Cache = {
  get:   (key)      => { try { return JSON.parse(localStorage.getItem('rn_' + key)) || []; } catch { return []; } },
  set:   (key, val) => { try { localStorage.setItem('rn_' + key, JSON.stringify(val)); } catch {} },
  clear: (key)      => { try { localStorage.removeItem('rn_' + key); } catch {} }
};

// ── Read-only DB interface ────────────────────────────────────────────────────
// Phase 1 exposes only .get() (cache read) and .load() (Supabase SELECT).
// No .save(), .update(), or .remove() — those are intentionally absent.

export const DB = {
  // Read from local cache (synchronous)
  get: (key) => Cache.get(key),

  // Fetch all rows for the workspace from a Supabase table (read-only SELECT)
  load: async (table) => {
    const wsId = await getWorkspaceId();
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('workspace_id', wsId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
};

// ── Bootstrap: load loads / drivers / trucks from Supabase ───────────────────

export async function loadAllFromSupabase() {
  showLoading('Connecting to Supabase…');
  try {
    const [rawLoads, rawDrivers, rawTrucks] = await Promise.all([
      DB.load('loads'),
      DB.load('drivers'),
      DB.load('trucks')
    ]);

    const loads   = rawLoads.map(normalizeLoad);
    const drivers = rawDrivers.map(normalizeDriver);
    const trucks  = rawTrucks.map(normalizeTruck);

    Cache.set('loads',   loads);
    Cache.set('drivers', drivers);
    Cache.set('trucks',  trucks);

    console.log(`[RN] Loaded ${loads.length} loads, ${drivers.length} drivers, ${trucks.length} trucks`);
    hideLoading();
    showSyncStatus(`✓ ${loads.length} loads · ${drivers.length} drivers · ${trucks.length} trucks`);
  } catch (err) {
    console.warn('[RN] Supabase load failed, using local cache:', err);
    hideLoading();
    showSyncStatus('⚠ Using cached data — Supabase unreachable', true);
  }
}

// ── Field normalizers (Supabase v3.5 schema → portal camelCase) ──────────────
//
// Column names match Schema v3.5 exactly.
// Financial percentages (driver pay splits, fuel deductions, etc.) are NOT
// calculated here — they come from Supabase service agreements / DB financial
// logic and will be populated server-side in a future phase. The portal
// displays gross_rate only; no hard-coded percentages in frontend code.

function normalizeLoad(l) {
  return {
    // Identifiers
    id:          l.load_number              || l.id,
    _uuid:       l.id,
    _rawStatus:  l.status,   // DB enum value — preserved for future update_load_status() RPC

    // Dates
    date:        l.pickup_date              || (l.created_at || '').split('T')[0] || '',

    // Driver / truck references
    driverId:    l.driver_id                || '',
    truckId:     l.truck_id                 || '',

    // Origin
    originCity:  l.origin_city              || '',
    originState: l.origin_state             || '',

    // Destination
    destCity:    l.dest_city                || '',
    destState:   l.dest_state               || '',

    // Rate — gross only; splits come from DB financial logic, not frontend math
    gross:       Number(l.gross_rate || 0),

    // Broker
    broker:      l.broker_name              || '',
    brokerLoad:  l.broker_load_number       || '',

    // Status (display label — see mapLoadStatus)
    status:      mapLoadStatus(l.status),

    // Notes
    notes:       l.notes                    || ''
  };
}

function mapLoadStatus(s) {
  // Displays the v3.5 operational statuses as-is — no remapping.
  // Valid values from the DB enum:
  //   Booked | Dispatched | At Shipper | Loaded | In Transit |
  //   At Receiver | Delivered | Issue | Canceled
  const valid = new Set([
    'Booked', 'Dispatched', 'At Shipper', 'Loaded', 'In Transit',
    'At Receiver', 'Delivered', 'Issue', 'Canceled'
  ]);
  return valid.has(s) ? s : (s || 'Booked');
}

function normalizeDriver(d) {
  return {
    // Identifiers
    id:           d.id,
    _uuid:        d.id,

    // Name (v3.5 uses first_name / last_name, not full_name)
    firstName:    d.first_name              || '',
    lastName:     d.last_name               || '',
    name:         [d.first_name, d.last_name].filter(Boolean).join(' ') || '',

    // Contact
    phone:        d.phone                   || '',
    email:        d.email                   || '',

    // Status
    status:       d.status                  || 'Active',

    // License (v3.5 columns)
    licenseNumber: d.license_number         || '',
    licenseState:  d.license_state          || '',
    licenseExpiry: d.license_expiry         || '',

    // Workspace
    workspaceId:  d.workspace_id            || ''
  };
}

function normalizeTruck(t) {
  return {
    // Identifiers (v3.5 uses unit_number, not truck_number)
    id:           t.unit_number             || t.id,
    _uuid:        t.id,
    unitType:     t.unit_type               || '',

    // Vehicle details
    year:         t.year                    || '',
    make:         t.make                    || '',
    model:        t.model                   || '',
    vin:          t.vin                     || '',

    // Plate (v3.5 columns)
    plate:        t.plate                   || '',
    plateState:   t.plate_state             || '',
    plateExpiry:  t.plate_expiry            || '',

    // Status
    status:       t.status                  || 'Active',

    // Workspace
    workspaceId:  t.workspace_id            || ''
  };
}

// ── UI helpers (loading overlay + sync toast) ─────────────────────────────────

function showSyncStatus(msg, isWarning = false) {
  let el = document.getElementById('syncStatus');
  if (!el) {
    el = document.createElement('div');
    el.id = 'syncStatus';
    el.style.cssText = [
      'position:fixed;bottom:24px;left:24px',
      'padding:10px 16px;border-radius:8px',
      'font-family:var(--font);font-size:12px;font-weight:500',
      'z-index:3000;transition:all 0.3s',
      'transform:translateY(60px);opacity:0'
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = isWarning ? '#92400e' : '#0f2340';
  el.style.color      = isWarning ? '#fef3c7' : '#ffffff';
  el.style.transform  = 'translateY(0)';
  el.style.opacity    = '1';
  setTimeout(() => { el.style.transform = 'translateY(60px)'; el.style.opacity = '0'; }, 4000);
}

function showLoading(msg = 'Connecting to Supabase…') {
  let el = document.getElementById('loadingOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loadingOverlay';
    el.style.cssText = [
      'position:fixed;inset:0;background:rgba(15,35,64,0.72)',
      'display:flex;flex-direction:column;align-items:center;justify-content:center',
      'z-index:5000;backdrop-filter:blur(4px)'
    ].join(';');
    el.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px 40px;text-align:center;min-width:260px">
        <div style="width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#0f2340;
                    border-radius:50%;animation:rnSpin 0.7s linear infinite;margin:0 auto 16px"></div>
        <div style="font-family:var(--font);font-size:14px;font-weight:500;color:#0f2340" id="loadingMsg">${msg}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:6px">Reliable Network Portal</div>
      </div>
      <style>@keyframes rnSpin{to{transform:rotate(360deg)}}</style>`;
    document.body.appendChild(el);
  }
  const msgEl = document.getElementById('loadingMsg');
  if (msgEl) msgEl.textContent = msg;
  el.style.display = 'flex';
}

function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = 'none';
}
