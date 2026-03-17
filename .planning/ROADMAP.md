# Roadmap: Livinity Platform v8.0

## Overview

Transform LivOS from a local-only self-hosted server into a globally accessible platform by building livinity.io -- a tunnel relay, user registration system, dashboard, and landing page. Users register on livinity.io, get an API key, and their LivOS instance becomes accessible at `{username}.livinity.io` with zero port forwarding or DNS configuration. Six phases from relay infrastructure through launch readiness, numbered 9-14 continuing from v7.2.

## Milestones

- [x] **v7.1 Per-User Isolation** - Phases 6-8 (shipped 2026-03-13)
- [ ] **v8.0 Livinity Platform** - Phases 9-14 (in progress)

## Phases

<details>
<summary>v7.1 Per-User Isolation (Phases 6-8) - SHIPPED 2026-03-13</summary>

### Phase 6: Per-User UI Settings
**Goal**: Wallpaper animation settings stored per-user in PostgreSQL, App Store shows correct state per user
**Requirements**: UISET-01, UISET-02, UISET-03, UISET-04, UISET-05
**Status**: Complete

### Phase 7: Per-User Integration & Voice Settings
**Goal**: Each user stores their own Telegram, Discord, Gmail, MCP, and Voice configurations
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-05, INTEG-06
**Status**: Complete

### Phase 8: Onboarding Personalization
**Goal**: New users answer personalization questions during onboarding, AI adapts responses
**Requirements**: ONBOARD-01, ONBOARD-02, ONBOARD-03, ONBOARD-04
**Status**: Complete

</details>

### v8.0 Livinity Platform (In Progress)

**Milestone Goal:** Build livinity.io central platform with tunnel relay, user auth, dashboard, landing page, and install script integration -- making LivOS accessible globally via `{username}.livinity.io`.

- [ ] **Phase 9: Relay Server + Tunnel Client** - Custom WebSocket relay on Server5 and tunnel client in livinityd
- [ ] **Phase 10: DNS, TLS & Subdomain Routing** - Wildcard DNS, Caddy On-Demand TLS, multi-level subdomain routing
- [ ] **Phase 11: Platform Auth & Registration** - Next.js app with Better Auth, email verification, session management
- [ ] **Phase 12: Dashboard & API Key System** - Connection status, API key management, bandwidth display, LivOS Settings UI
- [ ] **Phase 13: Landing Page & Install Script** - Apple-style marketing page, one-command installer integration
- [ ] **Phase 14: Monitoring & Launch Prep** - Health endpoints, memory monitoring, operational hardening

## Phase Details

### Phase 9: Relay Server + Tunnel Client
**Goal**: A LivOS instance can connect to Server5 via WebSocket tunnel and serve HTTP/WebSocket requests from the internet through the relay
**Depends on**: Nothing (first phase of v8.0)
**Requirements**: RELAY-01, RELAY-02, RELAY-03, RELAY-04, RELAY-05, RELAY-06, RELAY-07, RELAY-08, RELAY-09, CLIENT-01, CLIENT-02, CLIENT-03, CLIENT-04, INFRA-01, INFRA-02, INFRA-05
**Success Criteria** (what must be TRUE):
  1. A LivOS instance authenticates with an API key and establishes a persistent WebSocket tunnel to the relay on Server5
  2. An HTTP request sent to the relay with a user's subdomain returns the response from that user's LivOS instance (full round-trip through the tunnel)
  3. A WebSocket connection (tRPC subscription or terminal) upgrades successfully through the tunnel and streams data bidirectionally
  4. When the tunnel disconnects, the relay serves a branded "Connecting..." page and the client reconnects with exponential backoff within 60 seconds
  5. Per-user bandwidth is tracked in Redis and flushed to PostgreSQL, and requests are rejected with 429 when the 50GB monthly quota is exceeded
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD
- [ ] 09-03: TBD

### Phase 10: DNS, TLS & Subdomain Routing
**Goal**: Browser requests to `{username}.livinity.io` and `{app}.{username}.livinity.io` resolve, terminate TLS, and route through the relay to the correct tunnel
**Depends on**: Phase 9
**Requirements**: DNS-01, DNS-02, DNS-03, DNS-04, DNS-05, DNS-06
**Success Criteria** (what must be TRUE):
  1. Visiting `https://alice.livinity.io` in a browser resolves to Server5 and shows Alice's LivOS desktop (valid TLS certificate, no warnings)
  2. Visiting `https://immich.alice.livinity.io` routes to Alice's Immich app through the tunnel with a valid TLS certificate
  3. Caddy only issues certificates for subdomains belonging to registered users (the `ask` endpoint rejects unknown usernames)
  4. WebSocket connections survive Caddy config reloads without dropping (stream_close_delay configured)
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD

