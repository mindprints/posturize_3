import { BleClient, hexToBytes, bytesToHex, normalizeUuid } from '../src/ble.js';
import { CHAR_PITCH, CHAR_CALIBRATE, CHAR_ALARM_THRESHOLD, CHAR_ALARM } from '../src/ble.js';

const broadcastChannel = new BroadcastChannel('pg-ble');
const thisTabId = (crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
let isOwnerTab = false;
let isRemoteSession = false;
let stopNotify = null;
const stops = { pitch: null, alarm: null };

const ui = {
  support: document.getElementById('supportNotice'),
  namePrefix: document.getElementById('namePrefix'),
  serviceUuid: document.getElementById('serviceUuid'),
  charUuid: document.getElementById('charUuid'),
  writeHex: document.getElementById('writeHex'),
  btnRequest: document.getElementById('btnRequest'),
  btnConnect: document.getElementById('btnConnect'),
  btnDisconnect: document.getElementById('btnDisconnect'),
  btnDiscover: document.getElementById('btnDiscover'),
  btnRead: document.getElementById('btnRead'),
  btnWrite: document.getElementById('btnWrite'),
  btnNotify: document.getElementById('btnNotify'),
  btnStopNotify: document.getElementById('btnStopNotify'),
  log: document.getElementById('log'),
  charsList: document.getElementById('charsList'),
  btnReadBattery: document.getElementById('btnReadBattery'),
  batteryOut: document.getElementById('batteryOut'),
  pitchOut: document.getElementById('pitchOut'),
  alarmOut: document.getElementById('alarmOut'),
  alarmThreshHex: document.getElementById('alarmThreshHex'),
  btnPitchRead: document.getElementById('btnPitchRead'),
  btnPitchNotify: document.getElementById('btnPitchNotify'),
  btnPitchStop: document.getElementById('btnPitchStop'),
  btnCalibrate: document.getElementById('btnCalibrate'),
  btnAlarmRead: document.getElementById('btnAlarmRead'),
  btnAlarmNotify: document.getElementById('btnAlarmNotify'),
  btnAlarmStop: document.getElementById('btnAlarmStop'),
  btnAlarmThreshRead: document.getElementById('btnAlarmThreshRead'),
  btnAlarmThreshWrite: document.getElementById('btnAlarmThreshWrite'),
};

const log = (msg, kind = 'info') => {
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  if (kind === 'ok') line.classList.add('ok');
  if (kind === 'err') line.classList.add('err');
  line.textContent = `[${time}] ${msg}`;
  ui.log.appendChild(line);
  ui.log.scrollTop = ui.log.scrollHeight;
};

const ble = new BleClient({ log });
ui.support.textContent = BleClient.supported ? 'Web Bluetooth supported ✔' : 'Web Bluetooth not supported in this browser';

function setState({ deviceSelected, connected, charReady }) {
  ui.btnConnect.disabled = !deviceSelected || connected;
  ui.btnDisconnect.disabled = !connected;
  ui.btnDiscover.disabled = !connected || !ui.serviceUuid.value.trim();
  if (ui.btnReadBattery) ui.btnReadBattery.disabled = !connected;
  ui.btnRead.disabled = !charReady;
  ui.btnWrite.disabled = !charReady;
  ui.btnNotify.disabled = !charReady || !!stopNotify;
  ui.btnStopNotify.disabled = !charReady || !stopNotify;
  const svcPresent = !!ui.serviceUuid.value.trim();
  const enableSvc = connected && svcPresent;
  [
    'btnPitchRead','btnPitchNotify','btnPitchStop','btnCalibrate','btnAlarmRead','btnAlarmNotify','btnAlarmStop','btnAlarmThreshRead','btnAlarmThreshWrite'
  ].forEach(id => { if (ui[id]) ui[id].disabled = !enableSvc; });
}

broadcastChannel.onmessage = (ev) => {
  const msg = ev?.data || {};
  if (!msg || msg.from === thisTabId) return;
  switch (msg.type) {
    case 'who_is_owner': {
      if (isOwnerTab) {
        broadcastChannel.postMessage({ type: 'ble_connected', from: thisTabId, ownerId: thisTabId, deviceId: ble?.device?.id || '', deviceName: ble?.device?.name || '', serviceUuid: (ui.serviceUuid?.value?.trim() || localStorage.getItem('pg.serviceUuid') || '') });
      }
      break;
    }
    case 'ble_connected': {
      if (isOwnerTab) return;
      isRemoteSession = true;
      setState({ deviceSelected: true, connected: true, charReady: false });
      log(`Mirroring connection from other tab: ${msg.deviceName || '(shared device)'}`, 'ok');
      break;
    }
    case 'ble_disconnected': {
      if (isOwnerTab) return;
      isRemoteSession = false;
      setState({ deviceSelected: true, connected: false, charReady: false });
      log('Owner tab disconnected. You can connect from this tab now.', 'ok');
      break;
    }
    case 'pitch': {
      if (isOwnerTab) return;
      if (ui.pitchOut) ui.pitchOut.value = msg.hex || '';
      break;
    }
    case 'battery': {
      if (isOwnerTab) return;
      if (ui.batteryOut) ui.batteryOut.textContent = `Battery: ${Number(msg.level || 0)}%`;
      break;
    }
    default: break;
  }
};

function requireInputs() {
  const serviceRaw = ui.serviceUuid.value.trim();
  const charRaw = ui.charUuid.value.trim();
  if (!serviceRaw) throw new Error('Service UUID is required');
  if (!charRaw) throw new Error('Characteristic UUID is required');
  const serviceUuid = normalizeUuid(serviceRaw);
  const charUuid = normalizeUuid(charRaw);
  log(`Using service=${String(serviceUuid)} char=${String(charUuid)}`);
  return { serviceUuid, charUuid };
}

ui.btnRequest.addEventListener('click', async () => {
  try {
    if (isRemoteSession && !isOwnerTab) { log('Connection is active in another tab. Disconnect there to take control.', 'err'); return; }
    const namePrefix = ui.namePrefix.value.trim() || undefined;
    const serviceUuid = ui.serviceUuid.value.trim() || undefined;
    const device = await ble.requestDevice({ namePrefix, serviceUuid });
    log(`Selected device: ${device.name || '(no name)'} (${device.id})`, 'ok');
    setState({ deviceSelected: true, connected: false, charReady: false });
  } catch (err) { log(err.message || String(err), 'err'); }
});

ui.btnConnect.addEventListener('click', async () => {
  try {
    if (isRemoteSession && !isOwnerTab) { log('Connection is active in another tab. Disconnect there to take control.', 'err'); return; }
    await ble.connect();
    isOwnerTab = true; isRemoteSession = false;
    try { localStorage.setItem('pg.deviceId', ble.device?.id || ''); localStorage.setItem('pg.deviceName', ble.device?.name || ''); } catch {}
    broadcastChannel.postMessage({ type: 'ble_connected', from: thisTabId, ownerId: thisTabId, deviceId: ble.device?.id || '', deviceName: ble.device?.name || '', serviceUuid: (ui.serviceUuid?.value?.trim() || localStorage.getItem('pg.serviceUuid') || '') });
    const serviceRaw = ui.serviceUuid.value.trim();
    if (!serviceRaw) throw new Error('Service UUID is required');
    const serviceUuid = normalizeUuid(serviceRaw);
    log(`Using service=${String(serviceUuid)}`);
    const charRaw = ui.charUuid.value.trim();
    if (charRaw) {
      const charUuid = normalizeUuid(charRaw);
      await ble.getCharacteristic(serviceUuid, charUuid);
      log('Primary service and characteristic ready', 'ok');
      setState({ deviceSelected: true, connected: true, charReady: true });
    } else {
      setState({ deviceSelected: true, connected: true, charReady: false });
    }
  } catch (err) { log(err.message || String(err), 'err'); }
});

ui.btnDisconnect.addEventListener('click', async () => {
  try {
    await ble.disconnect();
    stopNotify?.(); stopNotify = null;
    stops.pitch?.(); stops.pitch = null;
    stops.alarm?.(); stops.alarm = null;
    if (ui.batteryOut) ui.batteryOut.textContent = '';
    setState({ deviceSelected: true, connected: false, charReady: false });
    isOwnerTab = false;
    broadcastChannel.postMessage({ type: 'ble_disconnected', from: thisTabId, ownerId: thisTabId });
  } catch (err) { log(err.message || String(err), 'err'); }
});

ui.btnRead.addEventListener('click', async () => {
  try {
    const { serviceUuid, charUuid } = requireInputs();
    const data = await ble.read(serviceUuid, charUuid);
    log(`Read ${data.length} bytes: ${bytesToHex(data)}`, 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});

ui.btnWrite.addEventListener('click', async () => {
  try {
    const { serviceUuid, charUuid } = requireInputs();
    const hex = ui.writeHex.value;
    const bytes = hexToBytes(hex);
    await ble.write(serviceUuid, charUuid, bytes);
    log(`Wrote ${bytes.length} bytes`, 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});

ui.btnNotify.addEventListener('click', async () => {
  try {
    if (isRemoteSession && !isOwnerTab) { log('Notifications unavailable in mirror mode (another tab owns BLE).', 'err'); return; }
    const { serviceUuid, charUuid } = requireInputs();
    stopNotify = await ble.startNotifications(serviceUuid, charUuid, (data) => { log(`Notify ${data.length} bytes: ${bytesToHex(data)}`, 'ok'); });
    setState({ deviceSelected: true, connected: true, charReady: true });
    log('Notifications started', 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});

ui.btnStopNotify.addEventListener('click', () => {
  try { stopNotify?.(); stopNotify = null; setState({ deviceSelected: true, connected: true, charReady: true }); log('Notifications stopped', 'ok'); }
  catch (err) { log(err.message || String(err), 'err'); }
});

ui.btnDiscover.addEventListener('click', async () => {
  try {
    if (isRemoteSession && !isOwnerTab) { log('Discovery unavailable in mirror mode (another tab owns BLE).', 'err'); return; }
    const serviceRaw = ui.serviceUuid.value.trim();
    if (!serviceRaw) throw new Error('Service UUID is required');
    const serviceUuid = normalizeUuid(serviceRaw);
    const list = await ble.listCharacteristics(serviceUuid);
    renderCharacteristics(list);
    log(`Discovered ${list.length} characteristics`, 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});

function renderCharacteristics(items) {
  const root = ui.charsList; root.innerHTML = '';
  if (!items || !items.length) { const empty = document.createElement('div'); empty.className = 'muted'; empty.textContent = 'No characteristics found for this service.'; root.appendChild(empty); return; }
  items.forEach((it) => {
    const row = document.createElement('div'); row.className = 'item';
    const left = document.createElement('div'); left.className = 'uuid'; left.textContent = it.uuid;
    if (it.alias) { const alias = document.createElement('span'); alias.className = 'alias'; alias.textContent = `(${it.alias})`; left.appendChild(alias); }
    const props = document.createElement('div'); props.className = 'props';
    it.properties.forEach((p) => { const b = document.createElement('span'); b.className = 'badge'; b.textContent = p; props.appendChild(b); });
    row.appendChild(left); row.appendChild(props);
    row.addEventListener('click', async () => {
      ui.charUuid.value = it.alias || it.uuid;
      try { localStorage.setItem('pg.charUuid', ui.charUuid.value.trim()); } catch {}
      try { const serviceUuid = normalizeUuid(ui.serviceUuid.value.trim()); const charUuid = normalizeUuid(ui.charUuid.value.trim()); await ble.getCharacteristic(serviceUuid, charUuid); setState({ deviceSelected: true, connected: true, charReady: true }); log(`Selected characteristic ${ui.charUuid.value}`, 'ok'); } catch (err) { setState({ deviceSelected: true, connected: true, charReady: false }); log(err.message || String(err), 'err'); }
    });
    root.appendChild(row);
  });
}

try {
  const lastSvc = localStorage.getItem('pg.serviceUuid'); if (lastSvc) ui.serviceUuid.value = lastSvc; ui.serviceUuid.addEventListener('input', () => { try { localStorage.setItem('pg.serviceUuid', ui.serviceUuid.value.trim()); } catch {} });
  const lastPrefix = localStorage.getItem('pg.namePrefix'); if (lastPrefix) ui.namePrefix.value = lastPrefix; ui.namePrefix.addEventListener('input', () => { try { localStorage.setItem('pg.namePrefix', ui.namePrefix.value.trim()); } catch {} });
  const lastChar = localStorage.getItem('pg.charUuid'); if (lastChar) ui.charUuid.value = lastChar; ui.charUuid.addEventListener('input', () => { try { localStorage.setItem('pg.charUuid', ui.charUuid.value.trim()); } catch {} });
} catch {}

// Battery
if (ui.btnReadBattery) ui.btnReadBattery.addEventListener('click', async () => {
  try {
    if (isRemoteSession && !isOwnerTab) { log('Battery read unavailable in mirror mode (another tab owns BLE).', 'err'); return; }
    const level = await ble.getBatteryLevel();
    const msg = `Battery: ${level}%`;
    if (ui.batteryOut) ui.batteryOut.textContent = msg;
    log(msg, 'ok');
  } catch (err) { if (ui.batteryOut) ui.batteryOut.textContent = ''; log(err.message || String(err), 'err'); }
});


