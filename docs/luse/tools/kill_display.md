# `computer_kill_display` — Tear down a nested display + every app inside it

SIGTERMs every tracked app pid inside the display, SIGTERMs the
Xephyr/Xvfb process, and deletes the Redis state under
`luse:display:<display>` and `luse:display:<display>:apps`. Only the
session that called `computer_create_display` for this display may
call kill — D-V44-DISPLAY-OWNER-SCOPED is enforced at the manager
layer.

## Inputs

| Field     | Type   | Required | Notes                                                  |
| --------- | ------ | -------- | ------------------------------------------------------ |
| `display` | string | yes      | The display id returned by `computer_create_display`.  |

## Output

On success (caller is owner, display existed):

```json
{ "ok": true, "killed_apps_count": 2 }
```

`killed_apps_count` reflects the number of tracked app pids the
SIGTERM loop touched. Process kills are best-effort — vanished pids
(ESRCH) are silently swallowed.

On owner mismatch (D-V44-DISPLAY-OWNER-SCOPED denial):

```text
Error: not-owner — only the session that called computer_create_display can kill this display (D-V44-DISPLAY-OWNER-SCOPED)
```

surfaced via isError. The X server and Redis state are NOT touched.

On other failures (display not found, Redis unavailable):

```json
{ "ok": false, "error": "<reason>" }
```

## Side effects

- Every pid in `luse:display:<display>:apps` receives SIGTERM via the
  in-process processKillFn.
- The Xephyr/Xvfb process for the display receives SIGTERM via the
  in-memory spawn-handle map.
- Both Redis keys (`luse:display:<display>` HSET and
  `luse:display:<display>:apps` LIST) are DEL'd.
- The display id `:N` is NOT reused — the monotonic allocator never
  rewinds. A fresh `computer_create_display` returns the next free id.

## Owner-scope rule

Per D-V44-DISPLAY-OWNER-SCOPED, the kill check happens at the
manager layer:

1. Manager reads `owner_session` via HGETALL on the display's Redis
   hash.
2. If `owner_session` does not match the caller session, the manager
   returns `{ok:false, error:'not-owner'}` and performs no
   destructive action.
3. The MCP wrapper converts that discriminated-union denial into an
   isError response containing the literal string `not-owner` and a
   pointer to D-V44-DISPLAY-OWNER-SCOPED so the calling agent can
   recover.

The 4-hour idle TTL GC bypasses this rule by impersonating each
display's owner session (Phase 248-03 D-248-03-A). Agents themselves
cannot.

## When to use

- Cleanup at the end of a workflow that created a display.
- Recovering from an error — call kill in a finally block to ensure
  the display does not leak.
- Pruning a previously created display that is no longer needed.

## When NOT to use

- On a display the calling session did not create — the call will
  return `not-owner` and have no effect.
- On `:1` or any other display the agent did not create — the kill
  surface refuses to touch displays that are not in the manager's
  registry.

## Example

```jsonc
{
  "tool": "computer_kill_display",
  "arguments": { "display": ":10" }
}
// → {"ok": true, "killed_apps_count": 1}
```

## See also

- [DISPLAY-LIFECYCLE.md](../DISPLAY-LIFECYCLE.md) — cleanup discipline + try/finally pattern.
- [create_display.md](create_display.md) — the call that establishes ownership.
- [list_displays.md](list_displays.md) — discover `owner_session` for a display.
