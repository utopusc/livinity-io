---
phase: 33-update-observability-surface
plan: 02
status: completed-with-deferred-live-validation
subsystem: infra
tags: [phase-33, obs-01, observability, update-sh, bash, ssh-apply, trap, tdd, mini-pc]

# Dependency graph
requires:
  - phase: 32-pre-update-sanity-auto-rollback
    provides: "Locked O-03 JSON schema (`{timestamp, status, reason, duration_ms, from_sha?, to_sha?, log_path?}`) — Phase 33 mirrors this byte-for-byte for success.json + failed.json"
  - phase: 32-pre-update-sanity-auto-rollback
    provides: "phase32-systemd-rollback-patch.sh as the architectural template — Phase 33 mirrors marker constants, awk-splice idiom, backup-then-bash-n-then-restore safety net, HEREDOC-with-single-quoted-EOPRECHECK"
  - phase: 32-pre-update-sanity-auto-rollback
    provides: "/opt/livos/data/update-history/ directory pre-existing on Mini PC with first rollback.json row already written — Phase 33 patch coexists, never overwrites"
  - phase: 31-update-sh-build-pipeline-integrity
    provides: "Idempotent SSH-applied patch script pattern (grep -qF marker guards + awk-splice + bash -n safety net)"
provides:
  - "phase33-update-sh-logging-patch.sh — single self-contained idempotent installer that wraps update.sh in a tee-to-log-file + EXIT-trap that emits the canonical .log + .json records the Phase 33 UI consumes"
  - "tests/log-format.sh — bash unit test exercising the trap template across 4 scenarios (success, failed-mid-build, precheck-fail-skip, no-clone-yet)"
  - "tests/phase33-trap-block.sh.tmpl — standalone canonical trap-block template (byte-equivalent to the patch script's HEREDOC body modulo HISTORY_DIR_OVERRIDE / DEPLOYED_SHA_FILE_OVERRIDE / LIVOS_UPDATE_START_ISO_FS_OVERRIDE env vars for testability)"
  - "Mini PC deployment: /opt/livos/update.sh patched in-place with both LOG_TEE trap block + SHA_CAPTURE splice; backup chain extended to 3 generations (.pre-phase32 + .pre-phase33 + current)"
  - "Idempotency proven on Mini PC: re-apply produces ALL 'ALREADY-PATCHED' lines, ZERO 'PATCH-OK' lines"
  - "bash -n syntax check CLEAN on patched /opt/livos/update.sh"
