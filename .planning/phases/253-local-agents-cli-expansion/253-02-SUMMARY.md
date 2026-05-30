---
phase: 253-local-agents-cli-expansion
plan: 02
subsystem: infra
tags: [bash, cli-installer, curl, goose, factory-droid, cursor-agent, install-scripts]

# Dependency graph
requires:
  - phase: 239-onboarding-cli-tools
    provides: cli installer script pattern (claude-code.sh / opencode.sh), _logging.sh helper, .profile LivOS CLI PATH marker (G20.1)
provides:
  - "scripts/install/cli/goose.sh — Block Goose curl-installer (binary goose, CONFIGURE=false skips wizard)"
  - "scripts/install/cli/factory-droid.sh — Factory droid curl-installer (binary droid)"
  - "scripts/install/cli/cursor-agent.sh — Cursor agent curl-installer, canonical binary pinned to cursor-agent (BLOCKER 1)"
affects: [253-04-cli-detector, 253-cli-auth-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave B curl-installer: ~/.local/bin prepended to PATH BEFORE idempotency probe (G14), fail 75 on installer error, hash -r + reverify, .profile marker (G20.1)"
    - "cursor-agent canonical binary pinning: probe + post-install assert on cursor-agent, never bare agent symlink (BLOCKER 1 / T-253-04)"

key-files:
  created:
    - scripts/install/cli/goose.sh
    - scripts/install/cli/factory-droid.sh
    - scripts/install/cli/cursor-agent.sh
  modified: []

key-decisions:
  - "Mirrored claude-code.sh/opencode.sh curl-installer structure (not the npm-global Wave A structure) since all 3 Wave B CLIs ship binary installers landing in ~/.local/bin"
  - "cursor-agent.sh header comment documents the four-map binary identity (install == CLI_BIN_NAMES == detector.test.ts == auth) so Plan 04 edits stay aligned"

patterns-established:
  - "Wave B curl-installer: official HTTPS installer | bash with ~/.local/bin on PATH up-front, fail-closed (75) on installer error"
  - "Dual-symlink binary disambiguation: pin + probe + assert the canonical name, never the collision-prone bare alias"

requirements-completed: [LAX-253]

# Metrics
duration: 9min
completed: 2026-05-30
---

# Phase 253 Plan 02: Wave B curl-installer scripts Summary

**Three self-contained Wave B Local Agents install scripts (goose, factory-droid, cursor-agent) using official curl-installers into ~/.local/bin, fail-closed on installer error, with cursor-agent's canonical binary pinned to `cursor-agent` (not the bare `agent` symlink) — BLOCKER 1 resolved.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-30
- **Completed:** 2026-05-30
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- `goose.sh` — Block Goose standalone Rust binary via `download_cli.sh`, with `CONFIGURE=false` on the bash invocation so the provider wizard never blocks install.
- `factory-droid.sh` — Factory droid via `app.factory.ai/cli`, binary `droid` into `~/.local/bin`.
- `cursor-agent.sh` — Cursor agent via `cursor.com/install`; canonical binary pinned to `cursor-agent` at the idempotency probe AND the post-install assertion, never the dual-symlink bare `agent` (BLOCKER 1 / threat T-253-04). Header comment cross-references the Plan 04 detector binary identity.
- All three: `~/.local/bin` prepended to PATH BEFORE the idempotency probe (G14), `fail ... 75` non-zero on installer error (never silent exit 0, covers RESEARCH A6 cursor 403), `hash -r` + reverify, and the idempotent `.profile` `LivOS CLI PATH` marker (G20.1).

## Task Commits

1. **Task 1: Write goose.sh and factory-droid.sh** — `87f7b141` (feat)
2. **Task 2: Write cursor-agent.sh — pin canonical binary cursor-agent (BLOCKER 1)** — `36cb4c2f` (feat)

## Files Created/Modified
- `scripts/install/cli/goose.sh` - Block Goose curl-installer; `download_cli.sh` + `CONFIGURE=false bash`, binary `goose`.
- `scripts/install/cli/factory-droid.sh` - Factory droid curl-installer; `app.factory.ai/cli | sh`, binary `droid`.
- `scripts/install/cli/cursor-agent.sh` - Cursor agent curl-installer; `cursor.com/install | bash`, canonical binary `cursor-agent` pinned + asserted on PATH.

## Decisions Made
- Used the curl-installer structure from `claude-code.sh`/`opencode.sh` (PATH-prepend → idempotency probe → official installer → reverify → `.profile` marker), not the npm-global Wave A structure, because all three CLIs ship official binary installers landing in `~/.local/bin`.
- For cursor-agent's installer dual symlink, pinned and asserted only on `cursor-agent`; the bare `command -v agent` probe is deliberately absent (verified: 0 occurrences) to avoid the `agent` name collision.
- Added a four-map binary-identity header comment in `cursor-agent.sh` (install == `CLI_BIN_NAMES['cursor-agent']` == `detector.test.ts` probe == auth binary) so a future executor editing Plan 04 keeps the names aligned (prevents G13d detect-after-install false-negative).

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. `scripts/install/cli/_logging.sh` referenced in the plan's read_first does not exist at that path (the helper lives at `scripts/install/_logging.sh`, sourced via `../_logging.sh`); the scripts already source it correctly via `${SCRIPT_DIR}/../_logging.sh` with the inline-fallback block, matching every sibling script. No change needed.

## User Setup Required
None - no external service configuration required. (Auth subcommands `goose configure` / `droid login` / `cursor-agent login` are wired in Plan 04, not here.)

## Next Phase Readiness
- All 3 Wave B install scripts ready for Plan 04 detector wiring. The cursor-agent binary identity is documented for the Plan 04 `CLI_BIN_NAMES` map and detector test.
- File-disjoint from Plans 01/03/04 — parallel-safe, no merge conflicts expected.

## Self-Check: PASSED

- FOUND: scripts/install/cli/goose.sh
- FOUND: scripts/install/cli/factory-droid.sh
- FOUND: scripts/install/cli/cursor-agent.sh
- FOUND commit: 87f7b141 (Task 1)
- FOUND commit: 36cb4c2f (Task 2)
- bash -n: all 3 clean
- cursor-agent.sh: 'command -v agent' standalone probe absent (0 occurrences); 'command -v cursor-agent' present

---
*Phase: 253-local-agents-cli-expansion*
*Completed: 2026-05-30*
