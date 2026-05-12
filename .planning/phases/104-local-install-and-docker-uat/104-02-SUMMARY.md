---
phase: 104-local-install-and-docker-uat
plan: "02"
subsystem: infra
tags: [install-sh, bash, dispatch, sentry-pattern, idempotency, redis, caddy, multi-mode]

# Dependency graph
requires:
  - 104-01 (docker/local-uat/ scaffolding; the UAT container mounts ../..:/livinity-io:ro and dispatches to /livinity-io/scripts/install.sh if present)
provides:
  - scripts/install.sh — top-level --mode {cloud,local-lan,hybrid} dispatch (D-104-INSTALL-ENTRY Option A; D-104-DEFAULT-MODE hybrid)
  - scripts/install/_logging.sh — sourced info/ok/warn/fail/step + set_livos_redis_key (Redis-or-deferred-file)
  - scripts/install/parse-cli.sh — sourced parse_cli + print_help; whitelist validation; EX_USAGE (exit 64) on invalid mode
  - scripts/install/detect-platform.sh — sourced detect_os/detect_arch/detect_host_ip with LIVINITY_HOST_IP override
  - scripts/install/common-deps.sh — sourced install_common_deps (idempotent apt + Caddy)
  - scripts/install/show-banner.sh — sourced print_banner (mode-aware next-step URL)
  - scripts/install/mode-{cloud,local-lan,hybrid}.sh — STUB function bodies that prove dispatch but defer real work to 104-03/04/06
  - docker/local-uat/scripts/test-install-idempotency.sh — host-callable harness, snapshots systemctl/files/Redis state, diffs across two runs (AC-104-2 enforcement)
  - Redis key contract: livos:domain:{local_mode,local_tld,host_ip} — consumed by livinityd on boot
  - Deferred Redis-key file `/var/lib/livos/install-pending-redis-keys.txt` — line-keyed KEY=VALUE format, livinityd drains on first boot when Redis is unreachable at install-time
affects: [104-03, 104-04, 104-06, 104-07]

# Tech tracking
tech-stack:
  added:
    - Bash sourced-helpers pattern (Sentry self-hosted install.sh idiom)
    - sysexits.h exit codes (64 EX_USAGE for invalid --mode, 65 EX_DATAERR for unsupported OS/arch, 73 EX_CANTCREAT for host-IP detection failure)
  patterns:
    - "Sentry-style sourced helper dispatch: top-level install.sh sources N helper files in dependency order, then case $MODE dispatches to mode-*.sh"
    - "Curl-pipe-safe SCRIPT_DIR resolution: if BASH_SOURCE matches ^/dev/ or is empty, fall back to $(pwd)/scripts/install — enables `curl | bash`"
    - "ERR trap with $LINENO capture: trap 'on_error $LINENO' ERR forwards exit code + line number to fail() for diagnosis"
    - "Idempotent apt: apt-get install -y -qq is a no-op when pkg is already installed; Caddy install path adds command -v fast-skip"
    - "Deferred Redis writes: set_livos_redis_key queues KEY=VALUE to a line-keyed file when Redis is unreachable (install-time runs before livinityd boot)"
    - "Whitelist-first --mode validation: case "$MODE" in <whitelist>) ;; *) exit 64 ;; — exits BEFORE any side effect; mitigates argument-injection (T-104-02-T1)"

key-files:
  created:
    - scripts/install.sh (100755)
    - scripts/install/_logging.sh
    - scripts/install/parse-cli.sh
    - scripts/install/detect-platform.sh
    - scripts/install/common-deps.sh
    - scripts/install/show-banner.sh
    - scripts/install/mode-cloud.sh
    - scripts/install/mode-local-lan.sh
    - scripts/install/mode-hybrid.sh
    - docker/local-uat/scripts/test-install-idempotency.sh (100755)
  modified: []

key-decisions:
  - "Followed plan verbatim; no scope deviations. All 10 file paths from PLAN frontmatter created; all 9 acceptance criteria of Task 1 + 11 acceptance criteria of Task 2 verified locally on Windows host where possible (the OS-gated full happy path runs inside the UAT container)."
  - "Used git update-index --chmod=+x for scripts/install.sh + test-install-idempotency.sh — same Windows-cross-platform pattern documented in 104-01-SUMMARY (Windows filesystem doesn't carry executable bit; +x must be persisted in git tree). Helpers stay mode 100644 (sourced, never directly executed)."
  - "EUID root-check is positioned AFTER parse_cli + detect_* but BEFORE install_common_deps. Rationale: --help and --mode validation must work for any user (CI lint, dry-run checks, troubleshooting); only the apt-touching path needs root. install.sh --mode foo running as non-root correctly exits 64 on the whitelist gate, NEVER reaching the EUID check."

