# Phase 09: Tunnel Sync + LivOS Domain Receiver - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds 3 new tunnel protocol message types (domain_sync, domain_sync_ack, domain_list_sync), extends LivOS to receive and persist domain config from the platform, extends the app gateway middleware to route custom domain hostnames to the correct Docker containers, and adds domain-to-app mapping with subdomain support. Also adds periodic DNS re-verification (12h) with status transitions.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — infrastructure phase. Key constraints from research:
- 3 new tunnel message types follow existing protocol patterns (see platform/relay/src/protocol.ts)
- domain_sync: add/update/remove a single domain
- domain_sync_ack: LivOS confirms receipt
- domain_list_sync: full domain list on tunnel reconnect
- LivOS stores domains in local PostgreSQL + Redis cache
- App gateway: after *.mainDomain check fails, check custom domain hostname in Redis
- Domain-to-app mapping: custom_domain_mappings table (domain, app_id, path_prefix)
- Subdomain support: api.mysite.com -> different app than mysite.com
- DNS re-verification every 12 hours, transitions to dns_changed if A record no longer points to relay IP
- Platform sends domain_sync on verification; LivOS syncs full list on reconnect

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- LivOS tunnel client at `livos/packages/livinityd/source/modules/tunnel/`
- App gateway middleware at `livos/packages/livinityd/source/server/index.ts`
- Existing tunnel protocol types at `platform/relay/src/protocol.ts`
- LivOS PostgreSQL schema at `livos/packages/livinityd/source/modules/database/schema.sql`
- Redis used for ephemeral state in LivOS

### Established Patterns
- Tunnel messages are JSON with `type` field
- App gateway reads domain config from Redis and routes based on subdomain
- Per-user Docker isolation with compose templating
- tRPC for LivOS API routes

### Integration Points
- Platform tunnel client: send domain_sync after DNS verification
- Relay: forward domain_sync messages between platform and LivOS
- LivOS tunnel handler: receive domain_sync, store locally
- App gateway middleware: add custom domain hostname lookup

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
