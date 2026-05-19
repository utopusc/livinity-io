---
phase: 164-autonomous-scheduler
plan: 01
subsystem: livinityd / autonomous-scheduler
tags:
  - autonomous-scheduler
  - agent-definitions
  - cron-parser
  - phase-164
  - v34
dependency-graph:
  requires:
    - js-yaml@^4.1.0 (direct dep, livos/packages/livinityd/package.json:109)
    - node-cron@^3.0.3 (direct dep, livos/packages/livinityd/package.json:115)
    - Phase 162-01 vault-scaffolder pattern (sibling module shape)
    - Phase 162-03 auth-verifier discriminator pattern
    - Phase 163 SHIPPED (164-CONTEXT depends_on)
  provides:
    - AgentDefinition type (consumed by 164-02 scheduler + 164-03 inbox-writer)
    - parseAgentDefinition() — single-file parser w/ structured error
    - parseAgentDefinitionsDir() — partial-failure resilient directory walk
    - autonomous-scheduler module barrel (extension point for 164-02/03)
  affects:
    - downstream: 164-02 scheduler will import AgentDefinition + parseAgentDefinitionsDir
    - downstream: 164-04 sample agents author against this YAML schema
tech-stack:
  added: []
  patterns:
    - "import * as cron from 'node-cron'; cron.validate(expr)" (mirrors scheduler/index.ts)
    - "import yaml from 'js-yaml'; yaml.load(text, {schema: yaml.FAILSAFE_SCHEMA})" (mirrors apps/compose-generator.ts)
    - "{ok: true; ...} | {ok: false; err: string}" discriminator (mirrors auth-verifier.ts)
    - non-throwing directory walk with aggregated {ok, errors} (mirrors vault-scaffolder.ts resilience)
key-files:
  created:
    - livos/packages/livinityd/source/modules/autonomous-scheduler/agent-definition-parser.ts
    - livos/packages/livinityd/source/modules/autonomous-scheduler/agent-definition-parser.test.ts
    - livos/packages/livinityd/source/modules/autonomous-scheduler/index.ts
  modified: []
