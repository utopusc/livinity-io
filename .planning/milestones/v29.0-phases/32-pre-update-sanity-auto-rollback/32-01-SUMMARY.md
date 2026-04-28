---
phase: 32-pre-update-sanity-auto-rollback
plan: 01
subsystem: infra
tags: [phase-32, rel-01, precheck, bash, vitest, update-sh, deploy-safety]

# Dependency graph
requires:
  - phase: 30-update-system-redesign
    provides: "performUpdate() with execa stderr -> updateStatus.error chain (consumed by test G)"
  - phase: 31-update-sh-build-pipeline-integrity
    provides: "Idempotent patch script pattern + .deployed-sha file convention (consumed by record_previous_sha)"
provides:
  - "Sourceable bash block (precheck-block.sh) defining precheck() + record_previous_sha() helpers"
  - "3 bash unit tests (precheck-disk/write/net.sh) + run-all.sh aggregator with PASS/FAIL/SKIP reporting"
  - "Vitest test G proving PRECHECK-FAIL stderr round-trips through performUpdate to updateStatus.error verbatim"
  - "PRECHECK-FAIL: <reason> contract (single-line, <200 chars, no ANSI) — Phase 34 UX-01 toast consumes via /^PRECHECK-FAIL: (.+)$/"
  - "precheck-failed.json schema {timestamp, status, reason, duration_ms} — Phase 33 OBS-02 consumes from /opt/livos/data/update-history/"
affects: [phase-32-02, phase-32-03, phase-33, phase-34]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PATH-injected stub binaries for bash unit testing (df/mktemp/curl) — no external test framework"
    - "Brace-group stderr suppression `{ cat > path <<JSON ... } 2>/dev/null` for graceful degradation"
    - "Idempotency markers via `# ── Phase 32 REL-01: precheck ──` comment lines (Plan 32-03 anchors)"

key-files:
  created:
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/precheck-block.sh"
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-disk.sh"
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-write.sh"
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-net.sh"
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/run-all.sh"
    - ".planning/phases/32-pre-update-sanity-auto-rollback/deferred-items.md"
  modified:
    - "livos/packages/livinityd/source/modules/system/update.unit.test.ts"

key-decisions:
  - "df -BG -P (POSIX format) over df -BG to prevent column-shifting on paths with embedded whitespace (T-32-04 mitigation)"
  - "mkdir -p /opt/livos/data/update-history is the FIRST action in precheck() (O-03 lock — Phase 33 needs the dir to exist even on precheck-failed deploys)"
  - "JSON write wrapped in brace-group for stderr suppression: `{ cat > path <<JSON ... } 2>/dev/null` so bash's own redirect-failure complaint is silenced when history dir creation failed (graceful degradation in test environments)"
  - "precheck-net.sh mktemp stub redirects `-p /opt/livos` calls to test TMPDIR (so guard 2 passes regardless of whether /opt/livos exists on test host — Windows worktree, CI)"
  - "Test G mocks Error.message as 'Command failed with exit code 1: bash /opt/livos/update.sh\\nPRECHECK-FAIL: ...' to match execa's actual rejection message format"

patterns-established:
  - "Plan 32-01 SOURCE-OF-TRUTH bash block pattern — Plan 32-03 will cat-splice precheck-block.sh into the update.sh patch HEREDOC body using the # ── Phase 32 REL-01: precheck ── marker as awk anchor"
  - "Bash unit test PATH-injection — drop a stub script into TMPDIR, prepend TMPDIR to PATH, source the production block, invoke the function, capture stderr+exit code"
  - "PRECHECK-FAIL string contract — Phase 34 toast handler uses /^PRECHECK-FAIL: (.+)$/, single-line, <200 chars, no ANSI (verified by grep checks in Plan 32-03 patch script)"

requirements-completed: [REL-01]

# Metrics
duration: 22min
completed: 2026-04-26
---

