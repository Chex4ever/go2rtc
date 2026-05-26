# Releases & auto-update (GitHub + CI/CD)

This fork publishes **go2rtc** binaries and the **Camera Wall** installer via GitHub Releases. Running go2rtc exposes update metadata to the desktop app and other clients.

## CI/CD workflow

File: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

| Trigger | Action |
|---------|--------|
| Push tag `v*` (e.g. `v1.2.1`) | Build + publish release |
| **Actions → Release → Run workflow** | Manual release with input tag |

### Jobs

1. **build-go2rtc** — Windows (amd64, 386) + Linux (amd64, arm64) with embedded version `-X internal/app.Version=…`
2. **build-desktop** — Windows NSIS installer (`npm run dist`)
3. **publish** — Upload assets + `release-manifest.json` to GitHub Release

### Asset names (important)

Windows 64-bit binary must match:

`go2rtc_{VERSION}_windows_amd64.exe`

Example: `go2rtc_1.2.1_windows_amd64.exe`

The update API picks assets by substring `windows_amd64`.

## Auto-update configuration

### go2rtc server (GitHub — recommended)

In `go2rtc.yaml`:

```yaml
viewer:
  go2rtc:
    github: "YOUR_ORG/go2rtc"   # e.g. Chex4ever/go2rtc
    cache_ttl: 10m
    notes: "Тесла build — replace go2rtc.exe and restart the service"
  desktop:
    version: "1.2.1"
    installer: "releases/go2rtc Camera Wall Setup 1.2.1.exe"
```

- **`viewer.go2rtc.github`** — uses GitHub Releases API (`/releases/latest`), no manual version bump on the server.
- **`viewer.desktop`** — optional local path to the Camera Wall installer (same as before).

### go2rtc server (local mirror — air-gapped)

```yaml
viewer:
  go2rtc:
    version: "1.2.1"
    binary: "releases/go2rtc_1.2.1_windows_amd64.exe"
    sha256: "…"
    notes: "Internal build"
```

## HTTP API

| Endpoint | Description |
|----------|-------------|
| `GET /api/viewer/go2rtc/update?platform=windows&arch=amd64` | JSON: `running_version`, `version`, `download_url`, `source` (`github` or `local`) |
| `GET /api/viewer/go2rtc/download` | Serves local binary or redirects to GitHub asset |

See [VIEWER_API.md](VIEWER_API.md).

## Desktop app

- **File → Check for updates…** — checks **Camera Wall** and **go2rtc** in one dialog.
- Startup (if enabled) — silent check for both.
- go2rtc download: saves `go2rtc.exe` to temp; operator replaces binary and restarts the Windows service.

## Creating a release (checklist)

1. Bump `desktop/electron-viewer/package.json` version if needed.
2. Commit; tag: `git tag v1.2.1 && git push origin v1.2.1`
3. Wait for **Release** workflow on GitHub Actions.
4. On each site:
   - Set `viewer.go2rtc.github` to your repo (or copy binaries from the release).
   - Copy Camera Wall installer to a path referenced by `viewer.desktop.installer`.
   - Restart go2rtc.

## Fork note

Default upstream is [AlexxIT/go2rtc](https://github.com/AlexxIT/go2rtc). Point `viewer.go2rtc.github` at **your** fork so clients pull your tags, not upstream.
