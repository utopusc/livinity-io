---
gsd_state_version: 1.0
milestone: v19.0
milestone_name: Custom Domain Management
status: unknown
stopped_at: Completed 10-01-PLAN.md
last_updated: "2026-03-26T12:29:14.508Z"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 9
  completed_plans: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-26)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v19.0 -- Custom Domain Management
**Current focus:** Phase 10 — LivOS Domains UI + Dashboard Polish

## Current Position

Phase: 10
Plan: Not started

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: --
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

| Phase 07 P01 | 3min | 2 tasks | 6 files |
| Phase 07 P02 | 3min | 2 tasks | 2 files |
| Phase 08 P01 | 3min | 2 tasks | 5 files |
| Phase 08 P02 | 2min | 2 tasks | 3 files |
| Phase 09 P01 | 4min | 2 tasks | 9 files |
| Phase 09-tunnel-sync-livos-domain-receiver P02 | 3min | 2 tasks | 4 files |
| Phase 09 P03 | 3min | 1 tasks | 1 files |
| Phase 10 P02 | 2min | 1 tasks | 1 files |
| Phase 10 P01 | 4min | 2 tasks | 4 files |

### Decisions

- v19.0 continues phase numbering from v18.0 (Phase 7 is first phase)
- Domains managed on both livinity.io (add/verify) and LivOS (connect to apps via Caddy)
- Domain sync via existing tunnel relay WebSocket
- DNS verification: A record (routing) + TXT record (ownership)
- Domain->app mapping supports subdomains (mysite.com->app1, blog.mysite.com->app2)
- Auto SSL via Let's Encrypt (Caddy on_demand_tls on relay)
- Domains tab added to existing Servers/Docker app (not a new app)
- Zero new npm dependencies -- Node.js built-ins + existing infrastructure
- Relay's existing on_demand_tls ask endpoint extended for custom domains (not Caddy Admin API)
- LivOS in tunnel mode does NOT need Caddy changes -- relay terminates TLS
- Custom domains = direct access only (A record to relay IP), not through CF tunnel
- [Phase 07]: Used node:dns/promises + Cloudflare DoH dual-check for DNS verification
- [Phase 07]: Free tier domain limit of 3 enforced at API level
- [Phase 07]: Blocked livinity.io/livinity.app from custom domain registration (security)
- [Phase 07]: Domain list fetched alongside dashboard data on 10s polling interval
- [Phase 07]: DNS polling: 30s base interval with per-domain age-based throttling (30s fast / 5min slow)
- [Phase 08]: Custom domain check runs only as fallback after parseSubdomain (preserves existing routing)
- [Phase 08]: Negative cache 30s TTL prevents repeated DB queries for unknown domains
- [Phase 08]: Parent domain fallback: subdomains of verified custom domains inherit TLS authorization
- [Phase 08]: Custom domain HTTP/WS routing runs only as fallback after parseSubdomain -- preserves existing routing
- [Phase 08]: handleWsUpgrade uses optional targetAppOverride param; null for custom domains until Phase 09 app mapping
- [Phase 09]: Redis dual-key pattern: livos:custom_domain:{hostname} for O(1) gateway lookup + livos:custom_domains list for iteration
- [Phase 09]: domain_list_sync on both new connect and reconnect ensures LivOS always has latest domain state
- [Phase 09]: dns-polling notifies relay after DB update; gracefully handles offline tunnels since reconnect sync covers gaps
- [Phase 09]: Custom domain traffic is public-facing (no LivOS auth required)
- [Phase 09]: appGatewayProxyCache moved to class property for shared access between subdomain and custom domain routing
- [Phase 09]: resolveCustomDomainApp returns null for unmapped prefixes, allowing graceful fallback
- [Phase 09]: Use getPool() module-level singleton for PG access in tunnel-client instead of constructor injection
- [Phase 09]: PG writes are non-blocking alongside Redis: failures logged but do not break domain sync flow
- [Phase 10]: SSL status shown only for active and dns_verified domains; error banner placed between header and DNS instructions
- [Phase 10]: Used sendDeviceMessage (public) for tunnel notifications in domain CRUD routes
- [Phase 10]: Domain polling at 10s interval matching existing dashboard polling pattern

### Pending Todos

None

### Blockers/Concerns

- ACME HTTP-01 challenge requires domain to point directly to relay IP (not through CDN/proxy)
- DNS propagation delays (up to 48h) may frustrate users -- need clear UX messaging

## Session Continuity

Last session: 2026-03-26T12:26:08.910Z
Stopped at: Completed 10-01-PLAN.md
Resume file: None