### Phase 11: Platform Auth & Registration
**Goal**: Users can create accounts on livinity.io, verify their email, log in, and maintain sessions -- establishing their identity before generating API keys
**Depends on**: Phase 10 (needs Next.js app scaffold from Server5 setup; auth is independent of relay but needs the platform running)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):
  1. A new user can register on livinity.io with email, password, and a validated username (3-30 chars, alphanumeric + hyphens, no reserved words)
  2. After registration, the user receives a verification email and cannot generate API keys until verified
  3. A verified user can log in and their session persists for 30 days via httpOnly secure cookie
  4. A user who forgot their password can reset it via an email link
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD

### Phase 12: Dashboard & API Key System
**Goal**: Logged-in users can generate API keys, see their server connection status, monitor bandwidth, and configure their LivOS instance to connect -- completing the full user flow from registration to live tunnel
**Depends on**: Phase 11 (requires authenticated users)
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, CLIENT-05, CLIENT-06
**Success Criteria** (what must be TRUE):
  1. A verified user can generate an API key from the dashboard (displayed once, stored as bcrypt hash) and regenerate it (invalidating the old key and disconnecting any active tunnel)
  2. The dashboard shows real-time server connection status (green when LivOS is connected, grey when offline) and the user's subdomain URL with a copy button
  3. The dashboard shows a bandwidth usage progress bar for the current month that changes color at 80%, 95%, and 100% thresholds
  4. The dashboard shows a personalized install command containing the user's API key and lists installed apps with their subdomain URLs when the server is connected
  5. In LivOS Settings, a "Livinity Platform" section allows the user to enter and view their API key, which is stored in Redis and triggers a tunnel connection
**Plans**: TBD

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD
- [ ] 12-03: TBD

### Phase 13: Landing Page & Install Script
**Goal**: livinity.io has a compelling public-facing landing page that drives signups, and the install script seamlessly connects new LivOS installations to the platform
**Depends on**: Phase 12 (landing page links to dashboard; install script uses API key flow)
**Requirements**: LAND-01, LAND-02, LAND-03, LAND-04, LAND-05, LAND-06, LAND-07, INST-01, INST-02, INST-03, INST-04, INST-05
**Success Criteria** (what must be TRUE):
  1. livinity.io displays an Apple-style premium landing page with hero, "how it works" steps, feature cards, pricing placeholder, and footer -- responsive on mobile and desktop
  2. The landing page is SEO optimized with proper meta tags, OG images, and structured data
  3. Running `curl -sSL https://livinity.io/install.sh | sudo bash` on a fresh server installs LivOS with tunnel client support
  4. The onboarding wizard includes a "Connect to Livinity" step where entering an API key automatically establishes the tunnel and makes the server accessible at `{username}.livinity.io`
**Plans**: TBD

Plans:
- [ ] 13-01: TBD
- [ ] 13-02: TBD
- [ ] 13-03: TBD

### Phase 14: Monitoring & Launch Prep
**Goal**: The platform is operationally hardened with health monitoring and memory safeguards, ready for real users
**Depends on**: Phase 13 (all features complete; this phase hardens them)
**Requirements**: INFRA-03, INFRA-04
**Success Criteria** (what must be TRUE):
  1. The relay health endpoint (`/health`) reports active connection count, memory usage, and uptime
  2. Memory monitoring alerts at 70% usage (5.6GB) and automatically rejects new tunnel connections at 80% to prevent OOM
  3. The full user flow works end-to-end: register on livinity.io, verify email, generate API key, install LivOS, enter API key, server becomes accessible at `{username}.livinity.io`
**Plans**: TBD

Plans:
- [ ] 14-01: TBD

## Progress

**Execution Order:** 9 -> 10 -> 11 -> 12 -> 13 -> 14

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 6. UI Settings | v7.1 | Complete | Complete | 2026-03-13 |
| 7. Integrations | v7.1 | Complete | Complete | 2026-03-13 |
| 8. Onboarding | v7.2 | Complete | Complete | 2026-03-13 |
| 9. Relay + Client | v8.0 | 0/TBD | Not started | - |
| 10. DNS & TLS | v8.0 | 0/TBD | Not started | - |
| 11. Auth | v8.0 | 0/TBD | Not started | - |
| 12. Dashboard | v8.0 | 0/TBD | Not started | - |
| 13. Landing + Install | v8.0 | 0/TBD | Not started | - |
| 14. Monitoring | v8.0 | 0/TBD | Not started | - |
