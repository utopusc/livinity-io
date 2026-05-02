# Phase 56: Research Spike — Passthrough Architecture + Public Endpoint + Auth Patterns - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Research-only spike (no code; produces decisions consumed by Phases 57-62)

<domain>
## Phase Boundary

Phase 56 is a **research-only spike**. Output is `.planning/phases/56-research-spike/SPIKE-FINDINGS.md` containing concrete answers (not "TBD" rows) to the 7 open architectural questions blocking implementation:

1. **Anthropic SDK direct passthrough vs HTTP proxy to api.anthropic.com — which?** SDK uses subscription auth (per-user `~/.claude` dirs); HTTP proxy is simpler but Bearer token forwarding may conflict with D-NO-BYOK. Pick ONE with code-level integration point named.
2. **External client tools — forward or ignore?** Anthropic API supports `tools` natively; broker passthrough should forward verbatim. Verify subscription auth path doesn't reject tools.
3. **Agent mode opt-in mechanism?** Header (`X-Livinity-Mode: agent`) or URL path (`/u/<id>/agent/v1/...`)? Pick ONE with worked example showing opt-in vs default-passthrough.
4. **Public endpoint architecture?** Server5 Caddy or Cloudflare Worker (faster cold start, edge cache)? Pair with TLS strategy + rate-limit primitive.
5. **API key rotation policy?** Manual revoke + recreate, or automatic 90-day rotation? Default-keyed users or opt-in only?
6. **Rate limit policy?** Forward Anthropic rate limits verbatim, or impose broker-level token-bucket per-key?
7. **Block-level streaming for Agent mode?** Confirm whether Agent SDK fundamentally aggregates and Agent mode keeps this; passthrough fixes via direct Anthropic SSE.

Plus a sub-decision: **D-51-03 re-evaluation** — verdict on whether Branch N (sacred-file model identity preset switch) is still needed in v30 or absorbed by passthrough.

OUT OF SCOPE for this phase: writing any production code, modifying any source file, deploying anything. Phase 56 produces ONLY: `SPIKE-FINDINGS.md` + any throwaway research notes.

</domain>

<decisions>
## Implementation Decisions

### Research Methodology

