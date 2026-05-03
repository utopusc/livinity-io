---
phase: 61
plan: 02
subsystem: livinity-broker/providers
tags:
  - broker
  - provider-stubs
  - openai
  - gemini
  - mistral
  - phase-61
  - wave-2
dependency_graph:
  requires:
    - "Plan 61-01: BrokerProvider interface + AnthropicProvider concrete + registry (with NotImplementedError export)"
    - "Plan 61-01 hand-off note: Plan 02 must add stub files to interface-compile.test.ts file list"
  provides:
    - "OpenAIProvider stub class (livinity-broker/providers/openai-stub.ts)"
    - "GeminiProvider stub class (livinity-broker/providers/gemini-stub.ts)"
    - "MistralProvider stub class (livinity-broker/providers/mistral-stub.ts)"
    - "Registry with full 4-entry Map (anthropic concrete + 3 stubs) — getProvider() now resolves all 4 names"
    - "Grep-guard test (router-no-stub-dispatch.test.ts) blocking accidental stub dispatch in router.ts/openai-router.ts/passthrough-handler.ts"
  affects:
    - "livinity-broker/providers/registry.ts — Map grows from 1 → 4 entries"
    - "livinity-broker/providers/__tests__/interface-compile.test.ts — file list grows from 3 → 6 (now typecheck-gates new stubs)"
tech_stack:
  added: []
  patterns:
    - "Stub-throws-NotImplementedError pattern — interface-only providers compile clean for future drop-in but surface loud, named errors if accidentally invoked (defense-in-depth for T-61-05)"
    - "Grep-guard test pattern — readFileSync on production source + regex assertion at CI time. Catches future regressions where someone wires a stub into router dispatch without needing a runtime integration test"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/openai-stub.ts (47 LOC) — OpenAIProvider; all 3 BrokerProvider methods throw NotImplementedError('openai')"
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/gemini-stub.ts (40 LOC) — GeminiProvider; same pattern, 'gemini' name"
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/mistral-stub.ts (40 LOC) — MistralProvider; same pattern, 'mistral' name"
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/stubs-throw.test.ts (71 LOC) — 12 assertions: 3 providers × (name + request-rejects + streamRequest-rejects + translateUsage-throws-sync)"
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/router-no-stub-dispatch.test.ts (51 LOC) — grep-guard with 4 assertions (3 negative + 1 sanity-floor positive)"
    - ".planning/phases/61-spec-compliance-aliases-provider/deferred-items.md — log of 5 pre-existing 'No test suite found' broker test files (out-of-scope per Rule 3)"
  modified:
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/registry.ts (+9 LOC) — imports + Map entries for OpenAI/Gemini/Mistral stubs (anthropic entry preserved)"
    - "livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/interface-compile.test.ts (+5 LOC) — file list now includes 3 stub paths so tsc --noEmit covers them"
decisions:
  - "Each stub is a SEPARATE FILE (openai-stub.ts / gemini-stub.ts / mistral-stub.ts) rather than a single shared module — Plan-suggested layout, eases future drop-in replacement (one file → one concrete provider impl) and matches LiteLLM-style per-provider class layout from Plan 01"
  - "All 3 stub instances are constructed once at module load (Map initializer) — Map shape stable; throw-on-invocation only. Memory cost negligible (3 instances × ~30 bytes each)"
  - "Stubs registered but grep-guard test enforces NEVER dispatched in v30 (router.ts/openai-router.ts/passthrough-handler.ts must NOT contain getProvider('openai|gemini|mistral')) — D-30-07 + RESEARCH.md R3 mitigation"
  - "interface-compile.test.ts file list extended in this plan (per Plan 01 hand-off) so all 6 providers/ files (interface + 1 concrete + 3 stubs + registry) typecheck-gate together — stops drift between concrete and stub impls"
  - "Sacred file SHA 4f868d318abff71f8c8bfbcf443b2393a553018b — byte-identical pre + post (D-30-07 strictly preserved)"
  - "D-NO-NEW-DEPS preserved — zero new npm packages added; stubs only import from ./interface.js (already shipped by Plan 01)"
metrics:
  duration_minutes: 4
  completed: "2026-05-03"
  task_count: 2
  file_count_created: 6
  file_count_modified: 2
---

# Phase 61 Plan 02: OpenAI/Gemini/Mistral Stub Providers + Registry + Grep-Guard Summary

**One-liner:** Shipped 3 interface-only `BrokerProvider` stubs (OpenAI, Gemini, Mistral) that compile cleanly and throw `NotImplementedError(name)` on every method invocation, grew the provider registry from 1 → 4 entries, and added a grep-guard test that scans `router.ts`/`openai-router.ts`/`passthrough-handler.ts` to ensure no production source dispatches to the stubs in v30.

