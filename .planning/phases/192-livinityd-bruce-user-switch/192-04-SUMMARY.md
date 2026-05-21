---
phase: 192-livinityd-bruce-user-switch
plan: 04
subsystem: sacred-sha + verification
tags: [sacred-sha, registry, sudoers-pin, mini-pc-gate]
status: code-complete (Mini PC verification deferred to operator)
completed: 2026-05-21
duration_min: ~10
---

# Phase 192 Plan 04: Sacred SHA Registry Repin + Mini PC Verification

## One-liner

Added the Phase 192-01 sudoers fragment to `scripts/sacred-shas-v38.json`
(registry 25 → 26 entries), confirmed sacred SHA `f3538e1d...` for
`sdk-agent-runner.ts` is byte-identical, and routed Mini PC live cutover
verification to the operator as a `human_needed` step.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Repin sacred SHA registry — add sudoers fragment pin | a03c60e3 |
| 2 | **SKIPPED** (`autonomous: false` — Mini PC live cutover is operator work) | n/a |

## Sacred SHA Registry Diff

**Entries added:** 1

| Path | SHA | Frozen In Phase |
|------|-----|-----------------|
| `scripts/install/sudoers.d/livinityd` | `568e4403bd71b25fba44609aec47967a9babec08` | `192-bruce-user-switch` |

**Entries changed:** 0 (no currently-pinned file was edited by Phase 192).

**Sacred SHA invariant preserved:** entry #1
(`liv/packages/core/src/sdk-agent-runner.ts`) remains pinned at
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` — byte-identical to
pre-Phase-192 value.

**check-sacred.sh result:** `PASS: 26 files verified`.

## Decision Matrix — Pin Candidates Assessed

| File | Pinned? | Rationale |
|------|---------|-----------|
| `livos/packages/livinityd/source/modules/cc-pty/manager.ts` | NO | Active code under iteration; 193+ may touch cc-pty for cwd path adaptation. |
| `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` | NO | Active broker code; future BROKER_FORCE_ROOT_HOME changes likely. |
| `scripts/install/deploy-livinityd.sh` | NO | Deploy scripts are operator-tunable; not sacred. |
| `scripts/migrate-to-bruce-user.sh` | NO | Phase 193 will EXTEND this script for vault rename — would force-bust pin. |
| `scripts/install/sudoers.d/livinityd` | **YES** | Security boundary; silent widening must fail the pre-commit hook. |
| `livos/packages/livinityd/source/data/vault-templates/CLAUDE.md` | NO | Template, expected to evolve with milestones (193 supersedes vault concept). |

## Skipped Manual Steps (Task 2)

Task 2 is a `checkpoint:human-action` block — Mini PC live cutover
requires SSH'ing to `bruce@10.69.31.68` and walking the 10-step
verification block. Per execution constraints (Windows dev box has no
systemd), this is operator work.

Operator runbook (from 192-04-PLAN.md `<how-to-verify>`):

```bash
ssh -i ~/.ssh/minipc bruce@10.69.31.68
sudo bash /opt/livos/update.sh
sudo bash /opt/livos/scripts/migrate-to-bruce-user.sh
sudo systemctl daemon-reload
sudo systemctl restart livos.service liv-core.service liv-worker.service liv-memory.service
sleep 10
sudo systemctl show livos.service --property User --property Group
ps -o user,uid,pid,cmd -p $(sudo systemctl show livos.service --property MainPID --value)
sudo systemctl is-active livos.service liv-core.service liv-worker.service liv-memory.service
curl -sf http://localhost:8080/api/health || curl -sf http://localhost:8080/
sudo visudo -cf /etc/sudoers.d/livinityd
ls -l /etc/sudoers.d/livinityd /opt/livos/data /opt/livos/.env
sudo -u bruce bash -c 'HOME=/home/bruce tmux new-session -d -s test-claude "claude --dangerously-skip-permissions --version"'
sleep 2
sudo -u bruce tmux capture-pane -p -t test-claude
sudo -u bruce tmux kill-session -t test-claude
sudo bash /opt/livos/scripts/migrate-to-bruce-user.sh  # idempotency re-check
sudo journalctl -u livos.service -n 50 --no-pager | grep -iE 'permission denied|eacces|eperm'
```

Expected:
- `User=bruce Group=bruce`
- MainPID owned by bruce uid 1000
- 4× systemd units active
- HTTP 200/302/401 on :8080
- sudoers parsed OK, mode 0440 root:root
- `/opt/livos/data` + `/opt/livos/.env` owned by `bruce bruce`
- Claude version output (NOT "cannot be used with root/sudo privileges") → **Bug #17 cleared**
- Second migration run: "already migrated, exit 0"
- Empty journal grep (no permission errors)

Rollback path documented in 192-04-PLAN.md and 192-02-SUMMARY.md.

This step is tracked in `192-VERIFICATION.md` with status `human_needed`.

## Hand-off to Phase 193

Phase 193 (vault → `~/livinity` filesystem refactor) is unblocked:

- **Foundation in place:** post-cutover, livinityd runs as bruce →
  `os.homedir()` resolves to `/home/bruce` → vault path candidates
  (`~/livinity/`, `~/.livinity/`) are bruce-writable without sudo.
- **Sudoers boundary pinned:** any 193 attempt to broaden sudoers must
  re-pin sacred SHA → enforced peer review.
- **Migration script reusable:** Phase 193 can extend
  `scripts/migrate-to-bruce-user.sh` (NOT pinned — by design) with
  vault rename steps.

## Verification

| Gate | Result |
|------|--------|
| `bash scripts/check-sacred.sh` | PASS (26 files verified) |
| sdk-agent-runner.ts SHA unchanged | PASS (`f3538e1d...` byte-identical) |
| sudoers fragment newly pinned | PASS (SHA `568e4403...`) |
| Mini PC live cutover | `human_needed` (deferred to operator) |

## Self-Check: PASSED

- File modified: `scripts/sacred-shas-v38.json` (1 entry appended)
- Commit in master: `a03c60e3` (sudoers pin)
- Pre-commit hook PASSED on commit (sacred check ran inline)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED in
  registry (verified via post-commit `node -e` shape check)
