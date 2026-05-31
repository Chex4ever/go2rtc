# Desktop viewer (Electron)

Thin desktop client for the web camera wall. Video and auth remain on the **go2rtc server**.

## Features

| Feature | Where |
|---------|--------|
| Server URL | General tab |
| **Organization branding** | Branding tab + `branding.json` on disk |
| **Updates** | Camera Wall + go2rtc via server API / GitHub Releases |
| **Kiosk mode** | Deployment tab or `--kiosk` |
| **Auto-start at login** | Deployment tab (installed app) |
| **go2rtc admin links** | App menu → home / config / viewer admin |
| **Updates from go2rtc server** | Same server URL; menu **Check for updates…** or startup check |
| Exit kiosk / open settings | **Ctrl+Shift+S** (always) |

## Quick start

```bash
cd desktop/electron-viewer
npm install
npm start
```

**go2rtc must be running** at the configured server URL (default `http://127.0.0.1:1984`).

| What you should see | Meaning |
|---------------------|---------|
| **Login screen** (dark panel, “Camera wall”, user/password) | Server reachable — sign in with a **viewer user** from `viewer.yaml` (not the admin password) |
| **“Cannot reach go2rtc”** (red text, server hint) | Page loaded but API failed — start go2rtc or fix URL (**Ctrl+Shift+S**) |
| **“Cannot open camera wall”** (desktop only) | Electron could not load `/viewer/` at all (`ERR_CONNECTION_REFUSED`, wrong host). **Not login** — start go2rtc or set server URL (**Ctrl+Shift+S** → **Server settings…**). Since v1.2.14: clearer text, retry ~12s, auto-open Settings on localhost |
| **“Camera wall failed to start”** | JavaScript or page error — message shows the cause; reload after fixing |

You should **not** see a blank black window: errors are shown on screen.

## Organization branding

Three layers (later wins):

1. `desktop/electron-viewer/branding/default.json` (shipped)
2. Deployed files: `%APPDATA%\go2rtc-viewer\branding\branding.json` + `logo.png`
3. In-app **Settings → Branding** (saved to `config.json` and `branding/branding.json`)

**Choose logo…** accepts PNG/JPEG/WebP/BMP and **automatically** creates `logo.png`, square icons (16–512 px), and `favicon.ico` (resize + convert — no Photoshop required).

**Export branding kit** — full folder for IT (`branding.json`, all icons, `DEPLOY.txt` for copying into `www/viewer/icons/` on the go2rtc server).

**Export branding.json…** — JSON template only.

**Save & apply** keeps the camera wall open (settings closes, main window stays focused). Only **kiosk** or **server URL** changes reload the viewer; branding-only updates apply without a full page reload.

### Zero-click morning start (autostart + wall)

1. Install with **Autostart** or **Kiosk** (or enable **Start at Windows login** in Settings).
2. In **Deployment**: enable **Open last layout automatically**; set **Default layout ID** (e.g. `wall_25`) for the first visit.
3. In the web viewer, sign in once with **Remember this device** (IP trust in `viewer.yaml`).
4. On next power-on: app starts → session restored → **last layout opens** with no layout picker click.

Organization banner defaults to **Тесла** (Branding tab or shipped `branding/default.json`).

Fields: `productName`, `windowTitle`, `settingsTitle`, `accentColor`, `orgName`, `footerText`, `logoFile`.

See [desktop/electron-viewer/branding/README.md](../desktop/electron-viewer/branding/README.md).

## Kiosk

- **Settings → Deployment → Kiosk mode**, or `npm run start:kiosk`
- Fullscreen, no window frame, menu hidden, always on top
- **Ctrl+Shift+S** — open settings (e.g. to turn kiosk off)
- **View → Enter/Exit kiosk mode** when not in kiosk

## Auto-start (Windows / macOS)

**Settings → Deployment → Start at Windows login**

Use the **built installer** (`npm run dist`). Dev mode (`npm start`) may register Electron instead of the packaged app.

