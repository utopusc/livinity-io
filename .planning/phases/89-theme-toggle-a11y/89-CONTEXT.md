# Phase 89 Context — Theme Toggle + Accessibility + Keyboard Shortcuts

**Phase:** 89 (V32-A11Y-01..06)
**Wave:** 4 (parallel with P88 WS→SSE Migration)
**Milestone:** v32.0 AI Chat Ground-up Rewrite
**Status:** In progress

---

## Objective

Add `<ThemeToggle>` component and mount it on safe, file-disjoint routes. Wire
global keyboard shortcuts (Cmd+K, Cmd+/, Cmd+Shift+C). Add ARIA labels to own
components. Verify WCAG AA contrast ratios on OKLCH token pairs. Add
focus-visible rings + reduced-motion media gate.

---

## Dependencies

- **P80 (landed):** ThemeProvider + useTheme hook at `providers/theme-provider.tsx`
  and `hooks/use-theme.ts`. `v32-tokens.css` OKLCH token set. ThemeProvider
  already mounted in `main.tsx`.
- **P82 (landed):** ToolCallPanel owns Cmd+I at line 146-158 of
  `routes/ai-chat/v32/ToolCallPanel.tsx`. This phase's keyboard hook MUST NOT
  duplicate that shortcut. Hook skips key `'i'` entirely — ownership stays with
  P82.
- **P81 (landed):** `routes/ai-chat/v32/index.tsx` orchestrator — the P88
  migration target. This phase avoids editing it to prevent race with P88.

---

## Files Created

| File | Purpose |
|------|---------|
| `livos/packages/ui/src/components/theme-toggle.tsx` | Reusable ThemeToggle — dropdown variant with Sun/Moon/Monitor icons |
| `livos/packages/ui/src/hooks/use-keyboard-shortcuts.ts` | Global keydown hook — Cmd+K, Cmd+/, Cmd+Shift+C |
| `livos/packages/ui/src/providers/keyboard-shortcuts-provider.tsx` | Context wrapper that mounts the hook once |
| `livos/packages/ui/src/styles/v32-a11y.css` | focus-visible defaults + prefers-reduced-motion gate |

## Files Modified

| File | Delta |
|------|-------|
| `livos/packages/ui/src/main.tsx` | +1 import + wrap with KeyboardShortcutsProvider |
| `livos/packages/ui/src/index.css` | +1 @import for v32-a11y.css |
| `livos/packages/ui/src/routes/playground/v32-theme.tsx` | Replace inline theme buttons with `<ThemeToggle />` |
| `livos/packages/ui/src/routes/agents/index.tsx` | Add `<ThemeToggle />` to header right side |
| `livos/packages/ui/src/routes/marketplace/index.tsx` | Add `<ThemeToggle />` to header right side |

---

## Coordination with P88

P88 modifies `routes/ai-chat/v32/index.tsx` for SSE wiring. ThemeToggle is
intentionally NOT mounted in v32 chat header to avoid a merge race. Instead:

- Mounted in `/playground/v32-theme` (replaces inline buttons)
- Mounted in `/agents` header
- Mounted in `/marketplace` header

P90 cutover phase will mount ThemeToggle in the production chat header once
P88's lane is merged and the file is stable.

---

## Keyboard Shortcut Ownership Map

| Shortcut | Owner | Notes |
|----------|-------|-------|
| Cmd+I | **P82 ToolCallPanel.tsx** | Lines 146-158. DO NOT duplicate. |
| Cmd+K | **P89 use-keyboard-shortcuts.ts** | Dispatches `liv-composer-focus` CustomEvent |
| Cmd+/ | **P89 use-keyboard-shortcuts.ts** | Dispatches `liv-slash-menu-open` CustomEvent |
| Cmd+Shift+C | **P89 use-keyboard-shortcuts.ts** | Reads `localStorage.getItem('liv-last-assistant')` |

NOTE for P90: The chat surface (P88 SSE wiring) must write
`localStorage.setItem('liv-last-assistant', text)` on each completed assistant
message so Cmd+Shift+C has something to copy.

NOTE for P90: ChatComposer (`routes/ai-chat/v32/ChatComposer.tsx`) must listen
for `liv-composer-focus` CustomEvent and call `.focus()` on its textarea ref.

---

## ThemeToggle Design

- Variant: dropdown (DropdownMenu from shadcn)
- Options: Light (Sun icon), Dark (Moon icon), System (Monitor icon)
- Size: `h-9 w-9` ghost button
- ARIA: `aria-label="Toggle theme"` on trigger button
- ARIA live: `aria-live="polite"` hidden region announces resolved theme to
  screen readers
- Keyboard: trigger opens dropdown, arrow keys navigate, Enter/Space selects,
  Escape closes (handled by Radix DropdownMenu)
- Active item: shows check mark next to selected theme

---

## WCAG AA Verification Plan

Minimum pairs to verify in LIGHT theme (`:root` values from v32-tokens.css):

1. `--liv-foreground` on `--liv-background`
2. `--liv-muted-foreground` on `--liv-background`
3. `--liv-primary-foreground` on `--liv-primary`
4. `--liv-card-foreground` on `--liv-card`

WCAG AA threshold: 4.5:1 for body text, 3:1 for large text (18pt+/14pt bold+).

---

## Focus-Visible Ring Strategy

Tailwind classes for interactive elements:
```
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring focus-visible:ring-offset-2
```

v32-a11y.css adds a catch-all fallback rule for buttons/links/inputs that lack
explicit focus styles.

---

## Deferred to P90

- Mount ThemeToggle in v32 chat header (`routes/ai-chat/v32/index.tsx`) —
  deferred to avoid P88 race
- Wire ChatComposer to listen for `liv-composer-focus` CustomEvent
- Wire P88 SSE handler to write `localStorage.setItem('liv-last-assistant', ...)`
- ARIA audit follow-ups for P81/P82/P83 internals (read-only advisory listed in
  SUMMARY)
