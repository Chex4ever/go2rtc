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

1. **Data model + API** — `viewer.yaml`, users, layouts, camera allow-lists, tile state.
2. **Viewer MVP** — login, IP remember, grid presets (6/7/25/36), drag rearrange.
3. **Fullscreen & controls** — 100% mode, auto-hide chrome, sound off by default, zoom/pan.
4. **Admin UI** — manage users, layouts, which cameras appear on each layout.
5. **Stream fixes (last)** — broken containers / AAC; needs deeper ffmpeg investigation.

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

- Fine-grained security (roles beyond layout matrix, HTTPS client certs, SSO).
- Mobile/tablet-optimized UI (desktop LAN browsers first).
- Record / snapshot from viewer (planned later).
- Replacing go2rtc’s stream discovery/probing — we still use streams API and `video-rtc.js` / WebRTC/MSE.
- Fixing “broken container” cameras via ffmpeg (deferred to **last phase**; not a simple strip-audio case).

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

**Decisions (2026-05-24):**

- [x] **Persistence:** `viewer.yaml` (separate from `go2rtc.yaml`) — scale is small.
- [x] **Scale:** under 5 users, **5 layouts**, up to **~25 cameras** per installation.
- [x] **Grid presets required:** layouts must support **6, 7, 25, and 36** camera tiles (admin picks preset or camera count drives template).
- [x] **Deployment:** go2rtc on a **dedicated server**; clients on **LAN only** (no public internet requirement for v1).
- [x] **Admin auth:** keep go2rtc `api.username/password` for built-in admin/config; **separate viewer users** in `viewer.yaml`.
- [ ] **Static UI path:** `/viewer/` under `www/viewer/` (default unless we change).

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
    grid: 25          # preset: 6 | 7 | 25 | 36 (columns×rows template)
    cameras: [cam1, cam2, ...]   # admin allow-list (subset of go2rtc streams)
  parking:
    grid: 6
    cameras: [cam4, cam5, cam6, cam7, cam8, cam9]

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

### Viewer API (Phase 1)

Configure in `go2rtc.yaml`:

