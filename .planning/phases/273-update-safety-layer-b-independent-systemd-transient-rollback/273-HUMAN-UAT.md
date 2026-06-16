---
status: partial
phase: 273-update-safety-layer-b
source: [273-VERIFICATION.md]
started: 2026-06-15
updated: 2026-06-15
---

## Current Test

[awaiting MANDATORY operator live-test on Mini PC `bruce@10.69.31.68` — do NOT rely on Layer-B until this passes]

## Tests

### 1. Deliberate broken-deploy → Layer-B rescue (MANDATORY)
expected: Deploy source that fails to bind :8080 AND make update.sh die at the restart so Layer-B (not Layer-A) fires — e.g. temporarily lower DEPLOY_GUARD_DELAY, deploy broken livinityd source, then `kill -9` the update.sh systemd scope right after it logs "Layer-B deploy guard armed". Within ~delay the guard restores `/opt/.livos-last-good`, :8080 returns 200, and a `*-failed.json` with `"guard": "layer-b"` appears in update-history / Past-Deploys.
result: [pending]

### 2. Healthy deploy disarms cleanly (no false rollback)
expected: A normal successful deploy disarms the guard in update.sh's EXIT trap — no `livos-deploy-guard` unit lingers (`systemctl status livos-deploy-guard.timer` → not found / inactive), the `/opt/livos/data/update/deploy-inflight` sentinel is gone, and NO spurious `*-failed.json` is written.
result: [pending]

### 3. Build/deploy gate
expected: `bash -n /opt/livos/update.sh` clean on-box; the Layer-B-carrying update.sh lands via the prior update.sh (two-run bootstrap — Layer-B protects the run AFTER it lands).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
