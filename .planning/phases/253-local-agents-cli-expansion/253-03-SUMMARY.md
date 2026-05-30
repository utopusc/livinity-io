---
phase: 253-local-agents-cli-expansion
plan: 03
subsystem: infra
tags: [cli, install-scripts, bash, python, uv, pip, git-build, authHidden, wave-c]

# Dependency graph
requires:
  - phase: 239-onboarding-cli-tools
    provides: cli install-script skeleton (_logging.sh, .profile LivOS CLI PATH marker, G14/G20.1 PATH lessons)
provides:
  - "6 Wave C install-only/authHidden CLI install scripts under scripts/install/cli/"
  - "kimi-cli.sh, mistral-vibe.sh, hermes-agent.sh — official uv-bootstrapping Python installers"
  - "nanobot.sh — pip --user nanobot-ai (MCP host, no auth)"
  - "snow-cli.sh — git-clone build MayDay-wpf/snow-cli with npm link + ~/.local/bin symlink"
  - "kiro.sh — fail-closed unverified-installer guard (no guessed package), API-key headless note"
affects: [253-04-wiring, detector.ts, auth.ts, use-cli-auth-bridge.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern 3 (Python/uv): thin curl|bash wrapper at official installer, prepend ~/.local/bin + ~/.cargo/bin, no npm template"
    - "FAIL-CLOSED (WARNING 1): every install-source failure exits non-zero via fail '<msg>' 75"
    - "Unverified-installer fail-closed: refuse to guess a package name; explicit non-zero fail instead"

key-files:
  created:
    - scripts/install/cli/kimi-cli.sh
    - scripts/install/cli/mistral-vibe.sh
    - scripts/install/cli/hermes-agent.sh
    - scripts/install/cli/nanobot.sh
    - scripts/install/cli/snow-cli.sh
    - scripts/install/cli/kiro.sh
  modified: []

key-decisions:
  - "Python CLIs (kimi/mistral/hermes) use their official uv-bootstrapping installers — NOT the npm template (Pitfall 5)"
  - "kiro ships fail-closed: no verifiable installer exists, so it exits non-zero with the unverified message rather than guessing a package name (T-253-07)"
  - "snow-cli symlinks its npm-link bin into ~/.local/bin (detector/auth-covered) and prints the resolved path so Plan 04 can confirm PATH coverage (T-253-06)"

patterns-established:
  - "Wave C Python/uv: prepend both ~/.local/bin (uv shim) AND ~/.cargo/bin (uv itself) before the idempotency probe"
  - "build-from-source CLI: guard EACH step (git clone / npm install / npm run link) with || fail ... 75"

requirements-completed: [LAX-253]

# Metrics
duration: 18min
completed: 2026-05-30
---

# Phase 253 Plan 03: Wave C Install-Only CLI Scripts Summary

**Six self-contained, FAIL-CLOSED Wave C (install-only / authHidden) CLI install scripts: three Python/uv official-installer wrappers (kimi, mistral-vibe, hermes), a pip MCP-host (nanobot), a git-clone build (snow-cli), and a fail-closed unverified-installer guard (kiro).**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-05-30
- **Completed:** 2026-05-30
- **Tasks:** 2
- **Files modified:** 6 created

## Accomplishments
- Three Python/uv installers point at the CLI's OWN official installer (code.kimi.com, mistral.ai/vibe, NousResearch/hermes-agent) which bootstraps uv+Python itself — no custom uv step, no npm template.
- nanobot installs via `pip --user nanobot-ai` with a pip3/pip/`python3 -m pip` front-end resolver and a documented release-Go-binary fallback comment.
- snow-cli git-clone-builds MayDay-wpf/snow-cli into `~/.livos-cli/snow-cli`, runs `npm install` + `npm run link` (each step fail-guarded), then symlinks the bin into `~/.local/bin` and prints where `snow` resolved for Plan 04.
- kiro refuses to guess a package (avoids the aion-cli two-name-guess anti-pattern) and exits non-zero with the explicit RESEARCH A9 unverified message; still short-circuits as already-installed if an operator-installed `kiro` is on PATH.
- All 6 are `bash -n` clean, `set -euo pipefail`, FAIL-CLOSED (`fail ... 75` on install-source error), idempotent, and append the `.profile` `LivOS CLI PATH` marker. All authHidden (no auth wiring here).

## Task Commits

Each task was committed atomically:

1. **Task 1: Python/uv installers (kimi-cli, mistral-vibe, hermes-agent)** - `2c76d033` (feat)
2. **Task 2: nanobot, snow-cli, kiro install-only scripts** - `e37bb116` (feat)

## Files Created/Modified
- `scripts/install/cli/kimi-cli.sh` - Official uv-bootstrapping installer for `kimi` (code.kimi.com/install.sh)
- `scripts/install/cli/mistral-vibe.sh` - Official uv-bootstrapping installer for `vibe` (mistral.ai/vibe/install.sh)
- `scripts/install/cli/hermes-agent.sh` - Official installer for `hermes` (NousResearch/hermes-agent; heavy uv+Python+Node+rg+ffmpeg)
- `scripts/install/cli/nanobot.sh` - pip --user nanobot-ai (MCP host, no auth); pip front-end resolver; Go-binary fallback note
- `scripts/install/cli/snow-cli.sh` - git-clone build MayDay-wpf/snow-cli + npm link + ~/.local/bin symlink; per-step fail guards; collision note
- `scripts/install/cli/kiro.sh` - Fail-closed unverified-installer guard; API-key headless note; no guessed package

## Decisions Made
- Python CLIs use official installers, not npm (Pitfall 5 / RESEARCH Pattern 3).
- Python scripts prepend `~/.cargo/bin` in addition to `~/.local/bin` (uv itself may land in ~/.cargo/bin) and extend the `.profile` marker line to include `~/.cargo/bin`.
- kiro is fail-closed on the unverified installer rather than guessing (T-253-07); it does NOT contain any invented npm/pip package literal.
- snow-cli prints its resolved binary path so Plan 04 can decide whether its npm-link dir needs adding to detector.ts/auth.ts (it is symlinked into the already-covered ~/.local/bin to avoid that need).

## Deviations from Plan

None - plan executed exactly as written.

(Note: header-comment wording for the Pitfall-5 reference was phrased as "a global npm install" rather than the literal "npm install -g" so the Python scripts contain zero `npm install -g` occurrences per the acceptance criterion. This is wording-only, not a behavioral deviation.)

## Issues Encountered
- `_logging.sh` lives at `scripts/install/_logging.sh` and is sourced via `${SCRIPT_DIR}/../_logging.sh` (the cli/ scripts source one level up) — followed the existing cursor-agent.sh / goose.sh convention with the inline-fallback helper block. No issue, just confirmed the path.

## User Setup Required
None - no external service configuration required at this plan. Auth wiring + detector/PATH registration is Plan 04 (these are authHidden with CLI_AUTH_COMMANDS=null).

## Next Phase Readiness
- All 6 scripts are file-disjoint from Plans 01/02/04 (parallel-safe).
- Plan 04 must: set CLI_AUTH_COMMANDS=null + authHidden:true for all 6; confirm snow-cli's resolved bin dir is covered by detector.ts/auth.ts PATH arrays (symlinked into ~/.local/bin, which is covered) — add the npm-link dir only if a future deploy shows snow resolving elsewhere.
- CONFIDENCE NOTE (carry to verifier/UAT): kimi/mistral/hermes/nanobot/snow/kiro install sources are MEDIUM/UNVERIFIED — fail-closed design surfaces any broken source as a clear non-zero FAIL on real install.

## Self-Check: PASSED

- FOUND: scripts/install/cli/kimi-cli.sh, mistral-vibe.sh, hermes-agent.sh, nanobot.sh, snow-cli.sh, kiro.sh
- FOUND: commit 2c76d033 (Task 1)
- FOUND: commit e37bb116 (Task 2)
- All 6 `bash -n` clean; all 6 contain `set -euo pipefail` + `fail ... 75`; Python 3 contain zero `npm install -g`.

---
*Phase: 253-local-agents-cli-expansion*
*Completed: 2026-05-30*
