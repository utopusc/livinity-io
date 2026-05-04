---
gsd_state_version: 1.0
milestone: null
milestone_name: null
status: between-milestones — v30.0 closed, v31 awaiting /gsd-new-milestone intake
last_updated: "2026-05-04T16:30:00.000Z"
last_activity: 2026-05-04 — v30.0 closed via --accept-debt (incl. v30.5 informal scope); v31 plan drafted at .planning/v31-DRAFT.md
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Last shipped milestone:** v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope) — closed 2026-05-04 via `--accept-debt`
**Current focus:** Awaiting v31 milestone intake via `/gsd-new-milestone` using `.planning/v31-DRAFT.md` as input.

## Current Position

Phase: Not started (between milestones)
Plan: —
Status: v31 milestone bootstrap pending
Last activity: 2026-05-04 — v30.0 milestone completed and archived

## Deferred Items

Items acknowledged and deferred at v30.0 milestone close on 2026-05-04 (per `--accept-debt` mode):

| Category | Item | Status | Carry destination |
|----------|------|--------|-------------------|
| verification | Phase 60 (Public Endpoint) — VERIFICATION.md | human_needed | v31 P64 (v30.5 final cleanup at v31 entry) |
| verification | Phase 62 (Usage Tracking + Settings UI) — VERIFICATION.md | human_needed | v31 P64 |
| uat_gap | Phase 63 (Mandatory Live Verification) — 0 pending scenarios in 63-UAT-RESULTS.md (formal walkthrough waived; R1-R3.11 live-verified ad-hoc during Bolt.diy debug sessions) | unknown | v31 P64 |
| quick_task | 260425-sfg-v28-0-hot-patch-bundle-tailwind-sync-bg- | missing | v31 carryover or backlog |
| quick_task | 260425-v1s-v28-0-hot-patch-round-2-activity-overflo | missing | v31 carryover or backlog |
| quick_task | 260425-x6q-v28-0-hot-patch-round-3-window-only-nav- | missing | v31 carryover or backlog |
| infra | F7 Suna marketplace sandbox network blocker (kortix-api can't reach kortix-sandbox container — different Docker networks) | open | v31 P71 (Computer Use Foundation — Bytebot per-session container architecture) |
| infra | F2 Token-level streaming cadence | open | v31 P74 (F2-F5 Carryover phase) |
| infra | F3 Multi-turn tool_result protocol | open | v31 P74 |
| infra | F4 Caddy timeout for long agentic sessions | open | v31 P74 |
| infra | F5 Identity preservation across turns | open | v31 P74 |
| uat_carry | 14 carryover UATs from v29.3-v29.5 (mechanism live-verified end-to-end via Bolt testing during Phase 63 R-series; formal walkthrough deferred) | deferred | v31 P64 |

## v30.0 Closure Summary (2026-05-04)

**Shipped:** 8 phases (56-63), 44 plans (41 summaries — Phase 63 R-series live-verified piece-by-piece, formal walkthrough waived per --accept-debt), 166 commits since v30.0 seed (`d59b1b51`).

**v30.5 informal scope merged into v30.0 close:**
- F1 (built-in tool isolation via R3.11 disallowedTools) ✓
- F6 (broker x-api-key external compat, commit `4a7c7932`) ✓
- F8 (multi-subdomain LivOS support 80%) ✓ (manual Redis insert pattern works; needs `additionalServices` BuiltinAppManifest field for portability)
- F2/F3/F4/F5/F7 → v31 carryover (see Deferred Items above)

**Archived:**
- `.planning/milestones/v30.0-ROADMAP.md` (full v30.0 roadmap snapshot)
- `.planning/milestones/v30.0-REQUIREMENTS.md` (38 requirements with archive header)
- `.planning/milestones/v30.0-phases/` (8 phase dirs: 56-research-spike through 63-mandatory-live-verification)

**Forensic log:** Append-only entry written to `.planning/MILESTONES.md` "Live-Verification Gate Overrides" section with timestamp `2026-05-04T16:30:00Z`, phases waived (60, 62, 63 formal walkthrough), 25 UATs waived (14 carryforward + Phase 63's own 11 plans), mode `--accept-debt`.

## Hard Constraints (carry forward to v31)

- **D-NO-BYOK** preserved — subscription only, no Anthropic API key path
- **Sacred file** `nexus/packages/core/src/sdk-agent-runner.ts` — current SHA `9f1562be...`. Old "UNTOUCHED" rule retired (was stale from v22 era; file actively developed under v29-v30 broker work and stayed functional throughout). v31 P65 Liv rename will functionally verify subscription path post-rename.
- **BROKER_FORCE_ROOT_HOME** pattern (use `/root/.claude/.credentials.json`)
- **Server4 OFF-LIMITS** — Mini PC + Server5 are the only deploy targets

## v31 Bootstrap

Next: `/gsd-new-milestone v31` will read `.planning/v31-DRAFT.md` (851 lines, 12 phases P64-P76) as input.

**v31 high-level scope:**
- P64: v30.5 final cleanup (Suna sandbox fix attempt + 14 carryforward UATs walkthrough + Phase 63 wrap)
- P65: Liv Rename (Nexus → Liv project-wide, ~5,800 occurrences)
- P66: Liv Design System v1 (WOW visual base — color tokens, motion primitives, typography)
- P67: Liv Agent Core Rebuild (Redis SSE relay, ToolCallSnapshot data model)
- P68: Side Panel + Tool View Dispatcher (Suna pattern; auto-open ONLY for browser-*/computer-use-*)
- P69: Per-Tool Views Suite (9 components, Suna-derived inline + side panel)
- P70: Composer + Streaming UX Polish
- P71: Computer Use Foundation (Bytebot desktop image + react-vnc + app gateway auth)
- P72: Computer Use Agent Loop (16 Bytebot tools + system prompt + NEEDS_HELP UI flow)
- P73: Reliability Layer (ContextManager, BullMQ queue, reconnectable runs)
- P74: F2-F5 Carryover from v30.5 (token cadence, tool_result protocol, Caddy timeout, identity)
- P75: Reasoning Cards + Lightweight Memory (Postgres tsvector FTS)
- P76: Agent Marketplace + Onboarding Tour

**Locked decisions for v31 entry:**
- ONLY Suna UI patterns (no Hermes UI per user direction 2026-05-04)
- Side panel auto-opens ONLY for browser-*/computer-use-* tools
- Bytebot desktop image (Apache 2.0) — pull from `ghcr.io/bytebot-ai/bytebot-desktop:edge`, single user privileged mode accepted
- Bytebot agent code NOT used (only image + 16 tool schemas + system prompt copied)
- Subscription-only via existing Livinity broker (BYTEBOT_LLM_PROXY_URL → broker → Kimi)
