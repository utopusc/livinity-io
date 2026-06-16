---
phase: 273-update-safety-layer-b-independent-systemd-transient-rollback
reviewed: 2026-06-15T00:00:00Z
depth: deep
files_reviewed: 1
files_reviewed_list:
  - update.sh
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 273: Code Review Report — Layer-B Independent Rollback Guard

**Reviewed:** 2026-06-15
**Depth:** deep (single-file, but full cross-function + timing analysis)
**Files Reviewed:** 1 (`update.sh`, commit `3b53fe5b`)
**Status:** issues_found (1 warning, 4 info — no critical/blocking issues)

## Summary

The Layer-B guard is well-constructed and the seven scrutiny points all hold up:

1. **Heredoc nesting — CORRECT.** Outer `<<'GUARD_EOF'` is quoted, so the entire guard body (incl. its inner `<<JSON` and all `$var`/`$(...)`) is written literally and expands only at guard *run* time. The inner `<<JSON` is unquoted → expands `$json_iso`, `$from_field`, etc. at guard runtime (correct, the values are guard-local). The `<<SENT` in `arm_deploy_guard` is unquoted and outside the GUARD_EOF block → expands `$LIVOS_UPDATE_*` at arm time (correct). No delimiter collision: `GUARD_EOF`/`JSON`/`SENT`/`DROPIN` are all distinct, and `JSON`/`DROPIN` appear both inside the literal guard and elsewhere but never as nested same-name terminators. Nothing in the guard body expands at install time. Verified `bash -n` already passes.

2. **flock race — CORRECT, no double-rollback.** update.sh opens fd 9 on `/run/lock/livos-update.lock` at L52 *after* the cgroup-escape re-exec, so the lock is held for the lifetime of the scoped process that also runs the EXIT trap. The guard is a separate `systemd-run` unit (does NOT inherit fd 9) and contends via its own `exec 9>"$LOCK"; flock -n 9`. While update.sh is alive → lock held → guard `flock -n` fails → bails (Step 1). On SIGKILL the fd closes → lock frees → guard proceeds. Crucially, even in the worst-case overlap (Layer-A mid-rollback at ~T+290s while the 300s timer fires — see WR-01), Layer-A still holds fd 9, so the guard bails. **No path exists where both roll back concurrently.**

3. **Safe-or-better — CORRECT.** Guard rolls back only after its ~80s `:8080` probe (Step 3, 20×4s) finds it unhealthy; a healthy box clears the sentinel and exits 0 untouched. Fires once: `systemd-run --on-active=300` is a one-shot transient timer, `--collect` GCs it; the guard ends with `exit 0` (no restart-on-failure of the unit). No loop.

4. **Disarm correctness — CORRECT.** `phase33_finalize` captures `local exit_code=$?` on L289 *before* `disarm_deploy_guard` runs on L292, so the disarm's `systemctl` `$?` churn can't clobber the recorded exit code. `disarm_deploy_guard` is guarded `2>/dev/null || true` and every internal command has `|| true`, so it can't abort the trap under `set -e`. Disarm runs on every clean exit (success, Layer-A rollback, precheck-fail — the trap is `trap phase33_finalize EXIT`); only a SIGKILL skips it.

5. **arm placement / scope — CORRECT.** `arm_deploy_guard` is L2045, immediately before `systemctl restart livos.service` (L2050, the SIGKILL point). All sentinel vars are in scope at arm time: `LIVOS_UPDATE_START_TS/_ISO_FS/_ISO_JSON/_FROM_SHA/_LOG_FILE` set L84–89, `LIVOS_UPDATE_TO_SHA` resolved L808 (well before L2045). See IN-01 re: deploy-id granularity.

