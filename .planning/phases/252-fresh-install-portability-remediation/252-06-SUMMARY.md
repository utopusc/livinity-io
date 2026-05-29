---
phase: 252-fresh-install-portability-remediation
plan: 06
subsystem: luse-identity-installroot-runtimedir
tags: [luse, LUSE_USER_ID, LIVOS_ROOT, XDG_RUNTIME_DIR, TOCTOU, O_NOFOLLOW, multi-user-future, R13, R14, R15, tdd]

# Dependency graph
requires:
  - phase: 252-fresh-install-portability-remediation
    plan: 01
    provides: Wave-1 apt + display error-handling (no code dependency)
  - phase: 252-fresh-install-portability-remediation
    plan: 05
    provides: Wave-4 luse env/seed hardening; this wave hardens the same luse child's identity/root/tmp
provides:
  - "ONE LUSE_USER_ID default ('bruce') across the whole luse child via a shared DEFAULT_LUSE_USER_ID + resolveLuseUserId(env) resolver in tools.ts (server.ts imports it) — no admin-vs-bruce split — and it is seeded explicitly on the luse MCP entry."
  - "ONE install-root source: exported LIVOS_ROOT = \$LIVOS_ROOT ?? \$LIVOS_BASE_DIR ?? /opt/livos in tools.ts, consumed by the Redis env-file fallback (server.ts) + the uploads-allowlist prefix (tools.ts); installer _DLD_LIVOS_DIR is overridable."
  - "Per-uid \$XDG_RUNTIME_DIR/livos markers + a \$XDG_RUNTIME_DIR/luse- allowlist prefix (0700 tmpfs) replacing world-shared /tmp; the marker read closes the TOCTOU symlink-follow race via lstat-reject + O_NOFOLLOW; the writer (window-manager.ts) moved to the same per-uid path."
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-source const + pure DI'd resolver in the dependency-leaf module (tools.ts) re-exported to the dependent (server.ts) to avoid a circular import while keeping ONE source of truth"
    - "Locally-resolved install-root (\$LIVOS_ROOT ?? \$LIVOS_BASE_DIR ?? /opt/livos) for a standalone tsx child whose spawn env may not carry @livos/config's env"
    - "Per-uid \$XDG_RUNTIME_DIR/<app> (0700) instead of world-shared /tmp for cross-process marker files; symlink-safe read via lstatSync(isFile) + openSync(O_RDONLY|O_NOFOLLOW)"

key-files:
  created:
    - .planning/phases/252-fresh-install-portability-remediation/252-06-SUMMARY.md
    - .planning/phases/252-fresh-install-portability-remediation/deferred-items.md
  modified:
    - livos/packages/livinityd/source/modules/computer-use/mcp/server.ts
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts
    - livos/packages/livinityd/source/modules/computer-use/mcp/tools.test.ts
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/livinityd/source/modules/webapps/window-manager.ts
    - scripts/install/seeds/mcp-servers.json
    - scripts/install/deploy-livinityd.sh

key-decisions:
  - "R13: put the shared DEFAULT_LUSE_USER_ID + resolveLuseUserId(env) resolver in tools.ts (NOT server.ts) because server.ts already imports registerLuseTools from tools.ts — re-exporting from tools.ts gives ONE source with NO circular import. server.ts:315 (was '?? admin') and the two tools.ts allowlist sites (were '?? bruce') all now call the resolver. Seeded LUSE_USER_ID=__LIVOS_USER_SLUG__ (covered by the existing global slug sed; no new substitution line)."
  - "R14: LIVOS_ROOT lives in tools.ts too (same single-source/no-cycle reasoning) and is resolved LOCALLY (\$LIVOS_ROOT ?? \$LIVOS_BASE_DIR ?? /opt/livos) rather than importing @livos/config — the luse tsx child's spawn env may not propagate LIVOS_BASE_DIR. Consumed by server.ts resolveLuseRedisUrl's default env-file array and tools.ts's uploads-allowlist prefix + echoed string. deploy-livinityd.sh:61 _DLD_LIVOS_DIR made overridable to match its _DLD_LIVOS_USER/_DLD_DESKTOP_USER neighbours. The dangling server/index.ts:1823 <LIV_DATA_ROOT> comment was reconciled to name the concrete \$LIV_DATA_ROOT env var (default /opt/livos/data) actually wired in skills-storage.ts:dataRoot() — so 251-05's 'convention never wired' note was itself stale; the env var IS wired."
  - "R15: the active-wid marker is a CROSS-PROCESS contract — WRITTEN by livinityd (window-manager.ts broadcastActiveWid) and READ by the luse MCP child (tools.ts). Moving only the reader to \$XDG would break the path match, so I ALSO moved the writer to the same \$XDG_RUNTIME_DIR/livos/active-webapp-wid (DEVIATION below). Both processes run as the SAME desktop user so /run/user/<uid> resolves identically. Reader closes TOCTOU via lstatSync(isFile rejects symlinks/dirs) + openSync(O_RDONLY|O_NOFOLLOW); writer mkdir's the dir 0700 first."

