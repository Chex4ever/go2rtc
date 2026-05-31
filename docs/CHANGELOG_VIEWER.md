# Camera wall & desktop changelog

## 1.2.24 (2026-05-31)

- **Fix:** **electron-brand-bar** and **wall-header** auto-hide on the camera wall (grid and focus) — move the pointer to the top edge (~56px) to reveal them; tile controls still show on hover.

## 1.2.23 (2026-05-31)

- **Fix:** Custom organization logo in the camera wall — embed as data URL instead of `file://` (broken image on server-loaded viewer pages).
- **Fix:** **Restart now** on a downloaded update no longer deletes the pending installer before install (cache cleanup skipped while a newer version is waiting).

## 1.2.22 (2026-05-27)

- **Fix:** Focus mode — tile title bars stay hidden until the pointer is at the top edge (no longer pop in on any hover over the video).
- **Fix:** Focus mode — **← Back to grid** replaces **⛶ Full screen** in the tile bar and bottom controls when viewing the main channel.
- **Fix:** Tile debug crash (`Assignment to constant variable`) on cameras with a preview sub-stream.
- **Feature:** Desktop app remembers window position/monitor (`windowBounds` in config) and restores it on launch, including after **Start at Windows login**.

## 1.2.21 (2026-05-27)

- **Feature:** In-app update notifications — no Windows toast dialogs. Cards in the camera wall show download progress, **Restart now / Later**, and post-upgrade “You are now running version …”.
- **Feature:** **Download updates automatically** (on by default, Settings → Deployment). When disabled, startup check shows “update available” without downloading.
- **Feature:** Pending Camera Wall updates install silently on the next app start (no prompts); menu **Restart to install …** applies immediately after a background download.

## 1.2.20 (2026-05-31)

- **Fix:** Desktop autoupdate reuses cached installer in `%APPDATA%/go2rtc-viewer/updates/` until install succeeds (no re-download when URL changes).
- **Fix:** Silent install helper relaunches Camera Wall after NSIS finishes; waits longer for all app processes to exit.
- **Fix:** New cameras added to a layout appear in empty grid slots (saved tile positions are merged with the current allow-list).

## 1.2.19 (2026-05-27)

- **Feature:** Separate tile view settings for **preview** (grid) and **main** (fullscreen): aspect ratio, zoom, pan, width — saved per user in layout (`view` / `viewMain`).
- **Fix:** Focus mode — wall header hides until mouse at top edge (no layout strip reserved over video).
- **Fix:** Detect preview channels for Dahua — resolve ONVIF profiles to RTSP URLs instead of blindly flipping `subtype=0`→`1` (which is often still main on Dahua).

## 1.2.18 (2026-05-27)

- **Fix:** Camera Wall 1.2.17 crash on startup — `updater-cache.js` was missing from the electron-builder `files` list (module not found in app.asar).

## 1.2.17 (2026-05-27)

- **Fix:** Tile zoom, aspect ratio, pan, and custom width multiplier are saved in the layout (per user, per tile) instead of session-only storage.
- **Feature:** Tile controls add ◁ / ▷ buttons to narrow or widen video width independently of zoom.
- **Fix:** Camera Wall desktop auto-update — downloads cached under `%APPDATA%` until install succeeds; startup/manual flow shows download + ready-to-install prompts; persistent log at `logs/camera-wall-update.log`; app uses hard exit so the Windows update helper can replace files.

## 1.2.16 (2026-05-27)

- **Fix:** Tile title bars overlay the video (like bottom controls) so auto-hide no longer leaves a dark strip or resizes/zooms the stream.
- **Fix:** Focus mode chrome auto-hide now hides tile title bars, not only the bottom control bar.

## 1.2.15 (2026-05-31)

- **Fix:** Windows shell patch zip — `Compress-Archive -Path` (was `-LiteralPath`, glob never matched; patch updates failed to build on Windows CI).
- **CI:** `package-lock.json` + `npm ci`, Go 1.24 aligned, release meta validation, patch-build integration tests; `build.yml` no longer duplicates tag releases.
- **Docs:** SYSADMIN RU/EN parity, VIEWER_API 1.2.14 examples, connection-refused vs login troubleshooting.

## 1.2.14 (2026-05-31)

- **Fix:** Connection refused on startup — clearer error (not a login problem), **Server settings** button, auto-open Settings on localhost, retry ~12s while go2rtc service starts.
- **Fix:** Login form missing `isFetchFailure` import (network error during sign-in).
- **CI:** Full git history on release build — patch meta no longer skipped; `validate-desktop-update-meta.mjs` rejects fake `changed_files: 0`.
- **Patch policy:** `go2rtc Camera Wall.exe` changes always trigger full installer (not patch zip).

## 1.2.13 (2026-05-31)

- **Fix:** Camera wall on a new PC — 401 from `/api/viewer/me` now shows **Sign in** immediately instead of staying on “Loading…” for 20s (creating a user in admin does not log the wall in).
- **Layout admin:** sub-streams (`*_sub`) are separate checkboxes; **Select all** picks main streams only.
- **Electron:** clearer 20s load-timeout message when the server URL is wrong or go2rtc is down.
- Regression tests: `viewer-session-boot.js`, layout stream partitioning.

## 1.2.11 (2026-05-30)

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
