---
phase: 120-mini-pc-ui-migration-wave-1
plan: 05
subsystem: ui-app-store
tags: [design-system, ui-kit, mini-pc, app-store, wave-2, v35.0]
dependency-graph:
  requires:
    - "Plan 120-01 (design-tokens + ui-kit wired into livos/packages/ui)"
    - "@livinity/ui-kit Pill component (Phase 119-02)"
  provides:
    - "App Store top nav restyled to canonical card-bg-2 surface for active-tab background"
    - "Discover grid app tiles restyled to canonical rounded-dash + dash-line + shadow-card hover"
    - "App detail page subscription badge restyled to ui-kit <Pill tone='neutral'>"
    - "App detail info-section compatibility row restyled to ui-kit <Pill tone='ok'|'err'>"
    - "Wave 1 cumulative running tally: ~23 / 30 (incl. 01 foundation + 02/03/04/05 component plans)"
  affects:
    - "livos/packages/ui App Store window (visual layer only)"
    - "Mini PC daily-driver App Store browsing surface"
tech-stack:
  added: []
  patterns:
    - "ui-kit <Pill> replaces shadcn <Badge variant='outline'> for stateless badges where API parity holds"
    - "Canonical Tailwind utilities (rounded-dash, bg-card-bg-2, border-dash-line, shadow-card, duration-dash) replace bespoke neutral-* + rounded-2xl"
    - "Tile hover surface (bg-card-bg-2 + border-dash-line + shadow-card) wired on AppWithDescription Link"
    - "FeaturedAppCard restyled to canonical bg-card-bg + border-dash-line (gradient prop preserved)"
key-files:
  created:
    - ".planning/phases/120-mini-pc-ui-migration-wave-1/120-05-SUMMARY.md"
  modified:
    - "livos/packages/ui/src/modules/app-store/app-store-nav.tsx"
    - "livos/packages/ui/src/modules/app-store/app-page/app-content.tsx"
    - "livos/packages/ui/src/modules/app-store/app-page/info-section.tsx"
    - "livos/packages/ui/src/modules/app-store/discover/apps-grid-section.tsx"
decisions:
  - "Per plan interfaces 'When in doubt, restyle in place rather than swap': preserved shadcn <Badge> swap to <Pill> only for the subscription/compatibility badges — small, stateless, no data-attr / ref / test-id consumers in the codebase."
  - "Did NOT introduce ui-kit <Button> for install/uninstall — install/uninstall action buttons live in app-page/top-header.tsx, NOT in app-content.tsx; that file is NOT in this plan's files_modified scope. app-content.tsx is purely a section orchestrator."
  - "Did NOT touch app-store-nav.tsx tab text/active-state colors — file uses motion-primitives AnimatedBackground (rounded-full pill animation) NOT border-b-2 tabs; the canonical token mapping (border-blue-600 → border-accent-blue) does not apply. Restyled only the AnimatedBackground container surface (bg-neutral-100 → bg-card-bg-2)."
  - "info-section.tsx already consumed semantic shared classes (cardClass, cardTitleClass, linkClass) from a tokenized chain; no className substitutions needed for the section shell itself. Only the compatibility row got the ui-kit <Pill> upgrade for clearer ok/err visual semantics."
  - "Removed unused `Badge` import from app-content.tsx after Pill swap (both desktop + mobile branches updated)."
metrics:
  duration: "~25 minutes"
  completed: "2026-05-14"
  tasks: 3
  files_modified: 4
---

# Phase 120 Plan 05: App Store Window Restyle Summary

Restyled the 4 highest-traffic Mini PC App Store surfaces (nav header, discover grid, app-detail content shell, app-detail info section) to canonical `@livinity/design-tokens` tokens and `@livinity/ui-kit` `<Pill>` — zero behavioral diff, install/uninstall/update mutation flows preserved verbatim.

## What Shipped

