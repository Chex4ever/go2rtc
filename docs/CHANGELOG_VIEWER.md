# Camera wall & desktop changelog

## 1.2.13 (2026-05-27)

- **Fix:** Camera wall on a new PC — 401 from `/api/viewer/me` now shows **Sign in** immediately instead of staying on “Loading…” for 20s (creating a user in admin does not log the wall in).
- **Layout admin:** sub-streams (`*_sub`) are separate checkboxes; **Select all** picks main streams only.
- **Electron:** clearer 20s load-timeout message when the server URL is wrong or go2rtc is down.
- Regression tests: `viewer-session-boot.js`, layout stream partitioning.

## 1.2.11 (2026-05-31)

- **Progressive desktop updates** — three tiers: server UI reload (0 bytes + 5s toast), shell patch zip (changed files only), full NSIS fallback.
- CI publishes `desktop-shell-manifest-{version}.json`, optional `go2rtc.Camera.Wall.Patch.{from}-{to}.zip`, and `desktop-update-meta-{version}.json`.
- Update API: `?from=` installed version → `update_kind`: `none` | `patch` | `full`, plus `patch_url` / `shell_changed`.
- Electron applies patch in-place via PowerShell helper; falls back to full installer on failure.

## 1.2.10 (2026-05-30)

- **Fix:** Camera Wall one-click update — temp PowerShell helper waits for app exit, NSIS relaunch after silent install, update log in `%TEMP%`.
- **Fix:** Settings show/copy stream URLs from `go2rtc.yaml` (not API `***` redaction); block saving redacted URLs.
- **Tile debug v3** — yaml URLs for VLC, real AddConsumer probe, snapshot fails on 0 bytes, Copy VLC URL, clearer diagnosis.

## 1.2.9 (2026-05-30)

- **Fix:** go2rtc Windows service error 1053 — proper SCM integration (`svc.Run`) when started by Service Control Manager.
- **Fix:** go2rtc-updater Windows service uses the same SCM integration.
- **Fix:** Camera Wall one-click update waits for the app to exit before NSIS replaces files, then relaunches.

## 1.2.8 (2026-05-27)

- **Fix:** Windows service install (go2rtc + go2rtc-updater) retries with UAC elevation when `sc create` fails with access denied (error 5).
- Settings notes clarify Administrator / UAC requirement for service install.

## 1.2.7 (2026-05-27)

- **Fix:** Camera Wall restarts automatically after one-click update (`start /wait` installer + relaunch).
- **Tile debug v2** — pipeline “where it breaks”, connect test via `/api/streams?src=`, per-producer state; respects go2rtc `mode:webrtc` yaml options.

## 1.2.6 (2026-05-27)

- **About** dialog — go2rtc version, viewer UI version, desktop app (Electron), update config; web **About** button + Electron menu item.
- `GET /api/viewer/about` for version metadata.
- **Fix fake desktop updates** — API uses installer filename version (not GitHub tag alone); Electron cross-checks download URL; CI syncs `package.json` to tag.
- **Tile debug** — diagnosis section, per-producer RTSP stats, server snapshot probe, `ws-error` events; clearer hints for RTSP/WebRTC failures.

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
