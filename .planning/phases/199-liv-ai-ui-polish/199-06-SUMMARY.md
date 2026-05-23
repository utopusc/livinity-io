---
phase: 199-liv-ai-ui-polish
plan: 06
subsystem: ui
tags: [generative-ui, tool-renderers, running-header, status-polish, assistant-ui, wave3-parallel-safe]

# Dependency graph
requires:
  - phase: 199-03
    provides: chat-route → agent.stream dynamic-model RequestContext (orthogonal — Plan 199-06 is UI-only but Wave 3 depends on Wave 2 backend)
  - phase: 199-04
    provides: model-picker.tsx (orthogonal — Plan 199-06 is file-disjoint sibling within Wave 2 cascade)
  - phase: 198-03
    provides: 10 P198-03 makeAssistantToolUI generative renderers (WeatherToolUI / WebSearchToolUI / etc.)
  - phase: 198-04
    provides: 6 makeApprovalToolUI HITL renderers (W-02 lock — UNTOUCHED here)
provides:
  - "<RunningHeader label icon?> micro-primitive (livos/packages/ui/src/components/tool-ui/running-header.tsx)"
  - "10 P198-03 generative renderers updated with status.type === 'running' branch emitting <RunningHeader> with args-echo label"
  - "10 P198-03 generative renderers updated with status.type === 'incomplete' branch emitting red error chip / muted 'Cancelled' chip via new IncompleteChip helper"
  - "T-199-06 XSS regression-lock — angle-bracketed label renders as escaped text"
affects:
  - 199-07  # header bar may polish the same chrome family
  - 199-08  # operator UAT step 8 + 9 + 10 — RunningHeader visible during running

# Tech tracking
tech-stack:
  added: []  # zero new top-level deps (INV-199-04)
  patterns:
    - "RunningHeader micro-primitive — flex row with default Loader2 spinner + muted-foreground label; centralises 'running' status chrome across all generative renderers"
    - "IncompleteChip helper centralises status.type === 'incomplete' chip JSX (red error vs muted cancelled) so all 10 renderers ship byte-identical chrome"
    - "Per-renderer args-echo template (RESEARCH E5) — args interpolated via optional chaining + ?? '…' fallback (T-199-06-02 mitigation)"
    - "React text-children only for tool args (NEVER dangerouslySetInnerHTML) — XSS regression-locked via vitest assertion"

key-files:
  created:
    - livos/packages/ui/src/components/tool-ui/running-header.tsx
    - livos/packages/ui/src/components/tool-ui/running-header.test.tsx
  modified:
    - livos/packages/ui/src/features/liv-ai/tool-renderers.tsx
    - livos/packages/ui/src/features/liv-ai/tool-renderers.test.tsx

key-decisions:
  - "D-199-22 RESEARCH E5 args-echo templates locked verbatim across all 10 renderers (Searching: '<query>' / Finding places in <city> / Checking weather in <location>… / etc.)"
  - "D-199-23 status branch coverage: running → RunningHeader; incomplete.reason==='error' → red chip; incomplete.reason==='cancelled' → muted 'Cancelled' chip; complete → existing primitive unchanged"
  - "New IncompleteChip helper centralises chip JSX (added during execution; not in plan, but mandated by D-199-23 — would otherwise duplicate 10× boilerplate across renderers)"
  - "2 pre-existing P198-03 running-state tests (WebSearch + PlacesSearch) updated to assert new RunningHeader DOM shape — the plan action step explicitly mandated 'Delete any prior <Skeleton className=h-XX/> placeholders that the running branch replaced' which inherently invalidates skeleton-DOM-shape assertions; documented as Rule-1 deviation"

patterns-established:
  - "Single RunningHeader component reused across 10 renderers — future renderers (e.g. forthcoming P200+ tools) plug in by adding a `status.type === 'running'` branch with the args-echo template"
  - "IncompleteChip pattern — single helper centralises the error/cancelled chip styling so future renderers + future incomplete reasons get consistent chrome"

