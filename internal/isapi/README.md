# Hikvision ISAPI

[`new in v1.3.0`](https://github.com/AlexxIT/go2rtc/releases/tag/v1.3.0)

## RTSP dual stream on NVR/DVR (camera wall)

Analog and IP cameras on a Hikvision recorder usually expose **two RTSP URLs per logical camera** using channel IDs in the path:

| Stream | Example path |
|--------|----------------|
| Main (high) | `rtsp://user:pass@192.168.1.123:554/Streaming/Channels/101` |
| Sub / preview (low) | `rtsp://user:pass@192.168.1.123:554/Streaming/Channels/102` |

- **101 / 102** — first camera on the DVR; **201 / 202** — second camera, etc.
- Last digit: **1** = main stream, **2** = sub stream (same rule for the iRidi viewer `*_sub` preview mapping).

Configure both in `go2rtc.yaml` or use **Config → Settings → Detect preview channels** in this fork.

## Two-way audio (`isapi://`)

This source type supports only backchannel audio for the [Hikvision ISAPI](https://tpp.hikvision.com/download/ISAPI_OTAP) protocol. It should be used as a **second** source in addition to RTSP, not as the video URL.

## Configuration

```yaml
streams:
  hikvision1:
    - rtsp://admin:password@192.168.1.123:554/Streaming/Channels/101
    - isapi://admin:password@192.168.1.123:80/
  hikvision1_sub: rtsp://admin:password@192.168.1.123:554/Streaming/Channels/102
```
