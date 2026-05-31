# Viewer HTTP API

Base: `{go2rtc}/api/viewer` (plus `api.BasePath()` prefix if configured).  
No go2rtc API basic auth required when using viewer session or IP trust.

## Operator

| Method | Path | Description |
|--------|------|-------------|
| GET | `/about` | JSON: `go2rtc_version`, `viewer_ui_version`, `features`, `updates` (no login) |
| POST | `/login` | Body: `{user, password, remember?}` → sets session cookie |
| POST | `/logout` | `?forget=1` clears IP trust |
| GET | `/me` | Current user + layout list |
| GET | `/layouts` | Layout summaries for user |
| GET | `/layouts/{id}` | Layout detail + tiles |
| PUT | `/layouts/{id}/tiles` | Save tile order |

## Admin (`X-Viewer-Admin: <admin_password>`)

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/admin/users` | User CRUD |
| GET/POST | `/admin/layouts` | Layout CRUD |
| GET | `/admin/config` | Raw viewer config |

## Desktop app updates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/desktop/update?platform=win32&from=X.Y.Z` | JSON: `version`, `update_kind` (`none` \| `patch` \| `full`), `shell_changed`, `download_url`, optional `patch_from`, `patch_url`, `patch_sha256`, `notes`, `source`, `release_url` |
| GET | `/desktop/download` | Full installer (local path or redirect to GitHub asset) |
| GET | `/desktop/patch/download?from=X.Y.Z` | Patch zip when `update_kind` is `patch` (local or GitHub redirect) |

**Progressive updates:** pass installed app version as `from`. When only the web viewer changed, `update_kind` is `none` — no desktop download. When the Electron shell changed, CI may publish `go2rtc.Camera.Wall.Patch.{from}-{to}.zip` for a small in-place update; otherwise `update_kind` is `full` (NSIS installer).

Configure in `go2rtc.yaml`:

**GitHub Releases (recommended with CI):**

```yaml
viewer:
  desktop:
    github: "YOUR_ORG/go2rtc"
    cache_ttl: 10m
    notes: "Optional text shown in the update dialog"
```

Response includes `"source": "github"` and a `download_url` pointing at the latest release asset (Camera Wall Setup `.exe`).

**Local mirror on disk:**

```yaml
viewer:
  desktop:
    version: "1.2.14"
    installer: "desktop/go2rtc.Camera.Wall.Setup.1.2.14.exe"
    patch: "desktop/go2rtc.Camera.Wall.Patch.1.2.13-1.2.14.zip"
    patch_from: "1.2.13"
    patch_sha256: "..."
    shell_changed: true
    notes: "Optional text shown in the update dialog"
```

Example **viewer-only** local entry (no desktop download when `from` matches):

```yaml
viewer:
  desktop:
    version: "1.2.14"
    installer: "desktop/go2rtc.Camera.Wall.Setup.1.2.14.exe"
    shell_changed: false
    notes: "Reload viewer (Ctrl+R) — web UI only"
```

Set `shell_changed: false` when only `www/viewer/**` changed (viewer-only release). CI sets `update_kind: none` in `desktop-update-meta-*.json` when shell manifests are identical.

Static alternative: `/viewer/desktop/update.json` on the web root.

## go2rtc server binary updates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/go2rtc/update?platform=windows&arch=amd64` | JSON: `running_version`, `version`, `download_url`, `source`, `release_url`, `notes`, `sha256` |
| GET | `/go2rtc/download` | Local binary stream or redirect to GitHub asset |

Configure in `go2rtc.yaml`:

```yaml
viewer:
  go2rtc:
    github: "YOUR_ORG/go2rtc"
    cache_ttl: 10m
```

Or local mirror:

```yaml
viewer:
  go2rtc:
    version: "1.2.14"
    binary: "releases/go2rtc_1.2.14_windows_amd64.exe"
    sha256: "…"
```

Static alternative: `/viewer/go2rtc/update.json`. See [RELEASE_CI.md](RELEASE_CI.md).

## Updater service (Settings UI)

Used by **`/config.html` → Settings → Install updater service** (Windows). Proxies to the separate `go2rtc-updater` process when configured.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/updater?action=updater-status` | Service installed / running state |
| POST | `/api/updater?action=install-updater` | Install Windows service |
| POST | `/api/updater?action=uninstall-updater` | Remove Windows service |
| POST | `/api/updater?action=check-now` | Check for newer go2rtc binary (uses `updater:` config) |
| POST | `/api/updater?action=apply-now` | Run `go2rtc-updater run-once` (stop service, replace exe, restart; UAC) |

Configure the updater binary in `go2rtc.yaml`:

```yaml
updater:
  enabled: true
  auto_apply: true
  interval: 6h
  github: "YOUR_ORG/go2rtc"
```

See [UPDATER_SERVICE.md](UPDATER_SERVICE.md).

## Web UI

- `/viewer/` — camera wall (`?auto_open=1&default_layout=wall_25` for kiosk)
- `/viewer/admin.html` — admin UI

**Desktop vs web:** the Electron app loads `/viewer/` from the configured server URL. If go2rtc is unreachable, you see **Cannot open camera wall** (not the login form). After the server responds, unauthenticated users get **Sign in**. Creating a user in admin does not log the wall in — see [SYSADMIN_EN.md](SYSADMIN_EN.md) troubleshooting.

Per-tile **debug** (🐞 on tile controls): layout channels, `/api/streams`, WebRTC/WebSocket state, event log, copy JSON report — for black-tile troubleshooting. Controls appear on **tile hover**.

**About** — wall header / layouts / login, or Electron menu **About Camera Wall…** — shows go2rtc version, viewer UI version, desktop app version, update sources.
