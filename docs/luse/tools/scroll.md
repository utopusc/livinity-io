# `scroll` — Scroll up / down / left / right

Issue scroll-wheel events. By default scrolls at the current pointer
position; pass `x` / `y` to anchor the scroll over a specific element.

## Inputs

| Field       | Type                                          | Required | Default                | Notes                                       |
| ----------- | --------------------------------------------- | -------- | ---------------------- | ------------------------------------------- |
| `direction` | `"up" \| "down" \| "left" \| "right"`         | yes      | —                      | Vertical or horizontal scroll direction.    |
| `amount`    | integer (> 0)                                 | no       | `3`                    | Number of wheel "ticks". 3 ≈ a screen-row.  |
| `x`         | integer                                       | no       | (current pointer x)    | If supplied, the pointer is moved first.    |
| `y`         | integer                                       | no       | (current pointer y)    | If supplied, the pointer is moved first.    |

## Output

```json
{ "ok": true }
```

On failure:

```json
{ "ok": false, "error": "<reason>" }
```

`error` reasons include `"display_unavailable"`, `"xdotool_failed"`, and
`"direction_invalid"`.

## Safety

- Scroll position has no API for read-back — verify the new state by
  `screenshot` after scrolling, not by assumption.
- Anchoring the pointer (`x`, `y`) moves it as a side effect. Subsequent
  `click` calls without explicit coordinates would land on the new
  pointer position; always pass `x` / `y` to `click`.
- Excessive `amount` values (e.g. 50+) may overshoot the scrollable
  region and silently stop. Prefer multiple smaller scrolls with
  screenshot checks in between for long lists.

## Minimal example

```jsonc
// Scroll down 3 ticks at the current pointer:
{
  "tool": "scroll",
  "arguments": { "direction": "down" }
}

// Scroll a sidebar panel located on the left edge:
{
  "tool": "scroll",
  "arguments": { "direction": "down", "amount": 5, "x": 80, "y": 400 }
}
```
