<!--
  source-sha: f25617adc1342a4b918ea2885a0824300d13cd86709cf27c19db776e083dde35

  AUTO-GENERATED FROM docs/luse/ — DO NOT EDIT.
  Re-run scripts/sync-luse-skills.sh to refresh.

  Agent: OpenClaw
  Format: PLACEHOLDER — OpenClaw skill format is not yet pinned for
  Liv AI. This file ships the canonical Luse prose as plain markdown
  so OpenClaw agents that scan their skills directory at least
  surface the capability in tool-discovery. Replace with the
  agent-native skill wrapper once the format is locked.
-->

# Luse — Computer-Use Capability for Liv AI Agents

Luse is the computer-use surface exposed inside Liv AI. Any agent dispatched by
AionUi (Aion CLI, Claude Code, OpenCode, OpenClaw, or any other MCP-speaking
client) can drive the host desktop session through five low-level tools:
`click`, `type`, `screenshot`, `key`, `scroll`.

This document is the canonical, agent-agnostic description. Per-agent skill
files are generated from this source by `scripts/sync-luse-skills.sh` — do
not hand-edit those shims.

## When to use Luse

Use Luse when the task requires direct interaction with a graphical
application on the LivOS host:

- Verify a UI state that no API exposes ("is the Wi-Fi toggle on?").
- Drive an app that has no headless / scriptable surface.
- Reproduce a user-reported visual bug.
- Walk a multi-step desktop flow (open Settings → click tab → toggle option).

Do NOT use Luse when:

- A REST / tRPC / CLI surface exists for the same action. Prefer the
  structured API — it is faster, deterministic, and leaves an audit trail.
- The task can be completed by editing config files. File I/O is cheaper
  than synthetic input.
- Secrets need to be entered. Use the clipboard path (paste via `key`
  `ctrl+v` after the secret is already in the clipboard) rather than
  feeding the secret through `type` arguments, which may be logged.

## Prerequisites

1. **Mini PC X session is running.** Luse drives an actual desktop, not a
   headless framebuffer. The session must already be up — Luse does not
   start one.
2. **Luse MCP server is active.** Registered automatically on first boot of
   `livinityd` via the Phase 241 seed orchestrator. Verify the server is
   reachable via the host's MCP catalog before issuing tool calls.
3. **Tools are X11 / xdotool / scrot based.** Wayland sessions are not
   supported. If a future LivOS release switches to Wayland, the Luse MCP
   server must be re-implemented; the tool surface described here will
   stay the same.
4. **The agent has tool-discovery on.** Luse tools appear under their
   canonical names; do not rely on aliases.

## The five tools

| Tool         | Purpose                                              | Docs                          |
| ------------ | ---------------------------------------------------- | ----------------------------- |
| `click`      | Mouse click at coordinates (left / right / middle).  | `docs/luse/tools/click.md`    |
| `type`       | Type a string into the focused window.               | `docs/luse/tools/type.md`     |
| `screenshot` | Capture the current screen (full or a region).       | `docs/luse/tools/screenshot.md` |
| `key`        | Send a keystroke or modifier combo.                  | `docs/luse/tools/key.md`      |
| `scroll`     | Scroll up / down / left / right at a point.          | `docs/luse/tools/scroll.md`   |

For a worked example covering screenshot → identify → click → verify, see
`docs/luse/LUSE-WORKFLOW.md`.

## Safety preconditions

These apply to every tool call:

- **Always screenshot before acting.** Coordinates from an older screenshot
  are unreliable — windows move, themes change, system modals appear.
- **Verify after acting.** A second screenshot confirms the action landed.
  If the second screenshot does not change in a way consistent with the
  intended action, stop and re-screenshot rather than retrying blindly.
- **Do not loop without a bound.** Agents driving Luse must cap retries.
  Unbounded click loops have historically wedged the desktop session.
- **Avoid leaking secrets in tool arguments.** `type` arguments are
  observable to the orchestrator and may be logged. For passwords / API
  keys, place the value in the clipboard via an out-of-band channel and
  paste via `key` `ctrl+v`.
- **Respect modifier shortcuts.** `key` combos like `alt+f4` close
  windows; `ctrl+alt+t` may open a new terminal. Confirm via screenshot
  that the side-effect was intended.

## Agent-agnostic guarantee

Every shim file generated under `.claude/skills/`, `.aion/skills/`,
`.opencode/skills/`, and `.openclaw/skills/` carries identical prose to
this document. Differences are confined to wrapper frontmatter and file
location. If you see drift, regenerate the shims with
`bash scripts/sync-luse-skills.sh` — never edit a shim by hand.

---

## Tool: click

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

---

## Tool: type

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

---

## Tool: screenshot

# `screenshot` — Capture the current screen

Snapshot the primary X display, optionally cropped to a region.

## Inputs

| Field    | Type                                          | Required | Default              | Notes                            |
| -------- | --------------------------------------------- | -------- | -------------------- | -------------------------------- |
| `region` | `{ "x": int, "y": int, "w": int, "h": int }` | no       | (full primary display) | Pixels; clamped to display size. |

## Output

```json
{
  "ok": true,
  "image_path": "/tmp/luse/2026-05-28T05-40-12.png",
  "base64": "iVBORw0KGgoAAAA…"
}
```

