---
phase: 225-update-sh-liv-assistant-wire
plan: 01
subsystem: deploy-pipeline
tags: [v42, update-sh, liv-assistant, bash, idempotent, healthcheck]
requires:
  - "Phase 223-01 (scripts/install-liv-assistant.sh)"
  - "Phase 223-02 (systemd/liv-assistant.service)"
  - "Phase 223-03 (scripts/capture-liv-assistant-password.sh)"
provides:
  - "update.sh integrates liv-assistant install + restart + /api/health smoke + credentials capture"
  - "Failed health probe halts deploy via `fail` helper (exits 1 before LIVOS_UPDATE_COMPLETED sentinel → phase33_finalize records status=failed)"
affects:
  - "Every `bash /opt/livos/update.sh` invocation on Mini PC (auto-installs/restarts/probes liv-assistant)"
tech_stack:
  added: []
  patterns:
    - "Idempotent unit-file write via `install -m 0644` + `cmp -s` guard (mirrors Step 7.7/7.8)"
    - "5s curl health probe with HTTP-code grep + fall-through diagnostics + `fail` halt"
    - "TEMP_DIR primary + LIVOS_DIR fallback for script source resolution (mirrors Step 4.5 openclaw shim)"
    - "Triple-fallback unit source lookup: repo-root `systemd/` → `scripts/install/systemd/` → `scripts/systemd/`"
key_files:
  created: []
  modified:
    - update.sh
decisions:
  - "Unit source primary path is repo-root `systemd/liv-assistant.service` (where Phase 223-02 actually shipped it), with secondary fallbacks to `scripts/install/systemd/` and `scripts/systemd/` for forward-compatibility with future layout choices"
  - "Health probe uses `/api/health` endpoint per ROADMAP SC-03 spec; Phase 225-02 will pivot to `/api/auth/status` only if live probe finds `/api/health` returns 404"
  - "`fail` helper reused (not redeclared) so phase33_finalize records `status=failed` in update-history JSON correctly"
metrics:
  duration_minutes: ~12
  completed_date: 2026-05-27
  commit: 7922b987
---

# Phase 225 Plan 01: Wire liv-assistant install into update.sh + /api/health smoke — Summary

**One-liner:** `update.sh` now ensures `liv-assistant.service` is freshly installed, restarted, and serving `/api/health` 200 on every deploy — failure halts the script before the success sentinel.

## What Shipped

Single atomic patch to `update.sh` (+124 lines, 0 deletions) wiring the Phase 223 liv-assistant scaffolding into the everyday update flow:

1. **Step 4.6 (new, post-rsync, pre-build):** Re-runs `scripts/install-liv-assistant.sh` idempotently — TEMP_DIR primary + LIVOS_DIR fallback. On unchanged source this is a sub-second no-op (Phase 223-01 SHA cache hit + UPSTREAM.md timestamp preservation).
2. **Step 7.9 (new, after Step 7.8 liv-claw-gateway unit install):** Copies `liv-assistant.service` to `/etc/systemd/system/` via `install -m 0644` with `cmp -s` byte-identical guard (no daemon-reload churn on re-runs). Triple-fallback source resolution: repo-root `systemd/` → `scripts/install/systemd/` → `scripts/systemd/`.
3. **Step 8 (extended, after liv-claw-gateway restart, before Verify services):** Restarts `liv-assistant.service` (guarded by unit-file-exists check), sleeps 2s for port bind, probes `http://127.0.0.1:3020/api/health` with 5s curl timeout. Non-2xx triggers diagnostics dump (curl HTTP code + `journalctl -u liv-assistant -n 20`) then `fail` halts the script BEFORE `LIVOS_UPDATE_COMPLETED=1` sentinel. Then invokes `capture-liv-assistant-password.sh` race-tolerantly.
4. **Verify-services cluster (extended):** Adds `systemctl is-active --quiet liv-assistant.service` check (non-fatal info on legacy deploys).
5. **Footer (extended):** New "What was updated" line: `liv-assistant (AionUi WebUI, vendored v2.1.4, port 3020)`.

## Verification

