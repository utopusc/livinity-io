---
phase: 09-installer
plan: 02
subsystem: infra
tags: [bash, installer, whiptail, tui, configuration-wizard, openssl, secrets]

# Dependency graph
requires:
  - phase: 09-01
    provides: install.sh foundation with main(), ERR trap, OS/arch detection
provides:
  - Interactive configuration wizard with whiptail TUI
  - TTY detection with non-interactive fallback
  - Cryptographically secure secret generation via openssl
  - .env file creation from wizard inputs with backup support
affects: [09-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TTY detection with [[ -t 0 ]] && [[ -t 1 ]]"
    - "whiptail with text prompt fallback"
    - "openssl rand -hex for cryptographic secrets"
    - "chmod 600 for secure file permissions"

key-files:
  created: []
  modified:
    - livos/install.sh

key-decisions:
  - "wizard_* functions handle three modes: whiptail, text fallback, non-interactive defaults"
  - "HTTPS prompt only shown when domain is not localhost"
  - "Existing .env preserved in non-interactive mode, backup offered in interactive"

patterns-established:
  - "wizard_input(title, prompt, default) pattern for all user input"
  - "CONFIG_* variables for wizard-collected configuration"
  - "SECRET_* variables for generated cryptographic secrets"

# Metrics
duration: 4min
completed: 2026-02-05
---

# Phase 9 Plan 2: Interactive Configuration Wizard Summary

**Whiptail TUI configuration wizard with TTY detection, text fallback, and openssl-generated secrets for .env creation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-05T00:00:00Z
- **Completed:** 2026-02-05T00:04:00Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Added TTY detection (HAS_TTY) and whiptail availability check (HAS_WHIPTAIL)
- Created 4 wizard helper functions: wizard_input, wizard_password, wizard_yesno, wizard_msgbox
- Implemented run_configuration_wizard() collecting domain, HTTPS, Gemini API key, WhatsApp toggle
- Added generate_secrets() using openssl rand -hex for JWT, API key, and Redis password
- Added write_env_file() that creates .env with wizard inputs and generated secrets

## Task Commits

Each task was committed atomically:

1. **Task 1: Add TTY detection and wizard helper functions** - `c5ea878` (feat)
2. **Task 2: Implement configuration wizard flow** - `2dcff07` (feat)
3. **Task 3: Add secret generation and .env file creation** - `d86e3ac` (feat)

## Files Created/Modified
- `livos/install.sh` - Extended from 236 to 495 lines with wizard functions, configuration flow, secret generation, and .env creation

## Decisions Made
- **Three-tier wizard functions:** Each wizard_* function supports whiptail TUI (best), text prompts (fallback), and non-interactive defaults (for curl|bash automation)
- **Conditional HTTPS prompt:** Only ask about HTTPS when CONFIG_DOMAIN is not localhost (localhost never needs HTTPS)
- **Preserve existing .env:** In non-interactive mode, always preserve existing .env; in interactive mode, offer backup before overwrite
- **256-bit secrets:** Using openssl rand -hex 32 for JWT and API key (64 hex chars = 256 bits)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Configuration wizard ready for plan 09-03 (repository clone, build, service start)
- CONFIG_* variables available for write_env_file()
- SECRET_* variables generated for secure .env population
- write_env_file() ready to be called after LIVOS_DIR exists

---
*Phase: 09-installer*
*Completed: 2026-02-05*
