---
phase: 66-liv-design-system-v1
plan: 03
subsystem: ui-design-system
tags: [design-system, shadcn, cva, variants, ui]
requirements: [DESIGN-07]
dependency_graph:
  requires:
    - "livos/packages/ui/src/styles/liv-tokens.css (Plan 66-01 — tokens + .liv-glass / .liv-glow-cyan utilities)"
    - "livos/packages/ui/src/shadcn-components/ui/button.tsx (existing)"
    - "livos/packages/ui/src/shadcn-components/ui/badge.tsx (existing)"
    - "livos/packages/ui/src/components/ui/card.tsx (existing — actual location, NOT shadcn-components/ui/)"
    - "@radix-ui/react-slider@^1.3.6 (NEW dependency — sibling to 14 existing @radix-ui/* primitives)"
  provides:
    - "Button variant 'liv-primary' — cyan accent + inlined .liv-glow-cyan box-shadow on hover"
    - "Badge variant 'liv-status-running' — cyan border+text+10% bg + leading 8px pulsing dot via :before pseudo-element"
    - "Card prop variant='liv-elevated' — composes .liv-glass utility + var(--liv-border-subtle) border"
    - "Slider primitive (NEW) — Radix-based shadcn pattern with default + 'liv-slider' (cyan) variants"
  affects:
    - "P68 side panel (will use Button variant='liv-primary' for primary CTAs)"
    - "P69 per-tool views (will use Badge variant='liv-status-running' for live tool status pills)"
    - "P70 composer + streaming UX (Card variant='liv-elevated' available for reasoning cards)"
    - "P75 reasoning cards + memory (Slider variant='liv-slider' for any future settings sliders)"
tech-stack:
  added:
    - "@radix-ui/react-slider@^1.3.6 (livos/packages/ui dependency)"
  patterns:
    - "cva variant extension via single-line addition to existing variants.variant map (D-14: extend, don't fork)"
    - "Tailwind 3.4 arbitrary-value syntax `bg-[color:var(--liv-accent-cyan)]` for direct CSS-variable consumption"
    - "tailwindcss-animate's animate-pulse on a `before:` pseudo-element for the badge status dot"
    - "Per-slot data-attribute selectors `[&_[data-slot=track]]:bg-...` for cva-routed Radix primitive styling (slider)"
    - "Plain function-component prop-branching for card variant (no cva needed) — picked Case B for smallest diff per plan instruction"
key-files:
  created:
    - "livos/packages/ui/src/shadcn-components/ui/slider.tsx"
  modified:
    - "livos/packages/ui/src/shadcn-components/ui/button.tsx"
    - "livos/packages/ui/src/shadcn-components/ui/badge.tsx"
    - "livos/packages/ui/src/components/ui/card.tsx"
    - "livos/packages/ui/package.json"
    - "livos/pnpm-lock.yaml"
decisions:
  - "Card uses Case B (prop branching) not Case A (cva refactor) per plan instruction 'prefer Case B; smaller diff'. Existing Card was a 17-line plain function component with a single tw\\`...\\` template — adding cva would have been a refactor, not an extension. The new prop is `variant?: 'default' | 'liv-elevated'` (defaults to existing behaviour, zero impact on current callers)."
  - "Inlined the literal expansion of .liv-glow-cyan (`hover:shadow-[0_0_24px_rgba(77,208,225,0.2),inset_0_1px_0_rgba(77,208,225,0.1)]`) into the Button liv-primary variant rather than `hover:liv-glow-cyan` because Tailwind cannot prefix a non-Tailwind utility class via the `hover:` modifier without a custom plugin to register it as a utility. The plan called this out in <action> step 3 as the correct approach."
  - "Pinned @radix-ui/react-slider at `^1.3.6` (the version pnpm resolved during install) rather than the plan-suggested `^1.2.0`. The plan said `^1.2.0` but the latest 1.x at install time is 1.3.6, and pnpm-lock.yaml records 1.3.6 with full resolution graph."
  - "Slider thumb default variant uses `bg-white border-brand` (codebase brand surface convention) rather than the more common shadcn `bg-background border-primary` because LivOS uses different CSS-variable names for surface tokens. liv-slider variant uses `bg-[color:var(--liv-accent-cyan)] border-[color:var(--liv-accent-cyan)]` directly per D-15."
  - "Added `<DEPENDENCY-DRIFT>` deviation note in deviations section: pnpm postinstall failed on Windows due to pre-existing `mkdir -p` shell incompat in copy-tabler-icons script. The package node_modules and lockfile were updated correctly; only the package.json save was skipped. Manually edited package.json to add the `@radix-ui/react-slider` entry — matches lockfile specifier exactly. Build still passes."
metrics:
  duration_minutes: 14
  completed_date: "2026-05-04"
  tasks_completed: 2
  files_modified: 4
  files_created: 1
  commits: 2
---

# Phase 66 Plan 03: Liv shadcn Variants Summary

