# Feature Research: Server Management Dashboard

**Domain:** Server management UI for self-hosted Docker/PM2/system monitoring
**Researched:** 2026-03-22
**Overall confidence:** HIGH

---

## Executive Summary

Production server management UIs (Portainer, Cockpit, CasaOS, Yacht, Dockge) converge on a common feature set. Docker container lifecycle (inspect, logs, exec, remove, stats), image management, volume/network visibility, and process management are table stakes. Differentiators include compose-file editing, real-time resource graphs, and terminal-in-browser. LivOS already has basic container cards and resource monitoring — the gap is depth (full lifecycle) and breadth (PM2, images, volumes, networks).

---

## Feature Categories

### 1. Docker Container Management

#### Table Stakes (every server UI has these)

| Feature | Portainer | Cockpit | CasaOS | Yacht | Complexity |
|---------|-----------|---------|--------|-------|------------|
| List all containers (running + stopped) | ✓ | ✓ | ✓ | ✓ | Low (exists) |
| Start / Stop / Restart | ✓ | ✓ | ✓ | ✓ | Low (exists) |
| Remove container | ✓ | ✓ | ✓ | ✓ | Low |
| View logs (tail + follow) | ✓ | ✓ | ✓ | ✓ | Medium |
| Inspect (full detail view) | ✓ | ✓ | ✗ | ✓ | Medium |
| Container stats (CPU/RAM/Net) | ✓ | ✓ | ✗ | ✗ | Medium |
| Port mapping visibility | ✓ | ✓ | ✓ | ✓ | Low |
| Volume mount visibility | ✓ | ✓ | ✗ | ✓ | Low |
| Environment variables view | ✓ | ✗ | ✗ | ✓ | Low |
| Container terminal (exec) | ✓ | ✓ | ✗ | ✗ | High |

#### Differentiators

| Feature | Who Has It | Value | Complexity |
|---------|-----------|-------|------------|
| Create container from UI | Portainer | Medium | High |
| Compose file editor | Dockge | High | High |
| Container rename | Portainer | Low | Low |
| Auto-restart policy editor | Portainer | Medium | Medium |
| Health check status | Portainer | Medium | Low |
| Resource limit configuration | Portainer | Medium | Medium |

#### Anti-Features (skip for v12.0)

| Feature | Why Skip |
|---------|----------|
| Container creation from scratch | Too complex, users install via App Store |
| Swarm/Kubernetes management | Not relevant for single-server LivOS |
| Container registry management | Not needed for self-hosted |
| Compose file editor | Dockge does this well, out of scope |

### 2. Docker Image Management

#### Table Stakes

| Feature | Complexity | Notes |
|---------|------------|-------|
| List images (name, tag, size, created) | Low | dockerode.listImages() |
| Pull image by name:tag | Medium | Progress streaming |
| Remove unused images | Low | Confirmation required |
| Image size/layer info | Low | From inspect |

#### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Prune unused images (space reclaim) | High | Low |
| Image history / layers view | Low | Medium |

### 3. Docker Volumes & Networks

#### Table Stakes

| Feature | Complexity |
|---------|------------|
| List volumes (name, driver, mount point) | Low |
| List networks (name, driver, containers) | Low |
| Volume usage size | Medium |
| Network inspect (connected containers) | Low |

#### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Create/remove volumes | Medium | Low |
| Prune unused volumes | High | Low |
| Create networks | Low | Medium |

### 4. PM2 Process Management

#### Table Stakes (no server management UI does this — LivOS differentiator)

| Feature | Complexity | Notes |
|---------|------------|-------|
| List processes (name, status, CPU, RAM, uptime, restarts) | Low | `pm2 jlist` |
| Stop / Start / Restart process | Low | `pm2 restart <name>` |
| View process logs (stdout + stderr) | Medium | `pm2 logs --json` or file read |
| Process detail (pid, script, cwd, env) | Low | `pm2 describe <name>` |

#### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Restart count / crash history | Medium | Low |
| Memory limit configuration | Low | Medium |
| Process environment editor | Low | High |
| Log rotation trigger | Low | Medium |

### 5. System Monitoring (Enhanced)

#### Table Stakes (partially exists)

| Feature | Status | Complexity |
|---------|--------|------------|
| CPU usage (total + per-core) | ✓ EXISTS | — |
| Memory usage (total + breakdown) | ✓ EXISTS | — |
| Disk usage (total + per-mount) | ✓ EXISTS | — |
| CPU temperature | ✓ EXISTS | — |
| Network interfaces + traffic | MISSING | Medium |
| Disk I/O (read/write speed) | MISSING | Medium |
| Active processes list (top) | MISSING | Medium |
| System uptime | ✓ EXISTS | — |

#### Differentiators

| Feature | Value | Complexity |
|---------|-------|------------|
| Historical metrics (24h graphs) | High | High |
| Network bandwidth graph | Medium | Medium |
| Per-container network traffic | Low | High |
| UFW/firewall rule viewer | Medium | Medium |
| systemd service status | Medium | Medium |

### 6. UI/UX Patterns from Best-in-Class

#### Portainer Patterns (industry leader)
- **Container list**: Sortable table with bulk actions (stop all, remove selected)
- **Detail view**: Tabbed (Overview, Logs, Inspect, Stats, Console)
- **Logs**: Auto-scroll, search, download, timestamp toggle
- **Stats**: Real-time line graphs (CPU%, Memory, Network I/O)
- **Console**: Full terminal with shell selector (bash/sh/ash)

#### Cockpit Patterns (Red Hat quality)
- **Dashboard first**: CPU, Memory, Network, Disk I/O sparklines at top
- **Container table**: Status pills, quick actions inline
- **Integrated terminal**: Full system terminal + per-container exec
- **Services tab**: systemd services list with enable/disable

#### CasaOS Patterns (consumer-friendly)
- **Card-based UI**: Visual, icon-heavy, less technical
- **Status at glance**: Running/stopped badge, resource mini-bar
- **One-click actions**: Large buttons, confirmation dialogs
- **Mobile-friendly**: Responsive grid layout

### LivOS Approach (recommended blend)
- **Portainer depth** (full container detail with tabs)
- **CasaOS aesthetics** (clean cards, visual status indicators)
- **Cockpit dashboard** (system overview with sparklines)
- **Unique**: PM2 management (no other self-hosted UI has this)

---

## Feature Dependencies

| Feature | Depends On |
|---------|-----------|
| Container logs UI | Backend logs endpoint with streaming |
| Container exec/terminal | WebSocket handler + xterm.js (exists) |
| Container stats | Backend stats endpoint with polling |
| PM2 management UI | New PM2 tRPC router |
| Network monitoring | systeminformation networkStats() |
| Image management | New Docker image tRPC routes |

---

## Recommended v12.0 Scope

### Must Have (v12.0)
- Full container lifecycle (inspect, logs, remove, stats)
- Port/volume/env visibility in container detail
- Docker image list + remove + prune
- Docker volume/network list
- PM2 process list + restart/stop + logs
- Enhanced system monitoring (network, disk I/O)

### Nice to Have (v12.0 if time)
- Container exec terminal
- Per-container resource graphs
- Bulk container operations
- Image pull from UI

### Defer (v13.0+)
- Container creation from UI
- Compose file editor
- Historical metrics storage
- Firewall rule management
- systemd service management

---

*Research completed: 2026-03-22*
