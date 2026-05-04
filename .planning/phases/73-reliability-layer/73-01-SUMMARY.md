---
phase: 73-reliability-layer
plan: 01
subsystem: nexus-core
tags: [context-manager, summarization, kimi-window, naive-truncation, foundation, reliability]
requires:
  - "@nexus/core/run-store.ts (P67-01)"
  - "@nexus/core/liv-agent-runner.ts (P67-02 — type-only)"
  - "ioredis (already in @nexus/core deps)"
  - "ioredis-mock (devDep, P67-01)"
provides:
  - "ContextManager class with checkAndMaybeSummarize(runId, history) → { summarized, newHistory, tokenCountBefore, tokenCountAfter }"
  - "countTokens(history): number — heuristic Math.ceil(JSON.stringify(h).length / 4)"
  - "Type exports: Message, SummarizationStrategy, ContextManagerOptions"
  - "Redis key liv:agent_run:{runId}:summary_checkpoint (24h TTL)"
  - "Public re-exports from @nexus/core barrel (index.ts) and @nexus/core/lib (lib.ts)"
affects:
  - "Plan 73-03 — wires ContextManager into LivAgentRunner per-iteration hook"
  - "Plan 73-04 — agent-runs.ts via RunQueue → factory → runner → contextManagerHook"
tech-stack:
  added: []
  patterns:
    - "tsx-runnable test harness mirroring run-store.test.ts (P67-01)"
    - "ioredis-mock backend with REDIS_URL fallback skip-if-absent"
    - "Explicit `export { ClassName }` re-export at file foot for greppability (run-store.ts pattern)"
    - "Sanitize-before-embed for synthetic summary content (T-73-01-01 mitigation)"
key-files:
  created:
    - "nexus/packages/core/src/context-manager.ts (363 lines)"
    - "nexus/packages/core/src/context-manager.test.ts (319 lines)"
  modified:
    - "nexus/packages/core/src/index.ts (+11 lines — Phase 73-01 re-export block)"
    - "nexus/packages/core/src/lib.ts (+11 lines — Phase 73-01 re-export block)"
decisions:
  - "Token-count heuristic = Math.ceil(JSON.stringify(history).length / 4) — no real tokenizer dependency (CONTEXT D-11). 4-chars/token over-counts slightly vs real English (~4.5), preferable to under-count + overflow."
  - "summarizationStrategy union kept open via `'truncate-oldest' | 'kimi-summary' | (string & {})` so future strategies plug in without consumer-side type changes. Only 'truncate-oldest' implemented in v31; others throw `summarization strategy <X> not implemented in v31`."
  - "Tool-pair preservation = best-effort + bidirectional: any middle-message that references a tool id present in the last-10 tail (via `tool_use.id` or `tool_result.tool_use_id`) is pulled forward into the preserved set. Test #4 verifies the pair survives."
  - "Synthetic summary content sanitization = HTML-entity escape `<` → `&lt;` and `>` → `&gt;` on user-supplied text BEFORE embedding into `<context_summary>...</context_summary>` (T-73-01-01)."
  - "Algorithm refinement (per plan note): middle = `history.filter(m => !isSystem(m) && !last10Set.has(m))` — works regardless of system-message position, broader than the slice-based reference."
  - "Message type defined locally in context-manager.ts (not imported from liv-agent-runner.ts) because liv-agent-runner.ts only exports assistant-only payload types (`AssistantContentBlock`, `AssistantMessageEventPayload`). Defining a broader role-bearing `Message` here keeps ContextManager decoupled from the runner's internal event-payload contract."
  - "TTL constant declared as literal `86400` (with `// 24 * 60 * 60` inline comment) rather than computed expression — required for the plan's grep-based shape verification."
metrics:
  duration_seconds: 588
  completed: "2026-05-04T21:58:50Z"
  tests_total: 8
  tests_passed: 8
  files_created: 2
  files_modified: 2
---

# Phase 73 Plan 01: ContextManager Summary

ContextManager class shipped — naive truncate-oldest summarization at 75% Kimi window threshold, persists post-summary history to Redis `liv:agent_run:{runId}:summary_checkpoint` with 24h TTL.

## Files Created / Modified

| File | Lines | Status |
|------|-------|--------|
| `nexus/packages/core/src/context-manager.ts` | 363 | Created |
| `nexus/packages/core/src/context-manager.test.ts` | 319 | Created |
| `nexus/packages/core/src/index.ts` | +11 | Modified |
| `nexus/packages/core/src/lib.ts` | +11 | Modified |

Both new files exceed plan min_lines (180 / 150).

## Test Results

```
ContextManager tests — backend: ioredis-mock
  PASS  sub-threshold no-op returns same reference; no Redis calls
  PASS  short-history fast path skips summarization even if bytes huge
  PASS  above-threshold drops middle and preserves system + last 10
  PASS  preserves tool_use/tool_result pairs in last 10
  PASS  injects synthetic <context_summary> message at index 1
  PASS  persists summary_checkpoint to Redis with 24h TTL
  PASS  countTokens returns Math.ceil(JSON.stringify(h).length / 4)
  PASS  non-truncate-oldest strategy throws "not implemented in v31"

8 pass, 0 fail
```

Runtime: ~2s. All 6 plan-required cases plus 2 bonus cases (countTokens heuristic + non-truncate strategy throw).

## Test-Redis Strategy

**ioredis-mock chosen** (already in @nexus/core devDependencies from P67-01 per `package.json:64`). Mirrors the dual-strategy escape hatch from `run-store.test.ts`:

