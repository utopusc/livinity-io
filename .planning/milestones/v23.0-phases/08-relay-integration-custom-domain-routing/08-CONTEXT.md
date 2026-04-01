# Phase 08: Relay Integration + Custom Domain Routing - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase extends the tunnel relay (Server5) to serve custom domains with auto-SSL via Caddy's on_demand_tls. The relay's existing ask endpoint is extended to authorize verified custom domains, a Caddyfile catch-all block handles custom domain traffic, and Redis caches domain lookups for <5ms response times. No LivOS changes, no dashboard UI — relay infrastructure only.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Key constraints from research:
- Caddy on_demand_tls ask endpoint must respond within 200ms
- Only authorize domains with status `dns_verified` or `active` in the database
- Catch-all https:// block must be ordered AFTER explicit *.livinity.io blocks
- Redis cache for domain lookups with TTL (e.g., 60s)
- Custom domain -> username mapping for tunnel routing via Host header

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Relay Caddyfile already has `on_demand_tls` with ask endpoint at `http://localhost:4000/internal/ask`
- Platform PostgreSQL `custom_domains` table (created in Phase 07) — source of truth
- Relay already routes *.livinity.io subdomains through tunnel
- Existing tunnel WebSocket protocol with established message patterns

### Established Patterns
- Relay is a Node.js Express server on Server5
- Redis used for ephemeral state (tunnel connections, device state)
- Caddy config managed via Caddyfile (reload with `caddy reload`)
- Ask endpoint validates subdomains against known patterns

### Integration Points
- `/internal/ask` endpoint — extend to check custom_domains table
- Caddyfile — add catch-all https:// block for custom domains
- Tunnel routing logic — add Host header lookup for custom domains
- Redis — add domain cache layer

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
