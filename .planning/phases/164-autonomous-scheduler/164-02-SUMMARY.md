---
phase: 164-autonomous-scheduler
plan: 02
subsystem: livinityd / autonomous-scheduler
tags:
  - autonomous-scheduler
  - scheduler-module
  - sdk-direct
  - budget-gate
  - cli-trigger
  - boot-wireup
  - phase-164
  - v34
dependency-graph:
  requires:
    - Phase 164-01 agent-definition-parser (parseAgentDefinitionsDir + AgentDefinition type)
    - Phase 164-03 inbox-writer (writeInboxEntry + InboxEntryInput shape)
    - Phase 164-04 sample agents shipped to vault-templates/livos-agents/ (nightly-backup-audit + pr-watcher with enabled:false)
    - node-cron@^3.0.3 (direct dep)
    - ioredis (transitive via livinityd's AiModule)
    - "@anthropic-ai/claude-agent-sdk@^0.2.85" (direct dep — used via dynamic import mirroring auth-verifier.ts)
  provides:
    - AutonomousScheduler class (start/stop/runNow/registerDefinition + taskCount getter)
    - autonomousTriggerCli() — operator CLI escape hatch
    - budget-gate helpers (checkAndIncrementConcurrent, decrementConcurrent, checkDailyBudget, incrementDailySpend, dateKeyForUtc)
    - SdkQueryFn + SdkQueryOptions public types for downstream consumers
    - Boot-wired AutonomousScheduler on livinityd (gated by liv:config:autonomous_enabled)
    - CLI subcommand `livinityd autonomous-trigger <agent-name>` (used by Phase 164-05 smoke)
  affects:
    - downstream: Phase 164-05 Mini PC smoke test consumes the CLI trigger
    - downstream: Phase 165 Settings UI will read autonomous_enabled flag + spend counter + active_count
tech-stack:
  added: []
  patterns:
    - "redis.multi().incr(k).get(k).exec()" atomic concurrent-cap check + DECR rollback on overflow
    - "redis.eval(luaScript, 1, key)" floor-at-zero DECR to defend against double-decrement
    - "redis.multi().incrby(k, n).expire(k, TTL).exec()" atomic INCRBY + EXPIRE for spend counter
    - "(await import('@anthropic-ai/claude-agent-sdk')).query" dynamic-import pattern mirroring auth-verifier.ts
    - "for await (const msg of messages as AsyncIterable<any>)" SDK result consumption
    - "try { ... } finally { decrementConcurrent + inFlight.delete }" leak-proof slot release
    - "early-branch in cli.ts before `new Livinityd(...)`" operator subcommand dispatch
    - "Map-backed in-memory fake Redis" test infra (mirrors legacy-bytebot-cleanup.test.ts)
key-files:
  created:
    - livos/packages/livinityd/source/modules/autonomous-scheduler/budget-gate.ts
    - livos/packages/livinityd/source/modules/autonomous-scheduler/budget-gate.test.ts
    - livos/packages/livinityd/source/modules/autonomous-scheduler/scheduler.ts
    - livos/packages/livinityd/source/modules/autonomous-scheduler/scheduler.test.ts
    - livos/packages/livinityd/source/modules/autonomous-scheduler/cli-trigger.ts
  modified:
    - livos/packages/livinityd/source/cli.ts (early-branch + help)
    - livos/packages/livinityd/source/modules/autonomous-scheduler/index.ts (barrel re-exports)
    - livos/packages/livinityd/source/index.ts (import + field + start() wire-up + stop() teardown)
decisions:
  - Concurrent-cap gate uses MULTI(INCR + GET) followed by conditional DECR rollback — exploits Redis single-threaded execution to make the check race-free without a watch/transaction loop
  - Daily-budget gate is GET-vs-GET (no Redis writes on the check path) so a stale read at most lets one extra agent slip through before the next tick reads the post-INCRBY value — bounded by maxBudgetUsd inside the SDK
  - decrementConcurrent uses Lua eval to FLOOR-AT-ZERO so a double-call or finally-block double-release cannot drive active_count negative (which would silently mask the cap check forever after)
  - mcpServers built as `{}` for v34 — autonomous agents inherit MCP servers from vault `.claude/mcp.json` via settingSources:['project']. Selective programmatic wiring deferred to Phase 165 Settings UI (per CONTEXT.md mcp_servers field is currently parsed-and-stored but unused at the SDK layer)
  - CLI trigger uses `registerDefinition()` (new public method on AutonomousScheduler) to bypass cron registration AND the autonomous_enabled flag — explicit operator action documented as T-164-02-06 accepted trade-off; daily + concurrent caps still apply
  - SDK timeout instrumented as a soft warning (logger.error after timeoutMs) — actual abort would require AbortController plumbed into the SDK, deferred to Phase 165 polish
  - Cost increment clamps NaN/negative totalCostUsd to 0 cents so an upstream SDK quirk cannot corrupt the daily counter
  - SDK throws are split into two paths: synchronous throw (caught by outer try/catch) and mid-stream throw (also caught by outer try/catch since the for-await is inside the try) — both end with status='error' inbox entry; try/finally guarantees active_count decrement on either path (locked by Test 8 + Test 9)
  - In-memory fake Redis used for tests (D-NO-NEW-DEPS — ioredis-mock NOT added). Map-backed, surface limited to {get, set, del, incr, decr, incrby, expire, ttl, multi, eval} — only the methods budget-gate.ts and scheduler.ts touch
  - Boot wire-up site locked at AFTER smokeAuthCheck (SDK auth pre-probed) and BEFORE drainInstallPendingRedisKeys (autonomous boot telemetry lands before install-pending mutation)
  - stop() teardown placed EARLY in shutdown (BEFORE heartbeat sender stop) so in-flight cron-triggered SDK calls drain (up to 30s) while Redis + inbox writer are still healthy
metrics:
  duration_minutes: ~40
  tasks_completed: 4
  tests_added: 21 (10 budget-gate + 11 scheduler)
  files_created: 5
  files_modified: 3
  completed_date: 2026-05-19
---

# Phase 164 Plan 02: Scheduler Module + Budget Gate + CLI Trigger + Boot Wire-up Summary

**One-liner:** Autonomous scheduler runtime ships the cron-driven `query()` spawn path with atomic Redis budget gates (concurrent + daily) + an operator CLI escape hatch (`livinityd autonomous-trigger <name>`) + non-fatal livinityd boot wire-up — agent-session.ts UNTOUCHED, sacred SHA preserved, zero new deps.

## What Shipped

**Five new files in `livos/packages/livinityd/source/modules/autonomous-scheduler/`:**

- **`budget-gate.ts`** — Five exported helpers:
  - `checkAndIncrementConcurrent(redis)` — atomic MULTI(INCR + GET) with DECR rollback on overflow; defaults cap=3
  - `decrementConcurrent(redis)` — Lua eval floor-at-zero DECR
  - `checkDailyBudget(redis, dateKey)` — pure GET-vs-GET; defaults cap=5000c ($50)
  - `incrementDailySpend(redis, dateKey, cents)` — MULTI(INCRBY + EXPIRE 48h)
  - `dateKeyForUtc(d)` — `YYYY-MM-DD` slice
- **`budget-gate.test.ts`** — 10 vitest cases covering all 9 plan behaviours + dateKeyForUtc utility
- **`scheduler.ts`** — `AutonomousScheduler` class:
  - `start()` reads `liv:config:autonomous_enabled` (no-op when unset/false), parses every `vault/livos-agents/*.md` via Phase 164-01 parser, registers a `node-cron` task per `enabled: true` def
  - `stop()` unregisters tasks; drains in-flight runs with 30s timeout
  - `runNow(name)` immediate trigger (bypasses cron, still gates on budget)
  - `registerDefinition(def)` CLI-only def injection (no cron task)
  - `taskCount` getter for tests + diagnostics
  - Private `runAgent(def)` — mutex → daily gate → concurrent gate → SDK query() spawn (CONTEXT.md lines 82-96 verbatim) → AsyncIterable consumption → try/finally decrement + spend INCRBY + inbox write
- **`scheduler.test.ts`** — 11 vitest cases (10 plan-required + 1 edge for unknown-agent runNow)
- **`cli-trigger.ts`** — `autonomousTriggerCli({agentName})` function returning exit code (0/1/2)

**Three modified files:**

- **`livinityd/source/cli.ts`** — early-branch dispatcher between `client` and the help block; dynamic-imports `cli-trigger.js` so the autonomous module isn't pulled into livinityd's hot boot path; help text updated
- **`livinityd/source/modules/autonomous-scheduler/index.ts`** — barrel re-exports for AutonomousScheduler + autonomousTriggerCli + budget-gate helpers + all public types
- **`livinityd/source/index.ts`** — import block (line 40), Livinityd class field `autonomousScheduler?`, start() instantiation AFTER smokeAuthCheck and BEFORE drainInstallPendingRedisKeys (try/catch — non-fatal), stop() teardown EARLY (before heartbeat sender stop)

## Verification Results

| Check | Result |
| --- | --- |
| `npm run test:run -- modules/autonomous-scheduler/budget-gate.test.ts` | 10/10 PASS |
| `npm run test:run -- modules/autonomous-scheduler/scheduler.test.ts` | 11/11 PASS |
| Full `npm run test:run -- modules/autonomous-scheduler` | 50/50 PASS (parser 14 + budget-gate 10 + scheduler 11 + inbox-writer 12 + sample-agents 3) |
| `git diff -- livos/packages/livinityd/package.json` | empty (D-NO-NEW-DEPS) |
| `git diff -- livos/pnpm-lock.yaml` | empty (D-NO-NEW-DEPS) |
| `npm run typecheck` filtered to `modules/autonomous-scheduler/` + `source/cli.ts` + `source/index.ts` | zero NEW errors (pre-existing trpc-router / widgets / user / file-store failures unchanged from Phase 164-01 baseline) |
| Sacred SHA `liv/packages/core/src/sdk-agent-runner.ts` | `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (UNCHANGED) |
| D-09 `livos/packages/livinityd/source/modules/computer-use/luse-system-prompt.ts` | `2083f0a3dfc798b4841613b9576b94929f2faf2f` (UNCHANGED) |
| Phase 161-02 helper `agent-prompt-builder.ts` | `dc1831f5f284656dc3bd07babf972cfb02b815c6` (UNCHANGED) |
| **`liv/packages/core/src/agent-session.ts`** | `7c690d59ea08b6450da1d5bd243d06e62a70d473` (UNCHANGED — architectural separation upheld; `git diff HEAD~5..HEAD` = 0 lines) |
| Phase 162-01 `vault-scaffolder.ts` | `5ddfd06508e11554ae80a7a57b269a4835bf6cdb` (UNCHANGED) |
| Phase 20 `modules/scheduler/index.ts` | `e4da58572b9b6eca2bf41afb0f8306227a0f4911` (UNCHANGED — autonomous scheduler is a peer, NOT a consumer) |
| Boot wire-up order: scaffoldVault → smokeAuthCheck → **AutonomousScheduler.start()** → drainInstallPendingRedisKeys | locked (grep on source/index.ts L494/L506/L536/L560 confirms ordering) |
| CLI early-branch runs before `new Livinityd(...)` | locked (cli.ts:28-42 dispatches + `process.exit(code)` before line 81's `new Livinityd`) |

## Commits

| Commit | Title |
| --- | --- |
| `d44e2ac8` | feat(164-02): add budget-gate with atomic Redis concurrent+daily cap helpers |
| `fd3d46fa` | feat(164-02): add AutonomousScheduler with SDK query() spawn + cron + budget gate |
| `af4101ed` | feat(164-02): add livinityd autonomous-trigger CLI escape hatch |
| `9be8e311` | feat(164-02): wire AutonomousScheduler into livinityd boot (non-fatal) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] No `ioredis-mock` available; ioredis-mock NOT a dep**
- **Found during:** Task 1 (RED phase — checking which test infra to use)
- **Issue:** Plan's Task 1 action step 2 suggested using `ioredis-mock` if it resolves. `node -e "require.resolve('ioredis-mock')"` failed with MODULE_NOT_FOUND. Adding it as a dep would violate D-NO-NEW-DEPS.
- **Fix:** Wrote a tiny in-memory Map-backed fake Redis mirroring the existing pattern at `livos/packages/livinityd/source/modules/computer-use/legacy-bytebot-cleanup.test.ts`. Surface limited to `{get, set, del, incr, decr, incrby, expire, ttl, multi, eval}` — only the methods budget-gate.ts and scheduler.ts touch. Lua eval is pattern-matched on the script text rather than executing real Lua (the only script in scope is the floor-at-zero DECR, which we interpret directly).
- **Files modified:** `budget-gate.test.ts` (helper at top), `scheduler.test.ts` (same helper inlined for test isolation)
- **Commits:** `d44e2ac8`, `fd3d46fa`

**2. [Rule 3 - Blocking] `inboxWriterImpl` injection NOT in original plan but required for unit-testability**
- **Found during:** Task 2 (drafting scheduler.test.ts)
- **Issue:** Plan's Task 2 behaviours 5/6/7/8/9 require asserting that `writeInboxEntry` was/was-not called and with what input. The plan's `<action>` block writes directly to `await writeInboxEntry({...})` — that would force tests to either touch the real FS in a tmpdir (slow + flaky) or monkey-patch the import at module level (vitest mocking gymnastics).
- **Fix:** Added an `inboxWriterImpl?: (input) => Promise<WriteInboxResult>` option on `AutonomousSchedulerOptions`, defaulting to `defaultWriteInboxEntry` from `./inbox-writer.js`. Production code path unchanged (`new AutonomousScheduler({redis, vaultPath, logger})` still uses the real writer). Tests pass `inboxWriterImpl: inboxStub` and assert against `inboxCalls`.
- **Files modified:** `scheduler.ts` (option + private field + default), `scheduler.test.ts` (uses the injection)
- **Commit:** `fd3d46fa`

**3. [Rule 2 - Missing critical functionality] Spend counter NaN/negative clamp**
- **Found during:** Task 2 (drafting runAgent's spend INCRBY)
- **Issue:** SDK reports `total_cost_usd` as a float; an upstream quirk (or a misbehaving stub) emitting NaN or a negative number would corrupt the daily counter forever (NaN cents → `Math.round(NaN)` = NaN → `incrby(key, NaN)` → Redis stores "NaN" → next read fails). This is a Rule 2 correctness requirement, not a feature.
- **Fix:** `const cents = Number.isFinite(totalCostUsd) && totalCostUsd > 0 ? Math.round(totalCostUsd * 100) : 0; if (cents > 0) { ... }`. NaN/negative → no INCRBY at all; the inbox entry still records the actual `totalCostUsd` value verbatim so the operator can see the anomaly.
- **Files modified:** `scheduler.ts`
- **Commit:** `fd3d46fa`

**4. [Rule 3 - Blocking] Plan's `<files>` block for Task 4 listed `modules/autonomous-scheduler/index.ts` but Phase 164-01 already created it**
- **Found during:** Task 4 (drafting the barrel update)
- **Issue:** The barrel already existed from Phase 164-01 + extended by 164-03. Plan's Task 4 action step 1 said "Update" not "Create" but the `<files>` block didn't make this explicit.
- **Fix:** Read the existing barrel, extended it via `Edit` (not `Write`) to add the Phase 164-02 re-exports. No content was lost.
- **Files modified:** `modules/autonomous-scheduler/index.ts`
- **Commit:** `af4101ed`

### Task 1 TDD Folding

Plan Task 1 says `tdd="true"` but the action block has a single commit (`feat(164-02): add budget-gate...`). Per the plan's literal contract I followed the single-commit pattern — wrote the test, ran it (RED — file not found), wrote the implementation, ran the test (GREEN — 10/10 PASS), committed both files in one `feat` commit. This matches Phase 164-01's TDD folding pattern from `164-01-SUMMARY.md` § "Task 1 Folding".

Plan Task 2 same: single `feat` commit covering both the test file and the scheduler.ts.

## Threat Surface Scan

No new threat surface beyond the plan's `<threat_model>` register:

- **T-164-02-01** (`acceptEdits` blast radius) — Mitigation upheld: sample agents 164-04 ship `enabled: false`; default `liv:config:autonomous_enabled = unset → no-op`; daily ($50) + concurrent (3) caps in place; Phase 165 will add ACL-style allowed_tools enforcement at the SDK layer
- **T-164-02-02** (sub-minute cron + parse-loop DoS) — Mitigation upheld: per-agent in-flight mutex (`inFlight.has(def.name)`), daily budget cap halts spawns, concurrent cap bounds parallel runs to 3
- **T-164-02-03** (race past cap) — Mitigation upheld: MULTI/EXEC atomic INCR+GET, DECR rollback on overflow — locked by `budget-gate.test.ts` Test 2 ("active=3 cap=3 → blocked; active_count stays 3, NOT 4")
- **T-164-02-04** (`HOME=/root` Anthropic creds exposure) — Accepted per `feedback_subscription_only` + `reference_anthropic_subscription_state`; same trust boundary as the chat path
- **T-164-02-05** (spend counter miss on Redis incr fail after SDK billed) — Mitigation upheld: spend INCRBY happens AFTER the SDK loop AND BEFORE inbox writeback; INCRBY failure is logged but inbox is still attempted (best-effort accounting); Phase 165 adds Anthropic billing reconciliation
- **T-164-02-06** (CLI bypasses autonomous_enabled) — Accepted; documented in `cli-trigger.ts` module docblock; daily + concurrent caps still enforced inside `runAgent()`

## Known Stubs

- **`buildMcpServers(names)` returns `{}` for v34** — autonomous agents inherit MCP servers from the vault's `.claude/mcp.json` (created by Phase 162-01 scaffolder) via `settingSources: ['project']`. The `mcp_servers` array from the agent definition is parsed-and-stored (Phase 164-01) but currently unused at the SDK layer. Documented in `scheduler.ts` `buildMcpServers()` docblock as deferred to Phase 165. NOT a blocker — the vault `.claude/mcp.json` already includes the luse + filesystem servers the sample agents reference.
- **SDK per-run timeout is a soft warning, not a hard abort** — `setTimeout` fires `logger.error(...)` after `maxTurns * 60s` (capped at 10min) but does NOT abort the SDK iteration. The SDK's own `maxTurns` + `maxBudgetUsd` are the actual hard stops. Hard timeout requires `AbortController` plumbed into the SDK, deferred to Phase 165 polish.

## Self-Check

### Files Created

- `livos/packages/livinityd/source/modules/autonomous-scheduler/budget-gate.ts` — FOUND
- `livos/packages/livinityd/source/modules/autonomous-scheduler/budget-gate.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/autonomous-scheduler/scheduler.ts` — FOUND
- `livos/packages/livinityd/source/modules/autonomous-scheduler/scheduler.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/autonomous-scheduler/cli-trigger.ts` — FOUND

### Files Modified

- `livos/packages/livinityd/source/cli.ts` — early-branch + help block updated
- `livos/packages/livinityd/source/modules/autonomous-scheduler/index.ts` — barrel re-exports added
- `livos/packages/livinityd/source/index.ts` — import + field + start() wire-up + stop() teardown

### Commits

- `d44e2ac8` — FOUND on master
- `fd3d46fa` — FOUND on master
- `af4101ed` — FOUND on master
- `9be8e311` — FOUND on master

### Sacred + Guards

All 6 SHAs match the pre-plan baseline byte-for-byte:
- sdk-agent-runner.ts → `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- luse-system-prompt.ts (D-09) → `2083f0a3dfc798b4841613b9576b94929f2faf2f`
- agent-prompt-builder.ts (P161-02) → `dc1831f5f284656dc3bd07babf972cfb02b815c6`
- agent-session.ts → `7c690d59ea08b6450da1d5bd243d06e62a70d473`
- vault-scaffolder.ts → `5ddfd06508e11554ae80a7a57b269a4835bf6cdb`
- modules/scheduler/index.ts → `e4da58572b9b6eca2bf41afb0f8306227a0f4911`

`git diff HEAD~5..HEAD -- liv/packages/core/src/agent-session.ts` = 0 lines.

## Self-Check: PASSED