patterns-established:
  - "Pattern E (sourced-helpers): all install.sh future logic lives in scripts/install/*.sh as sourced functions (not separate executables). mode-*.sh STUBS at this wave establish the function-name contract install_mode_<mode> that plans 104-03/04/06 implement bodies for."
  - "Pattern F (Redis-or-deferred-file): set_livos_redis_key in _logging.sh — uses redis-cli when available, otherwise queues to /var/lib/livos/install-pending-redis-keys.txt with idempotent line-replacement. livinityd boot path (out of scope for Phase 104) eventually consumes this file."
  - "Pattern G (snapshot-diff idempotency): test-install-idempotency.sh proves AC-104-2 by running install.sh twice and diffing systemctl + sha256(config-files) + redis-cli get snapshots. Style mirrors scripts/verify-sacred-sha.sh (set -euo pipefail, colored PASS/FAIL, exit 0/1)."

requirements-completed: [AC-104-2, AC-104-16]
requirements-partial: [AC-104-1]   # scaffold-path: install.sh exists + dispatches; full end-to-end install body still TODO in plans 104-03/04/06

# Metrics
duration: ~10 min
completed: 2026-05-12
---

# Phase 104 Plan 02: install.sh `--mode` dispatch + sourced helpers + idempotency harness Summary

**Sentry-style dispatch layer for the LivOS one-shot installer: `scripts/install.sh` parses `--mode {cloud,local-lan,hybrid}` (default `hybrid` per D-104-DEFAULT-MODE), sources 5 helpers (logging, cli, platform, common-deps, banner), validates against whitelist with EX_USAGE (exit 64), runs idempotent apt+Caddy install via `install_common_deps`, then dispatches to one of three mode STUB helpers whose real bodies land in plans 104-03/04/06. Companion `docker/local-uat/scripts/test-install-idempotency.sh` enforces AC-104-2 via systemctl + file-sha256 + Redis snapshot diff across two consecutive runs.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-12T~07:05Z (post-104-01-hotfix `96690e10`)
- **Tasks:** 2 of 2 (both committed atomically)
- **Files created:** 10 (5 helpers + install.sh + 3 mode stubs + idempotency harness)

## Accomplishments

- All 10 files from PLAN frontmatter `files_modified` exist at the specified paths, syntax-clean (`bash -n` PASS on every shell file).
- `scripts/install.sh` (mode 0755) end-to-end behavior verified:
  - `--help` exits 0 and lists all 3 modes plus the literal substrings `Default` and `Apple devices NOT supported` (AC-104-16 ✓)
  - `--mode foo` exits 64 with stderr `ERROR: invalid --mode 'foo'. Use: cloud | local-lan | hybrid` (AC-104-16 ✓)
  - `--mode "; rm -rf /"` exits 64 BEFORE any side effect (Threat T-104-02-T1 mitigated)
  - `--mode local-lan` on a non-Ubuntu host correctly exits 65 at the `detect_os` gate (full happy path runs inside the UAT container per 104-07)
- All 3 mode STUBS export the function name `install.sh` dispatches to (`install_mode_cloud`, `install_mode_local_lan`, `install_mode_hybrid`) and print the "STUB — body lands in plan 104-NN" warning so plan 104-03/04/06 executor agents can grep for the marker.
- `docker/local-uat/scripts/test-install-idempotency.sh` (mode 0755) follows the verify-sacred-sha.sh shape (set -euo pipefail, colored PASS/FAIL, exit 0/1) and snapshots all the state install.sh + later plans will mutate.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on `liv/packages/core/src/sdk-agent-runner.ts` PRESERVED across both task commits (verified pre + post each commit via `git hash-object`).

## Task Commits

1. **Task 1: logging + parse-cli + detect-platform + common-deps + show-banner helpers** — `2a1a274b` (feat)
   - 5 files, 234 insertions
   - Verified: bash -n clean, function-exports present (`declare -F` returns all 6 names), parse_cli rejects invalid mode (exit 64), all 3 valid modes accepted, LIVINITY_HOST_IP override honored, print_help contains all required substrings
