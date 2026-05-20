# Phase 170: v35.0 Mini PC Deploy + Consolidated UAT + Milestone Close

**Gathered:** 2026-05-19
**Status:** Ready for planning (autonomous; final wave; depends on 166+167+168+169)
**Source:** v35-CC-PTY-MASTER.md success criteria + Mini PC deploy pattern (mirrors Phase 165-04)
**Wave:** 3 (FINAL — closes v35.0 milestone)

<domain>
## Phase Boundary

Deploy v35.0 to Mini PC. Install tmux via apt (system-level dep). Restart services. Run live smoke probes covering all 5 v35 success criteria from master plan. Write consolidated `v35-VERIFICATION.md`. Restore safety state. v35.0 milestone CODE-COMPLETE-AND-LIVE-VERIFIED.

**Phase 170 sonu:**
- `apt install -y tmux` executed on Mini PC (idempotent; verify version ≥ 3.4)
- All v35.0 commits pushed + `update.sh` deployed
- Sacred SHA + D-09 + agent-session.ts + vault-scaffolder.ts + Phase 163 ws-agent.ts byte-identical post-deploy
- 5 live smoke probes pass: session create + persistence + reattach + subagent spawn + graph render
- Mobile route fallback verified (`/chat-mobile` loads legacy chat)
- `v35-VERIFICATION.md` written with master plan success criteria mapped to PASS / PASS-pending-OperatorUAT
- STATE.md updated: v35.0 milestone CODE-COMPLETE-AND-LIVE-VERIFIED
- ROADMAP.md updated: Phase 170 + v35.0 close marker

</domain>

<decisions>

### Plan 170-01: Pre-deploy guard sweep (push + sacred SHA + tmux apt install)

**Steps (all via single SSH session per `feedback_ssh_rate_limit`):**

1. `git push origin master` (push all 166-169 commits)
2. SSH Mini PC → verify pre-deploy state:
   - Sacred SHA `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts` = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
   - D-09 `git hash-object /opt/livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` = `2083f0a3dfc798b4841613b9576b94929f2faf2f`
   - All 4 services active
3. Install tmux: `sudo apt update && sudo apt install -y tmux && tmux -V` — idempotent (apt skips if already installed)
4. Verify tmux: `which tmux && tmux -V` reports `tmux 3.4` or later
5. Record pre-deploy git SHA on Mini PC for compare-after-deploy

**Acceptance:**
- tmux installed, version printed
- Pre-deploy SHA captured to deploy log

### Plan 170-02: Run update.sh (detached + log poll)

**Steps (per `reference_zerotier_unstable`):**

```bash
ssh ... "sudo nohup bash /opt/livos/update.sh > /tmp/update-v35.log 2>&1 &"
# poll every ~20s until process exits
while ssh ... "ps -ef | grep update.sh | grep -v grep" > /dev/null; do sleep 20; done
ssh ... "sudo tail -n 60 /tmp/update-v35.log | tail -60"
```

**Verify post-deploy:**
- `sudo cat /opt/livos/.deployed-sha` matches local HEAD
- All 4 services active for ≥5 min uptime
- Sacred SHA + D-09 STILL byte-identical (refuse to proceed if any drift)
- `livinityd` journal shows new boot log entries:
  - `[claude-runner/reaper] started — poll every 300s` (Phase 165 carry-over)
  - `[autonomous-scheduler] disabled (...)` (Phase 164 carry-over)
  - `[cc-pty-manager] started (tmux backend, idle reaper armed)` ← NEW in v35.0
  - `[cc-pty-manager] running idle reaper sweep at boot — reaped: 0 (no stale sessions)`

**Acceptance:**
- Deploy exits 0
- 4/4 services active
- Sacred SHA pre/post identical (sha256sum on file)
- New cc-pty-manager boot log line present in journal

### Plan 170-03: Live smoke probes (5 probes — all v35 success criteria)

**SSH-batched probe script:**

**Probe 1 — Session lifecycle:**
```bash
# Via livinityd's tRPC HTTP endpoint (cookie auth)
curl -s -X POST http://localhost:8080/api/trpc/ccPty.create -H "..." -d '{"json":{"title":"P170 smoke"}}' | jq .
# Expect: {"result":{"data":{"json":{"session":{"id":"uuid","tmuxName":"livos-cc-admin-xxxxxxxx",...}}}}}
# Capture session.id for next probes

# Verify tmux session actually spawned:
sudo tmux list-sessions | grep livos-cc-admin
```

