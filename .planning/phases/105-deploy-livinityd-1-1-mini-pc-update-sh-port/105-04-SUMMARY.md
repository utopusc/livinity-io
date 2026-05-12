---
phase: "105"
plan: "04"
subsystem: install-scripts
tags:
  - install-scripts
  - uat
  - operator-walk
  - phase-105
  - checkpoint
requires:
  - .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-CHECKLIST.md (scaffolded)
  - .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-EVIDENCE/ (operator-populated)
  - Plans 105-01 + 105-02 + 105-03 (all shipped on base 3ba5e698)
provides:
  - "5-criterion GO/NO-GO operator runbook (UAT-CHECKLIST.md)"
  - "Empty UAT-EVIDENCE/ directory reserved for operator evidence capture"
  - "Checkpoint handoff to orchestrator for Task 2 operator walk"
affects:
  - .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-CHECKLIST.md
  - .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-EVIDENCE/.gitkeep
tech-stack:
  added: []
  patterns:
    - "Operator-walked UAT checklist (autonomous: false plan pattern)"
    - "Empty .gitkeep placeholder reserves directory for runtime artifacts"
key-files:
  created:
    - .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-CHECKLIST.md
    - .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-EVIDENCE/.gitkeep
    - .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/105-04-SUMMARY.md
  modified: []
decisions:
  - "Task 1 (scaffold) committed atomically; Task 2 (operator walk) deferred as human-action checkpoint per plan's autonomous=false posture"
  - "UAT-CHECKLIST.md content used verbatim from plan body (105-04-PLAN.md task 1 <action> section); no editorial divergence"
  - "Checkpoint status = checkpoint_human_action — orchestrator must surface UAT-CHECKLIST.md to operator and await PASS/FAIL/BLOCKED signal"
status: checkpoint_human_action
metrics:
  duration: "approximately 1 minute (Task 1 scaffold only — Task 2 deferred to operator)"
  completed: "2026-05-12T19:53:10Z"
  commits: 1
  tasks_completed: 1
  tasks_deferred: 1
  files_created: 2
---

# Phase 105 Plan 04: Live VPS UAT Scaffolding Summary

UAT-CHECKLIST.md scaffolded with all 5 GO/NO-GO criteria + evidence-capture commands + 5 documented caveats. UAT-EVIDENCE/ directory reserved via `.gitkeep` placeholder. Task 2 (operator-walked live VPS install + GO/NO-GO verification) intentionally deferred — the plan declares `autonomous: false` because the live walk requires a fresh Ubuntu 24.04 VPS, CF credentials, browser-side screenshot verification, and operator judgement that cannot be automated. Phase 105's milestone state is **code-complete pending UAT**.

## Scope

This is the final wave (Wave 3) of Phase 105's update.sh 1:1 port. Plans 105-01 / 105-02 / 105-03 have all shipped on the base commit `3ba5e698` (refactor → gap closure G2-G9 → 38-assertion test extension → combined 117 PASS + 18 + 24 = 159 PASS across three test files). Static analysis is exhausted. The only thing left is to prove the deploy chain end-to-end on real hardware.

Plan 105-04 splits into TWO tasks:
- **Task 1 (autonomous: this executor):** Create UAT-CHECKLIST.md + UAT-EVIDENCE/.gitkeep scaffold + commit atomically.
- **Task 2 (checkpoint:human-action):** Operator walk — provision VPS, run install.sh, verify all 5 GO/NO-GO criteria, capture evidence, sign off.