| Check | Threshold | Actual | Status |
|---|---|---|---|
| `bash -n update.sh` exit code | 0 | 0 | PASS |
| `grep -c install-liv-assistant.sh` | ≥ 2 | 5 | PASS |
| `grep -c liv-assistant.service` | ≥ 4 | 22 | PASS |
| `grep -c /api/health` | ≥ 2 | 8 | PASS |
| `grep -c capture-liv-assistant-password.sh` | ≥ 2 | 4 | PASS |
| `grep -c "Phase 225"` | ≥ 4 | 7 | PASS |
| `git diff HEAD~1 HEAD -- liv/packages/core/` | empty | empty (0 lines) | PASS |
| Sacred SHA `git ls-files -s liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | PASS |
| Sacred-SHA pre-commit hook | PASS | `[sacred-sha] PASS: 20 files verified` | PASS |
| `git log -1 --name-only` shows ONLY `update.sh` | yes | yes | PASS |

## Inserted Blocks (line ranges, post-patch)

| Step | Location (new line range) | Purpose |
|---|---|---|
| **A** — Step 4.6 install block | ~614-633 (after openclaw CLI shim, before Step 5 Build packages) | Idempotent re-run of `install-liv-assistant.sh` |
| **B** — Step 7.9 unit install | ~1054-1099 (after Step 7.8 liv-claw-gateway unit install, before Phase 202-10 ownership hook) | Copy `liv-assistant.service` to `/etc/systemd/system/` with cmp -s guard |
| **C** — Restart + health probe | ~1142-1187 (after liv-claw-gateway restart, before Verify services) | `systemctl restart` + 5s `/api/health` curl probe (fail-halts on non-2xx) + race-tolerant password capture |
| **D** — is-active verify | ~1199-1205 (after liv-core verify, before Phase 30 UPD-03 SHA record) | Non-fatal `systemctl is-active --quiet` check |
| **E** — Footer line | ~1257 (in "What was updated" block) | Add liv-assistant to user-visible update summary |

## Sacred SHA Compliance

```
$ git ls-files -s liv/packages/core/src/sdk-agent-runner.ts
100644 f3538e1d811992b782a9bb057d1b7f0a0189f95f 0	liv/packages/core/src/sdk-agent-runner.ts

$ git diff HEAD~1 HEAD -- liv/packages/core/
(empty)

$ git log -1 --name-only --format=
update.sh
```

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED. Only `update.sh` at repo root modified. Pre-commit hook reported `[sacred-sha] PASS: 20 files verified`.

## Deviations from Plan

**1. [Rule 3 - Path fallback ordering] Unit-file source lookup adjusted to prefer repo-root `systemd/`**

- **Found during:** Task 1 Step B (write unit-install block)
- **Issue:** Plan referenced fallback paths `scripts/install/systemd/liv-assistant.service` and `scripts/systemd/liv-assistant.service`. Live filesystem check showed the actual unit file lives at repo-root `systemd/liv-assistant.service` (where Phase 223-02 shipped it per the 223-05 DEPLOY-LOG).
- **Fix:** Made `$LIVOS_DIR/systemd/liv-assistant.service` (and `$TEMP_DIR/systemd/...`) the **primary** source path. Kept the plan's two original paths as **secondary** and **tertiary** fallbacks — defense-in-depth for any future layout migration.
- **Files modified:** `update.sh` Step 7.9 block (~lines 1054-1099)
- **Commit:** `7922b987` (folded into the atomic patch)
- **Impact:** None on plan intent — the unit file is found and installed; the plan's success criteria are met. Fallback chain is strictly richer than spec.

No other deviations. Plan executed cleanly. No auth gates encountered (pure repo-side edit, no SSH/network calls).

## Self-Check: PASSED

- `update.sh` present and modified at HEAD `7922b987`
- Commit `7922b987` confirmed via `git log --oneline -1`
- Sacred file `liv/packages/core/src/sdk-agent-runner.ts` at expected SHA
- All 6 grep-count thresholds satisfied (exceeded by 2-18× margins)
- `bash -n update.sh` exits 0

## Carry-Over to Plan 225-02

Plan 225-02 (deploy-to-Mini-PC) is the live-verification leg. It must:

1. **Push `7922b987` to origin/master** + any unpushed predecessors (per Phase 224 deploy SSH note: `git push` was 23 commits behind at v42 entry).
2. **SSH to Mini PC** (`bruce@10.69.31.68`), run `bash /opt/livos/update.sh`, capture stdout/stderr and the `<ts>-success.json` row from `/opt/livos/data/update-history/`.
3. **Verify SC-01** (deploy succeeds): exit code 0 + completion sentinel present.
4. **Verify SC-02** (`systemctl is-active liv-assistant.service`): `active`.
5. **Verify SC-03** (`/api/health` 200): tee the curl line from update.sh stdout — expect `[OK] liv-assistant /api/health = 200/204 OK`.
6. **Verify SC-04** (sacred SHA): `sha256sum /opt/liv/packages/core/src/sdk-agent-runner.ts` → matches `f3538e1d...` git-blob hash via `git ls-files -s`.
7. **Idempotency proof:** Re-run `bash /opt/livos/update.sh` immediately. Expect: no tarball re-download, no daemon-reload (cmp -s hits), liv-assistant restart logs PID-unchanged steady-state, second `/api/health` probe 200, capture script no-ops (creds file already exists).
8. **Pivot risk (LOW):** If live `/api/health` returns 404 (vendored AionUi's endpoint name might be `/api/auth/status` instead), Plan 225-02 patches the probe URL in a one-line follow-up. Phase 223-05 DEPLOY-LOG already confirmed both endpoints serve 200 in practice; spec'd `/api/health` is the ROADMAP-canonical path.

**Estimated effort for Plan 225-02:** 15-30 min (1 SSH session, 1 git push, 1 update.sh full run, 1 idempotent re-run, 8 grep verifications).
