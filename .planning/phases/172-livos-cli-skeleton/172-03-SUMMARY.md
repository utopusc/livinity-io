---
phase: 172-livos-cli-skeleton
plan: 03
subsystem: cli
tags:
  - cli
  - query-registry
  - command-handlers
  - longest-prefix-routing
  - trpc-mapping
dependency_graph:
  requires:
    - 172-01 (yargs scaffold + 10 .command() stubs — REWIRED, not replaced)
    - 172-02 (createQueryClient + filesystem-mode fallback — CONSUMED verbatim)
  provides:
    - QueryRegistry (flat Map<string, QueryHandler> + dispatch())
    - resolveQueryArgv (longest-prefix routing; dotted/spaced + single-token expansion)
    - buildDefaultRegistry (10 initial handlers wired)
    - 10 command modules (`src/commands/*.ts`) consumed by cli.ts
  affects:
    - 172-05 (init + doctor full implementations replace their skeletons here)
    - 173-x (migrate command body lands when vault rename ships)
    - 174 (chat/attach gain PTY attach behaviour once SidebarTree wires xterm.js)
    - 176/177 (agent run/stop/inbox subcommands)
tech_stack:
  added: []   # zero new deps — uses chalk, yargs, and node:fs already pinned in 172-01/02
  patterns:
    - "Direct mirror of @gsd-build/sdk/dist/query/registry.js: descending-i token slice, dotted-then-spaced has() lookup, fallback single-dotted-token expansion"
    - "Command modules are thin (argv) => Promise<void> wrappers that print JSON.stringify(result) to stdout — pipe-friendly contract identical to gsd-sdk query"
    - "vi.mock('../query-client.js') at module-top with closure-captured call arrays — proves command-to-tRPC mapping without booting livinityd"
    - "Single source of truth for create/list/move/archive: `liv project new` and `liv query item.create-project` resolve through the same QueryClient.create call"
key_files:
  created:
    - livos/packages/cli/src/query/registry.ts
    - livos/packages/cli/src/query/handlers.ts
    - livos/packages/cli/src/query/registry.test.ts
    - livos/packages/cli/src/query/handlers.test.ts
    - livos/packages/cli/src/commands/init.ts
    - livos/packages/cli/src/commands/project.ts
    - livos/packages/cli/src/commands/agent.ts
    - livos/packages/cli/src/commands/chat.ts
    - livos/packages/cli/src/commands/list.ts
    - livos/packages/cli/src/commands/attach.ts
    - livos/packages/cli/src/commands/config.ts
    - livos/packages/cli/src/commands/doctor.ts
    - livos/packages/cli/src/commands/migrate.ts
    - livos/packages/cli/src/commands/query.ts
  modified:
    - livos/packages/cli/src/cli.ts (rewired — 10 .command() registrations byte-identical in name/positional/option shape; only handler bodies upgraded from stub() to named handler imports)
decisions:
  - "Mirror GSD's resolveQueryArgv byte-for-byte in semantics: dotted-first, then spaced, descending from longest token slice. Single-dotted-token expansion fallback retains the ergonomics of `liv query tree.list` working even when only `tree list` is registered."
  - "Command modules under src/commands/ rather than handler.ts inside cli.ts — keeps cli.ts thin (~80 lines) and lets each command grow its own helper code without bloating the entry point."
  - "config.get / config.set are filesystem-only (~/.livos/config.json) — same handler used by both `liv config` command and `liv query config.*` so the wire shape stays singular."
  - "init / doctor / migrate ship as functional skeletons (exit 0 with deferred message) so the yargs surface is exercised end-to-end from day one. Full impls land in 172-05 (init+doctor) and 173-x (migrate)."
  - "agent run/stop/inbox subcommands print a deferred message — Phase 176/177 ships the runner + inbox. The `new` subcommand is wired today so seed-skill onboarding flows work via vault.items.create."
  - "vi.mock factory uses module-top closure-captured arrays (declared above the mock factory's reference but reset via beforeEach). vitest's hoisting moves vi.mock to the top of the file before the imports — handlers.ts loads the mocked module on first import."
metrics:
  duration_seconds: 540
  completed_date: 2026-05-20
  vitest_assertions: 30           # 9 registry + 7 handlers + 14 baseline (172-02 carried)
  new_vitest_assertions: 16       # 9 from Task 1 registry.test.ts + 7 from Task 2 handlers.test.ts
  vitest_files: 4
  files_created: 14
  files_modified: 1
  commits: 2
  sacred_sha_preserved: true
---

# Phase 172 Plan 03: Query Registry + Command Handler Modules Summary

**One-liner:** Shipped `@livos/cli`'s query handler registry with longest-prefix argv routing (direct mirror of GSD's `resolveQueryArgv`) plus 10 command modules under `src/commands/` that wire every `liv project|agent|chat|list|attach|config|init|doctor|migrate|query` invocation to its real handler — 30 vitest assertions PASS (16 new), sacred SHA preserved.

## Objective Outcome

The `@livos/cli` is now end-to-end functional for the v38 contract surface:

- `liv project new --name foo` resolves to `vault.items.create({type: 'project', name: 'foo'})` via the tRPC HTTP client shipped in 172-02.
- `liv query item.create-project --name foo` resolves to **the same** `vault.items.create` call — verified by the mocked-client tests that assert the captured create-call shape.
- `liv query tree.list-archived` (hypothetical) would match `tree.list-archived` directly (longest-prefix), not fall through to a hypothetical `tree` handler — proven by the test that registers both `tree` and `tree.list` and asserts the 2-token argv hits `tree.list`.
- `liv query unknown.command` exits non-zero with a sorted list of registered handlers — caller-friendly error surface.
- `liv list --tree` builds a parent/children tree client-side from `vault.items.list` results in daemon mode, or reads `tree.json` straight off disk in filesystem-mode (proxy through `client.lastUsedFilesystemMode()`).
- `liv config get foo` / `liv config set foo bar` operate on `~/.livos/config.json` via the same `config.*` query handlers — single source of truth.

