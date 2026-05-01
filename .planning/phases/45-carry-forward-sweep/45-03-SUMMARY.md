---
phase: 45-carry-forward-sweep
plan: 03
subsystem: api
tags: [trpc, httponly-paths, ws-reconnect-fix, carry-forward, claude-oauth, usage-dashboard]

# Dependency graph
requires:
  - phase: 40-per-user-claude-oauth
    provides: ai.claudePerUserStartLogin subscription route (long-running OAuth login flow)
  - phase: 44-usage-dashboard
    provides: usage.getMine + usage.getAll query routes (per-user + admin-only usage stats)
  - phase: 45-carry-forward-sweep/45-01
    provides: sacred-file BASELINE_SHA re-pin (Wave 2 isolation precondition)
  - phase: 45-carry-forward-sweep/45-02
    provides: broker 429 forwarding + Retry-After preservation (Wave 2 sibling, parallel-safe)
provides:
  - "Three new namespaced entries in httpOnlyPaths array (ai.claudePerUserStartLogin, usage.getMine, usage.getAll) — they now route via HTTP instead of defaulting to WebSocket transport"
  - "Cluster-comment template (FR-CF-03 citation + WS-reconnect-hang reasoning) for future tRPC additions to httpOnlyPaths"
  - "Static-array test pattern (common.test.ts) — bare tsx + node:assert/strict; cheap; runs in milliseconds; no fixtures"
