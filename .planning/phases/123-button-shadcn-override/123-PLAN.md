# Phase 123 — Button Shadcn Override (Additive Variants, Step 2 of 8)

**Milestone:** v36 LivOS Design Port
**Goal:** Add the Livinity Design System button variants (§04) to `shadcn-components/ui/button.tsx` **as new variants** alongside the existing 6 variants. Zero existing variant touched. Consumers opt in to `v36-*` variants in Phases 124-129 as their respective surfaces migrate.

**Source:** `.planning/design-system/livinity-design-system.html` §04 Buttons (lines 583-619).

---

## Why pure additive (deviation from master plan)

Master plan §123 said "Override all variants sitewide". Pre-flight discovered:

- **438 Button callsites** in `livos/packages/ui/src/**`
- **47 `variant="primary"` usages** (every CTA: Log in, Update, Save, Sign in, ...) — flipping the existing `primary` from brand blue to monochrome black would change all 47 in one commit, exact match of the rejected "bold redesign" pattern from Phase 122 v1.
- Per `feedback_v36_no_bold_redesigns.md`: each visible change ships as the smallest possible atomic commit, screenshot + user approval before stacking.

Resolution: add new `v36-*` variants. Existing `primary/destructive/ghost/etc.` stay byte-unchanged. Phase 124+ migrate consumers opt-in.

---

## Files touched (1)

- `livos/packages/ui/src/shadcn-components/ui/button.tsx` (+ ~25 lines)

## Files NOT touched (verified)

- `livos/packages/ui/src/shadcn-components/ui/button-styles.css` (no new keyframes/utilities needed — v36 uses inline Tailwind only)
- `livos/packages/ui/src/**` (all 438 Button callsites untouched)

---

## New variants

```typescript
variant: {
  // existing 6 kept verbatim:
  // default, primary, secondary, destructive, ghost, liv-primary

  // === v36 Livinity Design Port (additive, opt-in) ===
  // Reference: .planning/design-system/livinity-design-system.html §04
  'v36-primary':
    'bg-fg text-[color:var(--bg)] hover:opacity-90 border border-fg ring-fg/20',
  'v36-ghost':
    'bg-transparent text-fg border border-line-strong hover:bg-[color:var(--bg-2)] ring-fg/10',
  'v36-danger':
    'bg-transparent text-[color:var(--red,#dc2626)] border border-[color:rgb(220_38_38_/_.30)] hover:bg-[color:rgb(220_38_38_/_.06)]',
},
size: {
  // existing 8 kept verbatim
  // === v36 additive ===
  'v36-pill':        'rounded-full h-[36px] px-5 text-[14px] gap-2 font-medium tracking-[-0.005em]',
  'v36-pill-sm':     'rounded-full h-[30px] px-3.5 text-[13px] gap-1.5 font-medium',
  'v36-pill-lg':     'rounded-full h-[44px] px-6 text-[15px] gap-2 font-medium',
  'v36-icon-square': 'rounded-full h-9 w-9 p-0 border border-line-strong',
},
```

## Acceptance criteria

- AC-123-1: `git diff` shows ONLY `button.tsx` (+ phase artifacts in `.planning/`)
- AC-123-2: All 6 existing variants (default/primary/secondary/destructive/ghost/liv-primary) byte-identical pre/post (grep proof)
- AC-123-3: All 8 existing sizes (sm/md/md-squared/default/input-short/dialog/lg/xl/icon-only) byte-identical pre/post
- AC-123-4: Vite dev HMR clean, no new errors
- AC-123-5: Visual non-regression — localhost:3000 screenshot identical to baseline
- AC-123-6: Sacred SHA preserved
- AC-123-7: A throwaway probe `<Button variant="v36-primary" size="v36-pill">test</Button>` renders correctly in dev (verification card injected via DevTools)

## Commits

1. `feat(button): add v36 Livinity Design Port variants (additive) [v36/P123-01]` — single source edit
2. `docs(v36/P123): ship Phase 123 — SUMMARY + VERIFICATION + STATE/ROADMAP` — close