- **Primary sources:** Anthropic API official docs (docs.anthropic.com), Anthropic TypeScript/Python SDK source on GitHub, Anthropic Messages SSE spec, OpenAI Chat Completions spec (for translation reference), `livinity-broker/` source code in this repo, `nexus/packages/core/src/sdk-agent-runner.ts` (sacred file — read but don't edit), `nexus/packages/core/src/providers/claude.ts` (existing Claude provider).
- **Secondary sources:** competitor self-host brokers (LiteLLM, OpenRouter for HTTP-proxy patterns), Caddy on-demand TLS docs (already in v19/v20 stack), Cloudflare Workers docs (for rate-limit primitive comparison), Bearer token auth patterns from prominent OSS APIs (Stripe, OpenAI, Anthropic — `sk-*` / `liv_sk_*` rationale).
- **Tools:** WebSearch + WebFetch for external docs; Read + Grep for in-repo code.
- **Output discipline:** Each of the 7 questions gets a verdict block in SPIKE-FINDINGS.md with: chosen path, ≥2 alternatives evaluated, rationale (≥3 reasons), code-level integration point named (file path + symbol + behavioral expectation), risk/mitigation pair.

### Sacred File Boundary

- The phase researcher MAY read `nexus/packages/core/src/sdk-agent-runner.ts` to understand current behavior. Researcher MUST NOT modify this file. Any "we should change line N" recommendation goes to a deferred D-30-XX decision row, NOT a code edit in v30.
- Researcher MUST verify the file's SHA before and after the spike completes (matches `4f868d318abff71f8c8bfbcf443b2393a553018b`). Any drift is a phase-level blocker.

### Out-of-Scope During This Spike

- No edits to any source file under `livinity-broker/`, `livos/`, `nexus/`, `livinity-io-platform/` (planning artifacts only).
- No SSH to Mini PC or Server5. The spike is desk-research from this repo + public docs.
- No package additions (no `npm install`). Researcher CAN evaluate "if v30.0 needs `@anthropic-ai/sdk`" as a verdict but cannot install it in this phase.

### Claude's Discretion

- Exact SPIKE-FINDINGS.md section ordering and visual format (markdown tables vs prose).
- Choice of ≥2 alternatives evaluated per question (researcher selects based on legitimate competing approaches surfaced during research).
- Whether to produce intermediate research notes (e.g., `notes-anthropic-sdk-arch.md`) or fold everything into SPIKE-FINDINGS.md. Either is acceptable as long as SPIKE-FINDINGS.md is the single canonical answer document.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `livinity-broker/router.ts` — current broker router with Anthropic Messages + OpenAI Chat Completions endpoints. Calls nexus `/api/agent/stream` via HTTP-proxy strategy (Phase 41 D-WAVE3-HTTP-PROXY). This is the file that gets a NEW passthrough branch in Phase 57.
- `livinity-broker/openai-router.ts` — OpenAI-compat sub-router with line 110-124 currently warning-and-ignoring client-supplied `tools[]` (D-42-12). Phase 57+ should forward client tools in passthrough mode.
- `livinity-broker/openai-sse-adapter.ts` — current OpenAI SSE adapter (rewritten in Phase 58 to be a 1:1 Anthropic→OpenAI delta translator).
- `nexus/packages/core/src/providers/claude.ts` — existing Claude provider with `@anthropic-ai/sdk` import. v29.3 Phase 39 closed the OAuth fallback path. Reference for: how SDK is initialized, how subscription auth flows, `homeOverride` pattern from Phase 40.
- `nexus/packages/core/src/sdk-agent-runner.ts` — sacred file at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`. Lines 264-270 prepend the "You are powered by Claude X.Y" identity line. Lines 382-389 aggregate `assistant` messages into single chunks (the block-streaming root cause).
- Existing PG connection pool, tRPC infra, Express middleware patterns — Phase 59 reuses these for Bearer auth.
- v19/v20 Caddy on-demand TLS pattern — Server5 already runs Caddy with `*.livinity.io` wildcard + on-demand for custom domains. Phase 60 adds `api.livinity.io` here (or evaluates CF Worker alternative).

### Established Patterns
- HTTP-proxy strategy (Phase 41) — broker forwards to nexus via `fetch()` to `localhost:3200/api/agent/stream`. Passthrough mode replaces `localhost:3200` target with `api.anthropic.com` — but with what auth header?
- Per-user `homeOverride` (Phase 40) — broker passes `X-LivOS-User-Id` → nexus → `~/.claude/<userId>/` synthetic dir. SDK subscription auth reads from there. Passthrough mode either: (a) keeps this with SDK direct call OR (b) drops it with HTTP proxy + per-user Bearer forwarding (D-NO-BYOK conflict).
- v29.3 Phase 42 OpenAI translation pattern — synchronous Anthropic→OpenAI shape mapping. Phase 58 extends to streaming chunk-level translation.
- `broker_usage` middleware (Phase 44) — Express response capture parses `usage` from both shapes. Phase 62 extends with `api_key_id` column.

### Integration Points
- `livinity-broker/router.ts:159` — current 500-on-upstream-error site (Phase 45 fixed for 429+Retry-After). Passthrough mode's error handling lives here.
- `livinity-broker/openai-router.ts:110-124` — D-42-12 warn-and-ignore `tools[]` site. Passthrough mode flips this to forward.
- `nexus/packages/core/src/sdk-agent-runner.ts:382-389` — block-streaming aggregation site. Untouched in v30; passthrough bypasses entirely.
- `livos/packages/livinityd/source/server/index.ts` — Express middleware mount point. Bearer auth middleware (Phase 59) inserts BEFORE existing per-user URL-path identity logic.
- Server5 Caddyfile (under `livinity-io-platform/server5/Caddyfile` or similar — researcher confirms exact path) — Phase 60 adds the `api.livinity.io` block here OR Phase 60 builds a CF Worker.
- PG schema migrations dir under `livos/packages/livinityd/source/modules/database/migrations/` — Phase 59 adds the `api_keys` table migration here.

</code_context>

<specifics>
## Specific Ideas

- **Bearer token format:** `liv_sk_<base62-32chars>` per Stripe/OpenAI convention. Researcher should verify base62 charset choice (no ambiguous chars like `1IlO0o`?) and validate 32 chars provides sufficient entropy (~190 bits — plenty).
- **Public endpoint domain:** `api.livinity.io` (already mentioned in MILESTONE-CONTEXT.md). DNS A/AAAA points to Server5. Researcher verifies wildcard DNS posture won't conflict.
- **Sacred file SHA:** `4f868d318abff71f8c8bfbcf443b2393a553018b` — researcher verifies this matches reality at start AND end of spike.
- **Anthropic API base URL:** `https://api.anthropic.com/v1` (researcher confirms correct version namespace at time of spike).
- **D-NO-BYOK reminder:** Broker NEVER accepts user's raw `claude_*` API key. Broker mints `liv_sk_*` tokens. Subscription auth (per-user `~/.claude/<userId>/`) is upstream toward Anthropic. Researcher must confirm the SDK-direct path doesn't accidentally surface a raw API key requirement.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-provider concrete implementations** (OpenAI / Gemini / Mistral providers) — D2 ships only the interface stub in v30; concrete providers defer per REQUIREMENTS.md Out of Scope.
- **Webhook events** (api.livinity.io/webhooks) — defer per MILESTONE-CONTEXT.md.
- **Embedding API** (/v1/embeddings) — defer to v31+.
- **Subscription billing / usage-based quotas** — broker enforces only Anthropic upstream rate limits + baseline; per-user quotas tied to subscription tiers defer to a future "monetization" milestone.
- **Sacred file edits** — D-51-03 deferred Branch N reversal. If spike concludes the sacred file MUST change, it becomes a v30.1 hot-patch.
- **Mobile API key management UI** — desktop-only in v30 per Out of Scope.

</deferred>