This SUMMARY closes Task 1. Task 2 is surfaced to the orchestrator via a `## CHECKPOINT REACHED` block (see the agent's return message that wraps this SUMMARY).

## Tasks Completed

| Task | Name                                       | Status               | Commit     | Files                                                                                     |
| ---- | ------------------------------------------ | -------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| 1    | UAT-CHECKLIST.md scaffold + evidence dir   | DONE                 | `3179733e` | UAT-CHECKLIST.md (new), UAT-EVIDENCE/.gitkeep (new)                                       |
| 2    | Operator walk — live VPS install + 5 GO/NO-GO | DEFERRED (checkpoint) | -          | UAT-EVIDENCE/uat-*.txt + uat-screenshot.png + uat-update-rerun.log (operator-captured)    |

## Task 1 Deliverable: UAT-CHECKLIST.md

Sections produced per plan spec:

1. **Preparation:** Target VPS choice (Option A: fresh rental — recommended; Option B: reuse cleaned mainserver 154.53.56.75 with explicit purge sequence). CF DNS credentials enumeration (zone control, DNS:Edit API token, zone ID). Pre-flight platform check (`lsb_release` + `apt-get`/`systemctl` presence + root SSH).
2. **5 GO/NO-GO criteria** with exact verification commands + expected output + evidence destination per criterion:
   - GO-NO-GO-1 Services active — `systemctl is-active livos liv-core liv-worker liv-memory` → 4× `active`
   - GO-NO-GO-2 HTTPS LivOS HTML — `curl -sk` returns 200 + LivOS/livinityd/`<title>` markers; rejects Caddy placeholder / 502 / build-error
   - GO-NO-GO-3 Browser renders — green padlock + login UI; operator screenshot includes URL bar + page content
   - GO-NO-GO-4 Sacred SHA — `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts` == `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (exact match); STOP-IMMEDIATELY-on-mismatch
   - GO-NO-GO-5 update.sh re-run idempotency — `bash /opt/livos/update.sh` exits 0 + 4× services still active + browser reload still green
3. **Final disposition:** ALL 5 PASS → Phase 105 ships + STATE/ROADMAP update. ANY 1 FAIL → capture `uat-failure-report.md` + orchestrator opens Plan 105-05 gap-closure.
4. **Cleanup:** Reference to 105-04-PLAN.md `<interfaces>` block for full purge sequence (drop PG db, remove Caddy, remove systemd units, daemon-reload, optionally revoke CF API token via dashboard).
5. **Caveats (5):**
   - ZeroTier link to Mini PC unstable (detach long ops with `nohup`)
   - Mini PC NOT a Phase 105 UAT target (already runs update.sh)
   - Server4 NOT a UAT target (off-limits per HARD RULE)
   - ydotoold systemd unit conditional on desktop user UID≥1000 (skipped on fresh VPS without operator account)
   - block-exotic-subdeps=false security tradeoff preserved from 104-13 (no Phase 105 change)

## Task 1 Deliverable: UAT-EVIDENCE/.gitkeep

Empty 0-byte file at `.planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-EVIDENCE/.gitkeep`. Reserves the directory in git so the operator's evidence files have a deterministic landing zone:

- `UAT-EVIDENCE/uat-systemctl-active.txt` — GO-NO-GO-1
- `UAT-EVIDENCE/uat-systemctl-status.txt` — GO-NO-GO-1 detail
- `UAT-EVIDENCE/uat-curl-headers.txt` — GO-NO-GO-2 headers
- `UAT-EVIDENCE/uat-curl-body-head.txt` — GO-NO-GO-2 body
- `UAT-EVIDENCE/uat-screenshot.png` — GO-NO-GO-3
- `UAT-EVIDENCE/uat-sacred-sha.txt` — GO-NO-GO-4
- `UAT-EVIDENCE/uat-update-rerun.log` — GO-NO-GO-5
- `UAT-EVIDENCE/uat-systemctl-active-post-update.txt` — GO-NO-GO-5 services-still-active

## Task 2 Deferred — Checkpoint Handoff

Task 2 is declared `<task type="checkpoint:human-action" gate="blocking">` in the plan. This executor explicitly does NOT attempt to walk the UAT — that would require:

- Provisioning (or cleaning) a fresh Ubuntu 24.04 VPS
- Acquiring real CF DNS credentials for an operator-owned domain
- ~10-15 minutes of end-to-end install.sh runtime
- Visual browser-side screenshot verification (cannot automate green-padlock detection reliably)
- Operator judgement on FAIL classification (which failure → which 105-05 gap-closure pattern)

Instead, the executor returns a `## CHECKPOINT REACHED` block to the orchestrator. The orchestrator's responsibility:

1. Surface `UAT-CHECKLIST.md` to the operator
2. Wait for operator to provision the target host
3. Wait for operator to run `bash scripts/install.sh --mode hybrid --domain <DOMAIN> --cf-token <TOKEN> --cf-zone-id <ZONE-ID>` end-to-end
4. Wait for operator to verify all 5 GO/NO-GO criteria
5. Wait for operator to commit `UAT-EVIDENCE/uat-*.txt` + `uat-screenshot.png` + `uat-update-rerun.log` + sign off in UAT-CHECKLIST.md
6. After operator signoff: orchestrator commits the signoff and finalizes the SUMMARY with PASS/FAIL disposition

This is NOT a blocker — Phase 105's **code-complete** state is reached today (refactor + gap closure + tests). UAT walk is the final regression-prevention gate per memory `feedback_milestone_uat_gate.md` ("Never declare milestone passed without UAT").

## Verification Evidence (Task 1 only)

### Files exist on disk

```
$ test -f .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-CHECKLIST.md && echo FOUND
FOUND
$ test -f .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-EVIDENCE/.gitkeep && echo FOUND
FOUND
```

### All 5 GO/NO-GO sections present

```
$ for n in 1 2 3 4 5; do grep -qE "^### GO-NO-GO-$n" .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-CHECKLIST.md && echo "GO-NO-GO-$n: OK"; done
GO-NO-GO-1: OK
GO-NO-GO-2: OK
GO-NO-GO-3: OK
GO-NO-GO-4: OK
GO-NO-GO-5: OK
```

### Sacred SHA literal present in checklist

```
$ grep -qE "f3538e1d811992b782a9bb057d1b7f0a0189f95f" .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-CHECKLIST.md && echo "SHA literal: OK"
SHA literal: OK
```

### install.sh template + caveats present

```
$ grep -qE "\-\-mode hybrid --domain <DOMAIN> --cf-token <TOKEN> --cf-zone-id <ZONE>" UAT-CHECKLIST.md && echo "install.sh template: OK"
install.sh template: OK
$ for c in "ZeroTier" "Mini PC is NOT" "Server4 is NOT" "ydotoold" "block-exotic-subdeps"; do grep -qE "$c" UAT-CHECKLIST.md && echo "$c: OK"; done
ZeroTier: OK
Mini PC is NOT: OK
Server4 is NOT: OK
ydotoold: OK
block-exotic-subdeps: OK
```

### Sacred SHA preservation (MANDATORY invariant)

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Plan touched zero files under `liv/packages/core/src/` — trivially preserved.

### update.sh untouched (D-105-NO-PROD-IMPACT invariant)

```
$ git diff HEAD -- update.sh | wc -l
0
```

The canonical reference at repo root is byte-identical to its pre-plan state. Mini PC re-runs of `update.sh` remain unaffected.

### No files outside the phase directory modified

```
$ git diff --name-only HEAD~1 HEAD
.planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-CHECKLIST.md
.planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-EVIDENCE/.gitkeep
```

No modifications to STATE.md, ROADMAP.md, scripts/install/deploy-livinityd.sh, or the test harness — Task 1 is purely additive within the phase directory.

## Deviations from Plan

None — Task 1 executed exactly as written. UAT-CHECKLIST.md uses the plan-provided verbatim content; UAT-EVIDENCE/.gitkeep is a 0-byte placeholder per spec. No auth gates, no Rule-1/2/3 auto-fixes triggered.

Task 2 is intentionally NOT executed — this is the plan-declared `autonomous: false` posture, not a deviation. Surfaced as `## CHECKPOINT REACHED` to orchestrator.

## Self-Check: PASSED

```
$ [ -f .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-CHECKLIST.md ] && echo FOUND || echo MISSING
FOUND
$ [ -f .planning/phases/105-deploy-livinityd-1-1-mini-pc-update-sh-port/UAT-EVIDENCE/.gitkeep ] && echo FOUND || echo MISSING
FOUND
$ git log --oneline | grep -q "3179733e" && echo FOUND-TASK1 || echo MISSING
FOUND-TASK1
$ git diff HEAD -- update.sh | wc -l
0
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

All verification claims confirmed. Task 1 commit `3179733e` lands on the worktree branch. Sacred SHA and update.sh invariants preserved. Task 2 surfaced as checkpoint.

## Carry-Forward to Operator + Orchestrator

Operator deliverables (from UAT-CHECKLIST.md):

1. Provision fresh Ubuntu 24.04 VPS (or clean reuse of mainserver 154.53.56.75)
2. Acquire CF credentials: operator-owned domain + DNS:Edit token + zone ID
3. Run `bash scripts/install.sh --mode hybrid --domain <D> --cf-token <T> --cf-zone-id <Z>` end-to-end (~10-15 min)
4. Verify all 5 GO/NO-GO criteria + capture evidence files
5. Commit `UAT-EVIDENCE/uat-*.txt` + screenshot + update.sh re-run log
6. Sign off in UAT-CHECKLIST.md (operator initials + date)
7. Signal one of `UAT PASS` / `UAT FAIL: GO-NO-GO-<N>` / `UAT BLOCKED: <reason>`

Orchestrator deliverables (post operator signoff):

- On `UAT PASS`: amend this SUMMARY with PASS disposition + commit signoff + mark Phase 105 `[x]` in STATE.md + ROADMAP.md
- On `UAT FAIL: GO-NO-GO-<N>`: amend this SUMMARY with FAIL disposition + open Plan 105-05 gap-closure
- On `UAT BLOCKED`: amend this SUMMARY with BLOCKED disposition + defer to a later session
