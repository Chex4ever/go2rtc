# Camera wall — sysadmin guide (English)

Short guide for deploying **go2rtc** with the **custom camera wall viewer** (users, layouts, dual streams).  
For full upstream go2rtc options see the main [README.md](../README.md).

---

## What you get

| Component | Purpose |
|-----------|---------|
| **go2rtc** | Connects to cameras (RTSP, ONVIF, …), serves video to browsers |
| **Camera wall** (`/viewer/`) | Operators log in, open a layout, watch many cameras at once |
| **Viewer admin** (`/viewer/admin.html`) | You manage users, layouts, camera lists, preview mappings |

Typical scale: **dedicated LAN server**, up to **~5 users**, **5 layouts**, **~25 cameras**.

---

## Architecture

```text
  Operators (browser, LAN)
         │
         │  http://SERVER:1984/viewer/
         ▼
  ┌──────────────────────────────────────┐
  │  go2rtc.exe                          │
  │  ┌────────────┐  ┌─────────────────┐ │
  │  │ streams    │  │ viewer module   │ │
  │  │ (cameras)  │  │ users, layouts  │ │
  │  └─────┬──────┘  └────────┬────────┘ │
  │        │                  │          │
  │        └────────┬─────────┘          │
  │                 ▼                    │
  │         WebRTC / MSE playback        │
  └──────────────────┬───────────────────┘
                     │ RTSP / ONVIF / …
                     ▼
               IP cameras
```

**Two config files:**

| File | Who edits | Contents |
|------|-----------|----------|
| `go2rtc.yaml` | Sysadmin | Camera URLs (`streams:`), API listen port, ffmpeg, **viewer module toggle** |
| `viewer.yaml` | Sysadmin (via admin UI or editor) | Viewer users, layouts, which cameras each user sees |

---

## Dual streams (grid vs fullscreen)

To save bandwidth on multi-camera walls, each layout can use **two go2rtc stream names per camera**:

| Mode | Stream used | Quality |
|------|-------------|---------|
| **Grid** (many tiles) | **Preview** (sub-stream) | Lower resolution / bitrate |
| **Fullscreen** (one tile) | **Main** stream | Full quality |

```text
  go2rtc.yaml                    viewer.yaml (layout)
  ─────────────                  ────────────────────
  cam1      ── main RTSP    ──►  cameras: [cam1, …]
  cam1_sub  ── sub RTSP      ──►  preview:
                                    cam1: cam1_sub
```

Operators always see logical name **cam1** on the wall; the UI picks the right stream automatically.

**Example `go2rtc.yaml` streams:**

```yaml
streams:
  cam1: rtsp://admin:pass@192.168.1.101/stream1
  cam1_sub: rtsp://admin:pass@192.168.1.101/stream2
  cam2: rtsp://admin:pass@192.168.1.102/h264
  cam2_sub: rtsp://admin:pass@192.168.1.102/h264?subtype=1
```

If preview is not set, the same stream is used everywhere.

### Hikvision DVR / ISAPI (analog cameras via NVR)

On Hikvision NVR/DVR units, main and sub streams use **RTSP channel IDs** in the path (this is separate from the `isapi://` scheme in go2rtc, which is only for **two-way audio** — see [internal/isapi/README.md](../internal/isapi/README.md)):

| Stream | Typical RTSP (camera 1 on DVR) | Typical RTSP (camera 2) |
|--------|--------------------------------|-------------------------|
| **Main** | `rtsp://user:pass@DVR:554/Streaming/Channels/101` | `…/Channels/201` |
| **Preview (sub)** | `…/Channels/102` | `…/Channels/202` |

Rule: in the three-digit channel number, change the **last digit from `1` to `2`** (101→102, 201→202). Use the sub stream for grid tiles and the main stream for fullscreen.

In **Config → Settings**, **Detect preview channels** can add `name_sub` with the `…102` URL when the main stream is already `…101`.

```yaml
streams:
  dvr_cam1: rtsp://admin:pass@192.168.1.50:554/Streaming/Channels/101
  dvr_cam1_sub: rtsp://admin:pass@192.168.1.50:554/Streaming/Channels/102
  dvr_cam2: rtsp://admin:pass@192.168.1.50:554/Streaming/Channels/201
  dvr_cam2_sub: rtsp://admin:pass@192.168.1.50:554/Streaming/Channels/202
```

---

## Layouts and grids

A **layout** = one camera wall preset:

| Grid | Tiles | Typical use |
|------|-------|-------------|
| **6** | 3×2 | Small room, reception |
| **7** | 4×2 (asymmetric) | Mixed sizes |
| **25** | 5×5 | Control room |
| **36** | 6×6 | Large wall (check LAN bandwidth) |

Rules:

- `cameras:` is the **allow-list** — only these streams may appear on that layout.
- Do not assign **more cameras than grid size** (e.g. max 25 on a 25-grid).
- **Tile order** is saved per user in `viewer.yaml` (`user_layout_state`); operators can drag tiles on desktop.

---

## Authentication (two layers)

```text
  Layer 1 — go2rtc API (go2rtc.yaml → api.username / api.password)
            Protects: config.html, raw /api/* (except viewer bypass)

  Layer 2 — Viewer (viewer.yaml + viewer.admin_password)
            Protects: /viewer/ login, layouts per user
            Admin UI: /viewer/admin.html (admin password header)
```

| URL | Login |
|-----|-------|
| `http://SERVER:1984/` | go2rtc API user (if set) |
| `http://SERVER:1984/viewer/` | **Viewer user** (from `viewer.yaml`) |
| `http://SERVER:1984/viewer/admin.html` | **Viewer admin password** (from `go2rtc.yaml`) |

