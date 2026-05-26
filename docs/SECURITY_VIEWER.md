# Camera wall — security model (LAN deployment)

This fork targets **private LAN** control rooms, not public internet exposure.

## Trust assumptions

| Mechanism | Strength | Notes |
|-----------|----------|--------|
| Viewer user/password | Low | Stored in `viewer.yaml` as **plaintext** (v1); protect file permissions |
| **Remember device (IP)** | LAN trust | Same user auto-restored from client IP; required for zero-click morning start |
| Viewer admin | Header `X-Viewer-Admin` = `viewer.admin_password` | Replay on LAN if HTTP; use HTTPS on untrusted segments |
| go2rtc API auth | Separate | Viewer bypasses API basic auth when logged in; config pages may still require API user |

## What is protected

- Layouts and camera allow-lists per user (`viewer.yaml`)
- Snapshots/recordings API only for cameras on the user’s layouts
- `/api/viewer/*` uses viewer session cookie or IP trust

## Electron desktop

- Loads viewer only from configured go2rtc server URL
- Optional `allowInsecureHttps` ignores TLS certificate errors (LAN self-signed only)
- Updates download only from the same server (`/api/viewer/desktop/*`)

## Hardening (optional)

- HTTPS reverse proxy in front of go2rtc
- Firewall :1984 to camera VLAN only
- Do not expose viewer admin or YAML editor to WAN
- Future: password hashing (`REF-SEC-01` in `REFACTORING_TODO.md`)

## Zero-click morning start

Not weaker security: still requires prior login with **Remember this device** or valid session cookie. Power-on only skips layout picker, not authentication.
