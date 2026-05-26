# go2rtc Camera Wall (Electron)

Thin desktop shell for the **web viewer** (`/viewer/`). Video and auth stay on the **go2rtc server**; this app only opens a Chromium window pointed at your LAN server.

## Requirements

- [Node.js](https://nodejs.org/) 20+ (for building/running Electron)
- Running **go2rtc** with the iRidi viewer module (`viewer.yaml`, streams configured)

## Run from source

```bash
cd desktop/electron-viewer
npm install
npm start
```

Point at a remote server:

```bash
npm run start:server
# or
npx electron . -- --server=http://192.168.1.10:1984
```

**File → Server settings** (Ctrl+,) saves the URL to:

- Windows: `%APPDATA%\go2rtc-viewer\config.json`
- macOS: `~/Library/Application Support/go2rtc-viewer/config.json`
- Linux: `~/.config/go2rtc-viewer/config.json`

## Build Windows installer

```bash
npm install
npm run dist
```

Output: `desktop/electron-viewer/dist/` (NSIS installer + portable exe).

## Architecture

```text
  Electron window  ──HTTP/WebRTC──►  go2rtc :1984/viewer/
                                         │
                                         └── cameras (RTSP/ONVIF/…)
```

The packaged app does **not** include `go2rtc.exe`. Install and run go2rtc on a server (or locally) as documented in [docs/SYSADMIN_EN.md](../../docs/SYSADMIN_EN.md).

## Fork note

Upstream: [AlexxIT/go2rtc](https://github.com/AlexxIT/go2rtc). This desktop client is part of the iRidi fork.
