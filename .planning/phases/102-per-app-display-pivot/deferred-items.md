# Phase 102 — Deferred Items

Items discovered during plan execution that are OUT OF SCOPE for the current plan
(per SCOPE BOUNDARY rule). To be picked up by subsequent plans or Phase 103+.

## From plan 102-04 (window-manager rewrite)

### luse-mcp-config tests reference removed export

**Files:**
- `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.test.ts:63`
- `livos/packages/livinityd/source/modules/computer-use/luse-mcp-config.window.test.ts` (multiple lines)

**Issue:** Tests reference `LUSE_TARGET_WINDOW_ID_ENV` export which was removed
from `luse-mcp-config.ts` (the source already has `LUSE_TARGET_DISPLAY_ENV`).
The descriptor type `PerWebAppMcpDescriptor` was tightened to `{instanceKey,
display}` only, dropping `windowId` — 6 of the failing test cases pass
`{instanceKey, windowId, display}` literals that no longer satisfy the type.

**Pre-existing:** This is a half-finished Phase 102-06 migration. The source
was migrated in a separate commit (NOT in plan 102-04); the tests need
matching updates. Plan 102-06 owns the proper fix.

**Plan 102-04 mitigation:** `window-manager.ts:registerWebAppMcp` updated to
build descriptors without the `windowId` field (which the type no longer
allows). My change keeps the existing function signature (`wid: number`) for
v33 call-site compat but ignores the arg internally.

**Resolution:** Plan 102-06 (LUSE-DISPLAY-SCOPING).

### Full livinityd suite has 70 pre-existing failing test files

**Source:** 2026-05-11 03:07 full suite run — 70 failed / 96 passed (1110 total tests, 25 failed, 1062 passed, 23 skipped). The 25 failing tests live across 70 test files that timeout or error during setup.

**Pre-existing:** None of the failures originate from plan 102-04 production
files. Mostly database / Redis / TS strict-mode errors in legacy modules
(trpc-router, widgets/routes, ai/routes, etc.). Documented in 102-01 SUMMARY
and 102-03 SUMMARY as well.

**Resolution:** Outside Phase 102 scope. Track in Phase 103+ tech-debt epic.
