---
phase: 268-interactive-cli-auth-paste-back-device-login-cli-uninstall
plan: 02
subsystem: api
tags: [cli-installer, uninstall, npm-global, pip, rm-bin, child-process, fs, tdd, vitest, livinityd]

# Dependency graph
requires:
  - phase: 267-ui-cli-install-auth-no-terminal
    provides: "SUPPORTED_CLIS whitelist (D-239-07) + SUPPORTED_CLIS_SET + the api-key-writer WRITE_TARGETS per-CLI secret-path map + the installer.ts never-throw spawn skeleton (32KB cap, 5-min SIGKILL) + the auth.ts authEnv PATH-prepend"
  - phase: 268-interactive-cli-auth-paste-back-device-login-cli-uninstall (plan 01)
    provides: "the cli-installer barrel surface this plan extends"
provides:
  - "CLI_UNINSTALL — a drift-locked static map (20 keys, one per SUPPORTED_CLIS) classifying every CLI by uninstall method: npm-global | rm-bin | pip | rm-paths | none"
  - "uninstallCli({name}, deps) — whitelist-guarded-FIRST (D-239-07) uninstall that dispatches on CLI_UNINSTALL[name].kind, removes the CLI per its STATIC install method, and deletes the 267 api-key file + config dirs; never throws on subprocess failure"
  - "snow-cli Snowflake-collision guard (E-5): only the static known ~/.local/bin/snow, ~/.npm-global/bin/snow, ~/.livos-cli/snow-cli paths are removed — NEVER `command -v snow`-and-delete"
  - "aion-cli {kind:'none'} refusal — uninstallCli no-ops it ({ok:false, skipped:true}), mirroring auth's aion-cli short-circuit"
  - "api-key-writer.ts EXPORTS WRITE_TARGETS + WriteTarget so the 267 secret relPaths are reusable for deletion"
  - "barrel re-exports: uninstallCli, CLI_UNINSTALL, UNINSTALL_TIMEOUT_MS, WRITE_TARGETS, type UninstallSpec/UninstallCliDeps/UninstallResult/WriteTarget"
