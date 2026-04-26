---
phase: 32-pre-update-sanity-auto-rollback
plan: 02
subsystem: infra
tags: [systemd, bash, rollback, watchdog, oneshot, restartmode-direct, crash-loop, observability, rel-02]

# Dependency graph
requires:
  - phase: 31-update-sh-build-pipeline-integrity
    provides: ".deployed-sha file pattern, verify_build helper shape, multi-dir nexus core dist-copy loop, fail-loud exit conventions"
  - phase: 30
    provides: "/opt/livos/.deployed-sha file (current SHA), update.sh deploy entrypoint, idempotent SSH-applied patch script precedent"
provides:
  - "auto-rollback.conf systemd drop-in (StartLimit + OnFailure + RestartMode=direct)"
  - "livos-rollback.service oneshot unit definition (no OnFailure, no Requires — hard-stop on failure)"
  - "livos-rollback.sh full bash orchestrator (loop guard + prev-sha read + inline precheck + clone+checkout + rsync+install+build + multi-dir dist-copy + JSON history write + service restart + lock cleanup)"
  - "rollback-no-prev-sha.sh + rollback-loop-guard.sh — 2 bash unit tests proving abort paths"
  - "Locked update-history JSON shape for Phase 33 OBS-02 to consume: {timestamp, status: 'rolled-back', from_sha, to_sha, reason: '3-crash-loop', duration_ms, log_path}"
affects: [phase-32-03, phase-33, phase-34]

# Tech tracking
tech-stack:
  added:
    - "systemd RestartMode=direct (v254+) — fixes Ubuntu 24.04 / systemd 255 OnFailure misfire-on-every-restart trap"
    - "systemd StartLimitIntervalSec/StartLimitBurst — crash-burst detection over 5min/3-attempt window"
    - "systemd OnFailure= → oneshot pattern for self-healing"
  patterns:
    - "Loop-guard via .rollback-attempted lock file: touch on entry, rm only on success — persists on failure for operator review"
    - "Inline-duplicate (don't source) precheck guards in rollback orchestrator — hard isolation from the SHA being rolled back from"
    - "JSON history rows in /opt/livos/data/update-history/ as IPC channel between root-owned bash and Phase 33 livinityd reader"
    - "sed-rewrite of /opt/livos paths to sandbox dir for unit-testing root-targeting bash scripts on dev machine"

key-files:
  created:
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/auto-rollback.conf (17 lines)"
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.service (23 lines)"
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh (241 lines)"
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-no-prev-sha.sh (68 lines)"
    - ".planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-loop-guard.sh (66 lines)"
  modified: []

key-decisions:
  - "O-01 confirmed: rollback uses git clone --no-checkout + git fetch --depth=1 origin <prev-sha> + checkout, with --unshallow fallback when depth-1 fetch is rejected"
  - "O-02 confirmed: rollback restarts ONLY 4 services — livos liv-core liv-worker liv-memory (Caddy + Cloudflare untouched)"
  - "RestartMode=direct lives in [Service] section of the drop-in; StartLimit* + OnFailure live in [Unit] — wrong-section placement is a silent footgun (verified per systemd man page)"
  - "livos-rollback.service has NO OnFailure= and NO Requires=livos.service — both would create infinite-loop / circular-dep risks (CRITICAL design constraint)"
  - "Inline duplicate of precheck guards (df + mktemp + curl) in livos-rollback.sh rather than sourcing precheck-block.sh — R-04 mitigation: rollback must work even if the SHA we're rolling back from broke /opt/livos/lib/"
  - "Test sandbox strategy: sed-rewrite '/opt/livos' → '$SANDBOX' on a copy of livos-rollback.sh and run the patched copy — abort paths execute before any /opt/* state mutation, so no root needed"
  - ".rollback-attempted lock NEVER auto-clears (T-32-07 mitigation) — operator must rm to retry; prevents loop-of-rolling-back-to-also-broken-SHA"

