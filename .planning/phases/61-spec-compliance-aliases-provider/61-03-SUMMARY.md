---
phase: 61
plan: 03
subsystem: livinity-broker/alias-resolver
tags:
  - broker
  - alias-resolver
  - redis-seed
  - phase-61
  - wave-3
dependency_graph:
  requires:
    - "Plan 61-01: BrokerProvider interface + AnthropicProvider concrete + registry (passthrough-handler.ts dispatches via getProvider('anthropic'))"
    - "Plan 61-02: stub providers + grep-guard test (registry has 4 entries; v30 routing still always anthropic)"
    - "ioredis Redis client at this.ai.redis (livinityd boot)"
  provides:
    - "alias-resolver.ts (Redis-backed resolveModelAlias, async, 5s TTL cache, hardcoded fallback)"
    - "seed-default-aliases.ts (SETNX-based boot seed of 10 default aliases)"
    - "Anthropic /v1/messages route alias-resolves body.model (BUG FIX — was previously 404 for body.model='opus')"
    - "OpenAI /v1/chat/completions route alias-resolves via the same single-source resolver"
    - "openai-translator.ts:resolveModelAlias is now a 1-line re-export shim from alias-resolver.js"
    - "Boot-time seed in livinityd/source/index.ts immediately after seedBuiltinTools"
  affects:
    - "livinity-broker/openai-translator.ts — 39-line hardcoded cascade (lines 32-70) DELETED, replaced with re-export shim"
    - "livinity-broker/openai-router.ts:189 — sync call → async await"
    - "livinity-broker/passthrough-handler.ts — buildAnthropicBodyFromOpenAI now takes pre-resolved actualModel; caller passthroughOpenAIChatCompletions awaits new resolver"
    - "livinity-broker/router.ts — NEW alias resolution call site (Anthropic route bug fix)"
    - "livinityd/source/index.ts — seedDefaultAliases mounted in boot sequence"
    - "openai-translator.test.ts — 6 sync resolver test blocks rewritten to async"
    - "passthrough-handler.test.ts + passthrough-streaming-integration.test.ts — makeLivinityd / makeMinimalLivinityd mocks gain ai.redis"
tech_stack:
  added: []
  patterns:
    - "Redis-backed config with 5s in-memory TTL cache — admin runtime updates take effect within 5s without restart (FR-BROKER-D1-02)"
    - "SETNX seeder mirroring Phase 50 seed-builtin-tools pattern but preserving admin runtime edits across reboot (vs Phase 50's unconditional SET)"
    - "Hardcoded fallback on Redis error — broker never 5xx-s purely because of Redis blip (RESEARCH.md Open Q4)"
    - "claude-* prefix passthrough — trust caller for explicit model IDs (resolver step 3); avoids Redis pollution from per-version model strings"
    - "Lowercase + trim before key concatenation — T-61-07 (key-injection) mitigation"
key_files:
  created:
    - "livos/packages/livinityd/source/modules/livinity-broker/alias-resolver.ts (78 LOC) — async resolveModelAlias(redis, requested), AliasRedisLike interface, _resetAliasCacheForTest seam"
    - "livos/packages/livinityd/source/modules/livinity-broker/seed-default-aliases.ts (84 LOC) — SETNX seeder, DEFAULT_ALIASES with 10 entries (gpt-4 → Sonnet per RESEARCH.md A2 override), SeedRedisLike interface"
    - "livos/packages/livinityd/source/modules/livinity-broker/__tests__/alias-resolver.test.ts (95 LOC) — 7 tests (known/case-insensitive/unknown-fallback/claude-passthrough/cache-TTL/Redis-error/whitespace-trim)"
    - "livos/packages/livinityd/source/modules/livinity-broker/__tests__/seed-default-aliases.test.ts (108 LOC) — 5 tests (all-10-seeded/gpt-4-Sonnet-override/SETNX-preserves/sentinel-overwrite/setnx-fallback)"
  modified:
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts (-58 LOC, +12 LOC) — 39-line hardcoded resolveModelAlias DELETED; replaced with re-export shim"
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts (+1 await) — line 189 now async"
    - "livos/packages/livinityd/source/modules/livinity-broker/router.ts (+22 LOC) — NEW alias resolution call site for Anthropic /v1/messages route (BUG FIX)"
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts (+8 LOC, -2 LOC) — buildAnthropicBodyFromOpenAI takes actualModel; passthroughOpenAIChatCompletions awaits new resolver"
    - "livos/packages/livinityd/source/index.ts (+11 LOC) — seedDefaultAliases mounted in boot sequence after seedBuiltinTools"
    - "livos/packages/livinityd/source/modules/livinity-broker/openai-translator.test.ts (+~25 LOC, -~50 LOC) — 6 sync resolver test blocks rewritten to async + cache reset between blocks"
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.test.ts (+8 LOC) — makeLivinityd mock gains ai.redis with permissive get returning null"
    - "livos/packages/livinityd/source/modules/livinity-broker/passthrough-streaming-integration.test.ts (+5 LOC) — makeMinimalLivinityd gains same ai.redis mock"
