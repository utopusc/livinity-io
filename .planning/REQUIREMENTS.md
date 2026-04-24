# Requirements: Livinity v27.0 — Docker Management Upgrade

**Defined:** 2026-04-24
**Core Value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.

## v27.0 Requirements

### Quick Wins (QW) — Phase 17

- [x] **QW-01**: Container logs stream in real time via WebSocket with ANSI color support (replaces 5s snapshot polling)
- [x] **QW-02**: Stack secrets flagged `secret: true` in UI are injected as shell env vars at `docker compose up`, never written to `.env` disk
- [x] **QW-03**: Stack detail UI has a "Redeploy (pull latest)" action that runs `docker compose pull` + `docker compose up -d`
- [x] **QW-04**: AI `docker_manage` tool supports stack operations (deploy, control, remove), image pull, and container create beyond the current start/stop/restart/inspect/logs

### Container File Browser (CFB) — Phase 18

- [x] **CFB-01**: User can browse a container's filesystem (list directories, navigate with breadcrumbs) via Docker exec + `ls` over dockerode
- [x] **CFB-02**: User can download a file from a container to their browser using `container.getArchive({path})` (tar stream)
- [x] **CFB-03**: User can upload a file to a container using `container.putArchive(tarStream, {path})`
- [x] **CFB-04**: User can edit small text files (< 1MB) inline in the browser and save back to the container
- [x] **CFB-05**: User can delete files and directories from the container

### Compose Graph & Vulnerability Scanning (CGV) — Phase 19

- [x] **CGV-01**: Stack detail panel has a "View Graph" tab that renders services with React Flow, showing `depends_on`, `networks`, and port mappings
- [x] **CGV-02**: Image list has a "Scan" action that runs Trivy inside a Docker container and shows CVE severity badges (CRITICAL/HIGH/MEDIUM/LOW)
- [x] **CGV-03**: Scan results cached in Redis keyed by image SHA256 (tags are mutable; SHA256 is not)
- [x] **CGV-04**: Vulnerability scan on-demand (not automatic) — user clicks Scan button per image

### Scheduled Tasks & Backup (SCH) — Phase 20

- [x] **SCH-01**: Scheduler module uses node-cron with persistent job definitions in PostgreSQL
- [x] **SCH-02**: Built-in scheduled tasks: image prune (weekly), container update check (daily), git stack sync (hourly)
- [ ] **SCH-03**: Container/volume backup scheduler with destinations: S3-compatible, SFTP, local filesystem
- [ ] **SCH-04**: Backups of volumes use ephemeral `alpine tar czf - /data` helper container piped to destination
- [ ] **SCH-05**: Settings UI has a Scheduler section for enabling/disabling tasks and configuring destinations

### GitOps Stack Deployment (GIT) — Phase 21

- [ ] **GIT-01**: Stack schema extended with `git_url`, `git_branch`, `git_credential_id` (encrypted at rest using JWT_SECRET as AES-256 key)
- [ ] **GIT-02**: `deployStack` with git URL clones with `--filter=blob:none` (blobless), copies compose to stacks dir, deploys
- [ ] **GIT-03**: Webhook endpoint `POST /api/webhooks/git/:stackName` verifies HMAC signature and triggers redeploy
- [ ] **GIT-04**: Stack UI has "Deploy from Git" tab alongside "Deploy from YAML"
- [ ] **GIT-05**: Configured git stacks auto-sync on scheduled interval (from Phase 20 scheduler)

### Multi-Host Docker Management (MH) — Phase 22

- [ ] **MH-01**: `environments` PostgreSQL table (id, name, socket_path | tcp_host+tls_cert | agent_id) per Docker host
- [ ] **MH-02**: All `docker.*` tRPC routes accept optional `environmentId`; Dockerode client is factory-created per environment
- [ ] **MH-03**: Server Control header has an environment selector dropdown
- [ ] **MH-04**: Outbound agent (Node or Go) opens a WebSocket to Livinity from remote host and proxies Docker API calls — no open TCP port on remote host required
- [ ] **MH-05**: Agent authentication via per-agent token; tokens revocable from Settings

