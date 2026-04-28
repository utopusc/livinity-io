# Phase 34: Update UX Hardening - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning
**Mode:** Reconciliation (UX-01/02/03 already shipped as emergency fix in commit `11634c5a`; this phase audits + closes residual gaps)

<domain>
## Phase Boundary

"Install Update tıklandı, hiçbir şey olmadı" silent-fail (BACKLOG 999.6) is impossible — every `system.update` failure surfaces as an actionable toast, the button is disabled while pending, and WS hang-ups during long-running mutations fall back to HTTP transport instead of silently dropping.

**Requirements covered:** UX-01 (mutation onError → toast), UX-02 (pending state guard), UX-03 (httpOnlyPaths)

</domain>

<decisions>
## Implementation Decisions

### Pre-existing emergency fix (commit `11634c5a`, Apr 26)
Phase 34 was partially shipped as an emergency fix to close BACKLOG 999.6. Already done:
- **UX-01:** `useUpdate` mutation hook (`update.tsx:48`) has `onError` → `describeUpdateError(err)` → `toast.error()` with classified messages (session expired / WS dropped / GitHub rate limit / disk full / generic fallback)
- **UX-02:** `UpdateConfirmModal` stays open during `mutation.isPending`; action button disabled with "Starting update…" label; cancel button disabled; `onOpenChange(false)` intercepted to prevent dismiss-during-pending
- **UX-03:** Both `system.update` and `system.checkUpdate` registered in `livinityd/source/modules/server/trpc/common.ts` `httpOnlyPaths` (lines 27 + 36)

### Audit results (2026-04-27)
After live audit against the 4 success criteria:
- **SC-1 (toast in EVERY caller):** PARTIAL — `update.tsx` has onError, `migrate.tsx:57` exports a duplicate `useSoftwareUpdate` hook WITHOUT onError. **BUT this duplicate is dead code** — verified zero imports across the entire UI tree (`grep -rn "from.*global-system-state/migrate"` returns only `useMigrate` + `MigratingCover` imports). Solution: remove the dead export.
- **SC-2 (UpdatingCover non-dismissible):** SATISFIED — `UpdatingCover` is a `<BarePage>` (full-screen page), not a `<Dialog>`. Escape/backdrop don't apply. Browser back-nav re-enters the same global system state and re-renders the cover. No additional handling needed.
- **SC-3 (both routes in httpOnlyPaths):** SATISFIED — verified live in common.ts.
- **SC-4 (zero callers without onError):** Same as SC-1 — once the dead `useSoftwareUpdate` export is removed from `migrate.tsx`, the grep audit returns zero callers without onError.

### Residual scope (this phase)
1. **Remove dead `useSoftwareUpdate` export** from `livos/packages/ui/src/providers/global-system-state/migrate.tsx` (lines 57-72)
2. **Add regression-test grep** that asserts no `system.update.useMutation` call exists without an adjacent `onError` block — prevents future re-introduction of BACKLOG 999.6

### Patch artifact
None — this is pure UI code cleanup + test addition. No SSH apply needed.

</decisions>

<code_context>
## Existing Code Insights

- `livos/packages/ui/src/providers/global-system-state/update.tsx` — canonical `useUpdate` hook with onError (already correct)
- `livos/packages/ui/src/providers/global-system-state/migrate.tsx` — canonical `useMigrate` hook + dead `useSoftwareUpdate` export
- `livos/packages/ui/src/hooks/use-software-update.ts` — query-side hook for state polling (different concern, no mutation involved, no onError needed)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — httpOnlyPaths registry (already includes both system routes)

</code_context>

<specifics>
## Specific Ideas

### Plan 34-01 (single plan, 2 tasks)
- **Task 1:** Remove the dead `useSoftwareUpdate` function from `migrate.tsx` (lines 57-72) cleanly. Verify no imports break (`pnpm tsc --noEmit` should pass).
- **Task 2:** Add a vitest test in a new file `livos/packages/ui/src/providers/global-system-state/onerror-audit.unit.test.ts` that:
  - Greps the entire UI src tree for `system.update.useMutation` invocations
  - For each match, asserts the immediate next ~20 lines contain `onError`
  - Fails with a clear message if any caller lacks onError (prevents BACKLOG 999.6 regression)

</specifics>

<deferred>
## Deferred Ideas
None — phase scope is tight.
</deferred>