patterns-established:
  - "systemd v255 OnFailure trap: must combine RestartMode=direct + StartLimitBurst to get 'fire only when burst exhausted' semantics. Without RestartMode=direct, OnFailure fires on every restart cycle"
  - "Bash test sandbox via sed-rewrite: lets you exercise root-targeting scripts' early-abort paths without mocking /opt/* — works on Windows/macOS dev machines"
  - "Locked JSON history schema as cross-phase contract: Phase 32 writes rolled-back rows; Phase 33 OBS-01 will write success/failed rows; Phase 33 OBS-02 reads all of them"

requirements-completed: [REL-02]

# Metrics
duration: ~12min
completed: 2026-04-26
---

# Phase 32 Plan 02: REL-02 Auto-Rollback Machinery Summary

**systemd-level auto-rollback safety net — crash-loop-burst detection (3 starts/5min) triggers a oneshot bash orchestrator that reverts /opt/livos/.deployed-sha to the previous SHA via git clone+checkout, full rsync+build pipeline, locked-schema JSON history write, and 4-service restart — all guarded by a never-auto-clearing lock file and inline-duplicated precheck.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-26 (Plan 32-02 execution)
- **Completed:** 2026-04-26
- **Tasks:** 3 / 3
- **Files created:** 5 (3 systemd-related artifacts + 2 bash unit tests)

## Accomplishments

