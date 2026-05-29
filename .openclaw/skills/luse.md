<!--
  source-sha: 21accc8c83de535c15ba42e8dfadb6ec9ee94d9f020cc7ed3b425b5d4c1d5e61

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

## See also

- [PATTERNS.md#pattern-2-landmark-anchored-clicks-not-pixel-coords](../PATTERNS.md#pattern-2-landmark-anchored-clicks-not-pixel-coords)
- [PATTERNS.md#pattern-3-retry-with-screenshot-verify-cap-3-attempts](../PATTERNS.md#pattern-3-retry-with-screenshot-verify-cap-3-attempts)
- [ANTI-PATTERNS.md#anti-pattern-1-brittle-pixel-coords-without-screenshot-verify](../ANTI-PATTERNS.md#anti-pattern-1-brittle-pixel-coords-without-screenshot-verify)

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

## See also

- [PATTERNS.md#pattern-5-focus-before-type](../PATTERNS.md#pattern-5-focus-before-type)
- [PATTERNS.md#pattern-8-secrets-via-clipboard-not-type](../PATTERNS.md#pattern-8-secrets-via-clipboard-not-type)
- [ANTI-PATTERNS.md#anti-pattern-4-sensitive-text-via-computer_type_text-instead-of-computer_paste_text--issensitive](../ANTI-PATTERNS.md#anti-pattern-4-sensitive-text-via-computer_type_text-instead-of-computer_paste_text--issensitive)

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

## See also

- [PATTERNS.md#pattern-1-screenshot-then-act](../PATTERNS.md#pattern-1-screenshot-then-act)
- [PATTERNS.md#pattern-7-scroll-and-search](../PATTERNS.md#pattern-7-scroll-and-search)

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

## See also

- [PATTERNS.md#pattern-6-modal-dismissal](../PATTERNS.md#pattern-6-modal-dismissal)
- [ANTI-PATTERNS.md#anti-pattern-3-modifier-key-collisions-with-desktop-shell](../ANTI-PATTERNS.md#anti-pattern-3-modifier-key-collisions-with-desktop-shell)

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

## See also

- [PATTERNS.md#pattern-7-scroll-and-search](../PATTERNS.md#pattern-7-scroll-and-search)

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

---

## PATTERNS

# Luse Patterns

These are reusable shapes the agent composes when driving the LivOS desktop
through Luse MCP tools. They are not rote scripts — each pattern names a
recurring sub-flow with a known failure boundary. Compose them; do not
mechanically copy them. When a real task does not fit one of these shapes,
fall back to the screenshot → identify → act → verify loop from
`docs/luse/LUSE-WORKFLOW.md`.

All examples below reference the canonical MCP tool names exposed by the
Luse server (`computer_screenshot`, `computer_click_mouse`,
`computer_press_keys`, `computer_paste_text`, `computer_type_text`,
`computer_scroll`, `computer_application`, `computer_wait`). The
Phase 242 per-tool docs under `docs/luse/tools/` cover the input/output
shape of each call; this document covers the multi-call composition.

## Pattern 1: Screenshot-then-act

**When to use:** Every state-mutating action. Coordinates from an earlier
screenshot are stale by definition once the X server has redrawn — themes
animate, modals appear, focus shifts, panels reflow. Screenshot first,
act on what you see, then screenshot again to confirm the mutation
landed.

```json
[
  { "tool": "computer_screenshot", "arguments": {} },
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 120, "y": 1024 }, "button": "left" } },
  { "tool": "computer_screenshot", "arguments": {} }
]
```

The four-call shape is screenshot → inspect (in-agent reasoning) → act →
screenshot-verify. Skip the post-action screenshot only when the next
action is itself a screenshot (e.g. inside a scroll-and-search loop).

See also: `docs/luse/tools/screenshot.md`, `docs/luse/tools/click.md`.

## Pattern 2: Landmark-anchored clicks (not pixel coords)

**When to use:** Clicking any UI element that is not the absolute first
thing on a known display. Hard-coded pixel coordinates from a prior
session are unreliable across DPI changes, window-position drift,
desktop-shell theme changes, and panel reflow on resize.

Locate a stable visible label via screenshot OCR or a known UI string,
compute the click target as an offset from that landmark, then click.
Never paste a raw `{ "x": 842, "y": 316 }` from a previous run without a
fresh screenshot.

```json
[
  { "tool": "computer_screenshot", "arguments": {} },
  /* agent reasoning: located "Wi-Fi" label at row y=220, computed toggle
     at x=940 (right edge of the panel found in the same screenshot) */
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 940, "y": 220 }, "button": "left" } }
]
```

The coordinates are still pixel values — Luse has no DOM — but they are
derived from the current frame, not memorised from a previous one.

See also: `docs/luse/tools/click.md`, ANTI-PATTERNS.md#anti-pattern-1-brittle-pixel-coords-without-screenshot-verify.

## Pattern 3: Retry-with-screenshot-verify (cap 3 attempts)

**When to use:** Any click whose effect is not guaranteed on the first
attempt — small targets, transient hover states, slow-rendering modals.
Cap the loop at 3 attempts. After the third failed attempt, surface the
final screenshot to the operator with a description of what was tried;
do not continue blindly. This is the same cap codified in
`docs/luse/LUSE-WORKFLOW.md`'s failure-handling subsection.

```json
[
  { "tool": "computer_screenshot", "arguments": {} },
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 940, "y": 220 } } },
  { "tool": "computer_screenshot", "arguments": {} },
  /* exit criterion: toggle now reads "Off" — if not, retry once more,
     then once more, then stop */
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 942, "y": 222 } } },
  { "tool": "computer_screenshot", "arguments": {} }
]
```

If the exit criterion still fails after attempt 3, the agent reports
"target unresponsive at (940, 220) after 3 attempts" plus the final
screenshot. Blind retry loops are the most common cause of wedged
desktop sessions.

See also: `docs/luse/tools/click.md`, `docs/luse/LUSE-WORKFLOW.md`.

## Pattern 4: Multi-step wizard navigation

**When to use:** Wizards, installers, onboarding flows — anything with a
"Next" button advancing through N pages. Each page is its own
screenshot-then-act cycle. Bound the total page count (e.g. 12) and
abort if the agent does not see a distinguishing landmark on the
expected page.

Focus the wizard window first via `computer_application` so the click
target window does not race with any other window the user has open.

```json
[
  { "tool": "computer_application", "arguments": { "application": "settings-wizard" } },
  { "tool": "computer_screenshot", "arguments": {} },
  /* page 1 landmark: "Welcome to LivOS" header found */
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 720, "y": 540 } } },
  { "tool": "computer_screenshot", "arguments": {} },
  /* page 2 landmark: "Choose your time zone" header found — advance again */
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 720, "y": 540 } } }
]
```

Do not advance to the next page until the current screenshot shows the
expected landmark for that page. If the landmark is missing, the wizard
may have shown an unexpected modal (license dialog, error toast) — fall
back to Pattern 6 to clear it.

See also: `docs/luse/tools/click.md`, PATTERNS.md#pattern-6-modal-dismissal.

## Pattern 5: Focus-before-type

**When to use:** Any `computer_type_text` or `computer_paste_text` call.
Typing tools do not change window focus. If the wrong window has focus
when you call them, the keystrokes leak to that window — at best a
no-op, at worst typing your prompt into a chat application or a
terminal.

Wrong (the type call lands wherever X focus happens to be):

```json
[
  { "tool": "computer_type_text", "arguments": { "text": "wi-fi settings" } }
]
```

Right (focus first, then type):

```json
[
  { "tool": "computer_application", "arguments": { "application": "settings" } },
  { "tool": "computer_screenshot", "arguments": {} },
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 540, "y": 80 } } },
  { "tool": "computer_screenshot", "arguments": {} },
  { "tool": "computer_type_text", "arguments": { "text": "wi-fi settings" } }
]
```

The intermediate screenshot proves the click landed inside the search
field (the cursor blinks there) before the type call fires.

See also: `docs/luse/tools/type.md`, `docs/luse/tools/click.md`.

## Pattern 6: Modal dismissal

**When to use:** A screenshot shows an unexpected modal blocking the
intended target. Hunt for an Escape-key path first — most well-behaved
desktop modals close on Escape. If the modal swallows Escape, fall back
to a landmark-anchored click on the modal's "Cancel" / "Close" / "X"
button.

Prefer the keyboard path:

```json
[
  { "tool": "computer_screenshot", "arguments": {} },
  /* detected: "Software Update Available" modal blocking the wizard */
  { "tool": "computer_press_keys", "arguments": { "keys": ["Escape"], "press": "down" } },
  { "tool": "computer_press_keys", "arguments": { "keys": ["Escape"], "press": "up" } },
  { "tool": "computer_screenshot", "arguments": {} }
]
```

If the post-Escape screenshot still shows the modal, click the close
control by landmark:

```json
[
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 1120, "y": 160 }, "button": "left" } },
  { "tool": "computer_screenshot", "arguments": {} }
]
```

Never close a modal by guessing its close-button location from a
different modal's geometry. Always re-screenshot.

See also: `docs/luse/tools/key.md`.

## Pattern 7: Scroll-and-search

**When to use:** Target is known to exist somewhere in a scrollable
container (long settings panel, app catalog, chat history) but is not
currently visible. Issue small `computer_scroll` calls — direction
`down`, modest `amount` (3-5) — interleaved with `computer_screenshot`
checks. Bound the loop at 10 iterations and stop on landmark match.

```json
[
  { "tool": "computer_screenshot", "arguments": {} },
  { "tool": "computer_scroll", "arguments": { "direction": "down", "amount": 3 } },
  { "tool": "computer_screenshot", "arguments": {} },
  { "tool": "computer_scroll", "arguments": { "direction": "down", "amount": 3 } },
  { "tool": "computer_screenshot", "arguments": {} }
  /* … repeat until landmark found or iteration cap hit */
]
```

`computer_scroll` with anchored `x` / `y` moves the pointer as a side
effect. Any subsequent `computer_click_mouse` must pass explicit
coordinates; do not rely on the pointer staying where it was before the
scroll.

See also: `docs/luse/tools/scroll.md`.

## Pattern 8: Secrets via clipboard (NOT type)

**When to use:** Whenever the workflow needs to enter a password, API
key, OAuth token, or any other sensitive string. `computer_type_text`
echoes the text through the orchestrator's tool-argument log and the X
keystroke stream — it is observable to `xev`, keystroke loggers, and
window-manager input hooks. The supported sensitive-text path is
`computer_paste_text` with `isSensitive: true`, which masks the value
in server-side logs and goes through the clipboard rather than the
synthetic-keypress pipeline.

```json
[
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 540, "y": 320 } } },
  { "tool": "computer_paste_text", "arguments": { "text": "<secret>", "isSensitive": true } },
  { "tool": "computer_press_keys", "arguments": { "keys": ["Return"], "press": "down" } }
]
```

The server logs the call as `pasteText "<N sensitive chars>"` rather
than echoing the value. Never substitute `computer_type_text` here —
even with a `delay_ms` override, the keystrokes are recoverable.

See also: `docs/luse/tools/type.md`, ANTI-PATTERNS.md#anti-pattern-4-sensitive-text-via-computer_type_text-instead-of-computer_paste_text--issensitive.

---

## TROUBLESHOOTING

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

---

## ANTI-PATTERNS

# Luse Anti-Patterns

These four shapes are banned from Luse automation. Each one has cost
real failures in prior phases of LivOS development; each one has a
corrective pattern in `docs/luse/PATTERNS.md`. If a workflow is about
to do one of these, stop and rewrite it.

The names below are stable — cite them in failure post-mortems and PR
review comments.

## Anti-Pattern 1: Brittle pixel coords without screenshot verify

**Summary:** Calling `computer_click_mouse` with hard-coded coordinates
copied from a previous session, without a fresh `computer_screenshot`
to ground them.

Wrong:

```json
{
  "tool": "computer_click_mouse",
  "arguments": { "coordinates": { "x": 842, "y": 316 } }
}
```

(No preceding screenshot. The coordinates come from an earlier session
or a memorised pattern. They do not survive DPI changes, window
position drift, theme switches, or panel reflow on resize.)

**Failure mode:** The click lands on whatever happens to live at
(842, 316) in the current frame — often a different control entirely,
sometimes the desktop background. The agent then proceeds against the
wrong state.

**Corrective pattern:** PATTERNS.md#pattern-2-landmark-anchored-clicks-not-pixel-coords.
Screenshot first, identify the target by a visible landmark (label,
icon, panel edge), then click at coordinates derived from the current
frame.

## Anti-Pattern 2: Fire-and-forget clicks without exit-criteria check

**Summary:** Issuing `computer_click_mouse` and immediately moving to
the next tool call without a `computer_screenshot` to confirm the click
landed.

Wrong:

```json
[
  { "tool": "computer_click_mouse", "arguments": { "coordinates": { "x": 120, "y": 1024 } } },
  { "tool": "computer_type_text", "arguments": { "text": "wi-fi" } }
]
```

(The click is assumed to have opened a target window. If it missed,
the type call lands in whatever window already had focus.)

**Failure mode:** Silent miss. The entire downstream chain runs against
the wrong window. The first symptom is usually a confused screenshot
several steps later, by which time the agent has typed sensitive text
into the wrong app or sent destructive key combos to the wrong window.

**Corrective patterns:** PATTERNS.md#pattern-1-screenshot-then-act and
PATTERNS.md#pattern-3-retry-with-screenshot-verify-cap-3-attempts.
Every state-mutating action must be followed by a screenshot that
confirms the action's expected visible effect; if the effect is missing,
retry up to three times then surface the failure.

## Anti-Pattern 3: Modifier-key collisions with desktop shell

**Summary:** Calling `computer_press_keys` with chord combinations that
the desktop shell or window manager intercepts before they reach the
focused application.

Known dangerous chords on typical Linux/X11 desktop shells:

- `super+l` — locks the screen on GNOME, KDE, XFCE; the Luse session
  is then locked out until the operator unlocks.
- `ctrl+alt+t` — opens an external terminal window on most distros;
  steals focus from the intended target.
- `alt+f4` — closes the currently focused window; closes the wrong
  window if focus drifted.
- `ctrl+alt+f1`..`f7` — switches virtual terminals on many distros;
  drops the X session out of view entirely.
- `super+d` — minimises all windows to the desktop; hides the target
  the agent was trying to drive.

Wrong:

```json
{
  "tool": "computer_press_keys",
  "arguments": { "keys": ["super", "l"], "press": "down" }
}
```

**Failure mode:** The desktop shell consumes the chord and the agent
sees a screen lock, an unexpected terminal, a minimised desktop, or a
black VT — none of which the workflow planned for.

**Corrective approach:** Drive the same action via the in-app menu
accessed by `computer_click_mouse`, or use an application-specific
keyboard shortcut documented by the target app rather than a
desktop-shell chord. When in doubt, click. Cross-reference
PATTERNS.md#pattern-6-modal-dismissal for the Escape-then-fallback
pattern.

## Anti-Pattern 4: Sensitive text via `computer_type_text` instead of `computer_paste_text` + `isSensitive`

**Summary:** Routing a password, API key, OAuth token, or other secret
through `computer_type_text` — even with `delay_ms` adjustments — when
the supported sensitive-text path is `computer_paste_text` with
`isSensitive: true`.

Wrong:

```json
{
  "tool": "computer_type_text",
  "arguments": { "text": "sk-proj-REDACTED-actual-secret-value" }
}
```

(The text is echoed through synthetic keypresses. The orchestrator
logs the tool argument; `xev` and any X-level keystroke logger see the
characters; window-manager input hooks see them.)

Right:

```json
{
  "tool": "computer_paste_text",
  "arguments": { "text": "sk-proj-REDACTED-actual-secret-value", "isSensitive": true }
}
```

The server-side log line becomes `pasteText "<N sensitive chars>"` —
the value never appears in logs, the synthetic-keypress pipeline is
bypassed, and the secret goes through the X clipboard instead.

**Failure mode:** Secret leak to logs, monitoring pipelines, and any
process that taps the X event stream. Irreversible once it happens.

**Corrective pattern:** PATTERNS.md#pattern-8-secrets-via-clipboard-not-type.
Always use `computer_paste_text` with `isSensitive: true` for any
string the agent would not want to appear in plain text in an
operational log.

---

## INTEGRATION-RECIPES

# Luse Integration Recipes

All supported agents reach the same Luse MCP server inside livinityd —
only the discovery shape and the per-agent skill-shim format differ.
Each agent below either reads a hand-curated shim file checked in under
the agent's skill directory (regenerated from this repo's
`docs/luse/` canonical sources by `bash scripts/sync-luse-skills.sh`),
or discovers the Luse tool surface dynamically through MCP
tool-discovery at AionUi boot.

After editing any canonical doc under `docs/luse/`, re-run
`bash scripts/sync-luse-skills.sh` to refresh every shim that this
script writes to. The sync script hashes the canonical content into
each shim's `AUTO-GENERATED FROM` banner; sha256 marker drift is the
signal to regenerate.

## Claude Code

**Shim location:** `.claude/skills/luse/SKILL.md` (plus per-tool
`.claude/skills/luse/tools/*.md` references regenerated from
`docs/luse/tools/`).

**Invocation pattern:** Claude Code surfaces Luse tools via the MCP
protocol exactly as livinityd advertises them. The agent invokes a
tool through its standard tool-use block:

```jsonc
{
  "type": "tool_use",
  "name": "computer_screenshot",
  "input": {}
}
```

```jsonc
{
  "type": "tool_use",
  "name": "computer_click_mouse",
  "input": { "coordinates": { "x": 120, "y": 1024 }, "button": "left" }
}
```

**Per-agent note:** When the canonical docs under `docs/luse/` change,
re-run `bash scripts/sync-luse-skills.sh` to refresh
`.claude/skills/luse/` — Claude Code rereads the skill on next
agent boot.

## Aion CLI

**Shim location:** `.aion/skills/luse.md` (single concatenated file —
the Aion skill format prefers one file per skill name).

**Invocation pattern:** Aion reads the skill body into its system
prompt at session start; the agent then calls the underlying MCP tools
through the same livinityd-exposed names. The CLI-driven shape:

```text
$ aion run "open settings and toggle wi-fi off"
# Aion reads .aion/skills/luse.md → composes a screenshot-first plan →
# emits MCP tool_use calls for computer_screenshot / computer_click_mouse
# / etc. through the AionUi MCP transport.
```

<!-- Idiomatic invocation TBD when Aion CLI skill format locks in.
     Current shim is the Phase 242 placeholder shape. -->

**Per-agent note:** After editing `docs/luse/`, re-run
`bash scripts/sync-luse-skills.sh` to refresh `.aion/skills/luse.md`.
Aion reloads skills on the next `aion run` invocation; no daemon
restart required.

## OpenCode

**Shim location:** `.opencode/skills/luse.md` (single file, same shape
as the Aion shim).

**Invocation pattern:** OpenCode is also MCP-native — the skill file
seeds the agent's prompt with the patterns and tool inventory; tool
calls go through livinityd's MCP transport.

```text
$ opencode "drive the wi-fi toggle off via the Settings app"
# OpenCode loads .opencode/skills/luse.md → emits MCP tool calls for
# the canonical computer_* tool names.
```

<!-- Idiomatic invocation TBD when OpenCode skill format locks in.
     Current shim is the Phase 242 placeholder shape. -->

**Per-agent note:** Re-run `bash scripts/sync-luse-skills.sh` after
editing the canonical docs. OpenCode reloads skills on the next
command invocation.

## Gemini

**Shim location:** none — Gemini discovers Luse via MCP tool-discovery
on AionUi boot (Phase 242 D-242-C).

**Invocation pattern:** The Gemini agent enumerates available MCP
tools at session start and binds the `computer_*` handlers directly
from livinityd's advertised tool list. No skill file mirrors this
documentation — the agent works from the tool descriptions baked into
the MCP server's schema.

```text
# Gemini session start → MCP tool-discovery handshake →
# computer_screenshot, computer_click_mouse, computer_type_text,
# computer_paste_text, computer_press_keys, computer_scroll,
# computer_application, computer_wait become available as native tools.
```

<!-- Idiomatic invocation TBD when Gemini agent invocation format
     locks in for LivOS. Today the agent uses the MCP-native tool-use
     shape on every model turn. -->

**Per-agent note:** Because Gemini has no skill file, the
documentation in this repo informs the operator but does not flow
into the agent. If a future phase needs Gemini to receive the
PATTERNS / TROUBLESHOOTING content, add a sync target to
`scripts/sync-luse-skills.sh` — this is currently an explicit
non-goal per Phase 242 D-242-C.

## OpenClaw

**Shim location:** `.openclaw/skills/luse.md` (single file, same shape
as the Aion / OpenCode shims).

**Invocation pattern:** OpenClaw runs inside the Liv AI desktop shell;
the skill file feeds the agent's system prompt, and tool calls route
through the AionUi MCP transport into livinityd.

```text
# Inside the OpenClaw desktop chat:
> drive the wi-fi toggle off via the Settings app
# OpenClaw loads .openclaw/skills/luse.md → emits computer_screenshot
# then computer_click_mouse / computer_application calls.
```

<!-- Idiomatic invocation TBD when OpenClaw skill format locks in.
     Current shim is the Phase 242 placeholder shape. -->

**Per-agent note:** Re-run `bash scripts/sync-luse-skills.sh` after
editing the canonical docs. OpenClaw rereads skills on every new
agent session.

---

## KNOWN-LIMITS

# Luse Known Limits

Documented platform and runtime limits the agent must plan around.
None of these have workarounds inside the Luse tool surface — each
either demands a different approach (landmark-anchored coordinates,
per-output screenshots) or is genuinely unsupported and must surface
as an error rather than a silent retry.

## Limit: DPI / scaling

Pixel coordinates returned by `computer_screenshot` are reported in
the X server's logical pixel space, which scales with the display's
configured fractional scaling factor. Memorised coordinates from one
DPI setting do not survive a switch to another.

| Scale factor | Effective behaviour                                                              | Recommended approach                                                  |
| ------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 100%         | Reported coordinates match physical pixels 1:1.                                  | Landmark-anchored clicks; coordinates from current screenshot only.   |
| 125%         | UI elements shift down/right relative to 100% layout; some labels wrap.          | Re-derive every coordinate from a fresh screenshot. Never reuse.      |
| 150%         | Major layout reflow; some panels split across more rows; click targets resize.   | Re-derive every coordinate from a fresh screenshot. Never reuse.      |

The corrective pattern is PATTERNS.md#pattern-2-landmark-anchored-clicks-not-pixel-coords.
Never paste raw coordinates from a previous session into a new
workflow.

## Limit: Multi-monitor

The X coordinate space is per-DISPLAY screen. `computer_screenshot`
returns the active X screen — typically the primary output — and does
not span multiple physical monitors in a single image. A workflow that
needs to verify state on a secondary monitor must issue a separate
screenshot call after switching focus to that output, or query each
output with its own `region` parameter if it is mapped into the same
logical screen.

Spanning monitors carries an additional gotcha: a click at
`{ x: 2200, y: 400 }` may land outside the primary output's bounds —
`computer_click_mouse` returns `out_of_bounds` rather than silently
routing the click to the secondary monitor. Always confirm the active
DISPLAY value before issuing cross-monitor clicks. See also
TROUBLESHOOTING.md#failure-wrong-display-env.

## Limit: Wayland gaps

Luse is X11-only. The Phase 242 LUSE.md prerequisites declare the
stack as `xdotool` / `scrot` based; neither tool talks Wayland's
display protocol. A Wayland-native session returns
`display_unavailable` on every Luse call — no fallback path exists
inside the MCP server.

Two partial mitigations exist outside Luse:

1. **XWayland session.** If the user's Wayland compositor exposes
   XWayland, Luse can attach to the XWayland display but only sees
   XWayland clients (not native Wayland clients). Mixed-protocol
   compositors hide some windows from xdotool entirely.
2. **Switch the user session to X11.** Most distros expose this
   choice on the login screen. This is an operator decision, not an
   agent one.

If neither mitigation applies, Luse is genuinely unsupported on the
host. Surface the error rather than retrying.

## Limit: Snap / Flatpak isolation

Snap and Flatpak applications run in sandboxes with their own input
groups. `computer_press_keys` chords issued at the X server level may
be intercepted at the sandbox boundary before reaching the sandboxed
application — common with shortcuts the sandbox steals for its own
shell (e.g. portals dialogs).

`computer_type_text` works against sandboxed apps because individual
key events are forwarded by the portal; chord events are the unreliable
case.

Workaround: prefer in-app menus accessed via `computer_click_mouse`
when targeting a sandboxed app. The menu equivalent of a keyboard
shortcut is always available and bypasses the sandbox input
interception.

## Limit: Root-only apps

`computer_application` cannot launch applications that require root
privileges (`pkexec`, `sudo`, `polkit`-gated launchers). The Luse MCP
runs as the seat user — no privilege escalation path is exposed at the
tool layer, by design. Attempting to launch a root-only app surfaces
either an authentication prompt the user must complete out-of-band, or
a hard failure depending on the launcher.

Gate this at the MCP layer: surface the error
(`application_requires_privilege`) rather than retrying the launch.
The operator decides whether to grant a one-shot privilege escalation
through the host's policy mechanism, after which the agent can retry.
Do not loop on the launch attempt — the second attempt fails
identically.

---

## CHEAT-SHEET

# Luse Cheat Sheet

One-line invocation per tool. Minimal valid JSON only; see the per-tool
docs under `docs/luse/tools/` for full input/output shape, error
reasons, and edge cases. See PATTERNS.md for the multi-call shapes that
compose these primitives into real workflows.

| Tool                     | Minimal valid args                                                       | Use for                                                                 | Pattern                                                                                                |
| ------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `computer_screenshot`    | `{}`                                                                     | Snapshot the current display before / after any state-mutating action.  | PATTERNS.md#pattern-1-screenshot-then-act                                                              |
| `computer_click_mouse`   | `{ "coordinates": { "x": 120, "y": 1024 } }`                             | Click a point identified from a fresh screenshot landmark.              | PATTERNS.md#pattern-2-landmark-anchored-clicks-not-pixel-coords                                        |
| `computer_type_text`     | `{ "text": "wi-fi settings" }`                                           | Type non-sensitive characters into the currently focused window.        | PATTERNS.md#pattern-5-focus-before-type                                                                |
| `computer_paste_text`    | `{ "text": "<secret>", "isSensitive": true }`                            | Enter passwords / API keys / OAuth tokens — the ONLY safe secret path. | PATTERNS.md#pattern-8-secrets-via-clipboard-not-type                                                   |
| `computer_press_keys`    | `{ "keys": ["Escape"], "press": "down" }`                                | Single keys or modifier chords (Escape, Return, ctrl+v).                | PATTERNS.md#pattern-6-modal-dismissal                                                                  |
| `computer_scroll`        | `{ "direction": "down", "amount": 3 }`                                   | Scroll a long list or panel into view, in small bounded increments.    | PATTERNS.md#pattern-7-scroll-and-search                                                                |
| `computer_application`   | `{ "application": "settings" }`                                          | Launch or focus a desktop application by name.                          | PATTERNS.md#pattern-4-multi-step-wizard-navigation                                                     |
| `computer_wait`          | `{ "duration": 200 }`                                                    | Pause between rapid actions to let the X event loop settle.             | TROUBLESHOOTING.md#failure-xdotool-race-conditions                                                     |

## At-a-glance reminders

- Screenshot before every state-mutating action.
- Coordinates always come from the most recent screenshot.
- Cap retry loops at 3 attempts; cap scroll-and-search at 10 iterations.
- Focus the target window (via `computer_application` or
  `computer_click_mouse`) before any type or paste call.
- Secrets ALWAYS go through `computer_paste_text` with
  `isSensitive: true` — never `computer_type_text`.
- Modal in the way? Try `computer_press_keys` with `["Escape"]` before
  hunting for the close-X click target.
- Desktop-shell chords (`super+l`, `ctrl+alt+t`, `alt+f4`) are banned —
  see ANTI-PATTERNS.md#anti-pattern-3-modifier-key-collisions-with-desktop-shell.
- Region-cropped `computer_screenshot` is cheaper than full-screen when
  the agent only needs to verify a single element.
- `computer_scroll` with anchored `x` / `y` moves the pointer; any
  follow-up `computer_click_mouse` must pass explicit coordinates.
- `computer_press_keys` requires both a `down` press and an `up` press
  for the same chord — leaving a modifier latched stuck breaks the next
  click.

## Common composition shapes

- **Open app, drive form, submit:** `computer_application` →
  `computer_screenshot` → `computer_click_mouse` (input field) →
  `computer_type_text` → `computer_press_keys` (`Return`) →
  `computer_screenshot` (verify).
- **Read a value off the screen:** `computer_screenshot` with a
  bounded `region` → agent OCR / vision over the returned image. No
  state-mutating call required.
- **Paste a secret into a focused field:** `computer_click_mouse` →
  `computer_screenshot` (verify cursor in field) → `computer_paste_text`
  with `isSensitive: true` → `computer_press_keys` (`Return`).
- **Diagnose a hung step:** `computer_screenshot` → if blank,
  consult TROUBLESHOOTING.md#failure-display-gone-away and
  TROUBLESHOOTING.md#failure-window-not-focused-keystrokes-leak.