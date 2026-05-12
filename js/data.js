// ── Reliable Network — Google Sheets Data Layer ──
// All data syncs to Google Sheets in real time

const API_URL = 'https://script.google.com/macros/s/AKfycbw-DoFci-uElodyBUxc71xll6UtXechMgMshUbQGm0BYwlLji8LWE9XU3Mev-_z_LjkvQ/exec';

// ── Cache layer — keeps UI fast while syncing to Sheets ──
const Cache = {
  get: (key) => { try { return JSON.parse(localStorage.getItem('rn_' + key)) || []; } catch { return []; } },
  set: (key, val) => { localStorage.setItem('rn_' + key, JSON.stringify(val)); },
  clear: (key) => { localStorage.removeItem('rn_' + key); }
};

// ── Google Sheets API calls ──
const Sheets = {

  // Read all records from a sheet
  getAll: async (sheet) => {
    try {
      const res = await fetch(`${API_URL}?sheet=${sheet}`, { method: 'GET' });
      const data = await res.json();
      if (data.success) {
        Cache.set(sheet.toLowerCase() + 's', data.data);
        return data.data;
      }
      throw new Error(data.error);
    } catch(err) {
      console.warn('Sheets read failed, using cache:', err);
      return Cache.get(sheet.toLowerCase() + 's');
    }
  },

  // Create a new record
  create: async (sheet, record) => {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'create', sheet, record })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch(err) {
      console.warn('Sheets create failed:', err);
      throw err;
    }
  },

  // Update an existing record
  update: async (sheet, id, record) => {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'update', sheet, id, record })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch(err) {
      console.warn('Sheets update failed:', err);
      throw err;
    }
  },

  // Delete a record
  delete: async (sheet, id) => {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', sheet, id })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    } catch(err) {
      console.warn('Sheets delete failed:', err);
      throw err;
    }
  }
};

// ── DB — unified interface used throughout the app ──
// Reads from cache instantly, syncs to Sheets in background
const DB = {

  get: (key) => Cache.get(key),

  set: (key, val) => Cache.set(key, val),

  // Load fresh data from Google Sheets
  load: async (sheet) => {
    const records = await Sheets.getAll(sheet);
    return records;
  },

  // Save a new record to both cache and Sheets
  save: async (sheetName, records, newRecord) => {
    // Update cache immediately so UI is instant
    Cache.set(sheetName, records);
    // Sync to Google Sheets in background
    try {
      await Sheets.create(sheetName.charAt(0).toUpperCase() + sheetName.slice(1), newRecord);
      showSyncStatus('✓ Saved to Google Sheets');
    } catch(err) {
      showSyncStatus('⚠ Saved locally — will sync when online', true);
    }
  },

  // Update a record in both cache and Sheets
  update: async (sheetName, records, id, updatedRecord) => {
    Cache.set(sheetName, records);
    try {
      await Sheets.update(sheetName.charAt(0).toUpperCase() + sheetName.slice(1), id, updatedRecord);
      showSyncStatus('✓ Updated in Google Sheets');
    } catch(err) {
      showSyncStatus('⚠ Updated locally — will sync when online', true);
    }
  },

  // Delete from both cache and Sheets
  remove: async (sheetName, records, id) => {
    Cache.set(sheetName, records);
    try {
      await Sheets.delete(sheetName.charAt(0).toUpperCase() + sheetName.slice(1), id);
      showSyncStatus('✓ Deleted from Google Sheets');
    } catch(err) {
      showSyncStatus('⚠ Deleted locally — will sync when online', true);
    }
  }
};

// ── Sync status indicator ──
function showSyncStatus(msg, isWarning = false) {
  let el = document.getElementById('syncStatus');
  if (!el) {
    el = document.createElement('div');
    el.id = 'syncStatus';
    el.style.cssText = `
      position: fixed; bottom: 24px; left: 24px;
      padding: 10px 16px; border-radius: 8px;
      font-family: var(--font); font-size: 12px; font-weight: 500;
      z-index: 3000; transition: all 0.3s;
      transform: translateY(60px); opacity: 0;
    `;
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = isWarning ? '#92400e' : '#0f2340';
  el.style.color = isWarning ? '#fef3c7' : '#ffffff';
  el.style.transform = 'translateY(0)';
  el.style.opacity = '1';
  setTimeout(() => {
    el.style.transform = 'translateY(60px)';
    el.style.opacity = '0';
  }, 3000);
}

// ── Loading overlay ──
function showLoading(msg = 'Loading from Google Sheets...') {
  let el = document.getElementById('loadingOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loadingOverlay';
    el.style.cssText = `
      position: fixed; inset: 0;
      background: rgba(15,35,64,0.7);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      z-index: 5000; backdrop-filter: blur(4px);
    `;
    el.innerHTML = `
      <div style="background:white;border-radius:16px;padding:32px 40px;text-align:center">
        <div style="width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#0f2340;border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto 16px"></div>
        <div style="font-family:var(--font);font-size:14px;font-weight:500;color:#0f2340" id="loadingMsg">${msg}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:6px">Connecting to Google Sheets...</div>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(el);
  }
  document.getElementById('loadingMsg').textContent = msg;
  el.style.display = 'flex';
}

function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = 'none';
}

// ── Initial data load from Google Sheets ──
async function loadAllFromSheets() {
  showLoading('Loading your data from Google Sheets...');
  try {
    const [loads, drivers, trucks] = await Promise.all([
      Sheets.getAll('Loads'),
      Sheets.getAll('Drivers'),
      Sheets.getAll('Trucks')
    ]);
    console.log(`✓ Loaded: ${loads.length} loads, ${drivers.length} drivers, ${trucks.length} trucks`);
    hideLoading();
    showSyncStatus(`✓ Connected — ${loads.length} loads, ${drivers.length} drivers, ${trucks.length} trucks`);
  } catch(err) {
    console.warn('Initial load failed, using cached data:', err);
    hideLoading();
    showSyncStatus('⚠ Using cached data — check connection', true);
  }
}