- **`app-store-nav.tsx`** — `AnimatedBackground` container background swapped `bg-neutral-100` → `bg-card-bg-2`. The active-tab pill animation, ButtonLink rendering, `useParams`/`useEffect` scroll-into-view logic, and `categoryIdToPath` routing helper all preserved byte-identical.
- **`app-content.tsx`** — Subscription marketplace badge (`Phase 43 D-43-12`) on both desktop and mobile branches swapped from shadcn `<Badge variant='outline'>` to ui-kit `<Pill tone='neutral'>`. `self-start` alignment moved onto the wrapper `<div>` to preserve flex behavior. Unused `Badge` import removed. All section orchestration (AboutSection, ReleaseNotesSection, SettingsSection, AppHealthCard, PublicAccessSection, InfoSection, DependenciesSection, RecommendationsSection, DebugOnly + JSONTree) untouched.
- **`info-section.tsx`** — `InfoSectionCompatibilityText` rewrapped to return a `<Pill tone='ok'|'err'>` for compatible / not-compatible cases (clearer semantic signaling on a row that previously rendered plain text). `t('unknown')` fallback preserved as plain text via `<>...</>` Fragment. `cardClass`/`cardTitleClass`/`linkClass` consumption untouched. All `KV` rows (version, source-code, developer, submitted-by, support link) untouched.
- **`apps-grid-section.tsx`**:
  - `AppWithDescription` (per-tile Link inside `AppsGridSection` + `AppsGridFaintSection`): tile container restyled to `rounded-dash`, `hover:bg-card-bg-2 hover:border-dash-line hover:shadow-card`, `transition-all duration-dash`. The per-app `to` prop, `preloadFirstFewGalleryImages(app)` on mouse-enter, AppIcon rendering, hover arrow indicator, and `unstable_viewTransition` flag all preserved.
  - `FeaturedAppCard`: surface restyled `bg-gradient-to-br from-neutral-50 to-white` → `bg-card-bg`, `border-neutral-200/80` → `border-dash-line`, `rounded-3xl` → `rounded-dash`, custom hover shadow → `hover:shadow-card`. `gradient` prop preserved (still overrides surface if caller passes one). Glow blur, AppIcon, name/tagline/description rendering untouched.

## Files Modified

| File | Diff | Change Summary |
| --- | --- | --- |
| `livos/packages/ui/src/modules/app-store/app-store-nav.tsx` | +1 / -1 | AnimatedBackground surface → `bg-card-bg-2` |
| `livos/packages/ui/src/modules/app-store/app-page/app-content.tsx` | +7 / -7 | `Badge` → ui-kit `Pill` (both branches); import swap |
| `livos/packages/ui/src/modules/app-store/app-page/info-section.tsx` | +10 / -5 | Compatibility text → `<Pill tone='ok'|'err'>`; ui-kit import |
| `livos/packages/ui/src/modules/app-store/discover/apps-grid-section.tsx` | +7 / -7 | Tile + FeaturedAppCard → canonical bg/border/radius/shadow tokens |

Total: 4 files, 25 insertions, 20 deletions.

## Sacred SHA Verification

Verified before AND after every change:

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Per `D-120-SACRED-SHA` — preserved across all 3 tasks. No commit attempted with mismatched SHA.

## Build Status

```
$ cd livos && pnpm --filter ui build
✓ 44 modules transformed.
✓ built in 45.97s
PWA v1.2.0 — precache 206 entries (6928.94 KiB)
```

Production build PASS. No new typecheck errors in any plan-touched file (`app-store-nav.tsx`, `app-content.tsx`, `info-section.tsx`, `apps-grid-section.tsx`). Pre-existing errors in `stories/src/routes/stories/widgets.tsx`, `wifi.tsx`, and `webapp-stream-window.tsx` remain — all out-of-scope per scope boundary rule.

## Behavioral-Diff Audit

```
$ git diff livos/packages/ui/src/modules/app-store/ | grep -E "^[+-][[:space:]]*(on(Click|Submit|Change|MouseEnter|Focus|Blur)|useEffect|useState|useNavigate|useMutation|useQuery|trpc\.|navigate\(|toast\.)" | grep -v "^[+-][[:space:]]*$"
(empty)
```

PASS. Zero mutation handler, zero navigation, zero hook, zero tRPC call, zero toast trigger touched. Every install/uninstall/update flow, every per-app routing, every onMouseEnter preload, every dependency-check trigger preserved byte-identical.

## Wave 1 Cumulative Tally

- 120-01: foundation (0 components — install + wiring)
- 120-02 / 120-03 / 120-04: per their summaries (Wave-2 parallel-eligible)
- 120-05 (this plan): **+4 components** (app-store-nav, app-content, info-section, apps-grid-section)

Running cumulative after 01+02+03+04+05: ~23 / 30 — below the `D-120-WAVE-1-IS-30-COMPONENTS` cap with ~7 components of headroom for any follow-up patches discovered during operator UAT.

## Deviations from Plan

### Rule 1 / Rule 2 — Scope Clarification (no deviation, but documented for traceability)

