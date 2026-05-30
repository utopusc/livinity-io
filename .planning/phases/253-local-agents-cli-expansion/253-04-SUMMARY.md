---
phase: 253-local-agents-cli-expansion
plan: 04
subsystem: cli-installer
tags: [drift-lock, cli-installer, whitelist, auth, detector, panel, shell-bridge, vitest]

# Dependency graph
requires:
  - phase: 253-local-agents-cli-expansion
    provides: "15 install scripts under scripts/install/cli/ (Plans 01 npm-global, 02 curl-installer, 03 install-only) — the .sh basenames whose names this plan registers"
  - phase: 239-onboarding-cli-tools
    provides: "the 5-name SUPPORTED_CLIS contract + CLI_BIN_NAMES/CLI_VERSION_ARGS/CLI_AUTH_COMMANDS drift-lock shape"
provides:
  - "SUPPORTED_CLIS tuple expanded 5 -> 20 (RCE whitelist now admits all 15 Local Agents CLIs; rejects any non-listed name before spawn)"
  - "CliName union of 20 literals; the cli-installer module + whole livinityd package type-check clean"
  - "CLI_AUTH_COMMANDS with 20 keys (9 auth-capable new CLIs + 6 Wave C null/authHidden)"
  - "CLI_BIN_NAMES + CLI_VERSION_ARGS entries for every new CLI with the verified binary (cursor-agent->cursor-agent, BLOCKER 1)"
  - "panel patch JS lists 20 CLIs with CLI_META (6 Wave C authHidden:true)"
  - "shell-bridge use-cli-auth-bridge whitelists only the 9 auth-capable new CLIs"
  - "drift-lock vitest green at 20 CLIs (array-equality order-locked + counts + per-CLI bin asserts)"
affects: [253-05-deploy, 253-06-operator-walk]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Six-file drift-lock: SUPPORTED_CLIS tuple is the single ordering source; types union, auth map, bin/version maps, panel array, and the 3 vitest assertions all mirror the SAME canonical order"
    - "cursor-agent four-map binary identity (install == CLI_BIN_NAMES == auth bin == detector.test.ts) to prevent the G13d detect-after-install false-negative (BLOCKER 1)"

key-files:
  created:
    - .planning/phases/253-local-agents-cli-expansion/253-04-SUMMARY.md
  modified:
    - livos/packages/livinityd/source/modules/cli-installer/types.ts
    - livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts
    - livos/packages/livinityd/source/modules/cli-installer/detector.ts
    - livos/packages/livinityd/source/modules/cli-installer/auth.ts
    - scripts/aionui-patches/local-agents-install-section.js
    - livos/packages/ui/src/hooks/use-cli-auth-bridge.ts
    - livos/packages/livinityd/source/modules/cli-installer/__tests__/installer.test.ts
    - livos/packages/livinityd/source/modules/cli-installer/__tests__/auth.test.ts
    - livos/packages/livinityd/source/modules/cli-installer/__tests__/detector.test.ts

key-decisions:
  - "detector.ts + auth.ts PATH arrays needed NO new dir: snow-cli symlinks into ~/.local/bin (already covered) per 253-03 SUMMARY; Wave A lands in ~/.npm-global/bin, Wave B/C in ~/.local/bin — all already in the probe PATH"
  - "github-copilot/codebuddy/qoder-cli are bare-TUI auth ([] args) — operator types /login inside the TUI; this is the verified RESEARCH disposition, not a missing subcommand"
  - "Added an explicit auth.test.ts Test 15 asserting the 6 Wave C null entries + the cursor-agent auth-bin pin, so the BLOCKER 1 / authHidden contract is independently enforced (not only implied by keys===tuple)"

patterns-established:
  - "When expanding a drift-locked enum, edit the tuple FIRST, then mirror its exact order into every dependent map + test array; toEqual array-equality (not count-only) catches order drift"

requirements-completed: [LAX-253]

# Metrics
duration: ~25min
completed: 2026-05-30
---

# Phase 253 Plan 04: Drift-Lock Registration of 15 Local Agents CLIs Summary

**Registered all 15 new Local Agents CLIs across the 6 drift-locked cli-installer files (SUPPORTED_CLIS whitelist, CliName union, CLI_AUTH_COMMANDS, CLI_BIN_NAMES/CLI_VERSION_ARGS, panel patch JS, shell-bridge) and updated the 3 vitest drift-lock suites — the cli-installer suite is green at 20 CLIs with the cursor-agent binary pinned across all four maps (BLOCKER 1) and the installer.test name array order-locked to the tuple (BLOCKER 2).**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-05-30
- **Tasks:** 3
- **Files modified:** 9 (6 source/patch + 3 tests; SUMMARY created)

## Accomplishments

