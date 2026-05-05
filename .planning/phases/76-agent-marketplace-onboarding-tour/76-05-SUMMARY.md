---
phase: 76
plan: 05
subsystem: ui-onboarding
tags: [onboarding, tour, ui, motion-primitives, homegrown, p66-composition]
requirements: [MARKET-06]
dependency_graph:
  requires:
    - "P66 motion primitives (SlideInPanel, GlowPulse) at @/components/motion"
    - "shadcn Button (liv-primary variant) at @/shadcn-components/ui/button"
    - "react-dom/client (peer of react)"
  provides:
    - "<LivTour> root component (default export from @/components/liv-tour)"
    - "useTourState hook + TourState type"
    - "LIV_TOUR_STEPS array + LivTourStep type (locked 9 steps per CONTEXT D-15)"
    - "<Spotlight> SVG mask overlay"
    - "DEFAULT_STORAGE_KEY constant ('liv-tour-completed')"
  affects:
    - "76-06 (Settings → Liv Agent): Replay button must clear DEFAULT_STORAGE_KEY then navigate('/ai-chat')"
    - "76-07 (mount + data-tour attrs): mounts <LivTour onSetComposerDraft={...}/> in /ai-chat AND adds data-tour=\"composer\"/\"slash-hint\"/\"agent-picker\"/\"liv-tool-panel\"/\"reasoning-card\"/\"marketplace-link\" attributes to existing components"
tech_stack:
  added: []
  patterns:
    - "Direct react-dom/client + jsdom test harness (RTL-shaped helpers, P67-04 / P68-05 / P75-02 precedent)"
    - "useState init lambda for first-paint-clean localStorage read (install-prompt-banner.tsx:19 canonical)"
    - "useLayoutEffect + rAF-throttled scroll/resize for spotlight rect tracking (T-76-05-03 mitigation)"
    - "createPortal escape from stacking contexts (D-13 portal-preferred)"
    - "Pure-component step manifest (onEnter wired by root, not statically) — keeps steps array serialisable"
key_files:
  created:
    - "livos/packages/ui/src/components/liv-tour/index.tsx (180 lines)"
    - "livos/packages/ui/src/components/liv-tour/liv-tour-steps.ts (96 lines)"
    - "livos/packages/ui/src/components/liv-tour/use-tour-state.ts (115 lines)"
    - "livos/packages/ui/src/components/liv-tour/spotlight.tsx (122 lines)"
    - "livos/packages/ui/src/components/liv-tour/use-tour-state.unit.test.ts (189 lines)"
  modified: []
decisions:
  - "Step-5 composer-draft mechanism: callback prop (`onSetComposerDraft?: (text: string) => void`) — NOT a window-level CustomEvent. Rationale: callback prop is React-idiomatic, type-safe, easier to unit-test, no global namespace pollution. Trade-off: caller must thread the prop down (one extra line in 76-07). Custom-event would have been zero-prop-mounting-cost but introduces an untyped global event bus and makes the contract harder to verify in tests."
  - "Tooltip placement v1: anchored steps render at `fixed bottom-8 inset-x-0 grid place-items-center` (pinned bottom-center). Plan <interfaces> explicitly authorised this simplification — placement-aware positioning math (top/bottom/left/right relative to rect) is BACKLOG once visually-wrong. Avoids overflow + keeps surface lean."
  - "Spotlight rendering when targetSelector missing/unfound: NO cutout rect on the SVG mask → fully opaque dim layer. This naturally serves the centered welcome (step 1) + done (step 9) modal steps with the same SVG component (no branch / no separate component). Production-safe degradation when downstream selectors drift."
  - "useLayoutEffect over useEffect for rect measurement: prevents single-frame flicker between mount and first paint (the tooltip would otherwise briefly render at unmeasured rect = (0,0)). Plan-explicit."
  - "rAF-throttled scroll/resize handlers (T-76-05-03 mitigation): wraps `setRect(...)` in a `requestAnimationFrame` debounce — collapses noisy scroll streams to one measurement per frame."
  - "Test harness: direct react-dom/client mount with `captured` ref pattern. RTL absent (D-NO-NEW-DEPS). When `@testing-library/react` lands, helpers swap 1:1 to `renderHook`."
metrics:
  duration_minutes: 12
  completed_date: "2026-05-04"
  tasks_completed: 1
  files_changed: 5
---

