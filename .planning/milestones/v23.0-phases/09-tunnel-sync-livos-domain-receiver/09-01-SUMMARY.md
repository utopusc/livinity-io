---
phase: 09-tunnel-sync-livos-domain-receiver
plan: 01
subsystem: tunnel, protocol, database
tags: [websocket, domain-sync, redis, postgresql, relay, tunnel-protocol]

# Dependency graph
requires:
  - phase: 08-relay-integration-custom-domain-routing
    provides: "Custom domain TLS, routing, and Redis cache on relay"
provides:
  - "TunnelDomainSync, TunnelDomainSyncAck, TunnelDomainListSync protocol messages"
  - "Relay /internal/domain-sync POST endpoint for forwarding domain_sync to tunnels"
  - "domain_list_sync sent on tunnel connect/reconnect for full state reconciliation"
  - "LivOS domain sync handlers storing domains in Redis per-domain and list keys"
  - "LivOS custom_domains PostgreSQL table for persistent domain storage"
  - "DNS polling triggers domain_sync on dns_verified and dns_changed transitions"
  - "app_mapping JSONB column on custom_domains table (relay + platform)"
affects: [09-02, 10-livos-domain-ui-caddy-proxy]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Redis per-key + list dual cache for O(1) lookup and iteration", "domain_list_sync full-state reconciliation on reconnect"]

key-files:
  created:
    - platform/web/src/db/migrations/0006_add_app_mapping.sql
  modified:
    - platform/relay/src/protocol.ts
    - platform/relay/src/index.ts
    - platform/relay/src/server.ts
    - platform/relay/src/schema.sql
    - platform/web/src/lib/dns-polling.ts
    - platform/web/src/db/schema.ts
    - livos/packages/livinityd/source/modules/platform/tunnel-client.ts
    - livos/packages/livinityd/source/modules/database/schema.sql

key-decisions:
  - "Redis dual-key pattern: livos:custom_domain:{hostname} for O(1) gateway lookup + livos:custom_domains list for iteration"
  - "domain_list_sync on both new connect and reconnect ensures LivOS always has latest domain state"
  - "dns-polling triggers sync after DB update, gracefully handles offline tunnels (reconnect catches up)"

patterns-established:
  - "Domain sync pipeline: platform -> relay /internal/domain-sync -> tunnel WebSocket -> LivOS Redis"
  - "Reconnect resilience: full state sync (domain_list_sync) on every tunnel connect, not just incremental"

requirements-completed: [DOM-03, DOM-07]

# Metrics
duration: 4min
completed: 2026-03-26
---

# Phase 09 Plan 01: Domain Sync Protocol + LivOS Receiver Summary

**Domain sync pipeline from platform through relay to LivOS with Redis storage, reconnect resilience, and DNS re-verification triggers**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-26T11:41:23Z
- **Completed:** 2026-03-26T11:45:57Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Full domain sync protocol: TunnelDomainSync, TunnelDomainSyncAck, TunnelDomainListSync message types in both codebases
- End-to-end sync pipeline: DNS verification -> dns-polling -> relay /internal/domain-sync -> tunnel WebSocket -> LivOS Redis
- Reconnect resilience via domain_list_sync sent on every tunnel connect/reconnect with all verified/active domains
- app_mapping JSONB column added to custom_domains table (relay schema, Drizzle schema, migration)

## Task Commits

Each task was committed atomically:

1. **Task 1: Protocol types + LivOS database + tunnel-client domain handlers** - `406ecdf` (feat)
2. **Task 2: Relay domain-sync endpoint + domain_list_sync on connect + dns-polling sync trigger** - `3c3ab76` (feat)

## Files Created/Modified
- `platform/relay/src/protocol.ts` - Added 3 new domain sync protocol message types + updated union types and MessageTypeMap
- `platform/relay/src/index.ts` - sendDomainListSync helper called on connect/reconnect, domain_sync_ack handler
- `platform/relay/src/server.ts` - /internal/domain-sync POST endpoint forwarding domain_sync to tunnel
- `platform/relay/src/schema.sql` - app_mapping JSONB column on custom_domains
- `platform/web/src/db/schema.ts` - app_mapping column in Drizzle schema
- `platform/web/src/db/migrations/0006_add_app_mapping.sql` - Migration for app_mapping column
- `platform/web/src/lib/dns-polling.ts` - notifyRelayDomainSync triggers on dns_verified and dns_changed
- `livos/packages/livinityd/source/modules/platform/tunnel-client.ts` - Domain sync protocol types, handleDomainSync/handleDomainListSync/rebuildDomainCache methods
- `livos/packages/livinityd/source/modules/database/schema.sql` - custom_domains table for LivOS local persistence

## Decisions Made
- Used Redis dual-key pattern (per-domain key + full list) for optimal gateway lookup performance
- domain_list_sync sent on both new connections and reconnections for full state reconciliation
- dns-polling notifies relay after DB update; gracefully handles offline tunnels since reconnect sync covers gaps

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all handlers fully implemented with Redis storage, ack responses, and error handling.

## Next Phase Readiness
- Protocol types ready for Plan 02 domain-to-app mapping implementation
- app_mapping column available for storing subdomain-to-app routing configuration
- LivOS Redis keys (`livos:custom_domain:{hostname}`, `livos:custom_domains`) ready for app gateway consumption

## Self-Check: PASSED

All 9 files verified present. Both task commits (406ecdf, 3c3ab76) verified in git log.

---
*Phase: 09-tunnel-sync-livos-domain-receiver*
*Completed: 2026-03-26*