requirements-completed: [R13, R14, R15]

# Metrics
duration: ~12min
completed: 2026-05-29
---

# Phase 252 Plan 06: Luse Identity + Install-Root + Runtime-Dir Hardening (R13/R14/R15) Summary

**Removed the last identity/root/tmp inconsistencies in the luse MCP child so a non-bruce / moved-root box and a future multi-user re-activation don't break or collide: ONE `LUSE_USER_ID` default (`'bruce'`, seeded) via a shared resolver consumed by both `server.ts` and `tools.ts` (was `'admin'` vs `'bruce'` in the SAME process); ONE install-root source (exported `LIVOS_ROOT = $LIVOS_ROOT ?? $LIVOS_BASE_DIR ?? /opt/livos`) driving the Redis env-file fallback + uploads allowlist (the installer root is now overridable); and per-uid `$XDG_RUNTIME_DIR/livos` markers + a `$XDG_RUNTIME_DIR/luse-` allowlist prefix (0700 tmpfs) replacing world-shared `/tmp`, with the marker read closing the TOCTOU symlink-follow race via `lstat`-reject + `O_NOFOLLOW`.**

## Performance
- **Duration:** ~12 min
- **Tasks:** 3 (Task 1 = TDD RED→GREEN, no refactor needed)
- **Files modified:** 6 + 1 test file

## Accomplishments

### Task 1 (TDD) — unify LUSE_USER_ID default to 'bruce' + seed it (R13) — RED `e6273de6` + GREEN `f497e9e1`
- **RED (`e6273de6`):** added an `R13 — LUSE_USER_ID single-source default` describe block to `tools.test.ts` (Test 1: unset/empty → `'bruce'` and `DEFAULT_LUSE_USER_ID === 'bruce'`; Test 2: `'alice'` honored). Failed as expected (`resolveLuseUserId is not a function`); the 18 existing R3 tests stayed green (drift-lock).
- **GREEN (`f497e9e1`):**
  - `tools.ts`: added exported `const DEFAULT_LUSE_USER_ID = 'bruce'` + pure `resolveLuseUserId(env = process.env)` (empty string treated as unset). Replaced the two `?? 'bruce'` literals (the allowlist-driving `userSlug`/`userId`) with `resolveLuseUserId()`.
  - `server.ts`: imported `resolveLuseUserId` from `./tools.js`; replaced the divergent `userId: process.env.LUSE_USER_ID ?? 'admin'` at the `registerLuseTools` call with `userId: resolveLuseUserId()`.
  - `seeds/mcp-servers.json`: added `"LUSE_USER_ID": "__LIVOS_USER_SLUG__"` to the luse `env` block — covered by the existing global `__LIVOS_USER_SLUG__` sed (`deploy-livinityd.sh:1160`, `g` flag), no new substitution line.
- Acceptance: `?? 'admin'` count in server.ts = 0; `resolveLuseUserId` present (2); `"LUSE_USER_ID"` seeded (1); JSON valid (node); 20/20 tools tests GREEN.