**Probe 2 — Session persistence (most critical):**
```bash
# Connect WS, attach to session, send "echo persistence test\n", read stdout
# (use node script for this — wscat or custom client)
node /tmp/probe-cc-pty.js attach <session-id>
# Send: "echo persistence_marker\n"
# Read stdout — verify "persistence_marker" appears

# CRITICAL: DISCONNECT WS
# Wait 5 seconds
# Verify tmux session STILL ALIVE:
sudo tmux has-session -t livos-cc-admin-xxxxxxxx; echo $?  # should be 0
sudo tmux capture-pane -t livos-cc-admin-xxxxxxxx -p | grep persistence_marker  # should match

# Reattach with new WS, verify scrollback contains persistence_marker
node /tmp/probe-cc-pty.js attach <session-id>
# Receive stdout snapshot — verify "persistence_marker" present
```

**Probe 3 — Subagent spawn via CC native Task UX:**
```bash
# Inside attached CC session, send: "/agents\n"
# Read stdout — verify "luse-driver" agent listed (loaded from vault/.claude/agents/luse-driver.md)
# Send: "Use the luse-driver subagent to take a screenshot of the desktop and tell me what windows are open\n"
# Wait up to 60s — verify CC spawns Task with subagent_type='luse-driver'
# Output should contain "Saw:" / "Did:" / "Result:" format from Phase 165 luse-driver SKILL
```

**Probe 4 — Vault graph endpoint:**
```bash
curl -s http://localhost:8080/api/vault/graph -H "Cookie: ..." | jq '.nodes | length, .edges | length, .truncated'
# Expect: numeric nodes count >= 10 (vault has CLAUDE.md + memory/ + agents/ + skills/ etc.)
# Expect: numeric edges count >= 5 (wikilinks from CLAUDE.md to memory files)
# Expect: truncated = false (vault < 2000 files)

# Side panel content fetch:
curl -s "http://localhost:8080/api/vault/file?path=CLAUDE.md" -H "Cookie: ..." | jq -r '.content' | head -3
# Expect: first 3 lines of vault/CLAUDE.md returned
```

**Probe 5 — Other surfaces UNCHANGED (regression):**
```bash
# Phase 163 webapp surface probe still works:
node /tmp/probe-ws-agent.js conv "webapp:phase170regression:test1"
# Expect: cwd=/home/bruce/livinity-vault/surfaces/webapp/phase170regression OR vault root fallback
# Expect: model=claude-haiku-4-5-20251001

# Phase 162 main chat regression:
node /tmp/probe-ws-agent.js conv "conv_phase170mainregression"
# Expect: cwd=/home/bruce/livinity-vault
# Expect: model=claude-opus-4-7 (or whatever default_chat_model is in Redis)
```

**Failure handling:**
- If any probe fails 3× in a row, mark VERIFICATION status `gaps_found` or `human_needed`, do NOT block subsequent probes
- Probe 2 (persistence) is the CRITICAL one; if it fails → mark status `blocked_for_operator`, write detailed BLOCKED.md

**Acceptance:**
- Probe 1: tmux session spawned, livinityd tracked
- Probe 2: persistence verified via WS disconnect → tmux still alive → reattach replays scrollback
- Probe 3: luse-driver discovered + spawned + returns Saw/Did/Result format
- Probe 4: graph + file endpoints return expected JSON shapes
- Probe 5: Phase 162/163 contracts intact (CC PTY did NOT break SDK surfaces)

### Plan 170-04: v35-VERIFICATION.md (consolidated milestone close report)

**File:** NEW `.planning/phases/170-v35-deploy-uat/v35-VERIFICATION.md`

**Frontmatter + sections:**
```yaml
---
milestone: v35.0
status: passed | passed-pending-OperatorUAT | gaps_found | blocked_for_operator
verified_at: 2026-05-19
sacred_sha_minipc: <hash>
d09_minipc: <hash>
agent_session_minipc: <hash>
vault_scaffolder_minipc: <hash>
phase_161_02_helper_minipc: <hash>
tmux_version_minipc: 3.4+
phase_166_pty_backend_status: PASS
phase_167_xterm_frontend_status: PASS
phase_168_session_sidebar_status: PASS
phase_169_vault_graph_status: PASS
phase_170_deploy_uat_status: PASS
probe_1_session_lifecycle: pass | fail
probe_2_session_persistence_BROWSER_CLOSE: pass | fail
probe_3_subagent_spawn_luse: pass | fail
probe_4_vault_graph_endpoint: pass | fail
probe_5_phase_162_163_regression: pass | fail
total_commits_v35: <count>
push_range: <first..last>
mobile_fallback_route: pass | fail
operator_uat_checklist:
  - "Open https://bruce.livinity.io/ai-chat → see Session sidebar + Terminal/Graph tabs"
  - "Click 'New Session' → see CC welcome prompt"
  - "Type 'hangi modelsin' → CC responds with model identity"
  - "Run '/agents' → see luse-driver listed"
  - "Ask 'screenshot the desktop' → luse-driver spawns + returns result"
  - "Close browser tab → wait 60s → reopen → session still alive (scrollback intact)"
  - "Click Graph tab → see vault nodes render; click CLAUDE.md node → side panel shows content"
  - "Visit /chat-mobile on mobile device → legacy SDK chat loads (fallback verified)"
---

# v35.0 — Claude Code PTY Embed + Vault Memory Graph — MILESTONE VERIFICATION

## Executive Summary
[1-paragraph summary of what shipped + status]

## Phase-by-Phase Outcomes
[166/167/168/169/170 summaries with per-phase PASS status, commit ranges, test counts]

## Live Probe Results
[Probe 1-5 verbatim transcripts + journal excerpts]

## Sacred Guardrail Audit
[SHA pre/post deploy for all guard files]

## Master Plan Success Criteria Mapping
[10 master-plan criteria mapped to PASS / PASS-pending-OperatorUAT]

## Operator UAT § Browser Walk
[8-step browser walk for user's manual confirmation]

## Carry-overs (v35.1+)
[Live fs.watch graph, system state nodes, WebApp/NativeApp CC PTY pivot, etc.]
```

