# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward.

## Milestones

- ✅ **v19.0 Custom Domain Management** — Phases 07-10.1 (shipped 2026-03-27)
- ✅ **v20.0 Live Agent UI** — Phases 11-18 (shipped 2026-03-27)
- ✅ **v21.0 Autonomous Agent Platform** — Phases 19-28 (shipped 2026-03-28)
- ✅ **v22.0 Livinity AGI Platform** — Phases 29-36 (shipped 2026-03-29)
- [ ] **v23.0 Mobile PWA** — Phases 37-40 (in progress)

## Phases

<details>
<summary>v19.0 Custom Domain Management (Phases 07-10.1) — SHIPPED 2026-03-27</summary>

- [x] Phase 07: Platform Domain CRUD + DNS Verification (2/2 plans) — completed 2026-03-26
- [x] Phase 08: Relay Integration + Custom Domain Routing (2/2 plans) — completed 2026-03-26
- [x] Phase 09: Tunnel Sync + LivOS Domain Receiver (3/3 plans) — completed 2026-03-26
- [x] Phase 10: LivOS Domains UI + Dashboard Polish (2/2 plans) — completed 2026-03-26
- [x] Phase 10.1: Settings My Domains (1/1 plan) — completed 2026-03-27

</details>

<details>
<summary>v20.0 Live Agent UI (Phases 11-18) — SHIPPED 2026-03-27</summary>

- [x] Phase 11: Agent SDK Backend Integration (1/1 plans) — completed 2026-03-27
- [x] Phase 12: MCP Tool Bridge (1/1 plans) — completed 2026-03-27
- [x] Phase 13: WebSocket Streaming Transport (2/2 plans) — completed 2026-03-27
- [x] Phase 14: Chat UI Foundation (2/2 plans) — completed 2026-03-27
- [x] Phase 15: Live Tool Call Visualization (3/3 plans) — completed 2026-03-27
- [x] Phase 16: Mid-Conversation Interaction (1/1 plans) — completed 2026-03-27
- [x] Phase 17: Session Management + History (2/2 plans) — completed 2026-03-27
- [x] Phase 18: Cost Control + Settings Cleanup (1/1 plans) — completed 2026-03-27

</details>

<details>
<summary>v21.0 Autonomous Agent Platform (Phases 19-28) — SHIPPED 2026-03-28</summary>

- [x] Phase 19: AI Chat Streaming Visibility (1/1 plans) — completed 2026-03-28
- [x] Phase 20: Conversation Persistence & History (1/1 plans) — completed 2026-03-28
- [x] Phase 21: Sidebar Agents Tab (2/2 plans) — completed 2026-03-28
- [x] Phase 22: Agent Interaction & Management (2/2 plans) — completed 2026-03-28
- [x] Phase 23: Slash Command Menu (2/2 plans) — completed 2026-03-28
- [x] Phase 24: Tool Conditional Registration (1/1 plans) — completed 2026-03-28
- [x] Phase 25: Autonomous Skill & Tool Creation (1/1 plans) — completed 2026-03-28
- [x] Phase 26: Autonomous Schedule & Tier Management (1/1 plans) — completed 2026-03-28
- [x] Phase 27: Self-Evaluation & Improvement Loop (1/1 plans) — completed 2026-03-28
- [x] Phase 28: System Prompt Optimization (1/1 plans) — completed 2026-03-28

</details>

<details>
<summary>v22.0 Livinity AGI Platform (Phases 29-36) — SHIPPED 2026-03-29</summary>

- [x] Phase 29: Unified Capability Registry (2/2 plans) — completed 2026-03-29
- [x] Phase 30: Agents Panel Redesign (1/1 plans) — completed 2026-03-29
- [x] Phase 31: Intent Router v2 (1/1 plans) — completed 2026-03-29
- [x] Phase 32: Auto-Provisioning Engine (1/1 plans) — completed 2026-03-29
- [x] Phase 33: Livinity Marketplace MCP (1/1 plans) — completed 2026-03-29
- [x] Phase 34: AI Self-Modification (1/1 plans) — completed 2026-03-29
- [x] Phase 35: Marketplace UI & Auto-Install (2/2 plans) — completed 2026-03-29
- [x] Phase 36: Learning Loop (3/3 plans) — completed 2026-03-29

</details>

### v23.0 Mobile PWA (In Progress)

**Milestone Goal:** Make Livinity installable as a PWA on iOS/Android with a native phone-like experience -- app grid home screen, full-screen apps, no dock on mobile. Desktop UI completely unchanged.

**CRITICAL CONSTRAINT:** Desktop UI must NOT be modified -- all mobile changes gated on `useIsMobile()`. nexus-core runs compiled JS -- MUST rebuild after source changes.

- [x] **Phase 37: PWA Foundation** - Installable PWA with manifest, service worker, Apple meta tags, and safe area CSS (completed 2026-04-01)
- [ ] **Phase 38: Mobile Navigation Infrastructure** - Full-screen app rendering pipeline with MobileAppContext, MobileAppRenderer, and hardware back button support
- [ ] **Phase 39: Mobile Home Screen + App Access** - Phone-like home screen with system apps in grid, bottom tab bar, and dock hidden on mobile
- [ ] **Phase 40: Polish + iOS Hardening** - Install prompt, splash screens, WebSocket reconnection on resume, and keyboard layout fixes