### Task 2 — single $LIVOS_ROOT source for the luse install root (R14) — commit `ddf0c375`
- `tools.ts`: added exported `const LIVOS_ROOT = process.env.LIVOS_ROOT ?? process.env.LIVOS_BASE_DIR ?? '/opt/livos'` (resolved locally — the luse tsx child may not get `@livos/config`'s env). The uploads-allowlist prefix + the echoed self-correction string + the two docblocks now use `${LIVOS_ROOT}/data/uploads/${userId}/` (was hardcoded `/opt/livos/data/uploads/`).
- `server.ts`: imported `LIVOS_ROOT`; `resolveLuseRedisUrl`'s default env-file array is now `[`${LIVOS_ROOT}/.env`, `${LIVOS_ROOT}/livos/.env`]` (was hardcoded `/opt/livos`).
- `deploy-livinityd.sh:61`: `_DLD_LIVOS_DIR="${_DLD_LIVOS_DIR:-/opt/livos}"` (was bare literal `"/opt/livos"`) — now overridable like its `_DLD_LIVOS_USER`/`_DLD_DESKTOP_USER` neighbours.
- `server/index.ts:1823`: reconciled the dangling `<LIV_DATA_ROOT>` comment to name the concrete `$LIV_DATA_ROOT` env var (default `/opt/livos/data`) actually wired in `webapps/skills-storage.ts:dataRoot()`.
- Acceptance: `LIVOS_ROOT` present in server.ts (3); old env array literal = 0; `/opt/livos/data/uploads/` literal in tools.ts = 0; `_DLD_LIVOS_DIR` overridable (1); `pnpm --filter livinityd typecheck` zero new errors; `bash -n` clean; 20/20 tools tests GREEN.

### Task 3 — namespace /tmp markers + allowlist under $XDG_RUNTIME_DIR (R15) — commit `a4265820`
- `tools.ts`: added exported `XDG_RUNTIME_DIR = $XDG_RUNTIME_DIR (non-empty) ?? /run/user/<getuid()??1000>`; `LIVOS_RUNTIME_DIR = ${XDG}/livos`; `ACTIVE_WID_MARKER = ${LIVOS_RUNTIME_DIR}/active-webapp-wid` (was `'/tmp/livos-active-webapp-wid'`); exported `LUSE_TMP_PREFIX = ${XDG}/luse-` replacing the `'/tmp/luse-'` allowlist prefix (+ echoed string + docblocks).
- `tools.ts` marker read: `statSync`→`lstatSync` with an `isFile()` reject (a planted symlink or dir at the path is rejected, not followed), then `openSync(path, O_RDONLY | O_NOFOLLOW)` + `readFileSync(fd)` + `closeSync` in a `finally` — closes the TOCTOU symlink-follow race (T-252-17) the audit flagged.
- `window-manager.ts` `broadcastActiveWid` (the WRITER — DEVIATION, see below): moved the marker write to the SAME `${XDG}/livos/active-webapp-wid` path with a `mkdirSync(runtimeDir, {recursive:true, mode:0o700})` guard before the write, so the cross-process contract stays coherent (both processes run as the same desktop user → identical `/run/user/<uid>`).
- Acceptance: `XDG_RUNTIME_DIR` present in tools.ts (8); `'/tmp/livos-active-webapp-wid'` literal = 0; `'/tmp/luse-'` literal = 0; `O_NOFOLLOW` present (3); `/tmp/livos-active-webapp-wid` in window-manager.ts = 0; typecheck zero new errors; 20/20 tools tests GREEN.

## TDD Gate Compliance
- RED gate: `test(252-06)` commit `e6273de6` (R13 Test 1/2 fail as expected; 18 existing pass).
- GREEN gate: `feat(252-06)` commit `f497e9e1` after RED (20/20 green).
- REFACTOR gate: not needed — the resolver + consumers were minimal and clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / cross-process contract] Moved the active-wid marker WRITER (window-manager.ts), not just the reader**
- **Found during:** Task 3 (R15)
- **Issue:** The active-wid marker is a CROSS-PROCESS contract — WRITTEN by livinityd's `webapps/window-manager.ts` `broadcastActiveWid` (`'/tmp/livos-active-webapp-wid'`) and READ by the luse MCP child in `tools.ts`. The plan's Task 3 `<files>` listed only `tools.ts`. Moving only the reader to `$XDG_RUNTIME_DIR/livos/active-webapp-wid` would have left the writer pointing at the old `/tmp` path — the paths would no longer match, silently breaking the (already-mostly-inert, always-0-under-Phase-102) cross-process lookup AND leaving the world-shared `/tmp` write surface open (defeating the R15 mitigation T-252-17/18 on the write end).
- **Fix:** also moved `broadcastActiveWid` to the SAME `${XDG_RUNTIME_DIR}/livos/active-webapp-wid` path with a `mkdirSync(..., {recursive:true, mode:0o700})` guard before the write. Both processes run as the same desktop user (`bruce` / desktop user), so `$XDG_RUNTIME_DIR` (`/run/user/<uid>`) resolves identically in both — the contract stays coherent and the mitigation now holds on both ends.
- **Files modified:** `livos/packages/livinityd/source/modules/webapps/window-manager.ts`
- **Commit:** `a4265820`

