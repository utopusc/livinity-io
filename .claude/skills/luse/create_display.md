<!-- source-sha: 6a443233b1d8a72c30552c38ce7174d8fd2ca02c30dbd7ef94428b0c2e3d2383 -->
<!-- AUTO-GENERATED FROM docs/luse/tools/create_display.md — DO NOT EDIT. -->

# `computer_create_display` — Spawn an isolated nested X server

Allocates a new nested X display under either Xephyr (visible nested window —
default) or Xvfb (headless virtual framebuffer), registers the display in
Redis under the calling session's identity, and returns the display id for
use with `computer_launch_app_in_display` and the rest of the Luse tool
surface.

## Inputs

| Field    | Type                          | Required | Default      | Notes                                                            |
| -------- | ----------------------------- | -------- | ------------ | ---------------------------------------------------------------- |
| `name`   | string                        | no       | `display-N`  | Operator-visible label. Defaulted from the allocated `:N` id.    |
| `mode`   | `"xephyr" \| "xvfb"`          | no       | `"xephyr"`   | D-V44-DISPLAY-XEPHYR-DEFAULT — visible nested window by default. |
| `width`  | number (pixels)               | no       | `1920`       | Width of the nested display surface.                             |
| `height` | number (pixels)               | no       | `1080`       | Height of the nested display surface.                            |

## Output

On success:

```json
{ "display": ":10", "name": "display-10", "pid": 12345 }
```

`display` is the X11 display literal (`:10`, `:11`, …) starting at `:10`
and incrementing monotonically per livinityd boot. `pid` is the
Xephyr/Xvfb process id for operator-side debugging — agents should NOT
rely on it for cleanup; call `computer_kill_display` instead.

On failure (binary missing, spawn error, allocator collision):

```json
{ "ok": false, "error": "<reason>" }
```

surfaced via the MCP isError envelope.

## When to use

- Visual isolation from `:1` is required (UAT walk, untrusted app, batch
  side-by-side comparison).
- Headless screenshot capture where there is no operator to watch — use
  `mode: "xvfb"`.
- Reset known-good state between independent app interactions.

## When NOT to use

- The agent only needs to interact with an app already open on `:1`. Use
  `computer_application` (no `display` arg) instead.
- A single one-shot screenshot of the operator's current desktop.

## Safety

- Every successful create MUST be matched by `computer_kill_display` in
  the same session.
- The 4-hour idle TTL GC is a safety net, not a license to skip cleanup.
- Display ids are NOT secrets — any session can launch apps into a known
  display id. Owner-scope applies to kill only.

## Example

```jsonc
// Default Xephyr at 1920x1080
{
  "tool": "computer_create_display",
  "arguments": {}
}
// → {"display": ":10", "name": "display-10", "pid": 12345}

// Named headless Xvfb at 1280x800 for batch screenshots
{
  "tool": "computer_create_display",
  "arguments": { "name": "batch-shots", "mode": "xvfb", "width": 1280, "height": 800 }
}
```

## See also

- [DISPLAY-LIFECYCLE.md](../DISPLAY-LIFECYCLE.md) — full create/work/kill protocol.
- [launch_app_in_display.md](launch_app_in_display.md) — the typical next call.
- [list_displays.md](list_displays.md) — confirm the display landed before working.