**Window position (multi-monitor):** there is no separate checkbox — the app remembers the last main-window position and size in `%APPDATA%\\go2rtc-viewer\\config.json` (`windowBounds`) when you move or resize it, and restores that monitor on the next launch (including after **Start at Windows login**). Kiosk mode ignores saved bounds.

## Command line

```bash
npx electron . -- --server=http://192.168.1.10:1984
npx electron . -- --kiosk --server=http://192.168.1.10:1984
npx electron . -- --branding=C:\deploy\acme-branding.json
```

## Menu — go2rtc admin

Under the app name (your **product name**):

- **go2rtc home** — `http://SERVER:1984/`
- **go2rtc config (YAML)** — `/config.html`
- **Viewer admin** — `/viewer/admin.html`

Opens in the default browser.

## Automated tests

```bash
cd desktop/electron-viewer
npm test
```

Covers:

- Config, branding, install modes (`config-core`)
- Desktop **updater** URL parsing and semver compare (`updater-core`, `updater`)
- Load-error page HTML (`load-error-page`)
- RTSP sub-stream URL detection (`stream-url-variants-lib`)
- Viewer stream-pair naming (`stream-pairs`)
- **viewer-app.js** + modules (`viewer-api`, `viewer-ui`, `morning-start`) — parse + `renderWall()` / `grid`
- **Zero-click morning** (`morning-start.test.js`, `layout-auto.test.js`)

Go tests: `go test ./internal/viewer/...` (includes desktop update API).

CI: `.github/workflows/viewer-desktop-test.yml` (JS + Go on changes under `desktop/electron-viewer/`, `www/viewer/`, `internal/viewer/`).

## Build installer

```bash
npm run dist
```

Output: `desktop/electron-viewer/build-out/go2rtc Camera Wall Setup X.Y.Z.exe` (default output folder `build-out` in `package.json`).

If the build fails with **“file is being used by another process”**, close the Camera Wall app and any `electron` dev processes, or build to a fresh folder:

```bash
npx electron-builder --config.directories.output=build-release
```

Latest build example: `desktop/electron-viewer/build-release/go2rtc Camera Wall Setup 1.2.0.exe`.

During install, after choosing the folder, you get a **radio page**:

| Option | Behavior |
|--------|----------|
| **Manual** | Normal window; shortcut only |
| **Autostart** | Normal window; starts at Windows sign-in |
| **Kiosk** | Fullscreen wall + starts at Windows sign-in |

The installer writes `%APPDATA%\go2rtc-viewer\config.json` (default server `http://127.0.0.1:1984`). Change server URL later via **Ctrl+Shift+S**. Upgrades do **not** overwrite an existing config.

Portable target was removed from the default build so every user gets this wizard; use `npm run pack` for an unpacked folder without installer.

## Updating (Camera Wall + go2rtc)

The desktop app checks the **configured go2rtc server** (`Settings → server URL`).

### On operator PCs

1. **Automatic** — about 8 seconds after startup (disable in Settings → Deployment → **Check for updates on startup**).
2. **Auto-download** — on by default (Settings → Deployment → **Download updates automatically**). When a new Camera Wall version is found, it downloads in the background and shows an **in-app card** (top-right of the wall) — not a Windows notification.
3. **Manual** — app menu **Check for updates…** checks both:
   - **Camera Wall app** — installer from server (`viewer.desktop`) or `/viewer/desktop/update.json`
   - **go2rtc server** — latest release from GitHub (`viewer.go2rtc.github`) or local binary (`viewer.go2rtc.binary`)

#### Camera Wall update flow (v1.2.21+)

| Step | What happens |
|------|----------------|
| Update found | In-app card: downloading (progress bar) or “update available” if auto-download is off |
| Download finished | Card: **Restart now** / **Later**; menu adds **Restart to install {version}…** |
| Next app start | Pending update installs **silently** (no dialog), app relaunches |
| After upgrade | In-app card: “Camera Wall updated — You are now running version …” |

Update kind (same as before):

- **Viewer-only** (`update_kind: none`) — no download; in-app notice asks you to reload (Ctrl+R).
- **Shell patch** — downloads only changed install files (~MB), applies in-place, restarts.
- **Full installer** — silent NSIS flow (~150 MB).

