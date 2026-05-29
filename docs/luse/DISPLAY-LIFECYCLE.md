# Luse Display Lifecycle

Luse exposes four MCP tools — `computer_create_display`, `computer_list_displays`,
`computer_kill_display`, `computer_launch_app_in_display` — that let an agent
spawn isolated nested X servers, place apps inside them, observe what is
running, and tear them down cleanly. This document is the canonical, agent-
agnostic guide to using them. Per-tool reference docs live under
`docs/luse/tools/`.

The agent that drives this surface is responsible for cleanup discipline. The
TTL garbage collector is a safety net, not a license to leave displays running.

## When to create a display

Create a new display when the workflow needs visual isolation from the
operator's main session (`:1`) or from other agents:

- Isolated visual UAT walk for a specific app without disturbing the operator
  desktop.
- Side-by-side comparison of two or more apps running in parallel displays.
- Batch screenshot capture (headless) where there is no operator to watch and
  the resulting images are the only deliverable.
- Dry-running an unknown or untrusted app safely — input events stay inside
  the nested X server and cannot reach apps on `:1`.

## When NOT to create a display

Reuse the existing operator desktop in these cases:

- The task is a single click / type / screenshot on an app the operator
  already has open. Call `computer_application` (no `display` arg) and then
  `computer_click_mouse` / `computer_type` / `computer_screenshot` against
  `:1`.
- The task needs to interact with windows that are already open on `:1`. Use
  `computer_list_windows` against `:1` and act on the existing window IDs.
- The action will be a one-shot screenshot of the operator's current desktop
  state — creating and tearing down a Xephyr just to capture `:1` is wasted
  work.

## Mode decision matrix — Xephyr vs Xvfb

`computer_create_display` accepts `mode: "xephyr" | "xvfb"`. Default when
omitted is `xephyr` per **D-V44-DISPLAY-XEPHYR-DEFAULT**.

| Property                              | Xephyr (default) | Xvfb               |
| ------------------------------------- | ---------------- | ------------------ |
| Operator can watch what AI does       | Yes              | No                 |
| Renders to a visible nested window    | Yes              | No (virtual only)  |
| Useful for headless batch screenshots | Acceptable       | Preferred          |
| Useful for visual UAT / pair-walk     | Preferred        | No (invisible)     |
| GPU / display server required         | X11 host session | None               |
| Default for ad-hoc agent work         | Yes              | Opt-in only        |

Pick Xephyr unless the deliverable is a stream of screenshots intended only
for the agent itself. Xvfb is correct for fully unattended batch work where
nobody will look at the nested window.

## Lifecycle protocol

Every display goes through the same four steps. Skipping step 4 is the most
common mistake — the TTL GC will eventually reclaim the display at 4 hours
idle, but until then it consumes a slot and continues to register in
`computer_list_displays`.

1. `computer_create_display` → captures `{display, name, pid}`. Record the
   returned `display` (e.g. `:10`) — every subsequent call needs it.
2. `computer_launch_app_in_display({display, app, args?})` → launches the
   app in the new display and registers its pid for cleanup tracking.
3. Work against the display — every Luse tool that touches X (screenshot,
   click, type, key, scroll) accepts an optional `display` arg. Pass the
   value captured in step 1.
4. `computer_kill_display({display})` — SIGTERMs every tracked app pid, then
   the X server, then deletes the Redis state. The response includes
   `killed_apps_count`.

## Cleanup discipline

Every successful `computer_create_display` MUST be matched by a
`computer_kill_display` in the same agent session, even on the error path.
A try/finally-shaped wrapper is the safest pattern: capture the display id
on create, do the work, kill it whether the work succeeded or threw.

The 4-hour idle TTL GC (Phase 248 Plan 03) reclaims displays whose most
recent app activity is older than 4 hours. This is a safety net for the
case where the agent process crashed before reaching kill. It is NOT a
substitute for explicit cleanup. An agent that relies on the GC will
accumulate slot pressure during an active session and leave stale entries
visible to other agents calling `computer_list_displays`.

## Owner-scope rule

Per **D-V44-DISPLAY-OWNER-SCOPED**, only the session that called
`computer_create_display` for a given display may call
`computer_kill_display` on it. Other sessions calling kill receive an
isError response containing the string `not-owner`.

`computer_list_displays` is global — any session can see every display
that exists, including displays owned by other sessions. Use this to
detect collisions before naming a new display, to observe what an
operator-spawned helper session is doing, or to confirm a display still
exists before working against it.

The owner-scope rule prevents cross-session display kills but does NOT
prevent cross-session app launches. Any session can launch an app into
any display via `computer_launch_app_in_display` if it knows the display
id. Treat the display id as a soft capability handle, not a secret.

