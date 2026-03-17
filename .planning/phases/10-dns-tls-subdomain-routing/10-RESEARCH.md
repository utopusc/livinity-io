# Phase 10 Research: DNS, TLS & Subdomain Routing

## Domain: What this phase does

Phase 10 connects the relay server (Phase 9) to the public internet via DNS and TLS. After this phase, `https://{username}.livinity.io` resolves to Server5, terminates TLS, and proxies through Caddy to the relay on port 4000.

## Requirements

| ID | Requirement |
|----|-------------|
| DNS-01 | Wildcard DNS `*.livinity.io` A record → Server5 IP via Cloudflare |
| DNS-02 | Caddy On-Demand TLS for `{username}.livinity.io` via DNS-01 challenge |
| DNS-03 | Caddy On-Demand TLS for `{app}.{username}.livinity.io` via DNS-01 challenge |
| DNS-04 | Caddy `ask` endpoint validates subdomain against registered users before issuing cert |
| DNS-05 | Caddy `stream_close_delay 5m` to prevent WebSocket drops on reload |
| DNS-06 | Relay parses two-level subdomains (already done in Phase 9: subdomain-parser.ts) |

## Current State (from Phase 9)

- **Server5**: 45.137.194.102, relay on port 4000 (PM2)
- **PostgreSQL**: `platform` DB with `users` table (has `testuser`)
- **Redis**: running with auth
- **Caddy**: installed (`apt install caddy`) but **NOT configured** — default service stopped/disabled
- **DNS**: livinity.io domain on Cloudflare (user manages)
- **subdomain-parser.ts**: Already handles `{username}.livinity.io` and `{app}.{username}.livinity.io` (DNS-06 done)

## Technical Approach

### DNS-01: Cloudflare Wildcard DNS
- Add `*.livinity.io` A record → 45.137.194.102 on Cloudflare
- Add `livinity.io` A record → 45.137.194.102 (bare domain)
- Cloudflare proxy MUST be **OFF** (DNS only, grey cloud) — Caddy needs direct TLS termination
- This is a one-time manual Cloudflare dashboard action

### DNS-02/03: Caddy On-Demand TLS
- Caddy v2 supports **on_demand TLS** — issues certs automatically when a request arrives for a new hostname
- Uses **Let's Encrypt** (ACME) with either:
  - **HTTP-01 challenge**: Caddy serves `/.well-known/acme-challenge/` on port 80 (simplest)
  - **TLS-ALPN-01 challenge**: Uses port 443 (also works)
  - **DNS-01 challenge**: Uses Cloudflare API to create TXT records (handles wildcards, but overkill here since on-demand TLS issues individual certs, not a wildcard cert)
- **Best approach**: HTTP-01 challenge (simplest, Caddy handles it natively)
- On-demand TLS requires an `ask` endpoint (DNS-04) to prevent abuse

### DNS-04: Ask Endpoint
- Caddy's `on_demand_tls` block has an `ask` config: URL that Caddy queries before issuing a cert
- Caddy sends `GET {ask_url}?domain={hostname}` — if 200, issue cert; if non-200, refuse
- The relay server already has an HTTP server on port 4000 — add an `/internal/ask` endpoint
- The ask endpoint:
  1. Parse subdomain from the requested hostname
  2. Query `users` table to check if the username exists
  3. Return 200 if valid user, 404 if not
- This prevents attackers from requesting certs for random subdomains (Let's Encrypt rate limiting attack)

### DNS-05: stream_close_delay
- Caddy Caddyfile: `servers { stream_close_delay 5m }` in global options
- Prevents WebSocket connections from being killed when Caddy reloads its config
- Critical for tRPC subscriptions and terminal sessions

### Caddyfile Configuration
```
{
    on_demand_tls {
        ask http://localhost:4000/internal/ask
    }
    servers {
        stream_close_delay 5m
    }
}

*.livinity.io, livinity.io {
    tls {
        on_demand
    }
    reverse_proxy localhost:4000
}
```

Key points:
- Single catch-all site block for all subdomains
- `reverse_proxy localhost:4000` sends all traffic to the relay
- WebSocket proxying works automatically with Caddy's reverse_proxy
- Caddy handles HTTP→HTTPS redirect automatically

## Implementation Plan

### Plan 1: Add ask endpoint to relay + Caddyfile
1. Add `/internal/ask` endpoint to relay server.ts
2. Create Caddyfile
3. Configure Cloudflare DNS (manual step)
4. Deploy to Server5 and verify

### What's already done (DNS-06)
- `subdomain-parser.ts` already handles two-level subdomains
- No code changes needed for DNS-06

## Risks & Mitigations
- **Let's Encrypt rate limits**: ask endpoint prevents abuse
- **Caddy port 80 conflict**: stop any existing services on port 80
- **Cloudflare proxy**: MUST be DNS-only (grey cloud), not proxied (orange cloud)