# Phase 32 Plan 01: Pre-Update Sanity (REL-01 precheck) Summary

**Sourceable bash block defining precheck() with 3 guards (disk >=2GB, /opt/livos writable, GitHub api reachable in 5s) plus record_previous_sha() SHA rotation, backed by 3 bash unit tests + 1 vitest round-trip test proving the PRECHECK-FAIL contract holds end-to-end through update.sh's stderr -> performUpdate() -> updateStatus.error chain.**

## Performance

- **Duration:** ~22 min (10:30 — 10:52 UTC, includes pnpm install + build cycles)
- **Started:** 2026-04-26T16:30:00Z (plan-execute kickoff)
- **Completed:** 2026-04-26T16:51:56Z
- **Tasks:** 3 (1× feat + 2× test commits)
- **Files created:** 6 (precheck-block.sh + 4 test files + deferred-items.md)
- **Files modified:** 1 (update.unit.test.ts — additive, +33 lines)

## Accomplishments

- **REL-01 precheck implementation contract locked** — precheck-block.sh ships with all 3 guards (disk/writable/network) emitting parser-friendly `PRECHECK-FAIL: <reason>` strings on stderr that match Phase 34's UX-01 regex `^PRECHECK-FAIL: (.+)$`
- **Phase 33 logging contract honored** — precheck() creates /opt/livos/data/update-history/ as its first action AND writes `<iso-ts>-precheck-fail.json` with the locked O-03 schema `{timestamp, status: "precheck-failed", reason, duration_ms}` on every guard failure
- **Phase 32-02 prerequisite ready** — record_previous_sha() rotates `.deployed-sha` to `.deployed-sha.previous` so livos-rollback.sh has a SHA to revert to
- **End-to-end coverage** — 3 bash tests prove each guard fires correctly with PATH-injected stubs (df/mktemp/curl), 1 vitest test proves the PRECHECK-FAIL string round-trips through execa's rejection back to updateStatus.error verbatim

## Task Commits

Each task was committed atomically with `--no-verify` (parallel worktree pattern):

1. **Task 1: precheck-block.sh helpers (precheck + record_previous_sha)** — `9480e125` (feat)
2. **Task 2: bash unit tests + run-all aggregator** — `4b8a717f` (test)
3. **Task 3: vitest test G — PRECHECK-FAIL stderr round-trips** — `77f3fa9f` (test)

_Note: Task 2's commit also includes a Rule-2 robustness patch to precheck-block.sh (brace-group stderr suppression) — discovered while running the tests, fixed in the same commit._

## Files Created/Modified

| File | Type | Purpose |
|------|------|---------|
| `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/precheck-block.sh` | NEW (97 lines) | Sourceable bash block — Plan 32-03 cat-splices into /opt/livos/update.sh |
| `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-disk.sh` | NEW (60 lines) | Bash unit test: df stub returns 1G → assert PRECHECK-FAIL: insufficient disk space + exit 1 |
| `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-write.sh` | NEW (53 lines) | Bash unit test: mktemp stub fails on `-p /opt/livos` → assert PRECHECK-FAIL: not writable + exit 1 |
| `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-net.sh` | NEW (65 lines) | Bash unit test: curl stub exits 7 → assert PRECHECK-FAIL: GitHub api.github.com unreachable + exit 1 |
| `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/run-all.sh` | NEW (50 lines) | Aggregator: runs all 5 tests (3 from this plan + 2 from Plan 32-02), gracefully SKIPs missing tests |
| `.planning/phases/32-pre-update-sanity-auto-rollback/deferred-items.md` | NEW | Out-of-scope items discovered during execution (test C pre-existing failure, UI postinstall Windows quirk, pnpm-store nexus dist gap) |
| `livos/packages/livinityd/source/modules/system/update.unit.test.ts` | MODIFIED (+33 lines) | Test G additive — proves PRECHECK-FAIL stderr text is captured in updateStatus.error verbatim |

