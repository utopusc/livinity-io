# Phase 273: Update safety Layer-B — independent systemd transient rollback guard - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — infrastructure phase; design fully specified in memory

<domain>
## Phase Boundary

Add **Layer-B**: an INDEPENDENT systemd transient rollback guard, armed by `update.sh` right before the risky `systemctl restart livos.service`, that is IMMUNE to update.sh being SIGKILLed (the cgroup-kill class — mitigated by v44.20 `--slice` + v44.21 `KillMode=mixed`, but Layer-B is the defense-in-depth backstop). If a broken/stranded deploy leaves livinityd dead on :8080 and update.sh never ran its own in-process rollback (Layer-A, v44.18), the guard restores `/opt/.livos-last-good`, restarts, and writes a `failed.json` for Past-Deploys visibility — so a permanent Cloudflare 502 is impossible regardless of whether update.sh survived.

Extends, does not replace, Layer-A (`health_probe_or_rollback` inside update.sh, v44.18) and the cgroup/killmode fixes (v44.20/v44.21). See [[project_ui_update_cgroup_kill]] + [[project_livos_update_502_brick_fix]].

OUT OF SCOPE: changing Layer-A; the livinityd UI; the false `error=true` toast follow-up (separate); anything in phases 271/272.

**CRITICAL (memory-mandated):** the guard MUST be LIVE-tested with a DELIBERATE broken deploy on the Mini PC before the operator relies on it; do NOT bundle the activation with an urgent fix. The live-test is operator-gated → this phase ships the code (armed, safe-or-better) and routes the deliberate-broken-deploy test as human_needed.
</domain>

<decisions>
## Implementation Decisions (infrastructure — Claude's discretion, guided by the documented design)

### Arming (LOCKED)
- Arm via `systemd-run --slice=system.slice --collect --on-active=<delay> --unit=livos-deploy-guard` running a self-contained guard script, called RIGHT BEFORE `systemctl restart livos.service` (the SIGKILL point). `--slice=system.slice` so the transient unit is a sibling of livos.service (never in its cgroup → survives the restart's control-group kill). `--collect` so it is GC'd.
- Delay ≈ 300s — generous enough to clear Layer-A's ~120s probe + the deploy tail (liv-core/worker restarts, SHA recording) before the guard considers acting.
- Write a sentinel `/opt/livos/data/update/deploy-inflight` carrying the deploy id (start-ts) + from_sha/to_sha/log_path/iso so the guard can write a faithful failed.json.

### Disarming (LOCKED)
- In update.sh's EXIT trap (`phase33_finalize`, runs FIRST), stop `livos-deploy-guard.{timer,service}` + `reset-failed` + delete the sentinel. The EXIT trap fires on EVERY clean exit (success, Layer-A rollback `fail`, precheck-fail) — so the ONLY path that leaves Layer-B armed is a SIGKILL with no trap (exactly the case Layer-B exists for).

### Race-safety (LOCKED) — the key correctness property
- The guard acquires the SAME `flock` update.sh holds (`/run/lock/livos-update.lock`, non-blocking). If update.sh is still alive (holds the lock) the guard CANNOT acquire it → exits as a no-op (update.sh is in control, incl. its own Layer-A rollback). A SIGKILL releases the fd → the lock frees → only THEN can the guard proceed. This cleanly prevents Layer-A/Layer-B double-rollback and a "update.sh still running at +300s" false trigger.
- Singleton fixed unit name `livos-deploy-guard` (single-flight is already enforced by the lock). Arming first clears any stale prior unit.

### Safe-or-better (LOCKED)
- The guard rolls back ONLY when, after acquiring the lock AND confirming the sentinel matches its deploy-id, it probes :8080 over a generous re-probe window and finds it UNHEALTHY. A healthy box is never disturbed (mirrors Layer-A's "rollback only when the probe already failed" guarantee). Fires once (`--on-active`, not a repeating timer) → no rollback loop.

### Guard script delivery (LOCKED)
- update.sh heredoc-writes the standalone guard to `/opt/livos/livos-deploy-guard.sh` (chmod +x) in an idempotent `install_deploy_guard()`, mirroring the existing `ensure_livos_killmode_dropin`/`ensure_livos_startlimit_dropin` heredoc idiom — self-contained, version-consistent with this update.sh, no rsync-layout dependency, no two-copy drift.

### Ship posture (LOCKED, flagged for UAT)
- Armed by default (the safe-or-better property means an unproven-but-correct guard cannot worsen a healthy box; the only failure mode is failing to rescue, i.e. status quo). A kill-switch env `LIVOS_DISABLE_DEPLOY_GUARD=1` skips arming. The mandatory deliberate-broken-deploy live-test is a human_needed UAT item with an exact procedure.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (update.sh)
- `LAST_GOOD_DIR=/opt/.livos-last-good`, `restore_last_good()`, `livinityd_responding()`, `health_probe_or_rollback()` — Layer-A. The guard reimplements the minimal restore+probe SELF-CONTAINED (it runs after update.sh is dead, so it can't call update.sh functions).
- `HISTORY_DIR=/opt/livos/data/update-history` + the `phase33_finalize` failed.json schema (timestamp/status/from_sha/to_sha/duration_ms/log_path/reason) — the guard writes a matching `<iso>-failed.json` so Past-Deploys lists it.
- The `--slice=system.slice` cgroup-escape re-exec (L35-42) + the `flock 9>/run/lock/livos-update.lock` single-flight (L52-58) — the guard reuses the SAME lock path.
- Heredoc drop-in idiom: `ensure_livos_killmode_dropin()` (L505) / `ensure_livos_startlimit_dropin()` (L460).

### Integration Points
- Arm: right before `systemctl restart livos.service` (≈ L1848, after `ensure_livos_killmode_dropin`).
- Disarm: top of `phase33_finalize()` (≈ L94, the EXIT trap).
- Constants near `LAST_GOOD_DIR` (≈ L346) / `HISTORY_DIR` (≈ L80).

</code_context>

<specifics>
## Specific Ideas
- Guard re-probe window ≈ 60-90s before declaring unhealthy (a stranded deploy's box may be mid-crash-loop boot).
- failed.json `reason`: "Layer-B guard rolled back a stranded/broken deploy (update.sh did not complete)".
- Keep everything fail-open: a guard that can't arm (no systemd-run) just warns; Layer-A still protects.
</specifics>

<deferred>
## Deferred Ideas
- The false `error=true` toast on a successful update (durable history-poll instead of in-memory await) — separate follow-up ([[project_livos_update_502_brick_fix]]).
</deferred>

---

*Phase: 273-update-safety-layer-b*
*Context gathered: 2026-06-15 (smart discuss, autonomous — infrastructure)*
