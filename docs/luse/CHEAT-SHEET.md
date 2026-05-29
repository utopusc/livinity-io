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
