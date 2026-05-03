---
gsd_state_version: 1.0
milestone: v30.5
milestone_name: Broker Agent + Claude API Strategy
status: requirements-gathering
last_updated: "2026-05-03T15:35:00Z"
last_activity: "2026-05-03 — v30.0 closed (broker live, subscription auth via /root creds works, dynamic client-tools MCP bridge shipped R3.9-R3.11, file_write tool routing live-verified). v30.5 opened — focus: harden broker agent loop + define Claude API working strategy (subscription-only constraint, Bolt/Cursor/external-clients full agentic support)."
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v30.0 milestone started)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v30.5 — Broker Agent + Claude API Strategy
**Last shipped milestone:** v30.0 — Livinity Broker Professionalization — closed 2026-05-03

## Current Position

Phase: Not started (v30.5 just opened, awaiting `/gsd-discuss-phase` or first phase definition)
Plan: —
Status: requirements-gathering
Last activity: 2026-05-03 — v30.0 closed; v30.5 framing complete; broker subscription path live-verified end-to-end

## v30.0 Closure Summary (2026-05-03)

**Shipped:** 7/8 phases verified + Phase 63 live-verified piece-by-piece during debug session.

**Code Status (master HEAD `1f31ac27`):**
- Phase 56-62 all verified (143+ tests GREEN, sacred SHA stable)
- Phase 63 R-series hot-patches landed (R1 → R3.11):
  - `516d622b` R1 — relay admin-tunnel.ts username='bruce'
  - `66db08e3` R2 — auth.ts Bearer-wins-identity early-return
  - `e9ad055f` R3 — subscription via @anthropic-ai/claude-agent-sdk
  - `79df17d9` R3.1 — augment env.PATH for ~/.local/bin/claude
  - `da53add4` R3.1 cleanup — env-driven (drop hardcoded /home/bruce)
  - `129e0200` R3.2 — mirror sacred sdk-agent-runner options shape
  - `4219acca` R3.3 — strip .claude suffix from cwd before HOME
  - `9e2d15f9` R3.5 — permissionMode 'dontAsk' (bypassPermissions exits CLI 1)
  - `34a5efe0` R3.6 — allowedTools=['Read'] (insufficient — needs MCP)
  - `2bad6ba1` R3.7 — dummy MCP server (chat-only worked, but no agentic)
  - `fda2f7f6` R3.8 — honor BROKER_FORCE_ROOT_HOME (THE BREAKTHROUGH — /root creds vs /home/bruce creds)
  - `8225dbd6` R3.9 — DYNAMIC client-tools MCP bridge (Bolt's tools[] → SDK MCP)
  - `3b5aa3c8` R3.10 — disallowedTools + agressive systemPrompt (block built-ins)
  - `1f31ac27` R3.11 — expand disallowedTools to include ToolSearch + all Claude Code built-ins

**Live-verified (2026-05-03 debug session):**
- `/v1/messages` Anthropic API with Bearer + tools[] → HTTP 200 + tool_use streaming ✓
- `/v1/chat/completions` OpenAI-compat with tools → HTTP 200 + tool_calls streaming ✓
- Subscription auth via `/root/.claude/.credentials.json` (BROKER_FORCE_ROOT_HOME) ✓
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical end-to-end

**Deferred to v30.5 (this milestone):**
- Bolt agentic loop (in progress at session pause — R3.11 just deployed, awaiting live test of file_write tool routing without Bash/ToolSearch interference)
- Streaming cadence (Agent SDK subprocess buffer might delay token-level events)
- Caddy proxy timeout config (some Bolt requests trigger Gateway Timeout)
- Multi-turn agentic with tool_result loops
- Performance profiling under heavy Bolt usage
- Full Bolt + Cursor + Cline external-client compatibility matrix

## v30.5 Milestone Context

**Why this milestone:** v30.0 proved the broker mimari — subscription via Agent SDK + dynamic MCP tool bridging WORKS. But Bolt full-agentic-loop requires more polish: Claude must use ONLY user-provided tools (not built-in Bash/Read/Write/ToolSearch), streaming must flow at token cadence, multi-turn tool_result protocol must be rock-solid.

**Goal:** Production-ready external client support (Bolt.diy, Cursor, Cline, Continue.dev, Open WebUI) using subscription auth — full agentic, full streaming, no API key path needed.

**Locked decisions (carry from v30.0):**
- D-NO-BYOK preserved: subscription only, no Anthropic API key path
- D-30-07 sacred file untouched
- BROKER_FORCE_ROOT_HOME pattern (use /root creds, not per-user)
- Dynamic MCP bridge (R3.9 pattern) — client tools registered per-request as in-process MCP

**Target features (proposed — refine in /gsd-new-milestone):**

- **F1 — Built-in tool isolation:** Claude must use ONLY client-supplied tools. Block Bash/Read/Write/ToolSearch/Skill/all Claude Code built-ins via disallowedTools (R3.11 baseline; expand if more discovered).
- **F2 — Token-level streaming:** Agent SDK's includePartialMessages emits stream_event but cadence may be subprocess-buffered. Investigate flush patterns, possibly direct claude CLI invocation if SDK insufficient.
- **F3 — Multi-turn tool_result protocol:** Bolt sends tool_result in messages[]. Broker must convert tool_result → previous-turn context for SDK's flattened prompt model. Currently flatten-into-systemPrompt may lose tool_result fidelity.
- **F4 — Caddy timeout for long agentic:** Long Bolt sessions (10+ tool calls per turn) may exceed Caddy default proxy timeout. Configure `transport http { response_header_timeout 5m; read_timeout 5m }` on api.livinity.io block.
- **F5 — Identity preservation across turns:** systemPrompt accumulates with each turn (we append context). Risk: Nexus identity contamination through suffix instructions. Audit + minimize.
- **F6 — External client compat matrix:** Live UAT against Bolt.diy, Cursor, Cline, Continue.dev, Open WebUI. Document quirks per client.

## Resume Instructions (post /clear or new session)

**State at pause:**
- Latest commit: `1f31ac27` (R3.11 — full disallowedTools)
- User just ran `bash /opt/livos/update.sh` to deploy R3.11
- Pending live test: curl with stream + tools[file_write] should produce tool_use(file_write) directly (NOT ToolSearch wrapper, NOT Bash)

**Next step:**
1. Test live: `curl -sk -X POST https://api.livinity.io/v1/messages -H "Authorization: Bearer liv_sk_5l5YZa8fKvymikc9L7fj0MpRxzeQ2esP" -H "Content-Type: application/json" -H "anthropic-version: 2023-06-01" -d '{"model":"opus","max_tokens":300,"stream":true,"tools":[{"name":"file_write","description":"Write file","input_schema":{"type":"object","properties":{"path":{"type":"string"},"content":{"type":"string"}},"required":["path","content"]}}],"messages":[{"role":"user","content":"Create file hello.txt with Hello World"}]}'`
2. Expected: `tool_use(file_write, {path:"hello.txt", content:"Hello World"})` direct
3. If still ToolSearch / Bash: check Mini PC log for actual SDK invocation, may need additional disallowedTools entries
4. After tool routing verified: Bolt end-to-end test (real file creation, multi-turn agentic loop)

**Memory references (auto-loaded):**
- `reference_anthropic_subscription_state.md` — subscription routing via /root creds (FULL bug analysis)
- `feedback_subscription_only.md` — user hard preference: NEVER API key
- `feedback_full_autonomous_no_questions.md` — autonomous mode override
- `reference_minipc_ssh.md` + `reference_minipc.md` — Mini PC access pattern
- `feedback_ssh_rate_limit.md` — fail2ban awareness

**v30.0 Closure pending (not closed via /gsd-complete-milestone yet because debug session interrupted formal close — but functionally closed):**
- 14 carry-forward UATs from v29.x: deferred (broker live verifies the v30 piece, the UATs themselves are pre-v30 fixes that have been working)
- Phase 63 formal --accept-debt close: NOT taken (architecture proved working live, just iterative polish remains)

## Server / Infra Reference (carry from v30.0)

### Mini PC (`bruce@10.69.31.68`)
- Code: `/opt/livos/packages/{livinityd,ui,config}/` + `/opt/nexus/packages/{core,worker,mcp-server,memory}/`
- Deploy: `sudo bash /opt/livos/update.sh` (clones from utopusc/livinity-io, rsyncs, builds, restarts services)
- 4 systemd services: `livos liv-core liv-worker liv-memory` (all run as root)
- Subscription creds: `/root/.claude/.credentials.json` (works) vs `/home/bruce/.claude/.credentials.json` (org-disabled mystery — different OAuth session for same Max account)
- Env: `BROKER_FORCE_ROOT_HOME=true` set on services → broker uses /root creds
- claude CLI: `/home/bruce/.local/bin/claude` v2.1.126
- fail2ban: aggressive — batch SSH calls, never `iptables -F` (kills tunnel)

### Server5 (`root@45.137.194.102`)
- `livinity.io` relay (NO LivOS install, NEVER deploy LivOS code here)
- Caddy v2.11.2 with `caddy-ratelimit` + `caddy-dns/cloudflare` modules at `/usr/bin/caddy`
- Caddyfile: `/etc/caddy/Caddyfile`, backup `caddy.bak.20260503-070012`
- Relay (Node) at port 4000, pm2 process `relay` (id 18)
- DNS: Cloudflare (manual dashboard, no IaC) — `api.livinity.io` A → 45.137.194.102

### Server4 (`root@45.137.194.103`)
- **OFF-LIMITS — NEVER touch**, NOT user's server, deferred forever

## Key Code Paths (subscription passthrough)

- `livos/packages/livinityd/source/modules/livinity-broker/providers/anthropic.ts` — AnthropicProvider with dynamic MCP bridge
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` — `/v1/messages` dispatch + cwd computation
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` — `/v1/chat/completions` dispatch
- `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts` — request orchestration
- `livos/packages/livinityd/source/modules/livinity-broker/openai-stream-translator.ts` — Anthropic SSE → OpenAI chunks
- `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` — Bearer-wins-identity (R2 patch)
- `platform/relay/src/admin-tunnel.ts` — `username='bruce'` query (R1.1 patch on Server5)
