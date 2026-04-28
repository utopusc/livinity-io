---
phase: 33-update-observability-surface
plan: 01
subsystem: api
tags: [trpc, vitest, security, path-traversal, http-only, observability, admin-procedure]

# Dependency graph
requires:
  - phase: 32-pre-update-sanity-auto-rollback
    provides: "/opt/livos/data/update-history/ directory + JSON schema (rollback.json, precheck-fail.json) consumed by listUpdateHistory"
  - phase: 30-update-stability
    provides: "httpOnlyPaths convention (system.update, system.updateStatus, system.checkUpdate) — Phase 33 mirrors the same pattern for the two new admin queries"
provides:
  - "system.listUpdateHistory adminProcedure (Zod limit 1..200, default 50, sorted newest-first)"
  - "system.readUpdateLog adminProcedure (3-layer filename guard, tail-500 default, full mode)"
  - "Both routes registered in httpOnlyPaths (BACKLOG 999.6 trap closed for OBS surfaces)"
  - "16 new vitest cases extending system.unit.test.ts (5 list + 6 traversal + 1 R7 spy + 4 happy path) + 1 HOP1 registration test"
affects:
  - 33-03 (UI plan): consumes trpcReact.system.listUpdateHistory + trpcReact.system.readUpdateLog
  - 33-02 (update.sh logging patch): writes the *.log + <ts>-success.json/<ts>-failed.json files that listUpdateHistory will surface and readUpdateLog will display

# Tech tracking
tech-stack:
  added: ["node:fs/promises (newly imported in routes.ts)", "node:path (newly imported in routes.ts)"]
  patterns:
    - "3-layer filename guard for admin filesystem reads (basename equality + alnum-leading regex + resolved-path containment)"
    - "Defense-in-depth spy assertion: vi.spyOn(fs, 'readFile') verifies fs.readFile is NEVER invoked when validation rejects"
    - "Cross-platform path containment check: resolve BOTH HISTORY_DIR and the candidate so Windows path.resolve normalisation does not break the startsWith comparison"

key-files:
  created:
    - .planning/phases/33-update-observability-surface/33-01-SUMMARY.md
    - .planning/phases/33-update-observability-surface/deferred-items.md
  modified:
    - livos/packages/livinityd/source/modules/system/routes.ts
    - livos/packages/livinityd/source/modules/system/system.unit.test.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts

key-decisions:
  - "Stricter regex: chose /^[a-zA-Z0-9][a-zA-Z0-9._-]*\\.(log|json)$/ (first char must be alnum) over the looser /^[a-zA-Z0-9._-]+\\.(log|json)$/ from the research draft. The loose form does NOT reject '..foo.log' — research test R4 demands the stricter form."
  - "Layer 3 (resolved-path containment) compares against path.resolve(HISTORY_DIR), not the raw '/opt/livos/data/update-history' string. On Windows, path.resolve injects a drive letter, so the raw startsWith check would always fail (even for legitimate filenames). Resolving both sides keeps the test green on Windows and identical on Linux."
  - "Used test.each(TRAVERSAL_VECTORS) for the 6 rejection tests (one test per vector) plus a separate R7 test that loops through the same array under a vi.spyOn assertion. This means TRAVERSAL_VECTORS is referenced 3 times (declaration + test.each + R7 loop) — slightly more than the plan's expected count of 2 but structurally cleaner and gives per-vector test isolation in the vitest output."

patterns-established:
  - "Admin-only filesystem read RPC: adminProcedure + Zod input + 3-layer guard + ENOENT→specific TRPCError code mapping"
  - "BACKLOG 999.6 mitigation: any new admin diagnostic route that reads files written by long-running deploy machinery MUST be added to httpOnlyPaths so a half-broken WS does not silently swallow the diagnose query"
  - "TDD test+spy: assert NOT-CALLED on the dangerous primitive (fs.readFile) for ALL rejection cases in a single block, instead of trusting the BAD_REQUEST shape alone"

requirements-completed: [OBS-02, OBS-03]

# Metrics
duration: ~70min
completed: 2026-04-27
---

# Phase 33 Plan 01: Backend OBS-02/03 Routes Summary

**Two admin tRPC routes (system.listUpdateHistory + system.readUpdateLog) that surface /opt/livos/data/update-history/ to the UI, defended by a 3-layer filename guard with a spy-asserted fs.readFile NEVER-called proof, both routes registered in httpOnlyPaths so post-deploy WS half-breaks cannot hang the diagnose flow.**

## Performance