affects: [268-03-router-transport-agent-refresh, cli-installer-router, cli-auth-dialog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static drift-locked per-CLI dispatch map (CLI_UNINSTALL mirrors CLI_AUTH_METHODS): Object.keys().length === SUPPORTED_CLIS.length eager assertion at module load"
    - "Whitelist-guard-FIRST idiom extended to uninstallCli (SUPPORTED_CLIS_SET.has is the first statement; pkg/paths are static-map-derived, never from a request string beyond the enum-gated name)"
    - "Static-known-paths-only removal (no `command -v`/`which` then rm) — defends the snow/Snowflake-CLI bin-name collision (E-5)"
    - "Never-throw spawn skeleton (5-min SIGKILL timeout + 32KB joinTail cap) copied from installer.ts for the npm/pip kinds"
    - "Reuse the 267 WRITE_TARGETS relPath map to delete each CLI's 0600 secret on uninstall (best-effort, swallow) — logs only name + static paths, never the secret"

key-files:
  created:
    - "livos/packages/livinityd/source/modules/cli-installer/cli-uninstall.ts — CLI_UNINSTALL map + UninstallSpec union + uninstallCli + drift-lock + runSpawnUninstall skeleton"
    - "livos/packages/livinityd/source/modules/cli-installer/__tests__/cli-uninstall.test.ts — 12 tests: drift-lock, whitelist guard, npm-global exact argv, rm-bin bin+config+secret, pip argv, snow-cli static-paths-only, openclaw absolute shim, aion-cli no-op, never-throw non-zero exit"
  modified:
    - "livos/packages/livinityd/source/modules/cli-installer/api-key-writer.ts — export WRITE_TARGETS + WriteTarget (one-word change, no logic change)"
    - "livos/packages/livinityd/source/modules/cli-installer/index.ts — barrel re-export of the uninstall surface + WRITE_TARGETS/WriteTarget"

key-decisions:
  - "CLI_UNINSTALL infers the uninstall method from a static map (the installer persists NO method record) — drift-locked to SUPPORTED_CLIS.length so a new CLI can never enter the whitelist without an explicit uninstall classification"
  - "rm-bin / rm-paths use fs.rm on STATIC map paths ONLY — never `command -v`-and-delete (E-5 snow/Snowflake collision); absolute paths (openclaw /opt/livos/bin/openclaw pnpm-shim) used as-is, relative paths joined under home"
  - "aion-cli is {kind:'none'} → refused/no-op (embedded AionUi backend; removing the standalone bin would not drop the agent and risks breaking Liv AI)"
  - "All non-none kinds ALSO delete the 267 api-key file (WRITE_TARGETS relPath) + config dirs, best-effort — so a re-install isn't silently pre-authed with a stale secret; the secret CONTENTS are never read or logged"
  - "npm/pip spawn never throws on subprocess failure — resolves a structured {ok:false} so the plan-03 tRPC layer renders the error; only the whitelist guard throws"
  - "pip front-end is the deterministic argv-array `pip3 uninstall -y <pkg>` (no shell, canonical front-end) — matches the static-argv RCE-boundary discipline"

patterns-established:
  - "Per-install-method uninstall dispatch: the pure backend module 268-03 wires to a cliInstaller.uninstall adminProcedure + scheduleAgentRefresh"

requirements-completed:
  - CLI uninstall backend (per install method)
  - removed agent disappears from /api/agents

# Metrics
duration: 4 min
completed: 2026-06-14
---

# Phase 268 Plan 02: Per-install-method CLI uninstall Summary

**A drift-locked static `CLI_UNINSTALL` map (20 keys) + a whitelist-guarded-FIRST `uninstallCli({name})` that removes each locally-installed CLI per its STATIC install method (npm-global / rm-bin / pip / rm-paths / none), deletes the 267 api-key file + config dirs, refuses aion-cli, and only ever rm's the known snow paths (never `command -v snow` — Snowflake collision).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-14T03:50:19Z
- **Completed:** 2026-06-14T03:54:01Z
- **Tasks:** 1 (TDD: RED → GREEN, no REFACTOR needed)
- **Files created:** 2 | **Files modified:** 2

## Accomplishments

- **`CLI_UNINSTALL` map** — a `Readonly<Record<CliName, UninstallSpec>>` classifying all 20 SUPPORTED_CLIS by uninstall method, sourced verbatim from 268-RESEARCH §C:
  - **npm-global** (`npm uninstall -g --prefix ~/.npm-global <pkg>`): gemini, codex, qwen-code, augment, github-copilot, codebuddy, qoder-cli.
  - **rm-bin** (`fs.rm` the curl-installed bin path + config dir): claude-code, opencode, goose, factory-droid, cursor-agent, kimi-cli (two bins), mistral-vibe, hermes-agent, kiro.
  - **pip** (`pip3 uninstall -y <pkg>`): nanobot (`nanobot-ai`).
  - **rm-paths** (build-from-source / pnpm-shim static paths): snow-cli (3 paths), openclaw (absolute `/opt/livos/bin/openclaw`).
  - **none**: aion-cli (refused — AionUi embedded backend).
- **Drift-lock** — `Object.keys(CLI_UNINSTALL).length === SUPPORTED_CLIS.length` eager assertion (copied verbatim from auth-methods.ts) throws at module load if a CLI is added without an uninstall classification.
- **`uninstallCli({name}, deps)`** — `SUPPORTED_CLIS_SET.has(input.name)` is the FIRST statement (D-239-07 RCE boundary); dispatches on the static `CLI_UNINSTALL[name].kind`; the pkg name + rm paths come ONLY from the static map (+ static WRITE_TARGETS relPaths), never from a request string. npm/pip use an argv-array spawn (no shell) with the never-throw 5-min-SIGKILL / 32KB skeleton copied from installer.ts; rm-bin/rm-paths use `fs.rm` on static paths only.
- **267 secret + config-dir cleanup** — every non-none kind deletes the WRITE_TARGETS `.env`/`.json`/`.yaml` secret file + the CLI's config dir(s), best-effort (swallowed), so a re-install isn't silently pre-authed with a stale key. The secret CONTENTS are never read or logged — only name + static paths.
- **api-key-writer.ts** — `WRITE_TARGETS` + `WriteTarget` are now `export`ed (one-word change, no logic change) so cli-uninstall.ts imports the secret relPaths.
- **Barrel** (`index.ts`) re-exports `uninstallCli`, `CLI_UNINSTALL`, `UNINSTALL_TIMEOUT_MS`, `WRITE_TARGETS`, and the `UninstallSpec`/`UninstallCliDeps`/`UninstallResult`/`WriteTarget` types.

## Task Commits

Atomic TDD commits (test → feat):

1. **Task 1 RED: failing cli-uninstall tests** — `1d2ef43a` (test)
2. **Task 1 GREEN: CLI_UNINSTALL map + uninstallCli + WRITE_TARGETS export + barrel** — `c7f46b57` (feat)

**Plan metadata:** docs commit (this SUMMARY + STATE.md + ROADMAP.md, force-staged — `.planning/` is gitignored).

## TDD Gate Compliance

The single TDD task satisfies the RED → GREEN sequence (verified in git log):

| Task | RED (`test(268-02)`) | GREEN (`feat(268-02)`) | REFACTOR | Status |
|------|----------------------|------------------------|----------|--------|
| 1    | `1d2ef43a` ✓         | `c7f46b57` ✓           | — (none) | Pass   |

RED was proven to fail for the right reason before GREEN: `Failed to load url ../cli-uninstall.js (Does the file exist?)` — the not-yet-created module. No REFACTOR was needed (the GREEN implementation mirrors installer.ts/auth.ts proven skeletons and is clean).

## Files Created/Modified

- `livos/packages/livinityd/source/modules/cli-installer/cli-uninstall.ts` — NEW. `UninstallSpec` union; `CLI_UNINSTALL` map (20 keys); drift-lock; `UNINSTALL_TIMEOUT_MS`; `runSpawnUninstall` (the never-throw skeleton); `resolveUninstallPath` (absolute-vs-home); `uninstallCli`.
- `livos/packages/livinityd/source/modules/cli-installer/__tests__/cli-uninstall.test.ts` — NEW. 12 tests across drift-lock, whitelist guard (+RCE-shaped name), npm-global exact argv, rm-bin (bin+config+secret), pip argv, snow-cli static-paths-only + no-`command -v`, openclaw absolute shim, aion-cli `{ok:false, skipped:true}`, never-throw non-zero exit, logger-observability, deps-default construction.
- `livos/packages/livinityd/source/modules/cli-installer/api-key-writer.ts` — `WRITE_TARGETS` + `WriteTarget` now exported (doc comment added explaining the 268-02 reuse). No logic change.
- `livos/packages/livinityd/source/modules/cli-installer/index.ts` — barrel re-exports the uninstall surface + `WRITE_TARGETS`/`WriteTarget`.

## Decisions Made

- **Infer-don't-store uninstall method.** The installer persists no per-CLI install-method record, but the method is statically known (each `scripts/install/cli/<name>.sh` is fixed), so `CLI_UNINSTALL` is a static drift-locked map mirroring `CLI_AUTH_METHODS` — the eager assertion keeps it honest.
- **Static-known-paths-only removal (E-5).** rm-bin/rm-paths `fs.rm` only the exact paths in the map — never `command -v <bin>` then rm. This is the snow-cli Snowflake-collision guard: only `~/.local/bin/snow`, `~/.npm-global/bin/snow`, `~/.livos-cli/snow-cli` are removed; a system `snow` (Snowflake CLI) is structurally unreachable.
- **aion-cli refused.** `{kind:'none'}` → `{ok:false, skipped:true}` no-op — removing the standalone bin would not drop the embedded-backend agent and risks Liv AI (T-268-08).
- **Delete the 267 secret + config dirs on every non-none kind.** Reuse `WRITE_TARGETS[name].relPath` so a re-install isn't pre-authed with a stale key; best-effort (swallowed); secret contents never read/logged (T-268-09).
- **Never-throw on subprocess failure.** npm/pip resolve a structured `{ok:false}` (only the whitelist guard throws) so the plan-03 tRPC layer renders the error (T-268-10 5-min SIGKILL + 32KB cap).

## Deviations from Plan

None - plan executed exactly as written.

The plan's `<verify>` filter (`pnpm --filter @livos/livinityd`) is a known doc discrepancy carried over from 268-01: the package's real name is `livinityd` (no `@livos/` scope), so the suite was run via `pnpm --filter livinityd exec vitest run cli-uninstall`. This is a documentation note, not a code deviation — the tests run identically under the correct filter.

**Total deviations:** 0.
**Impact on plan:** None — the module, the WRITE_TARGETS export, the barrel, and the test suite all match the plan's `<action>` exactly.

## Issues Encountered

None. RED failed for the expected reason (missing module), GREEN passed on the first run, the full cli-installer suite stayed green, and the tsc delta is zero.

## Verification Results

- `cli-uninstall.test.ts` — **12/12 green**.
- **Full cli-installer suite — 118/118 green** (auth-methods 14, installer 8, detector 4, cli-uninstall 12, api-key-writer 7, agent-refresh 6, auth 31, cli-installer-router 36) — NO 267/268-01 regression; the `api-key-writer.ts` export change did not break `api-key-writer.test.ts` (still 7/7).
- `npx tsc --noEmit` in livinityd — **320 total errors = the documented baseline, ZERO delta**; grep confirms NO error references `cli-uninstall.ts` / `api-key-writer.ts` / `cli-installer/index.ts`.
- Greps: `export const WRITE_TARGETS` present in `api-key-writer.ts`; `SUPPORTED_CLIS_SET.has(input.name)` is the first executable statement of `uninstallCli`; no EXECUTABLE `command -v`/`which` in `cli-uninstall.ts` (the only matches are E-5 explanatory comments); `uninstallCli` re-exported from `index.ts`.

## Known Stubs

None — `uninstallCli` is fully implemented (no placeholder returns, no hardcoded empty data flowing to UI). The router + agent-refresh wiring is intentionally out of scope (plan 03), per the plan objective ("this is the pure module").

## User Setup Required

None — no external service configuration required.

## Operator UAT / Deploy Note

**CODE ONLY — NOT DEPLOYED.** livinityd runs TypeScript directly via tsx (no build/compile step for this source). The operator deploys via `bash /opt/livos/update.sh` (release-based as of Phase 266 — cut a GitHub Release tag first; pushing master no longer auto-deploys). This plan is the pure backend uninstall module: no tRPC route, transport, or agent-refresh is wired yet (those land in plan 03), so there is no end-user-visible behavior to UAT from this plan alone. Live UAT (does `npm -g uninstall` resolve under livinityd's stripped PATH? does the removed agent drop from `/api/agents` after `scheduleAgentRefresh`?) happens once 268-03 wires the route.

## Next Phase Readiness

- `uninstallCli` + `CLI_UNINSTALL` are ready for **268-03** to wire as a `cliInstaller.uninstall` adminProcedure: whitelist-guarded (the module re-asserts it too), added to `httpOnlyPaths` in `common.ts`, production-wired in `index.ts`, and `scheduleAgentRefresh()` fired on `result.ok` so AionUi re-scans and the removed agent disappears from `/api/agents` (requirement "removed agent disappears from /api/agents" depends on that restart — E-6).
- No blockers.

## Self-Check: PASSED

- Both created files exist on disk (`cli-uninstall.ts`, `cli-uninstall.test.ts`); both modified files carry the export/barrel change.
- Both task commits exist in git log (`1d2ef43a` test, `c7f46b57` feat).
- TDD gate sequence (test → feat) confirmed.
- Full cli-installer suite 118/118 green; tsc delta zero; all plan greps pass.

---
*Phase: 268-interactive-cli-auth-paste-back-device-login-cli-uninstall*
*Completed: 2026-06-14*