decisions:
  - "gpt-4 → claude-sonnet-4-6 (NOT claude-opus-4-7 per CONTEXT.md) — RESEARCH.md A2 override, planner-confirmed in PLAN.md objective. Preserves existing openai-translator.ts:60-67 behaviour and avoids 3-5x cost regression on existing Bolt.diy/Open WebUI gpt-4 traffic. Admin can opt into Opus per-deployment via redis-cli SET livinity:broker:alias:gpt-4 claude-opus-4-7 (takes effect within 5s)."
  - "Anthropic broker route /v1/messages NOW alias-resolves body.model (was a Phase 57 bug — passthrough forwarded literal 'opus' to Anthropic which returned 404). Documented as bug fix per RESEARCH.md State of the Art table; no internal callers existed per Phase 57 grep audit."
  - "Resolver hardcoded fallback claude-sonnet-4-6 on Redis error — broker never 5xx-s purely because of a Redis blip (RESEARCH.md Open Q4). Resilience > strict-correctness."
  - "Cache TTL 5s — single-process livinityd; if v31+ goes multi-process, switch to Redis pub/sub for invalidation (RESEARCH.md Pitfall 2; documented in alias-resolver.ts source comment)."
  - "Test seam _resetAliasCacheForTest exported from alias-resolver.ts — vitest fake-timers + cache reset between blocks ensures deterministic TTL test"
  - "Sacred file SHA 4f868d318abff71f8c8bfbcf443b2393a553018b — byte-identical pre + post (D-30-07 strictly preserved)"
  - "D-NO-NEW-DEPS preserved — zero new npm packages; uses existing ioredis client (@livinityd already has ioredis ^5.4.0 from Phase 22)"
metrics:
  duration_minutes: 13
  completed: "2026-05-03"
  task_count: 3
  file_count_created: 4
  file_count_modified: 8
---

# Phase 61 Plan 03: Redis-backed Model Alias Resolver + Boot Seed + Anthropic Route Bug Fix Summary

**One-liner:** Replaced the hardcoded 39-line `resolveModelAlias` if/else cascade in `openai-translator.ts:32-70` with a Redis-backed async resolver (5s TTL cache + hardcoded fallback) plus a SETNX boot seeder, and wired the same resolver into the Anthropic `/v1/messages` route as a bug fix (was previously 404-ing on `body.model='opus'`). 12 new Wave 0 tests + 6 rewritten existing tests; full broker suite 128/128 GREEN; sacred file SHA byte-identical.

## Tasks

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Wave 0 RED tests for alias-resolver + seed-default-aliases | Y | `c2da2592` |
| 2 | Implement alias-resolver.ts + seed-default-aliases.ts (turn Wave 0 GREEN) | Y | `78fb9786` |
| 3 | Wire alias resolver into both broker routes + supersede openai-translator + boot-mount seeder | Y | `2741e6f0` |

## Resolver File + Signature

**File:** `livos/packages/livinityd/source/modules/livinity-broker/alias-resolver.ts` (78 LOC)

```typescript
export interface AliasRedisLike { get(key: string): Promise<string | null> }
export async function resolveModelAlias(
	redis: AliasRedisLike,
	requested: string,
): Promise<{actualModel: string; warn: boolean}>
export function _resetAliasCacheForTest(): void
```

