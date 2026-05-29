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