affects: [phase-46-fail2ban, future-trpc-additions, ws-reconnect-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cluster-comment-by-milestone-phase pattern for httpOnlyPaths additions (each cluster cites the milestone + REQ-ID + reasoning + cross-reference to precedent entries)"
    - "Static-array test for routing-config arrays — pure import + .includes() assertion; no server lifecycle, no Redis/PG fixtures; bare tsx + node:assert/strict harness matching the broker module convention"
    - "Bare-name footgun guard test — assert.ok(!array.includes('bareNameWithoutNamespace')) catches the namespacing-convention violation that would silently no-op the entry"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/server/trpc/common.test.ts (78 lines, 4 tests, runs in <1s)"
  modified:
    - "livos/packages/livinityd/source/modules/server/trpc/common.ts (+9 lines: 6-line cluster comment + 3 namespaced entries; 0 deletions; 0 reorderings)"

key-decisions:
  - "Insertion point: immediately AFTER the existing Claude-auth cluster's last entry ('ai.setComputerUseAutoConsent' at line 173). Rationale: the new ai.claudePerUserStartLogin is conceptually adjacent (Claude auth, Phase 40 successor to Phase 39's claudeStartLogin). Keeps the file's feature-grouped organization intact."
  - "All three entries use the FULLY NAMESPACED form (<router>.<route>) — bare-name variants would silently no-op because the tRPC client matches on the full path. Test 4 in common.test.ts asserts the bare-name absence as a footgun guard."
  - "Test harness: bare tsx + node:assert/strict (matching the broker module's openai-sse-adapter.test.ts), NOT Vitest. Rationale: trpc/common is closer in shape to the broker module (pure config/utility) than to usage-tracking (which has a DB layer); the broker convention is the right precedent."
  - "Test scope: ONLY the three new entries plus the bare-name guard. Does NOT snapshot every existing entry — that would be a fragile test failing every time someone adds a new tRPC mutation."
  - "Full restart-livinityd-mid-session integration test DEFERRED to UAT on Mini PC (per pitfall W-20: no mocking external systemctl + livinityd lifecycle in unit tests)."

patterns-established:
  - "Cluster comment template for httpOnlyPaths additions: cite milestone phase + REQ-ID + WS-reconnect-hang reasoning + cross-reference to precedent entries by line number. Phase 46 will reuse this template for 'fail2ban.unbanIp' + 'fail2ban.banIp'."
  - "Static-array assertion pattern for routing-config arrays — each new entry gets a presence test + the cluster gets a single bare-name-absence guard test. Cheap, fast, deterministic; no fixtures needed."

requirements-completed: [FR-CF-03]

# Metrics
duration: 2min
completed: 2026-05-01
---

# Phase 45 Plan 03: Carry-Forward C3 Summary

**Three tRPC routes (ai.claudePerUserStartLogin + usage.getMine + usage.getAll) added to httpOnlyPaths allowlist — they now route via HTTP fallback instead of defaulting to WebSocket, surviving the ~5s WS reconnect window after `systemctl restart livos`.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-01T19:23:48Z
- **Completed:** 2026-05-01T19:25:50Z
- **Tasks:** 3
- **Files modified:** 1 (common.ts)
- **Files created:** 1 (common.test.ts)

## Accomplishments

- `httpOnlyPaths` allowlist in `livos/packages/livinityd/source/modules/server/trpc/common.ts` extended with three namespaced entries (`'ai.claudePerUserStartLogin'`, `'usage.getMine'`, `'usage.getAll'`) inserted immediately after the existing Claude-auth cluster, preceded by a 6-line cluster comment citing FR-CF-03 + the WS-reconnect-hang reasoning + cross-reference to precedent entries.
- New static-array test `common.test.ts` (4 tests, bare `tsx` + `node:assert/strict` harness) asserts the three new entries are present AND that bare-name variants are absent (footgun guard for the namespacing-convention violation).
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` UNTOUCHED — Wave 2 isolation contract preserved on top of 45-01's audit-only re-pin and 45-02's isolation.

## Diff Hunk

```diff
@@ -171,6 +171,15 @@ export const httpOnlyPaths = [
 	'ai.claudeLogout',
 	'ai.setPrimaryProvider',
 	'ai.setComputerUseAutoConsent',
+	// v29.4 Phase 45 Plan 03 (FR-CF-03) — Phase 40 per-user Claude OAuth login
+	// + Phase 44 usage dashboard queries. Long-running subscription/queries
+	// that must survive WS reconnect after `systemctl restart livos` (precedent:
+	// system.update at line 27, ai.claudeStartLogin at line 169). Without HTTP
+	// transport, mutations/queries silently queue and drop during the ~5s WS
+	// reconnect window — pitfall B-12 / X-04.
+	'ai.claudePerUserStartLogin',
+	'usage.getMine',
+	'usage.getAll',
 	// Subagent execution -- use HTTP for reliability (can take 10-60s)
 	'ai.executeSubagent',
 	// Marketplace install -- use HTTP for mutation reliability
```

(9 insertions, 0 deletions; no pre-existing entry modified, reordered, or removed.)

## Test Output

```
$ npx tsx livos/packages/livinityd/source/modules/server/trpc/common.test.ts
  PASS Test 1: 'ai.claudePerUserStartLogin' present in httpOnlyPaths
  PASS Test 2: 'usage.getMine' present in httpOnlyPaths
  PASS Test 3: 'usage.getAll' present in httpOnlyPaths
  PASS Test 4: bare-name entries absent (namespaced convention preserved)

All common.test.ts tests passed (4/4)
```

Exit 0. Total runtime <1s.

## Task Commits

This plan ships in ONE atomic commit (the source change + the test file):

1. **C3 source + test** — `d2c99e8a` (feat)
   - Subject: `feat(45-03): httpOnlyPaths additions for claude per-user login + usage routes (FR-CF-03)`
   - Files: `livos/packages/livinityd/source/modules/server/trpc/common.ts`, `livos/packages/livinityd/source/modules/server/trpc/common.test.ts`
   - Insertions: 87 (9 in common.ts + 78 in common.test.ts)
   - Deletions: 0

**Plan metadata commit:** (this SUMMARY + STATE/ROADMAP/REQUIREMENTS updates) — committed separately after this file lands.

## Files Created/Modified

- **`livos/packages/livinityd/source/modules/server/trpc/common.ts`** — Added 3 new namespaced strings (`'ai.claudePerUserStartLogin'`, `'usage.getMine'`, `'usage.getAll'`) to the `httpOnlyPaths` `as const` array, immediately after the Claude-auth cluster (line 173 → new entries at lines 180-182). Preceded by a 6-line cluster comment citing FR-CF-03. Total file: 116 entries (was 113); 195 lines → 204 lines.
- **`livos/packages/livinityd/source/modules/server/trpc/common.test.ts`** (NEW) — Static-array assertion test. 4 tests: 3 presence checks (`httpOnlyPaths.includes('ai.claudePerUserStartLogin')` etc.) + 1 bare-name-absence guard (`!httpOnlyPaths.includes('claudePerUserStartLogin')` etc.). Bare `tsx` + `node:assert/strict` harness matching broker module convention.

## Decisions Made

- **Insertion point chosen as Claude-auth-cluster-adjacent (after line 173 `'ai.setComputerUseAutoConsent'`).** Rationale: the new `ai.claudePerUserStartLogin` is the Phase 40 per-user successor to Phase 39's already-listed `'ai.claudeStartLogin'`. Keeping the cluster geographically grouped preserves the file's feature-organized layout. The two `usage.*` entries piggyback on the same cluster comment because they're added by the same milestone for the same WS-reconnect-survival reason.
- **Test harness: bare `tsx` + `node:assert/strict`.** Plan 45-02 used the same pattern in `livinity-broker/integration.test.ts` and `openai-sse-adapter.test.ts`. The `usage-tracking` module uses Vitest, but `trpc/common` is closer in shape to the broker module (pure config/utility, no DB layer); the broker convention is the right precedent.
- **Test 4 (bare-name-absence guard).** Catches the most common footgun: someone adds `'claudePerUserStartLogin'` (without `ai.` prefix) thinking it'll work. The tRPC client matches on the full `<router>.<route>` path, so bare names silently no-op. Test 4 turns this into a deterministic failure at PR review time.
- **No `tsc --noEmit` re-pin.** The `httpOnlyPaths` array is `as const`, so adding 3 new string literals just extends its inferred literal-union type. No consumer of the array narrows the input type beyond `string`. Compile is clean for `common.ts` (verified: no new errors in trpc/common.ts; pre-existing `@nexus/core` type drift in `ai/routes.ts` etc. is the same baseline 45-02 noted).

## Deviations from Plan

None - plan executed exactly as written.

The plan's 3 tasks (verify pre-state → insert entries + cluster comment → create static-array test) all completed on the first attempt. No bugs discovered, no critical functionality missing, no blocking issues. The pre-existing `@nexus/core` type drift errors surfaced by `tsc --noEmit` are out-of-scope (Plan 45-02 already documented them; they are not caused by Plan 45-03's edits) and remain deferred per the same posture.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 45 progress:** 3 of 4 carry-forward plans shipped (45-01 = FR-CF-02, 45-02 = FR-CF-01, 45-03 = FR-CF-03). FR-CF-04 (broker `usage` chunk emission for OpenAI streaming) remains for the final Phase 45 plan.
- **Phase 46 (Fail2ban Admin Panel) readiness:** the cluster-comment template established here is the documented pattern for adding `'fail2ban.unbanIp'` + `'fail2ban.banIp'` to the same `httpOnlyPaths` array. The static-array test pattern (`common.test.ts`) is the documented test surface to extend with two new presence assertions.
- **Sacred file isolation:** preserved (Wave 2 contract holds; 45-01's audit-only re-pin remains the most recent sacred edit).
- **Mini PC UAT note:** the full restart-livinityd-mid-session integration test (force a `systemctl restart livos` while a `usage.getMine` poll is in flight, verify the next poll arrives via HTTP rather than hanging on a half-broken WS) is DEFERRED to manual UAT on the Mini PC per pitfall W-20. Not a blocker for Phase 46; opt-in alongside the v29.3 deferred UATs.

## Self-Check: PASSED

- [x] `livos/packages/livinityd/source/modules/server/trpc/common.ts` exists and contains the 3 new namespaced strings (verified: `grep` for each entry returned 1 match)
- [x] `livos/packages/livinityd/source/modules/server/trpc/common.test.ts` exists and runs cleanly via `npx tsx ...` (verified: 4/4 PASS, exit 0)
- [x] Cluster comment cites `v29.4 Phase 45 Plan 03 (FR-CF-03)` (verified: `grep` returned 1 match at line 174)
- [x] Pre-existing entry `'preferences.delete'` still at the bottom of the array (verified: `tail -3 common.ts` shows `'preferences.delete', \n] as const`)
- [x] Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` UNCHANGED by this plan (verified: `git diff --shortstat HEAD~1 HEAD -- nexus/packages/core/src/sdk-agent-runner.ts` is empty)
- [x] Atomic commit `d2c99e8a` exists in git log with the expected subject line (verified: `git show --stat HEAD` shows `feat(45-03): httpOnlyPaths additions for claude per-user login + usage routes (FR-CF-03)` with 2 files changed, 87 insertions, 0 deletions)
- [x] No file outside `common.ts` and `common.test.ts` modified by this plan (verified: `git show --stat HEAD` shows exactly those two files)

---
*Phase: 45-carry-forward-sweep*
*Plan: 03*
*Completed: 2026-05-01*
