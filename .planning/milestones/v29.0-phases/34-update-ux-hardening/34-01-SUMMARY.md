---
phase: 34
plan: "01"
status: complete
duration_min: 5
tasks_completed: 2
key-files:
  created:
    - livos/packages/ui/src/providers/global-system-state/onerror-audit.unit.test.ts
  modified:
    - livos/packages/ui/src/providers/global-system-state/migrate.tsx
commits:
  - "1fecec49: fix(34-01): remove dead useSoftwareUpdate export from migrate.tsx"
  - "bdb547f3: test(34-01): add BACKLOG 999.6 regression test"
---

# Plan 34-01 Summary

## What was built

Phase 34's UX-01/02/03 success criteria were already satisfied by the emergency fix shipped in commit `11634c5a` (Apr 26). This plan closed the one residual gap surfaced by a goal-backward audit:

1. **Removed dead code:** `useSoftwareUpdate` export at `migrate.tsx:57-72` was a duplicate of `update.tsx`'s `useUpdate` hook but lacked `onError` — exactly the BACKLOG 999.6 silent-fail pattern. Verified zero imports across the entire UI tree (`grep -rn "from.*global-system-state/migrate"` only returns `useMigrate` + `MigratingCover` consumers). Removal: -16 lines, no consumer breakage.

2. **Regression-prevention test:** `onerror-audit.unit.test.ts` walks the entire `livos/packages/ui/src/` tree, finds every `trpcReact.system.update.useMutation(` invocation, and asserts an `onError` key appears within 40 lines. Currently passes (zero offenders). Future commits that re-introduce a silent caller will fail this test before merging.

## Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Dead `useSoftwareUpdate` removed | ✅ | `grep -c "useSoftwareUpdate" .../migrate.tsx` = 0; file ends after `MigratingCover` |
| TS compiles | ✅ | 0 new errors in `migrate.tsx` or `global-system-state/` (518 pre-existing, all unrelated) |
| Regression test passes | ✅ | `npx vitest run onerror-audit.unit.test.ts` exits 0 (1/1 tests) |
| All 4 SCs satisfied | ✅ | SC-1 covered by `update.tsx` onError + this regression test; SC-2 satisfied by BarePage architecture; SC-3 satisfied by httpOnlyPaths; SC-4 closed by removing the dead caller |

## Decisions

**Pure code cleanup phase, no plan-checker / executor agents needed.** The audit revealed scope was much smaller than the plan template would have written. Direct inline execution from main context kept ceremony low (no worktree, no agent spawning). Pattern: when a phase's success criteria are mostly already satisfied by prior emergency fixes, default to inline gap-closure rather than full discuss/plan/execute ceremony.

## Cross-phase contract status

- **Phase 33 contract** (toast can link to Past Deploys log row): Out of scope for this phase — Phase 33 already shipped the link target (Past Deploys table). Phase 34's onError messages are generic; future polish could add a "View deploy log" CTA in the toast pointing to the failed row in the Past Deploys table. Not blocking.
- **Phase 32 contract** (PRECHECK-FAIL string round-trips through `system.update`): Already satisfied by `describeUpdateError()` in `update.tsx` which surfaces the raw error message including PRECHECK-FAIL strings.
