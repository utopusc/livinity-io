---
phase: 253-local-agents-cli-expansion
plan: 05
subsystem: deploy
tags: [deploy, update-sh, test-box, cli-installer, G12, G18, G21]

# Dependency graph
requires:
  - phase: 253-local-agents-cli-expansion
    provides: "15 install scripts (Plans 01-03) + drift-lock registration (Plan 04) pushed to origin/master"
provides:
  - "20-CLI roster deployed to the test box (154.53.56.75 / hello.livinity.io): 15 new scripts/install/cli/<id>.sh present + executable (glob count == 15, 20 total)"
  - "served panel JS (liv-240-install-section.js) contains all 15 new ids (0 MISSING) via G18 sha256 cache-bust — re-deployed 2026-05-30 12:55"
  - "G21 fix: update.sh now deploys scripts/install/cli/ (the existing-box update path previously skipped it — only fresh-install deploy-livinityd.sh copied them)"
affects: [253-06-operator-walk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "update.sh mirrors deploy-livinityd.sh's G12 directory-glob cli rsync so the existing-box update path stays in sync with the fresh-install path"

key-files:
  created: []
  modified:
    - update.sh   # G21: added scripts/install/cli/ rsync block after the livinityd-source step

deployed-sha: c65eb664
target: test box 154.53.56.75 / hello.livinity.io (NOT Mini PC, NOT Server4/5)
---

# 253-05 SUMMARY — Deploy 20-CLI roster to the test box

## Outcome

The 20-CLI roster is deployed and verified on the test box. Both plan-05 truths pass:

| Gate | Result |
|------|--------|
| Task 1 — 15 new `cli/<id>.sh` landed (glob count == 15, executable) | ✅ 15 (20 total) |
| Task 2 — served `liv-240-install-section.js` contains all 15 ids (G18 cache-bust) | ✅ 0 MISSING, asset mtime 2026-05-30 12:55 |

Deployed SHA on the box: **`c65eb664`** (master HEAD after the G21 fix).

## DEVIATION — G12 premise falsified, G21 fix required (the plan said "no deploy-script edit needed")

Plan 05's first truth asserted *"deploy-livinityd.sh copies all 15 new scripts to /opt/livos by glob (no deploy-script edit needed, G12)."* That is true for the **fresh-install** path (`install.sh` → `deploy-livinityd.sh` line ~449-452) but **false for the existing-box `update.sh` path**, which is what a deployed box actually runs.

- First deploy: `update.sh` clones master @ `00916e1`, restarts services, records the correct SHA — **but 0/15 new scripts landed**. `update.sh` has its own rsync blocks and **none copied `scripts/install/cli/`** (`grep -E 'install/cli|deploy-livinityd' update.sh` → empty). The existing 5 scripts on the box were stale-dated May 29, untouched by the deploy.
- Root cause: `deploy-livinityd.sh` (which has the G12 cli rsync) is sourced by `scripts/install.sh` (fresh install), **not** by `update.sh` (update). New Local Agents CLIs shipped after the last fresh install silently never reached the box.
- Fix (**G21**, commit `c65eb664`): added a `scripts/install/cli/` directory-glob rsync block to `update.sh`, mirroring `deploy-livinityd.sh` (also copies `_logging.sh`, chmod +x). Idempotent, guarded on `TEMP_DIR` presence.
- Because `update.sh` self-rsyncs itself, landing the fix took **two deploy passes**: pass 1 self-updated `/opt/livos/update.sh` to the G21 version (old in-memory logic, still no cli copy); pass 2 ran the fixed logic and copied all 15 scripts (`[OK] Local Agents install scripts updated (G21)`). This is the honest proof that `update.sh` now auto-deploys cli scripts unattended.

This deviation is a **net improvement** — the deploy machinery is now correct for both install paths. It supersedes the plan's "no edit needed" assumption.

## Verification evidence (on 154.53.56.75)

```
# Task 1
ls /opt/livos/scripts/install/cli/ | grep -E '^(codex|qwen-code|augment|github-copilot|codebuddy|qoder-cli|goose|factory-droid|cursor-agent|kimi-cli|mistral-vibe|hermes-agent|nanobot|snow-cli|kiro)\.sh$' | wc -l   → 15
ls /opt/livos/scripts/install/cli/*.sh | wc -l   → 20
cursor-agent.sh perms → -rwxr-xr-x

# Task 2  (asset: /opt/liv-assistant/aionui-web-2.1.4/aionui-web/static/assets/liv-240-install-section.js)
for id in <15 ids>; do grep -q "'$id'" $ASSET || echo MISSING $id; done   → (no MISSING)
asset mtime → 2026-05-30T12:55  (re-deployed today, G18 cache-bust)
```

## Notes for Plan 06 (operator walk)

- Panel JS WARNING-3 cross-check already green here (0 MISSING) — the walk's Task 1 pre-check should pass immediately.
- Wave-C install sources (kimi-cli, mistral-vibe, hermes-agent, nanobot, snow-cli, kiro) are MEDIUM/UNVERIFIED — their install failures are non-blocking by design (WARNING 2). Only the 9 Wave A/B CLIs gate the phase.
- cursor-agent binary is pinned to `cursor-agent` (BLOCKER 1) — watch the detect-after-install-survives-refresh check during the walk.