go2rtc: still uses a classic dialog from **Check for updates…** — download new `go2rtc.exe` → stop service → replace binary → start service (configs unchanged).

#### Update troubleshooting & logs

If Camera Wall flashes and closes after **Restart now**, or update loops fail:

| Log | Path (Windows) |
|-----|----------------|
| **Update log** (download, install, pending) | `%APPDATA%\go2rtc-viewer\logs\camera-wall-update.log` |
| **App log** (startup, crashes) | `%APPDATA%\go2rtc-viewer\logs\camera-wall.log` |
| **Pending update** | `%APPDATA%\go2rtc-viewer\pending-update.json` |
| **Install helper** (one run) | `%TEMP%\go2rtc-viewer-update-{PID}.log` |

In the desktop app: **About** → section **Logs (desktop)** (or app menu **About Camera Wall…**).

**Recovery:** delete `pending-update.json` and `install-state.json` in `%APPDATA%\go2rtc-viewer\`, then reinstall from the latest Setup `.exe` from GitHub Releases.

### Tile debug (black cameras)

On each tile, open **🐞** in the control bar. The modal shows:

- Layout channels (main / preview / playback)
- go2rtc `/api/streams` status and producer URLs
- WebSocket / WebRTC / `<video>` state and recent player events
- **Copy report** — JSON for support tickets

Use when a tile stays black but other cameras work (wrong preview stream, RTSP offline, stagger/connect queue).

### About (versions)

Check what you are running:

- **Web viewer** — **About** on the login screen, layouts page, or wall header (move the mouse to the top if the menu is hidden).
- **Electron** — application menu → **About Camera Wall…**
- **API** — `GET /api/viewer/about` → `go2rtc_version`, `viewer_ui_version`, update sources.

If **Tile debug** shows `no`, replace `go2rtc.exe` with a current build and reload (Ctrl+R).

### Publishing via GitHub (CI/CD)

Push tag `v1.2.4` → GitHub Actions workflow **Release** builds binaries + installer and attaches them to a GitHub Release.

On each site, in `go2rtc.yaml` (no manual installer copy required):

```yaml
viewer:
  go2rtc:
    github: "YOUR_ORG/go2rtc"
  desktop:
    github: "YOUR_ORG/go2rtc"
    notes: "Optional text shown in the update dialog"
```

Electron **Check for updates…** then pulls the latest Camera Wall Setup `.exe` from GitHub when `viewer.desktop.github` is set.

Full guide: [RELEASE_CI.md](RELEASE_CI.md).

### Local desktop installer only (no GitHub)

```yaml
viewer:
  desktop:
    version: "1.2.1"
    installer: "desktop/go2rtc Camera Wall Setup 1.2.1.exe"
    notes: "Optional text shown in the update dialog"
```

Steps:

1. Build: `cd desktop/electron-viewer && npm run dist`
2. Copy the `.exe` from `build-out/` to a folder on the server (path relative to `go2rtc.yaml`, e.g. `desktop/`)
3. Set `version` higher than the installed app (see `package.json` version in the build)
4. Restart go2rtc

**Alternative** — static files only: copy `www/viewer/desktop/update.json.example` → `update.json` and the installer into `static_dir/viewer/desktop/`. See [www/viewer/desktop/README.md](../www/viewer/desktop/README.md).

API endpoints (no viewer login required): `GET /api/viewer/desktop/update`, `GET /api/viewer/desktop/download`.

### Checklist (publish + verify)

1. Bump `version` in `desktop/electron-viewer/package.json` before `npm run dist`.
2. Copy installer; set `viewer.desktop.installer` path relative to **`go2rtc.yaml`** (not the exe folder).
3. Restart go2rtc; open `http://SERVER:1984/api/viewer/desktop/update` in a browser — JSON with `version` and `download_url`.
4. On a test PC: menu → **Check for updates…** — should offer download when server version is newer.

**Dev mode** (`npm start`) does not run the startup update check (only the packaged app does).

## Backlog

Improvements and refactors: [`REFACTORING_TODO.md`](REFACTORING_TODO.md) — edit priorities, then ask to implement specific `REF-*` IDs.