- **Duration:** ~70 min (includes ~10 min for env bootstrapping: pnpm install + nexus core build + dist copy into pnpm-resolved location)
- **Started:** 2026-04-27T08:55:00Z (worktree reset)
- **Completed:** 2026-04-27T10:06:23Z
- **Tasks:** 3 (TDD: RED + GREEN + GREEN)
- **Files modified:** 3 production + 2 planning docs

## Accomplishments

- `system.listUpdateHistory` + `system.readUpdateLog` adminProcedure handlers shipped in `routes.ts`, behaviour-locked by 17 vitest cases (5 list + 6 parameterized traversal rejections + 1 R7 spy + 4 happy path + 1 httpOnlyPaths registration).
- 3-layer filename guard (basename equality, alnum-leading regex, resolved-path containment) provably blocks `'../etc/passwd'`, `'/etc/passwd'`, `'evil/path.log'`, `'..hidden.log'`, `'log\\with\\backslash'`, `'.bash_history'` — and the R7 spy proves `fs.readFile` is never invoked for any of them.
- Both routes registered in `httpOnlyPaths` (the v29.0 BACKLOG 999.6 mitigation pattern) so a post-deploy half-broken WS cannot silently swallow the diagnose-after-failed-update queries.
- Cross-platform-safe path containment: layer 3 resolves both HISTORY_DIR and the candidate path, so the same code path is green on Windows dev hosts AND on the Linux Mini PC production host.

## Task Commits

Each task was committed atomically with `--no-verify` (worktree mode):

1. **Task 1 (RED): add failing tests for OBS-02/03 backend routes** — `a18223b6` (test)
2. **Task 2 (GREEN): implement system.listUpdateHistory + system.readUpdateLog** — `82e14489` (feat)
3. **Task 3 (GREEN): register Phase 33 routes in httpOnlyPaths** — `85b2d7c8` (feat)

_TDD gate sequence: test(33-01) → feat(33-01) → feat(33-01). Both RED and GREEN gates present in `git log`._

## Files Created/Modified

- `livos/packages/livinityd/source/modules/system/routes.ts` — Added `node:fs/promises`, `node:path`, `adminProcedure` imports. Inserted `listUpdateHistory` (admin query, Zod limit, ENOENT→[], corrupt JSON skipped, sorted desc) and `readUpdateLog` (admin query, 3-layer filename guard, tail-500 default, full mode, ENOENT→NOT_FOUND) between `update:` mutation and `hiddenService:` query. ~102 net additions.
- `livos/packages/livinityd/source/modules/system/system.unit.test.ts` — Added 4 new imports (`fsPromises`, `vi.mock('node:fs/promises')`, `system from './routes.js'`, `httpOnlyPaths from '../server/trpc/common.js'`). Appended 5 describe blocks: `system.listUpdateHistory (Phase 33 OBS-02)` (5 tests), `system.readUpdateLog filename validation (Phase 33 OBS-03 security)` (7 tests, 6 via test.each + R7 spy), `system.readUpdateLog happy path (Phase 33 OBS-03)` (4 tests), `Phase 33 OBS-02/03 — httpOnlyPaths registration` (1 test). Total +168 lines.
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — Added 7 lines: a Phase 33 OBS-02/03 comment block + `'system.listUpdateHistory'` + `'system.readUpdateLog'` entries between `'system.checkUpdate'` and the multi-user routes block.
- `.planning/phases/33-update-observability-surface/deferred-items.md` — created to document 2 pre-existing test failures (Linux-only `ps -Ao` in system.integration.test.ts and a stale getLatestRelease test in update.unit.test.ts) that are out of scope for Plan 33-01.

## Decisions Made

