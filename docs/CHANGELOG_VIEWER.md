# Camera wall & desktop changelog

## 1.2.5 (2026-05-27)

- Docs: `VIEWER_API`, `ELECTRON_VIEWER`, sysadmin guides aligned with GitHub desktop updates and updater API.
- Tile debug: safe decode of stream name in WS URL (malformed `src=` no longer breaks the modal).

## 1.2.4 (2026-05-26)

- **Per-tile debug modal** (🐞) — channels, `/api/streams`, player WebRTC/WS/video state, event log, copy report.
- **Camera Wall updates from GitHub** — `viewer.desktop.github` serves latest release installer (`source: github`); no manual `.exe` copy when CI releases run.

## 1.2.3 (2026-05-26)

- **Fix:** connection-error page buttons (Retry / open server URL) work under CSP on `data:` error pages (Electron preload + IPC).

## 1.2.2 (2026-05-26)

- **One-click Camera Wall update** — download installer, silent NSIS `/S` in-place upgrade, app restarts automatically (Windows installed build).
- Branding: in-app logo resize/icon generation (`branding-assets.js`).
- go2rtc update API + GitHub Releases CI (see [RELEASE_CI.md](RELEASE_CI.md)).

## 1.2.1 (2026-05-26)

- **Тесла** default branding
- **Zero-click morning start**: auto-open last layout (`layout-auto.js`, `morning-start.js`, Electron `autoOpenLayout`)
- Settings save no longer quits Electron app
- Error screens instead of black window; API timeout
- Desktop updates from go2rtc server
- Refactor: `viewer-api.js`, `viewer-ui.js`, `viewer-state.js`, `viewer-dom.js`

## 1.2.0

- Load-error page, update checker, bootstrap error UI
- `renderWall` grid fix

## 1.1.0

- Initial packaged NSIS installer (Manual / Autostart / Kiosk)
