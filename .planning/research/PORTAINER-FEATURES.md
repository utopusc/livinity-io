# Portainer CE Feature Inventory

**Researched:** 2026-03-22
**Purpose:** Feature-match reference for LivOS v13.0

## 1. Containers

### List View
- Columns: Name, State, Quick Actions, Stack, Image, Created, IP Address, Published Ports, Ownership
- Filters: running, stopped, healthy, unhealthy
- Bulk select with checkbox → Start, Stop, Kill, Restart, Pause, Resume, Remove
- Quick actions inline: Logs, Inspect, Stats, Console, Attach

### Container Creation Form
**General:**
- Name, Image (with registry selector), Always pull image toggle
- Command & logging: command override, entrypoint override, working dir, user, console (interactive/tty)

**Network:**
- Published ports: host port ↔ container port / protocol (tcp/udp)
- Add multiple port mappings
- Network: bridge/host/none/custom network
- Hostname, Domain name, MAC address
- DNS servers, DNS options, Extra hosts (/etc/hosts entries)
- IPv4/IPv6 address (when using custom network)

**Volumes:**
- Bind mounts: host path → container path, read-only toggle
- Named volumes: volume name → container path, read-only toggle
- tmpfs mounts: container path, size limit

**Environment:**
- Environment variables: key-value pairs, add/remove rows
- .env file upload (bulk add)

**Labels:**
- Key-value label pairs, add/remove rows

**Restart Policy:**
- No, Always, On failure (with max retry count), Unless stopped

**Runtime & Resources:**
- Memory limit (MB), Memory reservation
- CPU limit (nanoCPUs), CPU shares
- Privileged mode toggle
- Capabilities: add/drop individual Linux capabilities
- Devices: host device → container device mapping
- Sysctls: key-value pairs
- GPU: enable GPU access, select specific GPUs

**Health Check:**
- None / CMD / CMD-SHELL
- Test command
- Interval, Timeout, Start period, Retries

**Security:**
- Read-only root filesystem
- No new privileges

### Container Detail / Edit
- **Recreate**: Edit ANY setting and recreate container (stops old, creates new with same name)
- **Duplicate**: Clone container config → pre-filled creation form
- **Stats**: Real-time CPU%, Memory, Network I/O, Block I/O line charts
- **Logs**: Tail lines, auto-scroll, timestamps toggle, search, wrap, download, copy
- **Console**: Shell selector (bash/sh/ash), user override, full xterm.js terminal
- **Inspect**: Full JSON inspect output, collapsible sections
- **Attach**: Attach to container's main process stdio

### Container Actions
- Start, Stop, Kill (SIGKILL), Restart, Pause, Resume, Remove (force option)
- Rename container

## 2. Images

### List View
- Columns: ID, Tags, Size, Created, Used (in-use indicator)
- Bulk remove selected
- Filter: used/unused

### Image Operations
- **Pull**: Image name, tag (default: latest), registry selector
- **Build**: Web editor (Dockerfile content), upload tar, URL to Dockerfile
  - Build options: name, tag, no-cache toggle
- **Import**: Upload tar archive
- **Export**: Download tar archive
- **Tag**: Add new tag to existing image
- **Remove**: Single or bulk, force option
- **Details**: Layers view (ID, size, command), history, inspect JSON

## 3. Networks

### List View
- Columns: Name, Stack, Driver, Scope, Attachable, Internal, IPV4 IPAM Subnet/Gateway, IPV6 IPAM
- Bulk remove (only unused)

### Network Creation
- Name
- Driver: bridge, overlay, macvlan, ipvlan, host, none
- Subnet, Gateway, IP Range
- Driver options (key-value)
- Labels (key-value)
- Enable IPv6 toggle
- Internal toggle (no external access)
- Attachable toggle

### Network Detail
- Configuration (driver, scope, subnet, gateway)
- Connected containers (name, IPv4, IPv6, MAC address)
- Leave network (disconnect container)

## 4. Volumes

### List View
- Columns: Name, Stack, Driver, Mount Point, Created, Used (in-use indicator)
- Bulk remove unused

### Volume Creation
- Name
- Driver: local or other drivers
- Driver options (key-value pairs)
- Labels (key-value)

### Volume Detail
- Driver, mount point, created date
- Labels
- Containers using this volume
- Browse volume contents (file browser)

## 5. Stacks (Docker Compose)

### List View
- Columns: Name, Type (Compose/Swarm), Status, Created, Control (Up/Down)

### Stack Creation
- **Web editor**: Full compose YAML editor with syntax highlighting
- **Upload**: Upload docker-compose.yml file
- **Repository**: Git URL + compose path + auto-update toggle
- **Custom template**: From saved templates
- Environment variables: key-value pairs added to compose
- Stack name

### Stack Operations
- **Deploy/Redeploy**: Apply compose changes, pull latest images toggle
- **Start/Stop**: Bring stack up or down
- **Edit**: Live compose editor with redeploy
- **Delete**: Remove stack and optionally remove volumes
- **Environment variables**: Edit stack-level env vars
- **Migrate**: Move stack between endpoints

## 6. Events
- Docker engine event log (real-time)
- Filters: container, image, volume, network, daemon events
- Time range filter
- Event details: action, actor, attributes

## 7. Host/Engine Info
- Docker version, API version
- OS, Architecture, Kernel version
- Storage driver, Logging driver
- CPUs, Total memory
- Docker root directory
- Registries, Plugins

## 8. Registries
- DockerHub (with credentials)
- Custom registry (URL + credentials)
- AWS ECR, Azure ACR, GitLab, GitHub, Quay.io
- ProGet, custom with auth

## What LivOS v12.0 Already Has vs What's Missing

### Already Built (v12.0)
- ✅ Container list (name, image, state, ports)
- ✅ Container start/stop/restart/remove
- ✅ Container inspect detail (info tab)
- ✅ Container logs (tail, auto-scroll)
- ✅ Container stats (CPU%, memory)
- ✅ Protected containers
- ✅ Image list/remove/prune
- ✅ Volume list/remove
- ✅ Network list/inspect
- ✅ PM2 management (unique to LivOS)
- ✅ System monitoring (CPU, RAM, disk, network, processes)
- ✅ Overview dashboard

### Missing (v13.0 scope)
- ❌ Container creation from image (full form)
- ❌ Container config edit + recreate
- ❌ Container duplicate
- ❌ Container exec terminal (xterm.js)
- ❌ Container rename
- ❌ Container kill/pause/resume
- ❌ Bulk container operations (multi-select)
- ❌ Image pull with progress
- ❌ Image build from Dockerfile
- ❌ Image import/export
- ❌ Image tag management
- ❌ Network creation (driver, subnet, gateway)
- ❌ Volume creation (driver, options)
- ❌ Volume browse contents
- ❌ Stack/Compose management (create, edit, deploy, stop)
- ❌ Docker events log
- ❌ Docker engine info
- ❌ Registry management
- ❌ Container logs: search, download, timestamps toggle, wrap
- ❌ Container stats: network I/O, block I/O charts over time
- ❌ Port mapping editor on existing containers
- ❌ Environment variable editor on existing containers
- ❌ Restart policy editor
- ❌ Resource limits (memory, CPU) editor
- ❌ Health check configuration
- ❌ Larger window size
