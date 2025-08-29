# Posturize

This repo contains two UIs:

- Main App (IO): A polished PostureGuard UI under `IO/posturize/index.html` that connects to your BLE device.
- Debug Page: A minimal Web Bluetooth tester at `debug.html` for exploring services/characteristics and logging.

## Quick start

1. Serve the folder over `localhost` (required by Web Bluetooth):
   - Python: `python -m http.server 5173`
   - Node (if available): `npx http-server -p 5173` or `npx serve`
   - VS Code: use the Live Server extension
2. Open http://localhost:5173 in a supported browser (Chrome, Edge, or Chromium-based). You’ll be redirected to the IO app.
3. In the IO app, enter your device’s Service UUID (e.g., `0x1101`) and optional Name Prefix, then Connect.
4. Use the controls for calibrate, threshold, and real-time angle/alarms.
5. For deep inspection, open the Debug page via the “Open Debug” link or at `/debug.html`.

> Note: Opening `index.html` via `file://` will not work. Use `http://localhost` (or HTTPS).

## Common UUIDs for testing

- Battery Service: `0x180F`
  - Battery Level characteristic: `0x2A19` (read/notify)
- Device Information: `0x180A` (read-only characteristics)

## Files

- `IO/posturize/index.html` and `IO/posturize/script.js`: Main app UI + BLE integration
- `debug.html`: Debugging SPA
- `styles.css`, `src/ble.js`, `src/app.js`: Debug SPA assets and shared BLE helper
  - Includes a Discover flow to enumerate characteristics of a service

## Browser support

- Requires a Chromium-based browser with Web Bluetooth enabled (Chrome/Edge) on desktop.
- Requires serving over HTTPS or `http://localhost`.
- Some platforms (e.g., macOS + Chrome) require Bluetooth permissions in OS settings.

## Notes

- Service/Characteristic UUIDs can be 16-bit (`0x180F`) or 128-bit (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
- Write expects hex bytes separated by spaces, e.g., `01 02 0A FF`.
- Notifications print incoming data in hex.
- The app includes Battery Service (`0x180F`) in `optionalServices` automatically during device selection so the Battery read works even if you didn't pre-enter a service.

## Built-in characteristic shortcuts

These controls assume your device exposes the following characteristics under the service you enter:

- `0x2101` (Pitch): read value and start/stop notifications
- `0x2102` (Calibrate): write `0x01` to trigger calibrate
- `0x2103` (Alarm Threshold): read current value and write new threshold (hex input)
- `0x2104` (Alarm): read value and start/stop notifications

Enter your device's Service UUID first, then use the Device Controls panel.
