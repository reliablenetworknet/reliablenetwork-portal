// ── Reliable Network — Data Layer ──
// In production this connects to Google Sheets via API
// For now, data is stored in localStorage so it persists between sessions

const DB = {
  get: (key) => {
    try { return JSON.parse(localStorage.getItem('rn_' + key)) || []; }
    catch { return []; }
  },
  set: (key, val) => {
    localStorage.setItem('rn_' + key, JSON.stringify(val));
  }
};

// ── Seed sample data if first run ──
function seedData() {
  if (localStorage.getItem('rn_seeded')) return;

  DB.set('drivers', [
    { id: 'DRV-001', name: 'John Martinez', phone: '813-555-0101', email: 'john@email.com', status: 'Active', cdl: 'CDL123456', cdlExp: '2026-08-15', medExp: '2026-03-10', truck: 'TRK-001', leaseStart: '2024-01-15' },
    { id: 'DRV-002', name: 'Carlos Rivera', phone: '813-555-0202', email: 'carlos@email.com', status: 'Active', cdl: 'CDL654321', cdlExp: '2025-12-01', medExp: '2025-11-20', truck: 'TRK-002', leaseStart: '2024-02-01' },
    { id: 'DRV-003', name: 'Marcus Johnson', phone: '813-555-0303', email: 'marcus@email.com', status: 'Active', cdl: 'CDL789012', cdlExp: '2026-05-10', medExp: '2026-01-15', truck: 'TRK-003', leaseStart: '2024-03-10' },
  ]);

  DB.set('trucks', [
    { id: 'TRK-001', year: '2020', make: 'Freightliner', model: 'Cascadia', vin: '1FUJGEDV8CLBP8765', status: 'Active', plate: 'ABC1234', state: 'FL', owner: 'John Martinez', lastInspect: '2024-11-01', nextInspect: '2025-05-01', insProvider: 'Progressive', insExp: '2025-12-31' },
    { id: 'TRK-002', year: '2019', make: 'Kenworth', model: 'T680', vin: '2XKJD49X7JM123456', status: 'Active', plate: 'XYZ5678', state: 'FL', owner: 'Carlos Rivera', lastInspect: '2024-10-15', nextInspect: '2025-04-15', insProvider: 'Sentry', insExp: '2025-11-30' },
    { id: 'TRK-003', year: '2021', make: 'Peterbilt', model: '579', vin: '3UPTM2829PM123789', status: 'Active', plate: 'DEF9012', state: 'FL', owner: 'Marcus Johnson', lastInspect: '2024-12-01', nextInspect: '2025-06-01', insProvider: 'Canal', insExp: '2026-01-15' },
  ]);

  DB.set('loads', [
    { id: 'LD-001', date: '2025-05-04', driverId: 'DRV-001', driverName: 'John Martinez', truckId: 'TRK-001', origin: 'Tampa, FL', dest: 'Atlanta, GA', gross: 3500, pct12: 420, pct3: 105, net9: 315, broker: 'Total Express', brokerLoad: 'TE-88821', status: 'Paid', notes: '' },
    { id: 'LD-002', date: '2025-05-03', driverId: 'DRV-002', driverName: 'Carlos Rivera', truckId: 'TRK-002', origin: 'Miami, FL', dest: 'Dallas, TX', gross: 4800, pct12: 576, pct3: 144, net9: 432, broker: 'FastFreight', brokerLoad: 'FF-44312', status: 'In Transit', notes: '' },
    { id: 'LD-003', date: '2025-05-02', driverId: 'DRV-001', driverName: 'John Martinez', truckId: 'TRK-001', origin: 'Atlanta, GA', dest: 'Nashville, TN', gross: 2900, pct12: 348, pct3: 87, net9: 261, broker: 'QuickLoad', brokerLoad: 'QL-99102', status: 'Paid', notes: '' },
    { id: 'LD-004', date: '2025-05-01', driverId: 'DRV-003', driverName: 'Marcus Johnson', truckId: 'TRK-003', origin: 'Orlando, FL', dest: 'Charlotte, NC', gross: 3200, pct12: 384, pct3: 96, net9: 288, broker: 'Total Express', brokerLoad: 'TE-77651', status: 'Pending', notes: '' },
    { id: 'LD-005', date: '2025-04-30', driverId: 'DRV-002', driverName: 'Carlos Rivera', truckId: 'TRK-002', origin: 'Dallas, TX', dest: 'Memphis, TN', gross: 2600, pct12: 312, pct3: 78, net9: 234, broker: 'FastFreight', brokerLoad: 'FF-33201', status: 'Paid', notes: '' },
  ]);

  localStorage.setItem('rn_seeded', '1');
}

seedData();
