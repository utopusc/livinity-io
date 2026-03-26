# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward. Current milestone: v19.0 Custom Domain Management -- users add custom domains on livinity.io, domains sync to LivOS via tunnel relay, connect to apps with auto-SSL Caddy reverse proxy.

## v19.0 Custom Domain Management

### Phase 07: Platform Domain CRUD + DNS Verification
**Goal:** Users can add/remove custom domains on livinity.io dashboard and verify ownership via DNS.
**Requirements:** DOM-01, DOM-02
**Plans:** 2/2 plans complete
Plans:
- [x] 07-01-PLAN.md — Database schema + API routes + DNS verification logic
- [x] 07-02-PLAN.md — Dashboard Domains UI + background DNS polling service
**Scope:**
- `custom_domains` Drizzle table (domain, user_id, verification_token, status, timestamps)
- CRUD API routes on livinity.io (POST/GET/DELETE /api/domains)
- DNS verification logic: A record + TXT record checking via `dns/promises`
- Verification polling: background check every 30s for pending domains
- Domain status lifecycle: `pending_dns` -> `dns_verified` (or `dns_failed`)
- Dashboard UI: Add Domain form, domain list with status badges, DNS instructions with copy buttons
**Key risk:** DNS propagation delays frustrate users. Mitigation: show "DNS can take up to 48 hours" message, allow manual re-check button.
**Dependencies:** None (platform-only, no cross-system deps)

### Phase 08: Relay Integration + Custom Domain Routing
**Goal:** Relay's Caddy serves custom domains with auto-SSL and routes traffic through tunnel to correct LivOS.
**Requirements:** DOM-04, DOM-NF-01, DOM-NF-02, DOM-NF-04
**Plans:** 2/2 plans complete
Plans:
- [x] 08-01-PLAN.md — DB schema + Redis cache module + ask endpoint extension + Caddyfile
- [x] 08-02-PLAN.md — Custom domain HTTP + WebSocket request routing through tunnel
**Scope:**
- Extend relay's `/internal/ask` endpoint to check `custom_domains` table (only verified domains)
- Add Caddyfile catch-all `https://` block with `on_demand` TLS for custom domains
- Custom domain -> username mapping in relay routing (Host header lookup)
- Redis cache layer for ask endpoint (<5ms response time)
- Protect existing `*.livinity.io` and `*.livinity.app` routing (secondary lookup only)
**Key risk:** Breaking existing subdomain routing. Mitigation: catch-all block must be ordered AFTER explicit domain blocks in Caddyfile.
**Dependencies:** Phase 07 (domain DB + verification must exist)

### Phase 09: Tunnel Sync + LivOS Domain Receiver
**Goal:** Verified domains sync from platform to LivOS via tunnel, stored locally for app gateway routing.
**Requirements:** DOM-03, DOM-06, DOM-07
**Plans:** 3/3 plans complete
Plans:
- [x] 09-01-PLAN.md — Protocol types + relay domain-sync endpoint + LivOS receiver + DNS re-verify sync
- [x] 09-02-PLAN.md — App gateway custom domain routing + relay targetApp resolution
- [x] 09-03-PLAN.md — Gap closure: Add PostgreSQL persistence to LivOS domain sync handlers
**Scope:**
- New tunnel message types: `domain_sync` (add/update/remove), `domain_sync_ack`, `domain_list_sync`
- Platform sends domain_sync on verification, LivOS receives and stores in local PostgreSQL + Redis
- Full domain list sync on tunnel reconnect (handles offline LivOS)
- Extend app gateway middleware: after `*.mainDomain` check fails, check custom domain hostname in Redis
- Domain-to-app mapping: `custom_domain_mappings` table (domain, app_id, path_prefix)
- Subdomain support: `api.mysite.com` -> different app than `mysite.com`
- Periodic DNS re-verification (every 12 hours) with status transition to `dns_changed`
**Key risk:** Tunnel offline during domain verification. Mitigation: queue + sync-on-reconnect pattern.
**Dependencies:** Phase 08 (relay must route custom domains before LivOS needs to handle them)

### Phase 10: LivOS Domains UI + Dashboard Polish
**Goal:** Users manage domains in Servers app and livinity.io dashboard with full status visibility.
**Requirements:** DOM-05
**Plans:** 2 plans
Plans:
- [ ] 10-01-PLAN.md — LivOS Domains tab: tRPC routes + UI component in Servers app
- [ ] 10-02-PLAN.md — livinity.io dashboard polish: SSL status, re-verify, error states
**Scope:**
- Domains tab in Servers app: domain list with status badges (pending/verified/active/error/dns_changed)
- Domain-to-app mapping UI: dropdown to select Docker app for each domain/subdomain
- Remove domain action (syncs back to platform via tunnel)
- livinity.io dashboard polish: domain detail page, SSL certificate info, re-verify button
- Error states: clear messages for DNS failures, SSL provisioning issues
- Domain limit display (e.g., "2/3 domains used")
**Key risk:** None significant -- thin UI layer over working backend.
**Dependencies:** Phase 09 (domain data must be in LivOS before UI can display it)

---

## Requirement Coverage Matrix

| Requirement | Phase(s) | Status |
|-------------|----------|--------|
| DOM-01: Domain Registration | 07 | Planned |
| DOM-02: DNS Verification | 07 | Planned |
| DOM-03: Domain Sync via Tunnel | 09 | Planned |
| DOM-04: Relay Custom Domain Routing | 08 | Planned |
| DOM-05: Domains Tab in Servers App | 10 | Planned |
| DOM-06: Domain-to-App Mapping | 09 | Planned |
| DOM-07: Periodic Re-verification | 09 | Planned |
| DOM-NF-01: Ask Endpoint Perf | 08 | Planned |
| DOM-NF-02: LE Safety | 08 | Planned |
| DOM-NF-03: Zero New Deps | All | Planned |
| DOM-NF-04: Existing Routing | 08 | Planned |

---

## Previous Milestones

- v18.0 Remote Desktop Streaming (Phases 04-06, Shipped 2026-03-26)
- v17.0 Precision Computer Use (Shipped 2026-03-25)
- v16.0 Multi-Provider AI (Shipped 2026-03-25)
- v15.0 AI Computer Use (Shipped 2026-03-24)
- v14.1 Agent Installer & Setup UX (Shipped 2026-03-24)
- v14.0 Remote PC Control Agent (Shipped 2026-03-24)
- v11.0 Nexus Agent Fixes (Shipped 2026-03-22)
- v10.0 App Store Platform (Shipped 2026-03-21)
- Earlier milestones: see MILESTONES.md