**Resolution order:**
1. Lowercase + trim input.
2. Redis `GET livinity:broker:alias:<input>` — return verbatim if hit, no warn.
3. If input starts with `claude-`, pass through verbatim (no warn).
4. Otherwise look up `default` alias (Redis or hardcoded `claude-sonnet-4-6`), warn=true.
5. On Redis error at step 2 or 4: return `{claude-sonnet-4-6, warn:true}` — no throw.

In-memory `Map<alias, {value, expiresAt}>` cache, 5s TTL. Admin runtime updates via `redis-cli SET livinity:broker:alias:foo claude-haiku-4-5-20251001` take effect on the next request after the TTL window (≤5s).

## Default Alias Seed List (SETNX-backed)

**File:** `livos/packages/livinityd/source/modules/livinity-broker/seed-default-aliases.ts` (84 LOC)

| Alias | Resolved Claude Model |
|-------|----------------------|
| `opus` | `claude-opus-4-7` |
| `sonnet` | `claude-sonnet-4-6` |
| `haiku` | `claude-haiku-4-5-20251001` |
| `claude-3-opus` | `claude-opus-4-7` |
| `claude-3-sonnet` | `claude-sonnet-4-6` |
| `claude-3-haiku` | `claude-haiku-4-5-20251001` |
| `gpt-4` | `claude-sonnet-4-6` (RESEARCH.md A2 override — NOT Opus) |
| `gpt-4o` | `claude-sonnet-4-6` |
| `gpt-3.5-turbo` | `claude-haiku-4-5-20251001` |
| `default` | `claude-sonnet-4-6` |

10 alias keys via `SETNX` (preserves admin runtime edits across reboot) + 1 sentinel key `livinity:broker:alias:_meta:lastSeedAt` via unconditional `SET` (diagnostic only). Get-then-set-if-null fallback when ioredis client lacks `setnx` (legacy mocks).

## openai-translator.ts:32-70 Replacement

Lines 12-70 of the original file (the JSDoc block + 39-line hardcoded cascade body) — DELETED. Replaced with a 12-line block including a 1-line re-export:

```typescript
// Phase 61 Plan 03 D1 — model alias resolution moved to standalone alias-resolver.ts
export {resolveModelAlias, type AliasRedisLike} from './alias-resolver.js'
```

`grep -c "if (r === 'opus')" openai-translator.ts` returns **0** (old cascade gone).
`grep -c "from './alias-resolver.js'" openai-translator.ts` returns **1** (re-export shim landed).

## Anthropic Route Alias Resolution Added (BUG FIX)

**File:** `livos/packages/livinityd/source/modules/livinity-broker/router.ts` lines 73-94 (within the `POST /:userId/v1/messages` handler, AFTER body validation, BEFORE mode dispatch)

```typescript
const requestedModel = body.model
const {actualModel, warn: aliasWarn} = await resolveModelAlias(deps.livinityd.ai.redis, requestedModel)
if (aliasWarn) {
	deps.livinityd.logger.log(`[livinity-broker] WARN unknown model '${requestedModel}' → ${actualModel}`)
}
if (actualModel !== requestedModel) {
	deps.livinityd.logger.log(`[livinity-broker] anthropic route requestedModel=${requestedModel} actualModel=${actualModel}`)
	body.model = actualModel
}
```

`grep -c "await resolveModelAlias" router.ts` returns **1** — the bug fix landed. Body mutation propagates to passthrough-handler.ts (same object reference) and to the agent-mode SDK call site (uses `body.model` directly).

Per RESEARCH.md State of the Art table: Phase 57 forwarded `body.model` to Anthropic verbatim, so `body.model='opus'` previously 404'd upstream. Now resolves to `claude-opus-4-7` and the request succeeds.

## New Tests Count + GREEN Status

**Wave 0 net new:** 12 tests across 2 new files.

| File | Tests | Status |
|------|-------|--------|
| `__tests__/alias-resolver.test.ts` | 7 | GREEN |
| `__tests__/seed-default-aliases.test.ts` | 5 | GREEN |
| `openai-translator.test.ts` (rewrites) | 5 (was 7 sync — 2 obsolete blocks merged into the 5 new async blocks) | GREEN |

