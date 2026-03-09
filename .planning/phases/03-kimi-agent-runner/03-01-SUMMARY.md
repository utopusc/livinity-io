---
phase: 03-kimi-agent-runner
plan: 01
subsystem: infra
tags: [python, uv, kimi-cli, server-setup, bash, pm2]

# Dependency graph
requires:
  - phase: 02-configuration-layer
    provides: Kimi API key storage and settings UI
provides:
  - Python 3.12+ runtime on production server
  - uv package manager on production server
  - Kimi CLI (kimi-code) installed and on PATH
  - PM2-accessible PATH configuration for nexus-core
  - Idempotent install script at nexus/scripts/install-kimi.sh
affects: [03-kimi-agent-runner plan 02, 04-onboarding-cleanup]

# Tech tracking
tech-stack:
  added: [python3.12, uv, kimi-code]
  patterns: [idempotent-server-scripts, deploy-script-pattern]

key-files:
  created: [nexus/scripts/install-kimi.sh]
  modified: []

key-decisions:
  - "Deploy script approach instead of live SSH -- enables repeatable server setup"
  - "uv tool install kimi-code as primary method, official installer as fallback"
  - "PATH additions to both .profile and .bashrc for PM2 and interactive shell coverage"
  - "Idempotent design -- script can be re-run safely without side effects"

patterns-established:
  - "Deploy script pattern: server setup scripts in nexus/scripts/ with built-in verification"
  - "Idempotent install: check-before-install for all components"

# Metrics
duration: 2min
completed: 2026-03-09
---

# Phase 3 Plan 1: Server Setup (Python 3.12, uv, Kimi CLI) Summary

**Idempotent install script for Python 3.12, uv package manager, and Kimi CLI on production server with PM2 PATH integration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T08:55:23Z
- **Completed:** 2026-03-09T08:56:48Z
- **Tasks:** 1 (auto) + 1 (checkpoint, deferred)
- **Files created:** 1

## Accomplishments
- Created comprehensive install script (`nexus/scripts/install-kimi.sh`) covering all 6 steps from the plan
- Python 3.12 installation with deadsnakes PPA fallback for older Ubuntu releases
- uv package manager installation via official Astral installer
- Kimi CLI installation via `uv tool install kimi-code` with official installer fallback
- PATH configuration for both /root/.profile (PM2) and /root/.bashrc (interactive)
- Built-in verification checks with colored pass/fail output
- PM2 nexus-core restart integrated into the script

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Python 3.12, uv, and Kimi CLI on production server** - `2006c00` (feat)

**Plan metadata:** (see below)

## Files Created/Modified
- `nexus/scripts/install-kimi.sh` - Idempotent server setup script: installs Python 3.12, uv, Kimi CLI, configures PATH for PM2, runs verification

## Decisions Made
- **Deploy script instead of live SSH:** Since SSH is not available from the development environment, created a self-contained install script that can be SCP'd to the server and run manually. This is actually better than live SSH because it's repeatable and version-controlled.
- **uv tool install as primary method:** `uv tool install kimi-code` is the recommended approach from Kimi docs; official curl installer is fallback.
- **Dual PATH configuration:** Added PATH to both `.profile` (sourced by PM2 startup scripts) and `.bashrc` (interactive shells) to ensure `kimi` is accessible in all contexts.
- **Idempotent design:** Every step checks if the tool is already installed before attempting installation, making the script safe to re-run.

## Deviations from Plan

None - plan executed as written. The plan itself specified SSH commands, but the user directed creation of a deploy script instead (which follows the same steps).

## Issues Encountered
- Cannot SSH from development environment (Windows) -- resolved by creating deploy script approach per user instruction.

## User Setup Required

**The install script must be run on the production server.** To deploy:

1. Push changes to git: `git push`
2. SSH into server4: `ssh root@45.137.194.103`
3. Pull latest: `cd /opt/nexus/app && git pull`
4. Run the script: `bash scripts/install-kimi.sh`
5. Verify output shows all checks passing

## Next Phase Readiness
- Script is ready to execute on server4 (45.137.194.103)
- After running, `kimi --version` will be available to nexus-core PM2 process
- Plan 03-02 (KimiAgentRunner implementation) can proceed once server setup is verified
- No blockers for Plan 02 code-side work (KimiAgentRunner TypeScript code doesn't depend on kimi being installed locally)

---
*Phase: 03-kimi-agent-runner*
*Completed: 2026-03-09*
