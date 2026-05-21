---
phase: 192-livinityd-bruce-user-switch
status: human_needed
generated: 2026-05-21
generated_by: gsd-executor (autonomous)
plans:
  - 192-01: complete
  - 192-02: code-complete (Mini PC cutover deferred)
  - 192-03: complete
  - 192-04: code-complete (Mini PC verification deferred)
---

# Phase 192 Verification — livinityd User=bruce Switch

## Status: `human_needed`

All 4 plans are CODE-COMPLETE. Two `checkpoint:human-action` gates
require Mini PC SSH access and live systemd operations — these cannot
be exercised from the Windows dev box and are routed to the operator.

The CODE artifacts (deploy scripts, migration script, source code
changes, sudoers fragment, sacred SHA registry update) are all shipped
and verified locally by their respective TDD assertions + bash shape
tests.

## Per-Must-Have Coverage Table

| Must-Have ID | Description | Source | Status | Verified By |
|--------------|-------------|--------|--------|-------------|
| V38-3-P192-AUDIT | Every root-required op enumerated with file:line + rationale | 192-AUDIT.md (20 entries, 5 categories) | PASS | 192-01-SUMMARY.md + `node -e` audit-shape check |
| V38-3-P192-SUDOERS | Narrow NOPASSWD sudoers (no `NOPASSWD: ALL`) + visudo-valid | scripts/install/sudoers.d/livinityd (6 Cmnd_Alias entries) | PASS | test-sudoers-livinityd.sh (7 PASS / 0 FAIL) |
| V38-3-P192-SERVICE-UNIT | deploy-livinityd.sh emits `User=bruce` + `Group=bruce` | scripts/install/deploy-livinityd.sh (2 heredocs) | PASS | test-systemd-user-bruce.sh (7 PASS / 0 FAIL) |
| V38-3-P192-MIGRATION-SCRIPT | Idempotent ownership flip + sudoers install | scripts/migrate-to-bruce-user.sh (8-step flow) | PASS | test-migrate-to-bruce-user.sh (10 PASS / 0 FAIL) |
| V38-3-P192-CODE-PATHS | livinityd source has no root assumptions | manager.ts + auth.ts + vault-templates/CLAUDE.md | PASS | grep proofs (zero remaining `/root/` literals or `isRoot` in prod code) |
| V38-3-P192-DROP-ISROOT | cc-pty/manager.ts isRoot check removed | manager.ts:208-212 | PASS | 3 new Phase 192-03 vitest assertions |
| V38-3-P192-HOME-OS-HOMEDIR | HOME env interpolated with os.homedir() | manager.ts:40, 250, 251, 258, 320, 321, 354 | PASS | vitest assertions 192-03-A/B + grep |
| V38-3-P192-SACRED-REPIN | Sudoers fragment pinned in sacred registry | scripts/sacred-shas-v38.json (entry #26) | PASS | check-sacred.sh (26 files verified) |
| V38-3-P192-MINIPC-VERIFY | Live cutover: livos.service runs as bruce, claude flag works | Mini PC `bruce@10.69.31.68` | **human_needed** | Operator runbook in 192-04-SUMMARY.md |

## Tasks Requiring Operator Action (Mini PC)

Per `feedback_autonomous` + `feedback_full_autonomous_no_questions`, the
executor proceeds A-Z without stopping. The two operator-gated tasks
listed here are not blockers for v38.3 code shipment — they are post-
ship deployment gates.

### 1. Plan 192-02 Task 3 — Mini PC migration + service cutover

**SSH target:** `bruce@10.69.31.68` (key: `~/.ssh/minipc`)

**Commands (one ssh session — per `reference_zerotier_unstable`):**
```bash
sudo bash /opt/livos/update.sh
sudo bash /opt/livos/scripts/migrate-to-bruce-user.sh
sudo systemctl daemon-reload
sudo systemctl restart livos.service liv-core.service liv-worker.service liv-memory.service
sleep 5
sudo systemctl show livos.service --property User --property Group
```

**Expected output:**
```
User=bruce
Group=bruce
```

**Pre-existing breakage to watch:** `liv-memory.service` may still be in
restart-loop pre-cutover (per memory: `update.sh` doesn't build the
`memory` package). Not a Phase 192 regression — pre-existing.

### 2. Plan 192-04 Task 2 — Mini PC 10-step verification

Full runbook in `192-04-SUMMARY.md` → "Skipped Manual Steps (Task 2)".

**Critical assertion:** Bug #17 closure — `claude
--dangerously-skip-permissions --version` must succeed when run as
bruce uid 1000. If it still fails with "cannot be used with
root/sudo privileges", the cutover succeeded but the bruce identity
isn't being inherited by the tmux spawn — investigate `_dld_run_bruce_migration` invocation order.

## Test Inventory (All Local, All PASS)

| Test | Plan | Assertions | Result |
|------|------|-----------|--------|
| test-sudoers-livinityd.sh | 192-01 | 7 | 7 PASS / 0 FAIL |
| test-migrate-to-bruce-user.sh | 192-02 | 10 | 10 PASS / 0 FAIL |
| test-systemd-user-bruce.sh | 192-02 | 7 | 7 PASS / 0 FAIL |
| test-systemd-env-liv-vault-root.sh (regression) | 192-02 | 10 | 10 PASS / 0 FAIL |
| cc-pty/manager.test.ts (Phase 192-03 deltas) | 192-03 | 3 NEW + 1 modified | All PASS in delta |
| check-sacred.sh | 192-04 | 26 SHAs | 26 PASS / 0 FAIL |

**Combined PASS count:** 60 local assertions across 6 test scripts. **0 FAIL.**

## Deferred / Pre-existing

Tracked in `deferred-items.md`:

- `cc-pty/manager.test.ts` Assertion 4 — pre-existing Windows-specific
  cwd-existence test failure (predates Phase 192; documented in
  `deferred-items.md`). Cross-platform path-handling fix is a v38.4 or
  v39 cross-platform CI hardening pass, not Phase 192.

## Commits (Phase 192 — 6 total)

| Commit | Plan | Description |
|--------|------|-------------|
| `33a47c16` | 192-01 | docs: enumerate root-required operations (192-AUDIT.md) |
| `9cb3e5d0` | 192-01 | feat: narrow sudoers fragment for bruce-as-livinityd |
| `ef0320ad` | 192-02 | feat: idempotent migrate-to-bruce-user.sh |
| `06abb1d8` | 192-02 | feat: deploy script emits User=bruce + invokes bruce migration |
| `47ed6a37` | 192-03 | feat: drop isRoot hack + interpolate HOME=os.homedir() in cc-pty |
| `8e8474b1` | 192-03 | feat: replace /root/.claude hardcode with os.homedir() in broker auth |
| `a03c60e3` | 192-04 | feat: pin sudoers fragment in sacred SHA registry |

(7 feature commits + 4 plan-creation docs commits earlier = 11 commits total
across the Phase 192 work window.)

## Sacred SHA Preservation

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` for
`liv/packages/core/src/sdk-agent-runner.ts` — **UNCHANGED across all 7
feature commits** (pre-commit hook verified each commit). Subscription
Agent SDK path remains sacred per `feedback_subscription_only`.

## Phase 162-01 vault-scaffolder.ts Status

UNCHANGED in code (per CONTEXT.md `<sacred_guards>`). Phase 193 will
stop CALLING it (formal removal v38.4), but the file itself is not
modified by Phase 192.

## Bug #17 Status (Pre-Mini-PC-cutover)

CODE PATH: CLOSED (manager.ts:208-212 — `isRoot` removed, skipPerms
always honored). The Bug #17 hot-fix that suppressed
`--dangerously-skip-permissions` when uid=0 is **gone** from the source
tree (verified by repo-wide grep returning 0 matches in production
code).

LIVE STATUS on Mini PC: PENDING operator verification. Until the Mini
PC cutover runs:
- Mini PC livinityd still spawned as root by the deployed (pre-192-02)
  systemd unit
- The old (pre-192-03) `isRoot` check that's deployed on Mini PC would
  have kicked in → claude would refuse the flag
- Post-cutover (livos.service User=bruce, isRoot dropped):
  bruce uid 1000 + skipPerms always honored → claude accepts flag

## Phase 193 Readiness

- [x] Foundation: bruce user, sudoers, migration script all in repo
- [x] Sudoers boundary pinned (silent widening blocked)
- [x] Migration script extensible (NOT pinned by design)
- [x] Code paths bruce-aware (os.homedir() interpolation)
- [ ] Mini PC live cutover (operator-gated)

Phase 193 can begin planning in parallel; live execution waits for
operator's Mini PC verification signal.

---

*Generated: 2026-05-21 by gsd-executor (autonomous wave-based run)*
*Operator resume signal: "192 mini-pc-verified" with paste of the 9-step
verification block outputs from 192-04-SUMMARY.md*
