---
gsd_state_version: 1.0
milestone: v29.3
milestone_name: Marketplace AI Broker (Subscription-Only)
status: defining-requirements
stopped_at: null
last_updated: "2026-04-29T21:00:00.000Z"
last_activity: 2026-04-29 -- v29.3 milestone started (PROJECT.md updated, REQUIREMENTS + ROADMAP next)
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
**Last shipped milestone:** v29.2 Factory Reset (mini-milestone) — 2026-04-29
**Current milestone:** v29.3 Marketplace AI Broker (Subscription-Only) — defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-29 — Milestone v29.3 started

## Accumulated Context (carried from v29.2)

### Subscription-only constraint (LOCKED for v29.3 and beyond)

User uses ONLY Claude subscription mode (`sdk-subscription` via `@anthropic-ai/claude-agent-sdk` `query()`). Never BYOK / API key.

- Existing `SdkAgentRunner` (`nexus/packages/core/src/sdk-agent-runner.ts`) is **sacred** — no structural changes.
- Broker layer in v29.3 wraps the runner externally; runner internals stay untouched.
- `claude.ts:99-115` raw OAuth-fallback path will be **deleted** (not refactored) in Phase 39.

### Carry-forwards from v29.2 (separate scope, not v29.3)

These are tech debt from v29.2 — addressed via dedicated patches outside v29.3:
- install.sh env-var fallback patch (closes install.sh's own argv leak window)
- install.sh ALTER USER patch (improves install.sh's native idempotency)
- update.sh patch to populate `/opt/livos/data/cache/install.sh.cached`
- Phase 37: `factory-reset.integration.test.sh` on Mini PC scratchpad (manual, opt-in)
- Phase 38: 11 browser-based UI flow checks (manual, opt-in)

### Deferred (post-v29.3)

- v30.0 Backup unfreeze — `.planning/milestones/v30.0-DEFINED/` (8 phases / 47 BAK-* reqs already defined; needs phase renumber to start after v29.3's last phase).

## Recently Shipped

### v29.2 Factory Reset (2026-04-29)

3-phase mini-milestone delivering one-click factory reset:
- Phase 36 (audit): install.sh AUDIT-FINDINGS.md
- Phase 37 (backend): system.factoryReset tRPC route + idempotent wipe + cgroup-escape spawn
- Phase 38 (UI): Settings > Advanced > Danger Zone with type-confirm + BarePage progress overlay

See `.planning/milestones/v29.2-ROADMAP.md` for full archive.
