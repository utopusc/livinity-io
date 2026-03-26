# Requirements: v19.0 Custom Domain Management

**Goal:** Users add custom domains on livinity.io dashboard, domains sync to LivOS via tunnel relay, appear in Servers app Domains tab, and connect to apps with auto-SSL Caddy reverse proxy.

**Research basis:** v19-STACK.md, v19-FEATURES.md, v19-ARCHITECTURE.md, v19-PITFALLS.md

---

## Functional Requirements

### DOM-01: Domain Registration (Platform)
Users can add custom domains on the livinity.io dashboard. The system generates a unique TXT verification token and displays DNS instructions (A record + TXT record). Domain is stored in `custom_domains` PostgreSQL table with status `pending_dns`.

**UAT:** User adds "mysite.com" on dashboard, sees DNS instructions with A record IP and TXT token, domain appears in list as "Pending DNS".

### DOM-02: DNS Verification
Platform periodically checks DNS for added domains using Node.js `dns/promises`. Verifies both: (1) A record points to relay IP (45.137.194.102), (2) TXT record at `_livinity-verification.{domain}` matches generated token. Domain transitions to `verified` when both pass.

**UAT:** After configuring DNS, domain status changes from "Pending DNS" to "Verified" within 5 minutes. Invalid DNS shows helpful error messages.

### DOM-03: Domain Sync via Tunnel
When domain is verified, platform sends `domain_sync` tunnel message through relay WebSocket to the user's LivOS instance. On LivOS reconnect, full domain list is synced via `domain_list_sync`. LivOS stores domains in local PostgreSQL + Redis cache.

**UAT:** Verified domain appears in LivOS within 30 seconds. If LivOS was offline during verification, domain syncs on reconnect.

### DOM-04: Relay Custom Domain Routing
Relay's Caddy `on_demand_tls` ask endpoint is extended to authorize custom domains from the database. A new catch-all `https://` block handles custom domain traffic, proxying to the relay which routes through the tunnel to the correct LivOS instance.

**UAT:** Browsing `https://mysite.com` receives a valid Let's Encrypt SSL certificate and reaches the LivOS instance.

### DOM-05: Domains Tab in Servers App
Existing Servers/Docker management app gains a "Domains" tab showing all user domains with status (pending, verified, active, error), mapped app, SSL status. Supports add/remove domain actions that proxy to livinity.io API.

**UAT:** User opens Servers app, clicks Domains tab, sees domain list with colored status badges. Can remove domains.

### DOM-06: Domain-to-App Mapping
Users map custom domains and subdomains to Docker apps. e.g., `mysite.com` -> homepage app, `api.mysite.com` -> backend app. Mapping is stored on LivOS and extends the app gateway to route based on custom domain hostname.

**UAT:** User maps `mysite.com` to their homepage app, maps `api.mysite.com` to a different app. Both resolve correctly.

### DOM-07: Periodic Re-verification
Background job re-checks DNS every 12 hours. If A record no longer points to relay IP, domain status transitions to `dns_changed` and traffic routing is paused. User is notified to fix DNS.

**UAT:** If user changes A record away from relay IP, domain goes to "DNS Changed" status within 12 hours and stops serving traffic.

---

## Non-Functional Requirements

### DOM-NF-01: Ask Endpoint Performance
Caddy's ask endpoint must respond within 200ms (Caddy timeout is 500ms by default). Use PostgreSQL indexed domain column + Redis cache for sub-5ms lookups.

### DOM-NF-02: Let's Encrypt Safety
DNS must be verified before domain is authorized in ask endpoint. Never attempt SSL provisioning for unverified domains. Respects LE rate limits (50 certs/domain/week).

### DOM-NF-03: Zero New Dependencies
All functionality uses Node.js built-ins (`dns/promises`, `crypto`), existing Caddy on-demand TLS, existing Drizzle ORM, and existing tunnel protocol.

### DOM-NF-04: Existing Routing Preservation
Custom domain support must not break existing `*.livinity.io` and `*.livinity.app` subdomain routing. Custom domain lookup is a secondary path after the existing subdomain check.

---

## Out of Scope (v19.0)

- Wildcard custom domains (`*.mysite.com`) -- requires DNS-01 challenge
- CNAME record support -- A record only for v19.0
- Custom SSL certificate upload -- Caddy auto-SSL only
- Domain transfer between users
- Payment/billing integration for domain limits
- Multi-region relay support