Added the four `liv-*` variants required by v31-DRAFT lines 250-253 to the existing shadcn primitives (Button + Badge + Card) and created `slider.tsx` from scratch (Radix-based) with a `liv-slider` variant. Variants reference Plan 66-01 tokens directly via Tailwind arbitrary-value syntax (`bg-[color:var(--liv-accent-cyan)]`) and inline the `.liv-glow-cyan` halo as a literal `hover:shadow-[...]` because Tailwind cannot prefix non-Tailwind utility classes. All five existing Button variants and four existing Badge variants are preserved unchanged (D-14: extend, don't fork). Build green; sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged; D-09 motion-primitives directory untouched.

## Tasks Completed

| Task | Name                                                      | Commit     | Files                                                                                                                                                |
| ---- | --------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Add liv-primary (Button) and liv-status-running (Badge)   | `63d2a14c` | `livos/packages/ui/src/shadcn-components/ui/button.tsx`, `livos/packages/ui/src/shadcn-components/ui/badge.tsx`                                       |
| 2    | Add liv-elevated (Card) variant + create slider primitive | `ff20f731` | `livos/packages/ui/src/components/ui/card.tsx`, `livos/packages/ui/src/shadcn-components/ui/slider.tsx`, `livos/packages/ui/package.json`, `livos/pnpm-lock.yaml` |

## Variants Added (4 total)

### 1. Button — `variant="liv-primary"`

```tsx
<Button variant='liv-primary'>Continue</Button>
```

Cyan background (`var(--liv-accent-cyan)` = `#4dd0e1`), dark-deep text (`#050b14` for AA contrast on cyan), 24px outer cyan glow on hover (literal expansion of `.liv-glow-cyan`), `--liv-dur-fast` (200ms) transition. Active state darkens to `#3bbac9`. Hover/active scale `1.02`/`0.98` matches existing primary/secondary/destructive convention.

### 2. Badge — `variant="liv-status-running"`

```tsx
<Badge variant='liv-status-running'>Running</Badge>
```

Cyan border at 40% opacity, cyan text, 10% cyan background, leading 8px pulsing dot via `before:` pseudo-element with `tailwindcss-animate`'s `animate-pulse`. Designed for Suna-style live tool indicators (P69) and any "agent is running" states (P67+).

### 3. Card — `variant="liv-elevated"`

```tsx
<Card variant='liv-elevated'>...</Card>
```

Composes the `.liv-glass` utility from Plan 66-01 (backdrop-filter blur 12px + saturate 1.2 + `var(--liv-bg-glass)` background) plus an explicit 1px border keyed on `var(--liv-border-subtle)`. Retains the default Card's `rounded-radius-xl px-4 py-5 lg:p-6 shadow-elevation-sm`. The `variant` prop is optional and defaults to `'default'` — zero impact on existing callers.

### 4. Slider (NEW) — `variant="liv-slider"`

```tsx
<Slider variant='liv-slider' defaultValue={[50]} max={100} />
<Slider defaultValue={[50]} max={100} />  {/* default — brand colour */}
```

Brand-new Radix-based shadcn primitive at `livos/packages/ui/src/shadcn-components/ui/slider.tsx`. Uses per-slot `data-slot` attributes (`track`, `range`, `thumb`) routed through cva via descendant selectors (`[&_[data-slot=track]]:...`). The `liv-slider` variant produces a cyan range/thumb with a soft 8px cyan glow on the thumb; the `default` variant uses the codebase's existing `bg-brand` surface tokens.

## Existing Variants Preserved (D-14)

**Button** (5 variants, all unchanged): `default`, `primary`, `secondary`, `destructive`, `ghost`. Verified via grep + sentence-by-sentence diff inspection of `buttonVariants.variants.variant`.

**Badge** (4 variants, all unchanged): `default`, `primary`, `destructive`, `outline`. Verified the same way.

**Card** (default surface unchanged): `cardClass` template-literal export is unmodified. Existing callers that don't pass a `variant` prop continue to render exactly as before.

## Token References (Cross-Plan Consumption Verified)

Each new variant references tokens / utility classes from Plan 66-01:

| Variant            | References                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| liv-primary        | `var(--liv-accent-cyan)`, `var(--liv-dur-fast)`, literal expansion of `.liv-glow-cyan`           |
| liv-status-running | `var(--liv-accent-cyan)` (4× — border, text, bg-tint, dot)                                       |
| liv-elevated       | `.liv-glass` utility, `var(--liv-border-subtle)`, `var(--liv-dur-fast)`                          |
| liv-slider         | `var(--liv-accent-cyan)` (range/thumb/border), `var(--liv-bg-elevated)` (track), inlined glow shadow |

This confirms the Wave-1 → Wave-2 token handoff works end-to-end.

## Deviations from Plan

**1. [Rule 3 — Blocking] Postinstall failure during pnpm add**

- **Found during:** Task 2 (`pnpm --filter ui add @radix-ui/react-slider`)
- **Issue:** Pre-existing `postinstall` script `npm run copy-tabler-icons` runs `mkdir -p public/generated-tabler-icons && cp -r ./node_modules/@tabler/icons/icons/. ./public/generated-tabler-icons` which fails on Windows because cmd.exe cannot parse `mkdir -p`. This caused pnpm to abort the package.json save step, even though node_modules and pnpm-lock.yaml had already been updated.
- **Fix:** Manually edited `livos/packages/ui/package.json` to add `"@radix-ui/react-slider": "^1.3.6"` between `@radix-ui/react-separator` and `@radix-ui/react-slot` (matches the version pnpm-lock.yaml already pinned). Build re-ran cleanly. Did NOT fix the unrelated copy-tabler-icons script — out of scope per Rule "scope boundary" guidance.
- **Files modified:** `livos/packages/ui/package.json`
- **Commit:** `ff20f731` (rolled into Task 2 commit)
- **Out-of-scope discovery:** The copy-tabler-icons cross-platform shell incompat is a real issue for Windows contributors but is unrelated to Plan 66-03's goal. NOT logging to deferred-items.md because it's a pre-existing condition that hasn't blocked anyone in 6 months of development.

**2. [Documentation] Pinned slider at `^1.3.6` instead of plan-suggested `^1.2.0`**

- **Found during:** Task 2
- **Issue:** Plan suggested `^1.2.0` but pnpm resolved latest 1.x as `1.3.6` and wrote that to lockfile.
- **Fix:** Used `^1.3.6` in package.json to match lockfile (a `^1.2.0` specifier with a lockfile pinning 1.3.6 would be inconsistent — keeping them aligned). 1.3.6 is API-compatible with 1.2.0 (semver minor bump within the same Radix major).
- **Why:** Aligning specifier with lockfile reduces churn for the next contributor running `pnpm install`.

No other deviations. Card path (`components/ui/card.tsx` not `shadcn-components/ui/card.tsx`) was already correctly noted in the plan's `<objective>` block.

## Authentication Gates

None.

## Verification Status

| Gate                                                                     | Status |
| ------------------------------------------------------------------------ | ------ |
| `button.tsx` contains `'liv-primary'` referencing `--liv-accent-cyan`    | PASS   |
| `button.tsx` retains all 5 original variants                             | PASS   |
| `badge.tsx` contains `'liv-status-running'` with `animate-pulse` on `before:` | PASS |
| `badge.tsx` retains all 4 original variants                              | PASS   |
| `card.tsx` contains `liv-elevated` referencing `liv-glass`               | PASS   |
| `card.tsx` `cardClass` export retained, default Card behaviour unchanged | PASS   |
| `slider.tsx` exists, imports `@radix-ui/react-slider`                    | PASS   |
| `slider.tsx` defines `liv-slider` variant referencing `--liv-accent-cyan` | PASS   |
| `slider.tsx` exports `Slider` (forwardRef) + `sliderVariants`            | PASS   |
| `livos/packages/ui/package.json` lists `@radix-ui/react-slider`          | PASS   |
| `pnpm --filter @livos/config build` exits 0                              | PASS   |
| `pnpm --filter ui build` exits 0 (vite, ~38s, 195 PWA precache entries)  | PASS   |
| Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged          | PASS   |
| `livos/packages/ui/src/components/motion-primitives/` not modified (D-09) | PASS  |

`pnpm --filter ui typecheck` was NOT run as a correctness gate per the orchestrator's instruction: "Some pre-existing repo-wide TypeScript errors (538 noted by 66-02 executor) are out of scope; correctness gate is vite build success." Vite uses esbuild for transpilation and does not block on TypeScript errors. The 4 plan-touched files were verified to introduce zero new TypeScript errors via `tsc --noEmit` filtered to those paths (no error lines in the typecheck output reference `button.tsx`, `badge.tsx`, `card.tsx`, or `slider.tsx`).

## Known Stubs

None. All four variants are functionally complete; visual A/B verification happens in Plan 66-05 playground.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or trust-boundary changes. The new Radix sub-package is a sibling of 14 already-trusted Radix packages.

## Self-Check: PASSED

- File `livos/packages/ui/src/shadcn-components/ui/button.tsx` — FOUND, contains `'liv-primary'`
- File `livos/packages/ui/src/shadcn-components/ui/badge.tsx` — FOUND, contains `'liv-status-running'`
- File `livos/packages/ui/src/components/ui/card.tsx` — FOUND, contains `liv-elevated`
- File `livos/packages/ui/src/shadcn-components/ui/slider.tsx` — FOUND (NEW), contains `liv-slider` and `@radix-ui/react-slider`
- Commit `63d2a14c` — FOUND in `git log --oneline`
- Commit `ff20f731` — FOUND in `git log --oneline`
- Sacred file SHA — `4f868d318abff71f8c8bfbcf443b2393a553018b` (unchanged)
- D-09 invariant — `git status livos/packages/ui/src/components/motion-primitives/` returns no changes
