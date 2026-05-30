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
2. **build-desktop** — Windows NSIS installer (`npm ci` + `npm run dist`)
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
    github: "Chex4ever/go2rtc"
    cache_ttl: 10m
  desktop:
    github: "Chex4ever/go2rtc"   # Camera Wall installer from GitHub Releases (no manual copy)
updater:
  enabled: true
  auto_apply: true
  github: "Chex4ever/go2rtc"
  interval: 6h
```

- **`viewer.go2rtc.github`** — server binary from latest GitHub Release.
- **`viewer.desktop.github`** — desktop app gets installer **direct download URL** from GitHub (Camera Wall Setup `.exe`).
- **`updater.github`** — `go2rtc-updater` service replaces `go2rtc.exe` automatically.

Legacy local mirror (optional):

```yaml
viewer:
  desktop:
    version: "1.2.3"
    installer: "releases/go2rtc Camera Wall Setup 1.2.3.exe"
```

- **`viewer.desktop` (local)** — serve installer from disk next to `go2rtc.yaml` (air-gapped sites).

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

## Hotfixes (patch releases)

A **hotfix is not a separate delivery channel** — it is a **patch semver release** (`v1.2.2` → `v1.2.3`) published the same way as a feature release. Installed sites pick it up via autoupdate when the new tag is the **latest non-draft, non-prerelease** on GitHub.

| Component | How clients get the hotfix |
|-----------|---------------------------|
| **go2rtc.exe** (embedded `www/viewer`) | `go2rtc-updater` service or manual replace from release asset |
| **Camera Wall (Electron)** | Progressive update: patch zip, full NSIS, or viewer-only toast (see below) |

### Progressive Camera Wall updates (since 1.2.11)

| Tier | When | Download |
|------|------|----------|
| **Viewer only** | Only `www/viewer/**` changed | 0 bytes — 5s corner toast, Ctrl+R |
| **Shell patch** | Electron shell files changed | `go2rtc.Camera.Wall.Patch.{from}-{to}.zip` |
| **Full installer** | Skip-version, Electron runtime bump, or large diff | NSIS Setup `.exe` |

Release assets (Windows desktop job):

- `desktop-shell-manifest-{version}.json` — file hashes of unpacked install (for next diff)
- `desktop-update-meta-{version}.json` — `update_kind`, `shell_changed`, patch checksum
- `go2rtc.Camera.Wall.Patch.{from}-{to}.zip` — omitted when shell unchanged or diff exceeds ~40%

First release with manifests (e.g. v1.2.11) has no patch zip; v1.2.12+ patches from the previous version automatically.

Release CI checks out **full git history** (`fetch-depth: 0`) so the previous tag resolves correctly, then runs `scripts/validate-desktop-update-meta.mjs` to ensure `desktop-update-meta-*.json` matches the manifest diff (catches bogus `changed_files: 0`).

**Reproducible Electron builds:** `desktop/electron-viewer/package-lock.json` is committed; CI and release use `npm ci`. **Go 1.24** is used in `go.mod`, `release.yml`, `viewer-desktop-test.yml`, and `build.yml`.

**CI split:** `release.yml` handles `v*` tags; `build.yml` runs on `master` pushes only (no duplicate tag builds). Viewer tests cover `./internal/release/...` and patch script integration via `patch-build-integration.test.js`.

API: `GET /api/viewer/desktop/update?from=1.2.10` returns `update_kind`, `patch_url`, `shell_changed`.

### Version rules

- Use **patch** bumps only for hotfixes: `1.2.2` → `1.2.3` (tag `v1.2.3`).
- Do **not** reuse or move an existing tag.
- Avoid suffixes like `v1.2.2-hotfix1` — semver compare uses numeric `major.minor.patch` only.
- Do **not** publish hotfixes as **Draft** or **Pre-release** if you want autoupdate to see them (`/releases/latest` skips those).

### What to bump

| Change | Bump `package.json`? | Tag + CI? |
|--------|----------------------|-----------|
| `www/viewer/*`, Go server, updater | Sync tag in CI* | Yes |
| `desktop/electron-viewer/*` | **Yes** (match tag) | Yes |
| Any CI release | **Yes** — always match tag | Yes |

\*CI now sets `package.json` from the tag before `npm run dist`. Still commit the bump on `master` before tagging so local builds match.

**Version sync rule:** GitHub tag, go2rtc binary, and Camera Wall installer filename must all use the same `X.Y.Z`. The desktop update API reports **installer filename version**, not the release tag alone — otherwise clients see “1.2.5 available” but download a 1.2.4 installer. See `.cursor/rules/release-version-sync.mdc`.

Viewer UI is embedded in `go2rtc.exe` — a **server-only** hotfix is enough for wall UI fixes unless users must install a new Electron build.

### Hotfix checklist

1. Land fix on `master` (PR + merge; see **git-ship** skill).
2. Decide patch version (next unused `v1.2.x` on [Releases](https://github.com/Chex4ever/go2rtc/releases)).
3. Set `desktop/electron-viewer/package.json` `version` to the same `X.Y.Z` as the tag (**every release**, not only when Electron code changed).
4. If `www/viewer/**` changed: bump `ViewerUIVersion` in `internal/viewer/about.go`.
5. Tag and push:

   ```powershell
   git tag -a v1.2.3 -m "Hotfix: short description"
   git push origin v1.2.3
   ```

5. Wait for **Release** workflow; confirm assets (`go2rtc_X.Y.Z_windows_amd64.exe`, `go2rtc-updater.exe`, installer filename contains `X.Y.Z`); hit `/api/viewer/desktop/update` and check `"version"` matches installer, not just tag.
6. Release notes: start with **Hotfix:** and list what changed.

Sites with `updater.github: Chex4ever/go2rtc` and `auto_apply: true` apply server binaries on schedule. Desktop: **Check for updates** or startup check.

### GitHub `latest` caveat

Autoupdate uses **`/releases/latest`** (most recently published release, not “latest on my minor line”). If you publish `v1.3.0` after `v1.2.3`, all clients are offered **1.3.0**. While a fleet stays on **1.2.x**, do not publish **1.3** until you intend to upgrade everyone — or accept that hotfixes must be the **highest** semver you publish.

### Branching (optional)

For stricter production control: maintain `release/1.2`, cherry-pick hotfixes there, tag from that branch. This fork usually tags from `master` after merge.

## Fork note

Default upstream is [AlexxIT/go2rtc](https://github.com/AlexxIT/go2rtc). Point `viewer.go2rtc.github` at **your** fork so clients pull your tags, not upstream.

## End-to-end autoupdate (CI → end user)

```text
git tag v1.2.4  →  GitHub Actions Release  →  GitHub Release assets
                                              ↓
                    go2rtc-updater (Windows service) replaces go2rtc.exe
                    Camera Wall app: Check for updates → GitHub installer URL via go2rtc API
                    Browser viewer: embedded in go2rtc.exe (updates with server binary)
```

**Operator setup once per site:**

1. Install go2rtc + enable `viewer.desktop.github` and `updater` (see yaml above).
2. Install `go2rtc-updater` Windows service (Config → Settings → Install updater service).
3. Install Camera Wall desktop; point it at your go2rtc URL.

**Developer loop (hotfix):** merge fix → `git tag vX.Y.Z` → wait for Release workflow → clients pick up within updater interval / desktop update check. See [Hotfixes (patch releases)](#hotfixes-patch-releases).
