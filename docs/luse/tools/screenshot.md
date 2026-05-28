# `screenshot` — Capture the current screen

Snapshot the primary X display, optionally cropped to a region.

## Inputs

| Field    | Type                                          | Required | Default              | Notes                            |
| -------- | --------------------------------------------- | -------- | -------------------- | -------------------------------- |
| `region` | `{ "x": int, "y": int, "w": int, "h": int }` | no       | (full primary display) | Pixels; clamped to display size. |

## Output

```json
{
  "ok": true,
  "image_path": "/tmp/luse/2026-05-28T05-40-12.png",
  "base64": "iVBORw0KGgoAAAA…"
}
```

Either `image_path` or `base64` is always populated. The MCP server may
return both when the image is small; for large captures only `image_path`
is returned to avoid blowing the message budget. On failure:

```json
{ "ok": false, "error": "<reason>" }
```

`error` reasons include `"display_unavailable"`, `"scrot_failed"`, and
`"region_invalid"` (zero or negative width/height).

## Safety

- Screenshots may contain PII visible on the desktop — open chats,
  visible filenames, notification badges. Do not echo screenshots into
  third-party logs without operator consent.
- If the agent only needs to verify a single UI element, prefer a
  bounded `region` over a full-screen capture. Smaller images parse
  faster and leak less.
- A screenshot is the cheapest tool in the Luse set; call one before
  every `click` / `type` / `key` action to ground coordinates on the
  current frame.

## Minimal example

```jsonc
// Full screen capture before locating a button:
{
  "tool": "screenshot",
  "arguments": {}
}

// Region capture around the system tray (right edge of a 1920×1080 display):
{
  "tool": "screenshot",
  "arguments": { "region": { "x": 1700, "y": 0, "w": 220, "h": 40 } }
}
```