# Phase 76 Plan 05: Homegrown <LivTour> 9-Step Onboarding Component Summary

Self-contained 9-step onboarding tour built from P66 motion primitives + native SVG mask + DOM `getBoundingClientRect()` + `localStorage`, mounting-ready for Phase 76-07.

## Files Created (5 files, 702 LOC total)

| File | Lines | Min | Purpose |
|------|------:|----:|---------|
| `livos/packages/ui/src/components/liv-tour/index.tsx` | 180 | 120 | Top-level `<LivTour>` — composes Spotlight + SlideInPanel + GlowPulse, handles keyboard, wires step-5 composer draft, renders via createPortal to `document.body` |
| `livos/packages/ui/src/components/liv-tour/liv-tour-steps.ts` | 96 | 60 | `LIV_TOUR_STEPS` — 9 locked steps verbatim per CONTEXT D-15 + `LivTourStep` type |
| `livos/packages/ui/src/components/liv-tour/use-tour-state.ts` | 115 | 70 | `useTourState` hook — state machine + localStorage persistence + SSR-guarded read/write |
| `livos/packages/ui/src/components/liv-tour/spotlight.tsx` | 122 | 60 | `<Spotlight>` — SVG mask overlay with rectangular cutout + rAF-throttled scroll/resize tracking |
| `livos/packages/ui/src/components/liv-tour/use-tour-state.unit.test.ts` | 189 | 80 | 6 vitest cases (init absent / init flag / next / back-clamp / skip / next-past-last → finish) |

## Step-5 Composer-Draft Mechanism — Callback Prop

The plan offered two options: callback prop OR window-level `CustomEvent`. **Chose callback prop** (`onSetComposerDraft?: (text: string) => void`).

Rationale:
1. **Type safety** — TypeScript checks the prop signature at the consumer call site; CustomEvent payload is `unknown`.
2. **Test ergonomics** — unit tests pass a `vi.fn()`; CustomEvent path requires global event listeners + cleanup.
3. **Locality** — the contract is visible in the JSX where 76-07 mounts `<LivTour>`; CustomEvent decouples in a way that hides the dependency from code review.
4. **No global namespace pollution** — `liv-tour:set-composer-draft` would be a permanent reserved event name.

Trade-off accepted: 76-07 must thread the prop one level (composer ref → `setDraft` → tour). One line of glue. Worth it.

## Test Result — 6/6 Pass

```
✓ src/components/liv-tour/use-tour-state.unit.test.ts > useTourState (Phase 76-05) > init: localStorage flag absent → isVisible=true and currentStep=steps[0]
✓ src/components/liv-tour/use-tour-state.unit.test.ts > useTourState (Phase 76-05) > init: localStorage flag === '1' → isVisible=false and currentStep=null
✓ src/components/liv-tour/use-tour-state.unit.test.ts > useTourState (Phase 76-05) > next() increments currentStepIndex
✓ src/components/liv-tour/use-tour-state.unit.test.ts > useTourState (Phase 76-05) > back() at index 0 stays at 0 (clamped)
✓ src/components/liv-tour/use-tour-state.unit.test.ts > useTourState (Phase 76-05) > skip() sets localStorage flag and isVisible=false
✓ src/components/liv-tour/use-tour-state.unit.test.ts > useTourState (Phase 76-05) > next() past last step calls finish (sets flag and isVisible=false)

Test Files  1 passed (1)
     Tests  6 passed (6)
  Duration  1.17s
```

Coverage of all six must-haves:
1. init reads localStorage (absent → visible) ✓
2. init reads localStorage (`'1'` → hidden) ✓
3. next() increments ✓
4. back() clamped at 0 ✓
5. skip() sets flag + hides ✓
6. next() past last step calls finish (flag + hidden) ✓

## Build Status — Green

`pnpm --filter ui build` exits 0:
- 11855 modules transformed
- Built in 33.88s
- PWA manifest regenerated (202 entries, 7001 KiB precache)
- No TypeScript errors introduced by tour files

(First build attempt errored with `ENOTEMPTY: dist/generated-tabler-icons` — pre-existing Windows fs flake, unrelated to tour code; resolved by clearing `dist/` and re-running. Second build clean.)

## Sacred SHA Verification

