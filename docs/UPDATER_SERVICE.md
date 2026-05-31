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

Windows will show a **UAC elevation prompt** when you install (same as **Run go2rtc as a Windows service** above). If the browser request fails, use option B.

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

## Windows Defender (`Trojan:Win32/Wacatac.C!ml`)

**This is a known false positive** for unsigned auto-update utilities. `go2rtc-updater.exe` downloads `go2rtc.exe` from your configured GitHub release, verifies SHA256 when configured, stops the `go2rtc` Windows service, replaces the binary, and starts the service again. That pattern matches what Microsoft’s ML heuristic (`Wacatac.C!ml`) often flags.

The official build is published only on [GitHub Releases](https://github.com/Chex4ever/go2rtc/releases) as `go2rtc-updater.exe` with a matching `go2rtc-updater.exe.sha256` file.

### Verify before you run

On the server (PowerShell):

```powershell
$hash = (Get-FileHash .\go2rtc-updater.exe -Algorithm SHA256).Hash.ToLower()
Get-Content .\go2rtc-updater.exe.sha256
# Compare with the .sha256 file from the same GitHub release
```

### Allow on a trusted server

1. Confirm the hash matches the release artifact.
2. **Enterprise:** add a Defender exclusion for the install folder (e.g. `C:\go2rtc\`) or allowlist the file hash in your EDR policy.
3. **Standalone PC:** Windows Security → Virus & threat protection → Manage settings → Exclusions → add folder.

### Report the false positive to Microsoft

After verifying the hash, submit the file so Defender can whitelist future builds:

[Microsoft Security Intelligence — Submit a file](https://www.microsoft.com/en-us/wdsi/filesubmission) → **Software developer** → **Incorrectly detected as malware**.

Include: product name **go2rtc Updater**, publisher **Tesla LLC**, download URL from GitHub Releases.

### Long-term fix

Authenticode **code signing** (REF-FEAT-02) removes most SmartScreen/Defender warnings. Until then, use hash verification + exclusion on servers where the updater service is installed.

## Operator / Electron

- **Camera Wall** → Check for updates → **go2rtc** still shows download + manual service steps unless `go2rtc-updater` is installed (then updates happen automatically on schedule).
- Prefer installing **go2rtc-updater** on control-room servers for hands-off upgrades.
