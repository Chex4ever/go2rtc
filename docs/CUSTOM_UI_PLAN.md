# Custom viewer & access control — plan

Living document for the iRidi go2rtc fork. Update checkboxes and “Decisions” as we go.

---

## How to work efficiently with the agent

**One long message is fine for discovery** (like your last message). For implementation, smaller chunks work better:

| Approach | When to use |
|----------|-------------|
| **One topic per task** | e.g. “Fix AAC cameras in config”, “MVP login + layout grid”, “Fullscreen chrome” |
| **Reference this doc** | “Implement Phase 2 from `docs/CUSTOM_UI_PLAN.md`” |
| **Order by dependency** | Server/config fixes → API/auth → viewer shell → polish |

Suggested message split for upcoming work:

1. **Stream fixes** — AAC/audio stripping in `go2rtc.yaml` / ffmpeg templates (no new UI).
2. **Data model + API** — users, layouts, camera allow-lists, saved tile positions (JSON file or SQLite).
3. **Viewer MVP** — login, pick layout, grid of cameras from allow-list, drag rearrange.
4. **Fullscreen & controls** — 100% mode, auto-hide chrome, sound off by default, zoom/pan.
5. **Admin UI** — manage users, layouts, which cameras appear on each layout.

The agent can handle multi-topic messages but will deliver faster, reviewable PRs when tasks are phased.

---

## Product summary

### Goals

- **Custom web UI** (not replacing go2rtc admin/config pages unless we choose to).
- **Multiple layouts** per installation; each layout has an **admin-defined camera pool**.
- **Users** see only layouts they are allowed to use; within a layout they **arrange tiles** (positions/sizes) themselves.
- **Light auth**: username/password; **remember by client IP** so repeat visits from the same IP skip login (acceptable for LAN; not strong security).
- **100% view**: single-camera (or full-tab) mode with minimal UI; chrome appears on mouse movement.
- **Sound off by default** on every stream start.
- **Display**: correct aspect ratio in the browser when possible; zoom/pan without full ffmpeg re-encode unless necessary.

### Non-goals (for v1)

- Fine-grained security (roles beyond layout matrix, HTTPS client certs, etc.).
- Replacing go2rtc’s stream discovery/probing — we still use streams API and `video-rtc.js` / WebRTC/MSE.

---

## Architecture (proposed)

```
┌─────────────────────────────────────────────────────────────┐
│  Browser: viewer/ (new static app or www/viewer/)           │
│  - Login, layouts, grid, fullscreen, zoom/pan               │
│  - Uses existing video-stream.js / video-rtc.js             │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + WS (go2rtc)
┌──────────────────────────▼──────────────────────────────────┐
│  go2rtc + new module: internal/viewer/ (or internal/portal/) │
│  - GET/POST /api/viewer/session                             │
│  - CRUD /api/viewer/users, /layouts, /permissions           │
│  - Persist: viewer.yaml OR SQLite alongside go2rtc.yaml     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Existing streams, ffmpeg, api, webrtc                        │
└───────────────────────────────────────────────────────────────┘
```

**Decisions (fill in):**

- [ ] Persist viewer data in `viewer.yaml` vs SQLite vs extra keys in `go2rtc.yaml`
- [ ] New path prefix: `/viewer/` static vs embed under `www/`
- [ ] Reuse go2rtc `api.username/password` for admin only, separate viewer users

---

## Data model (draft)

```yaml
# viewer.yaml (example)
users:
  alice:
    password: "..."          # or hash if we bother later
    layouts: [lobby, parking]
  bob:
    password: "..."
    layouts: [lobby]

layouts:
  lobby:
  parking:

# Per layout: admin sets allowed stream names (must exist in go2rtc streams)
layout_cameras:
  lobby: [cam1, cam2, cam3]
  parking: [cam4, cam5]

# Per user + layout: saved UI state (admin does NOT edit)
user_layout_state:
  alice:
    lobby:
      tiles:
        - { stream: cam1, x: 0, y: 0, w: 2, h: 2 }
        - { stream: cam2, x: 2, y: 0, w: 1, h: 1 }

# IP remember (optional TTL)
trusted_ips:
  "192.168.1.50": { user: alice, expires: "2026-06-01T00:00:00Z" }
```

