# Roadmap: Livinity

## Overview

Livinity roadmap tracks all milestones from v10.0 onward.

## Milestones

- ✅ **v19.0 Custom Domain Management** — Phases 07-10.1 (shipped 2026-03-27)
- ✅ **v20.0 Live Agent UI** — Phases 11-18 (shipped 2026-03-27)
- ✅ **v21.0 Autonomous Agent Platform** — Phases 19-28 (shipped 2026-03-28)
- ✅ **v22.0 Livinity AGI Platform** — Phases 29-36 (shipped 2026-03-29)
- ✅ **v23.0 Mobile PWA** — Phases 37-40 (shipped 2026-04-01)
- ✅ **v24.0 Mobile Responsive UI** — Phases 1-5 (shipped 2026-04-01)
- ✅ **v25.0 Memory & WhatsApp Integration** — Phases 6-10 (shipped 2026-04-03)
- ✅ **v26.0 Device Security & User Isolation** — Phases 11-16 (shipped 2026-04-24)
- ✅ **v27.0 Docker Management Upgrade** — Phases 17-23 (shipped 2026-04-25)
- ✅ **v28.0 Docker Management UI (Dockhand-Style)** — Phases 24-30 (shipped 2026-04-26)
- ✅ **v29.0 Deploy & Update Stability** — Phases 31-35 (shipped 2026-04-27)

## Phases

<details>
<summary>v29.0 Deploy & Update Stability (Phases 31-35) — SHIPPED 2026-04-27 — archived per-phase details</summary>

See `.planning/milestones/v29.0-ROADMAP.md` for full archive of Phases 31-35.

**Milestone Goal:** Make `update.sh` deploy pipeline self-healing and observable — fail-loud build guards (Phase 31), pre-flight + auto-rollback (Phase 32), Past Deploys UI + log viewer (Phase 33), mutation onError surface (Phase 34), CI smoke test (Phase 35). Production validated live on Mini PC (deploy `1d44d610` Apr 27).

- [x] **Phase 31: update.sh Build Pipeline Integrity** (3/3 plans) — completed 2026-04-26 (BUILD-01..03)
- [x] **Phase 32: Pre-Update Sanity & Auto-Rollback** (3/3 plans) — completed 2026-04-27 (REL-01/02; Mini PC live, 17/17 must-haves)
- [x] **Phase 33: Update Observability Surface** (3/3 plans) — completed 2026-04-27 (OBS-01..03 + UX-04; Mini PC live deploy validated, browser-confirmed UI)
- [x] **Phase 34: Update UX Hardening** (1/1 plans) — completed 2026-04-27 (UX-01..03; emergency fix reconciled + BACKLOG 999.6 regression test)
- [x] **Phase 35: GitHub Actions update.sh Smoke Test** (1/1 plans) — completed 2026-04-27 (BUILD-04; build-smoke v1, boot-smoke v2 deferred)

</details>

### Past Milestones

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

<details>
<summary>v23.0 Mobile PWA (Phases 37-40) — SHIPPED 2026-04-01</summary>

- [x] Phase 37: PWA Foundation (2/2 plans) — completed 2026-04-01
- [x] Phase 38: Mobile Navigation Infrastructure (2/2 plans) — completed 2026-04-01
- [x] Phase 39: Mobile Home Screen + App Access (2/2 plans) — completed 2026-04-01
- [x] Phase 40: Polish + iOS Hardening (2/2 plans) — completed 2026-04-01

</details>

<details>
<summary>v24.0 Mobile Responsive UI (Phases 1-5) — SHIPPED 2026-04-01</summary>

- [x] Phase 1: AI Chat Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 2: Settings Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 3: Server Control Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 4: Files Mobile (2/2 plans) — completed 2026-04-01
- [x] Phase 5: Terminal Mobile (1/1 plans) — completed 2026-04-01

</details>

<details>
<summary>v25.0 Memory & WhatsApp Integration (Phases 6-10) — SHIPPED 2026-04-03</summary>

- [x] Phase 6: WhatsApp Channel Foundation (2/2 plans) — completed 2026-04-03
- [x] Phase 7: WhatsApp QR Code & Settings UI (2/2 plans) — completed 2026-04-03
- [x] Phase 8: WhatsApp Message Routing & Safety (2/2 plans) — completed 2026-04-03
- [x] Phase 9: Cross-Session Conversation Persistence & Search (2/2 plans) — completed 2026-04-03
- [x] Phase 10: Unified Identity & Memory Management UI (2/2 plans) — completed 2026-04-03

</details>

<details>
<summary>v26.0 Device Security & User Isolation (Phases 11-16) — SHIPPED 2026-04-24</summary>

- [x] Phase 11: Device Ownership Foundation (2/2 plans) — completed 2026-04-24
- [x] Phase 12: Device Access Authorization (2/2 plans) — completed 2026-04-24
- [x] Phase 13: Shell Tool Isolation (1/1 plans) — completed 2026-04-24
- [x] Phase 14: Device Session Binding (2/2 plans) — completed 2026-04-24
- [x] Phase 15: Device Audit Log (2/2 plans) — completed 2026-04-24
- [x] Phase 16: Admin Override & Emergency Disconnect (2/2 plans) — completed 2026-04-24

