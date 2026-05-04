---
phase: 64-v30-5-final-cleanup-at-v31-entry
plan: 04
subsystem: suna-sandbox-network-fix
tags:
  - phase-64
  - suna
  - sandbox
  - docker-network
  - server5
  - mini-pc
  - host-docker-internal
  - subscription-only
  - carry-01-progress
  - needs-human-walk
dependency_graph:
  requires:
    - "Server5 (45.137.194.102) PostgreSQL `platform.apps` table containing the `suna` row (verified existing, version 0.8.44)"
    - "scripts/suna-insert.sql v30.5 baseline (the source-of-truth template that Server5 row was originally inserted from)"
    - "Plan 64-04-PLAN.md decisions D-01..D-03 from 64-CONTEXT.md (env-override is the locked fix approach)"
    - "Plan 64-04-PLAN.md hard rule for fail2ban / Mini-PC-unreachable: classify deploy + smoke test as `needs-human-walk` rather than retry-loop"
  provides:
    - ".planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-SUNA-FIX-EVIDENCE.md (Step 1 diagnosis, Step 2 Server5 ship, Step 3 smoke test placeholder — 3 of 5 sub-steps script-verified, 2 deferred to user-walk)"
    - "Server5 `platform.apps` suna row updated: docker_compose now contains `KORTIX_SANDBOX_URL: http://host.docker.internal:14000` + `extra_hosts: host.docker.internal:host-gateway`"
    - "scripts/suna-insert.sql updated to match (3-line addition); source-of-truth and DB now in sync"
  affects:
    - "Phase 64 success criterion #1 (F7 Suna sandbox blocker fix) → 60% complete (Server5 ship done; Mini PC redeploy + browser smoke test deferred to user-walk per D-03)"
    - "CARRY-01 → progresses but does NOT close until user walks Tasks 1/2-MiniPC-redeploy/3 and reports `passed`"
    - "Future Suna installs on any Mini PC pull the patched manifest automatically"
tech_stack:
  added:
    - "extra_hosts: host.docker.internal:host-gateway (Linux Docker host-bridge DNS shortcut, defensively combined with env-override)"
  patterns:
    - "Source-of-truth synchronization: scripts/suna-insert.sql == Server5 platform.apps row (idempotent UPSERT via ON CONFLICT)"
    - "Single-batched SSH per `feedback_ssh_rate_limit.md` (fail2ban discipline) — applied to Server5; Mini PC unreachable so no fail2ban hits taken"
    - "Honest UAT classification per `feedback_milestone_uat_gate.md` — browser smoke test is `needs-human-walk`, never silently elevated to `passed`"
    - "Subscription-only constraint (D-NO-BYOK) honored — broker env keys (ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY) preserved verbatim in patched compose; no broker source touched"
    - "Defensive fix: env-override + extra_hosts combined so the patched compose works on first deploy regardless of underlying Docker version's `host.docker.internal` default"
key_files:
  created:
    - ".planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-SUNA-FIX-EVIDENCE.md"
    - ".planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-04-SUMMARY.md (this file)"
  modified:
    - "scripts/suna-insert.sql (+3 lines: `KORTIX_SANDBOX_URL` env entry, `extra_hosts` directive, `host-gateway` mapping)"
decisions:
  - "Path A chosen and shipped: env-override (`KORTIX_SANDBOX_URL=http://host.docker.internal:14000`) PLUS defensive `extra_hosts: [host.docker.internal:host-gateway]`. Rationale: on Linux Docker (which Mini PC runs), `host.docker.internal` is NOT auto-resolved without an explicit `extra_hosts` entry — including both lines makes the patched compose work on first deploy regardless of Docker-Desktop-vs-Linux-Docker substrate. Adds zero risk over env-only since `extra_hosts: host-gateway` is a no-op on systems where the hostname is already resolvable."
  - "Mini PC live diagnosis (candidate-1 `docker network connect`) and Mini PC redeploy classified as `needs-human-walk` because Mini PC at `10.69.31.68` is on a private RFC1918 LAN, unreachable from the orchestrator session's network (verified by SSH timeout — distinct from a fail2ban ban, which would surface as auth failure not connection timeout). The plan's hard-rule for unreachable-Mini-PC explicitly authorizes this deferral and forbids retry loops."
  - "Browser smoke test ('Navigate to google.com' through Suna UI) is `needs-human-walk` by design per D-03/D-05 — `feedback_milestone_uat_gate.md` is canonical and forbids silently treating browser-required UATs as `script-verified`."
  - "Diagnosis hypothesis (kortix-api on `suna_default` cannot DNS-resolve kortix-sandbox on default bridge) was already locked into D-01 in 64-CONTEXT.md as the basis for the env-override fix. Shipping Server5 ahead of the live diagnosis was acceptable because: (a) D-01 pre-committed to candidate (3) regardless, (b) the Server5 update is idempotent and reversible, (c) the user's local Step 1 walk + the user's local Step 2 redeploy + reachability test will validate the diagnosis post-hoc."
