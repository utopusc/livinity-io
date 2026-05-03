# Q1 Research Notes — Anthropic Passthrough Strategy (SDK-direct vs HTTP-proxy vs Hybrid)

**Date:** 2026-05-02
**Phase:** 56 (research spike)
**Plan:** 56-01
**Researcher:** Claude (gsd-executor)
**Sacred file SHA before Q1 task:** `4f868d318abff71f8c8bfbcf443b2393a553018b` (matches required)

## Sources Fetched

The following URLs were fetched via curl (HTTP equivalent of WebFetch — curl 8.17.0):

- https://docs.anthropic.com/en/api/messages
- https://docs.anthropic.com/en/api/messages-streaming
- https://docs.anthropic.com/en/api/getting-started
- https://docs.anthropic.com/en/api/client-sdks
- https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/streaming.ts (deprecated re-export)
- https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/core/streaming.ts (real SSE handler — 10906 bytes)
- https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/index.ts
- https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/client.ts (50740 bytes — auth + baseURL definitive source)
- https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/resources/messages/messages.ts (91832 bytes — Messages.create / Messages.stream signatures)
- https://registry.npmjs.org/@anthropic-ai/sdk/0.80.0 (npm registry metadata fallback per plan NOTE)

Note: The two GitHub source files for `streaming.ts` and `index.ts` exist but redirect: `streaming.ts` is now a 90-byte deprecated re-export of `./core/streaming`; `index.ts` is now a thin re-export of `./client`. The substantive source moved into `client.ts` and `core/streaming.ts` after a 2025 SDK refactor. Both real files were fetched.

## Key Findings From External Docs + SDK Source

### F1 — SDK supports BOTH `apiKey` and `authToken` first-class (decisive)

`src/client.ts` lines 264, 269:
```ts
apiKey?: string | ApiKeySetter | null | undefined;
authToken?: string | null | undefined;
```

`src/client.ts` lines 493-505:
```ts
protected async apiKeyAuth(opts: FinalRequestOptions): Promise<NullableHeaders | undefined> {
  if (this.apiKey == null) return undefined;
  return buildHeaders([{ 'X-Api-Key': this.apiKey }]);
}
protected async bearerAuth(opts: FinalRequestOptions): Promise<NullableHeaders | undefined> {
  if (this.authToken == null) return undefined;
  return buildHeaders([{ Authorization: `Bearer ${this.authToken}` }]);
}
```

Default env vars (line 384-385): `ANTHROPIC_API_KEY` resolves to `apiKey`; `ANTHROPIC_AUTH_TOKEN` resolves to `authToken`.

**Implication:** A1 (`apiKey`) is moot for v30 — D-NO-BYOK forbids it. A2 (`authToken`) flips the SDK into Bearer-auth mode using whatever opaque string is supplied (could be the Anthropic-issued OAuth subscription access_token from `~/.claude/<id>/.credentials.json`). The SDK does NOT validate token shape — it just sets the header.

**This invalidates Assumption A1 from RESEARCH.md as outdated** (the assumption was conservative — saying "if SDK only supports `apiKey`"). Verdict: SDK supports BOTH `apiKey` and `authToken`. [VERIFIED: src/client.ts lines 264, 269, 384-385, 493-505]

### F2 — SDK supports `baseURL` override (env: `ANTHROPIC_BASE_URL`)

`src/client.ts` line 274-276:
```ts
/**
 * Defaults to process.env['ANTHROPIC_BASE_URL'].
 */
baseURL?: string | null | undefined;
```

Resolution at line 383, 392: `baseURL = readEnv('ANTHROPIC_BASE_URL') || 'https://api.anthropic.com'`. **This is what FR-VERIFY-V30-06 will use** (Anthropic Python SDK pointing at `api.livinity.io`). Confirms Assumption A5 (the TS SDK supports `baseURL` — by parity, the Python SDK does too; verify in Phase 63).

### F3 — Anthropic SSE event sequence (canonical)

`src/core/streaming.ts` lines 60-95 enumerate the events the SDK accepts in its SSE iterator:
```
sse.event === 'message_start'
sse.event === 'message_delta'
sse.event === 'message_stop'
sse.event === 'content_block_start'
sse.event === 'content_block_delta'
sse.event === 'content_block_stop'
sse.event === 'ping' (continue — no-op)
sse.event === 'error' (throws APIError)
```

