# Camera wall & desktop changelog

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