## Isolation guarantees

Apps spawned inside a nested display:

- Cannot send synthetic input events to apps on `:1` or on other
  displays. X11 input isolation applies at the server boundary.
- Are visible only inside the nested display surface (Xephyr: the host's
  nested window; Xvfb: not rendered at all).
- Are tracked by pid in `luse:display:<display>:apps` (Redis LIST). On
  kill_display, every tracked pid receives SIGTERM via the
  in-process processKillFn; the response field `killed_apps_count`
  reports how many pids the SIGTERM loop touched.

## App-placement recipes

### Recipe 1 — Open Firefox in a fresh Xephyr, screenshot, close

```jsonc
// Step 1 — create the nested display (default mode = "xephyr")
{ "tool": "computer_create_display", "arguments": {} }
// → {"display": ":10", "name": "display-10", "pid": 12345}

// Step 2 — launch Firefox inside it
{
  "tool": "computer_launch_app_in_display",
  "arguments": { "display": ":10", "app": "firefox" }
}
// → {"pid": 12346, "app_name": "firefox", "display": ":10", "kind": "binary"}

// Step 3 — screenshot the nested display
{ "tool": "computer_screenshot", "arguments": { "display": ":10" } }

// Step 4 — clean up
{ "tool": "computer_kill_display", "arguments": { "display": ":10" } }
// → {"ok": true, "killed_apps_count": 1}
```

### Recipe 2 — Side-by-side, two displays running different apps

```jsonc
// Display A — libreoffice
{ "tool": "computer_create_display", "arguments": { "name": "office" } }
// → {"display": ":10", "name": "office", "pid": 22345}
{
  "tool": "computer_launch_app_in_display",
  "arguments": { "display": ":10", "app": "libreoffice" }
}

// Display B — firefox
{ "tool": "computer_create_display", "arguments": { "name": "browser" } }
// → {"display": ":11", "name": "browser", "pid": 22346}
{
  "tool": "computer_launch_app_in_display",
  "arguments": { "display": ":11", "app": "firefox" }
}

// Confirm both are tracked
{ "tool": "computer_list_displays", "arguments": {} }
// → [{"display":":10","name":"office",...},{"display":":11","name":"browser",...}]

// Clean up — order does not matter; each kill is independent
{ "tool": "computer_kill_display", "arguments": { "display": ":10" } }
{ "tool": "computer_kill_display", "arguments": { "display": ":11" } }
```

### Recipe 3 — Headless batch screenshot capture (Xvfb)

```jsonc
// Step 1 — create a headless display
{
  "tool": "computer_create_display",
  "arguments": { "mode": "xvfb", "width": 1920, "height": 1080 }
}
// → {"display": ":12", "name": "display-12", "pid": 32345}

// Step 2 — launch the app under test
{
  "tool": "computer_launch_app_in_display",
  "arguments": { "display": ":12", "app": "chromium", "args": ["--kiosk", "https://example.com"] }
}

// Step 3 — capture N screenshots in a loop
{ "tool": "computer_screenshot", "arguments": { "display": ":12" } }
// (repeat as needed)

// Step 4 — tear down
{ "tool": "computer_kill_display", "arguments": { "display": ":12" } }
```

## Failure modes

- **Display creation race / binary missing.** If Xephyr or Xvfb is not
  installed (`xserver-xephyr` / `xvfb` packages), `computer_create_display`
  fails before allocating a display id. Surface as an isError response
  with the underlying spawn error.
- **kill on not-owner.** `computer_kill_display` returns isError with
  text containing `not-owner` when the caller session does not match
  the owner session recorded in `luse:display:<display>` HSET. The
  X server is NOT touched; the Redis state is preserved.
- **App failed to spawn.** `computer_launch_app_in_display` returns an
  isError response describing the spawn failure. The display itself
  remains alive — call `computer_kill_display` to clean it up or
  attempt a different `app`.
- **Display vanished between list and act.** Another session (or the
  TTL GC) may kill a display between a `computer_list_displays` and
  the next action. Tools that take a `display` arg return an isError
  response when the display no longer exists; re-list to recover.

## Cross-references

- [PATTERNS.md](PATTERNS.md) — screenshot-then-act, retry-with-screenshot-verify
  and other patterns that compose with the display arg passed in step 3
  above.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — named failure modes for the
  underlying X11 tooling.
- [ANTI-PATTERNS.md](ANTI-PATTERNS.md) — banned shapes that frequently
  surface when an agent forgets cleanup discipline.
- Per-tool refs: [create_display](tools/create_display.md) ·
  [list_displays](tools/list_displays.md) ·
  [kill_display](tools/kill_display.md) ·
  [launch_app_in_display](tools/launch_app_in_display.md).