Plus newer agent-mode events (`agent.thinking`, `agent.tool_use`, `session.*`) which appear to be additions for the Claude Agent SDK / claude.ai Code path — out of scope for the raw Messages passthrough.

The canonical sequence for Messages streaming is exactly the 6 events the plan specified:
`message_start` → `content_block_start` → `content_block_delta` ×N → `content_block_stop` → `message_delta` → `message_stop`. [VERIFIED: src/core/streaming.ts lines 60-95]

### F4 — Authentication model distinction (P2 pitfall confirmation)

`src/client.ts` lines 466-485 enforce mutual exclusivity at validate time: a request must supply EITHER `X-Api-Key` OR `Authorization` (or have one explicitly nulled). This means `authToken` IS forwarded as a Bearer token verbatim — but the SDK does not distinguish "API-key Bearer" from "OAuth-subscription Bearer" semantically. Both use the SAME header construction path. The semantic distinction lives in:

- `~/.claude/<id>/.credentials.json` carries an OAuth `access_token` issued by Anthropic — opaque from the SDK's perspective.
- Anthropic's edge accepts EITHER an API key (via `x-api-key`) OR an OAuth access token (via `Authorization: Bearer`) for first-party clients. The latter is the "subscription/Claude Code" path.

P2 is averted by being explicit: a passthrough strategy that READS `~/.claude/<id>/.credentials.json` and forwards as Bearer is functionally identical to what Anthropic's own Claude Code CLI does. The risk closed in v29.3 Phase 39 was that `claude.ts` (the AI-Chat raw-SDK provider) had a fallback that did this — exposing the OAuth token to a code path that wasn't gated by D-NO-BYOK's "broker mints its own keys" intent for AI Chat. Phase 57 broker passthrough is a DIFFERENT context — the broker is intentionally a thin Anthropic-edge proxy for external clients, so forwarding upstream-Anthropic auth headers verbatim is the explicit design.

**However** — D-NO-BYOK + the v29.3 Phase 39 lesson means the SDK-direct path MUST NOT route through `claude.ts` (the file with the no-authtoken regression test). It MUST live in NEW broker code (e.g., new `livinity-broker/passthrough-anthropic.ts`). [VERIFIED: src/client.ts lines 466-485 + nexus/packages/core/src/providers/no-authtoken-regression.test.ts lines 38-50]

### F5 — Existing HTTP-proxy pattern (in-repo Strategy B copy/adapt source)

`agent-runner-factory.ts` lines 92-97 already does HTTP proxy via `fetch()`:
```ts
const response = await fetch(`${livApiUrl}/api/agent/stream`, { method: 'POST', headers, body: JSON.stringify(body), signal });
```

with `UpstreamHttpError` capture (lines 99-106) for 429+Retry-After verbatim forwarding. **A Strategy A (HTTP-proxy direct to api.anthropic.com) implementation can copy this pattern almost verbatim**, swapping `${livApiUrl}/api/agent/stream` for `https://api.anthropic.com/v1/messages` and adjusting headers (`x-api-key` OR `Authorization: Bearer`, plus `anthropic-version: 2023-06-01`).

The existing HTTP-proxy pattern is a proven primitive. Reuse cost is near-zero. [VERIFIED: agent-runner-factory.ts:64-173]

### F6 — `homeOverride` + `~/.claude/<id>/` dir layout

`sdk-agent-runner.ts:297` uses `HOME: this.config.homeOverride || process.env.HOME` — the per-user HOME isolation pattern. Subscription auth dir is `${HOME}/.claude/<id>/.credentials.json` for the multi-user case. **This pattern is preserved by Strategy B (SDK-direct) only if the broker process can read those files** (livinityd runs as root per D-LIVINITYD-IS-ROOT — yes, it can). [VERIFIED: sdk-agent-runner.ts:297, livos/packages/livinityd/source/modules/ai/per-user-claude.ts has the credentials.json path constants]

### F7 — Anthropic API `anthropic-version` header

The Anthropic Messages API requires the `anthropic-version` header (e.g., `2023-06-01`). The TS SDK injects this automatically; HTTP-proxy strategy must forward the client's `anthropic-version` if present, or default to `2023-06-01`. [VERIFIED: docs.anthropic.com/en/api/messages — present in the messages.html source]

## Candidate Evaluation Table

