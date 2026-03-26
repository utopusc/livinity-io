# Feature Landscape: v19.0 Custom Domain Management

**Domain:** Custom domain management for self-hosted server platform
**Researched:** 2026-03-26
**Overall confidence:** HIGH

## Executive Summary

Custom domain management is a well-understood problem space with mature patterns established by Vercel, Netlify, Cloudflare Pages, Coolify, and CapRover. The core challenge is not technical novelty but UX polish: users are accustomed to the "add domain, get DNS instructions, wait for verification, auto-SSL" flow from cloud platforms, and anything less smooth feels broken. Livinity's unique twist is the two-tier architecture -- domains are registered on livinity.io (platform) but must sync to LivOS (self-hosted server) via tunnel relay for actual traffic routing and SSL provisioning.

The existing LivOS codebase already has a well-structured domain module (`domain/caddy.ts`, `domain/routes.ts`, `domain/dns-check.ts`) with Caddyfile generation, DNS verification, and subdomain-to-app mapping. v19.0 extends this by adding platform-side domain registration, TXT-based ownership verification, and a sync protocol that bridges the platform dashboard to the self-hosted Caddy instance.

## Table Stakes

Features users expect from any modern hosting platform. Missing any of these makes the product feel incomplete or amateur.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Add domain via dashboard | Every competitor has this -- Vercel, Netlify, Coolify, CapRover all start here | Low | Simple form: domain name input + validation |
| DNS record instructions | Users need exact A/CNAME/TXT records to configure. Vercel and Netlify show copy-to-clipboard instructions | Low | Show server IP for A record, TXT token for verification |
| DNS verification polling | Vercel checks every 20 seconds, Netlify shows "Pending DNS verification" badge | Medium | Must query authoritative DNS, not local resolvers. Existing `dns-check.ts` does A record verification already |
| Domain status indicators | Visual states: pending, verified, active, error. Vercel uses "Valid Configuration" / "Pending Verification" / "Invalid Configuration" | Low | Color-coded badges in UI (yellow=pending, green=active, red=error) |
| Auto-SSL via Let's Encrypt | Caddy handles this natively. CapRover, Coolify, Vercel all auto-provision SSL | Low | Caddy on-demand TLS or per-domain blocks. Existing `caddy.ts` already generates HTTPS blocks |
| Remove domain | Ability to detach a domain. All platforms support this | Low | Delete from DB, remove from Caddyfile, reload Caddy |
| Multiple domains per server | Users want apex + www, or multiple projects on one server. Coolify supports comma-separated FQDNs | Medium | Already supported via subdomain system in `routes.ts` |
| Domain-to-app mapping | Route `mysite.com` to a specific Docker container/app. Coolify and CapRover both do this | Medium | Extend existing `SubdomainConfig` to support full custom domains, not just subdomains of the main domain |
| Manual "Check Now" button | Users want to trigger DNS verification on demand, not just wait for polling. Identified as UX best practice by real-world implementers | Low | Button that calls `verifyDns` endpoint immediately |
| HTTPS enforcement | Redirect HTTP to HTTPS after SSL is active. Vercel and Netlify do this by default | Low | Caddy does this automatically when domain blocks use HTTPS |

## Differentiators

Features that set Livinity apart from competitors. Not expected by users but create real value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Platform-to-server domain sync | Unique to Livinity: register domains on livinity.io, auto-sync to LivOS via tunnel WebSocket. No competitor does this because none have the two-tier architecture | High | New tunnel message types: `domain_sync`, `domain_remove`. Platform pushes domain configs to LivOS |
| Subdomain routing matrix | Map `api.mysite.com` to app A, `blog.mysite.com` to app B, `mysite.com` to app C. Coolify supports this but UX is per-app, not a unified view | Medium | Domain management tab shows all mappings in a table with dropdown selectors for target apps |
| One-click domain health check | Show DNS propagation status, SSL certificate expiry, and response time in a single dashboard card | Medium | Combines `dns-check.ts` with Caddy certificate info and HTTP health probe |
| Domain verification via TXT record | Prove domain ownership before routing traffic. Vercel and Netlify both require this. Prevents domain hijacking | Medium | Generate unique verification token, check `_livinity-verify.domain.com` TXT record |
| Real-time status websocket updates | Push domain status changes to the UI instantly via existing tRPC subscriptions or tunnel relay. Vercel checks every 20s; we can do better with server-push | Medium | When DNS verification succeeds during background polling, push update to both platform dashboard and LivOS UI |
| Wildcard subdomain support | `*.mysite.com` catches all subdomains -- new apps automatically get subdomains without DNS changes | High | Requires Caddy DNS-01 challenge (needs Cloudflare plugin or HTTP-01 for individual certs). Defer to later -- not table stakes |

