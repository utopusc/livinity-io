<!-- source-sha: 15f288e83037df464322ad8f183a045e9933a5b36c8a7af60153d7cd950bcb01 -->
<!-- AUTO-GENERATED FROM docs/luse/ANTI-PATTERNS.md — DO NOT EDIT. -->

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