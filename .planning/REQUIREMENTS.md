# Requirements: Livinity v10.0 — App Store Platform

**Defined:** 2026-03-20
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v10.0 Requirements

### INST — install.sh Docker Fix

- [ ] **INST-01**: install.sh pulls getumbrel/auth-server:1.0.5 and tags as livos/auth-server:1.0.5
- [ ] **INST-02**: install.sh pulls getumbrel/tor:0.4.7.8 and tags as livos/tor:0.4.7.8
- [ ] **INST-03**: install.sh creates torrc config file with SocksPort and HiddenService directives
- [ ] **INST-04**: install.sh starts auth + tor containers via docker compose automatically
- [ ] **INST-05**: Single `curl | bash --api-key KEY` command results in fully working LivOS with auth + tor + tunnel connected

### STORE — apps.livinity.io Store UI

- [ ] **STORE-01**: /store page displays featured apps in hero section with large cards
- [ ] **STORE-02**: /store page shows app categories with filterable grid
- [ ] **STORE-03**: /store page has search functionality across all apps
- [ ] **STORE-04**: /store/[id] page shows app detail with icon, description, version, Install button
- [ ] **STORE-05**: /store page has left sidebar navigation (Discover, Categories, My Apps)
- [ ] **STORE-06**: Store UI follows Apple App Store aesthetic — white, clean, premium feel
- [ ] **STORE-07**: Store UI is responsive — works standalone in browser and inside iframe

### BRIDGE — postMessage Communication

- [ ] **BRIDGE-01**: apps.livinity.io sends `{type:'install', appId, composeUrl}` to parent LivOS window
- [ ] **BRIDGE-02**: apps.livinity.io sends `{type:'uninstall', appId}` to parent LivOS window
- [ ] **BRIDGE-03**: apps.livinity.io sends `{type:'open', appId}` to parent LivOS window
- [ ] **BRIDGE-04**: LivOS sends `{type:'status', apps:[...]}` with running app statuses to iframe
- [ ] **BRIDGE-05**: LivOS sends `{type:'installed', appId, success}` confirmation to iframe
- [ ] **BRIDGE-06**: postMessage origin validated (only apps.livinity.io accepted)

### EMBED — LivOS iframe Integration

- [ ] **EMBED-01**: LivOS App Store window displays apps.livinity.io/store in iframe
- [ ] **EMBED-02**: iframe URL includes API key token and instance hostname as query params
- [ ] **EMBED-03**: LivOS listens for postMessage install commands from iframe
- [ ] **EMBED-04**: Install command triggers compose download → Docker pull/up → Caddy config update
- [ ] **EMBED-05**: LivOS sends app status updates to iframe on load and after state changes

### HIST — Install History + Profile

- [ ] **HIST-01**: install_history table records install/uninstall/update events with user_id, app_id, instance_name
- [ ] **HIST-02**: /store/profile page shows user's installed apps across all instances
- [ ] **HIST-03**: /store/profile page shows install history timeline
- [ ] **HIST-04**: LivOS reports install/uninstall events to apps.livinity.io API

### API — Backend API Extensions

- [ ] **API-01**: POST /api/install-event records install/uninstall event (authenticated)
- [ ] **API-02**: GET /api/user/apps returns user's installed apps grouped by instance
- [ ] **API-03**: GET /api/user/profile returns user profile info (username, instance count, app count)

## Future Requirements

- **STORE-F01**: App ratings and reviews
- **STORE-F02**: App screenshots/preview images
- **STORE-F03**: App update notifications
- **HIST-F01**: Usage analytics per app
- **API-F01**: Admin panel for app catalog management

## Out of Scope

| Feature | Reason |
|---------|--------|
| Community app submissions | v10.0 is curated-only |
| Payment for premium apps | All free for now |
| App auto-updates | Manual install for v10.0 |
| Mobile store layout | Desktop/iframe focus for v10.0 |
| Custom auth-proxy | Reverted — using Umbrel auth-server |
| Rate limiting | Caused tunnel issues — deferred |
| JWT refresh tokens | Caused redirect loops — deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v10.0 requirements: 28 total
- Mapped to phases: 0
- Unmapped: 28

---
*Requirements defined: 2026-03-20*
