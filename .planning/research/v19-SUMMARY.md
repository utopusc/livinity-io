# Research Summary: v19.0 Custom Domain Management

**Domain:** SaaS custom domain provisioning with auto-SSL
**Researched:** 2026-03-26
**Overall confidence:** HIGH

## Executive Summary

Custom domain management for Livinity requires zero new npm dependencies. The entire feature builds on existing infrastructure: Caddy's on-demand TLS (already configured in the relay Caddyfile), Node.js built-in `dns/promises` module (already used in `dns-check.ts`), `node:crypto` for token generation, and the existing tunnel WebSocket protocol for syncing domain config from platform to LivOS.

The key architectural insight is that the relay's Caddyfile already has `on_demand_tls` with an `ask` endpoint at `http://localhost:4000/internal/ask`. This endpoint currently validates livinity.io subdomains. Extending it to also validate custom domains from a `custom_domains` PostgreSQL table is the minimal-effort, battle-tested approach used by Pirsch, Honeybadger, and other SaaS companies running Caddy.

The LivOS side needs only a small extension to `caddy.ts` (adding custom domain blocks to the generated Caddyfile) and a new tunnel protocol message type (`domain_sync`) to receive domain configuration from the platform.

Let's Encrypt rate limits are not a concern at Livinity's current scale (50 new certs per registered domain per week, 300 new orders per 3 hours per ACME account). Custom domains each count against their own registered domain, not against livinity.io. Renewals are exempt from rate limits.

## Key Findings

**Stack:** Zero new dependencies. Node.js built-ins (`dns/promises`, `crypto`) + existing Caddy on-demand TLS + Drizzle ORM.
**Architecture:** Extend relay's existing ask endpoint for custom domain validation; add `custom_domains` table; sync via tunnel protocol.
**Critical pitfall:** The Caddy ask endpoint must respond in milliseconds (official docs requirement). Use PostgreSQL with indexed domain column + Redis cache.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Database + API** - Add `custom_domains` table, Drizzle schema, CRUD API routes on livinity.io
   - Addresses: Domain registration, verification token generation
   - Avoids: Building UI before API is stable

2. **DNS Verification** - TXT record + A record verification, polling loop, status lifecycle
   - Addresses: Domain ownership proof, DNS propagation checking
   - Avoids: Issuing certs for unverified domains (abuse vector)

3. **Relay Integration** - Extend ask endpoint, add Caddyfile catch-all, custom domain routing
   - Addresses: SSL provisioning, request routing to correct tunnel
   - Avoids: Breaking existing subdomain routing

4. **Tunnel Sync + LivOS** - Domain sync protocol messages, LivOS Caddy config extension
   - Addresses: Domain-to-app mapping, per-app reverse proxy on LivOS
   - Avoids: Manual LivOS configuration

5. **Dashboard UI** - Domains tab on livinity.io, DNS instruction display, status indicators
   - Addresses: User-facing domain management, Domains tab in Servers app
   - Avoids: Building UI before backend is validated

**Phase ordering rationale:**
- Database must exist before DNS verification can store results
- DNS verification must work before relay can authorize certs
- Relay integration must work before tunnel sync makes sense
- UI is last because it's the thinnest layer over the API

**Research flags for phases:**
- Phase 3: May need careful testing of Caddyfile ordering (catch-all vs explicit blocks)
- Phase 4: Tunnel sync reliability needs thought (what if LivOS is offline when domain is verified?)
- Phase 5: Standard CRUD UI, unlikely to need research

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (zero deps) | HIGH | Verified all capabilities exist in existing codebase |
| Caddy on-demand TLS | HIGH | Docs + existing config + multiple SaaS references |
| DNS verification | HIGH | Node.js built-in, existing dns-check.ts as template |
| Let's Encrypt limits | HIGH | Official 2026 documentation verified |
| Tunnel protocol sync | HIGH | Follows established protocol patterns |
| Database schema | HIGH | Follows existing Drizzle + SQL patterns |

## Gaps to Address

- Wildcard custom domains (*.mysite.com) require DNS-01 challenge -- deferred
- CNAME vs A record support -- recommend supporting both eventually, A record first
- Domain limits per user (free tier vs premium) -- product decision
- Offline LivOS handling for domain sync -- needs retry/queue mechanism
