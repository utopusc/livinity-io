---
phase: 164-autonomous-scheduler
plan: 04
subsystem: livinityd / autonomous-scheduler / vault-templates
tags:
  - autonomous-scheduler
  - sample-agents
  - vault-templates
  - phase-164
  - v34
dependency-graph:
  requires:
    - Phase 162-01 vault-scaffolder (already SHIPPED) — recursive fs.cp force:false picks up the new template files automatically with zero code changes
    - Phase 164-01 parseAgentDefinition() (already SHIPPED) — sample-agents.test.ts dynamically imports the parser to lock contracts
    - 164-CONTEXT.md lines 23-46 (nightly-backup-audit spec) + lines 155-176 (pr-watcher spec + safety override)
  provides:
    - vault-templates/livos-agents/nightly-backup-audit.md — bundled sample agent: nightly disk + backup audit, ships disabled
    - vault-templates/livos-agents/pr-watcher.md — bundled sample agent: GitHub PR review surfacer, ships disabled, emits __NO_ACTION_NEEDED__ on quiet polls
    - sample-agents.test.ts — round-trip contract lock (every locked field of both samples, plus safety-grep audit)
  affects:
    - downstream: 164-02 scheduler (when planned) will discover both samples in /home/bruce/livinity-vault/livos-agents/ at boot; both ship enabled:false so the scheduler registers them as inert until operator opt-in
    - downstream: 164-05 Mini PC deploy + smoke test will use these two files as the manual-trigger fixtures
tech-stack:
  added: []
  patterns:
    - "dynamic import for parser to allow parser-absent skip" (sample-agents.test.ts:43-49)
    - "describe.skipIf(!parseAgentDefinition)" (mirrors vitest resilience patterns elsewhere in 164-01 / 164-03 tests)
    - "regex grep on raw markdown for ^enabled: true$" (audit lock — prevents the safety contract from being silently flipped in the template tree)
key-files:
  created:
    - livos/packages/livinityd/source/data/vault-templates/livos-agents/nightly-backup-audit.md
    - livos/packages/livinityd/source/data/vault-templates/livos-agents/pr-watcher.md
    - livos/packages/livinityd/source/modules/autonomous-scheduler/sample-agents.test.ts
  modified: []
  deleted:
    - livos/packages/livinityd/source/data/vault-templates/livos-agents/.gitkeep