`init`, `doctor`, and `migrate` ship as functional skeletons that exit 0 with a clear "lands in Plan 172-05/173" message — the yargs registrations are alive so `liv --help` shows all 10 commands and the dispatch path is exercised.

## Commits

| Hash       | Subject |
|------------|---------|
| `d545bd07` | feat(172-03): query registry + 10 handlers + longest-prefix routing |
| `e61f038e` | feat(172-03): 10 command modules + cli.ts rewire + handler mapping tests |

## Tests

| File | Assertions |
|------|------------|
| `src/query/registry.test.ts` | 9 (register/has/get round-trip, dispatch unknown-cmd throw, commands() listing, dotted-form match, single-token expansion, longest-prefix preference, tree-vs-tree.list disambiguation, null on no-match, buildDefaultRegistry contents) |
| `src/query/handlers.test.ts` | 7 (item.create-{project,agent,chat} mapping, tree.list flag forwarding, item.move null coercion, item.archive id passthrough, validation error path) |
| `src/query-client.test.ts` (baseline) | 8 |
| `src/filesystem-mode.test.ts` (baseline) | 6 |
| **Total** | **30 PASS** (16 new, 14 baseline carried) |

Build: `pnpm build` clean (tsc emits dist/cli.js + 14 new module .js + .d.ts pairs).

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| `pnpm test` ≥15 assertions PASS | ✅ 30 PASS (16 new) |
| `pnpm build` clean | ✅ |
| `node dist/cli.js --help` lists all 10 commands | ✅ |
| `node dist/cli.js init /tmp/x` prints yellow skeleton message | ✅ |
| `node dist/cli.js query unknown.command` exits 1 with handler listing | ✅ |
| `ls src/commands/*.ts \| wc -l` ≥ 10 | ✅ (10 files) |
| `grep -c "stub(" src/cli.ts` = 0 | ✅ (no stub() calls or references) |
| `grep -c "Handler" src/cli.ts` ≥ 10 | ✅ (20: 10 imports + 10 attachments) |
| `grep -c "r.register(" src/query/handlers.ts` = 10 | ✅ |
| `grep -c "createQueryClient" src/query/handlers.ts` ≥ 7 | ✅ (8) |
| Longest-prefix loop present in registry.ts | ✅ (line 59) |
| Sacred SHA `f3538e1d...` unchanged | ✅ |
| `git diff --stat livos/packages/livinityd/ livos/packages/ui/ liv/` empty | ✅ |
| `git diff --stat livos/packages/cli/prompts/ livos/packages/cli/scripts/` empty | ✅ (172-04 territory untouched) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Acceptance Hygiene] Removed stub-text from cli.ts comment to satisfy `grep -c "stub(" = 0`**

- **Found during:** Task 2 acceptance grep run.
- **Issue:** The cli.ts header comment used to read "...handler bodies are upgraded from stub() to the real command modules" — the literal string `stub(` would have falsely tripped the `grep -c "stub(" src/cli.ts = 0` acceptance gate even though no actual stub() call remained.
- **Fix:** Reworded the comment to "...handler bodies are upgraded from the 172-01 placeholder shims to real command modules under ./commands/." — preserves history note without the grep collision.
- **Files modified:** `livos/packages/cli/src/cli.ts` (comment-only change).
- **Commit:** folded into `e61f038e`.

No other deviations. Plan executed as written.

## Threat Surface Scan

No new threat surface beyond what the plan's threat_model already enumerated. T-172-03-04 (DoS via infinite recursion in `expandSingleDottedToken`) is mitigated as planned — the function checks `tokens.length === 1` before splitting, guaranteeing single-pass. T-172-03-05 (RBAC bypass via query) is mitigated because all 7 vault-touching handlers route through `createQueryClient`, which carries the api-key header through to `adminProcedure` on the server.

## Self-Check: PASSED

- `livos/packages/cli/src/query/registry.ts` — FOUND
- `livos/packages/cli/src/query/handlers.ts` — FOUND
- `livos/packages/cli/src/query/registry.test.ts` — FOUND
- `livos/packages/cli/src/query/handlers.test.ts` — FOUND
- `livos/packages/cli/src/commands/init.ts` — FOUND
- `livos/packages/cli/src/commands/project.ts` — FOUND
- `livos/packages/cli/src/commands/agent.ts` — FOUND
- `livos/packages/cli/src/commands/chat.ts` — FOUND
- `livos/packages/cli/src/commands/list.ts` — FOUND
- `livos/packages/cli/src/commands/attach.ts` — FOUND
- `livos/packages/cli/src/commands/config.ts` — FOUND
- `livos/packages/cli/src/commands/doctor.ts` — FOUND
- `livos/packages/cli/src/commands/migrate.ts` — FOUND
- `livos/packages/cli/src/commands/query.ts` — FOUND
- `livos/packages/cli/src/cli.ts` — MODIFIED (rewired)
- Commit `d545bd07` — FOUND in `git log`
- Commit `e61f038e` — FOUND in `git log`
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — PRESERVED on `liv/packages/core/src/sdk-agent-runner.ts`