Either `image_path` or `base64` is always populated. The MCP server may
return both when the image is small; for large captures only `image_path`
is returned to avoid blowing the message budget. On failure:

```json
{ "ok": false, "error": "<reason>" }
```

`error` reasons include `"display_unavailable"`, `"scrot_failed"`, and
`"region_invalid"` (zero or negative width/height).

## Safety

- Screenshots may contain PII visible on the desktop — open chats,
  visible filenames, notification badges. Do not echo screenshots into
  third-party logs without operator consent.
- If the agent only needs to verify a single UI element, prefer a
  bounded `region` over a full-screen capture. Smaller images parse
  faster and leak less.
- A screenshot is the cheapest tool in the Luse set; call one before
  every `click` / `type` / `key` action to ground coordinates on the
  current frame.

## Minimal example

```jsonc
// Full screen capture before locating a button:
{
  "tool": "screenshot",
  "arguments": {}
}

// Region capture around the system tray (right edge of a 1920×1080 display):
{
  "tool": "screenshot",
  "arguments": { "region": { "x": 1700, "y": 0, "w": 220, "h": 40 } }
}
```

---

## Tool: key

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

---

## Tool: scroll

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

---

## Workflow

# Luse end-to-end workflow

A worked example: the operator asks Liv AI to **open the Settings app and
toggle Wi-Fi off**. The agent does not know the exact coordinates of
anything in advance — it discovers them by screenshotting and reasoning
about visual landmarks.

The pattern is always:

1. **Screenshot.**
2. **Identify.** Locate the target element by visual landmark — text
   labels, icons, panel position. Compute coordinates.
3. **Act.** Single `click` / `type` / `key` / `scroll` call.
4. **Verify.** Screenshot again. Confirm the action produced the expected
   visible change.
5. **Loop or stop.** If the goal is reached, stop. If not, repeat.

A small budget is essential: cap total iterations (e.g. 12) and total
tool calls (e.g. 30). If the agent has not converged on the goal by
then, surface the screenshots and ask the operator.

## Example: toggle Wi-Fi off

### Step 1 — survey the desktop

```jsonc
{ "tool": "screenshot", "arguments": {} }
```

The agent receives a PNG of the full desktop. It identifies the Settings
app icon on the LivOS dock at roughly `(120, 1024)` — bottom-left,
recognisable by the gear icon.

### Step 2 — open Settings

```jsonc
{ "tool": "click", "arguments": { "x": 120, "y": 1024 } }
```

### Step 3 — verify Settings opened

```jsonc
{ "tool": "screenshot", "arguments": {} }
```

The new screenshot shows the Settings window with a left-hand panel
listing `Wi-Fi`, `Bluetooth`, `Display`, etc. The agent locates the
`Wi-Fi` row at approximately `(180, 220)`.

### Step 4 — navigate to Wi-Fi pane

```jsonc
{ "tool": "click", "arguments": { "x": 180, "y": 220 } }
```

### Step 5 — verify the Wi-Fi pane is shown

```jsonc
{ "tool": "screenshot", "arguments": {} }
```

The Wi-Fi pane shows a toggle in the upper-right that visibly reads "On"
with an active accent colour at roughly `(940, 180)`.

### Step 6 — toggle Wi-Fi off

```jsonc
{ "tool": "click", "arguments": { "x": 940, "y": 180 } }
```

### Step 7 — verify the toggle flipped

```jsonc
{ "tool": "screenshot", "arguments": {} }
```

The toggle now reads "Off" with the accent colour dimmed. The agent
reports success and stops.

## When a step fails

If Step 7's screenshot still shows "On":

- **Re-screenshot.** A redraw may have been in flight.
- **Re-evaluate coordinates.** The toggle may have moved if a modal
  appeared.
- **Do not retry the same click blindly.** Identify why the first one
  missed before sending a second.

If three iterations of the same action fail, stop and surface the most
recent screenshot to the operator with a description of what was
attempted. Blind retry loops are the most common cause of wedged desktop
sessions.

## When to use `key` instead of `click`

For form submission and dialog navigation, keyboard input is often more
reliable than visual targeting:

- `key` `tab` — move focus to the next field. Faster and less brittle
  than clicking each input.
- `key` `return` — submit a focused form.
- `key` `escape` — dismiss a modal or context menu.

A common pattern: `click` into the first input, then `type` the value,
then `key` `tab`, then `type` the next value, etc. — minimising the
number of pixel-precise clicks.

## When to use `scroll`

Long lists (settings panels, app catalogues, chat histories) often need
scrolling to bring the target into view:

1. Screenshot the visible region.
2. If the target is not visible, `scroll` down by a small amount (3-5).
3. Screenshot again.
4. Repeat until the target is on-screen, then proceed with `click`.

Cap scroll iterations at 8-10 before declaring "target not found" — do
not scroll indefinitely.

## Secrets

If the workflow needs to enter a password or API key:

1. The operator places the secret in the clipboard (out-of-band; the
   agent does not request the secret).
2. The agent `click`s the password field.
3. The agent calls `key` with `ctrl+v` to paste.
4. The agent calls `key` with `return` (or clicks "Submit").

Never call `type` with the secret in `text`. Tool arguments are
observable to the orchestrator and may end up in logs.