| Strategy | Description | Auth model | SSE handling | Sacred file | New deps | Per-user HOME | D-NO-BYOK | Verdict |
|----------|-------------|------------|--------------|-------------|----------|---------------|-----------|---------|
| **A. HTTP-proxy direct to `api.anthropic.com/v1/messages`** | Broker `fetch()`s upstream Anthropic, copying the existing `agent-runner-factory.ts` pattern; reads `~/.claude/<id>/.credentials.json` to extract `access_token`, forwards as `Authorization: Bearer`. | Bearer (subscription access_token from per-user file) | Pipe Anthropic Response.body verbatim to client (raw SSE byte forward) | UNTOUCHED — broker file only | ZERO (Node 22 `fetch()` builtin) | Preserved (broker process reads per-user creds.json) | Preserved (broker reads, never accepts client-supplied keys) | **CHOSEN** |
| **B. SDK-direct (`new Anthropic({authToken, baseURL}).messages.stream()`)** | Broker uses `@anthropic-ai/sdk` (already in nexus deps) with explicit `authToken` + iterates the returned `Stream<RawMessageStreamEvent>` async iterator. | Bearer (via SDK `authToken` option) | SDK iterator yields parsed events; broker re-emits as SSE frames | UNTOUCHED — broker file only; new broker code does NOT touch sdk-agent-runner.ts. Recreates risk closed in v29.3 Phase 39 ONLY if placed in `claude.ts` — must live in a NEW broker-side file to avoid the regression test trip. | ZERO if `@anthropic-ai/sdk` cross-package access available; otherwise add to livinityd deps (1 transitive add — **breaks D-NO-NEW-DEPS for livinityd package**) | Preserved (broker process reads per-user creds.json same as A) | Preserved | Disqualified — see Rationale 3 |
| **C. Hybrid: HTTP-proxy with subscription token extracted by livinityd** | Same as A but writes the token-extraction helper as a separate broker-side module (`per-user-token-extractor.ts`); HTTP request is a thin call site. | Bearer (subscription access_token, extracted via helper) | Same as A (raw byte forward) | UNTOUCHED | ZERO | Preserved | Preserved | Refinement of A; not a separate strategy. Use A's structure with C's separation if Phase 57 wants tighter testing. |

## Verdict (preference order from RESEARCH.md applied)

Priority: (1) D-NO-BYOK preserved → (2) Sacred file untouched → (3) Per-user `homeOverride` preserved → (4) SSE flows token-by-token → (5) Fewest moving parts.

