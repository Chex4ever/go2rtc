# Local release artifacts (1.2.2)

Copy these paths in `go2rtc.yaml` next to your config:

```yaml
viewer:
  desktop:
    version: "1.2.2"
    installer: "desktop/releases/go2rtc Camera Wall Setup 1.2.2.exe"
    sha256: "29a8eea2bd572bc04310d3c2b048fc2f270751927f542a3a6ba34ac5c8f2f679"
  go2rtc:
    github: "YOUR_ORG/go2rtc"
```

- **Camera Wall** — operators use **Check for updates → Update now** (one-click silent install + restart).
- **go2rtc.exe** — `go2rtc_1.2.2_windows_amd64.exe` for manual service upgrade or GitHub Release asset name.

Rebuild: `go build` + `desktop/electron-viewer` → `npm run dist -- --config.directories.output=build-1.2.2`