Pre-task: `4f868d318abff71f8c8bfbcf443b2393a553018b`
Post-task: `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ unchanged

`nexus/packages/core/src/sdk-agent-runner.ts` not touched.

## Hard Rules Compliance

| Rule | Status | Notes |
|------|--------|-------|
| D-NO-BYOK | OK | No API key UI / entry path. |
| D-NO-SERVER4 | OK | UI-only change; no deploy targeting. |
| D-NO-NEW-DEPS | OK | `livos/packages/ui/package.json` UNCHANGED. Verified via `git diff package.json` (empty). |
| Sacred SHA unchanged | OK | `4f868d31...` stable. |
| No `react-joyride` / `intro.js` / `driver.js` imports | OK | Verified by automated `node -e` grep gate (zero forbidden tour-lib strings in any file). |
| Tour non-destructive (D-14) | OK | Step 5 only fires `onSetComposerDraft` callback; no auto-Send. |
| No `dangerouslySetInnerHTML` | OK | All step body strings rendered as plain `{children}` (T-76-05-01 mitigation). |
| LocalStorage-only persistence (D-17) | OK | No server-side flag; key `liv-tour-completed`. |

## Threat Model Mitigations Applied

| Threat ID | Disposition | Implementation |
|-----------|-------------|----------------|
| T-76-05-01 (Information Disclosure — untrusted HTML in body) | mitigate | All step body strings are static literals in `liv-tour-steps.ts`. React renders as plain text. No `dangerouslySetInnerHTML`. |
| T-76-05-03 (DoS — scroll-loop measurement) | mitigate | resize/scroll listeners in `spotlight.tsx` are `requestAnimationFrame`-throttled — collapses to ≤1 measurement per frame. |
| T-76-05-05 (Step-5 destructive auto-execute) | mitigate | D-14 — tour calls `onSetComposerDraft(text)` only; never invokes Send / runner. User-initiated dispatch only. |
| T-76-05-02 (CSS-evade overlay) | accept | Tour is non-security UI; bypassing hides help. |
| T-76-05-04 (localStorage flag tampering) | accept | Per-browser convenience flag; no audit needed. |

## Verification Gate Results (per PLAN <verify>)

| Gate | Result |
|------|--------|
| `node -e "...steps OK"` (9 step IDs verbatim) | PASS — `steps OK` |
| `node -e "...index.tsx OK"` (createPortal + SlideInPanel + useTourState + data-tour-overlay; no forbidden tour-lib strings) | PASS — `index.tsx OK` |
| `node -e "...hook OK"` (`liv-tour-completed` storage key in hook) | PASS — `hook OK` |
| `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` | `4f868d318abff71f8c8bfbcf443b2393a553018b` (matches D-22 lock) |
| `pnpm --filter ui build` | PASS — exit 0, 33.88s |

## Commit Entanglement Note

A concurrent agent committed during this session, sweeping my staged 5 liv-tour files into commit `47c5bf9a feat(69-03): WebScrapeToolView with react-markdown body` (HEAD). The 5 files are present, intact, and verified at HEAD — content is correct (verified `git show 47c5bf9a:.../liv-tour-steps.ts`). Phase attribution belongs to 76-05 despite commit-message labeling (69-03 was the other agent's web-scrape work which they entangled with my staged index).

This SUMMARY + the locked frontmatter `key_files` list serve as the authoritative attribution for the 76-05 work. The threat is purely cosmetic (commit message); the code is correct, the tests pass, and the artifacts match the plan.

## Deviations from Plan

None — plan executed exactly as written. Step-5 mechanism choice (callback vs CustomEvent) was a "Claude's discretion" decision documented in `decisions:` frontmatter.

## Self-Check: PASSED

- `livos/packages/ui/src/components/liv-tour/index.tsx` — FOUND
- `livos/packages/ui/src/components/liv-tour/liv-tour-steps.ts` — FOUND
- `livos/packages/ui/src/components/liv-tour/use-tour-state.ts` — FOUND
- `livos/packages/ui/src/components/liv-tour/spotlight.tsx` — FOUND
- `livos/packages/ui/src/components/liv-tour/use-tour-state.unit.test.ts` — FOUND
- Commit `47c5bf9a` — FOUND (contains all 5 liv-tour files; entanglement noted above)
- Sacred SHA `4f868d31...` — VERIFIED unchanged
- 6/6 unit tests pass
- `pnpm --filter ui build` exit 0
- Zero new npm deps (package.json diff empty)
- No `react-joyride` / `intro.js` / `driver.js` strings in any file
