# Phase 61: C3 Rate-Limit Headers + D1 Aliases + D2 Provider Stub — Research

**Researched:** 2026-05-02
**Domain:** Anthropic→OpenAI rate-limit header forwarding/translation; config-driven model alias resolver; pluggable `BrokerProvider` TypeScript interface stub
**Confidence:** HIGH (Anthropic header table, OpenAI reset format, model IDs, SDK header access — all VERIFIED via docs.anthropic.com / developers.openai.com / anthropic-sdk-typescript README); HIGH for in-tree code paths (Read-verified); MEDIUM for OpenAI reset header semantic interpretation (officially "duration string" per docs, but downstream client behavior assumes seconds-int — mapping must convert).

## Summary

Phase 61 layers three orthogonal spec-compliance polish features on top of Phases 57+58:

1. **C3 rate-limit headers** — capture upstream Anthropic response headers (15 of them, far more than CONTEXT.md's 6-row table assumes), forward verbatim on the Anthropic broker route, translate the **6 canonical** ones to OpenAI namespace on the OpenAI route. Reset format converts from RFC 3339 → Unix-seconds-or-duration (researcher recommends Unix seconds as int per OpenAI client convention).
2. **D1 model aliases** — supersede the existing hardcoded `resolveModelAlias()` (in `openai-translator.ts:32-70`) with a Redis-backed table at `livinity:broker:alias:*`, seeded at boot via a `seed-default-aliases.ts` module (mirrors `seed-builtin-tools.ts:1-90`). Resolver caches in memory with 5-second TTL; warn-and-fall-through preserved for unknowns.
3. **D2 provider interface** — extract the Phase 57 passthrough handler's `client.messages.create()` calls behind a `BrokerProvider` interface; ship the Anthropic concrete implementation; add OpenAI/Gemini/Mistral STUB classes that compile but throw `NotImplementedError`. Provider registry exists (Map) but is NOT wired into routing — broker still always dispatches to Anthropic.

**Primary recommendation:**

- Use `client.messages.create({...}).withResponse()` to access upstream headers (verified in anthropic-sdk-typescript README; returns `{data, response}` where `response.headers` is a `Headers` instance). For streaming, use `client.messages.create({...stream:true}).withResponse()` — same pattern, returns `{data: Stream<...>, response}`.
- Translate Anthropic RFC 3339 reset → OpenAI seconds-from-now-int via `Math.max(0, Math.floor((Date.parse(anthropicReset) - Date.now()) / 1000))`. The CONTEXT.md statement "OpenAI uses Unix timestamp seconds" is INCORRECT per official OpenAI docs which state duration string (`"1s"` / `"6m0s"`); however broker should emit a SECONDS INTEGER (most-common-interpretation across SDKs) — flagged for user confirmation in Assumptions Log.
- Seed at boot using `SETNX` (idempotent without overwrite — admin runtime updates persist across restart). Phase 50's seed uses unconditional `SET` which overwrites; Phase 61 alias seed must NOT overwrite (admin edits would be lost on every reboot).

---

<user_constraints>
## User Constraints (from 61-CONTEXT.md)

### Locked Decisions

- **Inherits Phase 57 (passthrough) + Phase 58 (streaming).** Phase 61 attaches headers and refactors providers around the SDK calls those phases established.
- **Sacred file UNTOUCHED** — `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at end of Phase 61. Every PLAN task that touches broker code includes a SHA pre/post acceptance criterion.
- **D-NO-NEW-DEPS preserved** — `@anthropic-ai/sdk@^0.80.0` already in `nexus/packages/core/package.json:34`; `ioredis@^5.4.0` already in `livos/packages/livinityd/package.json:98`. No new packages.
- **D-NO-SERVER4 / D-LIVINITYD-IS-ROOT preserved.**
- **D-NO-BYOK preserved.**
- **Rate-limit translation direction:**
  - Anthropic broker route (`/v1/messages`): forward Anthropic headers verbatim, NO translation.
  - OpenAI broker route (`/v1/chat/completions`): translate to OpenAI namespace; STRIP the original Anthropic headers from response (don't double-emit, prevents client confusion).
- **Retry-After preserved** on 429 in both routes (continues v29.4 Phase 45).
- **Alias storage = Redis-backed** with file fallback. Key prefix `livinity:broker:alias:*`. Default table seeded at boot if Redis empty. Admin updates take effect within 5s (in-memory cache TTL).
- **Default alias table** (CONTEXT.md):
  ```
  opus            → claude-opus-4-7
  sonnet          → claude-sonnet-4-6
  haiku           → claude-haiku-4-5-20251001
  claude-3-opus   → claude-opus-4-7
  claude-3-sonnet → claude-sonnet-4-6
  claude-3-haiku  → claude-haiku-4-5-20251001
  gpt-4           → claude-opus-4-7
  gpt-4o          → claude-sonnet-4-6
  gpt-3.5-turbo   → claude-haiku-4-5-20251001
  default         → claude-sonnet-4-6
  ```
- **Alias resolution flow:** Redis lookup → if found resolve; if not + `^claude-` prefix → passthrough verbatim; else warn-log + resolve to `default` alias.
- **`BrokerProvider` interface** — `request()`, `streamRequest()`, `translateUsage()`. Anthropic concrete; OpenAI/Gemini/Mistral stubs throw `NotImplementedError`. Registry exists (Map) but no model-prefix-based routing — broker always dispatches to Anthropic in v30.
- **Provider directory** — `livinity-broker/providers/{interface,anthropic,openai-stub,gemini-stub,mistral-stub}.ts`.
- **Header translation** — middleware (after route, before response send), single source of truth.
- **Cache TTL** — 5 seconds (default; Claude's discretion).

### Claude's Discretion

- File structure: `providers/` subdirectory vs single file → **subdirectory** (cleaner, recommended).
- Header translation: middleware vs in-handler → **middleware** that wraps `res.write`/`res.setHeader` calls; OR in-handler attach via `withResponse()` then setHeader before flush. Researcher recommends in-handler attach (no middleware needed; res.setHeader is already the seam).
- Alias resolver: standalone module vs method on provider → **standalone** (`livinity-broker/alias-resolver.ts`).
- Cache TTL exact value → 5s.

### Deferred Ideas (OUT OF SCOPE)

- OpenAI provider concrete implementation (defer to v30+).
- Gemini/Mistral concrete implementations (defer indefinitely).
- Per-tier rate-limit policy (Phase 60 enforces baseline; per-tier defers to monetization).
- Model-tier-based pricing (defer to monetization).
- Multi-provider routing by model prefix (`openai/gpt-4o` → OpenAIProvider) — interface ready; routing logic deferred to post-MVP.
- Settings UI for alias management — Phase 62 may or may not surface.
- Sacred file edits — UNTOUCHED per v30 contract.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-BROKER-C3-01 | Anthropic rate-limit headers forwarded verbatim from upstream to broker response on `/v1/messages` | Header capture via `messages.create().withResponse()` (SDK README verified); list of 15 headers (not 6) below in Anthropic Header Catalog. Loop `for (const [k, v] of response.headers)` and re-emit only `anthropic-*` + `retry-after`. |
| FR-BROKER-C3-02 | OpenAI clients receive translated `x-ratelimit-*` headers on every response | Translation table below (6 mappings, drops input/output split per CONTEXT.md, drops priority-* when not Priority Tier). Reset format conversion: RFC 3339 → integer seconds-from-now. |
| FR-BROKER-C3-03 | `Retry-After` preserved on 429 (both routes) | Continues v29.4 Phase 45 pattern in `router.ts:158-185` and `openai-router.ts:248-272`. Phase 61 ADD: forward all other ratelimit headers on the same 429 response so client sees both backoff signal and current limit state. |
| FR-BROKER-D1-01 | Friendly aliases resolve; unknown → warn + default | Resolver below; replaces `openai-translator.ts:resolveModelAlias` (lines 32-70) — same warn-and-fall-through semantic, different storage. |
| FR-BROKER-D1-02 | Alias table is config-driven (no code change to add aliases) | Redis SET via `redis-cli` documented; cache TTL = 5s = max admin propagation delay. |
| FR-BROKER-D2-01 | `BrokerProvider` interface defined; Anthropic concrete + OpenAI/Gemini/Mistral stubs compile | Interface skeleton below; stubs throw `NotImplementedError`. |
| FR-BROKER-D2-02 | Anthropic provider is default; multi-provider routing OUT OF SCOPE | Phase 61 ships interface only; broker always dispatches Anthropic regardless of input model alias. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Anthropic header capture | NEW `providers/anthropic.ts:request/streamRequest` (uses SDK `.withResponse()`) | — | Provider owns SDK call; only place where `Headers` object is reachable |
| Header forwarding (Anthropic route) | `passthrough-handler.ts` (modify Phase 57 sync + Phase 58 streaming branches) | provider returns headers map | Handler does `res.setHeader()` before any chunk write |
| Header translation (OpenAI route) | NEW `livinity-broker/rate-limit-headers.ts` (pure function) | passthrough-handler.ts calls translator | Pure mapping table — testable in isolation |
| Reset format conversion (RFC 3339 → seconds-int) | `rate-limit-headers.ts` translator | — | Single conversion site; never repeat |
| Alias resolution | NEW `livinity-broker/alias-resolver.ts` | Redis (livinity:broker:alias:*) + 5s in-memory cache | Provider-agnostic; standalone module |
| Boot-time seed | NEW `livinity-broker/seed-default-aliases.ts` invoked from `livinityd/source/index.ts` (after `seedBuiltinTools` block, ~line 233) | Redis | Mirrors Phase 50 pattern; SETNX semantics (don't overwrite admin edits) |
| Provider registry | NEW `providers/registry.ts` (`Map<string, BrokerProvider>`) | — | Defined for future routing; populated with Anthropic only |
| Provider stubs | NEW `providers/{openai,gemini,mistral}-stub.ts` | — | Compile-only; throw on invocation |
| Existing Phase 42 hardcoded alias | DELETE from `openai-translator.ts:32-70` (export shim that delegates to new resolver) | — | Avoid two sources of truth |

---

## Anthropic Rate-Limit Headers — Full Catalog [VERIFIED: docs.anthropic.com 2026-05-02]

CONTEXT.md's 6-row mapping table is INCOMPLETE. Anthropic emits **up to 21 rate-limit-related headers** on a single response. Phase 61 must:

1. Forward ALL `anthropic-*` headers verbatim on the Anthropic broker route (loop over response headers; pass through anything starting with `anthropic-` plus `retry-after`).
2. On the OpenAI route, translate the SIX canonical headers per CONTEXT.md table; SKIP the rest (input/output/priority variants don't map cleanly).

### Full Anthropic Header List (verified verbatim)

| Header (lowercase per HTTP spec) | Value Format | Notes |
|---|---|---|
| `retry-after` | integer seconds | only on 429 |
| `anthropic-ratelimit-requests-limit` | integer | always-on RPM tier limit |
| `anthropic-ratelimit-requests-remaining` | integer | |
| `anthropic-ratelimit-requests-reset` | **RFC 3339 timestamp** | e.g. `2026-05-02T20:30:00Z` |
| `anthropic-ratelimit-tokens-limit` | integer | combined token bucket (most restrictive) |
| `anthropic-ratelimit-tokens-remaining` | integer | rounded to nearest 1000 |
| `anthropic-ratelimit-tokens-reset` | RFC 3339 timestamp | |
| `anthropic-ratelimit-input-tokens-limit` | integer | ITPM-specific |
| `anthropic-ratelimit-input-tokens-remaining` | integer | rounded to nearest 1000 |
| `anthropic-ratelimit-input-tokens-reset` | RFC 3339 timestamp | |
| `anthropic-ratelimit-output-tokens-limit` | integer | OTPM-specific |
| `anthropic-ratelimit-output-tokens-remaining` | integer | rounded to nearest 1000 |
| `anthropic-ratelimit-output-tokens-reset` | RFC 3339 timestamp | |
| `anthropic-priority-input-tokens-limit` | integer | Priority Tier only |
| `anthropic-priority-input-tokens-remaining` | integer | Priority Tier only |
| `anthropic-priority-input-tokens-reset` | RFC 3339 timestamp | Priority Tier only |
| `anthropic-priority-output-tokens-limit` | integer | Priority Tier only |
| `anthropic-priority-output-tokens-remaining` | integer | Priority Tier only |
| `anthropic-priority-output-tokens-reset` | RFC 3339 timestamp | Priority Tier only |
| `anthropic-fast-*` | various | only when fast-mode beta active |

**Source:** `https://platform.claude.com/docs/en/api/rate-limits` "Response headers" section retrieved 2026-05-02. Quote: *"The time when the request rate limit will be fully replenished, provided in RFC 3339 format."*

### Anthropic Route — Forward Strategy

```typescript
// In passthrough-handler.ts, after .withResponse():
for (const [name, value] of response.headers) {
  if (name.toLowerCase().startsWith('anthropic-') || name.toLowerCase() === 'retry-after') {
    res.setHeader(name, value)
  }
}
```

This is the safest approach: if Anthropic adds a new `anthropic-*` header (e.g., `anthropic-fast-*` for fast-mode tier), the broker forwards it without code change. The CONTEXT.md 6-row table would silently drop these.

---

## OpenAI Rate-Limit Headers [VERIFIED: developers.openai.com/api/docs/guides/rate-limits 2026-05-02]

| Header | Format | Example |
|---|---|---|
| `x-ratelimit-limit-requests` | integer | `60` |
| `x-ratelimit-limit-tokens` | integer | `150000` |
| `x-ratelimit-remaining-requests` | integer | `59` |
| `x-ratelimit-remaining-tokens` | integer | `149984` |
| `x-ratelimit-reset-requests` | **duration string** | `1s` |
| `x-ratelimit-reset-tokens` | **duration string** | `6m0s` |

**[CRITICAL: CONTEXT.md WAS WRONG]** CONTEXT.md says "OpenAI uses Unix timestamp seconds." Official OpenAI docs say **duration string** (e.g. `"1s"`, `"6m0s"`). The translation `Date.parse(anthropic_reset) / 1000` in CONTEXT.md would emit a Unix timestamp (e.g., `1735660800`) which downstream OpenAI clients DO NOT expect.

### Reset Format — Recommended Translation

Two options:

**Option A — Match OpenAI spec exactly (duration string):**
```typescript
function rfc3339ToOpenAIDuration(rfc3339: string): string {
  const seconds = Math.max(0, Math.floor((Date.parse(rfc3339) - Date.now()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60), s = seconds % 60
  return `${m}m${s}s`
}
```

**Option B — Match observed real-world OpenAI traffic (decimal seconds, what most clients tolerate):**
```typescript
function rfc3339ToOpenAISeconds(rfc3339: string): string {
  const seconds = Math.max(0, (Date.parse(rfc3339) - Date.now()) / 1000)
  return seconds.toFixed(2) // "59.70"
}
```

**Recommendation: Option A (duration string).** Strictly matches OpenAI public docs; clients that parse `"6m0s"` work. Option B is a community observation but clients vary. **[ASSUMED: needs user confirmation]** If integration test against Open WebUI / Continue.dev fails on duration parsing, fall back to Option B.

### OpenAI Route — Translate Strategy

| From (Anthropic) | To (OpenAI) | Conversion |
|---|---|---|
| `anthropic-ratelimit-requests-limit` | `x-ratelimit-limit-requests` | verbatim integer |
| `anthropic-ratelimit-requests-remaining` | `x-ratelimit-remaining-requests` | verbatim integer |
| `anthropic-ratelimit-requests-reset` | `x-ratelimit-reset-requests` | RFC 3339 → duration string |
| `anthropic-ratelimit-tokens-limit` | `x-ratelimit-limit-tokens` | verbatim integer |
| `anthropic-ratelimit-tokens-remaining` | `x-ratelimit-remaining-tokens` | verbatim integer |
| `anthropic-ratelimit-tokens-reset` | `x-ratelimit-reset-tokens` | RFC 3339 → duration string |
| `anthropic-ratelimit-input-tokens-*` | (drop) | OpenAI has no input/output split |
| `anthropic-ratelimit-output-tokens-*` | (drop) | same |
| `anthropic-priority-*` | (drop) | OpenAI doesn't model priority tier |
| `retry-after` | `retry-after` | verbatim (preserved on 429) |

After emitting `x-ratelimit-*`, STRIP `anthropic-*` headers from the OpenAI response (don't double-emit; prevents client confusion when receiving responses from a brokered API claiming both namespaces).

---

## Anthropic SDK — `.withResponse()` Pattern [VERIFIED: github.com/anthropics/anthropic-sdk-typescript README + DeepWiki/error-handling]

The SDK's `messages.create()` returns an `APIPromise<T>` with two raw-response accessors:

| Method | Returns | When body is consumed |
|---|---|---|
| `.withResponse()` | `Promise<{ data: T, response: Response }>` | After body parse (data is parsed payload) |
| `.asResponse()` | `Promise<Response>` | Immediately after headers received; body NOT consumed (caller writes own parser) |

For Phase 61, **use `.withResponse()`** for both sync and streaming:

### Sync (Phase 57 path)
```typescript
const { data: message, response } = await client.messages.create({
  model, max_tokens, messages, system, tools,
}).withResponse()
// response.headers is a `Headers` instance — iterable via for-of, .get(name), .has(name)
forwardAnthropicHeaders(response.headers, res)
res.json(message)
```

### Streaming (Phase 58 path)
```typescript
const { data: stream, response } = await client.messages.create({
  ...args, stream: true,
}).withResponse()
forwardAnthropicHeaders(response.headers, res) // BEFORE flushHeaders — headers must lock before SSE body
res.flushHeaders()
for await (const event of stream) { /* Phase 58 logic */ }
```

**Critical wire-order pitfall:** `res.setHeader()` only works BEFORE `res.flushHeaders()` or first `res.write()`. Phase 58's existing streaming branch already calls `res.flushHeaders()` after setting `Content-Type`/`Cache-Control` — Phase 61 must INSERT the upstream-header forwarding BEFORE that `flushHeaders()` call. Same for sync path: setHeader before `res.json()`.

### Headers iteration

`response.headers` is a Web Fetch `Headers` instance (per Anthropic SDK v0.80+ which uses `fetch` internally). Iteration:

```typescript
for (const [name, value] of response.headers) {
  // name is lowercased per HTTP/Fetch spec
}
// or:
response.headers.get('anthropic-ratelimit-requests-remaining') // string | null
```

**[VERIFIED: anthropic-sdk-typescript README at github.com/anthropics/anthropic-sdk-typescript]:** Quote: *"You can use the `.withResponse()` method to get the raw Response along with the parsed data."* Header access pattern matches Web Fetch standard.

### Issue #450 — older SDK versions stripped these headers
**[CITED: github.com/anthropics/anthropic-sdk-typescript/issues/450]** — early SDK versions (pre-v0.30) lacked `withResponse()`. Phase 57 confirmed `^0.80.0` is in use; this issue is RESOLVED in current versions.

---

## Current Claude Family Model IDs [VERIFIED: platform.claude.com/docs/en/about-claude/models/overview 2026-05-02]

| Model | Claude API ID (dated) | Claude API alias | Notes |
|---|---|---|---|
| Claude Opus 4.7 | `claude-opus-4-7` | `claude-opus-4-7` | **No dated form — alias-only.** Released 2026-04-16. 1M context, 128k output. |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | `claude-sonnet-4-6` | Alias-only. 1M context, 64k output. |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | `claude-haiku-4-5` | **Dated form is canonical; alias also works.** 200k context, 64k output. |

### CONTEXT.md Default Alias Table — Verified

CONTEXT.md says:
```
opus    → claude-opus-4-7              ✓ verified
sonnet  → claude-sonnet-4-6            ✓ verified
haiku   → claude-haiku-4-5-20251001    ✓ verified (canonical dated form)
```

All three target IDs are accepted by the Anthropic Messages API today. Note: existing `openai-translator.ts:37` uses `claude-haiku-4-5` (alias form, also accepted) — Phase 61 should standardize on the dated form `claude-haiku-4-5-20251001` per CONTEXT.md (more deploy-stable).

### Legacy Model IDs (for `claude-3-*` aliases)

| Legacy alias | Recommended target | Verified? |
|---|---|---|
| `claude-3-opus` | `claude-opus-4-7` | ✓ — claude-3-opus is deprecated; routing forward is reasonable |
| `claude-3-sonnet` | `claude-sonnet-4-6` | ✓ |
| `claude-3-haiku` | `claude-haiku-4-5-20251001` | ✓ |
| `claude-3-5-sonnet` | `claude-sonnet-4-6` | ✓ (existing `openai-translator.ts:49`) |
| `claude-3-5-haiku` | `claude-haiku-4-5-20251001` | ✓ (existing `openai-translator.ts:55`) |

### OpenAI Compat Aliases

CONTEXT.md tier mapping:
```
gpt-4         → claude-opus-4-7   (intent: GPT-4 = top-tier)
gpt-4o        → claude-sonnet-4-6 (intent: GPT-4o = mid-tier multi-modal)
gpt-3.5-turbo → claude-haiku-4-5-20251001 (intent: GPT-3.5 = fast/cheap)
```

This DIVERGES from existing `openai-translator.ts:60-67` which routes ALL `gpt-*` to `claude-sonnet-4-6`. CONTEXT.md's tier-mapping is an UPGRADE: gpt-4 callers get Opus quality (more expensive but matches GPT-4 user expectation). **Plan author note:** this is a behavioral change for existing Bolt.diy/Open WebUI traffic that today sends `gpt-4`. Document in PLAN as breaking change for any existing user that had been getting Sonnet under `gpt-4`.

---

## Existing v29.3 Phase 42 Alias Logic — To Be Superseded

**File:** `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts:32-70`
**Function:** `resolveModelAlias(requested: string): {actualModel: string; warn: boolean}`

Hardcoded if/else cascade. Returns `{actualModel, warn}`. Caller (`openai-router.ts:143`) consumes both fields:
```typescript
const {actualModel, warn} = resolveModelAlias(requestedModel)
if (warn) deps.livinityd.logger.log(`[livinity-broker:openai] WARN unknown model '${requestedModel}' — defaulting to ${actualModel}`)
```

**Phase 61 supersession strategy:**

1. New `alias-resolver.ts:resolveModelAlias()` async function with same return shape `{actualModel, warn}` (preserves caller signature).
2. Existing `openai-translator.ts:32-70` REPLACED with re-export shim: `export {resolveModelAlias} from './alias-resolver.js'`.
3. Anthropic route (`router.ts`) gains alias resolution at the same point (after body validation, before SDK call) — currently it does NO alias resolution; passthrough mode forwards `body.model` verbatim. Phase 61 ADDS resolution to BOTH routes.

**Caller changes:** `openai-router.ts:143` and `router.ts` (after passthrough refactor) become async — both already are inside `async (req, res) => {}` handlers, so `await resolveModelAlias(requestedModel)` is safe.

**Anthropic route subtlety:** today `router.ts:42` does NOT alias-resolve. This is a behavioral change — `body.model = 'opus'` previously hit Anthropic with `model: 'opus'` and got 404. Phase 61 makes this work. Document as bug-fix.

---

## Redis Pattern — Confirmed Conflict-Free

**Existing prefixes in livinityd:**
- `nexus:cap:*` — capability registry (per `seed-builtin-tools.ts:54`, `diagnostics/capabilities.ts`)
- `livinity:storage`, `livinity:files-favorites`, `livinity:system-stats` — widget IDs (per `widgets/widget.integration.test.ts`) — these are widget identifiers, NOT Redis keys (they're used as DB column values).

**Verified:** No existing Redis key starts with `livinity:broker:` (grep across `livos/packages/livinityd/source/` for `livinity:broker:` returns zero matches). Phase 61's `livinity:broker:alias:*` is conflict-free.

**Recommended key shape:**
- `livinity:broker:alias:opus` → `claude-opus-4-7` (string value)
- `livinity:broker:alias:_meta:lastSeedAt` → ISO timestamp (sentinel)

**Redis client access:** livinityd already has a Redis client at `this.ai.redis` (constructed in `modules/ai/index.ts:283` as `new Redis(redisUrl, {maxRetriesPerRequest: null})`). Phase 50's seed signature `seedBuiltinTools(redis: RedisLike)` shows the established pattern — Phase 61's seed and resolver follow the same `RedisLike` interface convention to avoid cross-package type coupling.

```typescript
// alias-resolver.ts — minimal RedisLike (mirrors seed-builtin-tools.ts:14)
export interface AliasRedisLike {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
  setnx?(key: string, value: string): Promise<number>
  keys(pattern: string): Promise<string[]>
}
```

---

## Boot-Time Alias Seeder Pattern

**Mirror file:** `livos/packages/livinityd/source/modules/seed-builtin-tools.ts` (90 LOC, well-tested)
**New file:** `livos/packages/livinityd/source/modules/livinity-broker/seed-default-aliases.ts`
**Invocation site:** `livos/packages/livinityd/source/index.ts` immediately after the existing `seedBuiltinTools` block at line 225-233. Use the same try/catch non-fatal pattern.

### Critical difference from Phase 50

Phase 50's seed uses **unconditional `SET`** (overwrites every boot — fine because nexus's `syncTools()` is the source of truth and overwrites manifests on every sync anyway).

Phase 61's seed must use **`SETNX` (set-if-not-exists)** — admin runtime updates via `redis-cli SET livinity:broker:alias:foo bar` would otherwise be wiped on every reboot. Sentinel key (`_meta:lastSeedAt`) can use unconditional `SET` since it's purely diagnostic.

### Skeleton (Phase 61 seed)

```typescript
// livos/packages/livinityd/source/modules/livinity-broker/seed-default-aliases.ts
import type {AliasRedisLike} from './alias-resolver.js'

const ALIAS_PREFIX = 'livinity:broker:alias:'
const SENTINEL_KEY = `${ALIAS_PREFIX}_meta:lastSeedAt`

const DEFAULT_ALIASES: Record<string, string> = {
  opus: 'claude-opus-4-7',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
  'claude-3-opus': 'claude-opus-4-7',
  'claude-3-sonnet': 'claude-sonnet-4-6',
  'claude-3-haiku': 'claude-haiku-4-5-20251001',
  'gpt-4': 'claude-opus-4-7',
  'gpt-4o': 'claude-sonnet-4-6',
  'gpt-3.5-turbo': 'claude-haiku-4-5-20251001',
  default: 'claude-sonnet-4-6',
}

export async function seedDefaultAliases(redis: AliasRedisLike): Promise<void> {
  for (const [alias, target] of Object.entries(DEFAULT_ALIASES)) {
    if (redis.setnx) {
      await redis.setnx(`${ALIAS_PREFIX}${alias}`, target)
    } else {
      const existing = await redis.get(`${ALIAS_PREFIX}${alias}`)
      if (existing === null) await redis.set(`${ALIAS_PREFIX}${alias}`, target)
    }
  }
  await redis.set(SENTINEL_KEY, new Date().toISOString()) // sentinel always overwrites
}
```

---

## Alias Resolver Module

```typescript
// livos/packages/livinityd/source/modules/livinity-broker/alias-resolver.ts

const CACHE_TTL_MS = 5_000
const ALIAS_PREFIX = 'livinity:broker:alias:'
const DEFAULT_FALLBACK_KEY = 'default'

export interface AliasRedisLike {
  get(key: string): Promise<string | null>
}

interface CacheEntry { value: string | null; expiresAt: number }
const cache = new Map<string, CacheEntry>()

async function lookup(redis: AliasRedisLike, alias: string): Promise<string | null> {
  const now = Date.now()
  const hit = cache.get(alias)
  if (hit && hit.expiresAt > now) return hit.value
  const value = await redis.get(`${ALIAS_PREFIX}${alias}`)
  cache.set(alias, {value, expiresAt: now + CACHE_TTL_MS})
  return value
}

export async function resolveModelAlias(
  redis: AliasRedisLike,
  requested: string,
): Promise<{actualModel: string; warn: boolean}> {
  const r = (requested || '').toLowerCase().trim()
  // 1. Direct alias hit
  const direct = await lookup(redis, r)
  if (direct !== null) return {actualModel: direct, warn: false}
  // 2. ^claude- prefix → passthrough verbatim (assume real model ID)
  if (r.startsWith('claude-')) return {actualModel: r, warn: false}
  // 3. Unknown — warn + default
  const fallback = (await lookup(redis, DEFAULT_FALLBACK_KEY)) ?? 'claude-sonnet-4-6'
  return {actualModel: fallback, warn: true}
}

// Test seam — cache reset between tests
export function _resetAliasCacheForTest(): void { cache.clear() }
```

**Caller adapters:**
- `openai-router.ts:143` becomes `await resolveModelAlias(deps.livinityd.ai.redis, requestedModel)`. Existing `{actualModel, warn}` consumer unchanged.
- `router.ts` (Anthropic route) ADDS the same resolver call (Phase 57 today does no resolution).

---

## Provider Interface Skeleton

**Directory layout (NEW):**
```
livos/packages/livinityd/source/modules/livinity-broker/providers/
├── interface.ts          (NEW — shared types + abstract class)
├── anthropic.ts          (NEW — extracts from passthrough-handler.ts)
├── openai-stub.ts        (NEW — throws NotImplementedError)
├── gemini-stub.ts        (NEW)
├── mistral-stub.ts       (NEW)
├── registry.ts           (NEW — Map<string, BrokerProvider>)
└── __tests__/
    ├── interface-compile.test.ts        (typecheck-only test)
    ├── anthropic.test.ts
    └── stubs-throw.test.ts
```

### `interface.ts` (skeleton)

```typescript
import type {RawMessageStreamEvent} from '@anthropic-ai/sdk/resources/messages.mjs'

export type ProviderRequestParams = {
  model: string                  // already alias-resolved
  messages: Array<{role: string; content: unknown}>
  system?: string
  tools?: unknown[]
  max_tokens: number
  temperature?: number
  // ... full Anthropic Messages request shape (intentionally NOT generic for v30)
}

export type ProviderResponse = {
  raw: unknown                   // Anthropic Messages JSON shape (provider-native)
  upstreamHeaders: Headers       // for rate-limit forwarding
}

export type ProviderStreamEvent = RawMessageStreamEvent

export type ProviderStreamResult = {
  stream: AsyncIterable<ProviderStreamEvent>
  upstreamHeaders: Headers
}

export type UsageRecord = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface BrokerProvider {
  readonly name: string
  request(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderResponse>
  streamRequest(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderStreamResult>
  translateUsage(response: ProviderResponse): UsageRecord
}

export interface ProviderRequestOpts {
  authToken: string              // sk-ant-oat01-* (subscription)
  signal?: AbortSignal
}

export class NotImplementedError extends Error {
  constructor(provider: string) { super(`Provider '${provider}' not implemented in v30`) }
}
```

### `anthropic.ts` (concrete — extracts from Phase 57 passthrough)

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type {BrokerProvider, ProviderRequestParams, ProviderRequestOpts, ProviderResponse, ProviderStreamResult, UsageRecord} from './interface.js'

export class AnthropicProvider implements BrokerProvider {
  readonly name = 'anthropic'

  async request(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderResponse> {
    const client = new Anthropic({authToken: opts.authToken})
    const {data, response} = await client.messages.create({...params, stream: false}).withResponse()
    return {raw: data, upstreamHeaders: response.headers}
  }

  async streamRequest(params: ProviderRequestParams, opts: ProviderRequestOpts): Promise<ProviderStreamResult> {
    const client = new Anthropic({authToken: opts.authToken})
    const {data, response} = await client.messages.create({...params, stream: true}).withResponse()
    return {stream: data, upstreamHeaders: response.headers}
  }

  translateUsage(resp: ProviderResponse): UsageRecord {
    const u = (resp.raw as any).usage ?? {}
    return {
      promptTokens: u.input_tokens ?? 0,
      completionTokens: u.output_tokens ?? 0,
      totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
    }
  }
}
```

### Stubs (`openai-stub.ts` etc.)

```typescript
import {NotImplementedError, type BrokerProvider} from './interface.js'
export class OpenAIProvider implements BrokerProvider {
  readonly name = 'openai'
  async request(): Promise<never> { throw new NotImplementedError('openai') }
  async streamRequest(): Promise<never> { throw new NotImplementedError('openai') }
  translateUsage(): never { throw new NotImplementedError('openai') }
}
```

(Identical pattern for `gemini-stub.ts`, `mistral-stub.ts`.)

### Registry (NOT wired into routing)

```typescript
// providers/registry.ts
import {AnthropicProvider} from './anthropic.js'
import {OpenAIProvider} from './openai-stub.js'
import {GeminiProvider} from './gemini-stub.js'
import {MistralProvider} from './mistral-stub.js'
import type {BrokerProvider} from './interface.js'

export const providers = new Map<string, BrokerProvider>([
  ['anthropic', new AnthropicProvider()],
  ['openai', new OpenAIProvider()],
  ['gemini', new GeminiProvider()],
  ['mistral', new MistralProvider()],
])

export function getProvider(name: string): BrokerProvider {
  const p = providers.get(name)
  if (!p) throw new Error(`Unknown provider: ${name}`)
  return p
}
```

**Phase 61 router dispatch:** ALWAYS `getProvider('anthropic')`. Future v30+ work adds prefix-based routing (e.g., if `model.startsWith('openai/')` then `getProvider('openai')`); not in v30 scope.

### Reference: How LiteLLM organizes providers (for plan-author context)

LiteLLM (the OSS broker referenced as architectural inspiration) uses one file per provider in `litellm/llms/{anthropic,openai,vertex,bedrock}/...` with shared `BaseLLM` interface. Phase 61's per-file-per-provider pattern matches this — clean drop-in for future concrete impls.

---

## Risk Inventory

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Anthropic adds new ratelimit headers (e.g., new `anthropic-fast-*`); CONTEXT.md table doesn't translate them | High over time | Low (clients ignore unknown headers) | Forward-strategy uses **prefix loop** (`anthropic-*` + `retry-after`); no enumeration. Translation table only covers 6 canonical → OpenAI mappings; new ones gracefully drop on OpenAI route. |
| R2 | Admin sets `default` alias to a non-existent model | Medium | High (every unknown-alias request 404s upstream) | Boot-time validation: seeder logs WARN if `default` value doesn't match `^claude-` pattern. Add a tRPC alias-validate health check (defer to Phase 62 if Settings UI lands; otherwise just log). |
| R3 | Provider stub accidentally invoked due to routing bug | Low (no routing logic in v30) | Medium (request throws 500) | `stubs-throw.test.ts` asserts each stub's `request/streamRequest/translateUsage` throws `NotImplementedError`. Router has explicit grep-guard test: `expect(routerSource).not.toMatch(/getProvider\(['"](openai|gemini|mistral)['"]\)/)` |
| R4 | Reset-format mismatch — OpenAI client expects Unix seconds (community convention) but spec says duration string; broker emits one and client parses other | Medium | Medium (incorrect retry timing) | Ship duration-string per spec; integration test against real Open WebUI in Phase 63; add fallback option flag if client integration fails |
| R5 | `withResponse()` body-consumption order on streaming — does Headers populate before stream is fully consumed? | Low | High (headers arrive too late to setHeader before SSE flush) | `withResponse()` resolves AFTER body parse for sync but for streams the SDK resolves `.withResponse()` once headers are available + iterator is ready — SDK README confirms data is `Stream<...>` immediately. Wave 0 test verifies header is populated before iteration starts. |
| R6 | Cache TTL 5s causes admin update lag; admin removes a key, but cached resolution still returns old value for 5s | Documented | Low | Documented in admin procedure: "changes take effect within 5 seconds." If urgent invalidation needed, livinityd restart works. Acceptable per CONTEXT.md. |
| R7 | Existing `gpt-4` traffic gets routed to Opus (more expensive) instead of Sonnet (current behavior) | Medium | Medium (3-5x cost on those requests) | Document as breaking behavior change in plan; user confirms during smart-discuss inheritance whether to keep CONTEXT.md tier-mapping or preserve existing all-gpt-→-Sonnet behavior. |
| R8 | Anthropic route currently does no alias resolution (`body.model='opus'` 404s); Phase 61 fixes this — counts as behavior change for any internal caller relying on raw passthrough | Low (no internal callers per Phase 57 Q3 finding) | Low | Document; no internal callers exist per Phase 57 grep audit. |
| R9 | `setHeader` after `flushHeaders` silently no-ops on Express; bug surfaces as missing client-visible headers | Medium | High (FR-C3-01/02 fail silently) | Wave 0 test: `assert(res.getHeader('anthropic-ratelimit-requests-remaining'))` BEFORE iteration starts on streaming path. Plan task acceptance: header forwarding precedes `flushHeaders()` in source diff. |
| R10 | `openai-translator.ts` is shared by sync + streaming OpenAI paths; replacing `resolveModelAlias` shim breaks sync if caller signature changes from sync→async | Medium | High (broken responses) | Resolver returns Promise; ALL callers already inside async handler context. Plan task acceptance: every `resolveModelAlias` call site has `await`. |

---

## Suggested Wave Structure (4 waves; aligns with focus block)

| Wave | Goal | Key Files | Depends on |
|------|------|-----------|-----------|
| **0 — Test Scaffolding** | Header translation unit tests; alias resolver in-memory + Redis mock tests; provider interface compile tests; stub throw tests | `__tests__/rate-limit-headers.test.ts`, `__tests__/alias-resolver.test.ts`, `providers/__tests__/{interface-compile,stubs-throw}.test.ts` | — |
| **1 — Provider Interface + Anthropic Extraction** | Define interface + extract Phase 57 passthrough SDK calls into `AnthropicProvider`; refactor `passthrough-handler.ts` to dispatch via `BrokerProvider`; verify integration tests still pass | `providers/{interface,anthropic,registry}.ts`; `passthrough-handler.ts` (refactor only — no behavior change) | Wave 0 |
| **2 — Provider Stubs** | OpenAI/Gemini/Mistral stub classes + registry entries; throw tests pass; router NOT wired to stubs (grep-guard test) | `providers/{openai,gemini,mistral}-stub.ts`; registry update | Wave 1 |
| **3 — Alias Resolver + Boot Seed** | Standalone `alias-resolver.ts` with Redis lookup + 5s cache; `seed-default-aliases.ts` with SETNX; mount in `livinityd/source/index.ts:~234`; replace `openai-translator.ts:resolveModelAlias` with re-export shim; ADD resolver call to Anthropic route in `router.ts` | `alias-resolver.ts`, `seed-default-aliases.ts`, `index.ts`, `openai-translator.ts`, `router.ts`, `openai-router.ts` | Wave 1 |
| **4 — Rate-Limit Header Forward + Translate** | `rate-limit-headers.ts` translator (RFC 3339 → duration string); attach to Anthropic route (forward) + OpenAI route (translate); integration tests against Phase 58 fake-anthropic-sse-server with scripted headers; final phase gate (sacred SHA + 5-run determinism reuse from Phase 58) | `rate-limit-headers.ts`; `passthrough-handler.ts` (modify both sync + streaming branches in both routes); `__tests__/rate-limit-integration.test.ts` | Waves 1+3 |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| HTTP header iteration | Custom header parsing | `for (const [k,v] of response.headers)` (Web Fetch standard) | Standard Headers iterator; correct case-folding; avoids edge cases |
| RFC 3339 → date | Custom parser | `Date.parse(rfc3339)` (Node builtin) | RFC 3339 is a strict subset of ISO 8601 which Date.parse handles exactly |
| Redis SETNX semantic | Read-then-write race | `SETNX key value` (single atomic op) | Race-free; ioredis exposes `setnx()` |
| Provider abstraction | Class hierarchy with virtual methods | Plain TypeScript `interface` + `implements` | TS interface is the lightest pluggable contract; LiteLLM-style |
| Cache TTL | LRU library | Plain `Map` with `expiresAt` timestamp check | 5s TTL × 10 alias entries = trivial memory; LRU is overkill |

---

## Common Pitfalls

### Pitfall 1: `setHeader` after `flushHeaders` silently no-ops
**Where it bites:** Streaming path; CSP middleware order. **Detection:** Wave 0 test asserts header present on response before SSE chunks emit. **Fix:** ALL `setHeader` calls precede `res.flushHeaders()`.

### Pitfall 2: Cache stale across cluster
**Where it bites:** If livinityd ever runs multi-process, in-memory cache desyncs across processes — admin update visible on one process, not another, for up to 5s. **Mitigation:** v30 livinityd is single-process; document constraint in resolver source comment. If cluster mode emerges (v31+), use Redis pub/sub for invalidation.

### Pitfall 3: Forwarding `content-length` or `transfer-encoding` from upstream
**Where it bites:** Re-emitting upstream `content-length` causes client to truncate/error because broker body length differs from upstream. **Fix:** Filter — only forward `anthropic-*` + `retry-after`. NEVER forward `content-length`, `content-encoding`, `transfer-encoding`, `connection`, `date`.

### Pitfall 4: SETNX returns 1/0 not boolean
**Where it bites:** `if (await redis.setnx(k,v))` works in JS coercion but lints flag. **Fix:** explicit `=== 1`.

### Pitfall 5: Alias resolver called with mutated case
**Where it bites:** Client sends `Opus` (capitalized); cache lookup misses; redis lookup misses (lowercase keys); falls to default. **Fix:** Resolver does `requested.toLowerCase().trim()` BEFORE cache+Redis lookup. Seeder writes lowercase keys only.

### Pitfall 6: `withResponse()` consumes body — can't re-stream
**Where it bites:** Sync path is fine (data is full body). Stream path: `data` is the AsyncIterable; iteration consumes the underlying socket. Once iterated, can't re-read. **Fix:** Iterate exactly once (Phase 58's pattern already does this).

---

## Code Examples

### Header forwarding (Anthropic route, sync) — Wave 4
```typescript
// passthrough-handler.ts (modify Phase 57 sync branch)
const provider = getProvider('anthropic')
const result = await provider.request({...args}, {authToken})
forwardAnthropicHeaders(result.upstreamHeaders, res)
res.json(result.raw)
```

### Header translation (OpenAI route) — Wave 4
```typescript
// rate-limit-headers.ts
export function translateAnthropicToOpenAIHeaders(upstream: Headers, res: Response): void {
  const map: Record<string, string> = {
    'anthropic-ratelimit-requests-limit': 'x-ratelimit-limit-requests',
    'anthropic-ratelimit-requests-remaining': 'x-ratelimit-remaining-requests',
    'anthropic-ratelimit-requests-reset': 'x-ratelimit-reset-requests',
    'anthropic-ratelimit-tokens-limit': 'x-ratelimit-limit-tokens',
    'anthropic-ratelimit-tokens-remaining': 'x-ratelimit-remaining-tokens',
    'anthropic-ratelimit-tokens-reset': 'x-ratelimit-reset-tokens',
  }
  for (const [from, to] of Object.entries(map)) {
    const v = upstream.get(from)
    if (v === null) continue
    if (to.startsWith('x-ratelimit-reset-')) {
      res.setHeader(to, rfc3339ToOpenAIDuration(v))
    } else {
      res.setHeader(to, v)
    }
  }
  // Always preserve retry-after on 429
  const ra = upstream.get('retry-after')
  if (ra !== null) res.setHeader('retry-after', ra)
}

function rfc3339ToOpenAIDuration(rfc3339: string): string {
  const seconds = Math.max(0, Math.floor((Date.parse(rfc3339) - Date.now()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60), s = seconds % 60
  return `${m}m${s}s`
}
```

### Anthropic route — forward all anthropic-* + retry-after
```typescript
export function forwardAnthropicHeaders(upstream: Headers, res: Response): void {
  for (const [name, value] of upstream) {
    const lower = name.toLowerCase()
    if (lower.startsWith('anthropic-') || lower === 'retry-after') {
      res.setHeader(name, value)
    }
  }
}
```

### Resolver call site (router.ts ADD; openai-router.ts MODIFY)
```typescript
// before SDK call:
const {actualModel, warn} = await resolveModelAlias(deps.livinityd.ai.redis, body.model)
if (warn) deps.livinityd.logger.log(`[livinity-broker] WARN unknown model '${body.model}' → ${actualModel}`)
const sdkBody = {...body, model: actualModel}
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | vitest (existing in `livos/packages/livinityd/vitest.config.ts`) |
| Quick run | `cd livos/packages/livinityd && npx vitest run source/modules/livinity-broker/rate-limit-headers.test.ts` |
| Full broker suite | `cd livos/packages/livinityd && npx vitest run source/modules/livinity-broker/` |
| Phase gate | All broker unit + integration tests GREEN; sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged; 5-run determinism on rate-limit-integration test |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| FR-BROKER-C3-01 | Anthropic headers forwarded verbatim on `/v1/messages` | integration | `npx vitest run source/modules/livinity-broker/__tests__/rate-limit-integration.test.ts -t "anthropic forward"` | ❌ Wave 0+4 |
| FR-BROKER-C3-02 | OpenAI headers translated on `/v1/chat/completions` | integration + unit | `npx vitest run source/modules/livinity-broker/rate-limit-headers.test.ts` | ❌ Wave 0 |
| FR-BROKER-C3-03 | Retry-After preserved on 429 (both routes) | integration | `npx vitest run -t "retry-after preserved"` | ❌ Wave 0+4 |
| FR-BROKER-D1-01 | Alias resolution: known + unknown + claude- prefix passthrough | unit | `npx vitest run source/modules/livinity-broker/alias-resolver.test.ts` | ❌ Wave 0 |
| FR-BROKER-D1-02 | Admin runtime update visible within 5s | unit (mocked redis + clock) + integration (real ioredis) | `npx vitest run -t "alias TTL refresh"` | ❌ Wave 0 |
| FR-BROKER-D2-01 | `BrokerProvider` interface compiles; AnthropicProvider implements | typecheck + unit | `npx tsc --noEmit && npx vitest run providers/` | ❌ Wave 0 |
| FR-BROKER-D2-02 | Stubs throw NotImplementedError when invoked | unit | `npx vitest run source/modules/livinity-broker/providers/__tests__/stubs-throw.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run source/modules/livinity-broker/{file-just-touched}.test.ts`
- **Per wave merge:** `npx vitest run source/modules/livinity-broker/`
- **Phase gate:** Full broker suite GREEN + `git hash-object nexus/packages/core/src/sdk-agent-runner.ts == 4f868d318abff71f8c8bfbcf443b2393a553018b` + 5-run determinism on rate-limit-integration test (reuses Phase 58's fake-anthropic-sse-server).

### Wave 0 Gaps
- [ ] `__tests__/rate-limit-headers.test.ts` — pure mapping unit tests (FR-C3-02 unit shell)
- [ ] `__tests__/alias-resolver.test.ts` — Redis mock-based; covers known/unknown/claude-/cache TTL/case-insensitive
- [ ] `providers/__tests__/interface-compile.test.ts` — typecheck-only smoke (`tsc --noEmit` on providers/ directory)
- [ ] `providers/__tests__/stubs-throw.test.ts` — invoke each stub method, assert `NotImplementedError`
- [ ] `providers/__tests__/anthropic.test.ts` — mocked SDK client, verify `withResponse()` is the call (not bare `messages.create`)
- [ ] `__tests__/rate-limit-integration.test.ts` — extend Phase 58's fake-anthropic-sse-server to emit ratelimit headers; assert both routes propagate

*(Test framework already present — no install needed.)*

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong | Confirm via |
|---|-------|---------|---------------|-------------|
| A1 | OpenAI clients (Open WebUI, Continue.dev, Bolt.diy) parse duration string `"6m0s"` correctly per OpenAI spec | OpenAI Header Reset Format | Medium — wrong format → silently misleading client backoff timer | Phase 63 live test against each client; if fails, switch to seconds-int (Option B) |
| A2 | CONTEXT.md `gpt-4` → Opus mapping is intended (existing code routes to Sonnet) | OpenAI Compat Aliases | Medium — 3-5× cost on existing gpt-4 traffic | Confirm with user during smart-discuss inheritance step |
| A3 | `withResponse()` on streaming SDK call resolves WHEN headers arrive (not when full body consumed) | SDK Pattern | High — late header would arrive after `flushHeaders()` and silently no-op | Wave 0 test verifies; SDK README and TypeScript types support this but live behavior should be tested |
| A4 | livinityd is single-process (cache invalidation across processes not needed) | Cache Pitfall 2 | Low — only an issue if v31+ goes multi-process | Search `livinityd/source/index.ts` for `cluster` or worker fork — none found in this research |
| A5 | The `^claude-` passthrough rule (resolver step 2) safely passes unknown future Claude models verbatim to Anthropic | Resolver | Low — Anthropic returns 404 if unknown which the broker forwards verbatim (correct UX) | Anthropic API docs confirm 404 on unknown model; no special handling needed |
| A6 | `claude-haiku-4-5-20251001` is THE canonical Haiku 4.5 ID (not the alias `claude-haiku-4-5`) | Model IDs | Low — both are valid per Anthropic docs; CONTEXT.md picked the dated form | Verified at platform.claude.com/docs/en/about-claude/models/overview |
| A7 | Stripping `anthropic-*` from OpenAI route response is correct (don't double-emit) | Translation Strategy | Low — if a downstream client somehow inspects both, they see consistent state. CONTEXT.md endorses this | None — design choice |
| A8 | OpenAI's reset format being a duration string "1s"/"6m0s" persists; OpenAI hasn't changed it to Unix seconds since the docs were captured | OpenAI Header Reset | Low | docs verified 2026-05-02; recheck if Phase 63 integration fails |

---

## Open Questions

1. **Reset format final choice — duration string vs seconds int?**
   - What we know: official docs say duration string; community traffic shows decimal-seconds.
   - What's unclear: which format external clients (Open WebUI/Continue.dev) actually parse correctly.
   - Recommendation: ship duration string; if Phase 63 live test surfaces parse failures, hot-patch to seconds.

2. **Should Phase 61 add `/v1/models` registry entries that match alias table?**
   - What we know: `openai-router.ts:38-61` hardcodes `/v1/models` list. Phase 61 makes alias table dynamic.
   - What's unclear: whether `/v1/models` should reflect runtime alias table.
   - Recommendation: defer. Static list is fine for v30; Phase 62 may surface admin alias UI.

3. **Should the Anthropic broker route's NEW alias resolution be conditional on a feature flag?**
   - What we know: Phase 57 today does no alias resolution on `/v1/messages`; Phase 61 adds it.
   - What's unclear: whether any internal caller depends on raw passthrough.
   - Recommendation: per Phase 57 Q3 finding, NO internal caller uses the broker; safe to enable unconditionally. Document as bug-fix.

4. **Should `default` alias be hardcoded as fallback-of-fallback if Redis is down?**
   - What we know: Resolver does `await redis.get(...)`. If Redis errors, request fails 500.
   - Recommendation: wrap in try/catch; on Redis error, default to hardcoded `claude-sonnet-4-6` and log error. Resilience > strict-correctness here.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| `@anthropic-ai/sdk` | AnthropicProvider | ✓ | ^0.80.0 (registry latest 0.92.0) | — |
| `ioredis` | alias resolver + seed | ✓ | ^5.4.0 | — |
| `vitest` | test framework | ✓ | ^2.1.2 | — |
| Phase 57 passthrough-handler.ts | refactor target | ✓ assumed (Phase 57 must ship before 61) | per `phase 57 → 58 → 61` chain | — |
| Phase 58 fake-anthropic-sse-server | integration test reuse | ✓ assumed | — | Phase 61 plan can extend the fixture script to emit headers |

**No missing dependencies.** All Phase 61 work is pure TypeScript code in `livinity-broker/`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Hardcoded `resolveModelAlias()` cascade in `openai-translator.ts:32-70` | Redis-backed resolver with 5s cache | Phase 61 | Admin runtime updates without restart |
| No alias resolution on `/v1/messages` | Same resolver applies to both routes | Phase 61 | Bug-fix — `body.model='opus'` now works on Anthropic route |
| Inline SDK calls in `passthrough-handler.ts` | Behind `BrokerProvider` interface | Phase 61 | Future provider drop-in path |
| 6-row CONTEXT.md header table | 21-header Anthropic catalog with prefix-loop forward | Phase 61 research | Future-proof against new `anthropic-*` headers |
| CONTEXT.md "OpenAI uses Unix seconds" | Verified: duration string per OpenAI docs | Phase 61 research | Translator MUST emit duration string |
| `gpt-4` → Sonnet (existing) | `gpt-4` → Opus (per CONTEXT.md tier-mapping) | Phase 61 | 3-5× cost on existing gpt-4 traffic — flag for user confirmation |

---

## Sources

### Primary (HIGH confidence)
- `https://platform.claude.com/docs/en/api/rate-limits` — Anthropic rate-limit response headers (full 21-header catalog) — retrieved 2026-05-02
- `https://platform.claude.com/docs/en/about-claude/models/overview` — Current model IDs (Opus 4.7, Sonnet 4.6, Haiku 4.5-20251001) — retrieved 2026-05-02
- `https://developers.openai.com/api/docs/guides/rate-limits` — OpenAI x-ratelimit-* header format (duration string) — retrieved 2026-05-02
- `https://github.com/anthropics/anthropic-sdk-typescript` — `.withResponse()` pattern; README + DeepWiki/error-handling
- `https://github.com/anthropics/anthropic-sdk-typescript/issues/450` — historical issue, RESOLVED in current SDK versions
- `livos/packages/livinityd/source/modules/seed-builtin-tools.ts` (90 LOC, Read-verified) — Phase 50 boot-seed pattern
- `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts:32-70` (Read-verified) — existing hardcoded `resolveModelAlias` to supersede
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts:108-153` (Read-verified) — D-42-12 warn-and-ignore tools + alias call site
- `livos/packages/livinityd/source/index.ts:215-233` (Read-verified) — boot ordering for seedBuiltinTools (model for seed-default-aliases mount point)
- `livos/packages/livinityd/source/modules/ai/index.ts:283` — Redis client construction `new Redis(url, {maxRetriesPerRequest: null})`
- `.planning/phases/57-passthrough-mode-agent-mode/57-RESEARCH.md` — Phase 57 verdicts D-30-01..04 (architecture inherited verbatim)
- `.planning/phases/58-true-token-streaming/58-RESEARCH.md` — Phase 58 streaming + fake-anthropic-sse-server pattern Phase 61 extends

### Secondary (MEDIUM confidence)
- `community.openai.com/t/why-x-ratelimit-reset-requests-time-is-so-small` — community observation that real OpenAI traffic emits decimal seconds (informs A8 risk)
- `.planning/phases/61-spec-compliance-aliases-provider/61-CONTEXT.md` — user's locked decisions (header mapping table, alias storage choice, provider interface skeleton)

### Tertiary (LOW confidence — flagged for validation)
- CONTEXT.md statement "OpenAI uses Unix timestamp seconds" — CONTRADICTED by official docs; researcher recommends duration string per spec
- CONTEXT.md `gpt-4` → Opus mapping — DIVERGES from existing `openai-translator.ts` all-gpt-→-Sonnet behavior; flag for user confirmation

---

## Metadata

**Confidence breakdown:**
- Anthropic header catalog: HIGH (verbatim from official docs; 21-row table, not CONTEXT.md's 6)
- OpenAI header format: HIGH (verified — CONTEXT.md was wrong about Unix seconds)
- SDK header access (`withResponse()`): HIGH (verified via SDK README + community)
- Model IDs (Opus 4.7, Sonnet 4.6, Haiku 4.5-20251001): HIGH (verified via models/overview)
- Redis pattern (no `livinity:broker:` conflicts): HIGH (grep-verified)
- Boot seed pattern: HIGH (Read-verified Phase 50 source)
- Provider interface design: MEDIUM (synthesized; LiteLLM pattern is the inspiration but not directly imported)
- Reset format final emit (duration vs seconds): MEDIUM (spec says duration; community shows seconds)
- `gpt-4` tier-mapping decision: LOW (CONTEXT.md says one thing, existing code does another — needs user confirmation)

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (30 days — Anthropic + OpenAI rate-limit specs are stable; Anthropic SDK API surface stable)