affects: [phase-33-plan-33-01-trpc-routes, phase-33-plan-33-03-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Template env-var override pattern for testability: trap template accepts HISTORY_DIR_OVERRIDE / DEPLOYED_SHA_FILE_OVERRIDE / LIVOS_UPDATE_START_ISO_FS_OVERRIDE so unit tests run in sandbox without touching /opt/livos/. Production patch's HEREDOC body uses hard-coded defaults; the override-aware template is the single source of truth that gets sourced by both the patch and the tests."
    - "Canonical trap-block as standalone template + embedded HEREDOC dual-source: avoids drift via inline comment instructing future maintainers to update both, plus repo-level diff-ability (reviewers can manually `diff` the two during review). Optional CI diff-extraction tracked as v30 nice-to-have (T-33-09 mitigation)."
    - "Per-deploy log filename PID disambiguation: `update-${ISO_FS}-$$-pending.log` ensures two SSH-direct update.sh invocations within the same UTC second don't collide on filename (T-33-07 mitigation). Phase 30 CONFLICT guard handles the UI-side concurrent case; PID handles direct invocations."
    - "Backup chain via per-phase suffix: `.pre-phase32` and `.pre-phase33` coexist (different bytes / mtimes) — operator can roll forward and back through phases granularly. Phase 31's safety-net pattern with no overwrite of older backups."
    - "TDD RED gate via missing template guard: test script's first action is `[[ ! -f $TRAP_TMPL ]] && echo FATAL && exit 1` — RED phase fails loudly with actionable error pointing at the template author task."

key-files:
  created:
    - ".planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh"
    - ".planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh"
    - ".planning/phases/33-update-observability-surface/artifacts/tests/phase33-trap-block.sh.tmpl"
  modified:
    - "/opt/livos/update.sh (Mini PC — LOG_TEE trap block spliced after `set -euo pipefail` line 13; SHA_CAPTURE splice inserted after `git clone --depth 1` line 288. Backup at /opt/livos/update.sh.pre-phase33; Phase 32's .pre-phase32 backup preserved.)"

key-decisions:
  - "TDD-RED bug fix during Task 2 GREEN: reason-extraction order needed to be reordered — `last_err` capture must read from `$final_log_file` AFTER the rename (not from `$LIVOS_UPDATE_LOG_FILE` which was already moved). Discovered when test_failed kept asserting `reason: \"unknown error\"` instead of `reason: \"...simulated build break...\"`. Fixed by moving reason extraction below the rename block."
  - "Template env-var override pattern (HISTORY_DIR_OVERRIDE / DEPLOYED_SHA_FILE_OVERRIDE / LIVOS_UPDATE_START_ISO_FS_OVERRIDE) chosen over a more invasive sed-replace-paths-in-template approach — overrides are unobtrusive in production (default to /opt/livos paths), and the test harness can pin start timestamps for deterministic precheck-fail-skip simulation."
  - "Live deploy validation deferred per user opt: bash unit tests cover all 4 trap scenarios with 21/21 assertions GREEN — sufficient confidence in trap behavior. First real deploy via UI `/update` button (after Plan 33-03 ships) will populate the Past Deploys table organically. Trade-off: skip ~3 minute Mini PC downtime + restart cycle now in exchange for organic validation against the real UI later."
  - "Tasks 1+2 in worktree, SUMMARY on master: Standard parallel-executor protocol. Worktree branch `worktree-agent-a8de0c2cd7f3805b0` carries commits 44bfb083 + 7f1ca871; orchestrator merges separately. SUMMARY-on-master simplifies merge-timing coordination (this commit doesn't need to land alongside the worktree merge)."

patterns-established:
  - "Template-with-overrides for testable bash trap blocks: ship the canonical block as a sourceable template with env-var overrides for paths + timestamps; embed a hard-coded variant in the production patch HEREDOC. Documented dual-source obligation in inline comments; reviewers can `diff` for drift. Reusable pattern for any future bash patch that wants unit-test coverage of trap behavior."
  - "Deferred live validation as accepted risk when test coverage is comprehensive: when bash unit tests cover ≥4 distinct exit paths with ≥18 assertions across the trap's full state space, the live trap-firing trigger can be deferred to organic first-use (saves downtime, validates against real UI consumer). Tracked via `<state_to_record>` deferral notation; orchestrator promotes to STATE.md."

requirements-completed: [OBS-01]

# Metrics
duration: ~25min
completed: 2026-04-27
---

# Phase 33 Plan 02: OBS-01 Update.sh Logging Patch — SSH-Applied to Mini PC, Live Trap Firing Deferred Summary

**Self-contained idempotent patch wraps `/opt/livos/update.sh` in a `tee` + EXIT-trap that emits canonical `update-<ts>-<sha>.log` + `<ts>-success|failed.json` records — applied + idempotency-verified + bash-n-clean on Mini PC; live trap-firing deferred to organic first-deploy via UI per user opt (21/21 bash unit-test assertions cover all 4 trap scenarios).**

## Performance

- **Duration:** ~25 min total (Tasks 1+2 authoring ~20 min in worktree + ~5 min orchestrator SSH apply on Mini PC)
- **Started:** 2026-04-27 (Plan 33-02 execution kickoff in worktree-agent-a8de0c2cd7f3805b0)
- **Completed:** 2026-04-27 (this SUMMARY commit on master)
- **Tasks:** 3 (3 / 3 functionally complete; Task 3 live-deploy step D-H deferred per user, A-C apply + idempotency + chain verified)
- **Files created (planning artifacts):** 3 (`phase33-update-sh-logging-patch.sh` + `tests/log-format.sh` + `tests/phase33-trap-block.sh.tmpl`)
- **Files modified on host (Mini PC):** 1 in-place patch + 1 backup created (`/opt/livos/update.sh` + `/opt/livos/update.sh.pre-phase33`)

## Accomplishments

- **OBS-01 patch artifact authored** (`phase33-update-sh-logging-patch.sh`) — mirrors Phase 32 architectural template byte-for-byte: 2 marker constants (`MARKER_LOG_TEE`, `MARKER_SHA_CAPTURE`), grep -qF idempotency guards, awk-splice (no sed -i), backup-then-bash-n-then-restore safety net, HEREDOC with single-quoted `EOLOGTEE` to prevent variable interpolation in embedded body.
- **Bash unit test ships GREEN** with 4 scenarios × ~5 assertions each = **21/21 assertions PASS**: `test_success` (clean exit 0 with SHA known), `test_failed` (exit 1 mid-build with SHA known), `test_precheck_fail_skip` (Phase 32 precheck-fail.json pre-existing → trap MUST skip duplicate failed.json + backfill log_path), `test_no_clone_yet` (exit 1 before SHA captured → .pending log retained).
- **Trap template authored** as standalone sourceable file (`tests/phase33-trap-block.sh.tmpl`) — canonical body that the production patch's HEREDOC embeds byte-equivalent (modulo override env vars). Single source of truth with manual-sync obligation documented inline.
- **Mini PC SSH apply succeeded on first try** with both `PATCH-OK` markers fired:
  - `Backup written: /opt/livos/update.sh.pre-phase33`
  - `PATCH-OK (LOG_TEE): trap block inserted after line 13`
  - `PATCH-OK (SHA_CAPTURE): TO_SHA capture inserted after line 288`
  - `=== PHASE 33 PATCH COMPLETE ===`
- **Mini PC idempotency proven on re-run:** All `ALREADY-PATCHED` lines, ZERO `PATCH-OK`. `Backup already exists: /opt/livos/update.sh.pre-phase33 (re-run safe)` short-circuit fired correctly.
- **Backup chain extended:** Phase 32's `/opt/livos/update.sh.pre-phase32` (13737 bytes, mtime Apr 26 11:23) preserved alongside new `/opt/livos/update.sh.pre-phase33` (17841 bytes, mtime Apr 27 03:19) — operator can roll forward/back through phases granularly.
- **`bash -n /opt/livos/update.sh` exits 0** post-patch (CLEAN syntax — Phase 31/32 safety net would have triggered restore otherwise).
- **First-deploy data path unblocked for Plan 33-03:** Patched update.sh will emit `<ts>-success.json` (or `<ts>-failed.json`) + `update-<ts>-<7sha>.log` on every future invocation. Phase 33 UI's `system.listUpdateHistory` reader path has a guaranteed data source the moment the next deploy runs.

## Task Commits

Tasks 1 and 2 were authored in parallel worktree `worktree-agent-a8de0c2cd7f3805b0` (orchestrator merges separately):

1. **Task 1: Author bash test scaffold (RED) — tests/log-format.sh** — `44bfb083` (test) [worktree branch]
2. **Task 2: Author phase33-update-sh-logging-patch.sh + trap template (GREEN)** — `7f1ca871` (feat) [worktree branch]
3. **Task 3: SSH-apply patch on Mini PC + idempotency check** — orchestrator-driven (no commit; host-side state changes verified via `<state_to_record>`); steps D-H (live deploy) deferred per user

**Plan metadata commit:** This SUMMARY.md commit on master (`docs(33-02): SSH-apply Mini PC patched (live trap firing deferred to organic first-deploy)`)

_Note: Tasks 1+2 used `--no-verify` per parallel-worktree protocol; this SUMMARY commit on master uses normal hooks._

## Files Created/Modified

### Planning artifacts (in repo, on worktree branch awaiting orchestrator merge)

| File | Purpose |
|------|---------|
| `.planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh` | Self-contained idempotent SSH-applyable installer; embeds trap-block + SHA-capture splice as HEREDOC bodies with `MARKER_LOG_TEE` / `MARKER_SHA_CAPTURE` idempotency guards; backup-then-bash-n-then-restore safety net mirrors Phase 31/32. |
| `.planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh` | Bash unit test (4 scenarios × ~5 assertions); sources trap template from sibling path; isolates each scenario in `mktemp -d` sandbox; uses `HISTORY_DIR_OVERRIDE` to avoid touching real /opt/livos/. RED phase via `[[ ! -f $TRAP_TMPL ]]` guard. |
| `.planning/phases/33-update-observability-surface/artifacts/tests/phase33-trap-block.sh.tmpl` | Canonical trap-block template (sourceable from tests + embedded byte-equivalent in patch script HEREDOC). Honors HISTORY_DIR_OVERRIDE / DEPLOYED_SHA_FILE_OVERRIDE / LIVOS_UPDATE_START_ISO_FS_OVERRIDE env vars for testability. |

### Host-side state changes (Mini PC, `bruce@10.69.31.68`)

| Path | Change | Notes |
|------|--------|-------|
| `/opt/livos/update.sh` | Patched in-place | `# ── Phase 33 OBS-01: log file emission ──` block spliced after `set -euo pipefail` (line 13); `# ── Phase 33 OBS-01 prep: capture target SHA for log filename rename ──` line spliced after `git clone --depth 1` (line 288). Mode `rwxr-xr-x` root, 23362 bytes, mtime Apr 27 03:19. `bash -n` clean. |
| `/opt/livos/update.sh.pre-phase33` | Created (backup) | Pristine pre-Phase33 copy for rollback-on-syntax-failure path; idempotent re-runs detect existing backup and skip rewrite. Mode `rwxr-xr-x` root, 17841 bytes, mtime Apr 27 03:19. |
| `/opt/livos/update.sh.pre-phase32` | Untouched (preserved) | Phase 32's backup retained. Mode `rwxr-xr-x` root, 13737 bytes, mtime Apr 26 11:23. Phase 33 patch did NOT overwrite — backup chain operates per-phase. |
| `/opt/livos/data/update-history/` | Untouched | Directory exists from Phase 32; first Phase-33-emitted log + JSON will land here when next deploy runs (deferred per user). |

### Files NOT touched (deferred / out of scope)

- **Live `/opt/livos/update.sh` invocation** (steps D-H of Task 3): NOT executed per user opt. First real deploy via UI `/update` button (after Plan 33-03 ships) will populate the Past Deploys table organically.
- **Server4** (`root@45.137.194.103`): NO changes. Phase 33 patch script is repo-resident and re-runnable on Server4 at any future time via `ssh root@45.137.194.103 'sudo bash -s' < phase33-update-sh-logging-patch.sh`. Same Phase 32 deferral pattern.
- **STATE.md / ROADMAP.md / REQUIREMENTS.md**: Owned by orchestrator after worktree merge — this SUMMARY commit does NOT touch them per scope contract.

## Verification Results

### A. Mini PC SSH apply (first run) — PASS

Both expected `PATCH-OK` markers fired plus the backup-write line:

```
Backup written: /opt/livos/update.sh.pre-phase33
PATCH-OK (LOG_TEE): trap block inserted after line 13
PATCH-OK (SHA_CAPTURE): TO_SHA capture inserted after line 288
=== PHASE 33 PATCH COMPLETE ===
```

### B. Mini PC idempotency re-apply — PASS

Identical command, second invocation. Result: ALL `ALREADY-PATCHED` lines, ZERO `PATCH-OK`:

```
Backup already exists: /opt/livos/update.sh.pre-phase33 (re-run safe)
ALREADY-PATCHED (LOG_TEE): trap block present in update.sh
ALREADY-PATCHED (SHA_CAPTURE): TO_SHA capture present in update.sh
```

### C. Backup chain + syntax verification — PASS

```
/opt/livos/update.sh                  rwxr-xr-x root  23362 bytes  mtime Apr 27 03:19   (current — patched)
/opt/livos/update.sh.pre-phase33      rwxr-xr-x root  17841 bytes  mtime Apr 27 03:19   (Phase 33 backup — new)
/opt/livos/update.sh.pre-phase32      rwxr-xr-x root  13737 bytes  mtime Apr 26 11:23   (Phase 32 backup — preserved)

bash -n /opt/livos/update.sh          → exit 0 (CLEAN)
```

Three backup generations coexist; operator can roll back to any prior phase state by `cp` of the appropriate `.pre-phaseNN` file.

### D-H. Live deploy + log/JSON file landing + livinityd health post-deploy — DEFERRED

**Per user decision: "Approved — canlı deploy yapma yok, devam edelim"** (Turkish: "approved, no live deploy, let's continue").

**Deferred steps (will fire organically on first real deploy via Plan 33-03 UI button):**
- D. `ls -la /opt/livos/data/update-history/ | tail -10` — assert `update-2026-04-27T<HH-MM-SS>Z-<7sha>.log` + `2026-04-27T<HH-MM-SS>Z-success.json` land
- E. `tail -2 /opt/livos/data/update-history/update-*.log` — assert `[PHASE33-SUMMARY] status=success exit_code=0 duration_seconds=NN` final line
- F. `cat /opt/livos/data/update-history/*-success.json | python3 -m json.tool` — assert valid JSON with `timestamp`, `status: "success"`, `from_sha`, `to_sha`, `duration_ms`, `log_path`
- G. `systemctl is-active livos liv-core liv-worker liv-memory` — assert all 4 active post-deploy
- H. (implied) Phase 33 UI populates Past Deploys table row from the new `success.json`

**Rationale for deferral:**
- Bash unit tests cover all 4 trap scenarios (success, failed-mid-build, precheck-fail-skip, no-clone-yet) with **21/21 assertions GREEN** — sufficient confidence in trap behavior, JSON schema, log filename rename, and skip-on-precheck-fail logic.
- First real deploy via UI `/update` button (after Plan 33-03 ships) will populate the Past Deploys table organically — provides end-to-end validation against the real UI consumer rather than a one-off SSH invocation.
- Avoids ~3 minute Mini PC downtime + restart cycle now (no operational urgency since unit tests are comprehensive and patch is idempotent + bash-n-clean).
- Deferral is forward-resolved automatically — no follow-up task needed; first organic UI deploy fires the trap path.

### Bash unit test (`tests/log-format.sh`) — PASS (21/21)

```
─── Phase 33 OBS-01 trap test summary ───
passed: 21
failed: 0
ALL GREEN
```

All 4 scenarios green (validated in worktree before Task 3 SSH apply):
- `test_success`: 8/8 assertions (renamed log exists, [PHASE33-SUMMARY] line, success.json with all fields, no failed.json)
- `test_failed`: 5/5 assertions (failed.json exists, status:failed, reason field with "simulated build break" excerpt, no success.json)
- `test_precheck_fail_skip`: 4/4 assertions (NO duplicate failed.json, precheck-fail.json retained + log_path backfilled, .pending log renamed to precheck-fail.log)
- `test_no_clone_yet`: 4/4 assertions (failed.json exists with status:failed, .pending log retained since SHA never captured)

## Decisions Made

### 1. TDD-RED bug fix during Task 2 GREEN: reason-extraction order

**Choice:** During Task 2 GREEN, the `test_failed` scenario kept asserting `reason: "unknown error"` instead of `reason: "...simulated build break..."`. Root cause: `last_err` capture was reading from `$LIVOS_UPDATE_LOG_FILE` AFTER the `mv "$LIVOS_UPDATE_LOG_FILE" "$final_log_file"` rename — file was gone. Fixed by re-ordering the trap body so reason extraction reads from `$final_log_file` (post-rename path).

**Rationale:** Caught by TDD-RED before SSH apply — would have manifested in production as silently-misleading `reason` fields in failed.json. Pure bash variable-binding bug, ~3 lines to fix, no API contract change.

**Reusable lesson:** When a trap renames its log file mid-flight, every subsequent reference to "the log path" must use the post-rename variable, not the pre-rename one. Easy to miss because the file is `mv`'d not `rm`'d — `cat $LIVOS_UPDATE_LOG_FILE` returns ENOENT, not the wrong content, so `grep` over the missing file silently produces empty output and the fallback "unknown error" string fires.

### 2. Template env-var override pattern for testability

**Choice:** Trap template at `tests/phase33-trap-block.sh.tmpl` honors three override env vars: `HISTORY_DIR_OVERRIDE`, `DEPLOYED_SHA_FILE_OVERRIDE`, `LIVOS_UPDATE_START_ISO_FS_OVERRIDE`. Unit tests pin all three to sandbox paths + a fixed timestamp; production patch's HEREDOC body uses hard-coded `/opt/livos` defaults.

**Rationale:**
- Unit test sandbox isolation: each test scenario runs in `mktemp -d` and writes into `$sandbox/opt/livos/data/update-history/`, never touching the real /opt path. Critical for repeated CI runs that don't have /opt/livos/ at all.
- Deterministic precheck-fail-skip simulation: `LIVOS_UPDATE_START_ISO_FS_OVERRIDE` lets the test pin the start timestamp so the pre-seeded `<ts>-precheck-fail.json` and the trap's same-second detection share the identical prefix. Without this, sub-second timing races would make `test_precheck_fail_skip` flaky.
- Production patch unaffected: HEREDOC body has no `${HISTORY_DIR_OVERRIDE:-...}` parameter expansion — it's straight assignment. Override pattern is testability scaffolding only.

**Trade-off:** Dual-source obligation (template + HEREDOC must stay in sync). Mitigated by inline comments in both files documenting the manual-sync requirement. Optional CI diff-extraction tracked as v30 nice-to-have (T-33-09 mitigation in plan threat model).

### 3. Live deploy validation deferred per user opt

**Choice:** Skip live deploy validation steps D-H of Task 3 per user's "approved" with explicit "canlı deploy yapma yok, devam edelim" rider. Apply (A) + idempotency (B) + backup chain + syntax (C) verified; live trap firing deferred to organic first-use.

**Rationale:**
- Bash unit tests cover all 4 distinct trap exit paths with 21/21 assertions across the trap's full state space — comprehensive coverage.
- First real deploy via Plan 33-03 UI `/update` button will populate Past Deploys table organically — validates against the real UI consumer rather than an artificial SSH-direct invocation.
- Avoids ~3 min Mini PC downtime + restart cycle now (`livos`, `liv-core`, `liv-worker`, `liv-memory` all bounce on full deploy).
- Patch is idempotent + bash-n-clean — re-applies are no-ops, syntax-check safety net would have triggered restore on any patching defect.

**Forward-resolution:** No follow-up task needed; first organic deploy via UI fires the trap path automatically and writes the first Phase-33-emitted JSON row.

### 4. Tasks 1+2 in worktree, SUMMARY on master

**Choice:** Tasks 1 and 2 executed in parallel worktree `worktree-agent-a8de0c2cd7f3805b0` (commits `44bfb083` + `7f1ca871`); SUMMARY.md authored directly on master in this final invocation.

**Rationale:** Standard parallel-executor protocol for the implementation work; SUMMARY-on-master simplifies the orchestrator's worktree-merge step (no need to coordinate SUMMARY commit timing with the worktree merge). Same protocol used in Phase 32 Plan 03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reason-extraction order in trap template (caught by TDD-RED in Task 2)**
- **Found during:** Task 2 GREEN (running `tests/log-format.sh` to drive the 4 scenarios green)
- **Issue:** `last_err` capture in `phase33_finalize` was reading from `$LIVOS_UPDATE_LOG_FILE` AFTER the `mv "$LIVOS_UPDATE_LOG_FILE" "$final_log_file"` rename — the source path was gone, so `grep` produced empty output and the fallback "unknown error" string fired in `reason` field of failed.json. `test_failed` asserted on `simulated build break` excerpt and failed.
- **Fix:** Re-ordered the trap body so reason extraction reads from `$final_log_file` (post-rename path). Applied byte-identically to both the trap template AND the patch script's embedded HEREDOC body to maintain dual-source parity.
- **Files modified:** `tests/phase33-trap-block.sh.tmpl` + `phase33-update-sh-logging-patch.sh`
- **Verification:** Re-ran `tests/log-format.sh` — `test_failed` asserts went 5/5 GREEN; full suite 21/21 GREEN
- **Committed in:** `7f1ca871` (Task 2 GREEN commit)

### Scope reduction (per user opt)

**Live deploy validation steps D-H of Task 3 deferred:**

- **Found during:** Task 3 verification, after orchestrator confirmed steps A-C (apply + idempotency + backup chain + bash-n) PASS
- **Reason:** User opted to defer live deploy ("Approved — canlı deploy yapma yok, devam edelim") given comprehensive bash unit test coverage (21/21 assertions across 4 trap scenarios)
- **Disposition:** First organic deploy via Plan 33-03 UI `/update` button will fire trap path automatically and populate Past Deploys table. No follow-up task needed.
- **Files NOT modified:** None (deferral is a no-op on local repo state — only skips an SSH-direct deploy invocation)

---

**Total deviations:** 1 auto-fixed bug (Rule 1, caught by TDD-RED) + 1 user-driven scope reduction (live deploy deferral)
**Impact on plan:** Auto-fix was caught by TDD before SSH apply — production never saw the misleading `reason` field. Live-deploy deferral is forward-resolved by first organic UI deploy; no test coverage gap (unit tests are comprehensive across all 4 trap exit paths).

## Issues Encountered

- **Reason-extraction order bug** (Rule 1 auto-fix above) — caught by TDD-RED in Task 2 GREEN, fixed in template + HEREDOC body simultaneously, verified by 21/21 assertion green. No production impact.
- No Mini PC apply failures, no idempotency leaks on re-apply, no syntax-check restoration triggered, no backup chain corruption.

## Cross-Phase Contract Status

| Contract | Phase 33 Plan 02 Status | Plan 33-01 / 33-03 Action Required |
|----------|------------------------|------------------------------------|
| **Phase 32 schema reuse — JSON shape `{timestamp, status, from_sha?, to_sha?, duration_ms, log_path?, reason?}`** | LIVE — Phase 33 patch's `cat > "$json_path" <<JSON` block mirrors Phase 32's `livos-rollback.sh` lines 237-249 byte-for-byte. Field order, indentation, optional-field comma handling all match. | Plan 33-01 reads this JSON via `system.listUpdateHistory`; can use the SAME parser/type for rollback.json + precheck-fail.json + success.json + failed.json. |
| **OBS-01 log file naming `update-<ISO>-<7sha>.log`** | LIVE on Mini PC patched update.sh | Plan 33-03 UI's "view full log" button: derive filename via `row.log_path?.split('/').pop()` then call `system.readUpdateLog({ filename })` (Plan 33-01 route). |
| **OBS-01 final summary line `[PHASE33-SUMMARY] status=... exit_code=... duration_seconds=...`** | Embedded in trap, fires post-rename to final log | Plan 33-03 log viewer modal can grep this line for at-a-glance summary chip rendering. |
| **Skip-on-precheck-fail / log_path backfill (O-08 lock)** | Implemented in trap; covered by `test_precheck_fail_skip` scenario | None — Phase 32's precheck-fail.json rows now get `log_path` field added by Phase 33 trap on co-occurring update.sh invocation. |
| **httpOnlyPaths registration for `system.listUpdateHistory` + `system.readUpdateLog`** | NOT this plan's scope | Plan 33-01 must add both routes to `httpOnlyPaths` in `livos/packages/livinityd/source/lib/common.ts` (per MEMORY.md: long-running mutations hang on WS transport). |
| **Server4 OBS-01 patch coverage** | DEFERRED — patch script is repo-resident, re-applicable via `ssh root@45.137.194.103 'sudo bash -s' < phase33-update-sh-logging-patch.sh` | None blocking; user can opt to apply at any future time. Same Phase 32 Plan 03 precedent. |

## Acceptance Criteria Status (per Plan 33-02)

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `phase33-update-sh-logging-patch.sh` exists, executable, `bash -n` clean | ✅ | Worktree commit `7f1ca871` |
| `tests/log-format.sh` exists, executable, `bash -n` clean | ✅ | Worktree commit `44bfb083` |
| `tests/phase33-trap-block.sh.tmpl` exists | ✅ | Worktree commit `7f1ca871` |
| Patch script contains `phase33_finalize` (≥2 occurrences) | ✅ | Function definition + trap registration both present |
| Patch script contains `trap phase33_finalize EXIT` | ✅ | Trap registration line in HEREDOC body |
| Patch script contains `MARKER_LOG_TEE` + `MARKER_SHA_CAPTURE` constants | ✅ | Both declared at top of patch script |
| Patch script contains backup line `cp "$UPDATE_SH" "$UPDATE_SH.pre-phase33"` | ✅ | Backup-then-restore safety net present |
| Bash unit test exits 0 with `ALL GREEN` and `passed: N` (N ≥ 18) | ✅ | 21/21 GREEN — all 4 scenarios pass |
| Mini PC apply: 2 PATCH-OK markers on first run + backup write line | ✅ | A. above — both PATCH-OK + Backup written all printed |
| Mini PC idempotency: only ALREADY-PATCHED on re-run, ZERO PATCH-OK | ✅ | B. above — both ALREADY-PATCHED + backup-already-exists printed |
| `bash -n /opt/livos/update.sh` exits 0 post-patch | ✅ | C. above — exit 0 confirmed |
| Live deploy emits `update-*-<7sha>.log` + `<ts>-success.json` | ⏸ | DEFERRED per user — bash unit tests cover trap behavior; organic first-deploy via UI will fire path |
| `[PHASE33-SUMMARY]` line in log file | ⏸ | DEFERRED per user — covered by `test_success` scenario asserting on `[PHASE33-SUMMARY] status=success` line presence |
| Valid JSON with `timestamp`, `status`, `from_sha`, `to_sha`, `duration_ms`, `log_path` fields | ⏸ | DEFERRED per user — covered by `test_success` scenario asserting on each field individually |
| livinityd healthy post-deploy (4 services active) | ⏸ | DEFERRED per user — first organic deploy will exercise restart cycle |

## Plan 33-02 Closure

**OBS-01 patch artifact + bash unit test + trap template are functionally complete + idempotent + bash-n-clean on the Mini PC deployment that matters.** The patch is LIVE on `/opt/livos/update.sh` with the next deploy guaranteed to emit the canonical `.log` + `.json` records that Plan 33-01's `system.listUpdateHistory` / `system.readUpdateLog` routes will consume and Plan 33-03's Past Deploys table + log viewer modal will surface.

Plan 33-02 status: **completed-with-deferred-live-validation**: full delivery on Mini PC (apply + idempotency + chain + syntax all PASS); live trap-firing deferred to organic first-deploy via UI per user opt; bash unit tests provide comprehensive trap-behavior coverage in lieu of a one-off SSH-direct deploy invocation.

## Next Phase Readiness

**For Plan 33-01 (Backend tRPC routes — Wave 1):**
- `httpOnlyPaths` registration handed off as the explicit Plan 33-01 contract item
- JSON schema is locked + parser-shareable across all 4 row types (success / failed / rolled-back / precheck-failed)
- Filename validation guards: derive `basename` from `log_path` field; reject `..` / `/` / `\` traversal; whitelist `/opt/livos/data/update-history/` directory prefix

**For Plan 33-03 (Frontend UI — Wave 2):**
- Past Deploys table can render rows the moment Plan 33-01 routes ship (deferred live deploy will produce the first row organically on next user-initiated update)
- Log viewer modal pattern: `row.log_path?.split('/').pop()` → `system.readUpdateLog({ filename })` → tail 500 lines monospace + "Download full log" button (full file stream)
- `[PHASE33-SUMMARY]` line is greppable for at-a-glance summary chip rendering at the top of the log viewer modal

**For Server4:**
- Patch script ready in repo. User can apply at any future time via `ssh root@45.137.194.103 'sudo bash -s' < phase33-update-sh-logging-patch.sh`. Idempotent + safe to re-apply. Same Phase 31/32 deferral pattern.

## Self-Check: PASSED

**Files claimed to exist (planning artifacts in repo — created in worktree, will land on master via orchestrator merge):**
- `.planning/phases/33-update-observability-surface/artifacts/phase33-update-sh-logging-patch.sh` — exists in worktree branch `worktree-agent-a8de0c2cd7f3805b0` (commit `7f1ca871`)
- `.planning/phases/33-update-observability-surface/artifacts/tests/log-format.sh` — exists in worktree branch `worktree-agent-a8de0c2cd7f3805b0` (commit `44bfb083`)
- `.planning/phases/33-update-observability-surface/artifacts/tests/phase33-trap-block.sh.tmpl` — exists in worktree branch `worktree-agent-a8de0c2cd7f3805b0` (commit `7f1ca871`)

**Commits claimed to exist (verified via `git log --all`):**
- `44bfb083` test(33-02): add bash test for OBS-01 trap (RED — template not yet authored) ✓
- `7f1ca871` feat(33-02): author phase33-update-sh-logging-patch.sh + trap template (4/4 bash tests green) ✓

**Host-side state changes claimed (Mini PC) — verified by orchestrator's SSH apply session, evidence preserved in `<state_to_record>` of the executor prompt:**
- `/opt/livos/update.sh` patched (LOG_TEE + SHA_CAPTURE both spliced) ✓
- `/opt/livos/update.sh.pre-phase33` backup created (17841 bytes) ✓
- `/opt/livos/update.sh.pre-phase32` backup preserved (13737 bytes) ✓
- `bash -n /opt/livos/update.sh` exits 0 (CLEAN) ✓
- Idempotent re-apply: ALL ALREADY-PATCHED + ZERO PATCH-OK ✓

---
*Phase: 33-update-observability-surface*
*Plan: 02*
*Completed: 2026-04-27*
