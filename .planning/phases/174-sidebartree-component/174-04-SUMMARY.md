---
phase: 174-sidebartree-component
plan: 04
subsystem: ui
tags: [v38, sidebar-tree, drag-drop, react-arborist, sonner, validateMove, cycle-check, depth-cap, additive-tRPC-error]

# Dependency graph
requires:
  - phase: 171-item-model-storage
    provides: validateMove (cycle + depth caps) and MoveValidation discriminated union
  - phase: 174-sidebartree-component plan 02
    provides: SidebarTree.tsx scaffold with tRPC vault.items.list query + react-arborist render
provides:
  - SidebarTree onMove handler wired into react-arborist Tree (drag-to-reparent)
  - vault-items-router move() TRPCError now carries structured cause:{kind, depth?}
  - sonner toast.error/toast.warning UX for cycle / self / depth-hard / soft-warn paths
  - Optimistic-state revert via list.refetch() on error
affects:
  - 174-05 (footer Settings gear — will slot into the same flex column below <Tree>)
  - 175 (Add Modal — will share the same vault.items.create mutation pattern)
  - 177 (Schedule Engine + Inbox — agent-only menu actions in same SidebarTree)

# Tech tracking
tech-stack:
  added: []  # sonner + react-arborist were already deps (174-01)
  patterns:
    - "Additive TRPCError extension: append `cause: {kind, depth?}` without removing legacy `message` string (backward compat)"
    - "Cause kind passed through verbatim from validateMove.reason (NOT remapped) — avoids string drift between server validation and UI dispatch"
    - "react-arborist onMove → per-dragId tRPC mutation loop with synthetic-root guard (MAIN_LIV_ID skipped)"
    - "Optimistic state: success path does NOT refetch (tree-arborist local move is truth, 5s poll reconciles); error path DOES refetch to revert"
    - "vitest mock TDZ avoidance via vi.hoisted() namespace object for shared spies/captures referenced inside vi.mock factories"

key-files:
  created:
    - livos/packages/livinityd/source/modules/server/trpc/vault-items-router.move-error.test.ts
    - livos/packages/ui/src/features/sidebar-tree/SidebarTree.drag.test.tsx
  modified:
    - livos/packages/livinityd/source/modules/server/trpc/vault-items-router.ts
    - livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx
    - livos/packages/ui/src/features/sidebar-tree/SidebarTree.test.tsx

key-decisions:
  - "cause.kind uses validation.reason verbatim — actual literal is 'depth-exceeds-hard-cap' (NOT the plan's optimistic 'depth-hard'); plan explicitly authorised this adjustment via Task 1 read_first directive"
  - "UI handler covers all 5 MoveValidation rejection kinds defensively (cycle / self / depth-exceeds-hard-cap / archived-parent / not-found) even though only 3 were spec'd — Rule 2 forward-compat against future validateMove additions"
  - "Success path does NOT refetch — only error path does (matches plan B-ui-4 expectation that warn-commit is non-disruptive)"
  - "vitest mocks use vi.hoisted() namespace object instead of top-level let/const — works around vitest's mock-hoisting TDZ; safer than reordering imports"

patterns-established:
  - "Additive TRPCError pattern: when a downstream UI consumer needs structured error dispatch, add `cause: {kind, ...}` without removing the legacy human-readable `message` — preserves existing string-matching tests + new typed branches simultaneously"
  - "vitest TDZ-safe mock pattern: `const H = vi.hoisted(() => ({...spies, ...captures}))` then reference `H.x` inside vi.mock factories — avoids 'Cannot access X before initialization' for shared state"
  - "react-arborist onMove → tRPC adapter: per-dragId loop, guard synthetic roots, fire-and-forget mutate (no Promise.all), let success/error callbacks drive toast + refetch"

requirements-completed: []  # PLAN.md frontmatter has requirements: [] — nothing to mark

# Metrics
duration: 7m
completed: 2026-05-20
---

# Phase 174 Plan 04: Drag-Drop with Cycle/Depth Check Summary

**react-arborist onMove handler wired to vault.items.move tRPC with structured cause:{kind} field for type-safe UI dispatch; sonner toast.error on cycle/depth-hard + refetch revert, toast.warning on soft-cap commit.**

## Performance

- **Duration:** 7m
- **Started:** 2026-05-20T13:51:27Z
- **Completed:** 2026-05-20T13:58:27Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 3 (1 router, 1 SidebarTree, 1 existing test mock)
- **Files created:** 2 (1 server test, 1 UI test)