- **Task 1 (`f2704a86`) — livinityd source maps:** `types.ts` CliName union 5 -> 20 literals (canonical Wave A/B/C order); `install-scripts.ts` SUPPORTED_CLIS tuple, CLI_BIN_NAMES (verified binaries incl. cursor-agent->`cursor-agent`, qwen-code->`qwen`, augment->`auggie`, qoder-cli->`qodercli`, factory-droid->`droid`), and CLI_VERSION_ARGS all at 20; doc-comments 5 -> 20. `detector.ts` doc-comment 5 -> 20 (PATH array unchanged — already covers all new install dirs). livinityd `tsc --noEmit` = 0 errors.
- **Task 2 (`71053410`) — auth + panel + bridge:** `auth.ts` CLI_AUTH_COMMANDS 5 -> 20 keys (9 auth-capable new CLIs with verified subcommands + 6 Wave C `null`); cursor-agent auth bin pinned `cursor-agent` (BLOCKER 1). Panel `local-agents-install-section.js` SUPPORTED_CLIS + CLI_META at 20 with the 6 Wave C `authHidden:true`; hint text 5 -> 20; patch JS parses (node `new Function` smoke). `use-cli-auth-bridge.ts` adds ONLY the 9 auth-capable new CLIs (authHidden ones omitted = no Auth button).
- **Task 3 (`40cf6049`) — drift-lock vitest:** `installer.test.ts` name array rewritten to all 20 ids in tuple order (BLOCKER 2 — array-equality, not a count bump) + size 5 -> 20; `auth.test.ts` keys.length 5 -> 20 + new Test 15 asserting the 6 Wave C `null` and the cursor-agent auth-bin tuple; `detector.test.ts` per-CLI bin assert for all 15 new CLIs incl. `CLI_BIN_NAMES['cursor-agent'] === 'cursor-agent'` (BLOCKER 1 cross-ref). Full cli-installer suite: **27 tests passed (installer 8, detector 4, auth 15)**.

## Task Commits

1. **Task 1: Register 15 names in 3 livinityd source maps** — `f2704a86` (feat)
2. **Task 2: Wire auth + panel + shell-bridge** — `71053410` (feat)
3. **Task 3: Drift-lock the vitest at 20 CLIs** — `40cf6049` (test)

## Files Created/Modified

- `livos/packages/livinityd/source/modules/cli-installer/types.ts` — CliName union 20 literals
- `livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts` — SUPPORTED_CLIS tuple + CLI_BIN_NAMES + CLI_VERSION_ARGS at 20
- `livos/packages/livinityd/source/modules/cli-installer/detector.ts` — doc-comment 5 -> 20 (PATH unchanged)
- `livos/packages/livinityd/source/modules/cli-installer/auth.ts` — CLI_AUTH_COMMANDS 20 keys (9 auth-capable + 6 null)
- `scripts/aionui-patches/local-agents-install-section.js` — SUPPORTED_CLIS + CLI_META 20; 6 Wave C authHidden; hint -> 20
- `livos/packages/ui/src/hooks/use-cli-auth-bridge.ts` — 9 auth-capable new CLIs added; 6 authHidden omitted
- `livos/packages/livinityd/source/modules/cli-installer/__tests__/installer.test.ts` — 20-id name array (order-locked) + size 20
- `livos/packages/livinityd/source/modules/cli-installer/__tests__/auth.test.ts` — keys.length 20 + Test 15
- `livos/packages/livinityd/source/modules/cli-installer/__tests__/detector.test.ts` — 15 new per-CLI bin asserts incl. cursor-agent pin

## Decisions Made

- **No PATH-array edits in detector.ts/auth.ts.** Plan 03's SUMMARY confirmed snow-cli symlinks its linked bin into `~/.local/bin` (already in the probe PATH); Wave A installs to `~/.npm-global/bin`, Wave B/C to `~/.local/bin` — all already present. Adding dirs would be dead config.
- **Bare-TUI auth for github-copilot/codebuddy/qoder-cli** (`[]` args) is intentional per RESEARCH — the operator types `/login` inside the TUI. Spawning the bare binary opens that TUI.
- **Added auth.test.ts Test 15** to independently lock the 6 Wave C `null` entries + the cursor-agent auth-bin tuple, rather than relying solely on the keys===tuple equality (which would pass even if a Wave C entry were mistakenly non-null, since `null` still counts as a key).

## Deviations from Plan

None - plan executed exactly as written. (The plan flagged the snow-cli PATH-dir addition as conditional "ONLY if linked outside the covered set"; Plan 03's SUMMARY confirmed it links into the covered `~/.local/bin`, so the condition was not met and no PATH edit was made — this is the documented conditional, not a deviation.)

## Issues Encountered

- The package's default `test` script runs vitest in watch mode; `npx vitest` resolved a different (newer) vitest that rejects `--poolOptions`. Resolved by running the package's own `test:run` script via `pnpm --filter livinityd test:run source/modules/cli-installer` (relative path from the package cwd), which uses the workspace-pinned vitest 2.1.9. No code impact.

## User Setup Required

None - no external service configuration required. The registered names take effect on the next `update.sh` / fresh install (Plan 05 deploy + glob verify) and the operator browser walk (Plan 06).

## Next Phase Readiness

- All 15 CLIs are now whitelisted, typed, auth-mapped, detector-probed, panel-listed, and bridge-whitelisted — the Plan 01-03 install scripts are no longer inert.
- Plan 05 deploys + verifies the deploy glob picks up the 15 new `.sh` files and the panel patch ships.
- No blockers.

## Self-Check: PASSED

- FOUND: .planning/phases/253-local-agents-cli-expansion/253-04-SUMMARY.md
- FOUND commit: f2704a86 (Task 1)
- FOUND commit: 71053410 (Task 2)
- FOUND commit: 40cf6049 (Task 3)
- cli-installer vitest: 27/27 GREEN (3 files); livinityd tsc: 0 errors; patch JS parses

---
*Phase: 253-local-agents-cli-expansion*
*Completed: 2026-05-30*
