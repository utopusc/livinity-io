# Luse Troubleshooting

Named failure modes the agent hits when driving the LivOS desktop, each
with a diagnostic command to run on the host and an actionable fix.
Failures cluster around the X server lifecycle, DISPLAY env propagation,
Redis reachability for the Luse MCP, and timing races between rapid
synthetic input events.

When in doubt, the first diagnostic step is always a fresh
`computer_screenshot` — many "failures" are actually a different window
having gained focus. See PATTERNS.md#pattern-5-focus-before-type for the
preventive pattern.

## Failure: Display gone away

**Symptom:** Every Luse tool call returns `{ "ok": false, "error":
"display_unavailable" }`. Previously working coordinates now produce
the same error.

**Likely cause:** The user's X session crashed, was logged out, or the
DISPLAY env value the Luse MCP captured at startup is stale. A
graphical logout (or a session restart by a power-management event)
destroys the X server the MCP was bound to.

**Diagnose:**

```bash
xdpyinfo -display "$DISPLAY"
# Expected: dump of display dimensions, depths, extensions.
# Failure: "xdpyinfo: unable to open display ':0'."
who | awk '{print $2, $5}'
# Lists active TTYs and their DISPLAY values; compare against $DISPLAY.
pgrep -a Xorg
# Confirms an X server is actually running.
```

**Fix:** Re-resolve `DISPLAY` to the live X session (typically the
value `who` shows for the logged-in graphical user), restart the
Luse MCP so it captures the new env, or wait for the next graphical
login if no session is currently up. Luse does not start X sessions —
it attaches to one that is already running.

## Failure: X server unreachable

**Symptom:** `xdpyinfo` succeeds when run as root but Luse tool calls
still fail with `display_unavailable` or `xdotool_failed`. The X
socket exists in `/tmp/.X11-unix/` but the Luse process cannot read
it.

**Likely cause:** `XAUTHORITY` is unset for the Luse MCP process, or
points at a file the MCP user cannot read. Modern GDM stores the
cookie under `/run/user/<uid>/gdm/Xauthority` with strict
permissions.

**Diagnose:**

```bash
ls -la /tmp/.X11-unix/
# Expected: X0 (or X1, …) socket owned by the X server user.
echo "$XAUTHORITY"
# Empty or stale → MCP cannot authenticate.
ls -la /run/user/$(id -u bruce)/gdm/Xauthority
# Confirms the cookie path GDM is using for the active user.
```

**Fix:** Export `XAUTHORITY=/run/user/$(id -u <user>)/gdm/Xauthority`
(or the user's actual cookie path) and `DISPLAY=:0` (or `:1`, matching
the seat shown by `who`) into the Luse MCP environment, then restart
the MCP so it inherits the new values.

## Failure: Luse MCP cannot reach Redis

**Symptom:** The Luse MCP fails to start, or starts but every tool
call returns a generic transport error. livinityd logs show
`ECONNREFUSED 127.0.0.1:6379` or `NOAUTH Authentication required`.

**Likely cause:** `REDIS_URL` is unset, the Redis password was rotated
without updating `/opt/livos/.env`, or a special character in the
password was not URL-encoded.

**Diagnose:**

```bash
sudo grep REDIS_URL /opt/livos/.env
# Confirm the URL is present and correctly URL-encoded
# (e.g. ! must appear as %21).
redis-cli -u "$REDIS_URL" ping
# Expected: PONG.
# Failure: "NOAUTH Authentication required." or "Could not connect…".
```

**Fix:** Re-read `/opt/livos/.env`, URL-encode any special characters
in the password, restart `livos.service` so livinityd (and its child
MCP servers) pick up the new env, and re-run the ping.

## Failure: Wrong DISPLAY env

**Symptom:** Screenshots succeed but show the wrong screen — typically
a blank desktop or a lock screen — even though the operator is
visibly using a different one. Clicks and key presses appear to
land in the void.

**Likely cause:** Multiple X sessions exist on the host (`:0`, `:1`,
`:10` are common for VNC / Xvfb stacks alongside the seat), and the
Luse MCP captured the wrong one. `:10` in particular is often a
headless Xvfb used by a CI harness rather than the operator's
session.

**Diagnose:**

```bash
who
# Lists each seat and its DISPLAY value.
echo "$DISPLAY"
# Compare against the seat the operator is actually on.
pgrep -af Xorg Xvfb Xwayland
# Shows every X server flavour the host is running.
```

**Fix:** Explicitly export the `DISPLAY` value of the seat actually
rendering on the target monitor, restart the Luse MCP so it re-binds,
and re-screenshot. Cross-link
KNOWN-LIMITS.md#limit-multi-monitor for the multi-output case.

## Failure: Window not focused (keystrokes leak)

**Symptom:** A `computer_type_text` or `computer_paste_text` call
returns `{ "ok": true }` but the post-action screenshot shows the
typed characters did not appear in the expected field. They land
somewhere else entirely — frequently the chat window or terminal the
user had open.

**Likely cause:** No focus change before the typing call. The active X
focus stayed on whatever window had it at the start of the workflow,
and the keystrokes went there.

**Diagnose:** Inspect the screenshot taken just before the failed
type call. The cursor blink will be in a different window — that is
where the keystrokes actually landed.

**Fix:** Call `computer_application` with the target app name (or
`computer_click_mouse` on the target field) BEFORE the typing call;
take an intermediate screenshot to confirm focus landed; THEN type.
Cross-link PATTERNS.md#pattern-5-focus-before-type.

## Failure: xdotool race conditions

**Symptom:** Rapid successive key or click calls produce intermittent
dropped characters, stuck modifier states, or first-character-missed
issues. The same workflow run twice produces different observable
output.

**Likely cause:** Too-fast successive calls outrun the X event loop's
ability to process the prior synthetic event. A modifier key held
across multiple `computer_press_keys` calls without an explicit `up`
release leaves the modifier latched, breaking the next click.

**Diagnose:** A screenshot taken right after a fast burst shows
characters dropped (e.g. typed "wifi" appears as "wfi"), or a click
that should have been plain produces a Ctrl-click context menu
because Ctrl was never released.

**Fix:** Insert `computer_wait` (100-300 ms) between rapid successive
actions; for `computer_type_text`, raise `delay_ms` from the default
12 to 30-50 for slow apps; for modifier chords, explicitly call
`computer_press_keys` with `press: "up"` for every key after the
`down` event. The five tools share xdotool / scrot under the hood —
see `docs/luse/LUSE.md` lines 1-20 for the prerequisite stack.
