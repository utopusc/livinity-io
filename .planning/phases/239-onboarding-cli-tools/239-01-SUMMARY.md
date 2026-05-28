---
phase: 239-onboarding-cli-tools
plan: 01
subsystem: livinityd
tags: [livinityd, tRPC, security, whitelist, install, cli]
provides:
  - "cli-installer module (whitelist + spawn + detect)"
  - "cliInstaller.install / cliInstaller.detect tRPC adminProcedures"
  - "5 idempotent install shell scripts under scripts/install/cli/"
  - "SUPPORTED_CLIS const + INSTALL_TIMEOUT_MS=300_000 contract (D-239-10 Phase 240)"
requires: []
affects:
  - "livinityd appRouter (cliInstaller namespace mount)"
  - "common.ts httpOnlyPaths (+2 entries for long-running install)"
  - "livinityd boot (production wire-up unconditional)"
tech_stack_added: []
patterns:
  - "factory-DI + empty-injection stub (mirrors createMcpConfigRouter)"
  - "argv-array spawn form (no shell=true, no string interpolation)"
  - "enum-constrained whitelist as RCE boundary"
key_files:
  created:
    - livos/packages/livinityd/source/modules/cli-installer/types.ts
    - livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts
    - livos/packages/livinityd/source/modules/cli-installer/installer.ts
    - livos/packages/livinityd/source/modules/cli-installer/detector.ts
    - livos/packages/livinityd/source/modules/cli-installer/index.ts
    - livos/packages/livinityd/source/modules/cli-installer/__tests__/installer.test.ts
    - livos/packages/livinityd/source/modules/cli-installer/__tests__/detector.test.ts
    - livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts
    - livos/packages/livinityd/source/modules/server/trpc/__tests__/cli-installer-router.test.ts
    - scripts/install/cli/claude-code.sh
    - scripts/install/cli/opencode.sh
    - scripts/install/cli/gemini.sh
    - scripts/install/cli/openclaw.sh
    - scripts/install/cli/aion-cli.sh
  modified:
    - livos/packages/livinityd/source/modules/server/trpc/index.ts
    - livos/packages/livinityd/source/modules/server/trpc/common.ts
    - livos/packages/livinityd/source/index.ts
decisions:
  - "D-239-07 RCE boundary implemented via SUPPORTED_CLIS_SET.has() check BEFORE any spawn — both at module level (installer.ts) and tRPC level (cli-installer-router.ts assertWhitelisted)"
  - "D-239-10 Phase 240 contract: SUPPORTED_CLIS = literal ['claude-code','opencode','gemini','openclaw','aion-cli'] in that fixed order; drift-lock test enforces tuple shape"
  - "argv-form spawn ('bash', [scriptPath]) — never bash -c userString — defense against shell injection"
  - "Aion CLI canonical install command UNVERIFIED (docs.aion.ai / github.com/aion-ai/aion-cli / npmjs.com/@aion-ai/cli all unreachable); shipped best-effort placeholder with WARN line"
metrics:
  duration_minutes: ~12
  tasks_completed: 3
  files_created: 14
  files_modified: 3
  commits: 3
  tests_added: 21
completed_date: 2026-05-27
---

# Phase 239 Plan 01: livinityd cli-installer + 5 install scripts — Summary

Whitelist-gated `cliInstaller.install` / `cliInstaller.detect` tRPC routes plus 5 idempotent shell scripts that Phase 239-02's UI will call and Phase 240 will extend; D-239-07 RCE boundary anchored at SUPPORTED_CLIS_SET single source of truth.

## Files Created/Modified

- **14 created** (5 module sources + 2 module tests + 1 router source + 1 router test + 5 shell scripts)
- **3 modified** (server/trpc/index.ts, common.ts, livinityd/source/index.ts)

## Test Counts

- **installer.test.ts**: 8 vitest cases (whitelist guard x2, spawn+capture x3, drift-lock x2 = INSTALL_TIMEOUT_MS=300_000 + SUPPORTED_CLIS tuple, timeout via fake-timer)
- **detector.test.ts**: 4 vitest cases (whitelist guard, happy path command-v+version probe, exit-1 not-detected, CLI_BIN_NAMES drift-lock + bin-name-not-cli-key)
- **cli-installer-router.test.ts**: 9 vitest cases (BAD_REQUEST guards x3, happy install + logger DI x2, detect happy path, drift-lock procedure list, empty-injection stub PRECONDITION_FAILED, adminProcedure gate)
- **Total: 21 vitest cases, all GREEN, zero tsc errors in cli-installer module**

