# Viewer HTTP API

Base: `{go2rtc}/api/viewer` (plus `api.BasePath()` prefix if configured).  
No go2rtc API basic auth required when using viewer session or IP trust.

## Operator

| Method | Path | Description |
|--------|------|-------------|
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
| GET | `/desktop/update?platform=win32` | JSON: `version`, `download_url`, `notes`, `sha256` |
| GET | `/desktop/download` | Installer file (from `go2rtc.yaml` `viewer.desktop.installer`) |

Configure in `go2rtc.yaml`:

```yaml
viewer:
  desktop:
    version: "1.2.1"
    installer: "desktop/go2rtc Camera Wall Setup 1.2.1.exe"
```

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
    version: "1.2.1"
    binary: "releases/go2rtc_1.2.1_windows_amd64.exe"
    sha256: "…"
```

Static alternative: `/viewer/go2rtc/update.json`. See [RELEASE_CI.md](RELEASE_CI.md).

## Web UI

- `/viewer/` — camera wall (`?auto_open=1&default_layout=wall_25` for kiosk)
- `/viewer/admin.html` — admin UI