```yaml
viewer:
  config: viewer.yaml      # default; resolved next to go2rtc.yaml
  admin_password: changeme # required for admin endpoints
  session_ttl: 24h
  trust_ip_ttl: 720h       # IP remember duration
  cookie_secure: false     # set true behind HTTPS
```

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/viewer/login` | — | JSON `{user, password, remember?}` → session cookie |
| POST | `/api/viewer/logout` | session | `?forget=1` removes IP trust |
| GET | `/api/viewer/me` | session or trusted IP | user + layout list |
| GET | `/api/viewer/layouts` | session | layouts for user |
| GET | `/api/viewer/layouts/{id}` | session | grid, cameras, saved tiles |
| PUT | `/api/viewer/layouts/{id}/tiles` | session | JSON `{tiles:[...]}` |
| GET/PUT | `/api/viewer/admin/config` | `X-Viewer-Admin` | full `viewer.yaml` body |
| GET/PUT/DELETE | `/api/viewer/admin/users` … | admin header | user CRUD |
| GET/PUT/DELETE | `/api/viewer/admin/layouts` … | admin header | layout CRUD |

---

## Issue 1: FFmpeg / broken container (deferred — last phase)

**Status:** Not a simple AAC strip-audio case. ffmpeg may refuse to decode **video-only** when the **container/mux is invalid**, so workarounds need deeper investigation (probe, remux, or full transcode path per camera).

### What we know

- Some cameras fail inside go2rtc/ffmpeg with mux/container errors, not only “bad AAC”.
- Dropping audio in yaml helps on some devices but is **not sufficient** for all.
- Until fixed server-side, viewer should still use **`media=video`** and **muted by default** so browsers do not autostart broken audio tracks.

### Phase 5 tasks (when we get to it)

- [ ] Capture `ffprobe -show_streams -show_format` + go2rtc log for one failing camera.
- [ ] Classify: invalid MP4/FLV wrap, ADTS vs ASC, duplicate timestamps, etc.
- [ ] Per-camera ffmpeg child in `go2rtc.yaml` (remux vs transcode — case by case).
- [ ] Document known-bad models in config comments.

**Interim:** use direct RTSP/child streams that already work; exclude broken streams from layout allow-lists until Phase 5.

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

### Grid presets (6 / 7 / 25 / 36)

Layouts declare a **grid preset** (tile count + default rows/cols). User drag-resize stays within that grid.

| Preset | Suggested template | Notes |
|--------|-------------------|--------|
| **6** | 3×2 or 2×3 | Small wall |
| **7** | 4×2 with one double-height, or 3×3 with 2 empty | Asymmetric OK |
| **25** | 5×5 | Common control-room density |
| **36** | 6×6 | Max wall; verify LAN bandwidth (~25 streams active) |

Implementation: CSS grid with fixed slots; map `layout.cameras[]` to slots (1:1 up to preset size; admin must not assign more cameras than preset).

---

## Implementation phases

### Phase 0 — Done

- [x] Restart reloads config on Windows (`internal/api` restart fix + tests)

### Phase 1 — Viewer backend + schema — **done**

- [x] `viewer.yaml` schema + load/save (`internal/viewer/`)
- [x] Login + session cookie + **IP remember** (LAN `RemoteAddr` / `X-Forwarded-For`)
- [x] CRUD API for layouts, users, allow-lists, tile state
- [x] `/api/viewer/*` bypasses go2rtc basic auth (module auth only)
- [ ] CORS: use existing `api.origin: "*"` if needed for cross-host viewer (Phase 2 UI)

See [`docs/viewer.yaml.example`](viewer.yaml.example) and **Viewer API** section below.

### Phase 2 — Viewer UI MVP — **done**

- [x] `www/viewer/` — login, layout picker, camera wall
- [x] Grid presets **6 / 7 / 25 / 36**
- [x] Drag tiles to swap positions; auto-save to API
- [x] `viewer-stream`: video only, muted, lazy connect when visible
- [x] `/viewer/` and `/api/ws` bypass go2rtc basic auth for logged-in viewer sessions

Open **`/viewer/`** (or `{base_path}/viewer/`).

### Phase 3 — Fullscreen & interaction — **done**

- [x] **100% focus mode** — double-click tile or ⛶ button; **Esc** or **Grid** to exit
- [x] **Auto-hide chrome** — header and tile controls hide after 2s idle; reappear on mouse move / hover
- [x] **Focus top bar** — move mouse to top edge for layout switch / logout
- [x] **Zoom/pan** — +/- buttons, Ctrl+wheel; drag when zoomed
- [x] **Aspect** — cycle contain / cover / fill (◫)
- [x] **Sound** — off by default; 🔇 enables audio (reconnects stream)

Open **`/viewer/`** → layout → use controls on each tile.

### Phase 4 — Admin UI (2–3 days)

- [ ] Edit users, layout ↔ cameras, grid preset
- [ ] Optional: link from `www/config.html` for operators who already use go2rtc admin

### Phase 5 — Broken container / ffmpeg (last, TBD)

- [ ] Investigate per failing camera (see Issue 1)
- [ ] Per-stream yaml fixes; no global recompress

### Later (not v1)

- [ ] Mobile/tablet layout
- [ ] Record / snapshot from viewer
- [ ] SSO / reverse proxy in front of viewer (server already separate)

---

## Decisions log

| Question | Answer |
|----------|--------|
| Users / layouts / cameras | under 5 users, 5 layouts, ~25 cameras; **YAML** |
| Grid sizes | **6, 7, 25, 36** presets |
| Deployment | Dedicated go2rtc server; **LAN clients only** |
| Mobile v1 | **No** |
| Record / snapshot | **Later** |
| ffmpeg errors | **Deferred** — broken container, needs deeper work; not blocking UI phases 1–4 |

---

## References

- Built-in player: [`www/README.md`](../www/README.md)
- FFmpeg sources: [`internal/ffmpeg/README.md`](../internal/ffmpeg/README.md)
- Streams API: [`internal/streams/README.md`](../internal/streams/README.md)
- go2rtc `local_auth` (loopback skips auth): `internal/api/api.go` — different from IP-trust viewer auth we plan
