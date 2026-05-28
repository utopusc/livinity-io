---
phase: 240-local-agents-install-from-ui
plan: 01
subsystem: livinityd
tags: [livinityd, tRPC, security, whitelist, auth, audit-log, redis, cli]
provides:
  - "cliInstaller.auth adminProcedure (3rd member of cliInstaller.* namespace)"
  - "authCli({name}) spawn wrapper with Redis status keys + audit log"
  - "device_audit_log writes for BOTH cliInstaller.install and cliInstaller.auth"
  - "Redis status keys liv:cli:auth:<name> = running|ok|failed (EX 3600)"
  - "AUTH_TIMEOUT_MS=300_000 + CLI_AUTH_COMMANDS drift-lock contract"
requires:
  - "Phase 239-01 cli-installer module (installer.ts, install-scripts.ts, types.ts)"
  - "Phase 239-01 cliInstaller tRPC router shape (factory-DI + assertWhitelisted)"
  - "Phase 15 device_audit_log PG table + audit_log_immutable trigger"
affects:
  - "common.ts httpOnlyPaths (+1 entry: cliInstaller.auth)"
  - "livinityd boot wire-up — authFn wrapper + auditLogFactory closure"
  - "installer.ts — additive optional auditLog dep slot (Phase 239 behaviour unchanged)"
tech_stack_added: []
patterns:
  - "factory-DI authFn slot mirrors installFn/detectFn (Phase 239 pattern)"
  - "auditLogFactory(ctx) closure — per-call DI seam, ctx.currentUser.id threading"
  - "Redis-aware authFn wrapper at boot (router stays Redis-free for testability)"
  - "argv-array spawn (no shell=true, no string interpolation) — D-239-07 RCE boundary"
  - "aion-cli short-circuit to AUTH_UNSUPPORTED (no spawn) — explicit unsupported"
key_files:
  created:
    - livos/packages/livinityd/source/modules/cli-installer/auth.ts
    - livos/packages/livinityd/source/modules/cli-installer/__tests__/auth.test.ts
    - .planning/phases/240-local-agents-install-from-ui/240-01-SUMMARY.md
  modified:
    - livos/packages/livinityd/source/modules/cli-installer/index.ts
    - livos/packages/livinityd/source/modules/cli-installer/installer.ts
    - livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts
    - livos/packages/livinityd/source/modules/server/trpc/__tests__/cli-installer-router.test.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/index.ts
decisions:
  - "D-240-01-01: authCli rejected from being default fallback in router — router has no Redis client (cleaner separation). defaultAuthFn throws PRECONDITION_FAILED; livinityd boot wires the real authFn wrapper that closes over this.ai.redis."
  - "D-240-01-02: aion-cli explicitly UNSUPPORTED — short-circuits to AUTH_UNSUPPORTED without spawning. Phase 239 verification found canonical sources unreachable; supersedable when Phase 240+ confirms an upstream auth idiom."
  - "D-240-01-03: Drift-lock declaration order = [detect, install, auth] (NOT alphabetical). Matches workflow order: UI detects first, install second, auth third."
  - "D-240-01-04: audit-log hook is ADDITIVE on installer.ts — optional auditLog dep slot. Phase 239 callers / tests without audit see unchanged behaviour. Hook fires AFTER the spawn promise resolves so the audit row carries the final exitCode."
  - "D-240-01-05: device_audit_log writes are FIRE-AND-FORGET — try/catch around INSERT, warn-log on failure, never reflected to user-visible install/auth response. Defense-in-depth: audit observability MUST NEVER block the functional path."
  - "D-240-01-06: AUTH_TIMEOUT_MS = 300_000 (drift-locked, matches INSTALL_TIMEOUT_MS magnitude). Auth flows can include a one-time browser device-code paste that takes minutes."
metrics:
  duration_minutes: ~14
  tasks_completed: 3
  files_created: 2
  files_modified: 6
  commits: 5
  tests_added: 22  # 14 new auth.test.ts + 8 new router test cases
completed_date: 2026-05-28
---

# Phase 240 Plan 01: livinityd cliInstaller.auth tRPC + Redis status + audit log — Summary

