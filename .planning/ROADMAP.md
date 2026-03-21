# Roadmap: Livinity v10.0 — App Store Platform

## Overview

Build apps.livinity.io as an embedded app store that LivOS instances display via iframe, with postMessage-based install/uninstall communication, install history, and user profiles. Fix install.sh to auto-setup auth + tor Docker containers. Six phases (16-21) continuing from v8.0/v9.0, progressing from install script fix through backend API, store UI, communication bridge, iframe embedding, and finally the history/profile integration layer.

## Milestones

- [x] **v7.1 Per-User Isolation** - Phases 6-8 (shipped 2026-03-13)
- [x] **v8.0 Livinity Platform** - Phases 9-14 (shipped)
- [x] **v9.0 App Store API** - Phase 15 area + app store backend (shipped)
- [ ] **v10.0 App Store Platform** - Phases 16-21 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (16, 17, 18...): Planned milestone work
- Decimal phases (17.1, 17.2): Urgent insertions (marked with INSERTED)

<details>
<summary>v7.1 Per-User Isolation (Phases 6-8) - SHIPPED 2026-03-13</summary>

### Phase 6: Per-User UI Settings
**Status**: Complete

### Phase 7: Per-User Integration & Voice Settings
**Status**: Complete

### Phase 8: Onboarding Personalization
**Status**: Complete

</details>

<details>
<summary>v8.0 Livinity Platform (Phases 9-14) - SHIPPED</summary>

### Phase 9: Relay Server + Tunnel Client
**Status**: Complete

### Phase 10: DNS, TLS & Subdomain Routing
**Status**: Complete

### Phase 11: Platform Auth & Registration
**Status**: Complete

### Phase 12: Dashboard & API Key System
**Status**: Complete

### Phase 13: Landing Page & Install Script
**Status**: Complete

### Phase 14: Monitoring & Launch Prep
**Status**: Complete

### Phase 15: Desktop Widgets
**Status**: Complete

</details>

### v10.0 App Store Platform (In Progress)

**Milestone Goal:** Build apps.livinity.io as an embedded app store inside LivOS, with postMessage bridge for install/uninstall, install history tracking, and user profiles. Fix install.sh to auto-setup auth + tor Docker containers.

- [x] **Phase 16: Install Script Docker Fix** - install.sh auto-pulls auth-server + tor images, creates torrc, starts all containers (completed 2026-03-21)
- [x] **Phase 17: Backend API Extensions** - Install event recording, user apps endpoint, profile endpoint on Server5 (completed 2026-03-21)
- [x] **Phase 18: Store UI** - apps.livinity.io/store with featured apps, categories, search, detail pages, Apple aesthetic (completed 2026-03-21)
- [x] **Phase 19: postMessage Bridge Protocol** - Bidirectional postMessage communication between apps.livinity.io and LivOS (completed 2026-03-21)
- [x] **Phase 20: LivOS iframe Embedding** - App Store window in LivOS that embeds apps.livinity.io and executes install commands (completed 2026-03-21)
- [x] **Phase 21: Install History & Profile** - Install event reporting, profile page with installed apps and history timeline (completed 2026-03-21)

## Phase Details