</details>

<details>
<summary>v28.0 Docker Management UI (Dockhand-Style) (Phases 24-30) — SHIPPED 2026-04-26 — archived per-phase details</summary>

See `.planning/milestones/v28.0-ROADMAP.md` for full archive of Phases 24-29.
Phase 30 (Auto-Update Notification, GitHub-aware) added post-archive: see `.planning/milestones/v28.0-PHASE30-ADDENDUM-AUDIT.md` for the standalone audit (passed; 4/4 reqs UPD-01..04; 4 UAT bugs fixed across 3 hot-patch rounds).

**Milestone Goal:** Restructure v27.0's tab-based Server Management page into a standalone Dockhand-style Docker management application (Phases 24-29) plus replace broken Umbrel OTA infra with GitHub-aware auto-update notification (Phase 30).

- [x] **Phase 24: Docker App Skeleton** — `/docker` route, sidebar layout, top status bar (DOC-01..03) — completed 2026-04-25
- [x] **Phase 25: Multi-Environment Dashboard** — env card grid, Top-CPU panel, tag filter chips (DOC-04..06) — completed 2026-04-25
- [x] **Phase 26: Resource Routes** — Containers/Images/Volumes/Networks dedicated routes (DOC-07..10, DOC-20 partial) — completed 2026-04-25
- [x] **Phase 27: Stacks + Schedules Routes** — preserves Graph/AI/Git tabs (DOC-11, DOC-12) — completed 2026-04-25
- [x] **Phase 28: Cross-Container Logs + Activity Timeline** — multiplex log aggregator, global event timeline (DOC-13, DOC-14) — completed 2026-04-25
- [x] **Phase 29: Shell + Registry + Palette + Settings** — exec, AES-256-GCM credential vault, cmd+k (DOC-15..20) — completed 2026-04-25
- [x] **Phase 30: Auto-Update Notification (GitHub-Aware)** — GitHub commits API + bash subprocess + UpdateNotification card + 5 shape-consumer fixes (UPD-01..04) — completed 2026-04-26

</details>

<details>
<summary>v27.0 Docker Management Upgrade (Phases 17-23) — archived per-phase details</summary>

See `.planning/milestones/v27.0-ROADMAP.md` for full archive.

**Milestone Goal:** Elevate Livinity's Docker management to best-in-class self-hosted Docker platform with Dockhand-inspired features (file browser, GitOps stacks, vulnerability scanning, compose graph viewer, multi-host) plus AI-powered diagnostics as Livinity's unique moat.

- [x] **Phase 17: Docker Quick Wins** — completed 2026-04-24
- [x] **Phase 18: Container File Browser** — completed 2026-04-24
- [x] **Phase 19: Compose Graph Viewer + Vulnerability Scanning** — completed 2026-04-24
- [x] **Phase 20: Scheduled Tasks + Container Backup** — completed 2026-04-24
- [x] **Phase 21: GitOps Stack Deployment** — completed 2026-04-25
- [x] **Phase 22: Multi-host Docker Management** — completed 2026-04-25
- [x] **Phase 23: AI-Powered Docker Diagnostics** — completed 2026-04-25

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 31. update.sh Build Pipeline Integrity | v29.0 | 3/3 | Complete | 2026-04-26 |
| 32. Pre-Update Sanity & Auto-Rollback | v29.0 | 3/3 | Complete | 2026-04-27 |
| 33. Update Observability Surface | v29.0 | 3/3 | Complete | 2026-04-27 |
| 34. Update UX Hardening | v29.0 | 1/1 | Complete | 2026-04-27 |
| 35. GitHub Actions update.sh Smoke Test | v29.0 | 1/1 | Complete | 2026-04-27 |

**v29.0 milestone shipped 2026-04-27.** Production validated on Mini PC (`1d44d610`). See `.planning/milestones/v29.0-MILESTONE-AUDIT.md` for full audit.

**Next milestone:** Run `/gsd-new-milestone` to define v30.0 scope.

---

## Previous Milestones

- v28.0 Docker Management UI (Dockhand-Style) (Phases 24-30, Shipped 2026-04-26)
- v27.0 Docker Management Upgrade (Phases 17-23, Shipped 2026-04-25)
- v26.0 Device Security & User Isolation (Phases 11-16, Shipped 2026-04-24)
- v25.0 Memory & WhatsApp Integration (Phases 6-10, Shipped 2026-04-03)
- v24.0 Mobile Responsive UI (Phases 1-5, Shipped 2026-04-01)
- v23.0 Mobile PWA (Phases 37-40, Shipped 2026-04-01)
- v22.0 Livinity AGI Platform (Phases 29-36, Shipped 2026-03-29)
- v21.0 Autonomous Agent Platform (Phases 19-28, Shipped 2026-03-28)
- v20.0 Live Agent UI (Phases 11-18, Shipped 2026-03-27)
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
