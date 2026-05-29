# `computer_launch_app_in_display` — Spawn an app inside a nested display

Launches an app with its DISPLAY environment variable scoped to the
target nested display, registers the new pid in
`luse:display:<display>:apps`, and returns the pid + resolved app
name for the agent's record. The app catalog resolution path is
shared with `computer_application` — LivOS WebApps and native
catalog entries resolve first, with `spawn(app, args)` as the
fallback for arbitrary binaries on PATH.

## Inputs

| Field     | Type              | Required | Notes                                                                  |
| --------- | ----------------- | -------- | ---------------------------------------------------------------------- |
| `display` | string            | yes      | The display id returned by `computer_create_display` (e.g. `":10"`).   |
| `app`     | string            | yes      | App identifier — LivOS catalog slug, native app name, or binary name.  |
| `args`    | string[]          | no       | Argument list passed through to the spawn call.                        |

## Output

On success:

```json
{ "pid": 12346, "app_name": "firefox", "display": ":10", "kind": "binary" }
```

`kind` discriminates the resolution path:

- `"webapp"` — LivOS WebApp dispatched through windowManager IPC. The
  `pid` field is the livinityd parent process pid (sentinel) per
  Phase 248-02 D-248-02-B; the manager's processKillFn swallows
  ESRCH on vanished sentinels.
- `"native"` — LivOS native catalog entry resolved via
  `livosAppResolver`. `pid` is the spawned process pid.
- `"binary"` — Fallback `spawn(app, args)` on a binary found on PATH.
  `pid` is the spawned process pid.

On failure (display vanished, app spawn error):

```json
{ "ok": false, "error": "<reason>" }
```

surfaced via isError.

## Behaviour

1. Validate `display` against the regex `/^:[1-9][0-9]?$/`. Hostile
   strings are dropped before any process.env mutation.
2. Resolve `app` via the LivOS catalog. WebApp / native match → emit
   `[luse-mcp] open_livos_app` IPC stderr line; binary fallback →
   `spawn(app, args, {detached:true, stdio:'ignore'})` with the
   scoped DISPLAY env.
3. Call `displayManager.attachApp({display, pid, app_name: app})` so
   the pid registers in `luse:display:<display>:apps` LIST and
   surfaces in `computer_list_displays.running_apps`.
4. Update the display's `last_app_at` Redis hash field with the
   current ISO timestamp — refreshes the TTL GC idle clock.

When `display` is omitted from the regex-validated set, the wrapper
falls back to the default DISPLAY (typically `:1`) — same behaviour
as `computer_application` without a `display` arg.

## When to use

- Launching apps inside a display you created via
  `computer_create_display`.
- Replacing an app inside an existing display — call kill_display
  first if you want a fresh display, or just launch another app
  into the same one for side-by-side testing.

## When NOT to use

- Launching apps on the operator's main desktop. Use
  `computer_application` (no `display` arg).
- Launching apps in a display owned by a different session — the
  display owner cannot enforce isolation against you, but mixing
  apps across owners makes cleanup ambiguous.

## Example

```jsonc
// Native LivOS app inside a nested display
{
  "tool": "computer_launch_app_in_display",
  "arguments": { "display": ":10", "app": "firefox" }
}
// → {"pid": 12346, "app_name": "firefox", "display": ":10", "kind": "native"}

// Binary fallback with args
{
  "tool": "computer_launch_app_in_display",
  "arguments": {
    "display": ":12",
    "app": "chromium",
    "args": ["--kiosk", "https://example.com"]
  }
}
// → {"pid": 12347, "app_name": "chromium", "display": ":12", "kind": "binary"}
```

## See also

- [DISPLAY-LIFECYCLE.md](../DISPLAY-LIFECYCLE.md) — full create/launch/work/kill protocol.
- [create_display.md](create_display.md) — the call that allocates the display.
- [kill_display.md](kill_display.md) — cleanup that SIGTERMs every launched pid.
