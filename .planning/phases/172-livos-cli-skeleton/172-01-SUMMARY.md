---
phase: 172-livos-cli-skeleton
plan: 01
subsystem: cli
tags: [cli, workspace, bootstrap, yargs, npm-bin]
dependency-graph:
  requires: []
  provides:
    - "@livos/cli workspace package"
    - "liv bin entry point"
    - "yargs dispatcher with 10 v38 command stubs (init, project, agent, chat, list, attach, config, doctor, migrate, query)"
  affects:
    - livos/pnpm-workspace.yaml (additive entry)
    - livos/pnpm-lock.yaml (resolves yargs@17.7.2 / chalk@5.0.1 / uuidv7@1.2.1 for new workspace)
tech-stack:
  added:
    - yargs ^17.7.2 (CLI command dispatcher)
    - chalk ^5.0.1 (ANSI color output for stub messages)
    - uuidv7 ^1.2.1 (reserved for future item id generation in 172-03)
    - "@types/yargs ^17.0.35"
  patterns:
    - "ESM-only package (type: module + NodeNext)"
    - "JSON import attribute syntax: import pkg from '../package.json' with {type: 'json'}"
    - "yargs stub pattern: each handler prints yellow 'not implemented — see Phase 172-XX' and exits 0 so --help enumerates the full surface"
    - "shebang #!/usr/bin/env node on src/cli.ts line 1 preserved verbatim through tsc emit"
key-files:
  created:
    - livos/packages/cli/package.json
    - livos/packages/cli/tsconfig.json
    - livos/packages/cli/src/version.ts
    - livos/packages/cli/src/cli.ts
  modified:
    - livos/pnpm-workspace.yaml (append "  - packages/cli")
    - livos/pnpm-lock.yaml (auto by pnpm install)
decisions:
  - "Override module/moduleResolution to NodeNext in cli/tsconfig.json (not in shared tsconfig.base.json). Reason: import-attribute syntax (with {type: 'json'}) requires module >= esnext|nodenext, but base config uses module: ES2022. Local override is additive and does not affect any other package."
  - "Single atomic commit for entire 172-01 (Task 1 + Task 2 in one feat commit). Plan permitted either pattern; single commit reflects that Task 1 outputs (package.json, tsconfig.json, workspace entry) are non-runnable without Task 2 outputs (src/version.ts, src/cli.ts) — there is no meaningful intermediate state worth bisecting."
metrics:
  duration: "~2 minutes (11:10:35Z → 11:12:42Z)"
  completed: 2026-05-20
  tasks_completed: 2
  files_created: 4
  files_modified: 2
  commits: 1
---

# Phase 172 Plan 01: @livos/cli Package Skeleton Summary

Scaffolded the `@livos/cli` workspace package with the `liv` bin entry and a yargs-based dispatcher that registers all 10 v38 commands as stubs — establishing the buildable shell that Plans 172-02 through 172-05 (and downstream Phases 173/176/177) consume.

## What Shipped

