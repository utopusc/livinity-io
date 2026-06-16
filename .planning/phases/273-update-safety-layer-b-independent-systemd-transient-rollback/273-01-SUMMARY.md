---
phase: 273-update-safety-layer-b
plan: 01
subsystem: infra
tags: [update, systemd, rollback, deploy, bash, livos]

requires:
  - phase: v44.18
    provides: Layer-A in-process snapshot+probe+rollback (snapshot_last_good/restore_last_good/health_probe_or_rollback), /opt/.livos-last-good, update-history failed.json schema
  - phase: v44.20-v44.21
    provides: --slice=system.slice cgroup-escape + KillMode=mixed (reduce the SIGKILL window Layer-B backstops)
provides:
  - Independent SIGKILL-immune systemd transient rollback guard (Layer-B) armed by update.sh
  - failed.json (guard:layer-b) on guard rollback for Past-Deploys visibility
affects: [update.sh, deploy-safety]

tech-stack:
  added: []
  patterns:
    - "Independent rescue via systemd-run system.slice transient unit (survives the caller's cgroup SIGKILL)"
    - "Race handoff via the caller's own flock: child bails while parent is alive, proceeds once SIGKILL frees the fd"

key-files:
  created: []
  modified:
    - update.sh

key-decisions:
  - "Heredoc-only guard (no separate scripts/ file) — version-consistent, no two-copy drift (mirrors ensure_*_dropin)"
  - "Armed by default (safe-or-better: rollback only when :8080 already unhealthy ⇒ a healthy box is never disturbed); kill-switch LIVOS_DISABLE_DEPLOY_GUARD=1"
  - "Disarm in the EXIT trap so ONLY a SIGKILL leaves the guard armed — exactly its purpose"
  - "300s --on-active delay; guard re-probes ~80s before deciding unhealthy"

patterns-established:
  - "Pattern: a deploy script can arm an out-of-cgroup systemd-run unit as a SIGKILL-proof rescue, handed off cleanly via the shared single-flight lock"

requirements-completed: []

duration: ~30min
completed: 2026-06-15
---

# Phase 273 Plan 01: Update safety Layer-B Summary

**An independent, SIGKILL-immune systemd transient rollback guard that rescues a stranded/broken LivOS deploy even when update.sh itself is killed — making a permanent Cloudflare 502 impossible regardless of update.sh survival.**

## Performance
- **Duration:** ~30 min
- **Completed:** 2026-06-15
- **Tasks:** 1 (Layer-B in update.sh)
- **Files modified:** 1 (update.sh; +1 emitted on-box script /opt/livos/livos-deploy-guard.sh)

## Accomplishments
- **Layer-B guard** added to `update.sh`: `install_deploy_guard()` heredoc-writes a self-contained `/opt/livos/livos-deploy-guard.sh`; `arm_deploy_guard()` writes a `/opt/livos/data/update/deploy-inflight` sentinel + a `systemd-run --slice=system.slice --collect --on-active=300 --unit=livos-deploy-guard` transient unit; `disarm_deploy_guard()` (EXIT trap) stops the unit + drops the sentinel.
- **Survives update.sh SIGKILL:** the unit lives in `system.slice` (sibling of livos.service), so the restart's control-group kill can't reap it. Only a SIGKILL (no EXIT trap) leaves it armed — its raison d'être.
- **Race-safe handoff:** the guard acquires the SAME `flock` (`/run/lock/livos-update.lock`) update.sh holds — if update.sh is alive it bails (parent in control, incl. Layer-A); a SIGKILL frees the fd → the guard proceeds. Prevents Layer-A/Layer-B double-rollback and a "still-running-at-300s" false trigger.
- **Safe-or-better:** rolls back ONLY when, after the lock + sentinel-id match, it probes :8080 (~80s) and finds it unhealthy. A healthy box is never disturbed. Fires once (no loop). On rollback: restores last-good (source + ui-dist + symlink + liv-core dist + pnpm-store propagation + chown bruce) → reset-failed → restart → re-probe → writes `<iso>-failed.json` (`guard: layer-b`) to update-history.
- **Fail-open + kill-switch:** no `systemd-run` → warn + skip (Layer-A still protects); `LIVOS_DISABLE_DEPLOY_GUARD=1` skips arming.

## Task Commits
1. **Task A: Layer-B in update.sh** — `3b53fe5b` (feat)

## Files Created/Modified
- `update.sh` — constants + `install_deploy_guard`/`arm_deploy_guard`/`disarm_deploy_guard`; disarm wired into `phase33_finalize` (EXIT trap, exit_code captured first); arm wired right before `systemctl restart livos.service`.
- (emitted at deploy time) `/opt/livos/livos-deploy-guard.sh` — the standalone guard.

## Decisions Made
See key-decisions. Core: armed-by-default is acceptable because the safe-or-better property means an unproven-but-correct guard cannot worsen a healthy box; the only un-tested risk is a false negative (fails to rescue = status quo).

## Deviations from Plan
None — executed as written.

## Issues Encountered
- None in code. `bash -n update.sh` clean; the extracted 122-line guard body `bash -n` clean.

## User Setup Required
**MANDATORY operator live-test before relying on Layer-B (memory-mandated; do NOT bundle activation with an urgent fix):** on the Mini PC, run a DELIBERATE broken deploy and confirm the guard rescues it. Suggested procedure: temporarily lower `DEPLOY_GUARD_DELAY`, deploy source that fails to bind :8080, and `kill -9` the update.sh scope right after it arms (so Layer-B — not Layer-A — fires); confirm within ~delay the guard restores last-good, :8080 returns healthy, and a `*-failed.json` (`guard: layer-b`) appears in Past-Deploys. Then confirm a HEALTHY deploy disarms cleanly (no spurious rollback, no failed.json). Until both pass, treat Layer-B as belt-and-suspenders, not a proven net.

## Next Phase Readiness
- Final phase of the scoped run. Code-complete + committed; live-test operator-gated.
- Two-run bootstrap caveat: the Layer-B-carrying update.sh is itself deployed by the prior update.sh; Layer-B protects the run AFTER it lands.

---
*Phase: 273-update-safety-layer-b*
*Completed: 2026-06-15*
