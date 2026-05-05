# Stage 2a Notes — Brand Sweep + Center Hero + Profile Menu Verify

Date: 2026-05-05

## Grep Results — Before

```
dashboard.tsx:155:                Suna         <-- JSX visible string (ONLY non-comment hit)
dashboard.tsx:10: shows "Suna" as static text  <-- comment (updated to "Liv" for consistency)
dashboard.tsx:1: // Ported from Suna:          <-- comment (preserved)
dashboard.tsx:5: // ChatInput (Suna) ->         <-- comment (preserved)
*/sidebar/kortix-logo.tsx:1: // Ported from Suna:  -- comment (preserved)
*/sidebar/nav-user-with-teams.tsx:1: // Ported from Suna:  -- comment (preserved)
... (all other hits are "// Ported from Suna:" header comments or dir-name references)
```

## Grep Results — After

```
pnpm grep -rn "Suna" livos/packages/ui/src/routes/ai-chat-suna/
```

ALL remaining Suna hits are:
- `// Ported from Suna:` header comments on line 1 of each file (internal attribution — preserved per spec)
- `// Inline Badge for "New" tag (avoids importing Suna's specific Badge variant)` — comment (preserved)
- `// so Suna-ported code using size="icon" compiles...` — comment (preserved)
- `// Stage 1a mock data — replaces Suna API calls` — comment (preserved)

ZERO visible JSX/string Suna references remain in rendered output.

## Fix 1 — Brand Sweep

File changed: `livos/packages/ui/src/routes/ai-chat-suna/dashboard.tsx`

- Line 155: `Suna` -> `Liv` (inside `<span>` JSX)
- Line 10: comment updated `"Suna"` -> `"Liv"` for internal consistency (not a requirement but cleaner)

## Fix 2 — Center Hero

File changed: `livos/packages/ui/src/routes/ai-chat-suna/dashboard.tsx`

The outer centering wrapper already used `absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2` which provides dead-center horizontal+vertical positioning. The inner hero block already had `flex flex-col items-center text-center w-full`.

Change applied: added `mt-6` to the composer wrapper div (was `w-full mb-2`, now `w-full mt-6 mb-2`) to add breathing room between the "Hey, I am Liv" heading block and the MockComposer input. This ensures the visual grouping reads as "hero text + spaced composer" rather than two elements jammed together.

## Fix 3 — Profile Menu Verify

File: `livos/packages/ui/src/routes/ai-chat-suna/sidebar/nav-user-with-teams.tsx`

Verified — NO changes needed. Menu items are EXACTLY per spec:

```
General
  Knowledge Base   (BookOpen icon, href="#")
  Usage            (BarChart2 icon, href="#")
  Integrations     (Plug icon, href="#")
  Settings         (Settings icon, href="#")
Advanced
  Local .Env Manager  (Key icon, href="#")
```

Absent (correctly removed): Plan, Billing, Theme, Log out, team switcher.

Dropdown direction: `side={isMobile ? 'bottom' : 'top'}` — opens UPWARD on desktop (correct, since profile button is at bottom of sidebar), downward on mobile (correct, since sidebar is full-screen overlay).

## Build Verification

`pnpm --filter ui build` exits 0 — "built in 35.58s". Only pre-existing warnings (CSS @import ordering, sourcemap non-errors). No new TypeScript or compile errors introduced.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — zero changes to `liv/packages/core/`.

## Screenshot Diff Plan

Before: "Hey, I am Suna" in gradient text, composer immediately below with no top spacing.
After: "Hey, I am Liv" in gradient text, `mt-6` gap before composer — hero reads as distinct visual unit.
Dead-center: absolute positioning with translate(-50%, -50%) ensures exact center in the main content area (sidebar-right region).
