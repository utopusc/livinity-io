# Project Research Summary

**Project:** LivOS v12.0 -- Server Management Dashboard
**Domain:** Docker lifecycle management, PM2 process control, enhanced system monitoring for self-hosted home server OS
**Researched:** 2026-03-22
**Confidence:** HIGH

## Executive Summary

LivOS v12.0 adds a full server management dashboard to the existing Server Control window. The research unanimously confirms that the existing stack covers nearly every requirement: dockerode (already installed) handles all Docker API operations, systeminformation (already installed) covers the missing network/disk I/O metrics, execa (already installed) is the correct tool for PM2 management, and recharts plus xterm (both already installed) handle the frontend. Zero new backend dependencies are needed. The only optional additions are two xterm addons for search and clickable links in log output. This is a feature-build project, not a technology-selection project.

The recommended approach is a tabbed dashboard inside the existing Server Control window, built on three new tRPC routers (docker, pm2, monitoring) following the established thin-routes-plus-fat-domain pattern. Docker streaming (logs, stats) should use tRPC async generator subscriptions over the existing WebSocket infrastructure, matching the proven eventBus pattern already in the codebase. PM2 management should use execa to shell out to the PM2 CLI (not the pm2 programmatic API) to avoid connection lifecycle bugs and version coupling. Container exec reuses the existing terminal-socket.ts WebSocket handler with a new `containerId` query parameter.

The primary risks are security-related, not technical. Docker exec grants host-level shell access and must be admin-only with container authorization. Deleting infrastructure containers (Redis, PostgreSQL, Caddy) will brick the system, so a server-side protected container registry is mandatory before any remove endpoint ships. Multi-user container visibility must filter by ownership to prevent cross-user data leakage. On the performance side, Docker stats streaming without lifecycle management causes memory exhaustion, and log streaming without tail limits can send gigabytes of data. All of these have well-documented prevention strategies detailed in the research.

## Key Findings

### Recommended Stack

No new backend packages required. The entire v12.0 feature set builds on libraries already in the monorepo. This eliminates dependency risk and version compatibility concerns entirely.

**Core technologies (all existing):**
- **dockerode ^4.0.2**: All Docker API operations (containers, images, volumes, networks) -- programmatic API with streaming support, already proven in docker-pull.ts
- **systeminformation (forked)**: Enhanced monitoring (networkStats, disksIO, processes) -- functions exist in the library but are not yet called in the codebase
- **execa ^7.1.1**: PM2 management via `pm2 jlist` JSON output -- avoids the pm2 npm package's 40MB dependency tree, connection management bugs, and version coupling
- **node-pty ^1.0.0 + @xterm/xterm ^5.4.0**: Container exec terminal -- existing terminal-socket.ts handles all PTY lifecycle
- **recharts ^2.12.7**: All monitoring charts (CPU, memory, network I/O, disk I/O, per-container stats) -- existing patterns in live-usage.tsx
- **tRPC v11 async generator subscriptions**: Log and stats streaming over existing WebSocket infrastructure -- proven in eventBus

**Optional frontend additions:** `@xterm/addon-search ^0.16.0` and `@xterm/addon-web-links ^0.12.0` for quality-of-life in the log viewer.

### Expected Features

**Must have (table stakes -- every server UI has these):**
- Full container lifecycle: list (running + stopped), start, stop, restart, remove
- Container detail: inspect, port mappings, volume mounts, environment variables
- Container logs: tail with follow, search, ANSI color rendering
- Container stats: CPU, memory, network I/O per container
- Docker image management: list, remove, prune unused
- Docker volume and network listing with inspect
- PM2 process management: list, restart, stop, start, logs (unique differentiator -- no other self-hosted UI has this)
- Enhanced system monitoring: network interface traffic, disk I/O rates, active process list

**Should have (differentiators):**
- Container exec terminal (from dashboard, not just app context)
- Per-container resource graphs with 60-second history
- Image pull from UI with progress tracking
- Bulk container operations (stop all, remove selected)
- Health check status display