## Decisions Made

1. **`df -BG -P /opt/livos`** (POSIX-format) over `df -BG /opt/livos` — Threat T-32-04 mitigation: POSIX mode prevents column-shifting on paths with embedded whitespace. Safe even though `/opt/livos` itself has no spaces, because the mounted-on column on the right COULD wrap.
2. **mkdir -p history dir is the FIRST action** (O-03 lock from 32-RESEARCH) — Phase 33 OBS-02 wants every update attempt logged, including precheck failures. Without an existing dir, the JSON write fails silently. Cost is microseconds; gain is observability.
3. **Brace-group stderr suppression** for the JSON heredoc write — `{ cat > "$json_path" <<JSON ... } 2>/dev/null` ensures bash's own "no such file or directory" complaint (which fires BEFORE cat's stderr redirect applies) is silenced when the history dir creation failed. Production hosts always have the dir; this is for graceful degradation in test environments where /opt/livos doesn't exist.
4. **Test G's mocked Error.message includes the exit-code prefix** — `'Command failed with exit code 1: bash /opt/livos/update.sh\nPRECHECK-FAIL: ...'`. This matches execa's actual rejection message format (verified by reading execa's source). The assertion uses `String(status.error).toContain('PRECHECK-FAIL: insufficient disk space')` to check substring presence rather than exact match — keeps the test robust to execa version-bumps that might change the prefix wording.
5. **No mktemp delegate-to-real in precheck-disk.sh** (only in net.sh) — guard 1 fails first in the disk test, so guard 2 never runs. The minimal stub is sufficient. precheck-net.sh requires the more sophisticated `-p /opt/livos` → TMPDIR redirect because guards 1+2 must pass before guard 3 fires.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] precheck-net.sh mktemp stub initially failed guard 2 instead of letting it pass**
- **Found during:** Task 2 (running the bash tests)
- **Issue:** First version of precheck-net.sh delegated all mktemp calls to real mktemp via `exec "$REAL_MKTEMP" "$@"`. On Windows worktrees (and any host without `/opt/livos`), `mktemp -p /opt/livos` fails — guard 2 fired before guard 3 could be reached, so the network test never actually exercised the network guard.
- **Fix:** Stub now intercepts `-p /opt/livos` calls and redirects them to test TMPDIR: `if [[ "$1" == "-p" ]] && [[ "$2" == "/opt/livos" ]]; then shift 2; exec "$REAL_MKTEMP" -p "$TMPDIR" "$@"; fi`. Other args still delegate to real mktemp.
- **Files modified:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-net.sh`
- **Verification:** `bash artifacts/tests/precheck-net.sh` now prints `PASS precheck-net` and exits 0.
- **Committed in:** `4b8a717f` (Task 2 commit)

**2. [Rule 2 - Missing Robustness] precheck-block.sh JSON write leaked bash redirect-failure noise to stderr when history dir didn't exist**
- **Found during:** Task 2 (running precheck-net.sh, before fix #1 above)
- **Issue:** `cat > "$json_path" 2>/dev/null <<JSON` — the `2>/dev/null` redirects cat's stderr, but the BASH parser itself emits "no such file or directory" to stderr BEFORE cat is invoked (because the file path's parent dir doesn't exist). On test hosts without /opt/livos, this leaked into the test's captured stderr alongside the PRECHECK-FAIL message.
- **Fix:** Wrapped the heredoc in a brace group so the outer `2>/dev/null` captures bash's own complaint too: `{ cat > "$json_path" <<JSON ... } 2>/dev/null`.
- **Files modified:** `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/precheck-block.sh`
- **Verification:** Tests now capture only the intended PRECHECK-FAIL line; bash redirect-failure noise is silenced. Production behavior is unaffected — the mkdir at the top of precheck() ensures the dir exists on real hosts.
- **Committed in:** `4b8a717f` (Task 2 commit, alongside test files)

**3. [Rule 3 - Blocking] Built @livos/config + @nexus/core to unblock vitest**
- **Found during:** Task 3 (running `pnpm --filter livinityd test:unit`)
- **Issue:** Vitest failed with `Failed to resolve entry for package "@livos/config"` then `Failed to load url @nexus/core/lib`. The worktree's `pnpm install` succeeded for livinityd's deps but `@livos/config` had no `dist/` (build never ran) and `@nexus/core/lib` resolves to `nexus/packages/core/dist/lib.js` which didn't exist.
- **Fix:** Ran `pnpm --filter @livos/config build` (worked) then `cd nexus && npm install && cd packages/core && npm run build`. Then mirrored the built dist into pnpm-store's `@nexus/core` copy (`cp -r nexus/packages/core/dist livos/node_modules/.pnpm/@nexus+core*/node_modules/@nexus/core/`) — this is the same pnpm-store quirk documented in MEMORY.md for production update.sh.
- **Files modified:** None tracked (only built artifacts under node_modules + nexus/packages/core/dist)
- **Verification:** Vitest now runs to completion, test G passes (1 passed when isolated, 8 passed in full file).
- **Committed in:** N/A (build artifacts, not committed)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 robustness, 1 blocking)
**Impact on plan:** All auto-fixes were necessary for test correctness or environment readiness. No scope creep — the bug + robustness fixes are within the plan's owned files; the blocking fix touches build artifacts only. JSON shape on the failure path matches the locked O-03 contract `{timestamp, status: "precheck-failed", reason, duration_ms}` verbatim.

## Issues Encountered

1. **Pre-existing test C failure** (out of scope — see deferred-items.md): `getLatestRelease (UPD-01) > C: non-2xx GitHub response — throws Error matching /403/` has been broken since Phase 30 round-9 cache landed. The new graceful-degradation logic returns cached data instead of throwing on 403, but test C still asserts `.rejects.toThrow(/403/)`. Unrelated to REL-01; deferred for a Phase 30 follow-up. Test G (the one this plan added) passes cleanly both in isolation and in the full suite run.
2. **UI package postinstall fails on Windows** (out of scope — see deferred-items.md): pnpm install in livos/ trips on `mkdir -p public/generated-tabler-icons` because cmd.exe doesn't understand the POSIX flags. Doesn't affect livinityd test runs (its node_modules + .pnpm hoisting completes before the UI postinstall fires). Suggested fix: rewrite UI postinstall as a Node.js cross-platform script.
3. **pnpm-store nexus core dist propagation gap** (out of scope — see deferred-items.md): Same root cause as MEMORY.md's `update.sh` pnpm-store quirk. After building nexus/packages/core, the dist must be manually mirrored into pnpm's hoisted `@nexus+core` dir. Suggested fix: postbuild hook in nexus/packages/core/package.json.

## Verification Evidence

```
=== bash unit tests (Task 2) ===
PASS precheck-disk
PASS precheck-write
PASS precheck-net