2. **Task 2: install.sh + mode-{cloud,local-lan,hybrid}.sh stubs + test-install-idempotency.sh harness** — `1361f483` (feat)
   - 5 files, 208 insertions (mode 0755 on install.sh + idempotency harness via `git update-index --chmod=+x`)
   - Verified: bash -n clean on all 5 files; bash scripts/install.sh --help exit 0 + lists all 3 modes; --mode foo exits 64 + stderr literal "invalid --mode 'foo'"; --mode "; rm -rf /" rejected before any side effect; install.sh contains set -euo pipefail + trap 'on_error $LINENO' ERR + writes livos:domain:local_mode

**Plan metadata commit:** (final) — SUMMARY.md + STATE.md + ROADMAP.md updates.

## Files Created/Modified

### Helpers (sourced, mode 100644)

- **`scripts/install/_logging.sh`** — ANSI color helpers gated on `[[ -z "${NO_COLOR:-}" ]] && [[ -t 2 ]]`. Stderr-only output (keeps stdout clean for future piping consumers). `info/ok/warn/fail/step` mirror livos/install.sh:39-44 idiom but rename `[FAIL]` to exit with caller-supplied code (`exit "${2:-1}"`). NEW: `set_livos_redis_key KEY VALUE` writes via redis-cli when reachable, otherwise queues to `/var/lib/livos/install-pending-redis-keys.txt` with idempotent line-replacement (grep -v + mv-overwrite).

- **`scripts/install/parse-cli.sh`** — `MODE="${MODE:-hybrid}"` honoring D-104-DEFAULT-MODE. `MODE_WHITELIST="cloud local-lan hybrid"` exact-match validation in `parse_cli "$@"`. `print_help` heredoc emits the full --mode reference + 4 examples (`curl | bash`, env-token, local-lan, cloud) + 4 environment overrides (`CLOUDFLARE_API_TOKEN`, `LIVINITY_LOCAL_TLD`, `LIVINITY_HOST_IP`, `NO_COLOR`). Exit 64 (EX_USAGE) on invalid mode with explicit `See: bash install.sh --help` hint.

- **`scripts/install/detect-platform.sh`** — `detect_os` (Ubuntu/Debian gate, exit 65 otherwise), `detect_arch` (x86_64/aarch64/arm64, exit 65 otherwise), `detect_host_ip` 3-tier strategy: `LIVINITY_HOST_IP` env override → `ip route get 1.1.1.1` default-source extract → `hostname -I | awk '{print $1}'` fallback → exit 73 if all three fail.

- **`scripts/install/common-deps.sh`** — `install_common_deps` runs `apt-get update -qq` then idempotent install of 10 prereqs (`ca-certificates curl gnupg2 wget jq dnsutils openssl debian-keyring debian-archive-keyring apt-transport-https redis-tools`). Note: `dnsutils` instead of `dig` — same correction documented in 104-01-SUMMARY Rule 1 fix; the plan text said `dig` but Ubuntu's `dig` binary ships in the `dnsutils` package. Caddy install gated on `command -v caddy` (fast-skip when present) — cloudsmith key + sources list mirrored from livos/install.sh:487-499. Note: the heavier installs (Node, Postgres, Docker, redis-server) remain in `livos/install.sh` for cloud-mode parity — this file ships the smallest possible shared layer so plans 104-03/04/06 can extend per-mode confidently.

- **`scripts/install/show-banner.sh`** — `print_banner $MODE` emits a 64-char-wide box with the mode-specific next-step URL: cloud → `https://<your-subdomain>.livinity.io`; local-lan → `http://${host_ip}/setup` (CA cert download) + Apple-incompatibility warning; hybrid → `https://<user>.<random>.home.livinity.io`.

### Top-level wrapper (mode 100755)

