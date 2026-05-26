# Desktop viewer (Electron)

The iRidi fork includes a **thin Electron client** that wraps the existing web camera wall. It does not replace go2rtc on the server.

## Location

`desktop/electron-viewer/`

## Quick start

1. Run go2rtc on the LAN (see [SYSADMIN_EN.md](SYSADMIN_EN.md) / [SYSADMIN_RU.md](SYSADMIN_RU.md)).
2. On the operator PC:

   ```bash
   cd desktop/electron-viewer
   npm install
   npm start
   ```

3. **File → Server settings** — set `http://SERVER:1984` (not `…/viewer/`; the app adds `/viewer/` automatically).

## Command line

```bash
npx electron . -- --server=http://192.168.1.10:1984
```

## Windows installer

From `desktop/electron-viewer/`:

```bash
npm run dist
```

Distribute `dist/go2rtc Camera Wall Setup *.exe` or the portable build. Operators still need network access to the go2rtc host.

## Security

- Navigation is limited to the configured server origin (external links open in the default browser).
- Optional **Allow self-signed HTTPS** for LAN TLS; off by default.
- Viewer login and permissions are unchanged (`viewer.yaml` on the server).

## vs browser

| | Browser tab | Electron |
|---|-------------|----------|
| Install | None | Optional `.exe` |
| Server URL | Bookmark | Saved in app config |
| Kiosk / fullscreen | Manual | Built-in menu |
| Updates | With server deploy | Rebuild installer when shell changes |

For a zero-install pilot, use Chrome: `chrome.exe --app=http://SERVER:1984/viewer/`
