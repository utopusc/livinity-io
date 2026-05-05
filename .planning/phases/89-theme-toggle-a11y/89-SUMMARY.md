# Phase 89 Summary — Theme Toggle + Accessibility + Keyboard Shortcuts

## Deliverables Shipped

| # | Deliverable | File | Status |
|---|-------------|------|--------|
| 1 | ThemeToggle component | `livos/packages/ui/src/components/theme-toggle.tsx` | Done |
| 2 | useKeyboardShortcuts hook | `livos/packages/ui/src/hooks/use-keyboard-shortcuts.ts` | Done |
| 3 | KeyboardShortcutsProvider | `livos/packages/ui/src/providers/keyboard-shortcuts-provider.tsx` | Done |
| 4 | v32-a11y.css | `livos/packages/ui/src/styles/v32-a11y.css` | Done |
| 5 | main.tsx — KeyboardShortcutsProvider mount | `livos/packages/ui/src/main.tsx` | Done |
| 6 | index.css — a11y import | `livos/packages/ui/src/index.css` | Done |
| 7 | Playground — ThemeToggle mounted | `livos/packages/ui/src/routes/playground/v32-theme.tsx` | Done |
| 8 | Agents — ThemeToggle in header | `livos/packages/ui/src/routes/agents/index.tsx` | Done |
| 9 | Marketplace — ThemeToggle in hero | `livos/packages/ui/src/routes/marketplace/index.tsx` | Done |

## Build Verification

```
pnpm --filter ui build    exit 0   (12210 modules transformed)
```