API sketch:

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/viewer/login` | user + password → session cookie + optional IP trust |
| GET | `/api/viewer/me` | current user, allowed layouts |
| GET | `/api/viewer/layouts/{id}` | allowed cameras + saved tile state |
| PUT | `/api/viewer/layouts/{id}/tiles` | save user arrangement |
| GET | `/api/viewer/admin/...` | admin CRUD (protect with separate admin secret or local only) |

Stream URLs for playback: existing `api/ws?src=...` with **`media=video`** until audio is fixed per camera.

---

## Issue 1: FFmpeg / AAC / container problems

### What usually breaks

Cameras often send **H.264 + AAC in RTSP/MP4**, but go2rtc may repackage for **WebRTC (Opus)** or **MSE (fMP4)**. Typical failures:

| Symptom | Common cause |
|---------|----------------|
| ffmpeg errors on probe/transcode | AAC **ADTS** vs **ASC** in fMP4; wrong sample rate/channels |
| MSE plays video, no audio or codec error | Browser MSE expects specific AAC in MP4 fragment |
| “Works if I drop audio” | Audio track invalid or incompatible with chosen output |

Your workaround (strip audio) is valid for **video-only** monitoring.

### Fixes (try in order — no UI required)

1. **Consumer: video only** (browser / WS):
   - `video-stream` / `video-rtc`: set `media=video` (not `video,audio`).
   - URL: `api/ws?src=camera1&media=video` (confirm param name in `video-rtc.js`).

2. **Stream definition in `go2rtc.yaml`** — per problematic camera:
   ```yaml
   streams:
     cam_bad:
       - rtsp://... #video=copy
       - ffmpeg:rtsp://...#video=copy#audio=none
   ```
   Or dedicated ffmpeg child that drops audio (exact fragment depends on your fork; see `internal/ffmpeg` README).

3. **ffmpeg template** — only if needed:
   - `-an` or `#audio=none` / map video only.
   - Avoid re-encoding video (`#video=copy`) when only audio is bad.

4. **Document “bad cameras” list** in config comments so admins know which streams are audio-less.

**Task:** Collect one failing camera’s go2rtc log line + `ffprobe` output → pick smallest fix (usually `media=video` + yaml alias).

---

## Issue 2: Wrong aspect ratio — browser vs ffmpeg

### Prefer browser first (no recompress)

| Technique | Use case |
|-----------|----------|
| `object-fit: contain` | Show full frame, letterbox/pillarbox in tile |
| `object-fit: cover` | Fill tile, crop edges |
| CSS `aspect-ratio` on tile from known DAR (optional metadata API later) |
| **Pan/zoom** | `transform: scale() translate()` on `<video>` or wrapper; wheel + drag handlers |

SAR/DAR wrong in bitstream: browser still displays encoded pixels; **contain/cover** fixes layout in the grid; **zoom** lets operator crop to useful region. Full DAR correction without transcode is limited if pixels are already stretched.

### When ffmpeg is justified

- Stream must be recorded or sent to another system that needs correct DAR in the file.
- Hardware decoder shows unusable geometry even with CSS.

Then: `ffmpeg` filter e.g. `setdar=16/9`, `scale` — **per-camera opt-in**, not global.

**v1 recommendation:** CSS + client zoom/pan; ffmpeg only per stream in yaml.

---

## UI specification

### Modes

| Mode | Description |
|------|-------------|
| **Layout editor** | Grid of tiles; drag resize/reorder; only cameras from allow-list |
| **100% view** | One tile fills tab; minimal chrome |

### Chrome behavior

**Global (100% view, mouse near top edge):**

- Change layout
- Logout
- (optional) Settings, refresh stream

**Per camera (mouse over video):**

- Drag handle (layout mode)
- Zoom in/out, reset
- Aspect: contain / cover / fill
- Mute/unmute (default **muted**; user opt-in)

**Idle:** hide all chrome after ~2s without mouse movement (configurable).

### Sound policy

- `video-stream.media = 'video'` by default, or `video` + `muted` + no autoplay unmute.
- Never autoplay with audio on page load (Safari/autoplay policies — see `www/README.md`).

### Tech base

- Extend [`www/video-stream.js`](../www/video-stream.js) / [`www/video-rtc.js`](../www/video-rtc.js) rather than rewriting WebRTC/MSE.
- New pages under `www/viewer/` (or separate Vite app built into `embed`).

---

## Implementation phases

### Phase 0 — Done / in progress

- [x] Restart reloads config on Windows (`internal/api` restart fix + tests)

### Phase 1 — Stream reliability (1–2 days)

- [ ] Identify AAC failure mode per camera (logs)
- [ ] Standard yaml pattern for “no audio” cameras
- [ ] Verify `media=video` in custom player prototype

### Phase 2 — Viewer MVP (3–5 days)

- [ ] `viewer.yaml` schema + load/save
- [ ] Login + IP remember middleware
- [ ] List layouts / cameras for user
- [ ] Grid viewer + persist tile layout

### Phase 3 — Fullscreen & interaction (2–4 days)

- [ ] 100% mode + auto-hide chrome
- [ ] Zoom/pan + object-fit modes
- [ ] Sound off by default

### Phase 4 — Admin (2–3 days)

- [ ] Admin page or API-only: users, layout ↔ cameras matrix
- [ ] Optional: link from existing `www/config.html` for superuser

---

## Open questions for you

1. **How many users/layouts/cameras** (order of magnitude)? → drives SQLite vs YAML.
2. **Same machine as go2rtc** or separate reverse proxy with SSO later?
3. **Mobile/tablet** required in v1?
4. **Record / snapshot** from viewer?
5. Can you paste **one ffmpeg error line** from a bad camera? → we lock the right yaml fix.

---

## References

- Built-in player: [`www/README.md`](../www/README.md)
- FFmpeg sources: [`internal/ffmpeg/README.md`](../internal/ffmpeg/README.md)
- Streams API: [`internal/streams/README.md`](../internal/streams/README.md)
- go2rtc `local_auth` (loopback skips auth): `internal/api/api.go` — different from IP-trust viewer auth we plan