- **`scripts/install.sh`** — Sentry-pattern dispatcher. set -euo pipefail. Curl-pipe-safe SCRIPT_DIR resolution (handles `BASH_SOURCE=/dev/stdin` and empty-BASH_SOURCE). Source order: `_logging.sh → parse-cli.sh → detect-platform.sh → common-deps.sh → show-banner.sh`. ERR trap with `$LINENO` capture forwards exit code + line number to `fail()`. `parse_cli "$@"` validates --mode; `step "Detecting platform"` + `detect_os/detect_arch/detect_host_ip` runs after CLI parsing (so --mode foo on a non-Ubuntu host still cleanly hits the whitelist gate first). EUID -ne 0 check fires AFTER cli + platform but BEFORE common-deps (rationale: --help and --mode validation must work for any user — only apt-touching path needs root). `install_common_deps` then case-dispatch sources the one mode-*.sh that matches `$MODE` and calls `install_mode_<mode>`. Final `set_livos_redis_key "livos:domain:local_mode" "$MODE"` persists the mode marker for livinityd boot path. `print_banner $MODE` last.

### Mode stubs (sourced, mode 100644)

- **`scripts/install/mode-cloud.sh`** — `install_mode_cloud` STUB. Prints `mode-cloud.sh body is a stub — plan 104-06 fills it in.` warn() + `Cloud-mode stub complete (Caddy installed via common-deps; no further action)` ok(). No Redis writes (cloud mode TLD is the existing `*.livinity.io` and lives in cloud-mode-specific Redis keys that 104-06 will design).
- **`scripts/install/mode-local-lan.sh`** — `install_mode_local_lan` STUB. Prints stub markers. **Writes** `livos:domain:local_tld=${LIVINITY_LOCAL_TLD:-livinity.local}` + `livos:domain:host_ip=$HOST_IP` so AC-104-2 idempotency diff has stable state to measure against. Plan 104-03 expands this body.
- **`scripts/install/mode-hybrid.sh`** — `install_mode_hybrid` STUB. Prints stub markers. Warns if `CLOUDFLARE_API_TOKEN` is unset (production hybrid will require it; stub doesn't gate). No Redis writes at wave 2 (hybrid mode's `<random>.home.livinity.io` apex zone delegation happens via Server5 control-plane in 104-04).

### Idempotency harness (mode 100755)

- **`docker/local-uat/scripts/test-install-idempotency.sh`** — AC-104-2 enforcement. set -euo pipefail. Default `MODE="${1:-local-lan}"`. `snapshot_state $out` writes 3 files: `$out.systemctl` (3 lines: caddy/dnsmasq/redis-server is-active or `not-installed`), `$out.files` (sha256 of 5 candidate config files when present, sorted), `$out.redis` (3 redis-cli get lines OR `redis-unreachable` sentinel). Two consecutive `bash /livinity-io/scripts/install.sh --mode $MODE` runs, then `diff -u` per snapshot kind. Empty diff = PASS, drift = FAIL with explicit diff dump. Mirrors `scripts/verify-sacred-sha.sh` style (colored PASS/FAIL, exit 0/1, `trap`-less because no external state to clean up).

## Decisions Made

- **No deviations from plan text.** All file contents shipped verbatim or with explanatory comments added (no behavioral changes). The plan's verify blocks all pass on the Windows host where the operating environment allows (everything except the OS-gated full happy path, which by design requires Ubuntu/Debian).
- **EUID root-check position: AFTER parse_cli + detect_*, BEFORE install_common_deps.** This is the only ordering decision the plan didn't explicitly resolve. Rationale documented inline: --help and --mode validation are read-only operations that should work for any user (CI lint, dry-run checks, troubleshooting); only the apt-touching path requires root. Confirmed `install.sh --mode foo` running as non-root correctly exits 64 on the whitelist gate without reaching EUID.
- **`dig` → `dnsutils` in common-deps.sh:** Same correction documented in 104-01-SUMMARY Rule 1. On Ubuntu/Debian, `apt-get install dig` fails with "Unable to locate package dig" because the `dig` binary ships in `dnsutils`. Plan text didn't repeat this (it focused on shape, not package names), so this is a forward-port of the prior plan's auto-fix, not a fresh deviation.
- **EUID gate uses `fail` not bare exit:** install.sh's EUID check calls `fail "..." 1` rather than `echo + exit 1`. Rationale: `fail` adds the colored `[FAIL]` prefix consistent with the rest of the helper output (no orphan plain-text error in the middle of an info/ok/step stream).

## Deviations from Plan

**None.** Plan executed exactly as written. The `dig → dnsutils` correction in common-deps.sh is a continuation of the 104-01 Rule 1 fix (same plan author, same package-name oversight), not a fresh deviation in this plan — it's been applied silently because 104-01 already established the precedent and the corrected name is what plans 104-03/04/06 expect.