Extended the Phase 239 `cliInstaller.*` tRPC namespace with a third adminProcedure (`auth`) that spawns the per-CLI canonical login command, writes Redis status keys (`liv:cli:auth:<name>`), and threads device_audit_log rows for both install and auth attempts — all without breaking the Phase 239 contract.

## Files Created/Modified

- **2 created**: `auth.ts` (spawn wrapper) + `auth.test.ts` (14 cases)
- **6 modified**:
  - `cli-installer/index.ts` (barrel re-exports)
  - `cli-installer/installer.ts` (additive optional auditLog dep slot)
  - `server/trpc/cli-installer-router.ts` (.auth procedure + authFn + auditLogFactory DI)
  - `server/trpc/__tests__/cli-installer-router.test.ts` (+8 cases)
  - `server/trpc/common.ts` (+1 httpOnlyPaths entry)
  - `livinityd/source/index.ts` (boot wire-up)

## Test Counts

- **auth.test.ts**: 14 vitest cases — whitelist guard, aion-cli short-circuit, spawn happy path, OUTPUT_CAP_BYTES tail-truncation, AUTH_TIMEOUT_MS + SIGKILL, ENOENT, Redis SET probes (running/ok/failed), auditLog DI required + optional paths, redisStatusKey echo, drift-lock constants
- **cli-installer-router.test.ts**: 9 existing (Phase 239) + 8 new (T10-T17 covering .auth procedure + auditLogFactory hook + adminProcedure gate) = 17 total
- **Aggregate cli-installer suite**: **43/43 GREEN** (8 installer + 14 auth + 4 detector + 17 router)
- **0 tsc errors** on touched files

## Drift-locks Pinned

- `AUTH_TIMEOUT_MS === 300_000` (Test 13)
- `CLI_AUTH_COMMANDS` has exactly 5 keys matching SUPPORTED_CLIS tuple, aion-cli=null (Test 14)
- Router procedure declaration order = `['detect', 'install', 'auth']` (Test T14)
- `httpOnlyPaths` contains literal `'cliInstaller.auth'` exactly once

## Per-CLI Auth Argv Contract (CLI_AUTH_COMMANDS)

| CLI | argv[0] (bin) | argv[1..] (args) |
|-----|---------------|------------------|
| claude-code | `claude` | `['code', 'login']` |
| opencode | `opencode` | `['auth', 'login']` |
| gemini | `gemini` | `['auth', 'login']` |
| openclaw | `openclaw` | `['auth', 'login']` |
| aion-cli | `null` (short-circuits to AUTH_UNSUPPORTED) |

## Sacred SHA Verify