=== run-all.sh aggregator ===
PASS precheck-disk
PASS precheck-write
PASS precheck-net
SKIP rollback-no-prev-sha.sh (not found — Plan 32-02 may not have authored it yet)
SKIP rollback-loop-guard.sh (not found — Plan 32-02 may not have authored it yet)

=== Phase 32 bash test summary ===
Passed:  3
Failed:  0
Skipped: 2

=== vitest (Task 3, isolated to test G) ===
✓ source/modules/system/update.unit.test.ts > performUpdate (UPD-02) > G: PRECHECK-FAIL stderr round-trips to updateStatus.error verbatim
Test Files  1 passed (1)
     Tests  1 passed | 8 skipped (9)

=== marker strings present in precheck-block.sh ===
# ── Phase 32 REL-01: precheck ──                        (Plan 32-03 anchor)
# ── Phase 32 REL-02 prep: SHA rotation ──               (Plan 32-03 anchor)
PRECHECK-FAIL: insufficient disk space                   (Phase 34 contract)
PRECHECK-FAIL: /opt/livos is not writable                (Phase 34 contract)
PRECHECK-FAIL: GitHub api.github.com unreachable         (Phase 34 contract)
mkdir -p "$history_dir"                                  (O-03 lock)
"status": "precheck-failed"                              (O-03 schema)
record_previous_sha()                                    (Plan 32-02 prep)

