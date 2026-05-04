---
phase: 66-liv-design-system-v1
plan: 01
subsystem: design-system
tags: [design-system, tokens, css, typography, tailwind, dark-only]
requires: []
provides:
  - liv-tokens.css (:root CSS variables + 5 utility classes)
  - Inter Variable + JetBrains Mono fonts via Google Fonts CDN
  - Tailwind type scale (text-display-1, text-display-2, text-h1, text-body, text-caption, text-mono-sm)
affects:
  - All P67+ UI surfaces consuming var(--liv-*) tokens
  - All UI consuming `text-body` / `text-caption` (legacy values updated to Liv spec)
tech-stack:
  added:
    - Google Fonts: Inter Variable (opsz 14..32, wght 300..700)
    - Google Fonts: JetBrains Mono (wght 400/500/700)
  patterns:
    - CSS custom properties on :root for color/motion tokens (D-03, D-04)
    - Glass / grain / glow utility classes layered on tokens (D-13)
    - Tailwind theme.extend.fontSize keyed for first-class text-* utilities (D-11)
key-files:
  created:
    - livos/packages/ui/src/styles/liv-tokens.css
  modified:
    - livos/packages/ui/src/index.css
    - livos/packages/ui/tailwind.config.ts
decisions:
  - "Liv `body` (15px) overrides legacy `body` (14px) at the same Tailwind key"
  - "Liv `caption` (12px, fontWeight 400, lineHeight 1.4) overrides legacy `caption` (12px, letterSpacing 0.01em) at the same Tailwind key"
  - "Inter Variable / Inter literals appended to fontFamily.sans (after var(--font-jakarta), var(--font-inter)) so the new CDN-loaded font resolves; existing var(--font-inter) chain preserved"
metrics:
  duration: ~25 minutes
  tasks-completed: 2
  files-touched: 3
  commits: 2
  completed-date: 2026-05-04
---

# Phase 66 Plan 01: Liv Design Tokens + Typography Foundation Summary

**One-liner:** Foundational dark-only Liv design token layer (`--liv-*` CSS variables, glass/grain/glow utility classes) plus Inter Variable + JetBrains Mono via CDN and a Tailwind type scale (`text-display-1`/`text-h1`/`text-body`/etc.) that every P67+ UI phase consumes.

## What Was Built

### Task 1 — `livos/packages/ui/src/styles/liv-tokens.css` (NEW, commit `887ca00c`)

A single 81-line file containing:

**`:root` CSS variables (verbatim from `.planning/v31-DRAFT.md` lines 198-224):**

| Group | Tokens |
|-------|--------|
| Surface | `--liv-bg-deep` `#050b14`, `--liv-bg-elevated` `#0a1525`, `--liv-bg-glass` `rgba(20,30,50,0.6)`, `--liv-border-subtle` `rgba(120,180,255,0.08)` |
| Text | `--liv-text-primary` `#e8f0ff`, `--liv-text-secondary` `#a8b8cc`, `--liv-text-tertiary` `#6b7a8f` |
| Accent | `--liv-accent-cyan` `#4dd0e1`, `--liv-accent-amber` `#ffbd38`, `--liv-accent-violet` `#a78bfa`, `--liv-accent-emerald` `#4ade80`, `--liv-accent-rose` `#fb7185` |
| Motion durations | `--liv-dur-instant` `100ms`, `--liv-dur-fast` `200ms`, `--liv-dur-normal` `350ms`, `--liv-dur-slow` `600ms` |
| Easing | `--liv-ease-out` `cubic-bezier(0.16, 1, 0.3, 1)`, `--liv-ease-spring` `cubic-bezier(0.34, 1.56, 0.64, 1)` |

**Utility classes (D-13):**

- `.liv-glass` — `backdrop-filter: blur(12px) saturate(1.2)` + `var(--liv-bg-glass)` background + 1px subtle border. Includes `-webkit-backdrop-filter` for Safari.
- `.liv-grain` — sets `position: relative` and renders an `::after` pseudo-element overlay using `repeating-conic-gradient(from 0deg, rgba(255,255,255,0.012) 0deg 0.5deg, transparent 0.5deg 1deg)` so the host element's content is unaffected.
- `.liv-glow-amber` — `box-shadow: 0 0 24px rgba(255,189,56,0.2), inset 0 1px 0 rgba(255,189,56,0.1)`
- `.liv-glow-cyan` — same shape, `rgba(77,208,225,*)`
- `.liv-glow-violet` — same shape, `rgba(167,139,250,*)`