**IP remember:** on login, operator can tick “Remember this device” — same LAN IP skips password until `trust_ip_ttl` expires. Suitable for fixed PCs; not strong security.

Logged-in viewers may use **snapshots** only for cameras on their layouts.

---

## Quick start (sysadmin)

### 1. Install binary and configs

Place next to each other:

```text
C:\go2rtc\
  go2rtc.exe
  go2rtc.yaml
  viewer.yaml          ← created on first run if missing
```

Copy example: [viewer.yaml.example](viewer.yaml.example).

### 2. Enable viewer in `go2rtc.yaml`

```yaml
api:
  listen: ":1984"
  # username: admin          # optional — protects built-in go2rtc pages
  # password: secret

viewer:
  config: viewer.yaml
  admin_password: changeme    # required for viewer admin UI
  session_ttl: 24h
  trust_ip_ttl: 720h          # IP remember duration
  cookie_secure: false        # set true only behind HTTPS
  desktop:                    # optional: Camera Wall app updates from this server
    version: "1.1.0"
    installer: "desktop/go2rtc Camera Wall Setup 1.1.0.exe"
    notes: "Optional release notes"
```

See [ELECTRON_VIEWER.md](ELECTRON_VIEWER.md) — **Updating the installed app**.

### 3. Add camera streams

```yaml
streams:
  cam1: rtsp://user:pass@192.168.1.101/stream1
  cam1_sub: rtsp://user:pass@192.168.1.101/stream2
```

Verify in browser: `http://SERVER:1984/` → Streams list (with API auth if enabled).

### 4. Configure users and layouts

Open **`http://SERVER:1984/viewer/admin.html`**, enter `admin_password`.

- **Users** — login name, password, allowed layout IDs  
- **Layouts** — grid size (6 / 7 / 25 / 36), camera checklist from go2rtc streams  
- **Preview streams** — map main → sub-stream for grid mode  

Or edit `viewer.yaml` directly and restart go2rtc.

### 5. Hand off to operators

URL: **`http://SERVER:1984/viewer/`**

They sign in → pick layout → wall opens. Double-click or ⛶ for fullscreen (main stream).

---

## Use cases

### Control room (25 cameras)

- One layout `wall_25`, grid **25**, all cameras in allow-list.  
- Map each camera to a **sub-stream** for preview.  
- Dedicated PC on LAN with “Remember device”.  
- Fullscreen on incident camera for main stream + snapshot (📷).

### Reception (6 cameras)

- Layout `lobby`, grid **6**.  
- Two viewer users: `reception` (lobby only), `security` (lobby + parking).

### Tablet patrol

- Same server URL; layout opens as scrollable list / 2 columns on tablet.  
- No tile drag on touch devices; ⛶ for fullscreen.

### Change camera order without admin

- Operator arranges tiles on desktop; positions auto-save to `viewer.yaml`.  
- Sysadmin only maintains stream names and allow-lists.

---

## Operator features (brief)

| Feature | Notes |
|---------|-------|
| Mute | Sound off by default; unmute per tile if stream has audio |
| Zoom / pan | Per tile; pinch on mobile |
| Snapshot | JPEG download; server fallback if player not ready |
| Record | Browser WebM from live tile (Chrome/WebRTC works best) |
| Restart | Saving settings in go2rtc web UI triggers process restart (Windows-safe) |

---

## Deployment checklist

- [ ] Server on camera VLAN or routed LAN; firewall blocks WAN to `:1984` unless intentional  
- [ ] `admin_password` and viewer user passwords changed from defaults  
- [ ] Sub-streams tested (`camX_sub`) before adding to layout preview map  
- [ ] Bandwidth: N preview streams ≈ N× sub-stream bitrate (plan for 25-wall)  
- [ ] After updating **binary**, restart service — UI is embedded in `go2rtc.exe`  
- [ ] Backup `go2rtc.yaml` + `viewer.yaml` together  

---

## Troubleshooting

| Problem | Check |
|---------|--------|
| Blank / black viewer window | Should show an **on-screen error** (server unreachable, JS error). If still blank: hard-refresh, rebuild `go2rtc.exe`, check browser console |
| “Cannot reach go2rtc” | Start go2rtc; open `http://SERVER:1984/`; fix server URL in Electron (**Ctrl+Shift+S**) |
| Desktop app won’t update | `viewer.desktop` in yaml; installer file on disk; server `version` higher than app; test `/api/viewer/desktop/update` |
| Viewer login fails | User in `viewer.yaml`, password, layout IDs spelled correctly |
| Empty layout list | User’s `layouts:` must match layout keys in `viewer.yaml` |
| Camera tile black | Stream works in go2rtc stream list; name matches layout allow-list |
| Grid OK, fullscreen bad | Main stream URL in `go2rtc.yaml`; preview map only affects grid |
| Admin UI 401 | `viewer.admin_password` in `go2rtc.yaml` |
| go2rtc pages ask login, viewer OK | Expected — viewer bypasses API basic auth; config still protected |
| Restart after config save | Use built-in restart or replace exe and restart service |

---

## Related files

| Document | Audience |
|----------|----------|
| [viewer.yaml.example](viewer.yaml.example) | Copy-paste config |
| [CUSTOM_UI_PLAN.md](CUSTOM_UI_PLAN.md) | Internal feature / dev plan |
| [README.md](../README.md) | Upstream go2rtc (streams, ffmpeg, protocols) |

**Russian version:** [SYSADMIN_RU.md](SYSADMIN_RU.md)