### AI-Powered Docker Diagnostics (AID) — Phase 23

- [ ] **AID-01**: AI can analyze container logs using Kimi and surface plain-English diagnostics ("postgres is OOM-killing — increase memory limit")
- [ ] **AID-02**: AI proactively flags containers approaching resource limits (OOM risk, disk full) using docker stats + engine info
- [ ] **AID-03**: AI can generate compose files from natural language prompts ("Nextcloud with Redis and MariaDB on port 8080")
- [ ] **AID-04**: AI explains vulnerability scan results contextually ("CVE-2024-XXXX in nginx:1.24 — upgrade to nginx:1.27")
- [ ] **AID-05**: Diagnostics surface as chat messages in AI Chat sidebar when user asks "why is my X container slow/failing"

## v28.0 Requirements (Deferred)

### Kubernetes / Swarm

- **K8S-01**: Kubernetes cluster management (kubeconfig upload, pod/deployment views)
- **SW-01**: Docker Swarm service management

### Advanced Docker

- **ADV-01**: Docker Desktop integration (local dev mount)
- **ADV-02**: BuildKit integration for remote builds
- **ADV-03**: Registry management with auth config (v27.0 has pull only, v28.0 adds registry CRUD)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Kubernetes cluster management | Different primitives — deferred to v28.0 |
| Docker Swarm services | Declining adoption, not home-server priority |
| Windows containers | Linux-only home server focus |
| Docker Desktop GUI replacement | Livinity is self-hosted, not developer desktop |
| Cloud container orchestration (ACI/ECS/GKE) | Self-hosting philosophy — managed cloud is orthogonal |
| Registry hosting (replace Harbor) | Out of scope — users run their own registry |
| Per-image license/compliance scanning beyond Trivy CVEs | v27.0 focuses on CVEs; SBOMs deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| QW-01 | Phase 17 | Complete |
| QW-02 | Phase 17 | Complete |
| QW-03 | Phase 17 | Complete |
| QW-04 | Phase 17 | Complete |
| CFB-01 | Phase 18 | Complete |
| CFB-02 | Phase 18 | Complete |
| CFB-03 | Phase 18 | Complete |
| CFB-04 | Phase 18 | Complete |
| CFB-05 | Phase 18 | Complete |
| CGV-01 | Phase 19 | Complete |
| CGV-02 | Phase 19 | Complete |
| CGV-03 | Phase 19 | Complete |
| CGV-04 | Phase 19 | Complete |
| SCH-01 | Phase 20 | Complete |
| SCH-02 | Phase 20 | Complete |
| SCH-03 | Phase 20 | Pending |
| SCH-04 | Phase 20 | Pending |
| SCH-05 | Phase 20 | Pending |
| GIT-01 | Phase 21 | Pending |
| GIT-02 | Phase 21 | Pending |
| GIT-03 | Phase 21 | Pending |
| GIT-04 | Phase 21 | Pending |
| GIT-05 | Phase 21 | Pending |
| MH-01 | Phase 22 | Pending |
| MH-02 | Phase 22 | Pending |
| MH-03 | Phase 22 | Pending |
| MH-04 | Phase 22 | Pending |
| MH-05 | Phase 22 | Pending |
| AID-01 | Phase 23 | Pending |
| AID-02 | Phase 23 | Pending |
| AID-03 | Phase 23 | Pending |
| AID-04 | Phase 23 | Pending |
| AID-05 | Phase 23 | Pending |

**Coverage:**
- v27.0 requirements: 33 total
- Mapped to phases: 33 (100%)
- Unmapped: 0

**Phase Distribution:**
- Phase 17 (Docker Quick Wins): 4 requirements
- Phase 18 (Container File Browser): 5 requirements
- Phase 19 (Compose Graph + Vuln Scan): 4 requirements
- Phase 20 (Scheduled Tasks + Backup): 5 requirements
- Phase 21 (GitOps Stack Deploy): 5 requirements
- Phase 22 (Multi-host Docker): 5 requirements
- Phase 23 (AI-Powered Diagnostics): 5 requirements

---
*Requirements defined: 2026-04-24*
*Roadmap mapped: 2026-04-24*
