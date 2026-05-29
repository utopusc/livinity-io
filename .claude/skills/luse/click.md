<!-- source-sha: 775ad2ad9c3f5f540b799461795a3b061d9b4789283bd70f407e9e1d7cfb15da -->
<!-- AUTO-GENERATED FROM docs/luse/tools/click.md — DO NOT EDIT. -->

# `click` — Mouse click at coordinates

Click a single point on the active X display.

## Inputs

| Field    | Type                          | Required | Default  | Notes                              |
| -------- | ----------------------------- | -------- | -------- | ---------------------------------- |
| `x`      | integer (pixels)              | yes      | —        | 0 = left edge of primary display.  |
| `y`      | integer (pixels)              | yes      | —        | 0 = top edge of primary display.   |
| `button` | `"left" \| "right" \| "middle"` | no       | `"left"` | Middle button is often paste on X. |
| `double` | boolean                       | no       | `false`  | Sends a double-click when `true`.  |

## Output

```json
{ "ok": true }
```

On failure:

```json
{ "ok": false, "error": "<reason>" }
```

`error` reasons include `"display_unavailable"` (no X session),
`"out_of_bounds"` (coordinates outside the display), and
`"xdotool_failed"` (the underlying invocation returned non-zero).

## Safety

- Take a `screenshot` immediately before calling `click`. Coordinates from
  an older screenshot are likely stale.
- Confirm the click landed with a follow-up `screenshot`.
- A right-click typically opens a context menu — be ready to dismiss it or
  navigate it with subsequent calls; do not assume the menu auto-closes.

## Minimal example

```jsonc
// Screenshot first (separate call) → identify the "Settings" tile at (120, 340) → then:
{
  "tool": "click",
  "arguments": { "x": 120, "y": 340 }
}
```

## See also

- [PATTERNS.md#pattern-2-landmark-anchored-clicks-not-pixel-coords](../PATTERNS.md#pattern-2-landmark-anchored-clicks-not-pixel-coords)
- [PATTERNS.md#pattern-3-retry-with-screenshot-verify-cap-3-attempts](../PATTERNS.md#pattern-3-retry-with-screenshot-verify-cap-3-attempts)
- [ANTI-PATTERNS.md#anti-pattern-1-brittle-pixel-coords-without-screenshot-verify](../ANTI-PATTERNS.md#anti-pattern-1-brittle-pixel-coords-without-screenshot-verify)