- **Stricter filename regex than research first draft.** Research's `<security_enforcement>` block proposed `/^[a-zA-Z0-9._-]+\.(log|json)$/`, but research test R4 explicitly demands rejecting `'..hidden.log'`. The loose regex does NOT reject that input (`.` is in the class). I used `/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(log|json)$/` — first char must be alnum — which makes R4 pass. Documented inline in the routes.ts comment block.
- **Resolve both sides for layer-3 containment.** The plan's draft code did `resolved.startsWith(HISTORY_DIR + path.sep)` against the raw POSIX string `/opt/livos/data/update-history`. On Windows, `path.resolve('/opt/livos/data/update-history', 'good.log')` returns `C:\opt\livos\data\update-history\good.log` and the raw string never matches → ALL happy-path tests would fail on Windows. I resolved BOTH sides (`HISTORY_DIR_RESOLVED = path.resolve(HISTORY_DIR)`, then compare against `HISTORY_DIR_RESOLVED + path.sep`) so the comparison normalises identically on either OS. Documented inline.
- **Parameterized traversal tests via `test.each`.** Each of the 6 traversal vectors gets its own test entry in the vitest output (clearer failure attribution) PLUS the R7 spy test loops through the same array. Result: TRAVERSAL_VECTORS is referenced 3 times in the file (declaration + test.each + R7 loop), one more than the plan's acceptance criterion expected (2). The plan's count assumed declaration + R7 only — but parameterized testing is the cleaner pattern, so I deviated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made layer-3 path containment cross-platform safe**
- **Found during:** Task 2 (implementing readUpdateLog handler)
- **Issue:** The plan's literal code `resolved.startsWith(HISTORY_DIR + path.sep)` with `HISTORY_DIR = '/opt/livos/data/update-history'` would FAIL on Windows for legitimate filenames because `path.resolve('/opt/livos/data/update-history', 'good.log')` returns `C:\opt\livos\data\update-history\good.log` on Windows — never starts with the raw POSIX string `/opt/livos/data/update-history\`. The plan-validation tests run on Windows in this worktree, so the happy-path tests (H1, H2, H3) would have all failed layer 3 and bounced as `BAD_REQUEST`.
- **Fix:** Resolve both sides: `const HISTORY_DIR_RESOLVED = path.resolve(HISTORY_DIR); const resolved = path.resolve(HISTORY_DIR_RESOLVED, input.filename);` then compare `resolved.startsWith(HISTORY_DIR_RESOLVED + path.sep)`. On Linux production this is a no-op (resolve of absolute path returns itself); on Windows it normalises the drive letter consistently on both sides.
- **Files modified:** `livos/packages/livinityd/source/modules/system/routes.ts`
- **Verification:** All 4 happy-path tests (H1, H2, H3, H4) pass on Windows; all 7 traversal-rejection tests still fail at layers 1 or 2 before reaching layer 3 (R7 spy proof: `fs.readFile` not called for any traversal vector).
- **Committed in:** `82e14489` (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Bootstrapped pnpm + nexus build + dist copy for vitest to load test target**
- **Found during:** Task 1 verify (first vitest run)
- **Issue:** Fresh worktree had no `node_modules`. Even after `pnpm install`, vitest could not resolve `@nexus/core/lib` (transitive import via `source/modules/server/ws-agent.ts`). The pnpm-resolved copy of @nexus/core (a workspace dep pointing at `nexus/packages/core`) had no `dist/` directory — the actual source repo at `nexus/packages/core` did, after running `npm install && npm run build --workspace=packages/core` — but pnpm's snapshot was taken before that build ran.
- **Fix:** (a) `pnpm install --filter livinityd` and `pnpm install --filter @livos/config`, (b) `pnpm --filter @livos/config build`, (c) `cd nexus && npm install && npm run build --workspace=packages/core`, (d) `cp -r nexus/packages/core/dist <pnpm-resolved-@nexus-core-path>/`. After step (d), vitest could collect tests. This is the SAME issue the existing `routes.unit.test.ts` would hit on a fresh worktree — not something my code introduced.
- **Files modified:** None tracked by git — all environment bootstrapping. (`livos/pnpm-lock.yaml` was modified by `pnpm install` but reverted before commit so the lockfile is untouched.)
- **Verification:** `npx vitest run source/modules/system/system.unit.test.ts` collects + runs 25 tests cleanly.
- **Committed in:** N/A (env bootstrap, not source change)

**3. [Rule 3 - Minor / Style] TRAVERSAL_VECTORS referenced 3 times (not 2 as acceptance criterion expected)**
- **Found during:** Task 1 verification grep
- **Issue:** Plan acceptance criterion said `grep -c "TRAVERSAL_VECTORS" ...` should return exactly 2 (declaration + R7 iteration). I structured the rejection tests with `test.each(TRAVERSAL_VECTORS)` for per-vector test isolation in vitest output, plus the R7 spy test that loops through the same array. That pushes the count to 3 (declaration + test.each + R7 loop). This is the cleaner test pattern (each vector gets a named test row), and the spirit of the criterion (the array is centralised + reused) is preserved.
- **Fix:** None — kept the `test.each` pattern. Doc'd here for transparency.
- **Files modified:** N/A
- **Verification:** All 7 readUpdateLog rejection tests (6 + R7) GREEN.
- **Committed in:** `a18223b6` (Task 1 RED commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 blocking, 1 Rule 3 minor style).
**Impact on plan:** Deviations 1 and 2 were necessary for the tests to be runnable on the host OS at all. Deviation 3 is a strict-superset of what the plan required (test count 17 instead of expected 13+1 — better coverage, same spec). No scope creep.

## Issues Encountered

- Pre-existing test failures in unrelated files (logged to `deferred-items.md`):
  - `system.integration.test.ts > memoryUsage`: shells out to Linux-only `ps -Ao pid,pss --no-header` → fails on Windows. Out of scope (in `system.ts`, not modified by Plan 33-01).
  - `update.unit.test.ts > getLatestRelease C: non-2xx GitHub response`: pre-existing test expects `/403/` throw but `getLatestRelease` returns a release object instead. In `update.ts` (Phase 30 territory), not touched by Plan 33-01.
- Both failures predate this plan and are not regressions caused by the OBS-02/03 work.

## TDD Gate Compliance

`git log` shows the required test→feat→feat sequence:

```
85b2d7c8 feat(33-01): register Phase 33 routes in httpOnlyPaths (BACKLOG 999.6 trap)
82e14489 feat(33-01): implement system.listUpdateHistory + system.readUpdateLog
a18223b6 test(33-01): add failing tests for OBS-02/03 backend routes
```

- RED gate: `a18223b6` — 16 of 16 new tests failing for the expected reason ("No procedure found on path ...").
- GREEN gate (impl): `82e14489` — 16 of 17 tests passing; only HOP1 still RED (by design — Task 3 wires it).
- GREEN gate (registration): `85b2d7c8` — all 17 tests GREEN.

No REFACTOR commit was needed — the implementation is the simplest form that satisfies the contract.

## Threat Flags

None. The two new routes are read-only filesystem reads behind `adminProcedure` and the 3-layer guard. No new network endpoints, no schema changes, no auth paths altered. The threat surface added matches exactly what was modeled in the plan's `<threat_model>` block (T-33-01 through T-33-05) and every `mitigate` disposition has a corresponding production code path + test assertion.

## User Setup Required

None — this is a backend-only plan. The two new routes will be exercised by Plan 33-03 (UI). No environment variables, no database migrations, no service restarts beyond the standard livinityd reload (which the v29.0 update flow already does).

## Next Phase Readiness

- Plan 33-02 (update.sh logging patch) can write `<ts>-success.json` / `<ts>-failed.json` / `update-<ts>-<sha>.log` files into `/opt/livos/data/update-history/` knowing the read API will surface them correctly.
- Plan 33-03 (UI) can call:
  - `trpcReact.system.listUpdateHistory.useQuery({limit: 50})` — returns `Array<{filename, timestamp, status, ...}>` newest-first.
  - `trpcReact.system.readUpdateLog.useQuery({filename, full: false})` — returns `{filename, content, truncated, totalLines?}`. UI MUST send the basename only; layer 1 of the guard rejects anything else with BAD_REQUEST.
- BACKLOG 999.6 partially closed: any future admin diagnostic route that reads disk written by long-running deploy machinery MUST be registered in `httpOnlyPaths` (the comment block in common.ts now has a referenceable Phase 33 entry pointing at the same pattern Phase 30/31 established).

## Self-Check: PASSED

Verified before commit:

```
$ git log --oneline | head -3
85b2d7c8 feat(33-01): register Phase 33 routes in httpOnlyPaths (BACKLOG 999.6 trap)
82e14489 feat(33-01): implement system.listUpdateHistory + system.readUpdateLog
a18223b6 test(33-01): add failing tests for OBS-02/03 backend routes
```

Files all exist:

- ✓ `livos/packages/livinityd/source/modules/system/routes.ts` (modified — adminProcedure import, fs/path imports, listUpdateHistory + readUpdateLog inserted)
- ✓ `livos/packages/livinityd/source/modules/system/system.unit.test.ts` (modified — 168 lines appended)
- ✓ `livos/packages/livinityd/source/modules/server/trpc/common.ts` (modified — 7 lines added)
- ✓ `.planning/phases/33-update-observability-surface/deferred-items.md` (created)
- ✓ `.planning/phases/33-update-observability-surface/33-01-SUMMARY.md` (this file)

Commits all exist (verified via `git log --oneline | grep`):

- ✓ `a18223b6` test(33-01)
- ✓ `82e14489` feat(33-01) impl
- ✓ `85b2d7c8` feat(33-01) httpOnlyPaths

Final test run: `cd livos/packages/livinityd && ./node_modules/.bin/vitest run source/modules/system/system.unit.test.ts` → 25 tests passed (16 Phase 33 + 9 pre-existing), 0 failed.

---
*Phase: 33-update-observability-surface*
*Plan: 01*
*Completed: 2026-04-27*