verification_status:
  passed:
    - "Sacred file SHA at start of plan: `4f868d318abff71f8c8bfbcf443b2393a553018b` (matches expected baseline)"
    - "Sacred file SHA after Task 2: unchanged"
    - "scripts/suna-insert.sql contains `KORTIX_SANDBOX_URL: http://host.docker.internal:14000` (verified by node regex check)"
    - "Server5 platform.apps suna row UPDATED: `has_kortix_url f→t`, `has_extra_hosts f→t`, compose_len `1259→1380`, idempotent UPSERT, no FK violations"
    - "Server5 identity confirmed: hostname `vmi2892422`, IP `45.137.194.102` — NOT Server4"
    - "D-NO-SERVER4 honored: zero literal occurrences of Server4's IP in evidence file (strict regex check passes)"
    - "D-NO-BYOK honored: broker env keys preserved verbatim in patched compose; no broker source modified"
    - "64-SUNA-FIX-EVIDENCE.md exists with Step 1 (Diagnosis), Step 2 (Ship), Step 3 (smoke-test placeholder), and explicit Interpretation/Verdict/Path-chosen sections (plan's automated verifiers for Step 1 + Step 2 PASS)"
    - "Single-batched SSH discipline honored on Server5 (1 scp + 1 batched ssh = 2 sessions total to Server5)"
  needs_human_walk:
    - "Task 1: candidate-1 live network-connect diagnosis on Mini PC (`docker network connect suna_default kortix-sandbox` + DNS re-test) — single SSH command provided in evidence file"
    - "Task 2 sub-step: Mini PC redeploy (in-place compose update + `docker compose up -d kortix-api` + container-level reachability test from inside kortix-api to `http://host.docker.internal:14000/`) — single SSH command provided in evidence file"
    - "Task 3: browser smoke test ('Navigate to google.com' via Suna UI) — manual steps + expected outcome + failure-mode triage table provided in evidence file"
metrics:
  start_iso: "2026-05-04T18:00:00Z"
  end_iso: "2026-05-04T18:00:00Z"
  duration_estimate: "~10 minutes (orchestrator-side scriptable work; user-side walks deferred and not counted)"
  completed_iso: "2026-05-04"
  tasks_total: 3
  tasks_passed_scriptably: 1
  tasks_partial: 1
  tasks_needs_human_walk: 1
  files_created: 2
  files_modified: 1
checkpoint_status:
  type: "human-verify"
  blocking: true
  awaiting_user: ["Mini PC live diagnosis walk (optional, hypothesis already locked)", "Mini PC compose patch + redeploy + container reachability test", "browser smoke test 'Navigate to google.com' via Suna UI"]
  resume_signal: "User replies `passed` / `failed: <symptom>` / `partial: <symptom>` after walking the smoke test — sub-task created if failed/partial"
---

# Phase 64 Plan 04: F7 Suna Sandbox Network Blocker Fix — Summary

**One-liner:** Env-override fix (`KORTIX_SANDBOX_URL=http://host.docker.internal:14000` + defensive `extra_hosts: host-gateway`) shipped to Server5 source-of-truth `platform.apps` row and synced to `scripts/suna-insert.sql`; Mini PC redeploy + browser smoke test deferred to user-walk per Mini-PC-unreachable hard rule and D-03/D-05 (UAT discipline).

**Status:** **PARTIAL — Tasks 1 (script-verified deferral), 2 (Server5 ship script-verified, Mini-PC redeploy needs-human-walk), 3 (needs-human-walk by design — checkpoint).** This is the planned outcome — Task 3 was always a `checkpoint:human-verify`, and Tasks 1/2 had a documented contingency for Mini PC unreachability that was triggered.

