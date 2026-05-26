# Organization branding

Ship a custom look per deployment without rebuilding the app.

## In-app branding (no external tools)

**Settings → Branding → Choose logo…** runs the built-in pipeline:

- Normalizes to `logo.png`
- Square icons `icon-16.png` … `icon-512.png` on white background
- `icon.ico` / `favicon.ico` for Windows and browser tabs

Files are saved under `%APPDATA%\go2rtc-viewer\branding\`. The app window icon updates immediately.

**Export branding kit** copies `branding.json`, all icons, and `DEPLOY.txt` for IT to deploy on the go2rtc server (`www/viewer/icons/`).

## Developer: regenerate shipped defaults

From repo-root **`tesla.png`**:

```bash
cd desktop/electron-viewer
npm run icons
```

Updates `branding/`, `build/icon.ico`, and `www/viewer/icons/`.

## Option A — files next to the installed app (recommended for IT)

After install, edit (or replace):

```text
%APPDATA%\go2rtc-viewer\branding\
  branding.json
  logo.png
```

Or for **packaged** builds, place files in:

```text
<install dir>\resources\branding\
  branding.json
  logo.png
```

## Option B — in-app settings

**File → Settings → Branding** — title, colors, organization name, logo path. Saved in `%APPDATA%\go2rtc-viewer\config.json`.

## `branding.json` fields

| Field | Description |
|-------|-------------|
| `productName` | OS app name (taskbar tooltip source) |
| `windowTitle` | Main window title; also applied to viewer page title |
| `settingsTitle` | Settings dialog title |
| `accentColor` | CSS hex color injected into viewer (buttons/headers) |
| `orgName` | Optional banner text at top of viewer |
| `footerText` | Optional footer in viewer (small) |
| `logoFile` | Filename relative to the same `branding/` folder |

## Example (Acme Corp)

```json
{
  "productName": "Acme Video Wall",
  "windowTitle": "Acme Security — Camera Wall",
  "settingsTitle": "Acme viewer settings",
  "accentColor": "#c62828",
  "orgName": "Acme Corporation",
  "footerText": "Support: security@acme.example",
  "logoFile": "acme-logo.png"
}
```

Copy `acme-logo.png` into the same folder. Logo is shown in Settings and as a small mark in the viewer header injection.
