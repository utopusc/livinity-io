---
phase: 252-fresh-install-portability-remediation
plan: 02
subsystem: terminal
tags: [pty, terminal, sudo, redis, desktop-user, feature-flag, install, vitest, tdd]

# Dependency graph
requires:
  - phase: 251-fresh-install-portability-audit
    provides: REMEDIATION-BACKLOG R4 (three-layer bruce pin) + R8 (self-sudo no sudoers grant) + R10 (terminal_panel flag never seeded)
  - phase: 252-fresh-install-portability-remediation
    plan: 01
    provides: Wave-1 install blockers closed (apt + fail-closed display create)
provides:
  - Sudo-less direct `bash --login` PTY spawn (R8 — no self-sudo, no sudoers grant)
  - Root-only PTY guard (rejects root/uid-0 ONLY; any non-root desktop user allowed)
  - PtySpawnOptions.username widened from literal 'bruce' to string (R4)
  - Runtime desktop-user resolution from Redis livos:desktop:user with 'bruce' fallback (R4)
  - Install-time seed of livos:v43:terminal_panel=true (R10)
affects: [252-fresh-install-portability-remediation (later waves), terminal dock entry visibility, fresh-VPS install on non-bruce desktop user]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PTY inherits livos.service's own uid (already the desktop user) instead of self-sudo --user — removes a privilege seam rather than adding one"
    - "Async-scope Redis resolution (desktopUser) hoisted out of the synchronous ws.on('message') init branch — mirrors the existing userId resolve-or-fallback idiom"
    - "Install-time Redis seed fn mirrors _dld_seed_platform_api_key redis_pass extraction (REDIS_URL grep + sed default:pass capture)"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/pty-sessions/session.ts
    - livos/packages/livinityd/source/modules/pty-sessions/types.ts
    - livos/packages/livinityd/source/modules/pty-sessions/ws-handler.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/session.test.ts
    - livos/packages/livinityd/source/modules/pty-sessions/__tests__/ws-handler.test.ts
    - scripts/install/deploy-livinityd.sh

key-decisions:
  - "TDD Task 1 committed test+impl together (RED→GREEN in one commit) — the username-string type widening in types.ts is referenced by both the new tests and the guard, so a tests-only RED commit would not type-check in isolation (same entanglement pattern documented in 252-01)"
  - "desktopUser resolved in the async handler scope alongside userId (NOT inside the synchronous ws.on('message') init branch) — the message callback cannot await; the existing userId resolution already establishes this hoist pattern"
  - "MinimalRedis.get accessed via inline cast `(deps.redis as {get?:...}).get?.(...)` rather than widening the MinimalRedis interface — less invasive, ioredis satisfies it structurally, no risk to other call sites"
  - "env-seed.sh left untouched (listed in plan <files> but the action confirms it has no Redis access) — seed belongs in deploy-livinityd.sh where redis_pass is extracted"
  - "Typecheck gate is zero-NEW-errors (389==389) per the 252-01 SCOPE BOUNDARY baseline, not a literally-clean tree"

patterns-established:
  - "Sudo-less PTY: rely on the service's own uid; guard only blocks root/uid-0"
  - "Runtime identity resolution from livos:desktop:user mirrors server/index.ts:1774 Chrome analog"

requirements-completed: [R4, R8, R10]

# Metrics
duration: ~25min
completed: 2026-05-29
---

# Phase 252 Plan 02: Wave-2 Terminal Portability (sudo-less PTY + runtime user + flag seed) Summary

**The UI terminal now spawns `bash --login` directly as livos.service's own (runtime-resolved, non-root) desktop user — no self-`sudo`, no sudoers grant, no hardcoded `'bruce'` — and a fresh install seeds `livos:v43:terminal_panel=true` so the dock terminal entry shows and the WS does not 4403 on a clean box.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 (Task 1 TDD)
- **Files modified:** 6

## Accomplishments
- **R8** — Dropped the self-`sudo` in `session.ts`. The PTY previously spawned `sudo --user bruce --login bash -c MOTD`, which prompts for a password (no sudoers grant) and dies on a fresh box. It now spawns `bash --login -c MOTD` directly; livos.service already runs as the desktop user so the shell inherits the correct uid. No sudoers grant needed — the existing `scripts/install/sudoers.d/livinityd` is left untouched (correct — R8(b) removes the seam entirely).
- **R4** — Widened `PtySpawnOptions.username` from the literal `'bruce'` to `string`; relaxed the runtime guard from `!== 'bruce'` to reject ONLY `'root'`/`'0'` (D-243-NO-ROOT preserved); and added a runtime Redis lookup in the ws-handler that resolves the spawn user from `livos:desktop:user` (mirroring the `server/index.ts:1774` Chrome analog) with a fail-soft `'bruce'` fallback. A non-bruce desktop box now gets a working terminal.
- **R10** — `deploy-livinityd.sh` defines + invokes `_dld_seed_terminal_panel_flag`, which `SET`s `livos:v43:terminal_panel=true` on a fresh install (idempotent, fail-soft, mirrors `_dld_seed_platform_api_key`). The dock terminal entry + WS Gate-2 no longer require a manual `redis-cli SET`.
- 78/78 pty-sessions vitest cases green (new: root-only guard ×4, sudo-less bash-spawn shape ×1, desktop-user resolve ×2, desktop-user fallback covered).

## Task Commits

1. **Task 1: sudo-less bash PTY spawn + runtime desktop-user resolve (R8, R4)** — `af39490f` (feat — TDD test+impl in one commit)
2. **Task 2: seed livos:v43:terminal_panel=true at install (R10)** — `f5b0554b` (feat)

