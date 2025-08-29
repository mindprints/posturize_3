import { BleClient, hexToBytes, bytesToHex, normalizeUuid } from './ble.js';
import { CHAR_PITCH, CHAR_CALIBRATE, CHAR_ALARM_THRESHOLD, CHAR_ALARM } from './ble.js';
import { BATTERY_SERVICE, BATTERY_LEVEL_CHAR } from './ble.js';

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
  // Device controls
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
  console[kind === 'err' ? 'error' : 'log'](msg);
};

const ble = new BleClient({ log });

ui.support.textContent = BleClient.supported
  ? 'Web Bluetooth supported ✔'
  : 'Web Bluetooth not supported in this browser';

let stopNotify = null;
const stops = { pitch: null, alarm: null };

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
  // Device control buttons that only require service + connection
  [
    'btnPitchRead','btnPitchNotify','btnPitchStop',
    'btnCalibrate',
    'btnAlarmRead','btnAlarmNotify','btnAlarmStop',
    'btnAlarmThreshRead','btnAlarmThreshWrite'
  ].forEach(id => { if (ui[id]) ui[id].disabled = !enableSvc; });
}

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
    const namePrefix = ui.namePrefix.value.trim() || undefined;
    const serviceUuid = ui.serviceUuid.value.trim() || undefined;
    const device = await ble.requestDevice({ namePrefix, serviceUuid });
    log(`Selected device: ${device.name || '(no name)'} (${device.id})`, 'ok');
    setState({ deviceSelected: true, connected: false, charReady: false });
  } catch (err) {
    log(err.message || String(err), 'err');
  }
});

ui.btnConnect.addEventListener('click', async () => {
  try {
    await ble.connect();
    const serviceRaw = ui.serviceUuid.value.trim();
    if (!serviceRaw) throw new Error('Service UUID is required');
    const serviceUuid = normalizeUuid(serviceRaw);
    log(`Using service=${String(serviceUuid)}`);
    // If characteristic specified, validate it; else just enable discovery
    const charRaw = ui.charUuid.value.trim();
    if (charRaw) {
      const charUuid = normalizeUuid(charRaw);
      await ble.getCharacteristic(serviceUuid, charUuid);
      log('Primary service and characteristic ready', 'ok');
      setState({ deviceSelected: true, connected: true, charReady: true });
    } else {
      setState({ deviceSelected: true, connected: true, charReady: false });
    }
  } catch (err) {
    log(err.message || String(err), 'err');
  }
});

ui.btnDisconnect.addEventListener('click', async () => {
  try {
    await ble.disconnect();
    stopNotify?.();
    stopNotify = null;
    stops.pitch?.(); stops.pitch = null;
    stops.alarm?.(); stops.alarm = null;
    if (ui.batteryOut) ui.batteryOut.textContent = '';
    setState({ deviceSelected: true, connected: false, charReady: false });
  } catch (err) {
    log(err.message || String(err), 'err');
  }
});

ui.btnRead.addEventListener('click', async () => {
  try {
    const { serviceUuid, charUuid } = requireInputs();
    const data = await ble.read(serviceUuid, charUuid);
    log(`Read ${data.length} bytes: ${bytesToHex(data)}`, 'ok');
  } catch (err) {
    log(err.message || String(err), 'err');
  }
});

ui.btnWrite.addEventListener('click', async () => {
  try {
    const { serviceUuid, charUuid } = requireInputs();
    const hex = ui.writeHex.value;
    const bytes = hexToBytes(hex);
    await ble.write(serviceUuid, charUuid, bytes);
    log(`Wrote ${bytes.length} bytes`, 'ok');
  } catch (err) {
    log(err.message || String(err), 'err');
  }
});

ui.btnNotify.addEventListener('click', async () => {
  try {
    const { serviceUuid, charUuid } = requireInputs();
    stopNotify = await ble.startNotifications(serviceUuid, charUuid, (data) => {
      log(`Notify ${data.length} bytes: ${bytesToHex(data)}`, 'ok');
    });
    setState({ deviceSelected: true, connected: true, charReady: true });
    log('Notifications started', 'ok');
  } catch (err) {
    log(err.message || String(err), 'err');
  }
});

ui.btnStopNotify.addEventListener('click', () => {
  try {
    stopNotify?.();
    stopNotify = null;
    setState({ deviceSelected: true, connected: true, charReady: true });
    log('Notifications stopped', 'ok');
  } catch (err) {
    log(err.message || String(err), 'err');
  }
});

