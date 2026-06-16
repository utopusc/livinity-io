---
phase: 273-update-safety-layer-b
verified: 2026-06-15T00:00:00Z
status: human_needed
score: 6/6 code must-haves verified
overrides_applied: 0
human_verification:
  - test: "Deliberate broken-deploy Layer-B rescue (Mini PC, MANDATORY before relying on it)"
    expected: "Within ~delay the guard restores /opt/.livos-last-good, :8080 returns healthy, and a *-failed.json (guard: layer-b) appears in Past-Deploys"
    why_human: "Requires arming the transient unit on real systemd, deliberately breaking a deploy, and kill -9'ing the update.sh scope so Layer-B (not Layer-A) fires — cannot be exercised statically; memory-mandated live test, operator-gated"
  - test: "Healthy-deploy disarms the guard (no spurious rollback)"
    expected: "A normal healthy deploy completes; the EXIT trap stops livos-deploy-guard.{timer,service} and drops the sentinel; no rollback occurs and no failed.json is written"
    why_human: "Requires a full real deploy on the Mini PC with live systemd unit lifecycle; cannot be verified by static analysis"
---

# Phase 273: Update safety Layer-B Verification Report

**Phase Goal:** Add Layer-B — an independent systemd transient rollback guard armed by update.sh, immune to update.sh SIGKILL, that restores `/opt/.livos-last-good` + restarts + writes a `failed.json` if a broken deploy strands livinityd; live-tested with a deliberate broken deploy.
**Verified:** 2026-06-15
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (code must-haves)

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `install_deploy_guard()` heredoc-writes a self-contained `/opt/livos/livos-deploy-guard.sh` with own flock + :8080 probe + restore + failed.json writer | ✓ VERIFIED | update.sh L110-242: quoted `<<'GUARD_EOF'` heredoc; guard has `flock -n 9` (L133), `responding()` :8080 probe (L160-164), self-contained restore (L179-204), failed.json writer (L213-231); idempotent via `cmp -s` + `mv`/`chmod +x` (L236-241) |
| 2 | `arm_deploy_guard()` writes the deploy-inflight sentinel + `systemd-run --slice=system.slice --collect --on-active=300 --unit=livos-deploy-guard`; fail-open if systemd-run absent; honors `LIVOS_DISABLE_DEPLOY_GUARD=1` | ✓ VERIFIED | L246-277: kill-switch (L247-250), `command -v systemd-run` fail-open (L251-254), sentinel write with all 6 fields (L259-266), systemd-run with `--slice=system.slice --collect --on-active=${DEPLOY_GUARD_DELAY=300} --unit=...` (L267-271) |
| 3 | `disarm_deploy_guard()` called at the TOP of `phase33_finalize` (after exit_code capture) | ✓ VERIFIED | L288-292: `local exit_code=$?` then `disarm_deploy_guard 2>/dev/null \|\| true` as first action; disarm stops timer+service, reset-failed, removes sentinel (L282-286) |
| 4 | Guard logic: flock-bail, sentinel-id match, probe-then-rollback only if unhealthy, write failed.json, fires once | ✓ VERIFIED | Guard body: flock-bail no-op (L132-137), sentinel-missing/id-mismatch no-op (L140-158), ~80s probe → healthy clears sentinel + exits (L168-175), unhealthy → restore + reset-failed + restart + re-probe + failed.json + rm sentinel (L177-233); `--on-active` (not repeating) ⇒ fires once |
| 5 | `arm_deploy_guard` called right before `systemctl restart livos.service` | ✓ VERIFIED | L2045 `arm_deploy_guard` immediately precedes L2049 `reset-failed` and L2050 `systemctl restart livos.service` (after `ensure_livos_killmode_dropin` L2038); EXIT trap registered L396; `LIVOS_UPDATE_TO_SHA` set L808 < arm L2045 |
| 6 | `bash -n update.sh` clean (exit 0); extracted guard body `bash -n` clean (exit 0) | ✓ VERIFIED | `bash -n update.sh` → exit 0; extracted 122-line guard body (between GUARD_EOF markers) `bash -n` → exit 0 |