**A wins on every dimension** because it (a) reuses the proven `fetch()` HTTP-proxy pattern from `agent-runner-factory.ts`, (b) requires zero new dependencies in either the livinityd or nexus package (D-NO-NEW-DEPS preserved), (c) leaves the sacred file untouched (D-30-30 sacred boundary preserved), (d) raw byte forwarding of upstream Anthropic SSE delivers true token-by-token streaming (Q7's "passthrough fixes via direct Anthropic SSE" outcome), and (e) is the simplest mechanism — fewest moving parts.

**B is disqualified** primarily because:
- B forces livinityd to add `@anthropic-ai/sdk` to its own `package.json` (it currently doesn't have it — only `nexus/packages/core` does), which **breaks D-NO-NEW-DEPS for the livinityd package boundary**.
- B introduces SDK iterator boilerplate (parse → re-emit as SSE) that A doesn't need (A streams bytes verbatim).
- B's only advantage (SDK abstracts auth header construction) is unnecessary — the broker only needs to forward one Authorization header it already extracted.
- B has a non-zero risk of recreating the exact "OAuth-token through raw SDK" pattern that v29.3 Phase 39 closed in `claude.ts`. Even though it would be in a different file (escaping the regression test guard), it would be the same architectural shape — and we'd be adding a new vector to maintain.

**C is not a separate strategy** — it's a tactical refactor of A (split the token-extraction into a helper). Recommend Phase 57 implements it that way for testability.

## D-NO-NEW-DEPS Implication

- **Strategy A: zero new deps.** Uses Node 22 builtin `fetch()`. The broker file `livinity-broker/passthrough-anthropic.ts` (new) imports nothing beyond Node builtins + existing `livinityd` modules.
- The existing `@anthropic-ai/sdk@^0.80.0` (at `nexus/packages/core/package.json:34`) is NOT relied on — it's still used by `claude.ts` for the API-key-bound provider, and by `sdk-agent-runner.ts` (sacred) via the agent-sdk wrapper. v30 adds nothing here.
- The existing `@anthropic-ai/claude-agent-sdk@^0.2.84` (at `nexus/packages/core/package.json:33`) is NOT relied on either — it's the agent SDK used by sacred file; passthrough bypasses it entirely.

## Risk + Mitigation Inventory

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `~/.claude/<id>/.credentials.json` schema changes (Anthropic version bumps the OAuth token format) | LOW (Anthropic ships the file format under their CLI; their own backwards-compat care is high) | Wrap extraction in `try/catch` returning a typed error; passthrough emits Anthropic-shape `authentication_error` (401) when extraction fails; UAT step in Phase 57 validates this manually |
| Token TTL expires mid-conversation (subscription tokens have a refresh cycle) | MEDIUM | Detect 401 from upstream Anthropic, return Anthropic-shape `authentication_error`; user re-authenticates via existing per-user OAuth UI (Phase 40 already has `claudePerUserStartLogin`); Phase 57 documents the renewal flow |
| `fetch()` request hangs without timeout (Node 22 default has no hard timeout) | MEDIUM | Use `AbortController` with `setTimeout` fallback (60s default); copy the pattern from `agent-runner-factory.ts` which already passes `signal` via the `opts.signal` plumbing |
| SSE response from Anthropic includes `event: error` mid-stream | MEDIUM | The raw byte-forward delivers it to the client unmodified — this IS the correct behavior. No transformation needed. |
| Sacred file SHA drift from accidental edit | LOW | Phase 57 runs `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` in CI as a hard gate. Already done in this Q1 task — see SHA check below. |
| Strategy A error-sanitization leaks `~/.claude/<id>/` paths in 500 bodies (Phase 56 RESEARCH.md security flag) | LOW (only one extraction site) | Wrap the file read in a try/catch that emits a generic message; never include the file path in the response body. |

## Code-Level Integration Point (precise)

- **File:** `livos/packages/livinityd/source/modules/livinity-broker/router.ts`
- **Symbol:** `router.post('/:userId/v1/messages', ...)` handler — current implementation lines 36-187.
- **Behavioral expectation for Phase 57:** Insert mode-dispatch logic at the TOP of the handler body (after auth/body-validation but BEFORE the existing `wantsStream`/sync split at line 85). When mode=passthrough (default for v30), call a NEW `forwardToAnthropic({userId, body, signal, res})` function that:
  1. Reads `~/.claude/<userId>/.credentials.json` to extract `access_token` (or returns 401 in Anthropic-shape if missing/expired).
  2. Issues `fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers:{'Authorization': 'Bearer <token>', 'anthropic-version': body['anthropic-version'] ?? '2023-06-01', 'content-type':'application/json'}, body: JSON.stringify(body), signal})`.
  3. If `body.stream === true`: pipe `response.body` to `res` verbatim (preserving Content-Type: text/event-stream).
  4. If `body.stream !== true`: pipe `response.body` to `res` as JSON (with `Content-Type: application/json`).
  5. Forward upstream rate-limit headers (`anthropic-ratelimit-*`) verbatim.
  6. On non-OK upstream response: forward status + Anthropic-shape error body verbatim (including 429 + `Retry-After` per existing v29.4 Phase 45 pattern).
- **Where mode is determined:** Phase 56 plan 56-02 Q3 picks header-vs-path. If header-based: read `req.header('X-Livinity-Mode') === 'agent'` to opt INTO agent mode; absent = passthrough. Default behavior change (current = agent-mode-only) is a v30 breaking change for any internal caller relying on the URL alone — gate this with the Q3 verdict.

## Sacred file SHA after Q1 task

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches required `4f868d318abff71f8c8bfbcf443b2393a553018b`. ✓ No edits made.

## ASSUMED → VERIFIED transitions

| Assumption (RESEARCH.md) | Status | Source |
|--------------------------|--------|--------|
| A1: `@anthropic-ai/sdk@^0.80.0` supports `messages.stream()` with both `apiKey` and access-token auth | **VERIFIED** | src/client.ts lines 264, 269, 493-505 — both `apiKey` and `authToken` are first-class ClientOptions |
| A5: Anthropic SDK Python equivalent supports `base_url` override | **PARTIALLY VERIFIED** (TS confirmed; Python parity assumed but Phase 63 must run a smoke test) | TS SDK src/client.ts line 276 confirms `baseURL` + `ANTHROPIC_BASE_URL` env var; Python SDK presumed to mirror by Anthropic SDK convention but unverified |