## Tasks

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Wave 0 RED tests for stubs-throw + router-no-stub-dispatch grep-guard | Y | `39c93f62` |
| 2 | Implement OpenAI/Gemini/Mistral stubs + registry seeding (turn stubs-throw GREEN) | Y | `f1f7e68c` |

Plus a docs-only follow-up commit to log out-of-scope broker test discoveries: `4de7bb04`.

## Stub Pattern (per file, all 3 follow this shape)

```typescript
import {
  type BrokerProvider,
  type ProviderRequestOpts,
  type ProviderRequestParams,
  type ProviderResponse,
  type ProviderStreamResult,
  type UsageRecord,
  NotImplementedError,
} from './interface.js'

export class OpenAIProvider implements BrokerProvider {
  readonly name = 'openai'
  async request(_p, _o)        { throw new NotImplementedError('openai') }
  async streamRequest(_p, _o)  { throw new NotImplementedError('openai') }
  translateUsage(_r)           { throw new NotImplementedError('openai') }
}
```

Sync `translateUsage` throws synchronously (per `BrokerProvider` interface — return type is `UsageRecord`, not `Promise<UsageRecord>`); the two async methods reject with the same error. Test `stubs-throw.test.ts` asserts both behaviors plus error `name === 'NotImplementedError'` and message regex `/Provider '(openai|gemini|mistral)' not implemented in v30/`.

## Registry Diff

`livos/packages/livinityd/source/modules/livinity-broker/providers/registry.ts`

| Before (Plan 01) | After (Plan 02) |
|------------------|-----------------|
| 1 entry: `anthropic` | 4 entries: `anthropic` (concrete) + `openai`, `gemini`, `mistral` (stubs) |

```typescript
export const providers = new Map<string, BrokerProvider>([
  ['anthropic', new AnthropicProvider()],
  ['openai',    new OpenAIProvider()],
  ['gemini',    new GeminiProvider()],
  ['mistral',   new MistralProvider()],
])
```

`getProvider('openai' | 'gemini' | 'mistral')` returns the stub instance — invoking any method on it throws `NotImplementedError`. The grep-guard test (next section) blocks any production code path from making such a call.

## Grep-Guard Test

`livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/router-no-stub-dispatch.test.ts`

Reads three production source files via `readFileSync` and asserts:

| Assertion | File | Pattern |
|-----------|------|---------|
| MUST NOT match | `router.ts` | `/getProvider\(\s*['"](openai\|gemini\|mistral)['"]/` |
| MUST NOT match | `openai-router.ts` | (same) |
| MUST NOT match | `passthrough-handler.ts` | (same) |
| MUST match (sanity floor) | `passthrough-handler.ts` | `/getProvider\(\s*['"]anthropic['"]/` |

All 4 assertions GREEN. Future PRs that wire a stub into dispatch (e.g., adding `if (model.startsWith('openai/')) getProvider('openai')` to a router) will fail this test at CI time.

T-61-05 mitigation per phase threat register.

## Test Results

| Suite | Plan 01 baseline | Plan 02 added | Total | Status |
|-------|------------------|---------------|-------|--------|
| `providers/__tests__/anthropic.test.ts` | 5 | 0 | 5 | GREEN |
| `providers/__tests__/interface-compile.test.ts` | 1 (3 files) | 0 (now 6 files) | 1 | GREEN |
| `providers/__tests__/stubs-throw.test.ts` | — | 12 | 12 | GREEN |
| `providers/__tests__/router-no-stub-dispatch.test.ts` | — | 4 | 4 | GREEN |
| **`providers/` total** | **6** | **+16** | **22** | **22/22 GREEN** |
| Full broker suite | 116 (pre-Plan-02) | +6 net (12+4 new − 10 already counted via providers/) | 116 | 116/116 GREEN |