`git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — **PRESERVED** across all 5 commits (pre-commit hook `[sacred-sha] PASS: 20 files verified` each commit).

## Commits

1. `87d36c1a` — test(240-01): add failing tests for cliInstaller authCli spawn wrapper (TDD RED)
2. `363ae38d` — feat(240-01): implement cliInstaller authCli — Redis status keys + audit log (TDD GREEN)
3. `16855944` — test(240-01): add failing tests for cliInstaller.auth tRPC procedure (TDD RED)
4. `74e18f7b` — feat(240-01): extend cliInstaller tRPC with auth procedure + audit-log hook (TDD GREEN)
5. `a6b95d1f` — feat(240-01): wire cliInstaller.auth into httpOnlyPaths + livinityd boot + audit-log writer

## Deviations from Plan

Minor mechanical adjustments — plan executed substantially as written.

**1. [Rule 1 - Fix] Default authFn fallback rather than authCli direct**
- **Found during:** Task 2 (tsc check after router GREEN attempt)
- **Issue:** `const auth = deps.authFn ?? authCli` failed tsc — router's authFn signature uses `{logger, auditLog?}` deps (no redis), while real `authCli` requires `redis` in its AuthCliDeps. Direct fallback assignment was a type error.
- **Fix:** Introduced `defaultAuthFn` const in `cli-installer-router.ts` that throws PRECONDITION_FAILED. The production wrapper in livinityd/source/index.ts closes over `this.ai.redis` and supplies it before calling `authCli`. Router stays Redis-free (testability win).
- **Files modified:** `cli-installer-router.ts`
- **Commit:** `74e18f7b` (part of the GREEN commit)

**2. [Rule 2 - Critical functionality] Best-effort audit row on AUTH_UNSUPPORTED short-circuit**
- **Found during:** Task 1 implementation
- **Issue:** Plan spec only required audit on completion; but the aion-cli short-circuit path produces an operator-visible decision (refused-by-config) that SHOULD be auditable. Without it, operators clicking Auth on aion-cli would see "AUTH_UNSUPPORTED" but no audit trail.
- **Fix:** Added best-effort audit row write inside the AUTH_UNSUPPORTED short-circuit branch with `error='AUTH_UNSUPPORTED'`. Wrapped in try/catch (defense-in-depth: same warn-only failure mode as the main path).
- **Files modified:** `auth.ts`
- **Commit:** `363ae38d`

## Threat Surface Scan

No new threat surface beyond the plan's `<threat_model>` (T-240-01-01..08):
- New endpoint (cliInstaller.auth) is gated by adminProcedure + assertWhitelisted (T-240-01-01 + T-240-01-02 mitigated as planned).
- Output cap (32KB tail) prevents info disclosure (T-240-01-03 mitigated).
- Audit rows are append-only via existing trigger (T-240-01-05 mitigated).
- params_digest is tamper-evidence only (T-240-01-06 accepted per plan).
- Redis TTL 3600s is observability-only (T-240-01-07 accepted per plan).

## Authentication Gates

None encountered. Pure code execution; vitest + tsc all run locally.

## Acceptance criteria — all PASS

- `pnpm vitest run source/modules/cli-installer source/modules/server/trpc/__tests__/cli-installer-router.test.ts` → 43/43 GREEN
- `npx tsc --noEmit` (cli-installer + router + livinityd index.ts) → 0 errors
- `grep -c "'cliInstaller.auth'" common.ts` → exactly 1
- `grep -c "authCli\|auditLogFactory" livinityd/source/index.ts` → 6 (import + authFn wrapper + auditLogFactory key + factory body + log line + ...)
- `grep -c "device_audit_log" livinityd/source/index.ts` → 4
- 5 commits in git log (2 TDD pairs + 1 wire-up)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved (pre-commit hook PASS each commit)
- TDD gate compliance: 2× (`test(240-01)` RED → `feat(240-01)` GREEN) pairs visible in `git log`

## Phase 240 Continuation Notes

Plan 240-02 consumes the `cliInstaller.auth` tRPC contract:

```typescript
// From AionUi React tree:
const result = await trpc.cliInstaller.auth.mutate({name: 'claude-code'})
// result: {ok, output, exitCode, durationMs, redisStatusKey}
// UI may poll redisStatusKey for live status — value cycles
// 'running' → 'ok' | 'failed' (TTL 3600s).
```

The boot wire-up logs `Phase 239-01 + 240-01 — cliInstaller.* tRPC router wired ...` once at livinityd startup, confirming the production injection ran. Plan 240-03 deploys this to Mini PC together with the 240-02 UI vendor-patch.

## Self-Check: PASSED

Verified files exist on disk:
- `livos/packages/livinityd/source/modules/cli-installer/auth.ts` — FOUND
- `livos/packages/livinityd/source/modules/cli-installer/__tests__/auth.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/cli-installer/index.ts` (modified) — FOUND
- `livos/packages/livinityd/source/modules/cli-installer/installer.ts` (modified) — FOUND
- `livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts` (modified) — FOUND
- `livos/packages/livinityd/source/modules/server/trpc/__tests__/cli-installer-router.test.ts` (modified) — FOUND
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` (modified) — FOUND
- `livos/packages/livinityd/source/index.ts` (modified) — FOUND

Verified commits exist in `git log`:
- `87d36c1a` (RED Task 1) — FOUND
- `363ae38d` (GREEN Task 1) — FOUND
- `16855944` (RED Task 2) — FOUND
- `74e18f7b` (GREEN Task 2) — FOUND
- `a6b95d1f` (wire-up Task 3) — FOUND

Phase 240-02 unblocked: `cliInstaller.auth` reachable as adminProcedure tRPC mutation via HTTP (httpOnlyPaths entry confirmed).