### Out-of-scope discoveries (logged, NOT fixed)
See `deferred-items.md`: (1) the pre-existing ~382-392 livinityd typecheck baseline (unrelated `webapps/`/`widgets/`/`xai-auth/`/`ChildProcess.on` patterns); (2) 3 pre-existing `window-manager.test.ts` failures (Test 16/18/23 — per-WebApp Luse MCP `installServer`/`updateServer` lifecycle) confirmed via git-stash A/B to be unrelated to the R15 marker move (identical failures with my change reverted). Both out of scope per SCOPE BOUNDARY.

## Verification
- **R13:** `?? 'admin'` in server.ts = 0; `"LUSE_USER_ID"` seeded (1); JSON valid (node); R13 Test 1/2 GREEN.
- **R14:** no `'/opt/livos/.env', '/opt/livos/livos/.env'` array literal in server.ts (0); no `/opt/livos/data/uploads/` literal in tools.ts (0); `_DLD_LIVOS_DIR="${_DLD_LIVOS_DIR:-/opt/livos}"` (1); `bash -n` clean.
- **R15:** no `'/tmp/livos-active-webapp-wid'` literal (0) and no `'/tmp/luse-'` literal (0) in tools.ts; `XDG_RUNTIME_DIR` (8) + `O_NOFOLLOW` (3) present; writer literal in window-manager.ts (0).
- **Typecheck:** zero NEW errors — git-stash A/B: baseline-without-my-code-changes = 392, with-changes = 389 (my edits removed two `?? 'admin'`/`?? 'bruce'` env-read lines, net -3). The ~382-392 webapps/widgets/xai-auth/ChildProcess.on baseline is out of scope (SCOPE BOUNDARY, same as 252-01/02/05).
- **Tests:** 20/20 `mcp/tools` tests GREEN (`npm run test:run -- mcp/tools` from the livinityd package — `test` is WATCH mode; `test:run` is non-watch). 3 pre-existing window-manager failures unchanged.
- **Sacred SHA:** `f3538e1d…` preserved — `[sacred-sha] PASS: 20 files verified` on all four code commits (no `sdk-agent-runner.ts` change).

## Notes
- The shared `DEFAULT_LUSE_USER_ID` / `LIVOS_ROOT` / `XDG_RUNTIME_DIR` / `LUSE_TMP_PREFIX` consts deliberately live in `tools.ts` (the dependency LEAF) and are re-exported to `server.ts` (the dependent — it already imports `registerLuseTools` from `./tools.js`). This gives ONE source of truth with NO circular import, satisfying the plan's `key_links` "single shared 'bruce' default const" requirement without a new module.
- `node -e "JSON.parse(...)"` used to validate the seed JSON — python3 is absent on the Windows dev host (same caveat as 252-04/05); the seed-emitter python3 path runs on the Ubuntu 24.04 target during `update.sh`/fresh install.
- NOT YET DEPLOYED to Mini PC — repo-side source + seed + installer changes take effect on the next `update.sh`/fresh install. The runtime-dir marker move is forward-tolerant: under Phase 102 the wid is always 0 / written-empty (display-based scoping superseded WID-based scoping), so even a stale luse instance reading the old `/tmp` path simply falls through to host-display.

## Self-Check: PASSED
- All 6 modified source files + the test file + this SUMMARY + deferred-items.md exist on disk (verified below).
- All 4 task commits exist in git history: `e6273de6` (R13 RED), `f497e9e1` (R13 GREEN), `ddf0c375` (R14), `a4265820` (R15).
