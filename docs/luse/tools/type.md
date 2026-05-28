# `type` — Type a string into the focused window

Send literal characters to whichever window currently has X focus.

## Inputs

| Field      | Type              | Required | Default | Notes                                     |
| ---------- | ----------------- | -------- | ------- | ----------------------------------------- |
| `text`     | string            | yes      | —       | Sent verbatim; Unicode supported.         |
| `delay_ms` | integer (≥ 0)     | no       | `12`    | Per-character delay; raise for slow apps. |

## Output

```json
{ "ok": true }
```

On failure:

```json
{ "ok": false, "error": "<reason>" }
```

`error` reasons include `"no_focused_window"` (X reports no focused
client), `"display_unavailable"`, and `"xdotool_failed"`.

## Safety

- **Do not pass secrets in `text`.** Tool arguments may be logged by the
  orchestrator. For passwords and API keys, place the value in the
  clipboard out-of-band (e.g. via a host-side script the operator
  triggers) and paste with `key` `ctrl+v`.
- `type` does not change focus. If the wrong window is focused the
  characters land somewhere unintended — `click` on the target input
  first, then screenshot to confirm focus, then `type`.
- Newlines in `text` send literal Enter keypresses. For deliberate Enter,
  prefer `key` with `"return"` so the intent is obvious in logs.

## Minimal example

```jsonc
// After clicking into a search box and verifying focus:
{
  "tool": "type",
  "arguments": { "text": "wi-fi settings" }
}
```