## Anti-Features

Features to explicitly NOT build in v19.0. These add complexity without proportional value at this stage.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Domain purchasing/registration | Requires registrar integration (complex, regulated, costly). Not in scope for a self-hosted platform | Show link to recommended registrars (Cloudflare, Namecheap, Porkbun) |
| DNS hosting (full zone management) | Massive scope creep -- building a DNS provider is a product unto itself | Only verify records; let users manage DNS at their registrar |
| Wildcard domain with DNS-01 challenge | Requires Caddy DNS provider plugins (Cloudflare, etc.) and API credentials from users. Complex error handling | Support individual subdomain A records. Wildcard is future enhancement |
| Custom SSL certificates (bring-your-own) | 99% of users want auto Let's Encrypt. Custom certs add UI complexity for edge cases | Only support Let's Encrypt auto-provisioning via Caddy |
| Domain analytics/traffic stats per domain | Useful but separate feature. Requires request logging pipeline | Defer to monitoring milestone |
| CDN/edge caching per custom domain | Would require Cloudflare proxy integration or custom edge nodes | Traffic goes direct to server. CDN is out of scope |
| Email/MX record management | Hosting platform, not email provider. Vercel explicitly does not do this either | Document that MX records are user's responsibility |
| Multi-region/geo-routing | Single-server architecture. No anycast or multi-PoP | Single server, single IP. Simple A record |

## Domain Lifecycle States

The complete state machine for a custom domain, synthesized from Vercel, Netlify, and real-world implementation experience.

### State Diagram

```
[added] ---> [pending_dns] ---> [dns_verified] ---> [ssl_provisioning] ---> [active]
   |              |                    |                     |                   |
   |              |                    |                     |                   v
   |              v                    v                     v              [ssl_renewal]
   |         [dns_failed]        [dns_changed]         [ssl_failed]            |
   |              |                    |                     |                  v
   v              v                    v                     v              [active]
[removed]    [pending_dns]        [pending_dns]         [error]
```

### State Definitions

| State | Display Label | Badge Color | Description |
|-------|--------------|-------------|-------------|
| `added` | Awaiting Configuration | Gray | Domain registered in system, DNS instructions shown, no verification attempted yet |
| `pending_dns` | Checking DNS... | Yellow (pulsing) | System is polling DNS records. A record must point to server IP, TXT record must contain verification token |
| `dns_verified` | DNS Verified | Blue | Both A and TXT records confirmed. Ready for SSL provisioning |
| `ssl_provisioning` | Issuing SSL Certificate... | Blue (pulsing) | Caddy is obtaining Let's Encrypt certificate. Takes 5-30 seconds for HTTP-01 challenge |
| `active` | Active | Green | Domain is fully configured: DNS verified, SSL active, traffic routing confirmed |
| `dns_failed` | DNS Check Failed | Orange | DNS records not found or pointing to wrong IP. Show specific error (wrong IP, missing TXT, NXDOMAIN) |
| `ssl_failed` | SSL Error | Red | Let's Encrypt certificate issuance failed. Common causes: CAA records blocking, rate limits, port 80 blocked |
| `dns_changed` | DNS Changed | Orange | Was previously active but DNS records no longer resolve correctly. Domain may have been unconfigured at registrar |
| `error` | Configuration Error | Red | Generic error state with descriptive message |
| `removed` | (deleted) | -- | Domain removed from system, Caddy config updated |

### Granular Status Messages (UX Best Practice from Vercel implementers)

Instead of just "Pending", show specific progress:
- "Waiting for A record -- point `mysite.com` to `45.137.194.103`"
- "A record found, checking TXT verification..."
- "DNS verified! Provisioning SSL certificate..."
- "SSL certificate issued. Domain is live!"