**Plan metadata:** _this commit_ (docs: complete plan)

## Files Created/Modified
- `session.ts` — `start()` now guards root/uid-0 only and spawns `ptyFactory('bash', ['--login','-c',MOTD], ...)`; header doc updated to the root-only guard + sudo-less rationale.
- `types.ts` — `PtySpawnOptions.username: 'bruce'` → `string`; doc comments updated.
- `ws-handler.ts` — new `desktopUser` resolution (Redis `livos:desktop:user`, fail-soft `'bruce'`) hoisted to async handler scope after the `userId` block; `spawnOpts.username: 'bruce'` → `username: desktopUser`.
- `__tests__/session.test.ts` — rewrote guard tests (root/'0' throw; bruce/alice do not) + sudo-less bash-spawn shape test (`'bash'`, `['--login','-c',MOTD]`, NO `--user`, NOT `'sudo'`); type-proof drift-lock now uses `'alice'` to assert `string`.
- `__tests__/ws-handler.test.ts` — `BuildOpts.desktopUser` + redis.get mock keyed on `livos:desktop:user`; tests 4b (resolve → `alice`) + 4c (unset → `bruce`).
- `scripts/install/deploy-livinityd.sh` — `_dld_seed_terminal_panel_flag` fn (before `_dld_seed_platform_api_key`) + invocation after `_dld_seed_mcp_servers`.

## Decisions Made
- **TDD single-commit (Task 1):** test + impl committed together because the `username: string` widening is referenced by both the tests and the guard — a tests-only RED commit would not type-check. RED was verified in-session first (4 failures against the old `!== 'bruce'` guard + `'sudo'` spawn), then GREEN (78/78). See TDD Gate Compliance.
- **desktopUser hoisted to async scope:** the `init` branch runs inside a synchronous `ws.on('message')` callback that cannot `await`, so the Redis lookup is done once in the async handler scope alongside the existing `userId` resolution — the established resolve-or-fallback pattern.
- **MinimalRedis.get via inline cast** rather than interface widening — ioredis satisfies it structurally; avoids touching the shared `MinimalRedis` shape used at other call sites.
- **Typecheck gate = zero NEW errors** (389 == 389 baseline from 252-01), not a clean tree (out-of-scope pre-existing errors).

## Deviations from Plan

None of the Rule 1-4 deviation classes were triggered. Two execution-mechanics notes:

1. **Comment-text `grep -c -- '--user'` artifact (resolved, not a code deviation):** the first draft of the `session.ts` doc comments contained the literal token `--user` (documenting its *absence*), which made the acceptance grep `grep -c -- '--user' session.ts` return 2 instead of 0. The argv contained no `--user` element — only the prose did. Reworded the two comments ("no user-switch flag" / "do NOT re-switch users") so the grep is literally 0 as the criterion specifies. No behavioral change.
2. **Line-number drift in deploy-livinityd.sh:** the plan referenced the invocation site at `:1999` and the seed-fn neighbour at `:1430`; the live file has grown, so the actual sites are ~`:2040` (`_dld_seed_mcp_servers`) and ~`:1410` (`_dld_seed_platform_api_key`). Placed the fn + invocation relative to those anchors as the plan intended.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None. All acceptance greps pass; `bash -n` clean; 78/78 tests green; zero NEW typecheck errors.

## TDD Gate Compliance

Task 1 is `tdd="true"`. RED was established and verified in-session — the rewritten guard + spawn-shape tests failed against the pre-existing `!== 'bruce'` guard and `'sudo'` spawn (4 failing assertions captured). Tests and implementation were then committed together in `af39490f` rather than as separate RED/GREEN commits, because the `PtySpawnOptions.username: string` type widening is referenced by both the test assertions (`username:'alice'` typechecks) and the runtime guard — a tests-only RED commit would not type-check in isolation. This single-commit entanglement is the same pattern documented in the 252-01 SUMMARY and is noted here for traceability. GREEN verified: 78/78 pty-sessions tests pass.

## Threat Surface Scan

No new security-relevant surface beyond the plan's `<threat_model>`. The change set strictly *removes* a privilege seam (T-252-04: dropping `sudo --user` means the PTY can no longer switch to a different user; it inherits the service uid) and *tightens* identity (T-252-05: root/uid-0 still hard-rejected by the guard even if `livos:desktop:user` were tampered, per T-252-06 accept). R10 only flips a flag the operator would otherwise set by hand — same exposure, no new path (T-252-07).

## Issues Encountered
- Per the 252-01 note, `pnpm --filter livinityd test` runs vitest in watch mode (never exits). Used `npm run test:run -- pty-sessions` (run mode) directly in the package, which exits cleanly.

## User Setup Required
None. The flag seed runs automatically on the next fresh install / `update.sh` (`_dld_seed_terminal_panel_flag`). On an already-installed Mini PC the flag may already be set by hand; the SET is idempotent.

## Next Phase Readiness
- R4/R8/R10 closed at the repo layer. Not yet deployed to Mini PC — these are repo-side source + installer changes; they take effect on the next `update.sh`/fresh install. Sacred blob `f3538e1d…` preserved (sacred-sha PASS on both task commits).
- Remaining Phase-252 waves (later R-items from the 251 backlog: get.livinity.io mapping, Path-B CHANGEME secrets, systemd EnvironmentFile, identity hardcodes, etc.) are independent and unblocked.

## Self-Check: PASSED

All 6 modified files verified present on disk; both task commits (`af39490f`, `f5b0554b`) verified in git log; all acceptance greps + `bash -n` + 78/78 tests confirmed.

---
*Phase: 252-fresh-install-portability-remediation*
*Completed: 2026-05-29*