- **systemd watchdog wiring (Task 1):** `auto-rollback.conf` drop-in delivers the CRITICAL `RestartMode=direct` directive in `[Service]` plus `StartLimitIntervalSec=300` + `StartLimitBurst=3` + `OnFailure=livos-rollback.service` in `[Unit]`. Without `RestartMode=direct`, systemd 255+ would fire `OnFailure=` on every restart cycle (Ubuntu 24.04 trap per 32-RESEARCH).
- **Oneshot unit (Task 1):** `livos-rollback.service` is `Type=oneshot`, `User=root`, `TimeoutStartSec=600`, with deliberate absence of `OnFailure=` (rollback failure = hard-stop) and `Requires=livos.service` (would create circular dep). Both omissions documented inline in the unit body so future agents don't add them back.
- **Full rollback orchestrator (Task 2):** `livos-rollback.sh` (241 lines) covers all 13 flow steps from the plan — loop guard, prev-sha read with empty-string guard, inline precheck (df + mktemp + curl 5s), `git clone --no-checkout` + `git fetch --depth=1 origin <prev-sha>` with `--unshallow` fallback (per O-01), full rsync + pnpm install + per-package build with `verify_build` asserts (mirrors Phase 31 BUILD-01), multi-dir `@nexus+core*` dist-copy (mirrors Phase 31 BUILD-02), `.deployed-sha` overwrite, locked-schema `<iso-ts>-rollback.json` write, `systemctl reset-failed` + restart of exactly 4 services (per O-02), and lock cleanup ONLY on success path.
- **2 bash unit tests passing (Task 3):** Both `rollback-no-prev-sha.sh` and `rollback-loop-guard.sh` execute the abort paths in a sed-rewritten sandbox (no root needed, no real /opt/* mutated), assert exit 1 + correct `[ROLLBACK-ABORT]` log marker + that `.deployed-sha` was NOT created (proves abort fired before any work). Both tests pass on Windows Git Bash.

## Task Commits

Each task was committed atomically with `--no-verify` (parallel-executor protocol):

1. **Task 1: Author auto-rollback.conf drop-in + livos-rollback.service unit** — `cac1736e` (feat)
2. **Task 2: Author livos-rollback.sh orchestrator** — `c518556a` (feat)
3. **Task 3: Author 2 bash unit tests for rollback abort cases** — `94962bc5` (test)

_Note: TDD discipline collapsed RED+GREEN into single commits because the artifacts under test (systemd config files, abort stanzas) are config + early-exit code where RED-only commits would land non-compiling/non-executing files. RED was satisfied by pre-write file-absence checks and post-write grep verification (per the plan's `<verify><automated>` blocks)._

## Files Created/Modified

### Created (this plan owns)

- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/auto-rollback.conf` (17 lines) — systemd drop-in: `[Unit]` StartLimitIntervalSec/StartLimitBurst/OnFailure + `[Service]` RestartMode=direct. Idempotency marker: `# ── Phase 32 REL-02: livos.service drop-in ──`.
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.service` (23 lines) — oneshot unit: ExecStart=/opt/livos/livos-rollback.sh, Type=oneshot, User=root, TimeoutStartSec=600, no OnFailure, no Requires. Idempotency marker: `# ── Phase 32 REL-02: livos-rollback.service oneshot ──`.
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh` (241 lines, mode 0755) — full bash rollback orchestrator. Idempotency marker: `# ── Phase 32 REL-02: livos-rollback.sh ──`.
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-no-prev-sha.sh` (68 lines) — bash unit test for `.deployed-sha.previous` absent abort path.
- `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-loop-guard.sh` (66 lines) — bash unit test for `.rollback-attempted` lock-exists abort path.

### Modified

None — Plan 32-02 is purely additive new artifacts.

### Files NOT touched (owned by sibling worktrees / future plans)

- `precheck-block.sh`, `precheck-failed-history.sh`, `precheck-*.sh tests`, `tests/run-all.sh` — owned by Plan 32-01 (sibling worktree, will merge via orchestrator).
- `phase32-systemd-rollback-patch.sh` — owned by Plan 32-03 (will compose all artifacts via HEREDOC).

## Decisions Made

### Verifying Open Question locks against implementation

| Open Question | Lock | How implemented in livos-rollback.sh |
|---------------|------|--------------------------------------|
| O-01: rollback git clone strategy | `git clone --no-checkout` + `git fetch --depth=1 origin <prev-sha>`, fall back to `--unshallow` if depth-1 rejected | Lines 95-102: `git clone --no-checkout`, then `if ! git fetch --depth=1 ... 2>/dev/null; then git fetch --unshallow; fi`, then `git checkout "$PREV_SHA"` |
| O-02: which services to restart | livos liv-core liv-worker liv-memory only (Caddy + Cloudflare untouched) | Line 218: `systemctl restart livos liv-core liv-worker liv-memory` (literal — no variable expansion that could leak other service names) |
| O-04: 5s curl timeout for inline precheck | 5s budget; revisit Phase 33 if logs show >1% timeouts | Line 89: `curl -fsI -m 5 https://api.github.com/repos/utopusc/livinity-io >/dev/null 2>&1` |
| O-05: Server4 systemd version handling | Plan 32-02 just authors v254+-assuming unit; degraded variant logic is patch-script-side (Plan 32-03) | Confirmed — auto-rollback.conf ships `RestartMode=direct` unconditionally; Plan 32-03 will gate install on `systemctl --version >= 254` |

### Test-strategy decision (sed-rewrite sandbox vs. function extraction)

Two options for unit-testing livos-rollback.sh's abort paths:

| Approach | Pros | Cons | Chosen? |
|----------|------|------|---------|
| Extract abort-check stanzas into a sourced helper, test the helper directly | Pure-function testing; no script copies | Requires refactoring livos-rollback.sh to source a helper file (extra deploy artifact); helper file becomes a new dependency to install | No |
| **sed-rewrite `/opt/livos` → sandbox dir on a copy of livos-rollback.sh, run the patched copy** | No refactor of livos-rollback.sh; no new artifacts; works on Windows/macOS dev machines; abort paths execute before any state mutation | sed substitution catches every `/opt/livos` literal — relies on the script's path constants being the only `/opt/livos` references | **Yes** |

The sed-rewrite approach also matches the pattern Plan 32-01 used for its precheck tests (per the plan's `<read_first>` reference to `tests/precheck-disk.sh`), so test conventions stay consistent across REL-01 and REL-02.

### Inline-duplicate precheck (R-04 mitigation)

`livos-rollback.sh` duplicates the disk/writable/network precheck guards inline (lines 78-91) rather than sourcing `precheck-block.sh`. Rationale per 32-RESEARCH R-04: if the broken SHA we're rolling back FROM corrupted `/opt/livos/lib/precheck-block.sh`, sourcing it would fail and the rollback would never start. Hard isolation = inline duplication. Cost: ~14 lines of duplicated bash. Benefit: rollback survives any /opt/livos breakage that doesn't kill /opt/livos itself.

### Lock-file lifecycle (T-32-07 mitigation)

`.rollback-attempted` is touched as the FIRST action after the loop-guard check (line 50) and removed ONLY on the success path (line 224, immediately before final `[ROLLBACK-OK]` echo). The lock NEVER auto-clears — operator must `sudo rm /opt/livos/.rollback-attempted` to retry. This deliberately prevents the rollback-of-rollback infinite loop scenario where the previous SHA is also broken.

## Deviations from Plan

### Scope-boundary observation: run-all.sh aggregator depends on Plan 32-01

**Found during:** Task 3 verification

**Issue:** The plan's `<verify><automated>` step for Task 3 includes `bash .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/run-all.sh 2>&1 | grep -qF 'Passed:  5'`. However, `run-all.sh` is owned by Plan 32-01 (sibling worktree per the `<worktree_branch_check>` note in the executor prompt — Plan 32-01's commits are on a separate worktree branch and have NOT been merged into this worktree's base).

**Fix / Disposition:** No code change in this plan. The 2 tests Plan 32-02 owns both PASS independently (`PASS rollback-no-prev-sha`, `PASS rollback-loop-guard`). The `run-all.sh` aggregator's `Passed:  5` (3 from Plan 32-01 + 2 from Plan 32-02) check will only succeed AFTER the orchestrator merges both Wave 1 worktrees. This is a known cross-plan dependency, not a Plan 32-02 defect.

**Verification of standalone test PASS (within this worktree):**

```
$ bash .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-no-prev-sha.sh
PASS rollback-no-prev-sha
$ bash .planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-loop-guard.sh
PASS rollback-loop-guard
```

### Path-resolution edge case during initial Write tool call (resolved before commit)

**Found during:** Task 1

**Issue:** The first attempt at `Write`-ing `auto-rollback.conf` used `C:\Users\hello\Desktop\Projects\contabo\livinity-io\.planning\...` (the main checkout path), not the worktree path `C:\Users\hello\Desktop\Projects\contabo\livinity-io\.claude\worktrees\agent-a00c29724dc20cd09\.planning\...`. The file was created in the wrong location.

**Fix:** Removed the misplaced files from the main checkout, re-issued `Write` with the full worktree-prefixed absolute path. Both files landed in the correct worktree location and were verified via grep before commit.

**Files cleaned up:** None remain stranded — the Bash `rm -f` cleanup of the misplaced files was confirmed via `ls`.

**Verification:** `git log` shows commits land in this worktree only; `find` of the artifacts directory confirms only the intended 5 files exist in the worktree.

---

**Total deviations:** 0 code-affecting (1 cross-plan scope observation + 1 transient path-resolution issue, both resolved without modifying plan-owned artifacts)
**Impact on plan:** None on artifact correctness or completeness. The cross-plan dependency on Plan 32-01's `run-all.sh` is by design (Wave 1 = parallel, then merge).

## Issues Encountered

- Windows Git Bash + `Write` tool path resolution surprise (above). Resolved on first detection; future Write calls in this session used the full worktree-prefixed path.
- Line-ending warnings (`LF will be replaced by CRLF`) on commit — informational only; .gitattributes handling is project-wide and not Plan 32-02's concern.

## TDD Gate Compliance

Plan 32-02 has `tdd="true"` on all 3 tasks (per the plan frontmatter). The TDD ceremony for this plan:

- **Task 1 (config files):** RED = pre-write file-absence check (passed — files absent). GREEN = file write + grep verification (passed). No RED commit because the "test" is the grep verification block in the plan's `<verify>` — there's no executable test code to commit separately for static config files. Compliance is verified by post-write grep + bash-syntax checks.
- **Task 2 (orchestrator script):** RED = pre-write file-absence check (passed). GREEN = file write + 14 grep assertions + `bash -n` (passed). The orchestrator's behavior is exercised by Task 3's bash unit tests (which serve as the integration-test layer for Task 2's abort paths).
- **Task 3 (bash unit tests):** RED = test files absent (passed). GREEN = file write + run tests against Task 2's livos-rollback.sh (both PASS). The tests verify Task 2's abort behavior — closing the TDD loop.

This is the same TDD pattern Plan 32-01 follows for its parallel precheck artifacts (config + bash + tests trio).

## Next Phase Readiness

**Ready for Plan 32-03 (REL-02 patch-script + SSH-apply):**

Plan 32-03 will compose the 3 systemd artifacts into `phase32-systemd-rollback-patch.sh` via HEREDOC. The idempotency markers it should grep when patching:

| Artifact | Marker (grep -qF anchor) | Install target |
|----------|--------------------------|----------------|
| `auto-rollback.conf` | `# ── Phase 32 REL-02: livos.service drop-in ──` | `/etc/systemd/system/livos.service.d/auto-rollback.conf` |
| `livos-rollback.service` | `# ── Phase 32 REL-02: livos-rollback.service oneshot ──` | `/etc/systemd/system/livos-rollback.service` |
| `livos-rollback.sh` | `# ── Phase 32 REL-02: livos-rollback.sh ──` | `/opt/livos/livos-rollback.sh` (mode 0755, root) |

Plan 32-03 must also:
- Run `systemctl --version | head -1 | awk '{print $2}'` and refuse to install the drop-in if `< 254` (per O-05)
- Run `systemctl daemon-reload` after installing the .service + .conf
- Run `systemctl enable livos-rollback.service` so a reboot keeps the install state
- Mirror Phase 31 patch-script's backup-then-syntax-check-then-restore safety net

**Ready for Phase 33 (OBS-02 update-history reader):**

The locked JSON shape Plan 32-02 writes is verbatim what Phase 33 OBS-02 will read:

```json
{
  "timestamp": "2026-04-26T14:32:18Z",
  "status": "rolled-back",
  "from_sha": "e518570f...",
  "to_sha": "21f1e095...",
  "reason": "3-crash-loop",
  "duration_ms": 87432,
  "log_path": "/opt/livos/data/update-history/2026-04-26T14-32-18Z-rollback.log"
}
```

Phase 33 OBS-01 will retro-add `success` / `failed` rows to the same dir. Status enum: `success | failed | rolled-back | precheck-failed`.

**Ready for Phase 34 (UX-04 update-history surface):**

The `[ROLLBACK-...]` log markers in livos-rollback.sh's stdout (which is teed to `<ts>-rollback.log` AND streamed to journalctl) give Phase 34's UX surface clean grep anchors for filtering: `[ROLLBACK]`, `[ROLLBACK-ABORT]`, `[ROLLBACK-VERIFY]`, `[ROLLBACK-OK]`.

## Self-Check: PASSED

Verified all claims:

**Files exist:**
- ✓ `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/auto-rollback.conf`
- ✓ `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.service`
- ✓ `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/livos-rollback.sh`
- ✓ `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-no-prev-sha.sh`
- ✓ `.planning/phases/32-pre-update-sanity-auto-rollback/artifacts/tests/rollback-loop-guard.sh`

**Commits exist (in this worktree branch):**
- ✓ `cac1736e` — Task 1 (auto-rollback.conf + livos-rollback.service)
- ✓ `c518556a` — Task 2 (livos-rollback.sh)
- ✓ `94962bc5` — Task 3 (2 bash unit tests)

**Verifications pass:**
- ✓ `bash -n livos-rollback.sh` clean
- ✓ `bash -n` clean on both test files
- ✓ All 14 grep assertions for livos-rollback.sh pass
- ✓ All 12 grep assertions for systemd unit files pass (positive + negative)
- ✓ Both bash unit tests PASS standalone (run-all.sh aggregator deferred to post-merge)

---
*Phase: 32-pre-update-sanity-auto-rollback*
*Plan: 02*
*Completed: 2026-04-26*
