# Requirements: v8.0 — Livinity Platform

**Milestone:** v8.0
**Created:** 2026-03-17
**Status:** Active
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

---

## v1 Requirements

### Tunnel Relay (RELAY)

- [ ] **RELAY-01**: Relay server accepts WebSocket tunnel connections from LivOS instances authenticated via API key
- [ ] **RELAY-02**: Relay proxies HTTP requests from browser through tunnel to user's LivOS (request → JSON+base64 envelope → WebSocket → LivOS → response)
- [ ] **RELAY-03**: Relay handles WebSocket upgrade requests (tRPC subscriptions, terminal, voice) through the tunnel
- [ ] **RELAY-04**: Relay extracts username from subdomain and routes to correct tunnel connection
- [ ] **RELAY-05**: Relay tracks per-user bandwidth via Redis INCRBY, flushes to PostgreSQL every 60s
- [ ] **RELAY-06**: Relay implements 30s ping/pong heartbeat to detect dead connections
- [ ] **RELAY-07**: Relay assigns persistent session IDs and buffers requests for 30s during reconnection
- [ ] **RELAY-08**: Relay serves branded "Connecting..." page when tunnel is disconnected
- [ ] **RELAY-09**: Relay enforces bandwidth quota (50GB/mo free tier) — returns 429 when exceeded

### Tunnel Client (CLIENT)

- [ ] **CLIENT-01**: Tunnel client module in livinityd connects to relay via WebSocket using API key from Redis config
- [ ] **CLIENT-02**: Client forwards received HTTP requests to localhost:8080 and returns responses through tunnel
- [ ] **CLIENT-03**: Client forwards WebSocket upgrade requests through tunnel
- [ ] **CLIENT-04**: Client implements exponential backoff reconnection (1s to 60s max) with jitter
- [ ] **CLIENT-05**: Client stores API key in Redis (`livos:platform:api_key`) and connection status
- [ ] **CLIENT-06**: LivOS Settings UI has "Livinity Platform" section for entering/viewing API key

### DNS & TLS (DNS)

- [ ] **DNS-01**: Wildcard DNS `*.livinity.io` A record points to Server5 IP via Cloudflare
- [ ] **DNS-02**: Caddy On-Demand TLS issues certificates for `{username}.livinity.io` via DNS-01 challenge
- [ ] **DNS-03**: Caddy On-Demand TLS issues certificates for `{app}.{username}.livinity.io` via DNS-01 challenge
- [ ] **DNS-04**: Caddy `ask` endpoint validates subdomain against registered users before issuing cert
- [ ] **DNS-05**: Caddy config includes `stream_close_delay 5m` to prevent WebSocket drops on reload
- [ ] **DNS-06**: Relay parses two-level subdomains: `{app}.{username}.livinity.io` → routes to tunnel with app context

### Platform Auth (AUTH)

- [ ] **AUTH-01**: User can register with email and password on livinity.io
- [ ] **AUTH-02**: User receives email verification via Resend after registration
- [ ] **AUTH-03**: Unverified users cannot generate API keys
- [ ] **AUTH-04**: User can log in with email/password, session persists 30 days (httpOnly secure cookie)
- [ ] **AUTH-05**: User can reset password via email link
- [ ] **AUTH-06**: Username validated: 3-30 chars, alphanumeric + hyphens, no reserved words (admin, www, api, app, relay, status)

### Dashboard (DASH)

- [ ] **DASH-01**: Dashboard shows API key (display once on generation, store bcrypt hash)
- [ ] **DASH-02**: Dashboard shows server connection status (green=online, grey=offline) via Redis TTL key
- [ ] **DASH-03**: Dashboard shows bandwidth usage progress bar (current month, color at 80%/95%/100%)
- [ ] **DASH-04**: Dashboard shows personalized install command with API key
- [ ] **DASH-05**: Dashboard shows subdomain URL (`{username}.livinity.io`) with copy button
- [ ] **DASH-06**: Dashboard shows installed apps list with subdomain URLs when server is connected
- [ ] **DASH-07**: User can regenerate API key (invalidates old key, disconnects active tunnel)

### Landing Page (LAND)

- [ ] **LAND-01**: Apple-style premium landing page at livinity.io with hero section
- [ ] **LAND-02**: "How it works" section: 3 steps (Install → Enter API key → Access anywhere)
- [ ] **LAND-03**: Feature cards section highlighting AI assistant, app store, multi-user
- [ ] **LAND-04**: Pricing section (Free tier details + "Premium coming soon" placeholder)
- [ ] **LAND-05**: Footer with links, social, legal
- [ ] **LAND-06**: Responsive design (mobile-first)
- [ ] **LAND-07**: SEO optimized (meta tags, OG images, structured data)

### Install Script Integration (INST)