6. **Fail-open + idempotency — CORRECT.** No `systemd-run` → warn + return 0. `LIVOS_DISABLE_DEPLOY_GUARD=1` → warn + return 0. `install_deploy_guard` is `cmp`-gated (mirrors `ensure_*_dropin`). Guard ends with `exit 0` on all paths (incl. rollback-didn't-restore) → never latches the transient unit `failed`. `arm` pre-`stop`s + `reset-failed`s any stale unit before re-arming.

7. **Sentinel staleness / wrong-deploy — CORRECT.** `EXPECTED_ID` (passed as `$1` from the systemd-run argv) is matched against the freshly-written sentinel's `id`; `arm` overwrites the sentinel and `stop`+`reset-failed`s any prior unit, so a stale guard from a previous deploy cannot roll back the current one. See IN-01 for the second-granularity edge.

## Warnings

### WR-01: Layer-A worst-case rollback runtime can approach the 300s guard delay

**File:** `update.sh:2045` (arm, `--on-active=300`) vs `update.sh:626-651` (`health_probe_or_rollback`)
**Issue:** The 300s timer starts at arm (L2045). On the **Layer-A rollback path** the time from arm to the EXIT-trap disarm is: livos restart (≤25s, `TimeoutStopSec=25`) + `sleep 2` + probe loop `40×3s`=120s + `restore_last_good` (rsync, ~seconds) + second restart (≤25s) + re-probe loop `40×3s`=120s ≈ **~292s**, i.e. only ~8s of headroom under 300s. If either livos stop hits its full 25s cap twice and the rsync restore is slow, Layer-A can cross 300s, firing the guard *while Layer-A is still rolling back*.

This is **not a correctness bug** — the flock (point 2) means the guard bails (`flock -n 9` fails because update.sh still holds fd 9), so there is no double-rollback. The only consequence is a benign log line from the transient unit and a possible `reset-failed` no-op. But the safety margin is thinner than intended and depends entirely on the flock backstop rather than the delay.
**Fix:** Widen the margin so the delay comfortably exceeds Layer-A's worst case (≈300s). Either bump the delay, or derive it from the probe budgets:
```bash
# update.sh — make the guard delay strictly larger than Layer-A's max runtime
# (2 probe loops @120s + 2 restarts @25s + restore slack). 420s gives ~2min headroom.
DEPLOY_GUARD_DELAY=420
```
Document the invariant `DEPLOY_GUARD_DELAY > (2*probe_budget + 2*TimeoutStopSec + restore_slack)` next to the constant so future probe-budget edits keep the relationship intact.

## Info

### IN-01: Deploy-id is 1-second-granular (`date -u +%s`)

**File:** `update.sh:84` (`LIVOS_UPDATE_START_TS=$(date -u +%s)`), used as `id` at `update.sh:~2055` arm + matched at guard Step 2
**Issue:** Two deploys started in the same wall-clock second would share a deploy-id, defeating the `EXPECTED_ID != SENT_ID` staleness check. In practice the single-flight flock (L52-58) forbids concurrent deploys and back-to-back serial deploys 1s apart are implausible, so this is theoretical.
**Fix:** Optionally use the higher-resolution `LIVOS_UPDATE_START_TS_MS` (already computed at L85) as the id for collision-proofness:
```bash
-- "$DEPLOY_GUARD_SCRIPT" "${LIVOS_UPDATE_START_TS_MS}"
# ...and write id=${LIVOS_UPDATE_START_TS_MS} in the sentinel
```

### IN-02: `arm_deploy_guard` sentinel write is unguarded under `set -e`

**File:** `update.sh:~2050` (`cat > "$DEPLOY_GUARD_SENTINEL" <<SENT`) and the `arm_deploy_guard` call at `update.sh:2045`
**Issue:** `set -euo pipefail` is active. The sentinel `cat >` redirect is not `|| true`-guarded and `arm_deploy_guard` is called bare (no `|| true`). If the sentinel write fails (disk full, perms on `/opt/livos/data/update`), `set -e` aborts update.sh *right before the restart*. That is arguably acceptable fail-closed behavior (the EXIT trap still runs, marks failed, and Layer-A never restarted anything), but it is the one place where the "fail-open, never block a deploy on the guard itself" intent (stated for the L52 flock) is not honored for Layer-B.
**Fix:** Make arm best-effort to match the fail-open philosophy:
```bash
arm_deploy_guard || true      # never let the guard's own setup abort a deploy
```
and/or guard the sentinel write: `cat > "$DEPLOY_GUARD_SENTINEL" <<SENT ... SENT` wrapped so a write failure warns + skips arming rather than aborting.

### IN-03: Guard restore omits the symlink under `set +e` only because each line is best-effort

**File:** `update.sh:178-200` (guard restore block)
**Issue:** The guard's restore is a faithful copy of `restore_last_good` (L574-606) but the guard runs under `set +e` (L118) with bare commands (no `|| true`), whereas `restore_last_good` runs under `set -e` with explicit `|| true`. Behaviorally equivalent here (set +e ⇒ non-zero is ignored), so this is fine — flagged only as a maintenance hazard: if someone later removes `set +e` from the guard, the bare `rsync`/`rm`/`cp` lines become abort points. Keep the `set +e` at L118 load-bearing and comment it as such.
**Fix:** Add a one-line comment at L118: `set +e   # LOAD-BEARING: restore block below relies on non-fatal bare commands`.

### IN-04: Two-copy drift risk between Layer-A restore and the heredoc'd guard restore

**File:** `update.sh:574-606` (`restore_last_good`) vs `update.sh:179-200` (guard heredoc restore)
**Issue:** The restore logic now exists twice (Layer-A function + the literal heredoc). They are currently identical, but future edits to `restore_last_good` (e.g. a new artifact to restore, or a path change post-Phase-65 cutover) must be mirrored by hand into the guard heredoc or the two silently diverge. The SUMMARY's "heredoc-only, no two-copy drift" rationale addresses guard-vs-`scripts/` drift but not guard-vs-`restore_last_good` drift.
**Fix:** No code change required for this phase. Add a maintenance note/comment at both sites cross-referencing each other (`# KEEP IN SYNC with restore_last_good() / with the Layer-B guard heredoc`) so a future editor updates both.

---

_Reviewed: 2026-06-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
