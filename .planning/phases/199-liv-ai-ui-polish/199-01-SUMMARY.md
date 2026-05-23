---
phase: 199
plan: 01
subsystem: ui-window-manager
tags: [window-manager, brand-verification, regression-lock, foundation, tdd]
requires: []
provides:
  - "DEFAULT_WINDOW_SIZES['LIVINITY_liv-ai'] = {width: 1180, height: 820}"
  - "DEFAULT_WINDOW_SIZES promoted from const → export const (runtime importable)"
  - "Brand-string regression-lock vitest assertions (INV-199-02)"
affects:
  - "livos/packages/ui/src/providers/window-manager.tsx"
  - "livos/packages/ui/src/providers/window-manager.test.tsx"
  - "livos/packages/ui/src/features/liv-ai/empty-state.test.tsx"
tech-stack:
  added: []
  patterns:
    - "TDD RED → GREEN gate sequence (Tasks 1+2)"
    - "Runtime-symbol import for vitest assertion (replaces source-text-only readFileSync pattern)"
    - "Brand regression-lock via direct DOM querySelector + systemApps registry find()"
key-files:
  created: []
  modified:
    - "livos/packages/ui/src/providers/window-manager.tsx (+8 / -2 — promote to export const, add LIVINITY_liv-ai entry)"
    - "livos/packages/ui/src/providers/window-manager.test.tsx (+44 — 3 new Phase 199-01 vitest cases)"
    - "livos/packages/ui/src/features/liv-ai/empty-state.test.tsx (+44 — 3 new brand-lock vitest cases)"
decisions:
  - "D-199-01 honored: Liv AI window size = {1180, 820} (locked from RESEARCH E2)"
  - "D-199-02 honored: 'Liv AI' literal locked across 3 surfaces (dock label, hero h2, empty-state testid)"
  - "Promoted DEFAULT_WINDOW_SIZES to export const — runtime symbol import enables behavioral assertion alongside the existing readFileSync source-text checks"
  - "Sacred SHA f3538e1d… preserved 3/3 commits (pre-commit hook PASS each commit)"
metrics:
  duration: "~12 minutes"
  task_count: 3
  file_count: 3
  loc_added: 96
  loc_removed: 2
  tests_added: 6
  tests_passing: "11/11 window-manager + 6/6 empty-state"
  completed: "2026-05-23"
---

# Phase 199 Plan 01: Liv AI Window Size + Brand Regression-Lock Summary

Promote `DEFAULT_WINDOW_SIZES` to `export const` and add `'LIVINITY_liv-ai': {1180, 820}`, then lock the literal 'Liv AI' brand string at three surfaces via TDD-shaped vitest cases. Closes operator's first two asks from the 2026-05-22 directive (bigger Liv AI window + name = "Liv AI" everywhere) and unblocks Wave 2's confidence that the empty-state visuals at the larger window size look right.

## Commit Trail

| # | Commit | Type | Subject |
|---|--------|------|---------|
| 1 | `bf54d4d8` | test | `test(199-01): assert DEFAULT_WINDOW_SIZES['LIVINITY_liv-ai'] === {1180, 820} (RED)` |
| 2 | `05079b7e` | feat | `feat(199-01): add LIVINITY_liv-ai default window size {1180, 820} (GREEN)` |
| 3 | `6fc640e6` | test | `test(199-01): brand-string regression-lock for 'Liv AI' literal (INV-199-02)` |

All 3 commits passed the sacred-sha pre-commit hook: `[sacred-sha] PASS: 20 files verified`.

## Inserted Code (window-manager.tsx)

```ts
'LIVINITY_terminal': {width: 900, height: 600},
'LIVINITY_liv-ai': {width: 1180, height: 820},
default: {width: 900, height: 600},
```

Located at `livos/packages/ui/src/providers/window-manager.tsx:135` (single new entry between `LIVINITY_terminal` and `default`, preserving existing trailing-comma + tab-indent style).

The `const DEFAULT_WINDOW_SIZES` declaration was promoted to `export const DEFAULT_WINDOW_SIZES` so the Phase 199-01 vitest can import the runtime value (Task 1 RED required this — the existing source-text readFileSync tests do not need it but the new behavioural assertions do).

## Test Output

### `vitest run src/providers/window-manager.test.tsx`

```
✓ src/providers/window-manager.test.tsx  (11 tests)  4ms

Test Files  1 passed (1)
     Tests  11 passed (11)
```