decisions:
  - Used js-yaml directly (it's a direct dep, not transitive) — no inline regex fallback path required
  - FAILSAFE_SCHEMA for yaml.load() so embedded YAML directives cannot execute (T-164-01-01 mitigation)
  - Pinned Dirent[] return type explicitly — node 22 tsc was inferring Dirent<Buffer>[] (Buffer-name variant) which broke .endsWith() + path.join() on entry.name. The string-name variant is correct because we never pass encoding:'buffer' to readdir
  - Stable sort by definition.name in parseAgentDefinitionsDir so 164-02 cron registration is reboot-deterministic
  - snake_case YAML keys → camelCase TypeScript fields converted at parse time
metrics:
  duration_minutes: ~25
  tasks_completed: 3
  tests_added: 14 (10 required + 4 extra coverage)
  files_created: 3
  files_modified: 0
  completed_date: 2026-05-19
---

# Phase 164 Plan 01: Agent Definition Format + Parser Summary

**One-liner:** YAML-frontmatter agent definitions (`vault/livos-agents/*.md`) parsed into typed `AgentDefinition` objects via js-yaml FAILSAFE_SCHEMA + node-cron validation, with a partial-failure-resilient directory walk for the autonomous scheduler (164-02) to consume.

## What Shipped

- **`agent-definition-parser.ts`** — Exports `AgentDefinition` (10-field interface), `ParseResult` (discriminator), `ParseError`, `DirParseResult`, plus two functions:
  - `parseAgentDefinition(markdown, sourcePath) → ParseResult` — single-file parse with structured error
  - `parseAgentDefinitionsDir(dir) → Promise<DirParseResult>` — directory walk that aggregates per-file successes into `ok[]` and per-file errors into `errors[]`, never throws
- **`agent-definition-parser.test.ts`** — 14-test Vitest suite covering happy path, missing required fields (name / schedule / model), invalid cron, valid cron variants, defaults application, empty body, missing frontmatter, partial-failure directory walk, non-.md skipping, ENOENT directory, stable sort by name, and subdirectory non-recursion.
- **`index.ts`** — Module barrel re-exporting the parser API + types so callers can `import {parseAgentDefinition} from './modules/autonomous-scheduler/index.js'`.

## Schema Locked

```yaml
# Required
name: string              # agent ID (matches filename minus .md by convention)
schedule: string          # 5-field cron expression, validated via cron.validate()
model: string             # e.g. 'claude-sonnet-4-6' | 'claude-haiku-4-5'

# Optional (defaults applied at parse time)
max_turns: number         # default 20
max_budget_usd: number    # default 5
allowed_tools: string[]   # default ['Read','Bash','Glob','Grep']
mcp_servers: string[]     # default []
enabled: boolean          # default true
```

Markdown body (after the closing `---`) becomes the prompt at the SDK `query()` call site in 164-02.

## Verification Results

| Check | Result |
| --- | --- |
| `npm run test:run -- modules/autonomous-scheduler/agent-definition-parser.test.ts` | 14/14 PASS |
| `git diff -- livos/packages/livinityd/package.json` | empty (D-NO-NEW-DEPS) |
| `git diff -- livos/pnpm-lock.yaml` | empty (D-NO-NEW-DEPS) |
| `npm run typecheck` filtered to `modules/autonomous-scheduler/` | zero errors |
| Sacred SHA `liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (UNCHANGED) |
| D-09 `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` | `2083f0a3...` (UNCHANGED) |
| Phase 161-02 helper `agent-prompt-builder.ts` | `dc1831f5...` (UNCHANGED) |
| `liv/packages/core/src/agent-session.ts` | `7c690d59...` (UNCHANGED) |
| Phase 162-01 `vault-scaffolder.ts` | `5ddfd065...` (UNCHANGED) |

## Commits

| Commit | Title |
| --- | --- |
| `4de8eb8f` | feat(164-01): add agent-definition-parser with frontmatter + cron validation |
| `3af08562` | feat(164-01): export autonomous-scheduler barrel + Dirent typing fix |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned `Dirent[]` return type explicitly**
- **Found during:** Task 3 (typecheck verification after writing the barrel)
- **Issue:** `let entries: Awaited<ReturnType<typeof readdir>>` resolved to `Dirent<Buffer>[]` (Buffer-name variant) under node 22 tsc, blocking `entry.name.endsWith('.md')` and `path.join(dir, entry.name)`. Three TS errors in `agent-definition-parser.ts`.
- **Fix:** Added `import type {Dirent} from 'node:fs'` and changed the annotation to `let entries: Dirent[]` (the string-name variant — correct because we never pass `encoding: 'buffer'` to `readdir`). Tests still 14/14 PASS after the fix, and `npm run typecheck` filtered to `modules/autonomous-scheduler/` is clean.
- **Files modified:** `livos/packages/livinityd/source/modules/autonomous-scheduler/agent-definition-parser.ts`
- **Commit:** `3af08562`

### Task 1 Folding

Task 1 was a verification-only dep-check (no files modified). Per the plan's `<action>` step 3, the dep-check result was folded into the Task 2 commit message footer (`dep-check: node-cron=^3.0.3 (direct), js-yaml=^4.1.0 (direct ...)`). Both deps confirmed as direct dependencies of `livos/packages/livinityd/package.json` — no need for the inline-YAML-parser fallback path.

## Out-of-Scope Discoveries (Deferred)

`npm run typecheck` revealed pre-existing tsc errors across unrelated modules (`source/modules/user/routes.ts`, `source/modules/user/user.ts`, `source/modules/utilities/file-store.ts`, `source/modules/webapps/pipewire-portal.test.ts`, `source/modules/webapps/trpc-router.ts`, `source/modules/webapps/trpc-streams.test.ts`, `source/modules/widgets/routes.ts`). These are NOT caused by Plan 164-01 changes and are explicitly out of scope per the SCOPE BOUNDARY rule. They exist on the master baseline before this plan started and will be tracked separately if relevant.

## Threat Surface Scan

No new threat surface introduced. The parser is a pure input-validation layer between user-edited markdown files and a downstream consumer (164-02 scheduler). Threats already documented in the plan's `<threat_model>`:

- **T-164-01-01 (YAML tampering)** — Mitigated via `yaml.FAILSAFE_SCHEMA` so embedded directives / custom tags / `!!js/function` cannot execute.
- **T-164-01-02 (sub-minute cron DoS)** — Accepted per plan; 164-02 budget cap + concurrency cap bound runaway agents.
- **T-164-01-03 (allowed_tools enforcement)** — Parser passes the array verbatim; the SDK enforces the allowlist at runtime in 164-02.
- **T-164-01-04 (sourcePath leak)** — Accepted; single-user system, no multi-tenant surface.

## Known Stubs

None. The parser is fully wired with no placeholder values — all defaults are documented constants applied only when the optional field is absent.

## Self-Check

### Files Created

- `livos/packages/livinityd/source/modules/autonomous-scheduler/agent-definition-parser.ts` — FOUND
- `livos/packages/livinityd/source/modules/autonomous-scheduler/agent-definition-parser.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/autonomous-scheduler/index.ts` — FOUND

### Commits

- `4de8eb8f` — FOUND on master
- `3af08562` — FOUND on master

### Sacred + Guards

All 5 SHAs above match the pre-plan baseline byte-for-byte.

## Self-Check: PASSED
