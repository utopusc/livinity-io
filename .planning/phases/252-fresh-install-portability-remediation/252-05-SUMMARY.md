---
phase: 252-fresh-install-portability-remediation
plan: 05
subsystem: install-env-seed-runtime-health
tags: [systemd, EnvironmentFile, luse, display, xauthority, mcp-seed, empty-catalog, health-signal, R5, R6, R12, tdd]

# Dependency graph
requires:
  - phase: 252-fresh-install-portability-remediation
    plan: 01
    provides: Wave-1 apt + display error-handling (no code dependency)
  - phase: 252-fresh-install-portability-remediation
    plan: 02
    provides: Wave-2 ordering (no code dependency)
  - phase: 252-fresh-install-portability-remediation
    plan: 04
    provides: MCP-seed port baseline (route.ts Path-A pin + livos/install.sh seed) this wave hardens at runtime
provides:
  - "liv-assistant.service ships EnvironmentFile=-/opt/livos/.env so aioncore→claude→luse inherit REDIS_URL (resolveLuseRedisUrl step 2) on a fresh box; '-' prefix tolerates a missing file"
  - "luse MCP seed DISPLAY/XAUTHORITY are __LIVOS_DISPLAY__/__LIVOS_XAUTHORITY__ placeholders resolved at seed time from the actual desktop user's uid + runtime Xauthority (no uid-1000/GDM literal)"
  - "empty liv:mcp:config catalog raises a SeedResult.emptyCatalog flag + an ERROR-level log (was warn-only silent no-op); boot wiring re-surfaces it as a loud ERROR + livos:v43:mcp_seed:empty_catalog health key"