**Acceptance:**
- File written, ≥250 lines
- Frontmatter validates as YAML
- All 5 probe statuses recorded
- All 7 sacred guard file SHA pinning rows
- Operator UAT checklist has 8 numbered steps

### Plan 170-05: STATE.md + ROADMAP.md milestone close + safety wind-down

**Files:**
- MOD `.planning/STATE.md` — Current Position → "Phase 170 SHIPPED — v35.0 CODE-COMPLETE-AND-LIVE-VERIFIED" + v35.0 milestone marker
- MOD `.planning/ROADMAP.md` — append Phase 170 status, mark v35.0 milestone closed
- Safety wind-down on Mini PC:
  - `redis-cli SET liv:config:autonomous_enabled false` (Phase 164 carry-over safety)
  - Verify Phase 165 idle reaper still running
  - Verify Phase 166 CC PTY idle reaper armed at 24h

**Final commits (atomic):**
- `feat(170): v35.0 deploy + 5 live probes — Mini PC SHIPPED`
- `docs(170): v35-VERIFICATION.md + STATE update — v35.0 milestone CODE-COMPLETE`

**Acceptance:**
- STATE.md frontmatter status updated
- ROADMAP.md milestone v35.0 marker line added
- Both commits pushed to origin/master
- Mini PC `.deployed-sha` matches local HEAD

</decisions>

<canonical_refs>

- `.planning/v35-CC-PTY-MASTER.md` (10 success criteria)
- `.planning/phases/166-cc-pty-backend/166-CONTEXT.md`
- `.planning/phases/167-xterm-frontend/167-CONTEXT.md`
- `.planning/phases/168-session-sidebar/168-CONTEXT.md`
- `.planning/phases/169-vault-graph/169-CONTEXT.md`
- `.planning/phases/165-cc-integration-polish/v34-VERIFICATION.md` (Phase 165-04 pattern to mirror)
- `.planning/phases/164-autonomous-scheduler/164-VERIFICATION.md` (Phase 164-05 deploy pattern)
- `reference_zerotier_unstable` memory (detached SSH + log poll requirement)
- `feedback_ssh_rate_limit` memory (batch SSH commands)

</canonical_refs>

<specifics>

| Plan | Files (NEW unless marked MOD) | autonomous |
|------|-------------------------------|------------|
| 170-01 | Pre-deploy probe + apt install (no file changes; deploy log only) | true |
| 170-02 | Run update.sh + post-deploy verify (no source changes) | true |
| 170-03 | Live smoke probes (5 probes; probe scripts saved to /tmp on Mini PC) | true (1 checkpoint:human-verify wraps the browser-walk § of UAT) |
| 170-04 | NEW v35-VERIFICATION.md | true |
| 170-05 | MOD STATE.md + ROADMAP.md; safety wind-down via redis-cli | true |

**Sacred guardrails (every plan):**
- Sacred SHA + D-09 + agent-session.ts + vault-scaffolder.ts + Phase 161-02 helper byte-identical pre/post deploy
- Refuse to mark v35.0 SHIPPED if ANY guard file drift detected
- tmux apt install REQUIRED before update.sh first run (Phase 170-01)

</specifics>

<deferred>

- Mobile CC PTY via remote terminal app integration → v36 or later
- WebApp/NativeApp CC PTY pivot → v36 (after main chat proven stable in v35.0)
- Live fs.watch graph updates → v35.1
- System state nodes (RBAC, devices, agents) → v35.1
- Multi-user CC PTY namespacing → v36 (multi-tenant)

</deferred>

---

*Phase: 170-v35-deploy-uat*
*Wave: 3 (FINAL — depends on 166, 167, 168, 169)*
*Estimated: ~1 day agent work (deploy + probes + verification doc)*
*Closes: v35.0 LivOS Claude Code Embed milestone*