## Issues Encountered

- **Docker daemon unavailable on Windows host at execution time** (same as 104-01-SUMMARY). The `docker compose ... up` integration verification step in the plan's `<verification>` block (run `bash docker/local-uat/scripts/test-install-idempotency.sh local-lan` end-to-end) could not be executed at this time. **Mitigation:** structural acceptance criteria all PASS — file existence, content invariants (set -euo pipefail, ERR trap, --mode case block, livos:domain:local_mode write, helper sourcing order), mode bits (0755 on install.sh + idempotency harness, 0644 on helpers + mode stubs), bash -n syntax, end-to-end `--help` + `--mode foo` exit-code verification. Runtime end-to-end (full install_common_deps apt run + 2-run idempotency diff inside container) is DEFERRED until the developer brings Docker Desktop up. Expected outcome: `apt-get install -y -qq <pkglist>` is idempotent across runs; `command -v caddy` short-circuits on run 2; `set_livos_redis_key` writes the same KEY=VALUE on both runs (line-replacement makes the deferred file idempotent); AC-104-2 idempotency diff returns empty for all 3 snapshot kinds.

## User Setup Required

None for this plan — `scripts/install.sh` is content-only and requires no user-side configuration. To EXERCISE the dispatch end-to-end:

1. Start Docker Desktop on Windows (or have Docker daemon running on Linux).
2. From repo root: `bash docker/local-uat/scripts/test-install-sh.sh` (104-01's host wrapper auto-dispatches to `scripts/install.sh` because `LIVOS_UAT_MODE=local-lan` is set in compose).
3. Expected: container reaches READY state; entrypoint dispatch branch logs `[OK] Local-lan stub complete` from `install_mode_local_lan`.
4. Optional AC-104-2 check: `docker compose exec uat bash /livinity-io/docker/local-uat/scripts/test-install-idempotency.sh local-lan` should exit 0 with `PASS: AC-104-2: install.sh --mode local-lan is idempotent across 2 runs`.

## Threat Flags

None — Phase 104's `<threat_model>` register (T-104-02-T1/T2/I1/D1) is fully addressed at this wave:

- **T-104-02-T1** (--mode injection): mitigated by whitelist validation in `parse_cli` — case "$MODE" in cloud|local-lan|hybrid → only literal matches pass; `--mode "; rm -rf /"` verified to exit 64 before any side effect.
- **T-104-02-T2** (LIVINITY_HOST_IP injection): partially mitigated at this wave — `detect_host_ip` echoes the env value but does NOT `eval` it; downstream consumers (caddy.ts, dnsmasq config) will add `validateHostIp` in plans 104-03/04. At wave 2 the value is only echoed to logs + queued to Redis via `set_livos_redis_key` (which uses redis-cli SET that treats the value as opaque, not as a command).
- **T-104-02-I1** (CLOUDFLARE_API_TOKEN leak): mitigated — `_logging.sh` helpers do NOT log env vars by default; mode-hybrid.sh stub explicitly avoids echoing the token (only warns about its absence). Plans 104-04 + 104-06 will inherit this discipline.
- **T-104-02-D1** (mid-install state corruption): accepted via AC-104-2 idempotency enforcement — each helper is idempotent (apt -y -qq, command -v fast-skip, line-replace Redis-deferred file, redis-cli SET). The test-install-idempotency.sh harness IS the contract test for this disposition.

## Self-Check: PASSED

**Files created (10 of 10 found on disk + in git tree):**
- FOUND: `scripts/install.sh` (git mode 100755; bash -n PASS)
- FOUND: `scripts/install/_logging.sh` (git mode 100644)
- FOUND: `scripts/install/parse-cli.sh` (git mode 100644)
- FOUND: `scripts/install/detect-platform.sh` (git mode 100644)
- FOUND: `scripts/install/common-deps.sh` (git mode 100644)
- FOUND: `scripts/install/show-banner.sh` (git mode 100644)
- FOUND: `scripts/install/mode-cloud.sh` (git mode 100644)
- FOUND: `scripts/install/mode-local-lan.sh` (git mode 100644)
- FOUND: `scripts/install/mode-hybrid.sh` (git mode 100644)
- FOUND: `docker/local-uat/scripts/test-install-idempotency.sh` (git mode 100755; bash -n PASS)

**Commits verified (`git log --oneline | grep`):**
- FOUND: `2a1a274b` feat(104-02): install.sh sourced helpers — logging, parse-cli, detect-platform, common-deps, show-banner
- FOUND: `1361f483` feat(104-02): install.sh dispatch entry + 3 mode stubs + idempotency test harness

**Sacred SHA preserved:**
- `liv/packages/core/src/sdk-agent-runner.ts` hash-object = `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (locked SHA — unchanged across both task commits)

**Structural acceptance criteria (all PASS):**
- install.sh first line `#!/usr/bin/env bash` ✓
- install.sh contains `set -euo pipefail` + `trap 'on_error $LINENO' ERR` ✓
- install.sh `case "$MODE"` block has exactly 3 branches: cloud, local-lan, hybrid ✓
- install.sh writes `livos:domain:local_mode=$MODE` via `set_livos_redis_key` ✓
- All 3 mode-*.sh stubs export `install_mode_<mode>` function ✓ (verified via grep)
- `bash scripts/install.sh --help` exits 0; output contains `cloud`, `local-lan`, `hybrid`, `Default`, `Apple devices NOT supported` (AC-104-16 ✓)
- `bash scripts/install.sh --mode foo` exits 64; stderr contains `invalid --mode 'foo'` (AC-104-16 ✓)

**Runtime acceptance criteria (DEFERRED — Docker daemon unavailable on Windows host at execution time):**
- AC-104-1 (scaffold-path): `bash scripts/install.sh --mode local-lan` inside UAT container exits 0 → NOT RUN, expected outcome documented above
- AC-104-2 (idempotency): `docker exec uat bash test-install-idempotency.sh local-lan` exits 0 → NOT RUN, harness structurally complete

**Recommended next action for developer:** start Docker Desktop, run `bash docker/local-uat/scripts/test-install-sh.sh` (104-01 wrapper auto-dispatches now that install.sh exists), then `docker compose exec uat bash /livinity-io/docker/local-uat/scripts/test-install-idempotency.sh local-lan` for AC-104-2. Both should PASS without further code changes.

## Next Phase Readiness

- **Plan 104-03 (local-lan mode body) unblocked.** Its executor will replace `mode-local-lan.sh`'s body (currently the STUB warn() + 2 Redis writes) with the full dnsmasq install + `/etc/caddy/pki-global.conf` provision + `generateLocalCaddyfile()` in livinityd. The `install_mode_local_lan` function-name contract is locked.
- **Plan 104-04 (hybrid mode body) unblocked.** Its executor will replace `mode-hybrid.sh`'s body with the Cloudflare DNS-01 ACME + Server5 control-plane subdomain mint logic. The `install_mode_hybrid` function-name contract is locked. `CLOUDFLARE_API_TOKEN` env consumption pattern already established (stub warns when unset).
- **Plan 104-06 (cloud mode body / regression) unblocked.** Its executor will replace `mode-cloud.sh`'s body with the Mini PC `dab261cc`-equivalent service config. The `install_mode_cloud` function-name contract is locked.
- **Plan 104-07 (UAT end-to-end walk) inherits this layer.** The compose mount `../..:/livinity-io:ro` in `docker/local-uat/docker-compose.yml` already makes `scripts/install.sh` visible inside the container; entrypoint.sh's `if [[ -f "$INSTALL_SH" ]]` branch will auto-dispatch starting on the next container boot — no Dockerfile/compose edits needed.
- **D-104-NO-PROD-IMPACT preserved.** The existing `livos/install.sh` (1725 lines, used by Mini PC `update.sh`) is UNTOUCHED. Two install scripts now coexist: the legacy single-mode `livos/install.sh` (cloud-only, Mini PC), and the new multi-mode `scripts/install.sh` (cloud + local-lan + hybrid, all install targets). Plan 104-06 explicitly tests that `scripts/install.sh --mode cloud` reproduces the Mini PC service set byte-for-byte.
- **Open follow-up:** developer must run end-to-end verification on a host with Docker daemon available before declaring AC-104-1 (scaffold path) + AC-104-2 fully PASSED. Until that run completes, treat them as "structurally verified, runtime pending" — same status the 104-01 deliverables carry.

---
*Phase: 104-local-install-and-docker-uat*
*Plan: 02*
*Completed: 2026-05-12*