11/11 PASS:
- 8 pre-existing source-text tests (Phase 159 close-handler registry contract) — STILL PASS, no regression.
- 3 new Phase 199-01 tests:
  1. `DEFAULT_WINDOW_SIZES["LIVINITY_liv-ai"]` equals `{width: 1180, height: 820}` exactly.
  2. `DEFAULT_WINDOW_SIZES["LIVINITY_liv-ai"]` NOT equal to `DEFAULT_WINDOW_SIZES.default` (regression-lock the Phase 198 900x600 fallback bug).
  3. All 10 pre-existing keys (`LIVINITY_app-store`..`LIVINITY_terminal` + `default`) still defined (regression-lock against accidental deletes).

### `vitest run src/features/liv-ai/empty-state.test.tsx`

```
✓ src/features/liv-ai/empty-state.test.tsx  (6 tests)  31ms

Test Files  1 passed (1)
     Tests  6 passed (6)
```

6/6 PASS:
- 3 pre-existing Phase 198-07 tests (logo alt, tagline substrings, chip onPick callback) — STILL PASS.
- 3 new Phase 199-01 brand regression-lock tests:
  1. EmptyState hero `<h2>` textContent is exactly `'Liv AI'`.
  2. Outermost div carries `data-testid='liv-ai-empty-state'` (forward-lock for Plan 199-05 which will rebuild this surface — the testid MUST be preserved on the new outer div).
  3. `systemApps` registry entry `id='LIVINITY_liv-ai'` has `name === 'Liv AI'` (dock label string contract).

## Verification Gate Results