- [ ] **INST-01**: install.sh includes tunnel client setup (connects to livinity.io relay)
- [ ] **INST-02**: Onboarding wizard has "Connect to Livinity" step with API key input
- [ ] **INST-03**: After entering API key, LivOS automatically connects to relay and becomes accessible
- [ ] **INST-04**: `curl -sSL https://livinity.io/install.sh | sudo bash` works as one-command installer
- [ ] **INST-05**: Install script hosted on livinity.io (not GitHub raw)

### Infrastructure (INFRA)

- [ ] **INFRA-01**: Server5 runs relay process (port 4000) + Next.js app (port 3000) + Caddy + PostgreSQL + Redis
- [ ] **INFRA-02**: PM2 or systemd manages relay and Next.js processes with auto-restart
- [ ] **INFRA-03**: Health endpoint on relay (`/health`) reports connection count, memory usage, uptime
- [ ] **INFRA-04**: Memory monitoring with alert at 70% (5.6GB), reject new connections at 80%
- [ ] **INFRA-05**: Platform PostgreSQL schema: users, api_keys, bandwidth_usage, tunnel_connections tables

---

## Future Requirements (v8.1+)

### Payments
- **PAY-01**: Stripe integration for premium tier subscriptions
- **PAY-02**: Premium tier: custom domain, unlimited bandwidth, priority support
- **PAY-03**: Usage-based billing or fixed monthly pricing

### Custom Domains
- **CDOM-01**: User adds custom domain in dashboard (e.g., myserver.example.com)
- **CDOM-02**: DNS verification (CNAME to livinity.io)
- **CDOM-03**: Automatic TLS for custom domains

### Scale
- **SCALE-01**: Multi-region relay (US, EU, Asia)
- **SCALE-02**: Relay clustering for horizontal scaling
- **SCALE-03**: CDN for static assets

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Payment processing | Deferred to v8.1 -- focus on core platform first |
| Custom domains | Deferred to v8.1 -- requires additional TLS/DNS complexity |
| Multi-region relay | Deferred to v8.2 -- single Server5 sufficient for launch |
| Mobile app | Web-first approach covers core use case |
| SSO between platform and LivOS | Two separate auth systems by design (P4 pitfall) |
| White-label / reseller | Not planned |
| Self-hosted LLM support | Kimi Code only for now |
| Binary tunnel protocol | JSON+base64 sufficient for launch, optimize later |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RELAY-01 | Phase 9 | Pending |
| RELAY-02 | Phase 9 | Pending |
| RELAY-03 | Phase 9 | Pending |
| RELAY-04 | Phase 9 | Pending |
| RELAY-05 | Phase 9 | Pending |
| RELAY-06 | Phase 9 | Pending |
| RELAY-07 | Phase 9 | Pending |
| RELAY-08 | Phase 9 | Pending |
| RELAY-09 | Phase 9 | Pending |
| CLIENT-01 | Phase 9 | Pending |
| CLIENT-02 | Phase 9 | Pending |
| CLIENT-03 | Phase 9 | Pending |
| CLIENT-04 | Phase 9 | Pending |
| CLIENT-05 | Phase 12 | Pending |
| CLIENT-06 | Phase 12 | Pending |
| DNS-01 | Phase 10 | Pending |
| DNS-02 | Phase 10 | Pending |
| DNS-03 | Phase 10 | Pending |
| DNS-04 | Phase 10 | Pending |
| DNS-05 | Phase 10 | Pending |
| DNS-06 | Phase 10 | Pending |
| AUTH-01 | Phase 11 | Pending |
| AUTH-02 | Phase 11 | Pending |
| AUTH-03 | Phase 11 | Pending |
| AUTH-04 | Phase 11 | Pending |
| AUTH-05 | Phase 11 | Pending |
| AUTH-06 | Phase 11 | Pending |
| DASH-01 | Phase 12 | Pending |
| DASH-02 | Phase 12 | Pending |
| DASH-03 | Phase 12 | Pending |
| DASH-04 | Phase 12 | Pending |
| DASH-05 | Phase 12 | Pending |
| DASH-06 | Phase 12 | Pending |
| DASH-07 | Phase 12 | Pending |
| LAND-01 | Phase 13 | Pending |
| LAND-02 | Phase 13 | Pending |
| LAND-03 | Phase 13 | Pending |
| LAND-04 | Phase 13 | Pending |
| LAND-05 | Phase 13 | Pending |
| LAND-06 | Phase 13 | Pending |
| LAND-07 | Phase 13 | Pending |
| INST-01 | Phase 13 | Pending |
| INST-02 | Phase 13 | Pending |
| INST-03 | Phase 13 | Pending |
| INST-04 | Phase 13 | Pending |
| INST-05 | Phase 13 | Pending |
| INFRA-01 | Phase 9 | Pending |
| INFRA-02 | Phase 9 | Pending |
| INFRA-03 | Phase 14 | Pending |
| INFRA-04 | Phase 14 | Pending |
| INFRA-05 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 51 total
- Mapped to phases: 51
- Unmapped: 0

---
*Requirements defined: 2026-03-17*
*Last updated: 2026-03-17 -- roadmap phase mapping complete*