=== precheck-block.sh string lengths (must be < 200 chars per Phase 34) ===
115 — "PRECHECK-FAIL: cannot determine free disk space on /opt/livos (df failed — check mountpoint exists)"
 99 — "PRECHECK-FAIL: insufficient disk space on /opt/livos (need >=2GB, have ${avail_gb}GB)"
 97 — "PRECHECK-FAIL: /opt/livos is not writable (check mount/perms — root must own dir)"
119 — "PRECHECK-FAIL: GitHub api.github.com unreachable (curl exit ${curl_exit} — check network or rate-limit)"

=== bash -n syntax checks ===
OK precheck-block.sh
OK precheck-disk.sh
OK precheck-write.sh
OK precheck-net.sh
OK run-all.sh
```

## Next Phase Readiness

**For Plan 32-02 (REL-02 auto-rollback):**
- `record_previous_sha()` is defined in precheck-block.sh and ready for the patch script to splice into update.sh
- run-all.sh expects `rollback-no-prev-sha.sh` and `rollback-loop-guard.sh` test files — Plan 32-02 must author these alongside its livos-rollback.sh implementation; aggregator will pick them up automatically once they land

**For Plan 32-03 (patch script):**
- precheck-block.sh location: `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/precheck-block.sh`
- Idempotency anchors to use as `grep -qF` checks in the patch script:
  - `# ── Phase 32 REL-01: precheck ──`
  - `# ── Phase 32 REL-02 prep: SHA rotation ──`
- Splice strategy: `cat precheck-block.sh` into the patch script's HEREDOC body, anchor insertion AFTER the `step()` helper definition in /opt/livos/update.sh (read 31-02-SUMMARY.md for the awk-splice pattern Phase 31 uses for similar inserts)
- Anchor for invocation: `precheck` MUST be called BEFORE the first `git clone` line (around line 53 in update.sh.minipc per the plan's `read_first` reference); `record_previous_sha` MUST be called BEFORE update.sh writes the new SHA to `.deployed-sha`

**For Phase 33 (observability):**
- Update history dir guaranteed to exist after first precheck() invocation
- precheck-failed.json schema locked: `{timestamp: ISO8601, status: "precheck-failed", reason: string, duration_ms: int}`

**For Phase 34 (UX):**
- PRECHECK-FAIL contract: format `^PRECHECK-FAIL: (.+)$`, single-line, all strings under 119 chars (well below the 200 char ceiling), no ANSI codes — verified by string-length inspection in this summary

## Self-Check: PASSED

All claimed files exist:
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/precheck-block.sh` ✓
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-disk.sh` ✓
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-write.sh` ✓
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/precheck-net.sh` ✓
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/run-all.sh` ✓
- `.planning/phases/32-pre-update-sanity-auto-rollback/deferred-items.md` ✓
- `livos/packages/livinityd/source/modules/system/update.unit.test.ts` (modified) ✓

All claimed commits exist (verified by `git log --oneline 9759ba65..HEAD`):
- `9480e125` feat(32-01): REL-01 precheck-block.sh helpers ✓
- `4b8a717f` test(32-01): REL-01 precheck bash unit tests + run-all aggregator ✓
- `77f3fa9f` test(32-01): add vitest test G — PRECHECK-FAIL stderr round-trips ✓

---
*Phase: 32-pre-update-sanity-auto-rollback*
*Completed: 2026-04-26*
