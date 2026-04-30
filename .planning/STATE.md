---
gsd_state_version: 1.0
milestone: v29.3
milestone_name: Marketplace AI Broker (Subscription-Only)
status: ready-to-plan
stopped_at: null
last_updated: "2026-04-29T22:00:00.000Z"
last_activity: 2026-04-29 -- v29.3 ROADMAP created by /gsd-roadmapper (6 phases, 17/17 reqs mapped)
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Last shipped milestone:** v29.2 Factory Reset (mini-milestone) — 2026-04-29
**Current milestone:** v29.3 Marketplace AI Broker (Subscription-Only) — ready to plan Phase 39

## Current Position

Phase: 39 (next — Risk Fix: Close OAuth Fallback)
Plan: —
Status: Ready to plan
Last activity: 2026-04-29 — ROADMAP.md + REQUIREMENTS.md traceability finalized

## Roadmap Snapshot

6 phases, strictly linear, 17/17 v1 requirements mapped:

| # | Phase | Reqs | Depends on |
|---|-------|------|------------|
| 39 | Risk Fix — Close OAuth Fallback | FR-RISK-01 | — |
| 40 | Per-User Claude OAuth + HOME Isolation | FR-AUTH-01..03 | 39 |
| 41 | Anthropic Messages Broker | FR-BROKER-A-01..04 | 40 |
| 42 | OpenAI-Compatible Broker | FR-BROKER-O-01..04 | 41 |
| 43 | Marketplace Integration (Anchor: MiroFish) | FR-MARKET-01..02 | 42 |
| 44 | Per-User Usage Dashboard | FR-DASH-01..03 | 43 |

Full details: `.planning/ROADMAP.md`.

## Accumulated Context (carried from v29.2)

### Subscription-only constraint (LOCKED for v29.3 and beyond)

User uses ONLY Claude subscription mode (`sdk-subscription` via `@anthropic-ai/claude-agent-sdk` `query()`). Never BYOK / API key.

- Existing `SdkAgentRunner` (`nexus/packages/core/src/sdk-agent-runner.ts`) is **sacred** — no structural changes. All v29.3 broker work wraps it externally.
- `claude.ts:99-115` raw OAuth-fallback path will be **deleted** (not refactored) in Phase 39.
- D-NO-BYOK enforced in every phase's success criteria — every user-facing flow must read "without entering an API key" or "using their Claude subscription".

### Carry-forwards from v29.2 (separate scope, not v29.3)

These are tech debt from v29.2 — addressed via dedicated patches outside v29.3:
- install.sh env-var fallback patch (closes install.sh's own argv leak window)
- install.sh ALTER USER patch (improves install.sh's native idempotency)
- update.sh patch to populate `/opt/livos/data/cache/install.sh.cached`
- Phase 37: `factory-reset.integration.test.sh` on Mini PC scratchpad (manual, opt-in)
- Phase 38: 11 browser-based UI flow checks (manual, opt-in)

### Deferred (post-v29.3)

- v30.0 Backup unfreeze — `.planning/milestones/v30.0-DEFINED/` (8 phases / 47 BAK-* reqs already defined; needs phase renumber to start after Phase 44).
- FR-MARKET-future-01 (Dify), FR-MARKET-future-02 (RAGFlow), FR-MARKET-future-03 (CrewAI template) — anchor app for v29.3 is MiroFish only.
- FR-DASH-future-01 (cost forecasting).
- FR-OBS-future-01 (per-request audit trail / message logging).

### Deployment target

- Mini PC ONLY (`bruce@10.69.31.68`). D-NO-SERVER4 hard rule. Server4 + Server5 explicitly off-limits for any v29.3 broker / OAuth / dashboard work.

## Recently Shipped

### v29.2 Factory Reset (2026-04-29)

3-phase mini-milestone delivering one-click factory reset:
- Phase 36 (audit): install.sh AUDIT-FINDINGS.md
- Phase 37 (backend): system.factoryReset tRPC route + idempotent wipe + cgroup-escape spawn
- Phase 38 (UI): Settings > Advanced > Danger Zone with type-confirm + BarePage progress overlay

See `.planning/milestones/v29.2-ROADMAP.md` for full archive.