## Drift-locks

- `SUPPORTED_CLIS` exported as the literal 5-tuple `['claude-code', 'opencode', 'gemini', 'openclaw', 'aion-cli']` in that fixed order (Phase 240 contract D-239-10)
- `INSTALL_TIMEOUT_MS = 300_000` constant
- `CLI_BIN_NAMES` map: `claude-code → claude`, `opencode → opencode`, `gemini → gemini`, `openclaw → openclaw`, `aion-cli → aion`
- Router procedure list = `['detect', 'install']` exactly

## Aion CLI verification outcome

**UNVERIFIED — best-effort placeholder shipped.**

WebFetch attempted three sources at task execution time:

- `https://docs.aion.ai/` — not probed (browser-only flow assumed)
- `https://github.com/aion-ai/aion-cli` — HTTP 404 (repo does not exist at that path)
- `https://www.npmjs.com/package/@aion-ai/cli` — HTTP 403

Script ships with two-step npm install attempt (`@aion-ai/cli` → `aion-cli` fallback) plus a `warn` line:

```
warn "aion-cli: install command is best-effort (canonical source unverified)"
```

Phase 240 expected to supersede `aion-cli.sh` once official packaging is confirmed.

## Sacred SHA Verify

`git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — **PRESERVED** across all 3 commits (pre-commit hook `[sacred-sha] PASS: 20 files verified` on each commit).

## Commits

1. `244b3627` feat(239-01): cli-installer module — whitelist + spawn + detect (TDD)
2. `34bbd861` feat(239-01): cliInstaller tRPC router + appRouter wire-up + httpOnlyPaths (TDD)
3. `fca7330b` feat(239-01): 5 idempotent install scripts under scripts/install/cli/

## Deviations from Plan

None of substance. Plan executed as written. Minor mechanical adjustments:

- Used `(child as unknown as NodeJS.EventEmitter).on(...)` cast wrapper around `child.on('exit')` / `child.on('error')` in installer.ts + detector.ts to satisfy tsc's `ChildProcess` event-method narrowing. Same workaround pattern used elsewhere in the codebase (xai-auth/opencode-spawner). Functionally identical.
- Test files use `as unknown as [string, string[]]` cast on `spawnFn.mock.calls[0]` for the same tsc-narrowing reason; runtime behaviour unchanged.

## Threat Flags

None. Net surface added is fully covered by the plan's `<threat_model>` (T-239-01-01..08); no new endpoints, file accesses, or schema changes beyond what was planned. The 5 install scripts execute upstream installers (curl-pipe-bash / npm install -g) — these are accepted-risk per T-239-01-06 (defense-in-depth = post-install `--version` smoke test).

## Acceptance criteria — all PASS

- `pnpm vitest run source/modules/cli-installer/__tests__ source/modules/server/trpc/__tests__/cli-installer-router.test.ts` → 21/21 pass
- `pnpm tsc --noEmit` (cli-installer module) → zero errors
- `grep -c "SUPPORTED_CLIS" install-scripts.ts` → 4 (≥2 required)
- `grep "INSTALL_TIMEOUT_MS = 300_000" installer.ts` → matches
- `grep "throw new Error" installer.ts` → matches (whitelist guard present)
- `grep "cliInstaller" server/trpc/index.ts` → 4 references (import + opt slot + namespace mount + comment)
- `grep "'cliInstaller.install'" common.ts` → exactly 1
- `grep "'cliInstaller.detect'" common.ts` → exactly 1
- `grep "cliInstallerRouterProductionInstance" livinityd/source/index.ts` → 2 (declaration + appRouter wire-up)
- All 5 install scripts pass `bash -n`, are mode 100755 (executable), and contain Phase 239 provenance markers, set -euo pipefail, idempotency `command -v` guard, and per-CLI install body matching the plan spec.

## Self-Check: PASSED

Verified files exist on disk:
- `livos/packages/livinityd/source/modules/cli-installer/` — 7 files (5 module + 2 tests) FOUND
- `livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts` FOUND
- `livos/packages/livinityd/source/modules/server/trpc/__tests__/cli-installer-router.test.ts` FOUND
- `scripts/install/cli/{claude-code,opencode,gemini,openclaw,aion-cli}.sh` — 5/5 FOUND (mode 100755)

Verified commits exist in `git log`:
- `244b3627` FOUND
- `34bbd861` FOUND
- `fca7330b` FOUND

Phase 240 unblocked: SUPPORTED_CLIS const importable from `livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts` exactly as Phase 240 expects per D-239-10.
