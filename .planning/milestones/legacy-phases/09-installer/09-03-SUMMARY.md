---
phase: 09-installer
plan: 03
subsystem: infra
tags: [bash, installer, systemd, redis, service-management, ufw, curl-pipe-bash]

# Dependency graph
requires:
  - phase: 09-02
    provides: Configuration wizard with TTY detection, whiptail TUI, secret generation, .env creation
provides:
  - Complete one-command installer with systemd service management
  - Repository setup and build automation (pnpm, npm, Python venv)
  - Redis configuration with password and AOF persistence
  - 4 systemd service units with security hardening
  - UFW firewall configuration
  - Final banner with access URL and service commands
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "systemd service units with ProtectSystem=strict"
    - "chown -R livos:livos for service user ownership"
    - "symlink .env for nested package access"
    - "UFW firewall with deny incoming default"

key-files:
  created: []
  modified:
    - livos/install.sh

key-decisions:
  - "4 separate systemd services for independent lifecycle management"
  - "Security hardening: NoNewPrivileges, PrivateTmp, ProtectSystem, ReadWritePaths"
  - "Redis password from generated secrets, AOF persistence enabled"
  - "UFW allows only SSH (22) and LivOS (8080)"
  - "Symlink .env from livos root to packages/liv for shared config"

patterns-established:
  - "systemd unit pattern: User=livos, EnvironmentFile=/opt/livos/.env"
  - "Service dependencies: liv-memory first, then livos, liv-core, liv-worker"
  - "configure_X() pattern for infrastructure setup functions"
  - "show_banner() pattern for installation completion messaging"

# Metrics
duration: 4min
completed: 2026-02-05
---

# Phase 9 Plan 3: Systemd Services and Complete Install Flow Summary

**Complete 823-line installer with 4 systemd services, Redis password/AOF config, UFW firewall, and show_banner() with server IP and service commands**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-05T00:00:00Z
- **Completed:** 2026-02-05T00:04:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Added setup_repository() for git clone/pull from GitHub
- Added build_project() for pnpm/npm install, Python venv setup, TypeScript builds
- Added configure_redis() setting password and enabling AOF persistence
- Created 4 systemd service units with security hardening (NoNewPrivileges, PrivateTmp, ProtectSystem)
- Added configure_firewall() for UFW setup (SSH + port 8080)
- Added show_banner() displaying server IP, domain, and systemctl commands
- Completed main() orchestration flow from pre-flight to final banner

## Task Commits

Each task was committed atomically:

1. **Tasks 1-3: Complete systemd services, Redis config, install flow** - `0113e69` (feat)

## Files Created/Modified
- `livos/install.sh` - Extended from 495 to 823 lines with repository setup, build automation, Redis config, 4 systemd services, firewall setup, and completion banner

## Decisions Made
- **4 separate systemd services:** livos.service, liv-core.service, liv-memory.service, liv-worker.service for independent lifecycle and restart management
- **Security hardening:** All services use NoNewPrivileges=true, PrivateTmp=true, ProtectSystem=strict with explicit ReadWritePaths
- **Service startup order:** liv-memory first (no dependencies), then livos, liv-core, liv-worker (dependency chain)
- **UFW default deny:** Only SSH (22) and LivOS UI (8080) allowed incoming
- **Symlink .env:** packages/liv/.env symlinks to ../../.env for shared configuration access

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Complete one-command installer ready for `curl -sSL ... | sudo bash`
- Installs all dependencies, configures Redis, creates systemd services, starts all components
- Phase 9 (Installer) complete
- Ready for Phase 10 (Final polish/testing) or production deployment

---
*Phase: 09-installer*
*Completed: 2026-02-05*
