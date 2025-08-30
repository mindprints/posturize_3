// Minimal BLE helper wrapping Web Bluetooth API
export const BATTERY_SERVICE = 0x180F;
export const BATTERY_LEVEL_CHAR = 0x2A19;
export const DEVICE_INFORMATION_SERVICE = 0x180A;
// App-specific characteristic aliases
export const CHAR_PITCH = 0x2101; // read + notify
export const CHAR_CALIBRATE = 0x2102; // write (set calibrate)
export const CHAR_ALARM_THRESHOLD = 0x2103; // read + write
export const CHAR_ALARM = 0x2104; // read + notify

export class BleClient {
  constructor({ log } = {}) {
    this.device = null;
    this.server = null;
    this.cache = new Map();
    this.log = log || (() => {});
    this.opQueue = Promise.resolve();
    this.autoReconnect = true;
    this._reconnectDelaysMs = [500, 1000, 2000];
    this._boundOnDisconnected = (/*ev*/) => this._handleDisconnected();
  }

  static get supported() {
    return !!navigator.bluetooth;
  }

  async requestDevice({ namePrefix, serviceUuid }) {
    if (!BleClient.supported) throw new Error("Web Bluetooth not supported in this browser");
    if (!serviceUuid) throw new Error('Service UUID is required for device selection');
    const primaryService = normalizeUuid(serviceUuid);
    const filter = { services: [primaryService] };
    if (namePrefix) filter.namePrefix = namePrefix;
    const optionalServices = [primaryService, BATTERY_SERVICE, DEVICE_INFORMATION_SERVICE];
    const options = { filters: [filter], optionalServices };
    this.log(`Requesting device with options: ${JSON.stringify({ filters: [{ services: ['<primary>'] , ...(namePrefix?{namePrefix}:{} )}], optionalServices })}`);
    this.device = await navigator.bluetooth.requestDevice(options);
    this.device.addEventListener('gattserverdisconnected', () => {
      this.log('Device disconnected');
      this.server = null;
    });
    return this.device;
  }

  async connect() {
    if (!this.device) throw new Error('No device selected');
    // Ensure only one listener attached
    try { this.device.removeEventListener('gattserverdisconnected', this._boundOnDisconnected); } catch {}
    this.device.addEventListener('gattserverdisconnected', this._boundOnDisconnected);
    this.server = await this.device.gatt.connect();
    this.log(`Connected: ${this.device.name || '(no name)'} (${this.device.id})`);
    this.cache.clear();
    return this.server;
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
      this.log('Disconnected');
    }
    this.server = null;
  }

  enqueue(fn) {
    this.opQueue = this.opQueue.then(() => fn()).catch((e) => {
      this.log(`[queue] ${e?.message || e}`);
      throw e;
    });
    return this.opQueue;
  }

  async ensureConnected() {
    if (this.server && this.device?.gatt?.connected) return;
    if (!this.device) throw new Error('Not connected');
    if (!this.autoReconnect) throw new Error('GATT server not connected');
    await this._attemptReconnect();
  }

  async _handleDisconnected() {
    this.log('Device disconnected');
    this.server = null;
    try { this.onDisconnected?.(this.device); } catch {}
    if (this.autoReconnect) {
      try {
        await this._attemptReconnect();
        try { this.onReconnected?.(this.server); } catch {}
      } catch (e) {
        this.log(`Auto-reconnect failed: ${e?.message || e}`);
      }
    }
  }

  async _attemptReconnect() {
    if (!this.device) throw new Error('No device to reconnect');
    for (const delay of this._reconnectDelaysMs) {
      try {
        this.log('Reconnecting…');
        this.server = await this.device.gatt.connect();
        this.cache.clear();
        this.log('Reconnected');
        return;
      } catch (e) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
    // Last attempt
    this.server = await this.device.gatt.connect();
    this.cache.clear();
  }

  async getCharacteristic(serviceUuid, charUuid) {
    await this.ensureConnected();
    const key = `${normalizeUuid(serviceUuid)}::${normalizeUuid(charUuid)}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const service = await this.server.getPrimaryService(normalizeUuid(serviceUuid));
    const characteristic = await service.getCharacteristic(normalizeUuid(charUuid));
    this.cache.set(key, characteristic);
    return characteristic;
  }

  async read(serviceUuid, charUuid) {
    return this.enqueue(async () => {
      const ch = await this.getCharacteristic(serviceUuid, charUuid);
      const value = await ch.readValue();
      return new Uint8Array(value.buffer);
    });
  }

  async write(serviceUuid, charUuid, data) {
    return this.enqueue(async () => {
      const ch = await this.getCharacteristic(serviceUuid, charUuid);
      await ch.writeValue(data);
    });
  }

  async startNotifications(serviceUuid, charUuid, callback) {
    return this.enqueue(async () => {
      const ch = await this.getCharacteristic(serviceUuid, charUuid);
      await ch.startNotifications();
      const handler = (ev) => {
        const v = new Uint8Array(ev.target.value.buffer);
        callback?.(v);
      };
      ch.addEventListener('characteristicvaluechanged', handler);
      return () => ch.removeEventListener('characteristicvaluechanged', handler);
    });
  }
 
  async getBatteryLevel() {
    return this.enqueue(async () => {
      await this.ensureConnected();
      const service = await this.server.getPrimaryService(BATTERY_SERVICE);
      const ch = await service.getCharacteristic(BATTERY_LEVEL_CHAR);
      const v = await ch.readValue();
      return v.getUint8(0);
    });
  }

  async listCharacteristics(serviceUuid) {
    return this.enqueue(async () => {
      await this.ensureConnected();
      const service = await this.server.getPrimaryService(normalizeUuid(serviceUuid));
      const chars = await service.getCharacteristics();
      return chars.map((c) => {
        const props = c.properties || {};
        const supported = Object.keys(props).filter((k) => props[k]);
        return {
          uuid: c.uuid,
          alias: shortUuid(c.uuid),
          properties: supported,
        };
      });
    });
  }
}

export function normalizeUuid(input) {
  // Accept:
  // - number (returned as-is)
  // - '0x1234' or '0X1234' (parsed to number)
  // - bare hex '180F' / '2A19' (parsed to number)
  // - full 128-bit UUID (returned lowercased)
  // - standard names (returned as-is)
  if (typeof input === 'number') return input;
  if (!input) return input;
  const s = String(input).trim();
  // 0x-prefixed assigned number
  if (/^0x[0-9a-fA-F]+$/.test(s)) return Number(s);
  // Bare hex 16/32-bit (treat as hex, not decimal)
  if (/^[0-9a-fA-F]{4}$/.test(s) || /^[0-9a-fA-F]{8}$/.test(s)) {
    return parseInt(s, 16);
  }
  // 128-bit UUID, normalize to lowercase
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s)) {
    return s.toLowerCase();
  }
  // Otherwise return as-is (could be a standard name)
  return s;
}

export function hexToBytes(str) {
  if (!str) return new Uint8Array([]);
  const parts = str
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const bytes = parts.map((p) => {
    const n = parseInt(p, 16);
    if (Number.isNaN(n) || n < 0 || n > 255) throw new Error(`Invalid byte: ${p}`);
    return n;
  });
  return new Uint8Array(bytes);
}

export function bytesToHex(arr) {
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

export function shortUuid(uuid) {
  if (!uuid) return null;
  const m = /^0000([0-9a-fA-F]{4})-0000-1000-8000-00805f9b34fb$/.exec(String(uuid));
  if (!m) return null;
  return `0x${m[1].toUpperCase()}`;
}
