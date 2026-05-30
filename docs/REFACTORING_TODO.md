# Refactoring & improvement backlog (Тесла / go2rtc fork)

**Updated:** 2026-05-31 (pass 3). **Invariant:** zero-click morning start must keep working — guarded by `morning-start.test.js`, `layout-auto.test.js`, `viewer-modules.test.js`.

## How to use this file

1. Edit freely — reorder, delete, reword.
2. Priority: `P0` · `P1` · `P2` · `P3` · `P4`
3. Status: `[ ]` todo · `[x]` done · `[-]` cancelled
4. Tell the agent: *“Do REF-xxx from REFACTORING_TODO.md”*

---

## Protected: zero-click morning start

| Piece | File |
|-------|------|
| Layout pick logic | `www/viewer/layout-auto.js` |
| Morning plan | `www/viewer/morning-start.js` → `enterAfterAuth()` in `viewer-app.js` |
| Electron URL | `?auto_open=1` via `config-core.viewerUrl()` |
| Tests | `test/morning-start.test.js`, `test/layout-auto.test.js` |

**Do not change behavior** without updating tests above.

---

## Done in refactor pass (2026-05-26)

- [x] **REF-ARCH-02** — Viewer modules: `viewer-api.js`, `viewer-ui.js`, `viewer-state.js`, `viewer-dom.js`, `viewer-wall.js`; `viewer-app.js` = auth + init
- [x] **REF-ARCH-03** — Admin split: `admin-api.js`, `admin-ui.js`, `admin-state.js`, `admin-layout-editor.js`, `admin.js`
- [x] **REF-ARCH-05** — `morning-start.js` documents auto-open contract
- [x] **REF-ARCH-06** — Electron `config-core` documented in `ELECTRON_VIEWER.md`
- [x] **REF-ARCH-07** — `docs/VIEWER_API.md`
- [x] **REF-SEC-03** — `docs/SECURITY_VIEWER.md`
- [x] **REF-SEC-01** — `[-]` **REF-ACCEPT-02** plaintext passwords v1 (documented in SECURITY_VIEWER)
- [x] **REF-OPS-01** — Ship checklist in `ELECTRON_VIEWER.md`
- [x] **REF-UX-01** — Restart hint when `allowInsecureHttps` changes
- [x] **REF-UX-03** — Desktop update note on `config.html` settings
- [x] **REF-BUG-01** — Rebuild note in SYSADMIN + CHANGELOG
- [x] **REF-CI-01** — `.gitignore` build dirs + blockmap
- [x] **REF-CI-04** — CI `go build` step
- [x] **REF-TEST-01** — Go tests (existing + desktop API)
- [x] **REF-TEST-03** — `viewer-modules.test.js` acorn parse (incl. `admin.js`)
- [x] **REF-DOC-01** — SYSADMIN 1.2.1 examples
- [x] **REF-DOC-02** — `CHANGELOG_VIEWER.md`; plan points here
- [x] **REF-DOC-04** — `VIEWER_API.md`
- [x] **REF-DOC-06** — `CHANGELOG_VIEWER.md`
- [x] **REF-REPO-01** — gitignore artifact dirs
- [x] **Тесла branding** — default org/product
- [x] **Zero-click morning** — product priority

---

## P0 — Still open

- [ ] **REF-SEC-02** — Viewer admin header auth hardening (session/token)
- [ ] **REF-UX-02** — Full `viewer.desktop` editor in config UI (yaml snippet only today)

---

## P1 — UX

- [x] **REF-UX-04** — Icons from `tesla.png`; in-app **Choose logo** + **Export branding kit** (`branding-assets.js`)
- [ ] **REF-UX-05** — Kiosk exit chord doc (partial: Ctrl+Shift+S in docs)

---

## P2 — Architecture (remaining)

- [ ] **REF-ARCH-01** — Product boundary / monorepo decision doc
- [ ] **REF-ARCH-04** — Reduce `config.html` inline script (Monaco block ~1200 lines; defer)
- [ ] **REF-ARCH-08** — Session store review
- [ ] **REF-ARCH-09** — CORS note in `CUSTOM_UI_PLAN.md` (close: use `api.origin`)
- [ ] **REF-REPO-02** — Upstream merge guide

---

## P3 — Tests & CI

- [x] **REF-CI-02** — Commit `package-lock.json` in `desktop/electron-viewer/`
- [ ] **REF-CI-03** — Windows `npm run dist` on release tag only
- [x] **REF-TEST-02** — `settings-app.test.js` parse test
- [ ] **REF-TEST-04** — E2E Playwright (optional)
- [ ] **REF-TEST-05** — MIME types regression for `static.go`
- [ ] **REF-DOC-03** — README fork section expand
- [ ] **REF-DOC-05** — RU parity for SECURITY_VIEWER link

---

## Done (releases)

- [x] **REF-FEAT-09** — go2rtc auto-update API + GitHub Releases (`viewer.go2rtc.github`)
- [x] **REF-FEAT-10** — CI/CD `.github/workflows/release.yml` + [RELEASE_CI.md](RELEASE_CI.md)
- [x] **REF-FEAT-11** — Electron checks Camera Wall + go2rtc updates together
- [x] **REF-FEAT-12** — One-click Camera Wall update (silent NSIS + restart)
- [x] **REF-FEAT-13** — `go2rtc-updater` Windows service (auto stop/replace/start go2rtc.exe)
- [x] **REF-FEAT-14** — Per-tile debug modal (`viewer-tile-debug.js`, 🐞 on wall tiles)
- [x] **REF-FEAT-15** — Camera Wall updates from GitHub (`viewer.desktop.github`)
- [x] **REF-FEAT-16** — Progressive desktop updates (patch zip, viewer-only toast, full NSIS fallback)

## P4 — Later

- [ ] **REF-FEAT-01** — macOS/Linux Electron
- [ ] **REF-FEAT-02** — Code signing
- [ ] **REF-FEAT-03** — Silent update install
- [ ] **REF-FEAT-04** — ffmpeg broken containers
- [ ] **REF-FEAT-05** — SSO
- [ ] **REF-FEAT-06** — Desktop publish wizard
- [ ] **REF-FEAT-07** — Electron periodic retry when server down
- [ ] **REF-FEAT-08** — HASS/Frigate doc
- [ ] **REF-REPO-03** — Public fork credits (Тесла vs AlexxIT)

---

## Accepted

- [-] **REF-ACCEPT-01** — Viewer inside go2rtc process
- [-] **REF-ACCEPT-02** — Plaintext passwords LAN v1
- [-] **REF-ACCEPT-03** — No native mobile app

---

## Component map

| Path | Purpose |
|------|---------|
| `www/viewer/viewer-app.js` | Entry, auth, init |
| `www/viewer/viewer-wall.js` | Wall grid, tiles, focus, tile save |
| `www/viewer/viewer-tile-debug.js` | Per-tile debug modal |
| `www/viewer/viewer-api.js` | HTTP API client |
| `www/viewer/viewer-ui.js` | Screens, chrome, errors |
| `www/viewer/viewer-state.js` | Shared state |
| `www/viewer/morning-start.js` | Zero-click plan |
| `www/viewer/layout-auto.js` | Last layout storage |
| `www/viewer/admin*.js` | Admin UI modules |
| `internal/viewer/` | Go API |
| `desktop/electron-viewer/` | Windows shell |

---

*Edit and pick next REF-* IDs.*
