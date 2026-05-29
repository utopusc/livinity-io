<!-- source-sha: 9b07b30685fa7a35d459aff31e8ba59fd4191f3e3875d5000f2e6ee951980794 -->
<!-- AUTO-GENERATED FROM docs/luse/tools/list_displays.md — DO NOT EDIT. -->

# `computer_list_displays` — Enumerate every active nested display

Returns the full set of active nested displays across all sessions on the
host. Global read — no input arguments, no owner-scope filter. Used to
detect collisions before naming a new display, to observe what other
sessions are doing, and to verify cleanup at the end of a workflow.

## Inputs

None. The MCP schema declares an empty `properties` object and no
`required` array.

## Output

JSON-stringified array of display records. One entry per active
display:

```json
[
  {
    "display": ":10",
    "name": "browser",
    "mode": "xephyr",
    "created_at": "2026-05-29T01:30:00.000Z",
    "owner_session": "s1",
    "width": 1920,
    "height": 1080,
    "last_app_at": "2026-05-29T01:31:00.000Z",
    "running_apps": ["12346", "12347"]
  }
]
```

`owner_session` is the session that called `computer_create_display`
and is the only session permitted to call `computer_kill_display` on
this display (D-V44-DISPLAY-OWNER-SCOPED). `running_apps` is the list
of pids registered via `computer_launch_app_in_display` for this
display. `last_app_at` (optional) is the ISO timestamp of the most
recent app activity — used by the 4-hour idle TTL GC to identify
reclaimable displays.

## When to use

- Before naming a new display — check that the desired name is not
  already in use by another session.
- Periodically during a long-running workflow to verify expected
  displays are still alive.
- At the end of a session to confirm every display the agent created
  has been killed (the agent's `owner_session` should not appear).

## Safety

- Treat the returned list as a snapshot. Another session (or the
  TTL GC) may add or remove entries at any time.
- Do not call `computer_kill_display` on a display whose
  `owner_session` does not match the calling session — the call
  will return a `not-owner` isError response and have no effect.

## Example

```jsonc
{ "tool": "computer_list_displays", "arguments": {} }
```

## See also

- [DISPLAY-LIFECYCLE.md](../DISPLAY-LIFECYCLE.md) — full lifecycle protocol.
- [kill_display.md](kill_display.md) — owner-scope rules for the kill call.
- [create_display.md](create_display.md) — what `owner_session` means.