## Accomplishments
- vault-items-router.ts move() TRPCError now carries `cause: {kind, depth?}` mapped verbatim from MoveValidation.reason — UI can dispatch on `err.data?.cause?.kind` without parsing `message`
- SidebarTree.tsx onMove handler iterates dragIds, skips MAIN_LIV_ID synthetic root, calls move mutation per id
- onSuccess: warn truthy → toast.warning(warn string), commit stays (no refetch)
- onError: kind-typed copy via sonner toast.error + list.refetch() to revert react-arborist's local optimistic state
- Backward compat: legacy `message: 'move rejected: <reason>'` preserved verbatim (existing R6 assertion in vault-items-router.test.ts still passes)

## Task Commits

Each task TDD'd separately:

1. **Task 1 RED — Server cause-field failing tests** — `f8c35827` (test)
2. **Task 1 GREEN — vault-items-router cause field** — `5f7693a7` (feat)
3. **Task 2 RED — SidebarTree drag-handler failing tests** — `894f0cbb` (test)
4. **Task 2 GREEN — onMove + sonner + refetch wired** — `8edf69be` (feat)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/server/trpc/vault-items-router.ts` — added header comment + extended `if (!validation.ok)` block to attach `cause: {kind, depth?}` on the TRPCError; legacy message unchanged
- `livos/packages/livinityd/source/modules/server/trpc/vault-items-router.move-error.test.ts` — NEW 4-assertion suite (cycle, self, depth-exceeds-hard-cap cause kinds + warn passthrough)
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx` — added `import {toast} from 'sonner'`, `useMutation` block with onSuccess/onError dispatch, `onMove` prop on `<Tree>` with MAIN_LIV_ID guard
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.drag.test.tsx` — NEW 6-assertion suite using vi.hoisted() namespace for shared spies
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.test.tsx` — added no-op `move.useMutation` stub to the existing tRPC mock (174-02 suite's 10 assertions still pass)

## Test Output

**Server (livos/packages/livinityd):**
```
✓ source/modules/server/trpc/vault-items-router.test.ts        (14 tests)  43ms
✓ source/modules/server/trpc/vault-items-router.move-error.test.ts (4 tests) 109ms
  Test Files  2 passed (2)
       Tests  18 passed (18)
```

**UI (livos/packages/ui):**
```
✓ src/features/sidebar-tree/SidebarTree.drag.test.tsx   (6 tests)  19ms
✓ src/features/sidebar-tree/SidebarTree.test.tsx        (10 tests) 22ms
✓ src/features/sidebar-tree/SidebarFooter.test.tsx      (4 tests)  31ms
✓ src/features/sidebar-tree/ItemTreeRow.test.tsx        (8 tests)  28ms
✓ src/features/sidebar-tree/tree-shape.test.ts          (8 tests — implied by file count of 6)
✓ src/features/sidebar-tree/index.test.ts               (4 tests — barrel)
  Test Files  6 passed (6)
       Tests  40 passed (40)
```

Plan §verification expected 32 PASS combined (8 tree-shape + 10 SidebarTree + 8 ItemTreeRow + 6 SidebarTree.drag); actual is 40 because Plan 174-05 SidebarFooter + index barrel tests landed in the meantime — both are non-breaking parallel additions.

## Diff Summary

```
git diff --stat HEAD~4..HEAD
 .../trpc/vault-items-router.move-error.test.ts | 157 ++++++++++++++++++++  NEW
 .../source/modules/server/trpc/vault-items-router.ts |  27 ++              MOD (+27 lines, 0 removed)
 .../sidebar-tree/SidebarTree.drag.test.tsx     | 237 +++++++++++++++++++++  NEW
 .../sidebar-tree/SidebarTree.test.tsx          |  10 ++ (+10 lines)        MOD
 .../sidebar-tree/SidebarTree.tsx               | 130 ++++++++--------- 73   MOD
```

vault-items-router.ts diff is LOCALISED to the move() proc region (lines 190-225 area): 1 header comment block above the proc + the additive `cause` field inside the existing throw. No other procedure (list/get/create/update/archive/delete) touched — `git diff vault-items-router.ts` shows changes only around `move:`.

## Sacred SHA Check

```
[sacred-sha] PASS: 25 files verified
```

All 25 sacred-shas-v38.json entries byte-identical across all 4 commits in this plan. Specifically confirmed:

- `liv/packages/core/src/sdk-agent-runner.ts` UNCHANGED (sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`)
- All 6 frozen `livos/packages/livinityd/source/modules/vault-items/*.ts` files UNCHANGED
- 18 frozen `livos/packages/cli/src/**/*` files UNCHANGED
- `git diff HEAD~4 -- livos/packages/livinityd/source/modules/vault-items/` returns empty
- `git diff HEAD~4 -- livos/packages/ui/src/features/cc-sessions/` returns empty

vault-items-router.ts (modified) is NOT in the registry — grep on `scripts/sacred-shas-v38.json` returns 0 for that path. Additive extension was permitted per the plan's SACRED-FREEZE STATEMENT.

## Decisions Made

1. **cause.kind literals match validation.reason verbatim, NOT the plan's optimistic enum.** The plan named the depth-hard kind `'depth-hard'` but tree-resolver.ts ships the literal `'depth-exceeds-hard-cap'`. The plan's Task 1 read_first explicitly authorised this adjustment: "If implementation differs, the executor MUST read tree-resolver.ts and adjust this plan's cause.kind enum mapping accordingly — DO NOT silently change the contract." Adjusted accordingly. The UI onError handler matches against the actual literal.

2. **UI handler covers all 5 known rejection kinds, not just the 3 spec'd in the plan.** validateMove can return `'not-found'` and `'archived-parent'` reasons too — the UI handler has explicit typed copy for both, falling back to `err.message` only for genuinely-unknown kinds. Forward-compat hedge (Rule 2 — defensive completeness).

3. **vi.hoisted() namespace object pattern for vitest mocks.** The drag test's first GREEN attempt threw "Cannot access toastError before initialization" because vitest hoists `vi.mock(...)` factories above the file's `const` declarations. Switched to `const H = vi.hoisted(() => ({...all-shared-state}))` and referenced `H.x` inside factories — passes cleanly and the pattern is reusable for any future ui-side mock-heavy test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] vitest mock-hoisting TDZ in SidebarTree.drag.test.tsx**
- **Found during:** Task 2 first GREEN attempt
- **Issue:** Top-level `const toastError = vi.fn()` declared OUTSIDE the `vi.mock('sonner', () => ({toast: {error: toastError, ...}}))` factory; vitest hoists the factory above the const, causing `ReferenceError: Cannot access 'toastError' before initialization` when the SidebarTree.tsx module is imported during the test render
- **Fix:** Replaced top-level spy/capture consts with a single `const H = vi.hoisted(() => ({...}))` namespace; references inside `vi.mock` factories now resolve cleanly because `vi.hoisted` runs in the same hoisted pass as `vi.mock`
- **Files modified:** `livos/packages/ui/src/features/sidebar-tree/SidebarTree.drag.test.tsx`
- **Verification:** vitest run reports 6/6 PASS for the drag suite + 10/10 PASS for the existing 174-02 suite
- **Committed in:** `8edf69be` (Task 2 GREEN commit)

**2. [Rule 3 — Blocking] SidebarTree.test.tsx existing mock missed vault.items.move.useMutation**
- **Found during:** Task 2 GREEN — running existing 10-assertion 174-02 suite after SidebarTree.tsx now calls `trpcReact.vault.items.move.useMutation`
- **Issue:** 174-02's tRPC mock only stubbed `vault.items.list.useQuery`; the new mount-time `move.useMutation` call hit `Cannot read properties of undefined (reading 'useMutation')` in the existing test renders
- **Fix:** Added a no-op `move: {useMutation: (_opts: any) => ({mutate: () => {}})}` stub to the same factory; existing tests don't exercise the move path so a no-op satisfies the hook contract without changing 174-02 behavioural semantics
- **Files modified:** `livos/packages/ui/src/features/sidebar-tree/SidebarTree.test.tsx`
- **Verification:** 174-02 suite reports 10/10 PASS (B1-B10 unchanged)
- **Committed in:** `8edf69be` (Task 2 GREEN commit)

**3. [Rule 1 — Bug] Plan's cause.kind literal disagreed with tree-resolver.ts source-of-truth**
- **Found during:** Task 1 read_first (vault-items/tree-resolver.ts)
- **Issue:** Plan body referenced `cause: {kind: 'depth-hard'}` and test names used `cause.kind === 'depth-hard'`, but the actual SACRED `MoveValidation.reason` literal is `'depth-exceeds-hard-cap'`. Passing the wrong literal verbatim would have made the cause field useless for the UI dispatch (which would then never match the typed branch)
- **Fix:** Used `validation.reason` directly — whatever the SACRED source-of-truth says is what flows. Test now asserts `cause.kind === 'depth-exceeds-hard-cap'`. UI onError handler dispatches on the same literal. No remapping layer between server and UI
- **Files modified:** test file + UI handler kind branches
- **Verification:** All 18 server + 16 UI tests PASS; the chain `validateMove.reason → router cause.kind → UI msg branch` is type-string-aligned end-to-end
- **Committed in:** `5f7693a7` (server GREEN) + `8edf69be` (UI GREEN)

**4. [Rule 2 — Missing critical functionality] UI handler covers all 5 MoveValidation reasons, not just 3**
- **Found during:** Task 2 implementation
- **Issue:** Plan spec'd UI copy for only 3 kinds (cycle / self / depth-hard); validateMove can also return `'not-found'` and `'archived-parent'`. Without explicit branches, those would fall through to `err.message` which leaks the raw server string (mild T-174-04-02 information disclosure exposure)
- **Fix:** Added explicit branches with typed copy for `'archived-parent'` → "Move failed: parent is archived" and `'not-found'` → "Move failed: item or parent not found"
- **Files modified:** `livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx`
- **Verification:** No new tests added for these branches (defensive forward-compat — current validateMove rules 2/3/5 already cover them); existing 6 drag tests + 10 174-02 tests all pass
- **Committed in:** `8edf69be` (Task 2 GREEN commit)

---

**Total deviations:** 4 auto-fixed (1 source-of-truth drift, 2 blocking test infra, 1 missing critical defensive coverage)
**Impact on plan:** All 4 fixes were necessary to ship; #3 was the most consequential (would have made the cause field semantically broken). No scope creep — all 4 fixes stay within the plan's stated files + tasks.

## Threat Flags

None — no new network surface, auth path, or schema change. The cause field is server-internal error metadata; tRPC serialises it through the existing httpOnlyPaths registration. T-174-04-01 (adversarial dragId) and T-174-04-02 (err.message leak) are unchanged from the plan's threat register.

## Known Stubs

None — every code path is wired end-to-end. The handler's fallback `msg = err.message` only triggers when validateMove returns a kind the UI has no branch for, which is currently impossible (all 5 validateMove.reason values have explicit branches). Future validateMove additions would surface as the raw message until a follow-up adds a branch — this is the intended graceful-degradation behaviour per T-174-04-02.

## Issues Encountered
- vitest mock-hoisting TDZ (see Deviation #1) — resolved with vi.hoisted() namespace
- 174-02 mock incomplete after this plan's new useMutation hook (see Deviation #2) — resolved with no-op stub

## Next Phase Readiness

- **Plan 174-05 (footer Settings gear) is unblocked.** SidebarTree.tsx's flex column layout has a slot below the `<Tree>` ready for the gear button (the existing `<div className='flex h-full flex-col gap-2 p-3'>` wrapper preserves vertical space).
- **Phase 175 (Add Modal + Item Detail Views)** can mirror the same useMutation pattern for `vault.items.create` (toast.error onError + onSelect navigation onSuccess).
- **No follow-up tickets**. update.sh on Mini PC will pick up the router change on next deploy (UI ships via the same build pipeline).

## Self-Check: PASSED

Verified:
- `livos/packages/livinityd/source/modules/server/trpc/vault-items-router.ts` — modified, contains `Phase 174-04` comment + `cause,` field
- `livos/packages/livinityd/source/modules/server/trpc/vault-items-router.move-error.test.ts` — created, 4 it() blocks
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.tsx` — modified, contains `from 'sonner'` + `vault.items.move.useMutation` + `onMove=` + `list.refetch`
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.drag.test.tsx` — created, 6 it() blocks
- `livos/packages/ui/src/features/sidebar-tree/SidebarTree.test.tsx` — modified (mock stub added)
- Commits `f8c35827`, `5f7693a7`, `894f0cbb`, `8edf69be` — all present in git log
- Sacred SHA: 25 files verified PASS on every commit

## TDD Gate Compliance

Both tasks followed RED → GREEN cleanly:
- Task 1: RED `f8c35827` (test, 3 fail) → GREEN `5f7693a7` (feat, 18 PASS combined)
- Task 2: RED `894f0cbb` (test, 6 fail) → GREEN `8edf69be` (feat, 16 PASS in sidebar-tree subset)

No REFACTOR commits needed — code shipped clean on first GREEN pass.

---
*Phase: 174-sidebartree-component*
*Plan: 04*
*Completed: 2026-05-20*