All warnings in the build output are pre-existing (CSS @import order warnings
from P80's v32-tokens.css, sourcemap warnings from motion-primitives). Zero new
TypeScript errors introduced by Phase 89.

---

## WCAG AA Contrast Audit — Light Theme (:root values)

WCAG AA thresholds:
- Body text (< 18pt / < 14pt bold): minimum 4.5:1
- Large text (>= 18pt / >= 14pt bold): minimum 3:1
- UI components / graphical objects: minimum 3:1

OKLCH L values map to relative luminance. For achromatic colors (C=0),
L maps directly to CIE lightness. Relative luminance Y ≈ (L/100)^2.2 for
the gamma model, but OKLCH L is perceptually uniform, so we use the standard
sRGB formula: Y ≈ L^2.2 for approximate calculation. Contrast ratio = (L1 + 0.05) / (L2 + 0.05).

### Pair 1: --liv-foreground on --liv-background

- foreground: `oklch(0.145 0 0)` — L=0.145 → Y ≈ 0.145^2.2 ≈ 0.0155
- background: `oklch(98.46% 0.002 247.84)` — L≈0.9846 → Y ≈ 0.9846^2.2 ≈ 0.968

Contrast ratio ≈ (0.968 + 0.05) / (0.0155 + 0.05) = 1.018 / 0.0655 ≈ **15.5:1**

**PASS** — far exceeds 4.5:1 (body text AA). This is the primary text pair used
for all prose in the v32 chat UI.

### Pair 2: --liv-muted-foreground on --liv-background

- muted-foreground: `oklch(0.556 0 0)` — L=0.556 → Y ≈ 0.556^2.2 ≈ 0.276
- background: Y ≈ 0.968 (same as above)

Contrast ratio ≈ (0.968 + 0.05) / (0.276 + 0.05) = 1.018 / 0.326 ≈ **3.12:1**

**MARGINAL — FLAG** — 3.12:1 fails the 4.5:1 AA threshold for body text (< 18pt).
This pair passes 3:1 for large text and UI components. Usage in the codebase:
secondary labels (`text-liv-muted-foreground`), placeholders, metadata lines.
Recommendation: increase L slightly (e.g. `oklch(0.48 0 0)`) to reach ~4.5:1,
but this requires a P80-revisit of the token values (out of P89 scope). P90/P91
should revisit this token if muted text is used at body-text sizes.

### Pair 3: --liv-primary-foreground on --liv-primary

- primary-foreground: `oklch(0.985 0 0)` — L=0.985 → Y ≈ 0.969
- primary: `oklch(0.205 0 0)` — L=0.205 → Y ≈ 0.205^2.2 ≈ 0.0327

Contrast ratio ≈ (0.969 + 0.05) / (0.0327 + 0.05) = 1.019 / 0.0827 ≈ **12.3:1**

**PASS** — used on primary action buttons. Excellent contrast.

### Pair 4: --liv-card-foreground on --liv-card

- card-foreground: `oklch(0.145 0 0)` — Y ≈ 0.0155 (same as foreground)
- card: `oklch(1 0 0)` — pure white → Y = 1.0

Contrast ratio ≈ (1.0 + 0.05) / (0.0155 + 0.05) = 1.05 / 0.0655 ≈ **16.0:1**

**PASS** — excellent contrast. Card content is high contrast.

### Summary

| Pair | Ratio | Threshold | Result |
|------|-------|-----------|--------|
| foreground on background | 15.5:1 | 4.5:1 | PASS |
| muted-foreground on background | 3.12:1 | 4.5:1 | FLAG (see note) |
| primary-foreground on primary | 12.3:1 | 4.5:1 | PASS |
| card-foreground on card | 16.0:1 | 4.5:1 | PASS |

**Action required (P80-revisit or P91 UAT):** `--liv-muted-foreground` at
`oklch(0.556 0 0)` does not reach 4.5:1 for body-size text. If muted text is
used for paragraph-level content, the token should be darkened. For caption /
label text (typically rendered large or supplemental), 3:1 may be acceptable
under WCAG 2.1 large text rules. Final call belongs to P91 UAT.

---

## Keyboard Shortcut Registry (P89 additions)

| Shortcut | Action | CustomEvent | Notes |
|----------|--------|-------------|-------|
| Cmd+K | Focus composer | `liv-composer-focus` | ChatComposer must listen (P90) |
| Cmd+/ | Open slash menu | `liv-slash-menu-open` | SlashMenu must listen (future) |
| Cmd+Shift+C | Copy last assistant message | — | Reads `localStorage['liv-last-assistant']` |
| Cmd+I | Close tool panel | — | **Owned by P82 ToolCallPanel.tsx** — NOT duplicated here |

The hook skips all shortcuts when focus is inside `input`, `textarea`,
`select`, or `[contenteditable]` elements.

---

## Focus-Visible Ring Strategy

`v32-a11y.css` adds a `:where()` catch-all rule for any interactive element
that lacks an explicit focus style. Zero-specificity `:where()` ensures
component-level Tailwind `focus-visible:ring-*` utilities always win.

Recommended Tailwind classes for interactive elements in v32 components:
```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring focus-visible:ring-offset-2 focus-visible:ring-offset-liv-background
```

`--liv-ring` in light theme: `oklch(0.708 0 0)` — contrast on background ≈
(0.968 + 0.05)/(0.468 + 0.05) ≈ 1.97:1. For UI component outlines (focus
rings) the 3:1 threshold applies to non-text. This is marginal and also a P80
token revisit candidate — the ring color could be darkened slightly.

---

## Reduced Motion

`v32-a11y.css` includes:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Framer Motion used throughout v32 components already respects
`shouldReduceMotion()` via its built-in `useReducedMotion()` hook.

Non-respecting animation source identified (P90 follow-up):
- `streaming-caret.tsx` — uses a `blink` keyframe defined via a JSX `<style>`
  tag. This bypasses the global CSS gate. P90 should wrap it:
  ```tsx
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // then conditionally skip animation
  ```

---

## ARIA Advisory — P81/P82/P83 Internals (read-only audit; P90 follow-ups)

The following missing ARIA attributes were observed by inspection (these
components are NOT modified by P89 per hard constraints):

### P81 — MessageThread / MessageInput

- `MessageThread` container: `role="main"` present in `index.tsx` wrapper but
  the `MessageThread` itself (`<div className='flex-1 overflow-y-auto'>`) lacks
  `role="log"` and `aria-label="Chat messages"`. WCAG 4.1.2 — should have
  explicit role for live region.
- Individual message bubbles lack `aria-label` or `role="article"` for screen
  reader navigation.
- User messages: no `aria-label="Your message"` or equivalent.
- "Streaming" status messages: should have `aria-live="polite"` on the
  streaming container so new tokens are announced incrementally.

### P82 — ToolCallPanel

- Panel container: has `role="complementary"` implied by `aside` — verify the
  element is actually an `<aside>` (not a `<div>`). If `<div>`, add
  `role="complementary"` explicitly.
- Tool call list items: lack `role="listitem"` if not using `<li>` elements.
- "Jump to Live" pill button: lacks `aria-pressed` state.
- Slider scrubber: shadcn Slider uses Radix which adds `role="slider"` with
  `aria-valuenow`, `aria-valuemin`, `aria-valuemax` — verify these are
  populated correctly with tool-call index values.

### P83 — Tool Views (views/)

- GenericToolView: input/output pre blocks lack `role="region"` with
  descriptive `aria-label`.
- BrowserToolView: screenshot `<img>` should have `alt` text describing
  the tool action (e.g. `alt="Browser screenshot from browser_navigate"`).
- Status badges: decorative status icons should have `aria-hidden="true"`.

All of the above are low-severity WCAG issues (A/AA non-blockers at this stage)
and are deferred to P90/P91 for resolution. None block v32 ship.

---

## ThemeToggle — ARIA Coverage

Own components have full ARIA coverage:

- Trigger button: `aria-label="Toggle theme"`, `aria-haspopup="menu"`
- Active option: `aria-current="true"` on selected DropdownMenuItem
- Check icon: `aria-hidden="true"`
- Live region: `role="status"` + `aria-live="polite"` + `aria-atomic="true"` (visually hidden)
- Keyboard: Enter/Space activates trigger; arrow keys navigate menu; Escape
  closes (all handled by Radix DropdownMenu primitives)

---

## P88 Race Coordination

ThemeToggle was NOT mounted in `routes/ai-chat/v32/index.tsx` to avoid a
merge race with P88's SSE migration edits to the same file.

ThemeToggle is mounted on:
- `/playground/v32-theme` (replaces inline buttons)
- `/agents` header (right side of toolbar)
- `/marketplace` hero (top-right)

P90 will add it to the v32 chat header once P88 is merged.

---

## P90 Wire-Up Checklist

The following items are wired in this phase but require consumer-side handlers
in future phases to complete the interaction:

1. `liv-composer-focus` CustomEvent: ChatComposer (`ChatComposer.tsx` or
   `MessageInput.tsx`) must:
   ```ts
   useEffect(() => {
     const handler = () => textareaRef.current?.focus()
     window.addEventListener('liv-composer-focus', handler)
     return () => window.removeEventListener('liv-composer-focus', handler)
   }, [])
   ```

2. `liv-last-assistant` localStorage: The SSE message consumer (P88) must:
   ```ts
   // When an assistant message completes streaming:
   localStorage.setItem('liv-last-assistant', completedMessageText)
   ```

3. ThemeToggle in v32 chat header: Add `<ThemeToggle className="ml-2" />` to
   the `<header id="v32-chat-header" ...>` element after P88 merges.

4. `streaming-caret.tsx` reduced-motion: Wrap the `blink` keyframe conditional
   on `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.

## Commit SHA

(to be filled after commit)
