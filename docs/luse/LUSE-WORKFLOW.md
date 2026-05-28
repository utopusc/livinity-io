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