requirements-completed: [REQ-199-05]

# Metrics
duration: ~30min
completed: 2026-05-23
---

# Phase 199 Plan 06: RunningHeader + Generative UI Status Polish Summary

**`<RunningHeader>` micro-primitive (Loader2 spinner + args-echo label) replaces the bare P198 `<Skeleton>` placeholders across 10 generative renderers, with explicit red error / muted "Cancelled" chips on `status.type === 'incomplete'` — `complete`-branch primitives and HITL ApprovalCard renderers UNTOUCHED.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-05-23T22:38:00Z
- **Completed:** 2026-05-23T22:55:00Z
- **Tasks:** 3
- **Files created:** 2
- **Files modified:** 2

## Accomplishments

- `<RunningHeader>` component shipped at `livos/packages/ui/src/components/tool-ui/running-header.tsx` (40 LOC including JSDoc) — Loader2 spinner default, optional `icon` prop override, muted-foreground label text in a bordered card.
- 5 vitest cases lock the component contract (label text + default spinner + custom icon + Loader2 classes + T-199-06 XSS regression).
- All **10 P198-03 generative renderers** updated to emit `<RunningHeader>` with per-renderer args-echo label during `status.type === 'running'` (per RESEARCH E5 table).
- All **10 P198-03 generative renderers** updated to emit `<IncompleteChip>` (red error chip / muted Cancelled chip) during `status.type === 'incomplete'`.
- 6 new vitest cases lock the new behaviour (3 RunningHeader running-label cases + 1 complete-branch regression-lock + 1 error-chip case + 1 cancelled-chip case).
- 2 pre-existing running-state assertions (WebSearch, PlacesSearch) updated to match the new chrome (Rule-1 deviation; plan action mandated Skeleton removal).
- **6 P198-04 ApprovalCard HITL renderers UNTOUCHED** — INV-199-07 W-02 lock preserved (git diff on `wrap-tool-with-approval.ts` + `approval-manager.ts` empty).
- **Zero new top-level npm deps** — `lucide-react` already direct dep of `@livos/ui`.

## Task Commits

1. **Task 1: RunningHeader micro-primitive + XSS regression-lock** — `6c45ca37` (feat)
   - New `running-header.tsx` (40 LOC) + `running-header.test.tsx` (5 vitest PASS)
2. **Task 2: assert RunningHeader + incomplete-status branches on Weather/LuseListWindows/ImageSearch (RED)** — `482dab11` (test)
   - 6 new vitest cases under `describe 'Phase 199-06: status branches'`
   - 5 fail (A B C E F) + 1 pass (D — INV-199-05 complete-branch regression-lock)
3. **Task 3: RunningHeader + incomplete-status branches across 10 P198-03 generative renderers (GREEN)** — `4d341bd1` (feat)
   - All 10 P198-03 renderers updated; IncompleteChip helper added; 2 pre-existing tests updated to match new chrome
   - 45/45 tool-renderers PASS + full liv-ai+tool-ui suite 106/106 PASS

**Plan metadata commit:** [to follow after SUMMARY commit]

## Files Created/Modified

### Created

- **`livos/packages/ui/src/components/tool-ui/running-header.tsx`** (40 LOC) — `<RunningHeader>` micro-primitive with `label` (string) + optional `icon` (ReactNode) props. Default icon is `<Loader2 className='size-4 animate-spin' />` from lucide-react. Wrapped in `flex items-center gap-2 rounded-lg border bg-card p-3 text-sm`.
- **`livos/packages/ui/src/components/tool-ui/running-header.test.tsx`** (95 LOC, 5 vitest PASS) — default render + custom icon + T-199-06 XSS regression-lock + Loader2 utility-class assertion.

### Modified

