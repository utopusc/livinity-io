# Project Requirements — v28.0 Docker Management UI (Dockhand-Style)

**Goal:** Convert v27.0's tab-based Server Management page into a standalone Dockhand-style Docker management application — left sidebar navigation, top status bar with environment + system stats, multi-environment Dashboard, and dedicated routes for every resource type.

**Reference design:** Dockhand (https://dockhand.dev / https://dockhand.bor6.pl) — see screenshot in `.planning/research/v28-dockhand-reference.png` (if attached). Top status bar shows env name + Docker version + Socket type + cores + RAM + disk + uptime + Live indicator + theme toggle. Sidebar lists Dashboard / Containers / Logs / Shell / Stacks / Images / Volumes / Networks / Registry / Activity / Schedules / Settings.

**Backend reuse:** v27.0 shipped all the data plumbing — environments, agent transport, AI diagnostics, vuln-scan, scheduler, git stacks, file browser, real-time logs. v28.0 is **UI restructure only**: zero new backend modules; existing tRPC routes consumed from a redesigned frontend.

---

## Requirements

### Layout & Navigation
- [x] **DOC-01**: Standalone Docker app at route `/docker` (or top-level `/server` rebranded) with persistent left sidebar navigation. Sidebar entries: Dashboard, Containers, Logs, Shell, Stacks, Images, Volumes, Networks, Registry, Activity, Schedules, Settings. Active route highlighted. Collapsible to icon-only. _(Plan 24-01: sidebar + 12 entries + collapse + active highlight done; full closure with status bar pending Plan 24-02)_
- [x] **DOC-02**: Top status bar (full-width header, persistent across routes) shows: env selector dropdown (with type badge), Docker version, Socket/TCP/Agent type, cores, RAM total, free disk, uptime, current time, Live/Offline indicator (WS connection state), Search button (cmd+k palette), theme toggle.
- [x] **DOC-03**: Existing `/server` (Server Management page) is deprecated — redirected to new Docker app. Old tab-based UI removed entirely (no parallel implementations to maintain). _(Plan 24-01: legacy LIVINITY_server-control unreachable from dock + desktop + mobile + spotlight; file delete pending Plan 27)_

### Dashboard
- [x] **DOC-04**: Dashboard route shows multi-environment grid. Each card displays: env name + type icon + connection target (socket path or host:port), env tags (prod/dev/staging — user-editable), aggregate health (all-healthy / N-unhealthy banner), running/stopped/paused/restarting counts, total container count, image/stack/volume/network counts, recent events (last 8 with timestamp + name + verb icon), CPU/memory utilization for selected env (live polling). _(Per-card Retry button on Unreachable banner shipped in 25-02; per-env CPU/memory aggregate pill deferred — cross-env Top-CPU panel ships under DOC-05.)_
- [x] **DOC-05**: Dashboard "Top containers by CPU" panel shows top-N containers across all envs sorted by CPU percent, with quick-action chips (logs / shell / restart). Updates every 5s. _(Plan 25-02: bounded per-env candidate fanout; Logs/Shell set env scope only — Phase 28/29 own deep-link by container name.)_
- [x] **DOC-06**: Dashboard env filter chips (All / dev / prod / staging) filter card grid client-side without re-fetching. _(Plan 25-02: localStorage-persisted single-select with auto-fallback when persisted tag no longer exists.)_

### Resource Routes
- [x] **DOC-07
**: `/docker/containers` — full container list (current Containers tab content) as own route. Detail panel slides over from right (current sheet pattern preserved).
- [x] **DOC-08
**: `/docker/images` — full image list with Scan + Explain CVEs buttons (current Images tab) as own route.
- [x] **DOC-09
**: `/docker/volumes` — full volume list as own route. Volume backup config link to Schedules route.
- [x] **DOC-10
**: `/docker/networks` — full network list as own route.
- [x] **DOC-11
**: `/docker/stacks` — full stack list as own route. Create dialog preserves YAML / Git / AI tabs from v27.0. Stack detail keeps Graph + Logs + Files tabs.
- [x] **DOC-12
**: `/docker/schedules` — current Settings > Scheduler section as own route (job list + Run Now + Test Destination + AddJob dialog).

### New Surfaces
- [x] **DOC-13
**: `/docker/logs` — cross-container log aggregator. Multi-select containers, free-text grep filter, timestamp range, severity filter, live-tail toggle. Re-uses `/ws/docker/logs` per-container with multiplexed UI.
- [x] **DOC-14
**: `/docker/activity` — global event timeline (current Events tab content + scheduler run history + AI alert history) sorted descending. Filter by source (docker / scheduler / ai).
- [ ] **DOC-15**: `/docker/shell` — cross-container exec terminal with sidebar listing all running containers; click container → opens exec session in main pane. Tabs for multiple concurrent sessions. Uses existing `/ws/docker/exec` per container.
- [ ] **DOC-16**: `/docker/registry` — Docker Hub + private registry credentials CRUD (encrypted with AES-256-GCM mirroring git-credentials). Image search across configured registries → "Pull" button creates new image entry. Credentials surface in stack-create env vars where needed.

### Settings
- [ ] **DOC-17**: `/docker/settings` houses Environments management (current Settings > Environments) + theme + cmd-k palette config + sidebar density. Global Livinity Settings (users, domains, multi-user toggle, etc.) stay at the existing `/settings` page.

### UX Quality
- [ ] **DOC-18**: cmd+k command palette searches across containers, stacks, images, env names, recent events, settings sections. Result click navigates to the exact resource.
- [ ] **DOC-19**: Theme toggle (light / dark / system) persists per-user. Existing LivOS theme system reused (no new theme infra).
- [x] **DOC-20**: All resource routes support deep-linking — `/docker/containers/n8n` opens with n8n container detail panel pre-expanded; `/docker/stacks/myproject` opens stack detail. URLs are bookmarkable and shareable. _(Programmatic half closed across Plan 26-01 + 26-02 for all 4 resource types via useDockerResource.getState().setSelectedX(value); URL-bar form remains Phase 29 final closure.)_

---

## Traceability

| ID | Phase | Status | Notes |
|----|-------|--------|-------|
| DOC-01 | Phase 24 | Partial (24-01) | Sidebar + 12 entries + collapse done; full closure (with status bar) in Plan 24-02 |
| DOC-02 | Phase 24 | Complete | Top status bar component (Plan 24-02) |
| DOC-03 | Phase 24 | Partial (24-01) | Legacy server-control unreachable from dock/desktop/mobile/spotlight; file delete in Plan 27 SUMMARY |
| DOC-04 | Phase 25 | Complete (25-01 + 25-02) | EnvCardGrid + EnvCard + per-env polling (5s containers / 10s events / 30s static counts) shipped in 25-01; per-card Retry button on Unreachable banner shipped in 25-02 |
| DOC-05 | Phase 25 | Complete (25-02) | TopCpuPanel — top-10 cross-env containers by CPU% via bounded per-env candidate fanout (PER_ENV_CANDIDATES=5); Logs/Shell/Restart quick-action chips per row; restart proactively disabled on protected containers |
| DOC-06 | Phase 25 | Complete (25-01 + 25-02) | environments.tags TEXT[] column + read/write CRUD + tRPC schemas shipped in 25-01; TagFilterChips above grid + useTagFilter localStorage hook + filterEnvs client-side filter shipped in 25-02 |
| DOC-07 | Phase 26 | Complete (26-01) | ContainerSection — full Containers tab body with search + bulk-action bar + protected-container guards + ContainerDetailSheet wired through useDockerResource store for DOC-20 programmatic deep-link |
| DOC-08 | Phase 26 | Complete (26-01) | ImageSection — full Images tab body with search + expandable rows (Layer history + Vulnerabilities tabs) + Phase 19 Trivy scan + Phase 23 Explain CVEs preserved end-to-end |
| DOC-09 | Phase 26 | Complete (26-02) | VolumeSection — full Volumes tab body with search + chevron-expand to VolumeUsagePanel + per-row "Schedule backup" link (IconCalendarTime) that sets selectedVolume + setSection('schedules') so Phase 27 Schedules section can pre-fill the backup-job-create form |
| DOC-10 | Phase 26 | Complete (26-02) | NetworkSection — full Networks tab body with search (filters by name + driver) + inspect card with Disconnect mutations + bridge useEffect connecting useDockerResource.selectedNetwork to inspectNetwork(id) for programmatic deep-link |
| DOC-11 | Phase 27 | Complete | Stacks route |
| DOC-12 | Phase 27 | Complete | Schedules route |
| DOC-13 | Phase 28 | Complete (28-01) | Cross-container Logs — multi-select sidebar (running containers in selected env), multiplexed WS (one socket per checked container against env-aware `/ws/docker/logs?envId=`), deterministic per-container color stripes + `[name]` line prefixes, regex grep with invalid-regex badge, ERROR/WARN/INFO/DEBUG severity heuristic, live-tail toggle with Dockhand-style auto-disable on manual scroll-up, bare-bones virtualizer (no react-window dep), 25-socket cap + truncation banner |
| DOC-14 | Phase 28 | Pending | Activity timeline |
| DOC-15 | Phase 29 | Pending | Cross-container Shell |
| DOC-16 | Phase 29 | Pending | Registry credentials + search |
| DOC-17 | Phase 29 | Pending | Docker-app Settings (envs + theme + palette) |
| DOC-18 | Phase 29 | Pending | cmd+k palette |
| DOC-19 | Phase 29 | Pending | Theme toggle |
| DOC-20 | Phase 29 | Complete | Deep-linking on all resource routes |

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