// Discover Characteristics for given service
async function discoverCharacteristics() {
  const serviceRaw = ui.serviceUuid.value.trim();
  if (!serviceRaw) throw new Error('Service UUID is required');
  const serviceUuid = normalizeUuid(serviceRaw);
  const list = await ble.listCharacteristics(serviceUuid);
  renderCharacteristics(list);
  log(`Discovered ${list.length} characteristics`, 'ok');
}

ui.btnDiscover.addEventListener('click', async () => {
  try {
    await discoverCharacteristics();
  } catch (err) {
    log(err.message || String(err), 'err');
  }
});

function renderCharacteristics(items) {
  const root = ui.charsList;
  root.innerHTML = '';
  if (!items || !items.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No characteristics found for this service.';
    root.appendChild(empty);
    return;
  }
  items.forEach((it) => {
    const row = document.createElement('div');
    row.className = 'item';
    const left = document.createElement('div');
    left.className = 'uuid';
    left.textContent = it.uuid;
    if (it.alias) {
      const alias = document.createElement('span');
      alias.className = 'alias';
      alias.textContent = `(${it.alias})`;
      left.appendChild(alias);
    }
    const props = document.createElement('div');
    props.className = 'props';
    it.properties.forEach((p) => {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = p;
      props.appendChild(b);
    });
    row.appendChild(left);
    row.appendChild(props);
    row.addEventListener('click', async () => {
      // Set selected char and optionally validate it
      ui.charUuid.value = it.alias || it.uuid;
      try { localStorage.setItem('pg.charUuid', ui.charUuid.value.trim()); } catch {}
      try {
        const serviceUuid = normalizeUuid(ui.serviceUuid.value.trim());
        const charUuid = normalizeUuid(ui.charUuid.value.trim());
        await ble.getCharacteristic(serviceUuid, charUuid);
        setState({ deviceSelected: true, connected: true, charReady: true });
        log(`Selected characteristic ${ui.charUuid.value}`, 'ok');
      } catch (err) {
        setState({ deviceSelected: true, connected: true, charReady: false });
        log(err.message || String(err), 'err');
      }
    });
    root.appendChild(row);
  });
}

// initial
setState({ deviceSelected: false, connected: false, charReady: false });

// Persist input fields to share with IO page
try {
  if (ui.serviceUuid) {
    const lastSvc = localStorage.getItem('pg.serviceUuid');
    if (lastSvc) ui.serviceUuid.value = lastSvc;
    ui.serviceUuid.addEventListener('input', () => {
      try { localStorage.setItem('pg.serviceUuid', ui.serviceUuid.value.trim()); } catch {}
    });
  }
  if (ui.namePrefix) {
    const lastPrefix = localStorage.getItem('pg.namePrefix');
    if (lastPrefix) ui.namePrefix.value = lastPrefix;
    ui.namePrefix.addEventListener('input', () => {
      try { localStorage.setItem('pg.namePrefix', ui.namePrefix.value.trim()); } catch {}
    });
  }
  if (ui.charUuid) {
    const lastChar = localStorage.getItem('pg.charUuid');
    if (lastChar) ui.charUuid.value = lastChar;
    ui.charUuid.addEventListener('input', () => {
      try { localStorage.setItem('pg.charUuid', ui.charUuid.value.trim()); } catch {}
    });
  }
} catch {}

// Attempt to adopt an already-permitted device (from IO page)
(async () => {
  try {
    if (!navigator.bluetooth?.getDevices) return;
    const allowed = await navigator.bluetooth.getDevices();
    if (!allowed || !allowed.length) return;
    const preferredId = localStorage.getItem('pg.deviceId');
    const device = allowed.find(d => d.id === preferredId) || allowed[0];
    if (!device) return;
    ble.device = device;
    device.addEventListener('gattserverdisconnected', () => {
      log('Device disconnected');
      setState({ deviceSelected: true, connected: false, charReady: false });
    });
    await ble.connect();
    log(`Adopted device: ${device.name || '(no name)'} (${device.id})`, 'ok');
    // Mark selected + connected; characteristic readiness depends on inputs
    setState({ deviceSelected: true, connected: true, charReady: false });
    const svcRaw = ui.serviceUuid?.value?.trim() || localStorage.getItem('pg.serviceUuid') || '';
    if (svcRaw) {
      const svc = normalizeUuid(svcRaw);
      const charRaw = ui.charUuid?.value?.trim() || localStorage.getItem('pg.charUuid') || '';
      if (charRaw) {
        try {
          await ble.getCharacteristic(svc, normalizeUuid(charRaw));
          setState({ deviceSelected: true, connected: true, charReady: true });
          log('Service and characteristic available', 'ok');
        } catch (e) {
          log(e?.message || String(e), 'err');
        }
      }
    }
  } catch (e) {
    // Ignore if not available or permissions not granted
  }
})();

