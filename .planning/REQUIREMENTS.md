# Project Requirements — v28.0 Docker Management UI (Dockhand-Style)

**Goal:** Convert v27.0's tab-based Server Management page into a standalone Dockhand-style Docker management application — left sidebar navigation, top status bar with environment + system stats, multi-environment Dashboard, and dedicated routes for every resource type.

**Reference design:** Dockhand (https://dockhand.dev / https://dockhand.bor6.pl) — see screenshot in `.planning/research/v28-dockhand-reference.png` (if attached). Top status bar shows env name + Docker version + Socket type + cores + RAM + disk + uptime + Live indicator + theme toggle. Sidebar lists Dashboard / Containers / Logs / Shell / Stacks / Images / Volumes / Networks / Registry / Activity / Schedules / Settings.

**Backend reuse:** v27.0 shipped all the data plumbing — environments, agent transport, AI diagnostics, vuln-scan, scheduler, git stacks, file browser, real-time logs. v28.0 is **UI restructure only**: zero new backend modules; existing tRPC routes consumed from a redesigned frontend.

---

## Requirements

### Layout & Navigation
- [ ] **DOC-01**: Standalone Docker app at route `/docker` (or top-level `/server` rebranded) with persistent left sidebar navigation. Sidebar entries: Dashboard, Containers, Logs, Shell, Stacks, Images, Volumes, Networks, Registry, Activity, Schedules, Settings. Active route highlighted. Collapsible to icon-only.
- [ ] **DOC-02**: Top status bar (full-width header, persistent across routes) shows: env selector dropdown (with type badge), Docker version, Socket/TCP/Agent type, cores, RAM total, free disk, uptime, current time, Live/Offline indicator (WS connection state), Search button (cmd+k palette), theme toggle.
- [ ] **DOC-03**: Existing `/server` (Server Management page) is deprecated — redirected to new Docker app. Old tab-based UI removed entirely (no parallel implementations to maintain).

### Dashboard
- [ ] **DOC-04**: Dashboard route shows multi-environment grid. Each card displays: env name + type icon + connection target (socket path or host:port), env tags (prod/dev/staging — user-editable), aggregate health (all-healthy / N-unhealthy banner), running/stopped/paused/restarting counts, total container count, image/stack/volume/network counts, recent events (last 8 with timestamp + name + verb icon), CPU/memory utilization for selected env (live polling).
- [ ] **DOC-05**: Dashboard "Top containers by CPU" panel shows top-N containers across all envs sorted by CPU percent, with quick-action chips (logs / shell / restart). Updates every 5s.
- [ ] **DOC-06**: Dashboard env filter chips (All / dev / prod / staging) filter card grid client-side without re-fetching.

### Resource Routes
- [ ] **DOC-07**: `/docker/containers` — full container list (current Containers tab content) as own route. Detail panel slides over from right (current sheet pattern preserved).
- [ ] **DOC-08**: `/docker/images` — full image list with Scan + Explain CVEs buttons (current Images tab) as own route.
- [ ] **DOC-09**: `/docker/volumes` — full volume list as own route. Volume backup config link to Schedules route.
- [ ] **DOC-10**: `/docker/networks` — full network list as own route.
- [ ] **DOC-11**: `/docker/stacks` — full stack list as own route. Create dialog preserves YAML / Git / AI tabs from v27.0. Stack detail keeps Graph + Logs + Files tabs.
- [ ] **DOC-12**: `/docker/schedules` — current Settings > Scheduler section as own route (job list + Run Now + Test Destination + AddJob dialog).

### New Surfaces
- [ ] **DOC-13**: `/docker/logs` — cross-container log aggregator. Multi-select containers, free-text grep filter, timestamp range, severity filter, live-tail toggle. Re-uses `/ws/docker/logs` per-container with multiplexed UI.
- [ ] **DOC-14**: `/docker/activity` — global event timeline (current Events tab content + scheduler run history + AI alert history) sorted descending. Filter by source (docker / scheduler / ai).
- [ ] **DOC-15**: `/docker/shell` — cross-container exec terminal with sidebar listing all running containers; click container → opens exec session in main pane. Tabs for multiple concurrent sessions. Uses existing `/ws/docker/exec` per container.
- [ ] **DOC-16**: `/docker/registry` — Docker Hub + private registry credentials CRUD (encrypted with AES-256-GCM mirroring git-credentials). Image search across configured registries → "Pull" button creates new image entry. Credentials surface in stack-create env vars where needed.

### Settings
- [ ] **DOC-17**: `/docker/settings` houses Environments management (current Settings > Environments) + theme + cmd-k palette config + sidebar density. Global Livinity Settings (users, domains, multi-user toggle, etc.) stay at the existing `/settings` page.

### UX Quality
- [ ] **DOC-18**: cmd+k command palette searches across containers, stacks, images, env names, recent events, settings sections. Result click navigates to the exact resource.
- [ ] **DOC-19**: Theme toggle (light / dark / system) persists per-user. Existing LivOS theme system reused (no new theme infra).
- [ ] **DOC-20**: All resource routes support deep-linking — `/docker/containers/n8n` opens with n8n container detail panel pre-expanded; `/docker/stacks/myproject` opens stack detail. URLs are bookmarkable and shareable.

---

## Traceability

| ID | Phase | Status | Notes |
|----|-------|--------|-------|
| DOC-01 | Phase 24 | Pending | Sidebar layout + route skeleton |
| DOC-02 | Phase 24 | Pending | Top status bar component |
| DOC-03 | Phase 24 | Pending | Old `/server` deprecation |
| DOC-04 | Phase 25 | Pending | Dashboard env-card grid |
| DOC-05 | Phase 25 | Pending | Top-CPU panel |
| DOC-06 | Phase 25 | Pending | Env tag filter chips |
| DOC-07 | Phase 26 | Pending | Containers route |
| DOC-08 | Phase 26 | Pending | Images route |
| DOC-09 | Phase 26 | Pending | Volumes route |
| DOC-10 | Phase 26 | Pending | Networks route |
| DOC-11 | Phase 27 | Pending | Stacks route |
| DOC-12 | Phase 27 | Pending | Schedules route |
| DOC-13 | Phase 28 | Pending | Cross-container Logs |
| DOC-14 | Phase 28 | Pending | Activity timeline |
| DOC-15 | Phase 29 | Pending | Cross-container Shell |
| DOC-16 | Phase 29 | Pending | Registry credentials + search |
| DOC-17 | Phase 29 | Pending | Docker-app Settings (envs + theme + palette) |
| DOC-18 | Phase 29 | Pending | cmd+k palette |
| DOC-19 | Phase 29 | Pending | Theme toggle |
| DOC-20 | Phase 29 | Pending | Deep-linking on all resource routes |

**Coverage**: 20 requirements across 6 phases (24-29).

---

## Out of Scope (deferred to v29.0+)

- Native mobile Docker app layout (current v23.0 mobile responsive UI continues to apply)
- Multi-host stack deploy via compose-file replication (v27.0 deferred item)
- Multi-host Trivy scan (v27.0 deferred item)
- Real-time WS exec/logs over remote tcp-tls or agent envs (v27.0 deferred item)
- Custom dashboard widgets / user-arrangeable layout
- Saved query presets in cross-container Logs
- Cross-container regex grep replacement of an entire stack's env vars at once
- Image SBOM / license scanning (v27.0 vuln-scan only ships CVE)
- Agent registration UI flow refinements beyond v27.0 (token rotation reminders, agent uptime SLO panels)
- Webhook secret rotation UI for git stacks (v27.0 deferred)
- editStack git mode toggle (v27.0 deferred)
- Per-environment Kimi spend cap UI (v27.0 deferred)
- AI prompt-tuning analytics view from `ai_alerts.payload_json` (v27.0 deferred)

---

*Requirements gathered: 2026-04-25*
*Reference design: Dockhand (dockhand.dev)*
*Backend foundation: v27.0 — all data layer shipped*
