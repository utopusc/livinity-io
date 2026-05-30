---
phase: 253-local-agents-cli-expansion
plan: 01
subsystem: infra
tags: [cli-install, npm-global, bash, local-agents, livinityd]

# Dependency graph
requires:
  - phase: 239-onboarding-cli-tools
    provides: gemini.sh npm-global install pattern (NPM_PREFIX + G15 EACCES fix + G20.1 .profile PATH marker)
provides:
  - "6 self-contained Wave A npm-global CLI install scripts under scripts/install/cli/ (codex, qwen-code, augment, github-copilot, codebuddy, qoder-cli)"
  - "Exact scoped npm package names verified against RESEARCH (no unscoped silent-fail traps)"
  - "Correct binary probes per CLI (qwen, auggie, copilot, codebuddy, qodercli)"
affects: [253-04-cli-installer-whitelist, 253-04-auth-wiring, deploy-glob]

# Tech tracking
tech-stack:
  added: ["@openai/codex", "@qwen-code/qwen-code", "@augmentcode/auggie", "@github/copilot", "@tencent-ai/codebuddy-code", "@qoder-ai/qodercli"]
  patterns: ["npm-global install to ~/.npm-global prefix (G15 EACCES fix)", "login-shell PATH persistence via .profile marker (G20.1)", "idempotent command -v short-circuit", "self-contained per-CLI script (no sibling delegate)"]

key-files:
  created:
    - scripts/install/cli/codex.sh
    - scripts/install/cli/qwen-code.sh
    - scripts/install/cli/augment.sh
    - scripts/install/cli/github-copilot.sh
    - scripts/install/cli/codebuddy.sh
    - scripts/install/cli/qoder-cli.sh
  modified: []

key-decisions:
  - "Mirrored the fuller gemini.sh structure (header comment + step line + version echo) rather than the terse RESEARCH one-liner template, for consistency with the existing cli/ scripts."
  - "Each script is fully self-contained in cli/ — no openclaw-style sibling-delegate — so the deploy glob picks each up independently and Plans 02/03/04 stay file-disjoint."

patterns-established:
  - "Wave A npm-global CLI script: set -euo pipefail → source ../_logging.sh (with inline fallback stubs) → NPM_PREFIX=~/.npm-global + PATH export → idempotency probe → npm guard → npm install -g --prefix → hash -r + reverify → .profile LivOS CLI PATH marker → version echo"

requirements-completed: [LAX-253]

# Metrics
duration: ~10min
completed: 2026-05-30
---

# Phase 253 Plan 01: Wave A npm-global Local Agents Install Scripts Summary

**Six self-contained npm-global CLI install scripts (codex, qwen-code, augment, github-copilot, codebuddy, qoder-cli) mirroring the verified gemini.sh pattern — each with its exact scoped npm package, correct binary probe, ~/.npm-global prefix (G15), and .profile PATH marker (G20.1).**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-05-30T13:29:53Z
- **Tasks:** 2
- **Files modified:** 6 (all created)

## Accomplishments
- Created 3 Wave A scripts in Task 1: codex (`@openai/codex` → `codex`), qwen-code (`@qwen-code/qwen-code@latest` → `qwen`), augment (`@augmentcode/auggie` → `auggie`).
- Created 3 Wave A scripts in Task 2: github-copilot (`@github/copilot` → `copilot`), codebuddy (`@tencent-ai/codebuddy-code` → `codebuddy`), qoder-cli (`@qoder-ai/qodercli` → `qodercli`).
- Every script uses the exact scoped package name from RESEARCH — guarding the unscoped silent-fail traps (`codex` 2012 package, `gh copilot` extension, etc.) called out in the threat register (T-253-01).
- Each script installs to user-writable `~/.npm-global` (no root, T-253-02) and persists PATH via the idempotent `.profile` LivOS CLI PATH marker.
- All 6 scripts pass `bash -n` and are chmod +x.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write codex.sh, qwen-code.sh, augment.sh** - `ab019d57` (feat)
2. **Task 2: Write github-copilot.sh, codebuddy.sh, qoder-cli.sh** - `388d7b1e` (feat)

## Files Created/Modified
- `scripts/install/cli/codex.sh` - npm-global install for `@openai/codex` (binary `codex`)
- `scripts/install/cli/qwen-code.sh` - npm-global install for `@qwen-code/qwen-code@latest` (binary `qwen`)
- `scripts/install/cli/augment.sh` - npm-global install for `@augmentcode/auggie` (binary `auggie`)
- `scripts/install/cli/github-copilot.sh` - npm-global install for `@github/copilot` (binary `copilot`, the new standalone CLI)
- `scripts/install/cli/codebuddy.sh` - npm-global install for `@tencent-ai/codebuddy-code` (binary `codebuddy`)
- `scripts/install/cli/qoder-cli.sh` - npm-global install for `@qoder-ai/qodercli` (binary `qodercli`)

## Decisions Made
- Followed the fuller `gemini.sh` style (shebang + header docblock + `step` line + final version echo) rather than the terse RESEARCH one-liner template — keeps the 6 new scripts visually consistent with the existing 5 cli/ scripts while preserving every MUST-have from the plan.
- All scripts self-contained in `cli/` with no sibling-delegate, satisfying the parallel-safe / file-disjoint constraint vs Plans 02/03/04.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. All acceptance criteria and the plan-level `verification` block (6 scripts pass `bash -n`, all 6 contain `npm install -g --prefix`, no sibling delegate references) verified GREEN.

## User Setup Required
None - no external service configuration required. (Auth wiring for the TUI-auth CLIs — github-copilot, codebuddy, qoder-cli — lands in Plan 04 per the plan's interfaces note.)

## Next Phase Readiness
- 6 Wave A scripts ready for the deploy glob and livinityd's cliInstaller.
- Plan 04 will add the whitelist gate + CLI_AUTH_COMMANDS entries (verified subcommand auth for codex/augment/qwen-code; bare-TUI for github-copilot/codebuddy/qoder-cli) and the drift-lock count updates.
- No blockers.

## Self-Check: PASSED

All 6 created scripts + SUMMARY.md verified on disk; both task commits (`ab019d57`, `388d7b1e`) verified in git log.

---
*Phase: 253-local-agents-cli-expansion*
*Completed: 2026-05-30*