### Phase 16: Install Script Docker Fix
**Goal**: Running a single `curl | bash` command on a fresh server results in a fully working LivOS with auth-server, tor proxy, and tunnel connected -- no manual Docker steps
**Depends on**: Nothing (independent fix, first phase of v10.0)
**Requirements**: INST-01, INST-02, INST-03, INST-04, INST-05
**Success Criteria** (what must be TRUE):
  1. Running install.sh on a fresh Ubuntu server pulls the auth-server and tor Docker images and tags them as livos/* without user intervention
  2. install.sh creates a valid torrc config file with SocksPort and HiddenService directives before starting containers
  3. After install.sh completes, `docker ps` shows auth-server and tor containers running alongside livinityd
  4. The single `curl | bash --api-key KEY` command results in a fully operational LivOS instance with auth, tor, and tunnel connected -- zero manual steps
**Plans**: 1 plan

Plans:
- [x] 16-01-PLAN.md — Harden Docker image pulls, add setup_docker_prerequisites, wrap Kimi CLI

### Phase 17: Backend API Extensions
**Goal**: Server5 exposes authenticated API endpoints for recording install events, querying user apps by instance, and retrieving user profile data -- so the store UI and LivOS can read/write install state
**Depends on**: Nothing (builds on existing Server5 API infrastructure)
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. POST /api/install-event with valid auth records an install or uninstall event and returns success
  2. GET /api/user/apps returns the authenticated user's installed apps grouped by instance name
  3. GET /api/user/profile returns the user's username, instance count, and total app count
**Plans**: 2 plans

Plans:
- [x] 17-01-PLAN.md — Restore v9.0 API files from backup/post-v9.0 branch, install Drizzle ORM
- [x] 17-02-PLAN.md — Add install_history table and 3 new endpoints (install-event, user/apps, user/profile)

### Phase 18: Store UI
**Goal**: apps.livinity.io/store is a standalone, responsive Next.js page with Apple App Store aesthetic that users can browse for featured apps, filter by category, search, and view app details -- works both in a browser and inside an iframe
**Depends on**: Phase 17 (API endpoints exist for profile/apps data; store UI needs to consume them)
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, STORE-06, STORE-07
**Success Criteria** (what must be TRUE):
  1. Visiting apps.livinity.io/store in a browser shows a hero section with featured app cards and a left sidebar with Discover, Categories, and My Apps navigation
  2. User can filter apps by category and search across all apps by name with results updating in real time
  3. Clicking an app card navigates to /store/[id] showing the app's icon, description, version info, and an Install button
  4. The store page renders correctly both as a standalone browser page and when embedded inside an iframe (no layout breakage, no scroll conflicts)
  5. The visual design follows an Apple App Store aesthetic -- white background, clean typography, premium feel with generous spacing
**Plans**: 3 plans

Plans:
- [x] 18-01-PLAN.md — Types, auth context provider, sidebar navigation, topbar with search, store layout shell
- [x] 18-02-PLAN.md — Featured hero section, app cards, category sections, discover page with search filtering
- [x] 18-03-PLAN.md — App detail page (/store/[id]) with full info, Install button placeholder, build verification

### Phase 19: postMessage Bridge Protocol
**Goal**: apps.livinity.io and LivOS communicate bidirectionally via postMessage -- the store can request installs/uninstalls/opens, and LivOS can report app status back -- with origin validation for security
**Depends on**: Phase 18 (store UI must exist to send messages)
**Requirements**: BRIDGE-01, BRIDGE-02, BRIDGE-03, BRIDGE-04, BRIDGE-05, BRIDGE-06
**Success Criteria** (what must be TRUE):
  1. When a user clicks Install on an app detail page inside the iframe, the store sends a postMessage with type "install", appId, and composeUrl to the parent LivOS window
  2. When a user clicks Uninstall or Open, the store sends the corresponding "uninstall" or "open" postMessage to the parent window
  3. LivOS sends a "status" message to the iframe containing the list of running apps, and the store UI reflects which apps are installed vs available
  4. After an install or uninstall completes, LivOS sends an "installed" confirmation message back to the iframe with the success/failure result
  5. postMessage origin is validated on both sides -- LivOS only accepts messages from apps.livinity.io, and the store only accepts messages from the expected parent origin
**Plans**: 1 plan

Plans:
- [x] 19-01-PLAN.md — postMessage types, usePostMessage hook, bridge wiring into StoreProvider + Install button + app cards

### Phase 20: LivOS iframe Embedding
**Goal**: LivOS has an App Store window that loads apps.livinity.io/store in an iframe, listens for postMessage install commands, executes Docker compose pull/up + Caddy config, and reports status back -- completing the install flow from browsing to running app
**Depends on**: Phase 19 (postMessage protocol defined and implemented in store)
**Requirements**: EMBED-01, EMBED-02, EMBED-03, EMBED-04, EMBED-05
**Success Criteria** (what must be TRUE):
  1. Opening the App Store window in LivOS displays apps.livinity.io/store in a full-window iframe with the user's API key and hostname passed as query parameters
  2. When the store iframe sends an install command via postMessage, LivOS downloads the compose file, pulls Docker images, starts the container, and updates Caddy config -- the app becomes accessible at its subdomain
  3. LivOS sends the current app status list to the iframe on initial load and after every state change (install, uninstall, start, stop)
  4. The install/uninstall result (success or failure with reason) is communicated back to the iframe so the store UI can update accordingly
**Plans**: 1 plan

Plans:
- [x] 20-01-PLAN.md — iframe App Store window with postMessage bridge listener and install executor

### Phase 21: Install History & Profile
**Goal**: Install and uninstall events are tracked across all instances, and users can view their installed apps and history timeline on a profile page -- tying the entire app store experience together
**Depends on**: Phase 20 (LivOS must be able to execute installs and report events)
**Requirements**: HIST-01, HIST-02, HIST-03, HIST-04
**Success Criteria** (what must be TRUE):
  1. Every install and uninstall action performed through the App Store is recorded in the install_history table with user_id, app_id, instance_name, and event type
  2. Visiting /store/profile shows the user's installed apps grouped by instance, with each app showing its current status
  3. The profile page includes an install history timeline showing chronological install/uninstall/update events across all instances
  4. LivOS automatically reports install and uninstall events to the apps.livinity.io API after each action completes
**Plans**: 1 plan

Plans:
- [x] 21-01-PLAN.md — Event reporting in LivOS bridge + profile page with installed apps and history timeline

### Phase 22: App Store Integration Fix
**Goal:** Fix App Store iframe integration gaps: desktop auto-refresh after install, correct reportEvent URL, install progress reporting, credentials dialog, and bidirectional status updates between LivOS and store iframe.
**Requirements**: R-STORE-REFRESH, R-STORE-PROGRESS, R-STORE-CREDENTIALS, R-STORE-STATUS
**Depends on:** Phase 21
**Plans:** 2/2 plans complete

Plans:
- [x] 22-01-PLAN.md — LivOS bridge: fix reportEvent URL, add progress polling, credentials forwarding, installing status
- [x] 22-02-PLAN.md — Store UI: progress display, credentials dialog, installing badges on detail page and app cards

## Progress

**Execution Order:** 16 -> 17 -> 18 -> 19 -> 20 -> 21 -> 22

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 16. Install Script Docker Fix | v10.0 | 1/1 | Complete    | 2026-03-21 |
| 17. Backend API Extensions | v10.0 | 2/2 | Complete    | 2026-03-21 |
| 18. Store UI | v10.0 | 3/3 | Complete    | 2026-03-21 |
| 19. postMessage Bridge | v10.0 | 1/1 | Complete    | 2026-03-21 |
| 20. iframe Embedding | v10.0 | 1/1 | Complete    | 2026-03-21 |
| 21. History & Profile | v10.0 | 1/1 | Complete    | 2026-03-21 |
| 22. Integration Fix | v10.0 | 2/2 | Complete    | 2026-03-21 |