**Full broker suite trajectory:**

| Stage | Tests | Status |
|-------|-------|--------|
| Pre-Plan-03 baseline (Plan 02 end) | 116/116 | GREEN |
| After Task 1 (RED) | 116/116 (new tests can't compile) | resolver tests RED |
| After Task 2 (GREEN) | 128/128 | GREEN |
| After Task 3 (wiring + test mock updates) | 128/128 | GREEN |

5 pre-existing `No test suite found` broker test files still unchanged (`integration.test.ts`, `openai-integration.test.ts`, `openai-sse-adapter.test.ts`, `sse-adapter.test.ts`, `translate-request.test.ts`) — out of scope per Plan 02 `deferred-items.md` and Rule 3 scope boundary.

## Sacred File Integrity

```
$ git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b   # MATCH — byte-identical pre + post
```

D-30-07 strictly preserved. No edits to `nexus/` whatsoever.

## Commits Created

| SHA | Type | Subject |
|-----|------|---------|
| `c2da2592` | test | `test(61-03): wave 0 RED tests for alias-resolver + seed-default-aliases` |
| `78fb9786` | feat | `feat(61-03): Redis-backed alias resolver + boot seeder (Wave 0 GREEN)` |
| `2741e6f0` | feat | `feat(61-03): wire alias resolver into both broker routes + boot seed` |

## D-NO-NEW-DEPS Audit

GREEN. Zero new npm packages added. The resolver imports nothing from npm; the seeder imports nothing from npm. Tests use existing `vitest`. The boot seed call uses `this.ai.redis` (the existing ioredis client constructed in `modules/ai/index.ts:283` — present since Phase 22).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Test compatibility] Test mocks updated to include `livinityd.ai.redis`**
- **Found during:** Task 3 verify (16 broker tests regressed with `Cannot read properties of undefined (reading 'redis')`)
- **Issue:** `passthrough-handler.test.ts` `makeLivinityd()` and `passthrough-streaming-integration.test.ts` `makeMinimalLivinityd()` returned `{logger}` only. Plan 03 added `await resolveModelAlias(livinityd.ai.redis, body.model)` to `passthroughOpenAIChatCompletions`, so tests using these mocks crashed at the new resolver call site.
- **Fix:** Both mocks gain `ai: {redis: {async get() { return null }}}`. Resolver then either passes `claude-*` model IDs through verbatim (resolver step 3 — no warn) OR falls through to hardcoded `claude-sonnet-4-6` (resolver step 4 with `null` from empty Redis → warn=true). Behaviour matches the pre-Plan-03 sync-resolver outcome for the model strings used in these tests (`claude-sonnet-4-6`, `gpt-4o`, `claude-haiku-4-5`).
- **Files modified:** `passthrough-handler.test.ts`, `passthrough-streaming-integration.test.ts`
- **Commit:** `2741e6f0`

**2. [Rule 3 - Test rewrite] Existing 6 sync `resolveModelAlias` test blocks in `openai-translator.test.ts` rewritten to async**
- **Found during:** Task 3 wiring (sync signature deleted; old tests called `resolveModelAlias(m)` returning `Promise<{...}>` — assertions on `.actualModel` of a Promise broke)
- **Issue:** Plan only said to update the call sites; existing tests are also call sites and would break.
- **Fix:** Rewrote the 6 sync test blocks into 5 async blocks (consolidated overlapping coverage). New blocks use a fake Redis pre-populated by `DEFAULT_ALIASES` and call `_resetAliasCacheForTest()` between blocks. The exhaustive resolver coverage moves to `__tests__/alias-resolver.test.ts` (canonical contract — see RESEARCH.md test scaffolding section).
- **Behavior changes documented in tests:**
  - `claude-sonnet-3-5` no longer maps to `claude-sonnet-4-6` (now passes through verbatim per `claude-*` step 3). Acceptable — Anthropic returns 404 for that model so caller gets correct upstream error.
  - `gpt-4-turbo` / `gpt-5` no longer hit the `r.startsWith('gpt-')` catch-all (only seeded aliases hit; unknown gpt-* fall through to default with warn). Acceptable — admin can seed additional gpt-* via redis-cli.