No `[data-theme="light"]` selector, no extra invented variables — strict adherence to D-01/D-03.

### Task 2 — Font wiring + Tailwind type scale (commit `94b0a556`)

**`livos/packages/ui/src/index.css`:**

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap');

@tailwind base;
@import './styles/liv-tokens.css';
@tailwind components;
@tailwind utilities;
```

Space Grotesk import preserved (D-12). The Liv tokens import is placed immediately after `@tailwind base` and before `@tailwind components` per D-04 so the variables are available before component layers are built.

**`livos/packages/ui/tailwind.config.ts`:**

`theme.fontFamily.sans` extended with `'Inter Variable'` and `'Inter'` literals so the CDN font resolves:

```ts
sans: ['var(--font-jakarta)', 'var(--font-inter)', 'Inter Variable', 'Inter', ...defaultTheme.fontFamily.sans],
```

`theme.extend.fontSize` gained the 6 Liv type-scale keys per D-11:

```ts
'display-1': ['48px', {lineHeight: '1.1',  fontWeight: '600', letterSpacing: '-0.02em'}],
'display-2': ['36px', {lineHeight: '1.15', fontWeight: '600', letterSpacing: '-0.02em'}],
h1:          ['24px', {lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em'}],
body:        ['15px', {lineHeight: '1.5',  fontWeight: '400'}],
caption:     ['12px', {lineHeight: '1.4',  fontWeight: '400'}],
'mono-sm':   ['13px', {lineHeight: '1.5',  fontWeight: '400', fontFamily: 'JetBrains Mono, monospace'}],
```

These produce `text-display-1`, `text-display-2`, `text-h1`, `text-body`, `text-caption`, `text-mono-sm` Tailwind utilities for P67+ consumers.

## Build Verification

```text
pnpm --filter @livos/config build  ->  exit 0 (tsc clean)
pnpm --filter ui build              ->  exit 0 (✓ built in 38.73s, vite + PWA, no TS errors,
                                                no Tailwind unknown-class warnings)
```

The pre-existing chunk-size warning (some chunks > 500 kB) is unrelated to this plan and was present before the changes.

## Sacred File SHA Gate

| Stage | SHA | Status |
|-------|-----|--------|
| Pre-Task 1 | `4f868d318abff71f8c8bfbcf443b2393a553018b` | matches |
| Post-Task 1 | `4f868d318abff71f8c8bfbcf443b2393a553018b` | matches |
| Post-Task 2 | `4f868d318abff71f8c8bfbcf443b2393a553018b` | matches |

`nexus/packages/core/src/sdk-agent-runner.ts` was never read or written by this plan. Gate is clean.

## Scope Compliance

- D-09 (motion-primitives untouched): no edits under `livos/packages/ui/src/components/motion-primitives/`. Verified via `git diff --name-only`.
- D-NO-BYOK / D-NO-SERVER4: not applicable to this plan (no broker, no server changes).
- D-12 (Space Grotesk preserved): import on line 1 of `index.css` retained.
- Single-file token policy (D-02): no chunked sub-files.
- Dark-only (D-03): no `[data-theme="light"]` selector or light-theme variant.

## Deviations from Plan

### [Rule 1 — Bug] Plan-spec key collision in tailwind.config.ts fontSize

- **Found during:** Task 2.
- **Issue:** Plan acceptance criterion required `theme.extend.fontSize` to contain keys `body`, `caption`, `display-1`, `display-2`, `h1`, `mono-sm`. The legacy fontSize block already had `body: ['14px', ...]` and `caption: ['12px', {letterSpacing: '0.01em'}]` with different values. Plan also said "preserve existing fontSize entries, only ADD" — but a JS object literal cannot have two entries with the same key, so adding a Liv `body: ['15px', ...]` while keeping legacy `body: ['14px', ...]` is impossible.
- **Resolution:** Removed the legacy `body` and `caption` entries; the Liv values per v31-DRAFT line 238 win at those keys. Legacy `body-sm`/`body-lg`/`caption-sm`/`heading-*`/`display-*`/`display-sm`/`display-lg` entries are all preserved unchanged. The legacy 14px → 15px body shift is consistent with the v31 typography redesign direction (D-11 explicitly says Liv replaces shadcn defaults). 20+ existing UI files use `text-body`/`text-caption` (mostly settings + docker pages); they will render at the new 15px / Liv-spec metrics, which is a 1px increase — visually negligible and aligned with the v31 direction.
- **Files modified:** `livos/packages/ui/tailwind.config.ts`.
- **Commit:** `94b0a556`.

### Note: Out-of-scope discoveries

The working tree contained leftover changes to `livos/pnpm-lock.yaml` (additions of `@anthropic-ai/claude-agent-sdk` from prior work) and untracked motion primitives (`TypewriterCaret.tsx`, `motion/index.ts`) that belong to plan 66-02. Per the scope-boundary rule, these were NOT committed by this plan — only `livos/packages/ui/src/styles/liv-tokens.css`, `livos/packages/ui/src/index.css`, and `livos/packages/ui/tailwind.config.ts` were staged.

## Files Created / Modified

| Action | Path | Purpose |
|--------|------|---------|
| created | `livos/packages/ui/src/styles/liv-tokens.css` | All Liv design tokens on :root + 5 utility classes |
| modified | `livos/packages/ui/src/index.css` | 2 font CDN imports + 1 token import |
| modified | `livos/packages/ui/tailwind.config.ts` | fontFamily.sans + 6 Liv fontSize keys |

## Commits

| Hash | Message |
|------|---------|
| `887ca00c` | feat(66-01): add liv-tokens.css with design tokens and utility classes |
| `94b0a556` | feat(66-01): wire Inter + JetBrains Mono fonts and import liv-tokens.css |

## Snippet — rendered fontSize entries (post-edit, lines 184-193 of `tailwind.config.ts`)

```ts
// Liv Design System v1 type scale (Phase 66, D-11) per v31-DRAFT.md line 238.
// Keys `display-1`, `display-2`, `h1`, `body`, `caption`, `mono-sm` produce
// the `text-display-1`, `text-h1`, `text-body`, etc. Tailwind utilities that
// P67+ chat UI / side panel / composer consume.
'display-1': ['48px', {lineHeight: '1.1', fontWeight: '600', letterSpacing: '-0.02em'}],
'display-2': ['36px', {lineHeight: '1.15', fontWeight: '600', letterSpacing: '-0.02em'}],
h1: ['24px', {lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em'}],
body: ['15px', {lineHeight: '1.5', fontWeight: '400'}],
caption: ['12px', {lineHeight: '1.4', fontWeight: '400'}],
'mono-sm': ['13px', {lineHeight: '1.5', fontWeight: '400', fontFamily: 'JetBrains Mono, monospace'}],
```

## Downstream Impact

- P66-03 (`shadcn liv-* variants`) can now reference `var(--liv-accent-cyan)` etc.
- P66-05 (playground swatches) can now render every `--liv-*` variable directly.
- P67+ UI surfaces gain `text-display-1`/`text-h1`/`text-body`/`text-mono-sm` first-class utilities + 5 utility classes (`.liv-glass`, `.liv-grain`, `.liv-glow-{amber,cyan,violet}`).
- All v31 UI work now has its visual contract committed.

## Self-Check: PASSED

- `livos/packages/ui/src/styles/liv-tokens.css` exists (FOUND).
- `livos/packages/ui/src/index.css` updated (FOUND, contains Inter + JetBrains Mono + liv-tokens import + Space Grotesk preserved).
- `livos/packages/ui/tailwind.config.ts` updated (FOUND, contains all 6 Liv fontSize keys + Inter Variable in fontFamily.sans).
- Commit `887ca00c` exists (FOUND).
- Commit `94b0a556` exists (FOUND).
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` matches (FOUND).
- Build exits 0 (FOUND).