```typescript
try {
  const mod: any = await import('ioredis-mock');
  createRedis = () => new (mod.default ?? mod)();
} catch {
  // Fallback: REDIS_URL skip-if-absent
}
```

Rationale: deterministic, no network dependency, identical surface (`set`, `get`, `ttl`, `expire`, `publish`, `subscribe`, `duplicate`).

## Tool-Use / Tool-Result Middle-Pull Strategy

**Bidirectional pull implemented** (more thorough than the plan's "best-effort accept ship-without" lower bar):

1. Collect `Set<toolId>` from blocks in the last-10 tail (union of `tool_use.id` and `tool_result.tool_use_id`).
2. Walk the discarded middle; any message referencing one of those IDs (via either block type) gets pulled into preserved.
3. The "first dropped user text" snippet excludes pulled-back messages — only genuinely dropped messages contribute to the elision count.

Test #4 verifies the pair survives: place `tool_use(id='tu_pair')` in second-to-last position and `tool_result(tool_use_id='tu_pair')` in last position; both stay in `newHistory`.

## Message Type Sourcing

**Defined locally in `context-manager.ts` — NOT imported from `liv-agent-runner.ts`.**

Reason: `liv-agent-runner.ts` only exports `AssistantContentBlock` and `AssistantMessageEventPayload`, which are assistant-only and intentionally narrower than what ContextManager needs (it must reason about user, assistant, system, AND tool-result roles). Defining a broader role-bearing `Message` type here decouples ContextManager from the runner's internal event payload contract; the runner can freely evolve its event shape without breaking ContextManager's surface.

The runner author would need to MAP its internal type into `Message[]` at the integration point in 73-03 — that's a one-shot conversion at the hook boundary, not a long-running coupling.

## Synthetic Message Sanitization (T-73-01-01)

**Mitigation implemented:** before embedding the first-dropped-user-text snippet into the synthetic `<context_summary>` system message, run `sanitizeForSummaryEmbed(text)`:

```typescript
function sanitizeForSummaryEmbed(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
```

This defends against a malicious or adversarial user message containing the literal string `</context_summary>` which would otherwise close the synthetic block early and inject content into the surrounding system-prompt scope (allowing the user to spoof system instructions).

The 200-character truncation `text.slice(0, LAST_TOPIC_MAX_CHARS)` is applied AFTER sanitization to keep the synthetic message bounded.

## Sacred File Verification

```
Start of task:  4f868d318abff71f8c8bfbcf443b2393a553018b  ✓ matches required SHA
End of task:    4f868d318abff71f8c8bfbcf443b2393a553018b  ✓ matches required SHA
```

`nexus/packages/core/src/sdk-agent-runner.ts` untouched.

## Build Status

```
$ npx tsc  (in nexus/packages/core)
exit 0
```

Zero TypeScript errors in `context-manager.ts` or `context-manager.test.ts`. Test file is parsed as ES module via top-of-file `export {};` (necessary because the test uses dynamic `await import()` exclusively — without a static import or export, TypeScript treats the file as a script and rejects top-level `await` per TS1375). Pattern documented inline in the test file header.

## What Was NOT Touched

Confirming hard rules + scope_guard:

- `nexus/packages/core/src/sdk-agent-runner.ts` — sacred SHA unchanged (D-05)
- `nexus/packages/core/src/run-store.ts` — read-only here (D-06)
- `nexus/packages/core/src/liv-agent-runner.ts` — read-only here (D-07)
- `livos/packages/livinityd/source/modules/ai/agent-runs.ts` — not touched (D-08; Plan 73-04 territory)
- Broker module / livinityd / Server4 — not touched (D-NO-BYOK / D-NO-SERVER4)
- Zero new dependencies added (D-NO-NEW-DEPS); only existing `ioredis` + dev `ioredis-mock` consumed
- Zero `nexus:agent_run:*` Redis prefix introduced — only `liv:agent_run:*` (CONTEXT D-04)
- Zero real-tokenizer imports — heuristic-only per CONTEXT D-11

## Cross-Agent Commit Note

This plan ran concurrently with several other parallel worktrees. The GREEN-phase commit was inadvertently absorbed into the orchestrator's `9d4235d9 docs(73-02): complete RunQueue plan` rollup commit (which physically contains all four of this plan's file changes plus the 73-02 SUMMARY). The RED-phase commit `372ddcaf test(73-01): add failing tests for ContextManager` is recorded cleanly. All plan deliverables are present at HEAD; verification scripts pass; sacred SHA invariant holds. No work was lost. Documenting here so future archaeology can map the file changes back to the correct plan.

## Commits

| Phase | Hash | Subject |
|-------|------|---------|
| RED   | `372ddcaf` | test(73-01): add failing tests for ContextManager |
| GREEN | `9d4235d9` | (rolled-up) — context-manager.ts + .test.ts edits + barrel re-exports |

## Self-Check: PASSED

- `nexus/packages/core/src/context-manager.ts` — FOUND
- `nexus/packages/core/src/context-manager.test.ts` — FOUND
- `nexus/packages/core/src/index.ts` ContextManager re-export — FOUND (lines 27-32)
- `nexus/packages/core/src/lib.ts` ContextManager re-export — FOUND
- Commit `372ddcaf` — FOUND in `git log --all`
- Commit `9d4235d9` — FOUND at HEAD
- Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — VERIFIED (`git hash-object` post-task)
- 8/8 tests pass via `npx tsx src/context-manager.test.ts`
- `npx tsc` exit 0 in `nexus/packages/core/`
