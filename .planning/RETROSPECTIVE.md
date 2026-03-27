# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v19.0 — Custom Domain Management

**Shipped:** 2026-03-27
**Phases:** 5 | **Plans:** 10 | **Tasks:** 19

### What Was Built
- End-to-end custom domain management: users add domains on livinity.io, verify DNS, domains auto-sync to LivOS via tunnel relay
- Relay Caddy on-demand TLS with Redis-cached ask endpoint (<5ms authorization, Let's Encrypt auto-SSL)
- Tunnel domain sync pipeline with reconnect resilience and PostgreSQL + Redis dual storage
- Custom domain-to-Docker app mapping with HTTP and WebSocket routing through relay tunnels
- Domains tab in Servers app + "My Domains" section in Settings with status badges and Configure dialog
- Dashboard polish: SSL status indicators, re-verify timing, inline error banners

### What Worked
- Phase 10.1 (decimal sub-phase) was a clean insertion for the Settings UI swap — no disruption to existing phase flow
- Reusing existing `domain.platform.*` tRPC routes for the Settings My Domains UI avoided duplication
- Research agent correctly identified that tunnel mode means no local Caddy changes needed — prevented wasted work
- Gap closure (Phase 09-03) caught a missing PostgreSQL persistence requirement and fixed it in one plan

### What Was Inefficient
- DNS polling (`startDnsPolling`) was built but never wired to server startup — integration gap only caught at milestone audit, not during phase verification
- Relay-side cache invalidation gap for LivOS-initiated domain mapping changes — the relay drops `domain_sync` messages because it has no handler for them
- Phase 09 human_needed items remain deferred (require live tunnel environment for testing)

### Patterns Established
- Dual DNS resolver pattern (system + Cloudflare DoH) for cross-validation
- Redis-cached authorization for latency-sensitive endpoints (ask endpoint pattern)
- domain_sync tunnel message protocol for real-time cross-system sync with batch reconnect
- Conditional Caddy integration based on tunnel mode status

### Key Lessons
1. Cross-phase integration checks should happen earlier — not just at milestone audit. The dns-polling wiring gap would have been caught if Phase 08 or 09 had checked Phase 07's startup integration.
2. Tunnel message handlers need bidirectional coverage — if LivOS sends `domain_sync` to relay, the relay needs a `case 'domain_sync':` handler. Check both directions during planning.
3. Background jobs (polling, cron) need explicit "wire to startup" tasks in plans — code that's exported but never imported is dead code.

### Cost Observations
- Model mix: ~60% opus (research, planning, execution), ~30% sonnet (verification, checking), ~10% haiku
- Notable: Single-plan Phase 10.1 executed efficiently with 3 tasks, all in one wave

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v19.0 | 5 | 10 | First milestone with decimal sub-phase (10.1), integration checker at audit |

### Cumulative Quality

| Milestone | Verification Score | Integration Gaps | Tech Debt Items |
|-----------|-------------------|------------------|-----------------|
| v19.0 | 43/43 must-haves (100%) | 2 cross-phase gaps | 7 items |

### Top Lessons (Verified Across Milestones)

1. Always verify background jobs are wired to startup — exported but unimported is dead code
2. Cross-phase message handlers need bidirectional validation during planning