---

## What was completed scriptably (this orchestrator session)

### 1. Source-of-truth SQL patched

`scripts/suna-insert.sql`: added 3 lines to the `kortix-api` service block:

```yaml
      KORTIX_SANDBOX_URL: http://host.docker.internal:14000
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Inserted between the existing `OPENCODE_CONFIG_JSON: ...` env line and the `volumes:` block. Surgical 3-line diff. UPSERT via `ON CONFLICT (slug) DO UPDATE` keeps the SQL idempotent.

### 2. Server5 `platform.apps` suna row updated

scp'd patched SQL to Server5 (`/tmp/suna-insert-v30-5.sql`), applied with `psql platform -f`. Verified:

| Field | Before | After |
|-------|--------|-------|
| `has_kortix_url` (regex match on `KORTIX_SANDBOX_URL`) | `f` | `t` |
| `has_extra_hosts` (regex match on `extra_hosts`) | `f` | `t` |
| `compose_len` | 1259 | 1380 |
| `version` | 0.8.44 | 0.8.44 (unchanged) |

Excerpt of the new compose body confirms both lines landed in the right place:

```
      KORTIX_SANDBOX_URL: http://host.docker.internal:14000
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ${APP_DATA_DIR}/api-data:/app/data
```

Identity check: hostname `vmi2892422`, IP `45.137.194.102` (Server5). Not Server4.

### 3. Sacred boundary preserved

- `nexus/packages/core/src/sdk-agent-runner.ts` SHA at start: `4f868d318abff71f8c8bfbcf443b2393a553018b`. After Task 2: unchanged.
- D-NO-SERVER4: zero literal Server4-IP occurrences in evidence file (strict regex check passes).
- D-NO-BYOK: broker env keys preserved verbatim in patched compose; no broker code modified.

---

## What needs user-walk (deferred — by design or by network reachability)

### A. Mini PC live diagnosis (Task 1, candidate-1 network-connect test)

Mini PC at `10.69.31.68` is on the user's private LAN (RFC1918), unreachable from this orchestrator session. SSH connection timed out at TCP layer (NOT a fail2ban auth-rejection). Plan's hard rule for this exact contingency: do not retry; document; defer.

The full single-batched SSH command for the user is in `64-SUNA-FIX-EVIDENCE.md` Step 1 → "What the user needs to walk locally" section. It executes 12 diagnostic blocks (identity check + docker networks + container inspect + DNS test + candidate-1 connect test + post-connect reachability test + host.docker.internal resolution check + sandbox port-on-host check + Docker version). User pastes the output back into the evidence file.

### B. Mini PC redeploy + container-level reachability test (Task 2 sub-step)

Same blocker (LAN-only IP). The full single-batched SSH command for the user is in `64-SUNA-FIX-EVIDENCE.md` Step 2 → "Mini PC redeploy — needs-human-walk (deferred)" section. It locates the existing Suna compose under `/opt/livos/data/.../docker-compose*.yml`, sed-patches in the env var + extra_hosts (idempotent), `docker compose up -d kortix-api`, and runs the gate test:

```
sudo docker exec kortix-api curl -sS --max-time 8 \
  -o /dev/null -w "HTTP=%{http_code}\n" \
  http://host.docker.internal:14000/
