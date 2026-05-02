# Phase 61: C3+D1+D2 Rate-Limit Headers + Model Aliases + Provider Interface Stub - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Smart-discuss (autonomous); inherits Phase 57+58 passthrough+streaming foundation

<domain>
## Phase Boundary

Phase 61 is the **spec-compliance polish phase**. Three concerns bundled because they all touch broker response shape + model resolution layers:

- **C3 — Rate-Limit Header Forwarding/Translation:** Anthropic upstream emits `anthropic-ratelimit-*` headers on every response. Phase 61 forwards these verbatim on Anthropic broker route + translates them to `x-ratelimit-*` namespace on OpenAI broker route. Both routes preserve `Retry-After` on 429s (continues v29.4 Phase 45 work + Phase 60 perimeter rate limits).
- **D1 — Friendly Model Alias Resolution:** Maps client-sent model names (`opus`, `sonnet`, `haiku`, `claude-3-opus`, `gpt-4`, `gpt-4o`, `gpt-3.5-turbo`) to the current Claude family model IDs (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`). Unknown models → warn-and-fall-through to default model (continues v29.3 Phase 42 D-42-12 pattern).
- **D2 — Pluggable Provider Interface Stub:** Defines `BrokerProvider` TypeScript interface (`request()`, `streamRequest()`, `translateUsage()`). Existing Anthropic implementation extracted into `AnthropicProvider` class. OpenAI/Gemini/Mistral stubs created (interface-only, no concrete bodies — compile but throw NotImplementedError).

What's IN scope for Phase 61:
- Header forwarding on Anthropic passthrough route — extract from `response.headers` after upstream call.
- Header translation on OpenAI route — map `anthropic-ratelimit-requests-remaining` → `x-ratelimit-remaining-requests` etc. Mapping table at `livinity-broker/rate-limit-headers.ts`.
- Model alias resolution module — config-driven (Redis OR file per Phase 56's verdict; researcher decides during Phase 61). Default alias table seeded at boot.
- `BrokerProvider` TypeScript interface in `livinity-broker/providers/interface.ts`.
- `AnthropicProvider` extracted from passthrough handler — wraps SDK calls, implements interface methods.
- OpenAI/Gemini/Mistral stub classes — `extends BrokerProvider`, throw `NotImplementedError`.
- Unit tests for header mapping, alias resolution, provider interface compliance.
- Documentation: alias update procedure (how admin adds new alias without restart).

What's OUT of scope (deferred):
- OpenAI provider concrete implementation (defer to v30+ post-MVP — broker forwards to Anthropic regardless of input model alias).
- Gemini/Mistral concrete implementations (defer indefinitely — interface stub is enough).
- Per-tier rate-limit policy (Phase 60 enforces baseline; per-tier defers to monetization).
- Model-tier-based pricing (defer to monetization).
- Sacred file edits — UNTOUCHED per v30 contract.

</domain>

<decisions>
## Implementation Decisions

### C3 — Rate-Limit Header Mapping Table

Anthropic → OpenAI mapping (verified from Anthropic + OpenAI docs):

| Anthropic header | OpenAI equivalent |
|---|---|
| `anthropic-ratelimit-requests-limit` | `x-ratelimit-limit-requests` |
| `anthropic-ratelimit-requests-remaining` | `x-ratelimit-remaining-requests` |
| `anthropic-ratelimit-requests-reset` | `x-ratelimit-reset-requests` |
| `anthropic-ratelimit-tokens-limit` | `x-ratelimit-limit-tokens` |
| `anthropic-ratelimit-tokens-remaining` | `x-ratelimit-remaining-tokens` |
| `anthropic-ratelimit-tokens-reset` | `x-ratelimit-reset-tokens` |
| `anthropic-ratelimit-input-tokens-*` | (drop — OpenAI has no input/output split) |
| `anthropic-ratelimit-output-tokens-*` | (drop — same) |
| `Retry-After` | `Retry-After` (preserved both directions) |

Translation direction:
- **Anthropic broker route** (`/v1/messages`): Forward Anthropic headers verbatim. NO translation. Client expects Anthropic shape.
- **OpenAI broker route** (`/v1/chat/completions`): Translate to OpenAI namespace. Anthropic headers stripped from response (don't double-emit). OpenAI clients expect `x-ratelimit-*`.

Reset value format: Anthropic uses ISO 8601 timestamp; OpenAI uses Unix timestamp seconds. **Translator MUST convert** — `Date.parse(anthropic_reset) / 1000`.

### D1 — Alias Storage: Redis-Backed (Recommended)

CONTEXT.md says "Redis OR file"; researcher decides. Recommendation default: **Redis-backed** with file fallback.

Rationale:
- Redis-backed: zero-restart updates (set key, takes effect on next request via pub/sub or 5-second TTL refresh).
- File-backed: requires livinityd restart to pick up new entries.
- v22 already uses Redis for capability registry (`nexus:cap:*`); pattern reuse.
- Key pattern: `livinity:broker:alias:<input_name>` → `<resolved_model_id>`.
- Default alias table seeded at livinityd boot if Redis empty (mirrors Phase 50 BUILT_IN_TOOL_IDS pattern).

**Default alias table:**
```
opus            → claude-opus-4-7
sonnet          → claude-sonnet-4-6
haiku           → claude-haiku-4-5-20251001
claude-3-opus   → claude-opus-4-7        (legacy compat)
claude-3-sonnet → claude-sonnet-4-6
claude-3-haiku  → claude-haiku-4-5-20251001
gpt-4           → claude-opus-4-7        (OpenAI tier mapping)
gpt-4o          → claude-sonnet-4-6
gpt-3.5-turbo   → claude-haiku-4-5-20251001
default         → claude-sonnet-4-6
```

(Researcher confirms current Claude family model IDs — knowledge cutoff Jan 2026 says Opus 4.7, Sonnet 4.6, Haiku 4.5. Phase 61 plan may need to fetch latest at planning time.)

### D1 — Alias Resolution Flow

1. Request arrives with `body.model = "opus"` (or any string).
2. Resolver checks Redis: `GET livinity:broker:alias:opus`.
3. If found: resolve to `claude-opus-4-7`; mutate `body.model` before forwarding upstream.
4. If not found AND model matches `^claude-` pattern: pass through verbatim (real model ID).
5. If not found AND model does NOT match `^claude-`: warn-log "Unknown model alias '<name>'; falling back to default", resolve to `default` alias.
6. Resolved model emitted in response `model` field per OpenAI/Anthropic spec.

### D1 — Admin Alias Update Procedure

```bash
# Add new alias
redis-cli SET livinity:broker:alias:claude-4-opus claude-opus-4-7

# Remove alias
redis-cli DEL livinity:broker:alias:claude-4-opus

# List all aliases
redis-cli KEYS 'livinity:broker:alias:*'
```

Documented in `livinity-broker/README.md` (created in Phase 57).

Resolver caches alias table in memory with 5-second TTL — admin updates take effect within 5 seconds without restart.

### D2 — `BrokerProvider` Interface

```typescript
// livinity-broker/providers/interface.ts
export interface BrokerProvider {
  /** Provider name for logging/usage attribution */
  readonly name: string;

  /** Synchronous request — returns full response */
  request(params: ProviderRequestParams): Promise<ProviderResponse>;

  /** Streaming request — returns AsyncIterable of provider-native events */
  streamRequest(params: ProviderRequestParams): AsyncIterable<ProviderStreamEvent>;

  /** Extract usage object from response (for broker_usage tracking) */
  translateUsage(response: ProviderResponse): UsageRecord;
}

export type ProviderRequestParams = {
  model: string;          // already alias-resolved
  messages: Message[];
  system?: string;
  tools?: Tool[];
  maxTokens?: number;
  // ... full request shape
};

export type UsageRecord = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};
```

### D2 — `AnthropicProvider` Class (Concrete)

Extracted from Phase 57 passthrough handler. Implements `BrokerProvider`:
- `name = "anthropic"`
- `request()` calls `client.messages.create({...params, stream: false})` and returns the response.
- `streamRequest()` calls `client.messages.create({...params, stream: true})` and yields events from the async iterator.
- `translateUsage()` extracts `{input_tokens, output_tokens}` from `response.usage` and maps to canonical `UsageRecord` shape.

### D2 — Stub Classes (Compile But Throw)

- `OpenAIProvider extends BrokerProvider` — `request()` throws `NotImplementedError("OpenAI provider not implemented in v30")`. Same for `streamRequest()` + `translateUsage()`.
- `GeminiProvider`, `MistralProvider` — same stub pattern.
- These stubs MUST compile (TypeScript-clean) so future engineers can drop in concrete bodies. They MUST NOT be wired into router dispatch (no risk of accidental invocation).

### Provider Selection Logic

Phase 61 introduces a **provider registry** (simple Map<string, BrokerProvider>) but does NOT yet wire model-prefix-based routing. Phase 61's broker still forwards everything to Anthropic regardless of input model alias.

Future work (v30+): if `model` starts with `openai/`, route to `OpenAIProvider`. If `gemini/`, `GeminiProvider`. Etc. v30 Phase 61 only ships the interface + stubs; concrete routing is post-MVP.

### Sacred File — UNTOUCHED

Phase 61 only touches `livinity-broker/`. No edits to `nexus/packages/core/src/sdk-agent-runner.ts`. SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged.

### Claude's Discretion

- File structure: `providers/` subdirectory (`interface.ts`, `anthropic.ts`, `openai-stub.ts`, etc.) vs single file. Sub-directory recommended — cleaner.
- Header translation: middleware or in-handler. Middleware (after route, before response send) recommended — single source of truth.
- Alias resolver: standalone module or method on AnthropicProvider. Standalone module recommended — provider-agnostic.
- Cache TTL exact value (5s vs 30s vs 60s). Default 5s for snappy admin updates.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 57+58 planned outputs)
- `livinity-broker/passthrough-handler.ts` (Phase 57) — current location of Anthropic SDK calls. Phase 61 EXTRACTS this logic into `providers/anthropic.ts` while keeping the handler thin (dispatches to provider).
- `livinity-broker/openai-stream-translator.ts` (Phase 58) — emits OpenAI chunks. Phase 61 ADDS rate-limit header translation in the response-write path.
- `livinity-broker/openai-translator.ts` (Phase 57) — sync OpenAI shape. Phase 61 ADDS rate-limit header translation in the response-write path.
- v22 Redis capability registry (`nexus:cap:*` prefix) — Phase 61 uses similar pattern (`livinity:broker:alias:*`).
- v29.5 Phase 50 `seed-builtin-tools.ts` — pattern for boot-time Redis seeding. Phase 61 has similar `seed-default-aliases.ts`.
- v29.4 Phase 45 broker 429 + Retry-After preservation — Phase 61 EXTENDS to non-429 ratelimit headers too.
- `nexus/packages/core/package.json` `@anthropic-ai/sdk` — Phase 57 enables broker import; Phase 61 uses `response.headers` accessor.

### Established Patterns
- v22 Redis registry pattern (key prefixing, boot seeding, in-memory cache + TTL).
- v29.3 Phase 42 model alias warn-and-fall-through (D-42-12).
- v29.3 Phase 41 HTTP-proxy header pass-through (Phase 41 Strategy B forwards all headers; Phase 61 selectively transforms).

### Integration Points
- `livinity-broker/passthrough-handler.ts` — refactored to dispatch via `BrokerProvider` interface. Existing Phase 57 code becomes the AnthropicProvider implementation.
- `livinity-broker/openai-router.ts` — adds rate-limit header translation to response.
- `livinity-broker/router.ts` — adds rate-limit header forwarding to response (Anthropic shape).
- `livos/packages/livinityd/source/server/index.ts` — boot-time alias seeder mounts (similar to Phase 50 seed-builtin-tools).
- Redis — new key namespace `livinity:broker:alias:*`.
- LivOS in-app chat — unaffected (uses `/ws/agent`, not broker).

</code_context>

<specifics>
## Specific Ideas

- **Header curl verification (Phase 63):** `curl -I https://api.livinity.io/v1/messages` returns `anthropic-ratelimit-requests-remaining: <num>` (not zero unless quota actually exhausted). Same with curl on `/v1/chat/completions` returns `x-ratelimit-remaining-requests` instead.
- **Alias verification:** `curl ... -d '{"model": "opus", ...}'` returns 200 (not 404 model-not-found). Response `model` field shows resolved real ID (e.g., `claude-opus-4-7`).
- **Admin runtime update:** `redis-cli SET livinity:broker:alias:test-alias claude-haiku-4-5-20251001`; within 5 seconds `curl ... -d '{"model": "test-alias", ...}'` works without restart.
- **Provider interface compile check:** `npx tsc --noEmit` over `livinity-broker/providers/*.ts` exits 0; all stubs compile.
- **Provider stub doesn't fire:** integration test asserts unknown-model-name request DOES NOT route through OpenAI/Gemini stub (would throw NotImplementedError) — falls through to AnthropicProvider with default alias.

</specifics>

<deferred>
## Deferred Ideas

- **OpenAI provider concrete implementation** — defer to v30+ post-MVP.
- **Gemini/Mistral concrete implementations** — defer indefinitely.
- **Per-tier rate-limit policy** — defer to monetization milestone.
- **Per-tier pricing/billing** — defer to monetization.
- **Model selection by user preference (admin-set default)** — Settings UI deferred to Phase 62; v30 hardcodes `claude-sonnet-4-6` as fallback default.
- **Multi-provider routing by model prefix** (`openai/gpt-4o` → OpenAI provider) — interface ready in Phase 61 but routing logic defers to post-MVP.

</deferred>
