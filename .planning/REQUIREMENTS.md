# Requirements: Livinity v12.0 — Server Management Dashboard

**Defined:** 2026-03-22
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v12.0 Requirements

### DOCK — Docker Container Management

- [x] **DOCK-01**: User can see all containers (running + stopped) with name, image, state, status, ports, and resource usage
- [x] **DOCK-02**: User can start, stop, restart, and remove containers from the UI
- [x] **DOCK-03**: User can view container details (full inspect: ports, volumes, env vars, networks, mounts, restart policy, health)
- [x] **DOCK-04**: User can view container logs with tail limit, auto-scroll, and search
- [x] **DOCK-05**: User can see per-container CPU and memory usage stats in real-time
- [x] **DOCK-06**: Protected containers (Redis, PostgreSQL, Caddy, LivOS core) cannot be stopped or removed from UI
- [x] **DOCK-07**: Remove operation requires confirmation dialog with container name

### IMG — Docker Image Management

- [ ] **IMG-01**: User can see all Docker images with name, tag, size, and creation date
- [ ] **IMG-02**: User can remove unused images to reclaim disk space
- [ ] **IMG-03**: User can prune all dangling/unused images with confirmation and space reclaimed feedback

### VOL — Docker Volume & Network Management

- [ ] **VOL-01**: User can see all Docker volumes with name, driver, and mount point
- [ ] **VOL-02**: User can see all Docker networks with name, driver, and connected container count
- [ ] **VOL-03**: User can remove unused volumes with confirmation
- [ ] **VOL-04**: User can inspect a network to see connected containers

### PM2 — Process Management

- [ ] **PM2-01**: User can see all PM2 processes with name, status, CPU%, memory, uptime, and restart count
- [ ] **PM2-02**: User can start, stop, and restart individual PM2 processes
- [ ] **PM2-03**: User can view PM2 process logs (stdout + stderr) with tail and auto-scroll
- [ ] **PM2-04**: User can see process details (pid, script path, cwd, node version)

### MON — Enhanced System Monitoring

- [ ] **MON-01**: User can see network interface traffic (bytes in/out, speed) in real-time
- [ ] **MON-02**: User can see disk I/O metrics (read/write speed) in real-time
- [ ] **MON-03**: User can see a process list sorted by CPU or memory usage

### UI — Dashboard UI

- [x] **UI-01**: Server Management is a tabbed interface (Overview, Containers, Images, Volumes, Networks, PM2, Monitoring)
- [ ] **UI-02**: Overview tab shows system health dashboard (CPU, RAM, Disk, Network sparklines + container/PM2 summary)
- [ ] **UI-03**: Container detail opens a slide-over or modal with tabbed view (Info, Logs, Stats)
- [x] **UI-04**: All destructive operations (remove, prune) show confirmation dialogs
- [x] **UI-05**: Real-time data updates without full page refresh (polling or subscription)

### SEC — Security

- [x] **SEC-01**: All Docker/PM2 management operations require admin role
- [x] **SEC-02**: Protected container/process registry prevents accidental deletion of infrastructure
- [x] **SEC-03**: Container remove requires explicit confirmation with container name typed

## v13.0+ Requirements (Deferred)

### Future Docker
- **DOCK-F01**: Container exec terminal (shell into container from browser)
- **DOCK-F02**: Container creation from UI (image + config)
- **DOCK-F03**: Compose file editor
- **DOCK-F04**: Bulk container operations (stop all, remove selected)

### Future Monitoring
- **MON-F01**: Historical metrics with 24h/7d graphs
- **MON-F02**: systemd service management
- **MON-F03**: UFW/firewall rule viewer
- **MON-F04**: Alert thresholds (notify when CPU > 90%)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Swarm/Kubernetes | Single-server LivOS, not cluster management |
| Container registry | Not needed for self-hosted |
| Docker Compose editor | Dockge does this well, different tool |
| Container creation from scratch | Users install via App Store |
| Image build from Dockerfile | Developer tool, not server admin |
| Historical metrics DB (Prometheus/InfluxDB) | Too heavy for v12.0, defer |
| Mobile-specific layout | Desktop-first windowed UI |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOCK-01 | Phase 35 | Complete |
| DOCK-02 | Phase 35 | Complete |
| DOCK-03 | Phase 36 | Complete |
| DOCK-04 | Phase 36 | Complete |
| DOCK-05 | Phase 36 | Complete |
| DOCK-06 | Phase 35 | Complete |
| DOCK-07 | Phase 35 | Complete |
| IMG-01 | Phase 37 | Pending |
| IMG-02 | Phase 37 | Pending |
| IMG-03 | Phase 37 | Pending |
| VOL-01 | Phase 37 | Pending |
| VOL-02 | Phase 37 | Pending |
| VOL-03 | Phase 37 | Pending |
| VOL-04 | Phase 37 | Pending |
| PM2-01 | Phase 38 | Pending |
| PM2-02 | Phase 38 | Pending |
| PM2-03 | Phase 38 | Pending |
| PM2-04 | Phase 38 | Pending |
| MON-01 | Phase 39 | Pending |
| MON-02 | Phase 39 | Pending |
| MON-03 | Phase 39 | Pending |
| UI-01 | Phase 35 | Complete |
| UI-02 | Phase 39 | Pending |
| UI-03 | Phase 36 | Pending |
| UI-04 | Phase 35 | Complete |
| UI-05 | Phase 35 | Complete |
| SEC-01 | Phase 35 | Complete |
| SEC-02 | Phase 35 | Complete |
| SEC-03 | Phase 35 | Complete |

**Coverage:**
- v12.0 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after initial definition*