## Phase Details

### Phase 37: PWA Foundation
**Goal**: Livinity is installable as a PWA on iOS and Android, launches in standalone mode, and safe area CSS is active for notch/home indicator devices
**Depends on**: Nothing (first phase of v23.0)
**Requirements**: PWA-01, PWA-02, PWA-03, PWA-04, IOS-01
**Success Criteria** (what must be TRUE):
  1. User can install Livinity from iOS Safari via "Add to Home Screen" and it opens full-screen without browser chrome
  2. User can install Livinity from Android Chrome via install prompt and it opens as a standalone app
  3. On a notched device (iPhone with Dynamic Island), content is padded below the notch and above the home indicator -- no overlap
  4. After first visit, the app shell loads instantly from service worker cache on subsequent visits
  5. The desktop UI is completely unchanged -- no visual or behavioral differences on desktop browsers
**Plans**: 2 plans

Plans:
- [x] 37-01-PLAN.md — PWA installability: vite-plugin-pwa manifest + service worker + Apple meta tags
- [x] 37-02-PLAN.md — Safe area CSS foundation: tailwindcss-safe-area plugin + CSS variables + overscroll prevention

### Phase 38: Mobile Navigation Infrastructure
**Goal**: Any system app can be opened full-screen on mobile with a back button that returns to the home screen, reusing existing window content components
**Depends on**: Phase 37
**Requirements**: MOB-02, MOB-04, MOB-05
**Success Criteria** (what must be TRUE):
  1. Tapping a system app on mobile opens it in a full-screen overlay that covers the entire viewport (no floating window chrome)
  2. A back button in the top navigation bar returns the user to the home screen
  3. The hardware/OS back button (Android back, iOS swipe-back gesture) closes the active app and returns home
  4. Every app that works in a desktop window also renders correctly in the mobile full-screen overlay with zero per-app modifications
**Plans**: TBD

Plans:
- [ ] 38-01: TBD
- [ ] 38-02: TBD

### Phase 39: Mobile Home Screen + App Access
**Goal**: Mobile users see a phone-like home screen with system apps in a grid and a bottom tab bar for quick navigation -- the desktop dock is hidden
**Depends on**: Phase 38
**Requirements**: MOB-01, MOB-03
**Success Criteria** (what must be TRUE):
  1. On mobile, the macOS-style dock is completely hidden and system apps (AI Chat, Settings, Files, Server, Terminal) appear as tappable icons in the app grid
  2. A bottom tab bar with 5 primary app icons (Home, AI Chat, Files, Settings, Server) is visible on the home screen and provides one-tap access
  3. Tapping an app icon in the grid or tab bar opens the app full-screen using the Phase 38 rendering pipeline
**Plans**: TBD

Plans:
- [ ] 39-01: TBD

### Phase 40: Polish + iOS Hardening
**Goal**: The PWA feels native on iOS with smooth transitions, branded splash screens, guided installation, resilient connectivity, and keyboard-safe input layouts
**Depends on**: Phase 39
**Requirements**: PWA-05, PWA-06, IOS-02, IOS-03
**Success Criteria** (what must be TRUE):
  1. First-time mobile visitors see a custom install prompt banner guiding them to "Add to Home Screen"
  2. On iOS, the app displays a branded splash screen during launch instead of a white flash
  3. After backgrounding and resuming the PWA on iOS, WebSocket connections (AI Chat streaming, tRPC subscriptions) automatically reconnect without user intervention
  4. When the iOS keyboard opens in AI Chat, the input field remains visible and the viewport does not break or shift unexpectedly
**Plans**: TBD

Plans:
- [ ] 40-01: TBD
- [ ] 40-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 37 -> 38 -> 39 -> 40

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 37. PWA Foundation | v23.0 | 2/2 | Complete    | 2026-04-01 |
| 38. Mobile Navigation Infrastructure | v23.0 | 0/2 | Not started | - |
| 39. Mobile Home Screen + App Access | v23.0 | 0/1 | Not started | - |
| 40. Polish + iOS Hardening | v23.0 | 0/2 | Not started | - |

---

## Previous Milestones

- v19.0 Custom Domain Management (Phases 07-10.1, Shipped 2026-03-27)
- v18.0 Remote Desktop Streaming (Phases 04-06, Shipped 2026-03-26)
- v17.0 Precision Computer Use (Shipped 2026-03-25)
- v16.0 Multi-Provider AI (Shipped 2026-03-25)
- v15.0 AI Computer Use (Shipped 2026-03-24)
- v14.1 Agent Installer & Setup UX (Shipped 2026-03-24)
- v14.0 Remote PC Control Agent (Shipped 2026-03-24)
- v11.0 Nexus Agent Fixes (Shipped 2026-03-22)
- v10.0 App Store Platform (Shipped 2026-03-21)
- Earlier milestones: see MILESTONES.md
