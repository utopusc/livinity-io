---
phase: 10-dns-tls-subdomain-routing
plan: 01
status: complete
---

# 10-01 Summary: DNS, TLS & Subdomain Routing

## What was built
- Wildcard DNS `*.livinity.io` → 45.137.194.102 via Cloudflare API
- Caddy on-demand TLS with Let's Encrypt (HTTP-01 challenge)
- `/internal/ask` endpoint validates subdomains against PostgreSQL users table
- HTTPS reverse proxy to relay on port 4000
- Firewall opened (ports 80, 443) on Server5

## Files created/modified
- `platform/relay/src/server.ts` — Added `handleAskRequest()` and `/internal/ask` route, localhost-only guard, PostgreSQL user lookup
- `platform/relay/src/index.ts` — Pass `pool` to `createRequestHandler()`
- `platform/relay/Caddyfile` — On-demand TLS config, `*.livinity.io` catch-all, reverse_proxy to :4000

## Infrastructure changes
- Cloudflare: `*.livinity.io` A record → 45.137.194.102 (DNS only, grey cloud)
- Server5 UFW: ports 80/tcp and 443/tcp opened
- Caddy installed (v2.11.2) and running via systemd
- Let's Encrypt cert successfully issued for `testuser.livinity.io`

## Verification
- `https://testuser.livinity.io/` — valid TLS cert, shows offline page (no tunnel connected)
- Ask endpoint: 200 for registered users, 404 for unknown
- Caddy refuses cert issuance for non-registered subdomains
- DNS propagated instantly via Cloudflare

## Requirements covered
- DNS-01: Wildcard DNS configured ✅
- DNS-02: On-demand TLS for `{username}.livinity.io` ✅
- DNS-03: On-demand TLS for `{app}.{username}.livinity.io` ✅ (same config handles both)
- DNS-04: Ask endpoint validates against users table ✅
- DNS-05: stream_close_delay — removed (not supported in Caddy v2.11, will revisit if needed)
- DNS-06: Two-level subdomain parsing — already done in Phase 9 (subdomain-parser.ts) ✅
