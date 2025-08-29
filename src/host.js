import { BleClient, normalizeUuid, bytesToHex } from './ble.js';
import { CHAR_PITCH, CHAR_ALARM_THRESHOLD, CHAR_ALARM } from './ble.js';

const bc = new BroadcastChannel('pg-ble');
const thisTabId = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));

const ui = {
  svc: document.getElementById('svc'),
  btnConnect: document.getElementById('btnConnect'),
  btnDisconnect: document.getElementById('btnDisconnect'),
  status: document.getElementById('status'),
  device: document.getElementById('device'),
};

const ble = new BleClient({ log: (m) => console.log('[BLE Host]', m) });
let isConnected = false;
let selectedService = null;
let stopPitch = null;
let stopAlarm = null;

function setUi() {
  ui.btnConnect.disabled = isConnected;
  ui.btnDisconnect.disabled = !isConnected;
  ui.status.textContent = isConnected ? 'Connected' : 'Disconnected';
}

function announceConnected() {
  try {
    bc.postMessage({
      type: 'ble_connected',
      from: thisTabId,
      ownerId: thisTabId,
      deviceId: ble.device?.id || '',
      deviceName: ble.device?.name || '',
      serviceUuid: selectedService,
    });
  } catch {}
}

function announceDisconnected() {
  try { bc.postMessage({ type: 'ble_disconnected', from: thisTabId, ownerId: thisTabId }); } catch {}
}

async function connect() {
  try {
    const svcRaw = (ui.svc?.value || localStorage.getItem('pg.serviceUuid') || '').trim();
    if (!svcRaw) { alert('Enter service UUID'); return; }
    selectedService = normalizeUuid(svcRaw);
    localStorage.setItem('pg.serviceUuid', String(svcRaw));
    await ble.requestDevice({ serviceUuid: selectedService });
    await ble.connect();
    isConnected = true;
    setUi();
    ui.device.textContent = `${ble.device?.name || '(no name)'} (${ble.device?.id || ''})`;
    localStorage.setItem('pg.deviceId', ble.device?.id || '');
    localStorage.setItem('pg.deviceName', ble.device?.name || '');
    announceConnected();

    // Start forwarding notifications
    try {
      stopPitch = await ble.startNotifications(selectedService, CHAR_PITCH, (data) => {
        const hex = bytesToHex(data);
        const dv = new DataView(data.buffer, data.byteOffset || 0, data.byteLength);
        let val = 0; if (data.length >= 2) val = dv.getInt16(0, true); else val = data[0] || 0;
        if (Math.abs(val) > 360 && Math.abs(val) <= 36000) val = val / 100;
        if (Math.abs(val) > 36000) val = val / 1000;
        const angle = Math.max(0, Math.min(Math.abs(val), 90));
        bc.postMessage({ type: 'pitch', from: thisTabId, angle, hex });
      });
    } catch {}
    try {
      stopAlarm = await ble.startNotifications(selectedService, CHAR_ALARM, (data) => {
        bc.postMessage({ type: 'alarm', from: thisTabId, raw: bytesToHex(data) });
      });
    } catch {}

  } catch (e) {
    alert(e?.message || String(e));
  }
}

async function disconnect() {
  try {
    stopPitch?.(); stopPitch = null;
    stopAlarm?.(); stopAlarm = null;
    await ble.disconnect();
  } catch {}
  isConnected = false; setUi(); ui.device.textContent = '—'; announceDisconnected();
}

ui.btnConnect.addEventListener('click', connect);
ui.btnDisconnect.addEventListener('click', disconnect);

// Respond to mirror commands
bc.onmessage = async (ev) => {
  const msg = ev?.data || {};
  if (!msg || msg.from === thisTabId) return;
  switch (msg.type) {
    case 'who_is_owner':
      if (isConnected) announceConnected();
      break;
    case 'cmd_calibrate':
      // Host does not implement device-specific calibrate here; IO owner handles it.
      break;
    case 'cmd_set_threshold':
      // Host can set threshold if desired; leaving to page owners for now.
      break;
    default:
      break;
  }
};

// Initialize
try {
  const lastSvc = localStorage.getItem('pg.serviceUuid') || '';
  if (ui.svc) ui.svc.value = lastSvc;
} catch {}
setUi();
// Let others know we can host if needed
try { bc.postMessage({ type: 'who_is_owner', from: thisTabId }); } catch {}


