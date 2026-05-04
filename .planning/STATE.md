---
gsd_state_version: 1.0
milestone: v31.0
milestone_name: Liv Agent Reborn
status: not-started — Phase 64 (v30.5 final cleanup) ready to start
last_updated: "2026-05-04T17:00:00.000Z"
last_activity: 2026-05-04 — v31.0 milestone opened (13 phases P64-P76 derived from .planning/v31-DRAFT.md)
progress:
  total_phases: 13
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v31.0 Liv Agent Reborn — Nexus → Liv rename + Suna-only UI overhaul + Bytebot computer use
**Last shipped milestone:** v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope) — closed 2026-05-04 via `--accept-debt`
**Next action:** `/gsd-plan-phase 64` (v30.5 final cleanup) OR `/gsd-discuss-phase 64` to refine approach first

## Current Position

Phase: Not started — ready for Phase 64
Plan: —
Status: Defining phase plans (REQUIREMENTS.md + ROADMAP.md written; awaits per-phase planning)
Last activity: 2026-05-04 — v31 milestone bootstrap complete

## v31.0 Milestone Summary

**Goal:** Make AI Chat the WOW centerpiece of LivOS. Replace "Nexus" cosmetic identity with "Liv" project-wide. Adopt Suna's UI patterns verbatim (side panel + per-tool views + browser/computer-use display). Add computer use via Bytebot desktop image. Polish streaming UX, reasoning cards, lightweight memory, agent marketplace.

**Source plan:** `.planning/v31-DRAFT.md` (851 lines, file-level breakdown user-validated 2026-05-04).

**13 phases (P64-P76):**
- P64 v30.5 Final Cleanup (Suna sandbox fix + 14 carryforward UATs + Phase 63 walks + external client matrix)
- P65 Liv Rename Foundation (~5,800 occurrences across 250+ TS files)
- P66 Liv Design System v1 (color tokens, motion primitives, typography, shadcn liv-* variants)
- P67 Liv Agent Core Rebuild (Redis SSE relay, ToolCallSnapshot, LivAgentRunner)
- P68 Side Panel + Tool View Dispatcher (Suna pattern; auto-open ONLY for browser-*/computer-use-*)
- P69 Per-Tool Views Suite (9 components Suna-derived + inline tool pill)
- P70 Composer + Streaming UX Polish (auto-grow, slash menu, welcome screen)
- P71 Computer Use Foundation (Bytebot desktop image + react-vnc + app gateway auth)
- P72 Computer Use Agent Loop (16 Bytebot tools + system prompt + NEEDS_HELP UI)
- P73 Reliability Layer (ContextManager 75% threshold, BullMQ queue, reconnectable runs)
- P74 F2-F5 Carryover (token cadence, tool_result, Caddy timeout, identity)
- P75 Reasoning Cards + Memory (Postgres tsvector FTS, pinned messages)
- P76 Agent Marketplace + Onboarding Tour (8-10 seed agents, 9-step interactive tour)

**Estimated effort:** 171-229 hours (6-12 weeks solo at 4-6h/day).

**Locked decisions for v31 entry:**
- ONLY Suna UI patterns (NO Hermes UI per user direction 2026-05-04)
- Side panel auto-opens ONLY for `browser-*`/`computer-use-*` tools (Suna behavior)
- Bytebot: desktop image only (Apache 2.0); agent code NOT used
- Subscription-only preserved (D-NO-BYOK)
- Single-user privileged Bytebot containers accepted (Mini PC single-user constraint)
- Sacred file old "UNTOUCHED" rule retired (was stale memory; current SHA `9f1562be...` after 25 normal commits since v22 era)

## Hard Constraints (carry forward from v30.0)

- **D-NO-BYOK** — Subscription only, no Anthropic API key path
- **BROKER_FORCE_ROOT_HOME** — Use `/root/.claude/.credentials.json` for subscription auth
- **D-NO-SERVER4** — Mini PC + Server5 are the only deploy targets
- **Side panel auto-open behavior** — ONLY for `browser-*` and `computer-use-*` tool patterns

## Deferred Items (from v30.0 close — mapped into v31 phases)

| Category | Item | Status | v31 Destination |
|----------|------|--------|-----------------|
| verification | Phase 60 (Public Endpoint) — VERIFICATION.md | human_needed | P64 (v30.5 final cleanup) |
| verification | Phase 62 (Usage Tracking + Settings UI) — VERIFICATION.md | human_needed | P64 |
| uat_gap | Phase 63 (Mandatory Live Verification) | unknown | P64 |
| quick_task | 260425-sfg / 260425-v1s / 260425-x6q (3 v28.0 hot-patches) | missing | P64 (resolve or backlog) |
| infra | F7 Suna marketplace sandbox network blocker | open | P71 (Computer Use Foundation) |
| infra | F2 Token-level streaming cadence | open | P74 |
| infra | F3 Multi-turn tool_result protocol | open | P74 |
| infra | F4 Caddy timeout for long agentic sessions | open | P74 |
| infra | F5 Identity preservation across turns | open | P74 |
| uat_carry | 14 carryover UATs from v29.3-v29.5 | deferred | P64 |

## Server / Infra Reference (carry from v30.0)

### Mini PC (`bruce@10.69.31.68`)

- Code: `/opt/livos/packages/{livinityd,ui,config}/` + `/opt/nexus/packages/{core,worker,mcp-server,memory}/` (P65 will migrate `/opt/nexus/` → `/opt/liv/`)
- Deploy: `sudo bash /opt/livos/update.sh` (clones from utopusc/livinity-io, rsyncs, builds, restarts services)
- 4 systemd services: `livos liv-core liv-worker liv-memory` (already Liv-prefix ✓)
- Subscription creds: `/root/.claude/.credentials.json` (works) vs `/home/bruce/.claude/.credentials.json` (org-disabled)
- Env: `BROKER_FORCE_ROOT_HOME=true` set on services → broker uses /root creds
- claude CLI: `/home/bruce/.local/bin/claude` v2.1.126
- fail2ban: aggressive — batch SSH calls, never `iptables -F` (kills tunnel)

### Server5 (`root@45.137.194.102`)

- `livinity.io` relay (NO LivOS install, NEVER deploy LivOS code here)
- Caddy v2.11.2 with `caddy-ratelimit` + `caddy-dns/cloudflare` modules
- Caddyfile: `/etc/caddy/Caddyfile`, backup `caddy.bak.20260503-070012`
- Relay (Node) at port 4000, pm2 process `relay` (id 18)
- DNS: Cloudflare (manual dashboard, no IaC) — `api.livinity.io` A → 45.137.194.102
- Hosts public app store at `apps.livinity.io` — PostgreSQL `platform.apps` table (26 apps as of 2026-05-03)

### Server4 (`root@45.137.194.103`)

- **OFF-LIMITS — NEVER touch**, NOT user's server, deferred forever
