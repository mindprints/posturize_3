// Lightweight BLE helper with queued GATT ops and reconnect hooks
import { BleClient } from './ble.js';

export class BleHelper {
  constructor({ log } = {}) {
    this.client = new BleClient({ log: log || ((m) => console.log('[BLE]', m)) });
    this.onDisconnect = null;
    this.onReconnected = null;
    // Bridge to underlying client's hooks
    this.client.onDisconnected = () => { try { this.onDisconnect?.(this.client.device); } catch {} };
    this.client.onReconnected = () => { try { this.onReconnected?.(this.client.server); } catch {} };
  }

  get device() { return this.client.device; }
  set device(d) { this.client.device = d; }

  async connect(device) {
    if (device) this.client.device = device;
    await this.client.connect();
    return this.client.server;
  }

  async read(serviceUuid, charUuid) {
    const bytes = await this.client.read(serviceUuid, charUuid);
    return new DataView(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
  }

  async write(serviceUuid, charUuid, data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    await this.client.write(serviceUuid, charUuid, bytes);
  }

  async notify(serviceUuid, charUuid, callback) {
    const stop = await this.client.startNotifications(serviceUuid, charUuid, (u8) => {
      const dv = new DataView(u8.buffer, u8.byteOffset || 0, u8.byteLength);
      try { callback?.(dv); } catch {}
    });
    return stop;
  }
}