decisions:
  - Both samples ship enabled:false (CONTEXT.md line 176 override) — operator must edit their vault copy at /home/bruce/livinity-vault/livos-agents/<name>.md and flip to true to activate. Safety lock enforced by sample-agents.test.ts Test 3 in CI.
  - pr-watcher body documents the __NO_ACTION_NEEDED__ sentinel as the silence contract — scheduler (164-02 when planned) scans the agent's final message for this token and SKIPS writing an inbox entry, so 30-minute polls don't flood the operator's Obsidian inbox on quiet days.
  - Test file uses dynamic-import + describe.skipIf for parser-absent resilience even though Phase 164-01 is already shipped — this is per the plan spec to keep the wave-1 ordering invariant (this plan must remain runnable independent of 164-01's ship state).
  - .gitkeep removed because the directory is no longer empty — git tracks the two real markdown files.
  - Vault-scaffolder.ts is byte-identical (verified via `git diff --stat`) — the recursive walkTree + fs.cp force:false at 162-01 lines 65-82 picks up the new files with zero scaffolder modification.
metrics:
  duration_minutes: ~8
  tasks_completed: 2
  tests_added: 3 (sample-agents.test.ts — 3 PASS, full autonomous-scheduler module suite 29 PASS)
  files_created: 3
  files_modified: 0
  files_deleted: 1
  completed: 2026-05-19
---

# Phase 164 Plan 04: Sample Autonomous Agents Summary

Two sample autonomous agents (`nightly-backup-audit.md` and `pr-watcher.md`) shipped under `livos/packages/livinityd/source/data/vault-templates/livos-agents/`, both with `enabled: false` per the operator-explicit-opt-in safety override. A vitest contract lock (`sample-agents.test.ts`) parses both files via the Phase 164-01 parser and asserts every locked field, plus a regex audit lock that trips CI red if anyone ever flips a sample to `enabled: true` in the bundled template tree. Vault-scaffolder.ts is byte-identical — the recursive `fs.cp force:false` in Phase 162-01 picks up the new files automatically on next boot. Sacred SHA, D-09, D-NO-NEW-DEPS, Phase 161-02 helper, agent-session.ts, and Phase 162 scaffolder all untouched.

## What shipped

### `livos/packages/livinityd/source/data/vault-templates/livos-agents/nightly-backup-audit.md`

YAML frontmatter (8 fields, exact spec):

```yaml
name: nightly-backup-audit
schedule: "0 3 * * *"
model: claude-sonnet-4-6
max_turns: 15
max_budget_usd: 3
allowed_tools: ["Read", "Bash", "Glob", "Grep"]
mcp_servers: ["luse", "filesystem"]
enabled: false
```

Body (markdown prompt) instructs the agent to:
- Audit `/opt/livos/data/backups/` for freshness, total size, and day-over-day delta.
- Surface failed / incomplete backups via `journalctl --since "24 hours ago" -u 'livos-backup*'`.
- Raise WARN on `/opt` >80% disk usage, FAIL on >90%.
- Output a structured `## Summary / ## Detail / ## Recommendations` markdown report with `Status: PASS|WARN|FAIL`.

### `livos/packages/livinityd/source/data/vault-templates/livos-agents/pr-watcher.md`

YAML frontmatter (8 fields, exact spec):

```yaml
name: pr-watcher
schedule: "*/30 * * * *"
model: claude-haiku-4-5
max_turns: 5
max_budget_usd: 0.50
allowed_tools: ["Bash", "Read"]
mcp_servers: []
enabled: false
```

Body documents the silence-is-golden contract: every 30 minutes the agent runs `gh pr list --repo utopusc/livinity-io --json ...`, filters for awaiting-review / blocked / stale PRs, and EITHER produces a markdown summary OR emits the literal token `__NO_ACTION_NEEDED__` (the scheduler — Phase 164-02 when planned — detects this sentinel and skips writing an inbox file so the operator's Obsidian inbox stays clean on quiet days).

### `livos/packages/livinityd/source/modules/autonomous-scheduler/sample-agents.test.ts`

Three vitest assertions:

1. **nightly-backup-audit lock** — `parseAgentDefinition()` round-trips the file and every field matches (name, schedule, model, maxTurns=15, maxBudgetUsd=3, allowedTools, mcpServers=['luse','filesystem'], enabled=false, body length >50).
2. **pr-watcher lock** — same shape (name, schedule '*/30 * * * *', haiku-4-5, 5 turns, $0.5, Bash+Read, no MCP, enabled=false) PLUS `body.toContain('__NO_ACTION_NEEDED__')` to lock the silence sentinel.
3. **enabled:true audit** — regex grep across both files for `^enabled: true$` — count MUST be 0. Trips CI red if anyone ever flips a sample to enabled in the template tree (deployed vault copies at `/home/bruce/livinity-vault/livos-agents/<name>.md` remain operator-editable — that's by design; only the bundled template is locked).

Test file dynamically imports the parser via `await import('./agent-definition-parser.js')` and the describe block self-skips via `describe.skipIf(!parseAgentDefinition)` — wave-1 independence preserved even though 164-01 happens to be shipped today.

### Removed: `.gitkeep`

Placeholder no longer needed — the directory now tracks two real markdown files.

## Verification (plan `<verification>` block)

| Check | Expected | Actual | Pass |
| --- | --- | --- | --- |
| `ls livos-agents/` | nightly-backup-audit.md + pr-watcher.md only | matched | ✅ |
| `grep -E "^enabled: false$"` | 2 matches | 2 matches (1 per file) | ✅ |
| `grep -E "^enabled: true$"` | 0 matches | 0 matches | ✅ |
| `git diff --stat vault-scaffolder.ts` | empty | empty | ✅ |
| `git diff --stat livinityd/package.json` | empty | empty | ✅ |
| Sacred SHA `f3538e1d...` on sdk-agent-runner.ts | unchanged | last touch `fc55c795` (P77-02) | ✅ |
| `agent-session.ts` unchanged | unchanged | last touch `81ca26d4` (P163-02.5) | ✅ |
| `pr-watcher.md` contains `__NO_ACTION_NEEDED__` | 1 match | 1 match | ✅ |
| `npm run test:run -- modules/autonomous-scheduler/sample-agents.test.ts` | 3 PASS | 3 PASS | ✅ |
| Full autonomous-scheduler suite | no regression | 29 PASS (3 new + 14 parser + 12 inbox) | ✅ |

## Decisions made

- **Both samples ship `enabled: false`** — operator-explicit-opt-in safety, per CONTEXT.md line 176 override. Test 3 in sample-agents.test.ts locks this contract for the bundled template tree (deployed vault copies stay editable by design).
- **`__NO_ACTION_NEEDED__` documented in pr-watcher body** — the silence sentinel that prevents 48 nothing-burger inbox files per day on quiet polls. The exact token is locked by Test 2.
- **Dynamic-import + skipIf for the parser** — keeps this plan wave-1 independent of 164-01's ship state. 164-01 happens to be shipped, so the suite runs all 3 tests now; if 164-01 were ever pulled, this suite would self-skip rather than red-light the entire livinityd test run.
- **Vault-scaffolder.ts byte-identical** — verified via `git diff --stat`. The recursive walkTree at 162-01 lines 65-82 + `fs.cp force:false` at lines 142-146 picks up the two new files automatically on next boot.
- **.gitkeep removed** — no longer needed; the directory now tracks two real markdown files.

## Deviations from plan

None — plan executed exactly as written. Both tasks shipped on the first try, all assertions matched on the first test run, no auto-fixes triggered.

## Threat surface scan

No new trust boundaries introduced. Phase 164-04 only adds two YAML+markdown template files plus a vitest assertion file — none of these expose new network endpoints, auth paths, file access patterns, or schema changes. The threat register in the plan (T-164-04-01 through T-164-04-04) is unchanged; T-164-04-03 (operator flips enabled:true silently in the template) is the one we actively mitigate via sample-agents.test.ts Test 3.

## Commits

| Commit | Subject |
| --- | --- |
| `9f8c6935` | feat(164-04): add nightly-backup-audit + pr-watcher sample agents (enabled:false) |
| `f2a861f6` | test(164-04): lock sample agent contracts via parser round-trip |

## Self-Check: PASSED

- ✅ `livos/packages/livinityd/source/data/vault-templates/livos-agents/nightly-backup-audit.md` exists
- ✅ `livos/packages/livinityd/source/data/vault-templates/livos-agents/pr-watcher.md` exists
- ✅ `livos/packages/livinityd/source/modules/autonomous-scheduler/sample-agents.test.ts` exists
- ✅ `.gitkeep` removed (verified `! test -e`)
- ✅ Commit `9f8c6935` present in `git log`
- ✅ Commit `f2a861f6` present in `git log`
- ✅ Sacred SHA preserved (sdk-agent-runner.ts last touch `fc55c795` from P77-02, pre-164)
- ✅ Test suite: 3/3 PASS on sample-agents.test.ts; 29/29 PASS on full autonomous-scheduler module