## UX Flow: Step-by-Step

### Flow A: Platform Dashboard (livinity.io)

1. **Add Domain** -- User clicks "Add Domain" button in dashboard
   - Input field: domain name (e.g., `mysite.com`)
   - Client-side validation: valid domain format, not already added
   - Server-side check: domain not owned by another user
   - Result: domain created with status `added`

2. **DNS Instructions** -- System shows configuration panel
   - A record: `mysite.com` -> `{server_ip}` (auto-detected from user's LivOS)
   - TXT record: `_livinity-verify.mysite.com` -> `livinity-verify={unique_token}`
   - Copy buttons for each value
   - Link to "How to configure DNS" guide
   - Show which registrar the domain appears to use (WHOIS lookup, optional)

3. **Verification Polling** -- Background polling begins
   - Poll every 30 seconds (not too aggressive to avoid DNS query limits)
   - Check A record first (faster to propagate)
   - Then check TXT record for ownership verification
   - Show progress: "Checking DNS records..." with spinner
   - Manual "Check Now" button for impatient users
   - Timeout message after 48h: "DNS changes can take up to 48 hours. If this persists, double-check your DNS configuration."

4. **Domain Sync** -- Platform pushes domain config to LivOS via tunnel
   - New tunnel message: `domain_sync` with domain name, verification token, target mapping
   - LivOS receives, adds to its domain table, updates Caddy config
   - Confirmation flows back: `domain_sync_ack` with SSL status

5. **Active State** -- Domain card shows green "Active" badge
   - Shows: domain name, SSL expiry date, mapped app (if configured), "Visit" link
   - Actions: "Manage", "Remove"

### Flow B: LivOS Domains Tab (Servers app)

1. **Domains List** -- New tab in existing Servers/Docker app
   - Table: Domain | Status | Mapped App | SSL Expiry | Actions
   - Domains synced from platform appear with "Platform" source badge
   - Locally-configured domains (existing system) appear with "Local" source badge

2. **Map to App** -- Click domain row, select target app
   - Dropdown of running Docker containers
   - Port auto-detected from container config
   - Subdomain routing: `api.mysite.com` -> container A, `mysite.com` -> container B
   - "Apply" saves mapping, updates Caddy, reloads

3. **Status Monitoring** -- Each domain shows current status
   - Green dot: serving traffic
   - Yellow dot: SSL renewal pending
   - Red dot: DNS changed or SSL error
   - Click for details panel with DNS records, certificate info, last health check

### Flow C: Error Recovery

1. **DNS Not Found** -- Show specific instructions
   - "The A record for `mysite.com` is not pointing to `45.137.194.103`"
   - "Current value: `(not found)` or `192.168.1.1` (wrong IP)"
   - "Steps: Go to your DNS provider, create an A record..."

2. **SSL Failed** -- Show diagnostic info
   - Link to Let's Debug (https://letsdebug.net) for diagnostics
   - Check for CAA record conflicts
   - Check if port 80 is reachable (HTTP-01 challenge requirement)
   - Retry button

3. **Domain Conflict** -- Domain already claimed by another user
   - "This domain is already registered on another Livinity account"
   - "To use this domain, you must verify ownership via TXT record"

## Feature Dependencies

```
Add Domain (platform) --> DNS Instructions (platform)
DNS Instructions --> DNS Verification Polling (platform)
DNS Verification Polling --> Domain Sync via Tunnel (platform -> LivOS)
Domain Sync via Tunnel --> Caddy Config Generation (LivOS)
Caddy Config Generation --> SSL Provisioning (LivOS/Caddy)
SSL Provisioning --> Active Status (both)

Domain-to-App Mapping (LivOS) --> Caddy Config Generation (LivOS)
Domain-to-App Mapping requires: Running Docker containers (existing)

TXT Ownership Verification --> DNS Verification Polling
Domains Tab UI (LivOS) --> Domain Sync via Tunnel (must receive synced domains)
```

### Critical Path

```
Platform DB schema -> Add Domain API -> DNS check service -> Tunnel sync protocol -> LivOS domain receiver -> Caddy config extension -> SSL -> Active
```

## Competitor Comparison Matrix

| Feature | Vercel | Netlify | Coolify | CapRover | Livinity v19.0 |
|---------|--------|---------|---------|----------|----------------|
| Add custom domain | Yes | Yes | Yes | Yes | Yes |
| DNS instructions | Yes (A/CNAME/NS) | Yes (A/CNAME/TXT) | Manual | Manual | Yes (A + TXT) |
| Auto DNS verification | Yes (20s polling) | Yes | No | No | Yes (30s polling) |
| TXT ownership verification | Yes | Yes | No | No | Yes |
| Auto-SSL (Let's Encrypt) | Yes | Yes | Yes (Caddy/Traefik) | Yes (nginx/certbot) | Yes (Caddy) |
| Domain-to-app mapping | Per-project | Per-site | Per-service | Per-app | Per-app with subdomain matrix |
| Wildcard subdomains | Yes (NS method) | Yes (Netlify DNS) | Yes (Traefik) | Yes | No (defer) |
| Domain purchasing | Yes | Yes | No | No | No |
| Status UI granularity | 3 states | 2 states | Binary | Binary | 8+ states (best-in-class) |
| Platform-to-server sync | N/A (SaaS) | N/A (SaaS) | N/A (single server) | N/A (single server) | Yes (unique feature) |
| Real-time status push | Limited | No | No | No | Yes (WebSocket) |
| On-demand TLS | No | No | Caddy option | No | Caddy on-demand (future) |

## MVP Recommendation

### Phase 1 (Must Ship)

1. **Add domain on livinity.io** -- Platform CRUD with PostgreSQL storage
2. **DNS instructions** -- Show A record + TXT verification record with copy buttons
3. **DNS verification polling** -- 30-second background check on platform, manual "Check Now"
4. **TXT ownership verification** -- Prevent domain hijacking across users
5. **Tunnel sync protocol** -- New `domain_sync` / `domain_remove` messages
6. **LivOS domain receiver** -- Accept synced domains, store in Redis/PostgreSQL
7. **Caddy config for custom domains** -- Extend `generateFullCaddyfile()` to add custom domain blocks
8. **Auto-SSL via Caddy** -- Let's Encrypt certificate auto-provisioning (already native to Caddy)
9. **Domain status tracking** -- Full lifecycle state machine with granular messages
10. **Domains tab in Servers app** -- Table view with status badges

### Phase 2 (Ship After Core Works)

1. **Domain-to-app mapping** -- Dropdown to select target Docker container per domain/subdomain
2. **Subdomain routing matrix** -- Map subdomains of custom domain to different apps
3. **SSL health monitoring** -- Certificate expiry warnings, renewal status

### Defer (Future Milestones)

- **Wildcard subdomain support** -- Requires DNS-01 challenge configuration, complex
- **Domain analytics** -- Traffic stats per domain
- **On-demand TLS** -- Caddy's dynamic certificate provisioning for unknown domains at TLS handshake time (interesting for scaling but premature)
- **WHOIS registrar detection** -- Show which registrar the domain is at for targeted DNS instructions

## DNS Configuration Specifics

### Records Users Must Create

| Record Type | Host | Value | Purpose |
|-------------|------|-------|---------|
| A | `mysite.com` (or `@`) | `{server_ip}` | Route traffic to server |
| A | `*.mysite.com` (optional) | `{server_ip}` | Route subdomains (if user wants `api.mysite.com` etc.) |
| TXT | `_livinity-verify.mysite.com` | `livinity-verify={token}` | Ownership verification |

### Why A Record + TXT (Not CNAME)

- A record for apex domains -- CNAME at zone apex violates RFC 1034 section 3.6.2 (would conflict with NS and MX records)
- TXT for verification -- Standard practice (Vercel, Netlify, Google Workspace all use this pattern)
- No CNAME option needed initially -- Users point directly to server IP. CNAME is useful for load balancers/CDNs, which Livinity doesn't use yet

### Verification Token Format

```
livinity-verify=lv_{random_32_char_hex}
```

Example: `livinity-verify=lv_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`

Store token in platform DB per domain per user. Unique per user-domain pair so the same domain can be verified by a new owner if transferred.

## Let's Encrypt Rate Limits

Critical constraints for SSL provisioning:

| Limit | Value | Impact |
|-------|-------|--------|
| Certificates per registered domain | 50 per 7 days | Unlikely to hit for user's own domains |
| Certificates per exact set of names | 5 per 7 days | Affects re-issuance for same domain |
| Failed validations | Paused after consecutive failures | Zombie client protection -- must verify DNS before attempting SSL |
| Renewal (via ARI) | Exempt from all rate limits | Safe to auto-renew |

**Key implication:** Always verify DNS resolution before triggering Caddy domain addition. If DNS is wrong, Caddy will attempt and fail the ACME challenge, wasting rate limit quota and potentially getting paused by Let's Encrypt's zombie client detection.

## Caddy Integration Pattern

### Current Architecture (Works Today)

```typescript
// caddy.ts - generateFullCaddyfile() produces:
// example.com { reverse_proxy 127.0.0.1:8080 }
// app.example.com { reverse_proxy 127.0.0.1:3001 }
```

### Extended Architecture (v19.0)

```typescript
// Add custom domain blocks alongside existing subdomain blocks:
// mysite.com { reverse_proxy 127.0.0.1:{app_port} }
// api.mysite.com { reverse_proxy 127.0.0.1:{other_app_port} }
// {existing livinity.cloud subdomains...}
```

The `generateFullCaddyfile()` function needs a new parameter: `customDomains: CustomDomainConfig[]` where each entry maps a full domain to a port (or to the app gateway on 8080 for dynamic routing).

### On-Demand TLS (Future Pattern)

For scaling beyond a handful of custom domains, Caddy's on-demand TLS eliminates the need to reload Caddy when adding domains:

```
{
    on_demand_tls {
        ask http://127.0.0.1:8080/api/domain-check?domain={host}
        interval 2m
        burst 5
    }
}

:443 {
    tls { on_demand }
    reverse_proxy 127.0.0.1:8080
}
```

The "ask" endpoint checks a database to authorize certificate issuance. Defer this to when users have 10+ custom domains -- the per-domain Caddyfile approach works fine for initial scale.

## Sources

### Primary (HIGH confidence)
- [Vercel Domain Troubleshooting](https://vercel.com/docs/domains/troubleshooting) -- Comprehensive error states and DNS issues
- [Vercel Custom Domain Setup](https://vercel.com/docs/domains/set-up-custom-domain)
- [Vercel Multi-tenant Domain Management](https://vercel.com/docs/multi-tenant/domain-management)
- [Netlify External DNS Configuration](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
- [Coolify Domains Documentation](https://coolify.io/docs/knowledge-base/domains)
- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy On-Demand TLS](https://caddyserver.com/on-demand-tls)
- [Let's Encrypt Rate Limits](https://letsencrypt.org/docs/rate-limits/)

### Implementation References (MEDIUM confidence)
- [Pirsch: How We Use Caddy for Custom Domains](https://pirsch.io/blog/how-we-use-caddy-to-provide-custom-domains-for-our-clients/) -- Real-world Caddy on-demand TLS SaaS implementation
- [Building Custom Domain Management with Vercel API](https://abderahmanetoumi.medium.com/building-custom-domain-management-with-vercel-api-the-good-the-bad-and-the-dns-propagation-4e896a96d663) -- Practical UX lessons and gotchas
- [Custom Domain Support with Automatic TLS](https://olly.world/how-i-implemented-custom-domain-support-with-automatic-tls-certs-for-my-saas-app) -- Caddy + Redis pattern
- [Caddy TLS On-Demand Guide](https://fivenines.io/blog/caddy-tls-on-demand-complete-guide-to-dynamic-https-with-lets-encrypt/)

### Architecture References (MEDIUM confidence)
- [Azure Multi-tenant Request Mapping](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/map-requests)
- [AWS SaaS Tenant Routing Strategies](https://aws.amazon.com/blogs/networking-and-content-delivery/tenant-routing-strategies-for-saas-applications-on-aws/)
- [Multi-tenant Custom Domains and Subdomains](https://www.dchost.com/blog/en/custom-domains-and-subdomains-for-multi-tenant-saas/)