**Score:** 6/6 code must-haves verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `update.sh` (Layer-B) | install/arm/disarm + EXIT-trap disarm + arm-before-restart + heredoc guard body | ✓ VERIFIED | All three functions defined (L110, L246, L282); wired at L292 (disarm) + L2045 (arm); 122-line heredoc guard self-contained |
| `/opt/livos/livos-deploy-guard.sh` (emitted) | self-contained guard emitted at deploy time | ✓ N/A (on-box) | Emitted by `install_deploy_guard` on a real Mini PC deploy — not present in repo; heredoc source verified |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `arm_deploy_guard` | `systemctl restart livos.service` | call ordering (arm at SIGKILL point) | ✓ WIRED | arm L2045 → restart L2050 (5 lines later, only reset-failed between) |
| `phase33_finalize` (EXIT trap) | `disarm_deploy_guard` | first action after exit_code capture | ✓ WIRED | L289 exit_code, L292 disarm — every clean exit cancels Layer-B |
| guard sentinel | `failed.json` | shared sentinel metadata (id/iso/sha/log_path) | ✓ WIRED | arm writes 6-field sentinel (L259-266); guard reads them (L144-154) and emits matching failed.json (L223-230) to `$HISTORY_DIR` |
| guard flock | update.sh single-flight lock | SAME `/run/lock/livos-update.lock` | ✓ WIRED | guard `exec 9>"$LOCK"` + `flock -n 9` bail (L131-137) — alive parent holds lock ⇒ guard no-ops; SIGKILL frees fd ⇒ guard proceeds |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| update.sh syntax valid | `bash -n update.sh` | exit 0 | ✓ PASS |
| guard body syntax valid | extract GUARD_EOF body → `bash -n` | exit 0 (122 lines) | ✓ PASS |
| guard-fn references present | `grep -c "(arm\|disarm\|install)_deploy_guard"` | 6 (≥5 required) | ✓ PASS |
| systemd-run cgroup-escape flags | grep `--slice=system.slice` + `--on-active` in arm | present (L267-268) | ✓ PASS |
| no repeating timer (fires once) | grep `on-calendar\|on-unit-active` | none | ✓ PASS |
| guard rollback on real broken deploy | live deploy on Mini PC | not run | ? SKIP → human |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| update.sh | guard body | extensive `2>/dev/null \|\| true` / `set +e` | ℹ️ Info | Intentional fail-open design (best-effort rescue; never latch the transient unit failed). Matches LOCKED "safe-or-better" + "fail-open" decisions. Not a stub. |

### Requirements Coverage

No requirements declared (`requirements: []` in PLAN frontmatter; ROADMAP requirements TBD). N/A.

### Human Verification Required

The DELIBERATE-BROKEN-DEPLOY live test is operator-gated by explicit memory mandate ("the guard MUST be LIVE-tested with a DELIBERATE broken deploy on the Mini PC before the operator relies on it; do NOT bundle the activation with an urgent fix"). The plan is `autonomous: true` for code only — the live test is human_needed by design, not a code gap.

1. **Deliberate broken-deploy Layer-B rescue (Mini PC — MANDATORY)**
   - Procedure: (a) confirm a good baseline + last-good snapshot; (b) temporarily lower `DEPLOY_GUARD_DELAY`, deploy source that fails to bind :8080 (e.g. a syntax error in the livinityd entry), and `kill -9` the update.sh scope right after it arms so Layer-B (not Layer-A) fires; (c) confirm within ~delay the guard restores last-good, :8080 returns healthy, and a `*-failed.json` (`guard: layer-b`) appears in Past-Deploys.
   - Expected: guard rescues the stranded box; no permanent 502; failed.json visible.

2. **Healthy-deploy disarms the guard (no spurious rollback)**
   - Procedure: run a normal healthy deploy; confirm the EXIT trap stops `livos-deploy-guard.{timer,service}` and drops the sentinel.
   - Expected: no rollback, no failed.json, healthy box untouched.

Do NOT rely on Layer-B in production until both pass.

### Gaps Summary

No code gaps. All 6 code must-haves and all 6 acceptance criteria are verified statically:
- `bash -n update.sh` exit 0; extracted 122-line guard body `bash -n` exit 0.
- grep count of guard-fn references = 6 (≥5).
- `arm_deploy_guard` (L2045) precedes `systemctl restart livos.service` (L2050); `disarm_deploy_guard` is the first action in `phase33_finalize` (L292) after exit_code capture (L289); EXIT trap registered (L396).
- `systemd-run` includes `--slice=system.slice` + `--on-active`; guard contains `flock -n 9` acquire-or-bail and writes `failed.json` to `$HISTORY_DIR`.
- `LIVOS_DISABLE_DEPLOY_GUARD=1` honored; `command -v systemd-run` fail-open path present.
- Safe-or-better confirmed: guard rolls back ONLY after lock-acquire + sentinel-id match + an ~80s unhealthy probe; fires once (`--on-active`, no repeating timer).

The only outstanding items are the two operator-gated live tests above — `human_needed` by design (and Phase 273 is the final roadmap phase, so there is no later phase to defer them to).

---

_Verified: 2026-06-15_
_Verifier: Claude (gsd-verifier)_
