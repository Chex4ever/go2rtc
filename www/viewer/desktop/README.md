# Desktop viewer updates (camera wall app)

The **installed Windows app** checks for updates on the **same go2rtc server** it uses for the camera wall (Settings → server URL).

## Option A — `go2rtc.yaml` (recommended)

Next to `go2rtc.yaml`, place the new installer and configure:

```yaml
viewer:
  admin_password: changeme
  desktop:
    version: "1.2.0"
    installer: "desktop/go2rtc Camera Wall Setup 1.2.0.exe"
    notes: "Bug fixes and layout improvements"
    sha256: ""   # optional hex SHA-256 of the .exe
```

- `installer` — path **relative to the folder containing `go2rtc.yaml`**, or an absolute path. A relative path does not work unless go2rtc knows its config file location (normal service install).
- Clients call `GET /api/viewer/desktop/update` and download via `/api/viewer/desktop/download`.

## Option B — static files only

If you use a custom `static_dir` (or embedded `www`):

1. Copy `update.json.example` → `update.json` and set `version` + `windows.url`.
2. Put the NSIS installer in this folder (same name as in `url`).
3. Restart go2rtc.

The app also tries `GET /viewer/desktop/update.json`.

## Publishing a new version

1. On a build PC: `cd desktop/electron-viewer && npm run dist`
2. Copy `build-out/go2rtc Camera Wall Setup X.Y.Z.exe` to the server.
3. Bump `version` in yaml or `update.json`.
4. Restart go2rtc.
5. On operator PCs: app menu → **Check for updates…** (or wait for startup check).

The installer replaces the app; settings in `%APPDATA%\go2rtc-viewer\config.json` are kept.

## Verify before rollout

| Step | Expected |
|------|----------|
| Browser: `/api/viewer/desktop/update` | JSON with `"version"` and `"download_url"` |
| Browser: `/api/viewer/desktop/download` | Installer file downloads |
| Desktop app (older version): **Check for updates…** | Offers download when server version is higher |
| Missing installer file on server | API returns **404** (not a silent empty response) |

Version in `package.json` (before `npm run dist`) must match `viewer.desktop.version` / `update.json`.