- **Files modified:** `openai-translator.test.ts`
- **Commit:** `2741e6f0`

**3. [Rule 3 - Architectural cleanup] `buildAnthropicBodyFromOpenAI(body)` → `buildAnthropicBodyFromOpenAI(body, actualModel)`**
- **Found during:** Task 3 wiring (resolver is async; `buildAnthropicBodyFromOpenAI` was sync; making it async would force a much larger blast radius)
- **Issue:** `passthrough-handler.ts:386` previously called the sync resolver inside the sync builder. Plan 03's async resolver can't be invoked there without async-ifying the builder.
- **Fix:** Resolved the alias in the caller `passthroughOpenAIChatCompletions` (already async) and passed the resolved `actualModel` as a 2nd arg to `buildAnthropicBodyFromOpenAI`. Builder stays pure-sync — single change, surgical.
- **Files modified:** `passthrough-handler.ts`
- **Commit:** `2741e6f0`

### Auth Gates

None encountered — all work was local code + tests, no SSH, no live API.

## Wave 3 → Wave 4 Hand-off (Rate-Limit Headers)

### What Wave 4 (61-04) inherits from Plan 03

- **Resolved model is reachable** at every header-emission site:
  - Anthropic route (`router.ts`): `body.model` mutated to actualModel before passthrough/agent dispatch; passthrough-handler.ts forwards verbatim, so `result.upstreamHeaders` include the upstream Anthropic response for the RESOLVED model (not the alias).
  - OpenAI route (`passthrough-handler.ts:passthroughOpenAIChatCompletions`): `actualModel` is local var passed into `buildAnthropicBodyFromOpenAI`; same `result.upstreamHeaders` reachable for header translation.
- **Rate-limit headers are model-aware** — Anthropic emits per-model rate buckets, so headers like `anthropic-ratelimit-tokens-remaining` reflect the actual Claude model's quota. Wave 4 should NOT need to reverse-look-up the alias; the upstream headers already correspond to the resolved model.
- **Wave 4 insertion-point markers** from Plan 01 are still in place at the same line numbers (sync + streaming × Anthropic + OpenAI = 4 actual sites). My Plan 03 changes to `passthrough-handler.ts` only touched the OpenAI path's resolution; the Wave 4 forward/translate insertion-points at the response-write boundary are unchanged.
- **Test-injection seam intact** — `passthrough-handler.test.ts`'s `setMessagesCreateHeaders(headers)` (Plan 01) still works for Wave 4 to inject `Headers({'anthropic-ratelimit-requests-remaining': '59', ...})` and assert downstream `res._headers` carries the forwarded values. The `ai.redis` mock added in this plan is independent.

### Threat Flags

None — Plan 03 introduces no new trust boundaries beyond what was already in the threat register (T-61-07 / T-61-08 are mitigated as described in alias-resolver.ts source comment).

## Self-Check: PASSED

**Files exist:**
- `livos/packages/livinityd/source/modules/livinity-broker/alias-resolver.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/seed-default-aliases.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/__tests__/alias-resolver.test.ts` — FOUND
- `livos/packages/livinityd/source/modules/livinity-broker/__tests__/seed-default-aliases.test.ts` — FOUND

**Commits exist:**
- `c2da2592` — FOUND
- `78fb9786` — FOUND
- `2741e6f0` — FOUND

**Done-criteria greps:**
- `grep -c "from './alias-resolver.js'" openai-translator.ts` → 1 ✓
- `grep -c "if (r === 'opus')" openai-translator.ts` → 0 ✓ (old cascade gone)
- `grep -c "await resolveModelAlias" openai-router.ts` → 1 ✓
- `grep -c "await resolveModelAlias" router.ts` → 1 ✓ (BUG FIX landed)
- `grep -c "await resolveModelAlias" passthrough-handler.ts` → 1 ✓
- `grep -c "seedDefaultAliases(this.ai.redis)" livinityd/source/index.ts` → 1 ✓

**Sacred file SHA:**
- `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b` — MATCH (byte-identical to pre-plan baseline)