A new pnpm workspace package at `livos/packages/cli/` that:
- Builds to ESM `dist/` via `tsc` (no bundler, no transpilation beyond TS → JS).
- Exposes the `liv` binary via `"bin": {"liv": "./dist/cli.js"}` (verbatim mirror of `@gsd-build/sdk`'s bin shape).
- Renders `--version` (`0.1.0`) and `--help` (lists all 10 commands) correctly.
- Stub bodies print `[liv <cmd>] not implemented yet — see Phase 172-XX` in yellow and exit 0 — so `--help` is proof the surface exists; Plans 172-02..05 will replace stub bodies in place with real handlers (no churn on this file's shape).

## Files Created / Modified

| Path | Status | Purpose |
| --- | --- | --- |
| `livos/packages/cli/package.json` | NEW | @livos/cli v0.1.0, ESM, bin=liv, deps yargs/chalk/uuidv7 |
| `livos/packages/cli/tsconfig.json` | NEW | Extends `../../tsconfig.base.json` with outDir=dist, rootDir=src, declarationMap; overrides module/moduleResolution to NodeNext for import-attribute syntax |
| `livos/packages/cli/src/version.ts` | NEW | `getVersion(): string` — reads package.json via JSON import attribute |
| `livos/packages/cli/src/cli.ts` | NEW | yargs dispatcher with shebang + 10 command stubs |
| `livos/pnpm-workspace.yaml` | MOD | Appends `  - packages/cli` to `packages:` block (additive; all existing entries preserved verbatim) |
| `livos/pnpm-lock.yaml` | MOD | Auto-updated by `pnpm install` to resolve new workspace package + its deps |

## Dependencies Declared

**Runtime (production):**
- `yargs ^17.7.2` — command dispatcher (already in lockfile transitively, now direct)
- `chalk ^5.0.1` — ANSI color output for stub messages and `[liv] fatal:` errors
- `uuidv7 ^1.2.1` — already used by livinityd; reserved for vault item id generation in 172-03

**Dev:**
- `@types/node ^22.0.0`
- `@types/yargs ^17.0.35`
- `typescript ^5.7.0`
- `vitest ^2.1.2` — test harness for upcoming 172-02..05 plans

D-NEW-DEPS-v38 light-tier compliant (3 direct runtime deps; all already transitively present in the monorepo).

## Acceptance Criteria Transcript

```bash
$ pnpm install --filter @livos/cli
# resolved 3050, reused 4, downloaded 0, added 0, done — exit 0

$ pnpm --filter @livos/cli build
> @livos/cli@0.1.0 build C:\...\livos\packages\cli
> tsc
# exit 0

$ node livos/packages/cli/dist/cli.js --version
0.1.0

$ node livos/packages/cli/dist/cli.js --help
Usage: liv <command> [options]

Commands:
  liv init [path]                    Bootstrap a new vault at [path] (default: ~/liv/)
  liv project <subcmd>               Project Item commands (new, list, open)
  liv agent <subcmd>                 Agent Item commands (new, run, stop, inbox)
  liv chat [name]                    Open a chat session (attaches to CC PTY)
  liv list                           List vault items (use --tree for tree view)
  liv attach <id>                    Attach to an existing chat session by ID
  liv config <action> [key] [value]  Get or set a config value
  liv doctor                         Validate vault integrity (items/, tree.json, schema)
  liv migrate                        Run vault schema migrations
  liv query <argv...>                Dispatch to query handler registry (longest-prefix routing)

Options:
  -v, --version  Show version number                                   [boolean]
  -h, --help     Show help                                             [boolean]

$ node livos/packages/cli/dist/cli.js init
[liv init] not implemented yet — see Phase 172-05

$ head -1 livos/packages/cli/dist/cli.js
#!/usr/bin/env node

$ grep -c "stub('" livos/packages/cli/src/cli.ts
10

$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f   # Sacred SHA preserved
```

All 4 plan-level acceptance truths pass:
- [x] `pnpm install` at repo root succeeds with the new packages/cli workspace entry
- [x] `pnpm --filter @livos/cli build` produces `dist/cli.js` without TS errors
- [x] `node packages/cli/dist/cli.js --version` prints `0.1.0` and exits 0
- [x] `node packages/cli/dist/cli.js --help` lists all 10 commands (init, project, agent, chat, list, attach, config, doctor, migrate, query)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] TypeScript module setting incompatible with import-attribute syntax**

- **Found during:** Task 2 build verification (first `pnpm --filter @livos/cli build` invocation)
- **Issue:** The plan body for Task 2 uses `import pkg from '../package.json' with {type: 'json'}` — TS 5.7 emitted error TS2823: `Import attributes are only supported when the '--module' option is set to 'esnext', 'node18', 'node20', 'nodenext', or 'preserve'.` The root `tsconfig.base.json` sets `module: ES2022` + `moduleResolution: bundler`, which rejects the import-attribute keyword.
- **Fix:** In `livos/packages/cli/tsconfig.json`, override `module: "NodeNext"`, `moduleResolution: "NodeNext"`, and `target: "ES2022"` locally (additive override; base config untouched, no other workspace package affected). This honors the plan's explicit preference ("preferred over the older `assert` keyword") while staying within the workspace-local scope.
- **Files modified:** `livos/packages/cli/tsconfig.json` only.
- **Commit:** Folded into the single 172-01 commit `9f79baff`.

No other deviations. Plan body verbatim otherwise; pnpm-workspace.yaml line added exactly as specified, package.json deps match the plan body verbatim, src/cli.ts uses the plan's exact 10 stub definitions and exact wording for `usage`, `demandCommand`, and stub messages.

## Sacred Guards — Verified

| Guard | Pre-Plan | Post-Plan | Status |
| --- | --- | --- | --- |
| `liv/packages/core/src/sdk-agent-runner.ts` Sacred SHA | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` | UNCHANGED ✅ |
| `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` (D-09) | (untouched) | (untouched) | UNCHANGED ✅ |
| `git diff --stat liv/ livos/packages/livinityd/ livos/packages/ui/ livos/packages/config/` | (empty pre) | (empty post) | EMPTY ✅ |
| Phase 162-171 sources (cc-pty/, vault-graph/, vault-scaffolder.ts, agent-session.ts, vault-items/, trpc/vault-items-router.ts) | (untouched) | (untouched) | UNCHANGED ✅ |

Only new directory created: `livos/packages/cli/`. Only edit to existing tree: the additive `  - packages/cli` line in `livos/pnpm-workspace.yaml` and the auto-regenerated `livos/pnpm-lock.yaml`.

## Threat Surface Scan

Plan's threat register (T-172-01-01 through T-172-01-04) covers the entire delivered surface. No new threat surfaces introduced beyond what the plan anticipated:
- bin field tampering → accept (Sacred SHA hook + repo committer review)
- --version disclosure → accept (public OSS)
- yargs DoS → mitigated by `.demandCommand(1, ...)` with clean error + non-zero exit
- bin runs with operator UID → accept (172-01 ships read-only stubs; 172-02 will gate mutations behind LIV_API_KEY)

No new threat flags.

## Commits

| Hash | Subject |
| --- | --- |
| `9f79baff` | `feat(172-01): scaffold @livos/cli package with yargs dispatcher (10 cmd stubs)` |

## Hand-Off to 172-02

The package is buildable and the `liv` bin enumerates the full v38 command surface. Plan 172-02 (query-client + filesystem-mode) replaces the `query <argv...>` stub body with real handler dispatch, and Plan 172-03 replaces the rest. Stub shape is stable — `command()` arity, positional types, and option flags will not change post-172-01.

## Self-Check: PASSED

- File `livos/packages/cli/package.json`: FOUND
- File `livos/packages/cli/tsconfig.json`: FOUND
- File `livos/packages/cli/src/version.ts`: FOUND
- File `livos/packages/cli/src/cli.ts`: FOUND
- File `livos/packages/cli/dist/cli.js`: FOUND (build artifact, gitignored)
- Commit `9f79baff`: FOUND in `git log --oneline`
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`: MATCHES on liv/packages/core/src/sdk-agent-runner.ts
- `pnpm-workspace.yaml` contains `packages/cli`: VERIFIED (`grep -c "packages/cli"` = 1)