- **`livos/packages/ui/src/features/liv-ai/tool-renderers.tsx`** (+103 / -25 LOC):
  - New import: `RunningHeader` from `@/components/tool-ui/running-header`
  - New helper: `<IncompleteChip reason errorText />` — centralises the red error chip / muted Cancelled chip JSX
  - **WebSearchToolUI** — running: `Searching: "${query}"`; incomplete: `Search failed`
  - **PlacesSearchToolUI** — running: `Finding places in ${city}`; incomplete: `Places lookup failed`
  - **ImageSearchToolUI** — running: `Searching images: "${query}"`; incomplete: `Image search failed`
  - **WeatherToolUI** — running: `Checking weather in ${location}…`; incomplete: `Weather lookup failed`
  - **MapToolUI** — running: `Loading map of ${query}…`; incomplete: `Map load failed`
  - **DataQueryToolUI** — running: `Querying data…`; incomplete: `Data query failed`
  - **ChartToolUI** — running: `Compiling chart…`; incomplete: `Chart build failed`
  - **LinkPreviewToolUI** — running: `Loading preview: ${url}`; incomplete: `Link preview failed`
  - **LuseScreenshotToolUI** — running: `Taking screenshot…`; incomplete: `Screenshot failed`
  - **LuseListWindowsToolUI** — running: `Listing windows…`; incomplete: `Window list failed`
  - **6 ApprovalCardToolUI factories at L293-340 UNTOUCHED** (W-02 lock)

- **`livos/packages/ui/src/features/liv-ai/tool-renderers.test.tsx`** (+119 / -7 LOC):
  - New describe block `'Phase 199-06: status branches (RunningHeader + incomplete chips)'` with 6 cases (A-F)
  - WebSearchToolUI running-state test updated to assert `Searching: "llamas"` text content instead of `/h-32|skeleton/i` regex
  - PlacesSearchToolUI running-state test updated to assert `Finding places in Istanbul` text content instead of `.querySelectorAll('.h-40').length === 4`

## RunningHeader file contents (Task 1)

```tsx
import {Loader2} from 'lucide-react'
import type {ReactNode} from 'react'

export interface RunningHeaderProps {
	label: string
	icon?: ReactNode
}

export function RunningHeader({icon, label}: RunningHeaderProps) {
	return (
		<div className='flex items-center gap-2 rounded-lg border bg-card p-3 text-sm'>
			{icon ?? <Loader2 className='size-4 animate-spin' />}
			<span className='text-muted-foreground'>{label}</span>
		</div>
	)
}
```

## Renderer count

- **Renderers updated: 10** (exactly the P198-03 generative set). Verified via `grep -c "RunningHeader" tool-renderers.tsx = 18` (1 import + at least 1 reference per renderer, including the `Loading…` fallback in WeatherToolUI / MapToolUI / etc.).
- **Renderers untouched: 6** (P198-04 HITL ApprovalCard set — `makeApprovalToolUI` factory L293-320 byte-stable; W-02 lock preserved).

## Test totals

| Suite | Cases | PASS | FAIL | SKIP |
|-------|-------|------|------|------|
| running-header.test.tsx (NEW) | 5 | 5 | 0 | 0 |
| tool-renderers.test.tsx (extended) | 45 | 45 | 0 | 0 |
| **Full liv-ai + tool-ui suite** | **106** | **106** | **0** | **0** |

**INV-199-05 verification** — Pre vs Post PASSING case count for tool-renderers.test.tsx:
- **Pre (Plan 199-05 baseline):** 39/39 PASS
- **Post (this plan):** 45/45 PASS (39 pre-existing + 6 new Phase 199-06 cases — 2 of the 39 pre-existing had their running-state assertion text rewired to match the new chrome but still PASS)
- **Non-decreasing:** ✅ (45 ≥ 39)
- **Complete-state branches:** UNCHANGED — Test D (WeatherToolUI complete → WeatherWidget) + all other complete-state assertions across the 10 renderers all PASS.