function requireServiceOnly() {
  const serviceRaw = ui.serviceUuid.value.trim();
  if (!serviceRaw) throw new Error('Service UUID is required');
  return normalizeUuid(serviceRaw);
}

// Pitch (0x2101)
if (ui.btnPitchRead) ui.btnPitchRead.addEventListener('click', async () => {
  try {
    const svc = requireServiceOnly();
    const bytes = await ble.read(svc, CHAR_PITCH);
    const hex = bytesToHex(bytes);
    if (ui.pitchOut) ui.pitchOut.value = hex;
    log(`Pitch read: ${hex}`, 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});
if (ui.btnPitchNotify) ui.btnPitchNotify.addEventListener('click', async () => {
  try {
    const svc = requireServiceOnly();
    stops.pitch = await ble.startNotifications(svc, CHAR_PITCH, (data) => {
      const hex = bytesToHex(data);
      if (ui.pitchOut) ui.pitchOut.value = hex;
      log(`Pitch notify: ${hex}`, 'ok');
    });
    log('Pitch notifications started', 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});
if (ui.btnPitchStop) ui.btnPitchStop.addEventListener('click', () => {
  try { stops.pitch?.(); stops.pitch = null; log('Pitch notifications stopped', 'ok'); }
  catch (err) { log(err.message || String(err), 'err'); }
});

// Calibrate (0x2102)
if (ui.btnCalibrate) ui.btnCalibrate.addEventListener('click', async () => {
  try {
    const svc = requireServiceOnly();
    const payload = new Uint8Array([0x01]); // write 0x01 to trigger calibrate
    await ble.write(svc, CHAR_CALIBRATE, payload);
    log('Calibrate command sent (0x01)', 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});

// Alarm (0x2104)
if (ui.btnAlarmRead) ui.btnAlarmRead.addEventListener('click', async () => {
  try {
    const svc = requireServiceOnly();
    const bytes = await ble.read(svc, CHAR_ALARM);
    const hex = bytesToHex(bytes);
    if (ui.alarmOut) ui.alarmOut.value = hex;
    log(`Alarm read: ${hex}`, 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});
if (ui.btnAlarmNotify) ui.btnAlarmNotify.addEventListener('click', async () => {
  try {
    const svc = requireServiceOnly();
    stops.alarm = await ble.startNotifications(svc, CHAR_ALARM, (data) => {
      const hex = bytesToHex(data);
      if (ui.alarmOut) ui.alarmOut.value = hex;
      log(`Alarm notify: ${hex}`, 'ok');
    });
    log('Alarm notifications started', 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});
if (ui.btnAlarmStop) ui.btnAlarmStop.addEventListener('click', () => {
  try { stops.alarm?.(); stops.alarm = null; log('Alarm notifications stopped', 'ok'); }
  catch (err) { log(err.message || String(err), 'err'); }
});

// Alarm threshold (0x2103)
if (ui.btnAlarmThreshRead) ui.btnAlarmThreshRead.addEventListener('click', async () => {
  try {
    const svc = requireServiceOnly();
    const bytes = await ble.read(svc, CHAR_ALARM_THRESHOLD);
    const hex = bytesToHex(bytes);
    if (ui.alarmThreshHex) ui.alarmThreshHex.value = hex;
    log(`Alarm threshold read: ${hex}`, 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});
if (ui.btnAlarmThreshWrite) ui.btnAlarmThreshWrite.addEventListener('click', async () => {
  try {
    const svc = requireServiceOnly();
    const hex = (ui.alarmThreshHex?.value || '').trim();
    const data = hexToBytes(hex);
    await ble.write(svc, CHAR_ALARM_THRESHOLD, data);
    log(`Alarm threshold written (${data.length} bytes)`, 'ok');
  } catch (err) { log(err.message || String(err), 'err'); }
});

// Battery read
if (ui.btnReadBattery) {
  ui.btnReadBattery.addEventListener('click', async () => {
    try {
      const level = await ble.getBatteryLevel();
      const msg = `Battery: ${level}%`;
      if (ui.batteryOut) ui.batteryOut.textContent = msg;
      log(msg, 'ok');
    } catch (err) {
      if (ui.batteryOut) ui.batteryOut.textContent = '';
      log(err.message || String(err), 'err');
    }
  });
}