**Defer (v13.0+):**
- Container creation from scratch (users install via App Store)
- Compose file editor (Dockge's domain)
- Historical metrics storage (24h+ time-series)
- Firewall rule management, systemd service management

### Architecture Approach

The dashboard extends the existing Server Control window with a tab-based layout (Overview, Containers, Images, Volumes, Networks, PM2, Monitoring). Three new backend modules (`modules/docker/`, `modules/pm2/`, `modules/monitoring/`) each follow the thin-routes-plus-fat-domain pattern established by existing modules. A singleton Dockerode instance replaces the current per-call instantiation in ai/routes.ts. All Docker/PM2 mutations must be added to `httpOnlyPaths` in common.ts for reliability through the tunnel relay.

**Major components:**
1. **modules/docker/** (docker.ts + routes.ts + types.ts) -- Dockerode singleton, all container/image/volume/network operations, log and stats streaming as async generator subscriptions
2. **modules/pm2/** (pm2.ts + routes.ts) -- Execa-based PM2 CLI wrapper, process listing/management, log file streaming
3. **modules/monitoring/** (routes.ts) -- Real-time system metrics subscription (CPU, memory, network I/O, disk I/O) via polling loop as async generator
4. **ui/routes/server-control/tabs/** -- Tabbed frontend with dedicated hooks per data domain, recharts for visualization, xterm for log rendering

### Critical Pitfalls

1. **Unrestricted Docker exec grants host-level shell** -- Gate behind adminProcedure, validate container ownership against user_app_instances table, add idle timeout and audit logging
2. **Deleting infrastructure containers bricks the system** -- Maintain a server-side PROTECTED_CONTAINERS set (Redis, PostgreSQL, Caddy, etc.), enforce before calling Docker API, never rely on frontend-only guards
3. **Multi-user container visibility leaks cross-user data** -- Filter container listings by user role and ownership using existing user_app_instances/user_app_access tables; admin sees all, members see only theirs
4. **Docker stats streaming causes memory exhaustion** -- Use one-shot stats for overview (5s polling), stream only for single-container detail view, track all streams for cleanup on disconnect, cap concurrent streams per user
5. **Docker log streaming without tail limits sends gigabytes** -- Always default to `--tail 500`, use `--tail 0 --follow` for live tailing, implement circular buffer server-side, use virtual scrolling client-side

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Docker Foundation and Container Management
**Rationale:** Everything depends on the Docker module. The Dockerode singleton, container listing with multi-user filtering, and the protected container registry are prerequisites for all other Docker features. Security controls must be baked in from the start, not bolted on later.
**Delivers:** New docker module (singleton + types + routes), container list with role-based visibility, container lifecycle (start/stop/restart/remove with protection), container inspect/detail view, frontend Containers tab with detail drawer
**Addresses:** Container lifecycle (table stakes), port/volume/env visibility, protected container safety, multi-user filtering
**Avoids:** Pitfalls 1 (exec access), 2 (protected containers), 3 (visibility leak), command injection
**Stack:** dockerode (existing), tRPC adminProcedure, httpOnlyPaths for mutations

### Phase 2: Container Logs and Stats Streaming
**Rationale:** Logs and stats are the highest-value container detail features and both use the same tRPC async generator subscription pattern. Building them together validates the streaming architecture once.
**Delivers:** Container log streaming (tail + follow), log viewer with xterm, container stats streaming (CPU/mem/net), per-container resource charts with recharts
**Addresses:** Container logs (table stakes), container stats (table stakes), per-container graphs (differentiator)
**Avoids:** Pitfalls 4 (stats memory exhaustion) and 5 (log gigabyte streaming)
**Stack:** dockerode streaming APIs, tRPC subscriptions, xterm + recharts (all existing)

### Phase 3: PM2 Process Management
**Rationale:** PM2 management is independent of Docker and can be built in parallel with later Docker phases. It is a unique LivOS differentiator (no other self-hosted UI has PM2 management). Uses execa, so no new dependencies.
**Delivers:** PM2 process list, restart/stop/start actions, process detail view, PM2 log viewing, protected process list (livos, nexus-core cannot be stopped)
**Addresses:** PM2 management (table stakes for LivOS, differentiator in market)
**Avoids:** Pitfall 6 (PM2 connection leaks -- avoided entirely by using execa instead of programmatic API), self-management guard
**Stack:** execa + `pm2 jlist` (existing)

### Phase 4: Docker Images, Volumes, and Networks
**Rationale:** These are secondary Docker resources that extend the container management foundation. Lower priority than containers/logs/stats/PM2 but needed for completeness. All use the same Dockerode singleton from Phase 1.
**Delivers:** Image list/remove/prune, volume list/inspect/remove, network list/inspect/remove, frontend tabs for each
**Addresses:** Image management (table stakes), volume/network visibility (table stakes), image prune (differentiator)
**Avoids:** Image "in use" indicator before deletion, volume data loss from accidental removal
**Stack:** dockerode (existing), same tRPC patterns as Phase 1

### Phase 5: Enhanced System Monitoring
**Rationale:** Builds on the existing system module by adding network I/O, disk I/O, and process list. The monitoring subscription provides a unified real-time metrics stream for the dashboard. Depends on phases 1-4 being done so the Overview tab can synthesize all data sources.
**Delivers:** Network interface traffic graphs, disk I/O graphs, active process list, unified real-time metrics subscription, Monitoring tab, enhanced Overview tab combining all data
**Addresses:** Enhanced monitoring (table stakes gaps), real-time dashboard (differentiator)
**Avoids:** systeminformation first-call null values (prime on startup or handle in UI)
**Stack:** systeminformation (existing), recharts (existing), tRPC subscription

### Phase 6: Polish and Migration Cleanup
**Rationale:** Once all features are built and validated, remove the deprecated Docker routes from ai/routes.ts, add container exec from dashboard (extends terminal-socket.ts), implement bulk operations, and handle edge cases from the "Looks Done But Isn't" checklist.
**Delivers:** Container exec from dashboard, bulk container operations, deprecated route removal, terminal resize handling, health check display, comprehensive error handling for Docker daemon unavailability
**Addresses:** Container exec (differentiator), bulk operations (differentiator), code cleanup
**Avoids:** Breaking existing AI Docker tool calls during migration (keep deprecated aliases until fully migrated)

### Phase Ordering Rationale

- **Phase 1 must come first** because the Dockerode singleton, multi-user filtering, and protected container registry are prerequisites for every other feature. Security controls cannot be retrofitted.
- **Phase 2 follows Phase 1** because log/stats streaming is the most complex pattern and validates the subscription architecture early. If the streaming approach has issues, discovering them early prevents rework in later phases.
- **Phase 3 is independent** of Docker phases and could theoretically be built in parallel with Phase 2, but is sequenced after to keep the critical path focused.
- **Phase 4 groups secondary Docker resources** together because they share the same Dockerode singleton and identical route patterns (list, inspect, remove). Minimal new architecture decisions.
- **Phase 5 comes late** because the Overview tab needs data from all other phases to synthesize a meaningful dashboard.
- **Phase 6 is last** because cleanup and polish should only happen after all features are stable.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Logs/Stats Streaming):** The tRPC async generator subscription pattern for Docker streams needs careful design around stream lifecycle, backpressure, and cleanup. The eventBus subscription is a good reference but Docker streams have different characteristics (continuous high-throughput data vs sparse events). Worth a `/gsd:research-phase` to nail down the exact implementation pattern.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Docker Foundation):** Well-documented dockerode API, straightforward tRPC CRUD routes, established patterns in codebase.
- **Phase 3 (PM2 Management):** Simple execa + JSON parsing, no complex patterns.
- **Phase 4 (Images/Volumes/Networks):** Identical patterns to Phase 1 container management, just different Docker resource types.
- **Phase 5 (System Monitoring):** systeminformation functions are well-documented, existing polling patterns in system/routes.ts to follow.
- **Phase 6 (Polish):** No research needed, just implementation and QA.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new backend deps needed. All libraries already installed and proven in the codebase. Sources are official npm docs and direct codebase analysis. |
| Features | HIGH | Feature matrix derived from Portainer, Cockpit, CasaOS, Yacht, Dockge comparisons. Table stakes are well-established across the industry. |
| Architecture | HIGH | Architecture decisions based on direct codebase analysis of 13 existing tRPC routers, 3 streaming mechanisms, and established patterns. No speculation. |
| Pitfalls | HIGH | Pitfalls sourced from Portainer CVE history, Docker security documentation, PM2 API docs, and analysis of the actual existing code (e.g., terminal-socket.ts lacking role checks). |

**Overall confidence:** HIGH

### Gaps to Address

- **STACK.md vs ARCHITECTURE.md disagreement on PM2 approach:** STACK.md recommends execa (shell out to PM2 CLI) while ARCHITECTURE.md recommends the pm2 programmatic API. PITFALLS.md sides with execa due to connection leak risks. **Resolution: Use execa.** The programmatic API's connection management burden is not worth the marginal benefit of avoiding JSON parsing. The codebase already uses execa extensively, and `pm2 jlist` output is stable structured JSON.
- **STACK.md vs ARCHITECTURE.md disagreement on streaming transport:** STACK.md recommends SSE for container stats/log streaming while ARCHITECTURE.md recommends tRPC async generator subscriptions over WebSocket. **Resolution: Use tRPC subscriptions.** The infrastructure already exists (eventBus uses this pattern), the types auto-propagate, and it avoids adding a new transport mechanism. SSE would require `httpSubscriptionLink` changes to the client.
- **systeminformation first-call null values:** networkStats(), disksIO(), and fsStats() return null for rate values on the first call. Need to decide during Phase 5 planning whether to prime on server startup or handle gracefully in the UI (show "Calculating..." for the first 1-2 seconds).
- **Terminal resize events:** The existing terminal-socket.ts passes initial cols/rows but the PITFALLS research flags that ongoing resize events may not be handled. Needs verification during Phase 6 planning.
- **Docker daemon unavailability handling:** No research covered what happens when the Docker daemon is temporarily unreachable (e.g., during system updates). All Docker routes need graceful error handling, but the specific UX pattern needs design during implementation.

## Sources

### Primary (HIGH confidence)
- [dockerode npm/GitHub](https://github.com/apocas/dockerode) -- Container, Image, Volume, Network API surface, streaming patterns
- [Docker Engine API docs](https://docs.docker.com/engine/api/) -- Stats, logs, exec endpoint behavior
- [systeminformation npm](https://www.npmjs.com/package/systeminformation) -- networkStats, disksIO, processes function signatures and behavior
- [tRPC v11 subscriptions docs](https://trpc.io/docs/server/subscriptions) -- Async generator pattern
- [PM2 programmatic API docs](https://pm2.io/docs/runtime/reference/pm2-programmatic/) -- Evaluated and rejected
- Direct codebase analysis of all 13 existing tRPC routers, terminal-socket.ts, docker-pull.ts, system.ts, ai/routes.ts

### Secondary (MEDIUM confidence)
- [Portainer CVE history (Fortinet)](https://www.fortinet.com/blog/threat-research/seven-critical-vulnerabilities-portainer) -- Security pitfalls
- [Docker Container Escape Techniques (Unit42)](https://unit42.paloaltonetworks.com/container-escape-techniques/) -- exec security considerations
- [Dokploy DeepWiki](https://deepwiki.com/dokploy/dokploy/9.1-real-time-log-streaming) -- Circular buffer pattern for log streaming
- [Docker Stats API Performance (moby #23188)](https://github.com/moby/moby/issues/23188) -- Stats API performance characteristics

### Tertiary (LOW confidence)
- [XDA Portainer frustrations](https://www.xda-developers.com/why-i-stopped-using-portainer-and-went-back-to-dockge/) -- UX lessons (anecdotal but useful for feature prioritization)

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