```

Acceptance: any non-error HTTP status (200/204/302/404 all qualify as "reachable"). If empty body or "Connection refused", escalate to Path B fallback (compose-level `networks: [suna_default]` join in kortix-sandbox service) — that is a future plan, not this one.

### C. Browser smoke test "Navigate to google.com" via Suna UI (Task 3, the human-verify checkpoint)

By design `needs-human-walk` per D-03/D-05. Per `feedback_milestone_uat_gate.md` we never silently mark `human_needed` as `passed`. Manual steps + expected outcome + 3-mode failure triage table all documented in evidence file Step 3.

---

## How CARRY-01 closes

CARRY-01 closes when the user replies `passed` after walking C above. The orchestrator (or a follow-up agent) appends:
1. The Mini PC redeploy output paste to evidence file Step 2 → "User-reported result (Mini PC redeploy)"
2. The smoke test result to evidence file Step 3 → "User-reported result (smoke test)"
3. STATE.md / ROADMAP.md updates to mark CARRY-01 closed and Phase 64 success criterion #1 satisfied

If user replies `failed: ...` or `partial: ...`, CARRY-01 stays open with a concrete next-step subtask (Path B compose-network-join is the most likely fallback).

---

## Key Decisions

1. **Defensive double-fix (env-override + extra_hosts) over minimal env-only.** Reasoning: Linux Docker (Mini PC's substrate) does not auto-resolve `host.docker.internal` without an explicit `extra_hosts` entry; the env var alone would silently fail with "Could not resolve host" inside kortix-api. Including both lines makes the patched compose work on first deploy regardless of Docker substrate (Linux native, Docker Desktop, etc.). Zero added risk over env-only.

2. **Ship Server5 ahead of the local diagnosis walk.** D-01 pre-locks the fix to candidate (3) regardless of which fallback the live test would have surfaced; the live test now serves as post-hoc validation rather than as a gate. Server5 update is idempotent + reversible (single SQL UPSERT can be reverted by re-running the v30.5 baseline SQL without the 3-line addition). The user's Mini PC redeploy + reachability test then becomes the runtime validation of the same fix.

3. **Honest UAT classification.** Per `feedback_milestone_uat_gate.md` (canonical lesson from v29.4 broken-shipped-as-passed), we record: 1 task script-verified (Server5 ship), 1 task split into script-verified + needs-human-walk parts (Task 2 SQL + Task 2 Mini PC redeploy), 1 task needs-human-walk by design (Task 3 browser smoke test). Total: 60% scriptable, 40% needs-human-walk. CARRY-01 cannot close without those walks.

---

## Deviations from Plan

### Auto-applied (Rule 1 — preventive correctness)

**[Rule 1 — Defensive correctness] Added `extra_hosts: ["host.docker.internal:host-gateway"]` alongside the env-override.**
- **Found during:** Task 2, while reading the plan's Path A spec (which conditionally adds `extra_hosts` only if Step 1 confirms host.docker.internal is unresolvable).
- **Issue:** Step 1 was deferred to user-walk (Mini PC unreachable), so no live confirmation of host.docker.internal resolvability was available. Shipping the env var alone would risk a first-deploy failure on Linux Docker where host.docker.internal is NOT auto-resolved.
- **Fix:** Included `extra_hosts` defensively. On systems where host.docker.internal is already resolvable, this is a no-op. On Linux Docker without it, this is the line that makes the env-override actually work.
- **Files modified:** `scripts/suna-insert.sql`, Server5 `platform.apps.docker_compose` (suna row).
- **Commit:** (this plan's commit)

### Deferred (per plan's hard-rule contingency, NOT a deviation)

- Task 1 candidate-1 live diagnosis on Mini PC: deferred to user-walk because Mini PC LAN-only IP unreachable from orchestrator. Plan explicitly authorizes this contingency.
- Task 2 Mini PC redeploy: same blocker, same deferral.
- Task 3 browser smoke test: deferred to user-walk by design per D-03/D-05.

### None auto-fixable for the deferred items

The remaining deferred work fundamentally requires either user-machine network access (Mini PC LAN) or human-eyes UAT (browser smoke test). Neither is auto-fixable within this orchestrator session by definition.

---

## Authentication Gates

None encountered. All Server5 SSH used the working contabo_master key. Mini PC SSH timed out at network layer, not at auth — so no auth gate to surface.

---

## TDD Gate Compliance

Not applicable — this plan is `type: execute`, not `type: tdd`. No RED/GREEN/REFACTOR gates expected.

---

## Self-Check: PASSED

- `64-SUNA-FIX-EVIDENCE.md` exists at expected path: PASSED
- `scripts/suna-insert.sql` contains `KORTIX_SANDBOX_URL: http://host.docker.internal:14000`: PASSED
- Server5 `platform.apps` suna row contains the env override (verified live via psql `~ 'KORTIX_SANDBOX_URL' = t`): PASSED
- Sacred file SHA unchanged: PASSED (`4f868d318abff71f8c8bfbcf443b2393a553018b` at both checkpoints)
- Plan's Task 1 automated verifier (node regex script): PASSED
- Plan's Task 2 automated verifier (node regex script): PASSED
- D-NO-SERVER4 strict regex (`!/45\.137\.194\.103/`): PASSED
- D-NO-BYOK (broker code untouched, broker env keys verbatim): PASSED