| Gate | Command | Result |
|------|---------|--------|
| Window-manager vitest | `pnpm --filter ui exec vitest run src/providers/window-manager.test.tsx` | ✅ 11/11 PASS |
| Empty-state vitest | `pnpm --filter ui exec vitest run src/features/liv-ai/empty-state.test.tsx` | ✅ 6/6 PASS |
| UI build | `pnpm --filter ui build` | ✅ EXIT 0 in 45.56s (liv-ai-content chunk 563.34 kB / 157.96 kB gzip — IDENTICAL to Phase 198 baseline; no chunk size regression) |
| No new deps | `git diff HEAD~3 HEAD -- livos/packages/{ui,livinityd}/package.json` | ✅ EMPTY (INV-199-04 holds) |
| B-02 lock | `git diff HEAD~3 HEAD -- livos/packages/livinityd/source/modules/mastra/index.ts` | ✅ EMPTY (INV-199-06 holds) |
| LIVINITY_liv-ai grep | `grep -n "'LIVINITY_liv-ai'" livos/packages/ui/src/providers/window-manager.tsx` | ✅ Line 135 |
| Sacred SHA (git-blob) | `git show HEAD:liv/packages/core/src/sdk-agent-runner.ts \| git hash-object --stdin` | ✅ `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (INV-199-01 PRESERVED across 3 commits) |
| Phase 199-01 commits | `git log --oneline -3` | ✅ 3 commits, all tagged `199-01` in subject |

## Success Criteria — All PASS

1. ✅ `DEFAULT_WINDOW_SIZES['LIVINITY_liv-ai']` evaluates to `{width: 1180, height: 820}` at runtime.
2. ✅ All 3 new Phase 199-01 vitest cases in `window-manager.test.tsx` PASS.
3. ✅ All 3 new Phase 199-01 brand-regression cases in `empty-state.test.tsx` PASS.
4. ✅ All pre-existing window-manager (8) + empty-state (3) tests still PASS — zero regression.
5. ✅ `livos/packages/ui/package.json` + `livos/packages/livinityd/package.json` zero new deps (INV-199-04).
6. ✅ Sacred SHA pre-commit hook PASS on each of the 3 commits (INV-199-01).
7. ✅ `livos/packages/livinityd/source/modules/mastra/index.ts` untouched (INV-199-06).

## DEFAULT_WINDOW_SIZES.default Resolution Confirmation

Before Plan 199-01, `getResponsiveSize('LIVINITY_liv-ai', vw, vh)` resolved to `DEFAULT_WINDOW_SIZES.default = {900, 600}` (fallback path — Liv AI key absent from the map). After Plan 199-01, the same call resolves to `{1180, 820}` clamped to viewport·0.85 on small screens. The `default` entry remains unchanged at `{900, 600}` for any future app that doesn't override.

This is verified explicitly by Test 2 of the new vitest block: `expect(DEFAULT_WINDOW_SIZES['LIVINITY_liv-ai']).not.toEqual(DEFAULT_WINDOW_SIZES.default)` — a CI-enforced regression-lock that prevents any future merge from accidentally removing the entry and reverting to the 900x600 fallback.

## Deviations from Plan

### Documentation deviations (process)

**1. Plan referenced `pnpm --filter ui test -- <pattern>`; actual script name is `test:run`**
- **Found during:** Task 1 verification
- **Issue:** `livos/packages/ui/package.json` exposes `test:run` but no `test` alias; `pnpm --filter ui test` returns `Command "test" not found`.
- **Fix:** Used `pnpm --filter ui exec vitest run <file>` directly to target the single test file (cleanest filter — running just the file under test, no upstream-suite noise).
- **Impact:** Cosmetic — same vitest engine, same assertions. Future plans should consider aliasing `test` → `test:run` in package.json, but that is out-of-scope for 199-01.
- **Type:** Rule 3 (blocking-issue workaround documentation).

### Out-of-scope discoveries (NOT fixed — deferred)

**1. `pnpm --filter ui typecheck` fails on pre-existing errors in `stories/src/routes/stories/{widgets,wifi}.tsx`**
- **Discovered during:** Verification step 3 (typecheck gate).
- **Pre-existing:** Verified via `git stash + typecheck on prior commit` — same errors reproduce on Phase 198 deploy SHA `8c22fe10`, so 100% pre-existing and unrelated to Plan 199-01.
- **Errors:** `TS2307 Cannot find module '@/utils/wifi'` + `TS7031 implicit any` in stories/wifi.tsx + widgets.tsx implicit-any.
- **Scope:** Plan 199-01 modified zero files under `stories/`; per SCOPE BOUNDARY rule, this is not a Plan 199-01 task.
- **Action:** No fix. Documented for future tracking. The plan-level acceptance gate `pnpm --filter ui build` (which is the only one that ships to production) PASSES.

### Auto-fixed issues

None — plan executed exactly as written.

### Authentication gates

None — fully local execution, no third-party auth required.

## Threat Model Outcome

Both threats from the plan's `<threat_model>` block held:

- **T-199-01-01** (T — Tampering, DEFAULT_WINDOW_SIZES map order): Accepted. Object literal key lookup is order-independent; Test 3 explicitly asserts all 10 pre-existing keys still defined regardless of position.
- **T-199-01-02** (I — Information disclosure, brand string visibility): Mitigated. The brand-regression-lock vitest in `empty-state.test.tsx` asserts the literal `'Liv AI'` string at the hero `<h2>` AND the dock-label `systemApps[id='LIVINITY_liv-ai'].name`. Any future rename regression breaks CI.

## Forward-Link

**Plan 199-02 (Wave 1 partner)** — provider-router `ALLOWED_XAI_MODELS` allow-list + `coerceModel()` helper + new `mastra.agent.listAvailableModels` protectedProcedure + `httpOnlyPaths` add. File-disjoint from 199-01 (backend-only); runs parallel-safe.

After 199-02 lands, Wave 2 unlocks (199-03 + 199-04 parallel-safe) and the chain progresses to Wave 3 UX polish (199-05 + 199-06 + 199-07 sequential within the wave due to assistant.tsx shared-file overlap).

## Self-Check: PASSED

- ✅ `livos/packages/ui/src/providers/window-manager.tsx` exists and contains the new `'LIVINITY_liv-ai': {width: 1180, height: 820}` entry at line 135.
- ✅ `livos/packages/ui/src/providers/window-manager.test.tsx` exists and contains 3 new Phase 199-01 vitest cases (`describe('DEFAULT_WINDOW_SIZES Phase 199-01', ...)`).
- ✅ `livos/packages/ui/src/features/liv-ai/empty-state.test.tsx` exists and contains 3 new brand-regression vitest cases (`describe('EmptyState — Phase 199-01 brand regression-lock', ...)`).
- ✅ Commit `bf54d4d8` exists in `git log --oneline`.
- ✅ Commit `05079b7e` exists in `git log --oneline`.
- ✅ Commit `6fc640e6` exists in `git log --oneline`.
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` byte-identical pre/post (verified via `git hash-object --stdin`).
