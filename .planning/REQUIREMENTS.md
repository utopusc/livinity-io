# Requirements: Livinity v13.0 — Portainer-Level Server Management

**Defined:** 2026-03-22
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v13.0 Requirements

### CREATE — Container Creation

- [ ] **CREATE-01**: User can create a new container from any image with name, image:tag, command, entrypoint, working dir, and user fields
- [ ] **CREATE-02**: User can configure port mappings (host:container/protocol) with add/remove rows in creation form
- [ ] **CREATE-03**: User can configure volume mounts (bind + named) with host path, container path, and read-only toggle
- [ ] **CREATE-04**: User can set environment variables as key-value pairs with add/remove rows
- [ ] **CREATE-05**: User can set restart policy (no, always, on-failure with retries, unless-stopped)
- [ ] **CREATE-06**: User can set resource limits (memory limit MB, CPU limit) in creation form
- [ ] **CREATE-07**: User can set health check (command, interval, timeout, retries, start period)
- [ ] **CREATE-08**: User can select network mode (bridge/host/none/custom) and set hostname

### EDIT — Container Edit & Recreate

- [ ] **EDIT-01**: User can edit an existing container's port mappings and recreate it
- [ ] **EDIT-02**: User can edit an existing container's environment variables and recreate
- [ ] **EDIT-03**: User can edit an existing container's volume mounts and recreate
- [ ] **EDIT-04**: User can edit an existing container's restart policy and recreate
- [ ] **EDIT-05**: User can edit an existing container's resource limits and recreate
- [ ] **EDIT-06**: User can duplicate a container (clone config into pre-filled creation form)
- [ ] **EDIT-07**: User can rename a container

### EXEC — Container Terminal

- [ ] **EXEC-01**: User can open a terminal shell (bash/sh) into a running container via xterm.js
- [ ] **EXEC-02**: Terminal supports shell selection (bash, sh, ash) and custom user
- [ ] **EXEC-03**: Terminal handles resize events and supports copy/paste

### LOGS — Enhanced Container Logs

- [ ] **LOGS-01**: User can search within container logs
- [ ] **LOGS-02**: User can download container logs as a file
- [ ] **LOGS-03**: User can toggle timestamps on/off in log view
- [ ] **LOGS-04**: User can toggle line wrap on/off in log view

### ACT — Container Actions

- [ ] **ACT-01**: User can kill a container (SIGKILL)
- [ ] **ACT-02**: User can pause and resume (unpause) a container
- [ ] **ACT-03**: User can select multiple containers and perform bulk start/stop/restart/remove

### IMG — Enhanced Image Management

- [ ] **IMG-01**: User can pull an image by name:tag with real-time progress display
- [ ] **IMG-02**: User can tag an existing image with a new name:tag
- [ ] **IMG-03**: User can view image layer history (command, size per layer)

### NET — Network CRUD

- [ ] **NET-01**: User can create a Docker network with name, driver, subnet, gateway
- [ ] **NET-02**: User can remove a network (with in-use check)
- [ ] **NET-03**: User can disconnect a container from a network

### VOL — Volume CRUD

- [ ] **VOL-01**: User can create a Docker volume with name, driver, and driver options
- [ ] **VOL-02**: User can see which containers are using a volume

### STACK — Docker Compose Stacks

- [ ] **STACK-01**: User can see a list of Docker Compose stacks with name, status, and container count
- [ ] **STACK-02**: User can deploy a new stack from a compose YAML editor
- [ ] **STACK-03**: User can edit a stack's compose YAML and redeploy
- [ ] **STACK-04**: User can start/stop an entire stack
- [ ] **STACK-05**: User can remove a stack (optionally with volumes)
- [ ] **STACK-06**: User can set stack-level environment variables

### EVENT — Docker Events

- [ ] **EVENT-01**: User can see a real-time Docker event log
- [ ] **EVENT-02**: User can filter events by type and time range

### ENGINE — Docker Engine Info

- [ ] **ENGINE-01**: User can see Docker engine info (version, OS, kernel, storage driver, CPUs, memory)

### UI — Interface Enhancements

- [ ] **UI-01**: Server Management window size increased to 1400x900 minimum
- [ ] **UI-02**: Container creation form is a full-page or large modal with tabbed sections
- [ ] **UI-03**: Container edit/recreate uses the same form pre-filled with current config
- [ ] **UI-04**: Stacks gets its own tab in Server Management
- [ ] **UI-05**: Events gets its own tab in Server Management
- [ ] **UI-06**: Engine info shown in Overview tab or dedicated section

## Out of Scope

| Feature | Reason |
|---------|--------|
| Docker Swarm/Kubernetes | Single-server only |
| Registry management | Not needed for self-hosted LivOS |
| Image build from Dockerfile | Complex, low priority |
| Image import/export | Niche use case |
| Volume browse contents | Requires file server |
| Stack from Git repo | Defer to v14.0 |
| Container GPU access | Niche hardware |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CREATE-01 | Phase 41 | Pending |
| CREATE-02 | Phase 41 | Pending |
| CREATE-03 | Phase 41 | Pending |
| CREATE-04 | Phase 41 | Pending |
| CREATE-05 | Phase 41 | Pending |
| CREATE-06 | Phase 41 | Pending |
| CREATE-07 | Phase 41 | Pending |
| CREATE-08 | Phase 41 | Pending |
| EDIT-01 | Phase 42 | Pending |
| EDIT-02 | Phase 42 | Pending |
| EDIT-03 | Phase 42 | Pending |
| EDIT-04 | Phase 42 | Pending |
| EDIT-05 | Phase 42 | Pending |
| EDIT-06 | Phase 42 | Pending |
| EDIT-07 | Phase 42 | Pending |
| EXEC-01 | Phase 43 | Pending |
| EXEC-02 | Phase 43 | Pending |
| EXEC-03 | Phase 43 | Pending |
| LOGS-01 | Phase 43 | Pending |
| LOGS-02 | Phase 43 | Pending |
| LOGS-03 | Phase 43 | Pending |
| LOGS-04 | Phase 43 | Pending |
| ACT-01 | Phase 44 | Pending |
| ACT-02 | Phase 44 | Pending |
| ACT-03 | Phase 44 | Pending |
| IMG-01 | Phase 44 | Pending |
| IMG-02 | Phase 44 | Pending |
| IMG-03 | Phase 44 | Pending |
| NET-01 | Phase 44 | Pending |
| NET-02 | Phase 44 | Pending |
| NET-03 | Phase 44 | Pending |
| VOL-01 | Phase 44 | Pending |
| VOL-02 | Phase 44 | Pending |
| STACK-01 | Phase 45 | Pending |
| STACK-02 | Phase 45 | Pending |
| STACK-03 | Phase 45 | Pending |
| STACK-04 | Phase 45 | Pending |
| STACK-05 | Phase 45 | Pending |
| STACK-06 | Phase 45 | Pending |
| EVENT-01 | Phase 46 | Pending |
| EVENT-02 | Phase 46 | Pending |
| ENGINE-01 | Phase 46 | Pending |
| UI-01 | Phase 41 | Pending |
| UI-02 | Phase 41 | Pending |
| UI-03 | Phase 42 | Pending |
| UI-04 | Phase 45 | Pending |
| UI-05 | Phase 46 | Pending |
| UI-06 | Phase 46 | Pending |

**Coverage:**
- v13.0 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