Wave 0 → Wave 2 trajectory:
- After Task 1 (RED): `stubs-throw` import-fails (0/12 — file doesn't exist); `router-no-stub-dispatch` 4/4 GREEN; `anthropic` 5/5; `interface-compile` 1/1 (still 3 files). Total reachable: 10/22.
- After Task 2 (GREEN): all 22/22 GREEN. Stubs implemented, registry seeded, interface-compile now covers 6 files.

Pre-existing 5 "No test suite found" broker failures: documented in `deferred-items.md` (out of scope per Rule 3 scope boundary; baseline-confirmed reproduction without Plan 02 changes).

## Sacred File Integrity

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   # MATCH — byte-identical pre + post
```

D-30-07 strictly preserved. No edits to `nexus/` whatsoever in this plan.

## Commits Created

| SHA | Type | Subject |
|-----|------|---------|
| `39c93f62` | test | `test(61-02): wave 0 RED tests for stub providers + router grep-guard` |
| `f1f7e68c` | feat | `feat(61-02): OpenAI/Gemini/Mistral stub providers + registry seeding` |
| `4de7bb04` | docs | `docs(61-02): log pre-existing 'No test suite found' broker failures` |

## D-NO-NEW-DEPS Audit

GREEN. Zero new npm packages. Stubs import only from `./interface.js` (already shipped by Plan 01 — exports `BrokerProvider`, `ProviderRequestParams`, `ProviderRequestOpts`, `ProviderResponse`, `ProviderStreamResult`, `UsageRecord`, `NotImplementedError`). Test files import `vitest` (existing) + `node:fs`/`node:url`/`node:path` (Node built-ins).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Hand-off forwarded] Extended `interface-compile.test.ts` file list to include 3 new stub files**
- **Found during:** Task 2 (registry update)
- **Issue:** Plan 02 created 3 new TypeScript stub files but the existing typecheck gate (`interface-compile.test.ts`) hardcoded a 3-file list (interface, anthropic, registry). New stubs would have been silently uncovered by the compile gate — a future type drift between `BrokerProvider` and a stub would not be caught until manual `tsc --noEmit`.
- **Fix:** Extended the file list to 6 entries. Plan 01's hand-off section explicitly anticipated this ("Plan 02 must add the new stub files to providers/__tests__/interface-compile.test.ts's `files` array") — applied verbatim.
- **Files modified:** `providers/__tests__/interface-compile.test.ts`
- **Commit:** `f1f7e68c`

**2. [Rule 3 scope boundary] Out-of-scope `No test suite found` broker test failures logged, not fixed**
- **Found during:** Task 2 verify (full broker suite run)
- **Issue:** 5 broker test files (`integration.test.ts`, `openai-integration.test.ts`, `openai-sse-adapter.test.ts`, `sse-adapter.test.ts`, `translate-request.test.ts`) report `Error: No test suite found in file` under vitest. Total broker suite: 5 failed test files / 11 passed test files / 116 individual tests passed.
- **Diagnosis:** Confirmed pre-existing via `git stash && vitest run && git stash pop` — same 5 failures in pre-Plan-02 baseline. NOT caused by Plan 02 changes.
- **Action:** Per Rule 3 scope boundary — DID NOT attempt to fix. Logged in `.planning/phases/61-spec-compliance-aliases-provider/deferred-items.md` for future investigation phase.
- **Files modified:** `.planning/phases/61-spec-compliance-aliases-provider/deferred-items.md` (NEW)
- **Commit:** `4de7bb04`

### Auth Gates

None encountered — all work was local code + tests, no SSH, no live API.

## Wave 2 → Wave 3 Hand-off

### To Plan 03 (Wave 3 — model alias resolver)

- `providers/registry.ts` Map now has 4 entries — Wave 3's alias resolver outputs canonical Claude family model IDs (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`) which `passthrough-handler.ts` will pass to `getProvider('anthropic').request(...)`. Wave 3 does NOT need to touch the registry — model-prefix-based dispatch (e.g., `openai/gpt-4o → OpenAIProvider`) defers to v30+ post-MVP.
- The grep-guard test stays in place across Wave 3 — Wave 3 should NOT add `getProvider('openai|gemini|mistral')` to any router/handler. If alias resolution maps `gpt-4` → `claude-opus-4-7`, the dispatch still goes through `getProvider('anthropic')` (per CONTEXT.md D1 alias resolution flow §3 — "v30 broker still forwards everything to Anthropic regardless of input model alias").
- If Wave 3 adds new files under `livinity-broker/` that contain `getProvider(...)` calls, append them to the `FILES` array in `router-no-stub-dispatch.test.ts` so they're covered by the grep-guard.

### To Plan 04 (Wave 4 — rate-limit header forwarding)

- Plan 02 did NOT touch `passthrough-handler.ts`. The 6 Wave 4 insertion-point markers from Plan 01 (sync + streaming × Anthropic + OpenAI = 4 actual call sites + 2 read-site markers) remain in place at the same line numbers. Wave 4 fills them in.
- `result.upstreamHeaders` is reachable from BOTH passthrough handlers — see `61-01-SUMMARY.md` for exact line numbers and Pitfall R9 (must precede `flushHeaders` for streaming).

## Self-Check: PASSED

**Files exist:**
- `livos/packages/livinityd/source/modules/livinity-broker/providers/openai-stub.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/providers/gemini-stub.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/providers/mistral-stub.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/stubs-throw.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/providers/__tests__/router-no-stub-dispatch.test.ts` — FOUND
- `.planning/phases/61-spec-compliance-aliases-provider/deferred-items.md` — FOUND

**Commits exist:**
- `39c93f62` — FOUND
- `f1f7e68c` — FOUND
- `4de7bb04` — FOUND

**Sacred file SHA:**
- `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b` — MATCH (byte-identical to pre-plan baseline)
