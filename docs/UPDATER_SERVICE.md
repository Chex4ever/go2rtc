# go2rtc-updater — automatic service updates

A **separate Windows service** (`go2rtc-updater`) updates `go2rtc.exe` while the main **go2rtc** service is stopped. This is the right design: a running process cannot replace its own executable.

| Component | Role |
|-----------|------|
| `go2rtc.exe` | Camera streaming + viewer API |
| `go2rtc-updater.exe` | Periodic check → download → stop go2rtc → replace binary → start go2rtc |

The **Electron Camera Wall** app is updated separately (one-click NSIS). The updater targets the **server binary** only.

## Why not wrap go2rtc inside one exe?

- Replacing `go2rtc.exe` requires stopping the Windows service first.
- A sidecar updater service (or scheduled task) is standard for Windows services.
- Keeps go2rtc lean; updater can be optional on sites that prefer manual upgrades.

## Configuration (`go2rtc.yaml`)

```yaml
updater:
  enabled: true
  auto_apply: true
  interval: 6h
  github: "YOUR_ORG/go2rtc"
  service: go2rtc
  api_url: "http://127.0.0.1:1984"
  # target: "C:\\go2rtc\\go2rtc.exe"   # optional; auto-detected from service
```

| Field | Description |
|-------|-------------|
| `enabled` | Master switch |
| `auto_apply` | If false, only check and write status (no replace) |
| `interval` | How often to check (`6h`, `24h`, …) |
| `github` | Latest release from GitHub (recommended) |
| `version` + `binary` | Air-gapped: local file instead of GitHub |
| `service` | Windows service name (default `go2rtc`) |

Status file: `%ProgramData%\go2rtc\updater-status.json`  
HTTP API: `GET /api/updater/status`

## Install (Windows)

Place **`go2rtc-updater.exe`** next to **`go2rtc.exe`**, then either:

### A — From go2rtc Settings or API (after go2rtc is running)

Settings → **Install updater service**, or:

```http
POST /api/updater?action=install-updater
```

Windows will show a **UAC elevation prompt** (Administrator required). If go2rtc runs as a non-interactive service and UAC cannot appear, use option B instead.

### B — Command line (elevated)

```powershell
go2rtc-updater install-service -config C:\go2rtc\go2rtc.yaml
```

This registers service **`go2rtc-updater`** with `start=auto`.

## Commands

```text
go2rtc-updater run-service      # used by Windows service
go2rtc-updater run-once -config go2rtc.yaml
go2rtc-updater check -config go2rtc.yaml
go2rtc-updater install-service -config go2rtc.yaml
go2rtc-updater uninstall-service
go2rtc-updater status
```

## CI/CD

GitHub Actions [release.yml](../.github/workflows/release.yml) attaches `go2rtc-updater.exe` to each release next to `go2rtc_*_windows_amd64.exe`.

See also [RELEASE_CI.md](RELEASE_CI.md).

## Operator / Electron

- **Camera Wall** → Check for updates → **go2rtc** still shows download + manual service steps unless `go2rtc-updater` is installed (then updates happen automatically on schedule).
- Prefer installing **go2rtc-updater** on control-room servers for hands-off upgrades.