- **app-store-nav.tsx canonical mapping**: The plan's "Existing → Replace with" table prescribed `border-blue-600 / text-blue-600 → border-accent-blue text-accent-blue` for active tab states. The actual file uses `motion-primitives/AnimatedBackground` with a `rounded-full bg-neutral-100` container — there is no `border-b-2`, no `border-blue-600`, no `text-blue-600`. The closest restyle was the container surface (`bg-neutral-100 → bg-card-bg-2`). Tab text color is controlled by `ButtonLink` (out-of-scope: different module). Documented per plan's "Workflow: Read each → Edit className + JSX wrapper swaps" — read first, then mapped what actually exists.
- **Install/Uninstall buttons NOT swapped to ui-kit `<Button>` in app-content.tsx**: The install/uninstall buttons live in `livos/packages/ui/src/modules/app-store/app-page/top-header.tsx` (NOT in `files_modified` for this plan). `app-content.tsx` is a pure section orchestrator with no action buttons. No deviation — plan's "Critical" note about preserving install button data attrs / refs is honored by the fact that those buttons were never touched. Future plan (likely Wave-2 follow-up or 121) can revisit `top-header.tsx`.
- **info-section.tsx compatibility row promoted to `<Pill>`**: Plan listed "Verified / Featured / Beta" as the canonical Pill swap targets in info-section. Actual file does NOT render verified/featured/beta badges (those would be in `top-header.tsx`). The plan's intent — "info section uses ui-kit `<Pill>` for category/verified/featured badges" — was honored by upgrading the closest semantic equivalent: the compatibility-compatible/not-compatible row, which is a stateless ok/err signal perfectly suited for `<Pill tone='ok'|'err'>`. Documented as a scope-faithful adaptation, not a deviation.

## Operator UAT (Mini PC)

1. SSH: existing session or `ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68`
2. Run: `bash /opt/livos/update.sh`
3. Open `https://bruce.livinity.io` (hard-reload)
4. Validate App Store end-to-end:
   a. Open App Store → top nav renders Discover / category-pill row with canonical card-bg-2 pill background; active-pill animation slides smoothly between categories.
   b. Discover view → app tiles render with transparent default surface and `card-bg-2 + dash-line border + shadow-card` on hover; hover arrow indicator still appears on right side; hover scale on icon still fires.
   c. Click any app tile → app detail page opens; if app `requiresAiProvider`, the "Uses your Claude subscription" badge renders as a ui-kit `<Pill tone='neutral'>` (rounded pill, neutral tone); otherwise the badge does not appear (conditional preserved).
   d. Scroll detail page → Info section's "Compatibility" row renders a green `<Pill tone='ok'>` for compatible apps OR a red `<Pill tone='err'>` for incompatible apps. Version, source-code link, developer link, submitted-by link, support link all render and route correctly.
   e. Discover featured cards (top of category) render with canonical `bg-card-bg + border-dash-line + rounded-dash` and hover shadow.
   f. Click [Install] on a not-yet-installed app → dependency-resolution dialog and credential-prompt dialog still trigger (mutations preserved). Click cancel — safely close. (DO NOT actually install/uninstall daily-driver apps during UAT unless explicitly desired.)
   g. Navigation between tabs (top nav category pills) preserves URL state and view-transition animations.
   h. Daily-driver sanity check: open Files → no regression.
5. Report PASS / FAIL in chat.
6. On FAIL: `cd /opt/livos && git revert <plan-commit> && bash update.sh`

## Auth Gates

None encountered.

## Known Stubs

None.

## Deferred Issues

- Pre-existing `webapp-stream-window.tsx` typecheck errors (3× `ActionLog.meta` does not exist) — unrelated to App Store; flagged for v33 protocol-mismatch follow-up phase or Phase 121.
- Pre-existing `stories/src/routes/stories/widgets.tsx` + `wifi.tsx` typecheck errors — surfaced in 120-01 SUMMARY; still out-of-scope. Logged to `.planning/phases/120-mini-pc-ui-migration-wave-1/deferred-items.md`.
- App-store-specific Vitest tests do not exist (verified via `find src/modules/app-store -name "*.test.ts*"` → empty). Co-located test step skipped per plan ("PASS required (skip if no tests exist)").
- `install/uninstall <Button>` swap in `top-header.tsx` — deferred (not in this plan's `files_modified` scope; the file owns the prominent install/uninstall/update action buttons that the plan's "Critical" warning targets). Wave-1 follow-up candidate within the 7-component headroom.

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/modules/app-store/app-store-nav.tsx` — contains `bg-card-bg-2`
- FOUND: `livos/packages/ui/src/modules/app-store/app-page/app-content.tsx` — contains `import {Pill} from '@livinity/ui-kit'`
- FOUND: `livos/packages/ui/src/modules/app-store/app-page/info-section.tsx` — contains `<Pill tone={compatible ? 'ok' : 'err'}>`
- FOUND: `livos/packages/ui/src/modules/app-store/discover/apps-grid-section.tsx` — contains `rounded-dash` and `hover:bg-card-bg-2`
- FOUND: `.planning/phases/120-mini-pc-ui-migration-wave-1/120-05-SUMMARY.md` — this file
- VERIFIED: `git hash-object liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sacred SHA preserved)
- VERIFIED: `pnpm --filter ui build` exits 0 — production bundle generated, 44 modules transformed, PWA precache 206 entries
- VERIFIED: behavioral-diff audit returns empty (no handler/mutation/hook drift)