affects: [252-06 (R13/R14/R15)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tolerant systemd EnvironmentFile (`-` prefix) to thread a shared secret file into a unit's child processes without baking a per-install secret into the committed unit"
    - "Seed-time host inspection (id -u $_DLD_DESKTOP_USER + find /run/user/<uid> -name Xauthority) substituted into placeholders, mirroring the Chrome resolution idiom (server/index.ts:1773-1778)"
    - "Optional result-flag (emptyCatalog?) + ERROR-log + Redis health key to turn a silent no-op into an operator-visible signal — fail-soft (never throws / never blocks boot)"

key-files:
  created:
    - .planning/phases/252-fresh-install-portability-remediation/252-05-SUMMARY.md
  modified:
    - systemd/liv-assistant.service
    - scripts/install/seeds/mcp-servers.json
    - scripts/install/deploy-livinityd.sh
    - livos/packages/livinityd/source/modules/mcp-registrar/seed.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/types.ts
    - livos/packages/livinityd/source/index.ts
    - livos/packages/livinityd/source/modules/mcp-registrar/__tests__/seed.test.ts

key-decisions:
  - "R5: added a tolerant EnvironmentFile=-/opt/livos/.env to the [Service] block (between MCP_TIMEOUT and ExecStart) — NOT a redis-env.conf drop-in / literal secret (CONTEXT R5: that bakes a per-install secret into a committed file). The '-' prefix is required so first boot before env-seed runs is non-fatal."
  - "R6: resolved the desktop user from _DLD_DESKTOP_USER (fallback bruce), uid via id -u, Xauthority via find /run/user/<uid> -maxdepth 2 -name Xauthority with a ~/.Xauthority fallback. DISPLAY kept as :1 (the working host display the -ac displays spawn on). Both substituted via the existing pipe-delimited sed block (a display :1 and an Xauthority path contain no |)."
  - "R12: SeedResult.emptyCatalog is OPTIONAL so the 11 existing exact `toEqual({created,skipped,errored,sentinelSet})` assertions stay green (flag absent on the happy path). The empty branch logs via logger.error (SeedLogger already declares error) — no type-guard dance needed. Boot wiring writes livos:v43:mcp_seed:empty_catalog=1, fail-soft."

requirements-completed: [R5, R6, R12]

# Metrics
duration: ~5min
completed: 2026-05-29
---

# Phase 252 Plan 05: Luse Env + Seed Hardening + Loud Empty-Catalog (R5/R6/R12) Summary

**Hardened the runtime Luse stack for a fresh box: `liv-assistant.service` now inherits `REDIS_URL` via a tolerant `EnvironmentFile=-/opt/livos/.env` (no productized drop-in / literal secret), the luse MCP seed's `DISPLAY`/`XAUTHORITY` are now `__LIVOS_DISPLAY__`/`__LIVOS_XAUTHORITY__` placeholders resolved at seed time from the actual desktop user's uid + runtime Xauthority (the uid-1000/GDM literal is gone), and an empty `liv:mcp:config` catalog is now an operator-visible ERROR + `emptyCatalog` SeedResult flag + `livos:v43:mcp_seed:empty_catalog` health key instead of a silent warn-only no-op.**

## Performance
- **Duration:** ~5 min
- **Tasks:** 3 (Task 3 = TDD RED→GREEN, no refactor needed)
- **Files modified:** 6 + 1 test file

## Accomplishments

### Task 1 — tolerant EnvironmentFile on liv-assistant.service (R5) — commit `7b1374ec`
- `systemd/liv-assistant.service`: added `EnvironmentFile=-/opt/livos/.env` inside `[Service]`, immediately after `Environment="MCP_TIMEOUT=30000"` and before `ExecStart`, with a Phase-252 comment.
- `-` prefix makes a missing file non-fatal (fresh box before env-seed runs). aioncore→claude→luse then resolve Redis via `resolveLuseRedisUrl` step 2 (`REDIS_URL`) with no dependence on the per-MCP env seed.
- No `redis-env.conf` drop-in / literal secret added (CONTEXT R5 / 251-06 rec #1).
- Acceptance: `grep -q 'EnvironmentFile=-/opt/livos/.env'` ✓; `redis-env.conf` count = 0; directive sits in `[Service]` before `[Install]`.

### Task 2 — luse DISPLAY/XAUTHORITY resolved at seed time (R6) — commit `02201ab2`
- `scripts/install/seeds/mcp-servers.json`: luse env `DISPLAY ":1"` + `XAUTHORITY "/run/user/1000/gdm/Xauthority"` → `__LIVOS_DISPLAY__` / `__LIVOS_XAUTHORITY__` placeholders.
- `scripts/install/deploy-livinityd.sh` `_dld_seed_mcp_servers`: before the sed block, resolve `_desktop_user="${_DLD_DESKTOP_USER:-bruce}"`, `_desktop_uid=$(id -u …||echo 1000)`, `luse_display=":1"`, `luse_xauthority=$(find /run/user/<uid> -maxdepth 2 -name Xauthority | head -1)` with a `/home/<user>/.Xauthority` fallback — mirrors the Chrome resolution idiom (server/index.ts:1773-1778). Added 2 sed substitutions for the new placeholders.
- No `/run/user/1000/gdm/Xauthority` literal remains anywhere in the seed JSON.
- Acceptance: both placeholders present in JSON; gdm literal count = 0; placeholder present in deploy-livinityd.sh sed block; JSON valid (validated via node — python3 absent on the Windows dev host); `bash -n` clean.

### Task 3 (TDD) — loud operator-visible empty-catalog signal (R12) — RED `6fd2c2e6` + GREEN `a0efae5c`
- **RED (`6fd2c2e6`):** added Scenario L (empty catalog → `emptyCatalog:true` + ERROR log, no AionUi calls, no sentinel) + Scenario M (non-empty catalog → `emptyCatalog` falsy, no empty-catalog ERROR). Scenario L failed as expected (`emptyCatalog undefined`); Scenario M passed (drift-lock).
- **GREEN (`a0efae5c`):**
  - `types.ts`: `SeedResult` gains optional `emptyCatalog?: boolean` (optional so the 11 existing exact `toEqual` assertions stay green).
  - `seed.ts`: the empty-catalog branch (was a warn-only silent no-op) now sets `result.emptyCatalog = true` and logs via `logger.error('[mcp-seed] EMPTY liv:mcp:config catalog … Re-run the Path A installer or seed liv:mcp:config manually.')`. `SeedLogger` already declares `error`, so no type-guard dance was needed (simpler than the plan's `typeof (logger as …).error === 'function'` sketch).
  - `index.ts` boot wiring (`:670` consumer): after the seed call, if `r.emptyCatalog` is true → loud `this.logger.error('Phase 252 (R12): liv:mcp:config is EMPTY …')` + fail-soft `await this.ai.redis.set('livos:v43:mcp_seed:empty_catalog','1')` (inner try/catch so a Redis failure can't break boot). The pre-existing outer try/catch already guarantees the orchestrator never breaks boot.
- Acceptance: `emptyCatalog` + `EMPTY liv:mcp:config` present in seed.ts; **13/13** seed tests GREEN via `pnpm --filter livinityd test:run source/modules/mcp-registrar/__tests__/seed.test.ts`; typecheck adds ZERO new errors to changed files.

## TDD Gate Compliance
- RED gate: `test(252-05)` commit `6fd2c2e6` (Scenario L fails as expected).
- GREEN gate: `feat(252-05)` commit `a0efae5c` after RED (13/13 green).
- REFACTOR gate: not needed — implementation was minimal and clean.

## Deviations from Plan

### Auto-fixed Issues
None — Rules 1-3 did not trigger; all three tasks executed cleanly.

### Minor implementation simplification (not a deviation in behavior)
- The plan's R12 sketch wrapped the error log in `if (typeof (logger as {error?…}).error === 'function')`. Since `SeedLogger` (types.ts:58) already declares a mandatory `error(msg, err?)` method (and `seed.ts:192` already calls `logger.error`), the guard is dead code — I called `logger.error(…)` directly. Identical operator-visible behavior; cleaner.

## Verification
- **R5:** `grep -q 'EnvironmentFile=-/opt/livos/.env' systemd/liv-assistant.service` ✓; `redis-env.conf` count = 0.
- **R6:** `__LIVOS_DISPLAY__` + `__LIVOS_XAUTHORITY__` present in mcp-servers.json; `/run/user/1000/gdm/Xauthority` count = 0; placeholder present in deploy-livinityd.sh sed block; JSON valid (node); `bash -n scripts/install/deploy-livinityd.sh` clean.
- **R12:** `emptyCatalog` + `EMPTY liv:mcp:config` present in seed.ts; 13/13 seed tests GREEN; typecheck — zero new errors in changed files (baseline-without-changes = 384, with-changes = 382 total; no error lines in seed.ts / types.ts / index.ts via git-stash A/B; SCOPE BOUNDARY — the ~382-389 pre-existing webapps/widgets/xai-auth baseline is out of scope, same as 252-01/02).
- **Sacred SHA:** `f3538e1d…` preserved — `[sacred-sha] PASS: 20 files verified` on all four code commits (no `sdk-agent-runner.ts` change).

## Notes
- python3 is absent on the Windows dev host ("Python bulunamadı") — JSON validated via `node -e "JSON.parse(...)"` instead; the seed-emitter python3 path is exercised on the Ubuntu 24.04 target during `update.sh`/fresh install (same caveat as 252-04).
- `pnpm --filter livinityd test` runs vitest in WATCH mode; use `test:run` (the project's `vitest run …` script) with the explicit test-file path — `-- seed` as a positional was NOT honored through pnpm `--` forwarding and ran the whole suite (which has unrelated pre-existing `process.exit`-based test files). Pass `source/modules/mcp-registrar/__tests__/seed.test.ts` directly.
- NOT YET DEPLOYED to Mini PC — repo-side unit/seed/source changes take effect on the next `update.sh`/fresh install + a `systemctl daemon-reload` for the unit change.
- The `livos:v43:mcp_seed:empty_catalog` health key is written but no `/api/health` aggregator reads it yet — the ERROR log + result flag are the primary operator-visible signal; the key is forward-compat for a future health surface (R12 acceptance allows "ERROR log + result flag is sufficient" when no health surface exists).

## Self-Check: PASSED
- All 6 modified source files + the test file + this SUMMARY exist on disk (verified).
- All 4 task commits exist in git history: `7b1374ec` (R5), `02201ab2` (R6), `6fd2c2e6` (R12 RED), `a0efae5c` (R12 GREEN).