**INV-199-07 verification** — W-02 lock:
```
$ git diff HEAD~3 HEAD -- livos/packages/livinityd/source/modules/mastra/wrap-tool-with-approval.ts
$ git diff HEAD~3 HEAD -- livos/packages/livinityd/source/modules/mastra/approval-manager.ts
(empty diff — both files byte-stable)
```

## Sacred SHA verification

- Sacred file: `liv/packages/core/src/sdk-agent-runner.ts`
- Expected: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- Actual (post-Plan-199-06): `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✅
- Pre-commit hook fired on all 3 task commits — `[sacred-sha] PASS: 20 files verified` × 3.

## Build verification

```
cd livos && pnpm --filter ui build
✓ built in 46.89s
```

- `dist/assets/liv-ai-content-17081bdf.js`: 564.66 kB / 158.15 kB gzip (was 562.82 kB / 157.79 kB gzip post-199-05 → **+1.84 kB / +0.36 kB gzip** for RunningHeader + IncompleteChip + per-renderer status branches; modest and expected).

## Decisions Made

1. **Added `IncompleteChip` helper** — not in the plan, but added during Task 3 GREEN to centralise the red error chip / muted Cancelled chip JSX. Otherwise the same `<div className='rounded-lg border border-red-200 ...'>` boilerplate would duplicate 10× across renderers, which would be a maintenance liability and a Rule 1 candidate. The helper has zero behavioural impact — same DOM output as the inline JSX the plan specified.

2. **`WeatherToolUI` fallback path keeps a `<RunningHeader label='Loading…' />`** for the residual `status.type !== 'complete' || !result` arm (preserving the plan's pseudo-code example in `<context>`). Same approach in MapToolUI, ChartToolUI, LinkPreviewToolUI, LuseScreenshotToolUI, DataQueryToolUI, LuseListWindowsToolUI where the original `<Skeleton>` placeholder lived in this residual branch.

3. **Optional Task 3 step 7 visual-polish pass SKIPPED** — the plan explicitly marked it skippable ("If pressed for time or risk, SKIP this polish — the must_haves don't require it"). Avoided changing the 12 existing tool-ui primitives outside the renderer wiring to keep the diff focused and reviewable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing P198 running-state tests asserted the now-replaced Skeleton DOM shape**
- **Found during:** Task 3 GREEN (after rewiring renderers, running the test suite surfaced 2 pre-existing failures)
- **Issue:** `WebSearchToolUI`'s `'renders Skeleton when status=running'` test asserted `container.innerHTML.toMatch(/h-32|skeleton/i)` and `PlacesSearchToolUI`'s `'renders skeleton grid on running'` test asserted `container.querySelectorAll('.h-40').length === 4`. The plan's Task 3 action step 2e explicitly mandates "Delete any prior `<Skeleton className='h-XX' />` placeholders that the running branch replaced", which inherently invalidates those DOM-shape assertions.
- **Conflict:** The plan's must_haves text "INV-199-05 holds — every existing tool-renderers.test.tsx case STILL PASSES" cannot coexist with "Delete any prior <Skeleton...>" without rewiring the conflicting test assertions. The reasonable interpretation: INV-199-05 protects the **complete-state** branches (the plan's must_haves bullet states this explicitly — "complete state branches UNCHANGED"). The running-state assertions are part of the surface the plan deliberately migrates.
- **Fix:** Rewired the 2 conflicting running-state assertions to match the new chrome (`expect(container.textContent).toContain('Searching: "llamas"')` + `expect(container.textContent).toContain('Finding places in Istanbul')`) instead of asserting the old Skeleton DOM. Updated test names to mark them as "Plan 199-06 polish — was h-32 Skeleton in P198" for searchability.
- **Files modified:** `livos/packages/ui/src/features/liv-ai/tool-renderers.test.tsx`
- **Verification:** All 45 cases PASS post-fix. The complete-state assertions across all 10 renderers untouched.
- **Committed in:** `4d341bd1` (Task 3 GREEN commit)

**2. [Rule 2 - Missing Critical] `IncompleteChip` helper added for DRY across 10 renderers**
- **Found during:** Task 3 GREEN (while writing the 4th renderer's incomplete branch)
- **Issue:** The plan's per-renderer pattern (D-199-23) inlines the full chip JSX — `<div className='rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'>{errorText}</div>` plus the cancelled-branch sibling. Duplicating this across 10 renderers would be 10× boilerplate, brittle (drift opportunity), and a maintenance liability.
- **Fix:** Added a small `<IncompleteChip reason errorText />` helper next to the existing `<Skeleton>` helper in the same file. Same DOM output; zero behavioural change.
- **Files modified:** `livos/packages/ui/src/features/liv-ai/tool-renderers.tsx`
- **Verification:** All Phase 199-06 RED cases (E + F) PASS — same DOM output as inline JSX would have produced.
- **Committed in:** `4d341bd1` (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 Rule-1 pre-existing-test conflict from plan internal contradiction, 1 Rule-2 DRY helper).
**Impact on plan:** Both deviations preserve the plan's intent verbatim (DOM output identical to what the plan's literal pseudo-code would have generated; running-branch test assertions updated to match the running branch the plan mandated). No scope creep. No HITL/W-02 surface touched.

## Issues Encountered

- The plan's `must_haves.truths` claim "every existing tool-renderers.test.tsx case STILL PASSES" conflicts with the `<tasks>` action step "Delete any prior `<Skeleton className='h-XX' />` placeholders that the running branch replaced" — see Deviation 1. The two pre-existing tests that asserted Skeleton DOM shape can't both stay green AND have the running branch rewired to RunningHeader. Resolved by treating "complete-state branches UNCHANGED" (a more specific must_haves bullet) as the binding invariant and updating the 2 running-state test assertions to match the new chrome.

## User Setup Required

None — pure UI-only changes; no env vars / external services / deploy steps. Plan 199-08 will deploy the cumulative Wave 3 outputs to the Mini PC and operator UAT will verify the running-state polish during steps 8 + 9 + 10 of the UAT walk.

## Next Phase Readiness

- **Plan 199-07** (header bar + Redis persistence wiring) is the next plan in Wave 3. **Parallel-safe** with Plan 199-06 in principle, but depends on Plan 199-05's `assistant.tsx` rebuild for the header-bar mount site. Plan 199-06 is file-disjoint from both 199-05 and 199-07 (this plan touched only `components/tool-ui/running-header.*` + `features/liv-ai/tool-renderers.*`).
- All 6 P198-04 HITL ApprovalCard renderers preserve their existing approve/reject flow (W-02 lock) — Plan 199-07's header bar can mount without re-touching the HITL surface.
- The `liv-ai-content` chunk grew by ~+1.84 kB / +0.36 kB gzip — within budget; no chunk-split work needed.

## Self-Check: PASSED

### Files verified

- `livos/packages/ui/src/components/tool-ui/running-header.tsx` — FOUND
- `livos/packages/ui/src/components/tool-ui/running-header.test.tsx` — FOUND
- `livos/packages/ui/src/features/liv-ai/tool-renderers.tsx` — FOUND (modified)
- `livos/packages/ui/src/features/liv-ai/tool-renderers.test.tsx` — FOUND (modified)

### Commits verified

- `6c45ca37` (Task 1: RunningHeader feat) — FOUND in `git log`
- `482dab11` (Task 2: RED test) — FOUND in `git log`
- `4d341bd1` (Task 3: GREEN feat) — FOUND in `git log`

### Sacred SHA verified

- `liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✅ (pre-commit hook PASS × 3 + post-plan git hash-object match)

---
*Phase: 199-liv-ai-ui-polish*
*Plan: 06*
*Completed: 2026-05-23*
