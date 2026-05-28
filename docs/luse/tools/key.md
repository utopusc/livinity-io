# `key` — Send a keystroke or modifier combo

Dispatch a single key event or a modifier combination to the focused
window. Distinct from `type` in that `key` sends key *symbols*
(`return`, `escape`, `f5`, `ctrl+c`) rather than literal characters.

## Inputs

| Field | Type   | Required | Default | Notes                                                |
| ----- | ------ | -------- | ------- | ---------------------------------------------------- |
| `key` | string | yes      | —       | xdotool key syntax. Combine with `+` for modifiers.  |

Common values:

- Plain keys: `return`, `tab`, `escape`, `backspace`, `space`, `f1` … `f12`,
  `up`, `down`, `left`, `right`, `home`, `end`, `page_up`, `page_down`.
- Modifier combos: `ctrl+c`, `ctrl+v`, `alt+tab`, `super+l`, `ctrl+shift+t`.

## Output

```json
{ "ok": true }
```

On failure:

```json
{ "ok": false, "error": "<reason>" }
```

`error` reasons include `"unknown_key"` (xdotool did not recognise the
symbol), `"no_focused_window"`, and `"xdotool_failed"`.

## Safety

- **Modifier combos can trigger desktop-shell shortcuts.** `super+l`
  locks the screen on most distros; `ctrl+alt+t` may spawn a terminal.
  Verify with a follow-up screenshot.
- `alt+f4` closes the focused window. Confirm focus before sending
  destructive combos — closing the wrong window may lose unsaved work.
- For pasting secrets, use `key` with `ctrl+v` after the clipboard has
  been populated out-of-band. Never carry the secret in tool arguments.
- `key` does not change focus. Click the target first if needed.

## Minimal example

```jsonc
// Submit a form after typing into the focused input:
{
  "tool": "key",
  "arguments": { "key": "return" }
}

// Paste clipboard contents into the focused text box:
{
  "tool": "key",
  "arguments": { "key": "ctrl+v" }
}
```
