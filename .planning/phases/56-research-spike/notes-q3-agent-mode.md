# Q3 Research Notes — Agent-mode Opt-In Mechanism

**Date:** 2026-05-02
**Phase:** 56 (research spike)
**Plan:** 56-02
**Researcher:** Claude (gsd-executor)
**Sacred file SHA before Q3 task:** `4f868d318abff71f8c8bfbcf443b2393a553018b` (matches required)

## Question

Should the broker opt clients INTO agent mode via:
- **A.** Custom request header `X-Livinity-Mode: agent`, OR
- **B.** URL path segment `/u/<id>/agent/v1/messages` (vs default `/u/<id>/v1/messages` = passthrough), OR
- **C.** Both supported (path overrides header if present)?

Default behavior in v30 is **passthrough** (per Q1 verdict — Strategy A HTTP-proxy direct to `api.anthropic.com`). Agent mode (current behavior, Nexus identity + Nexus tools + aggregated SDK output) becomes opt-in.

## Sources Fetched (via curl 8.17.0 — HTTP equivalent of WebFetch)

| URL | Status | Bytes | Purpose |
|-----|--------|-------|---------|
| https://docs.anthropic.com/en/api/versioning | 200 | 529 153 | Anthropic precedent for `X-*` request headers (`anthropic-version: 2023-06-01`) |
| https://platform.openai.com/docs/api-reference/authentication | 200 (JS shell) | 9 681 | OpenAI auth pattern fallback — confirmed via SDK README below |
| https://github.com/openai/openai-python/blob/main/README.md | 200 | 611 811 | OpenAI Python SDK — confirms `api_key` (Bearer) + `base_url` only; no opt-in custom headers |
| https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/README.md | 200 | 20 709 | Bolt.diy docs — env-var driven `*_API_BASE_URL` per provider |
| https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/.env.example | 200 | 7 586 | Bolt.diy provider-key list — `ANTHROPIC_API_KEY`, no per-provider header injection |
| https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/app/lib/modules/llm/providers/anthropic.ts | 200 | 4 456 | Bolt.diy Anthropic provider source — uses `@ai-sdk/anthropic`, hardcoded `https://api.anthropic.com`; no header injection point |
| https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/app/lib/modules/llm/providers/openai-like.ts | 200 | 4 970 | Bolt.diy OpenAI-Like provider — supports `OPENAI_LIKE_API_BASE_URL` (custom base URL via OpenAI-compat) |
| https://raw.githubusercontent.com/open-webui/open-webui/main/README.md | 200 | 15 998 | Open WebUI docs — `OPENAI_API_BASE_URL` env var supported |
| https://raw.githubusercontent.com/open-webui/open-webui/main/backend/open_webui/routers/openai.py | 200 | 57 640 | OWUI OpenAI router source — `ENABLE_FORWARD_USER_INFO_HEADERS` + `FORWARD_USER_INFO_HEADER_*` extension points (`include_user_info_headers()` injects custom headers from env vars) |
| https://raw.githubusercontent.com/open-webui/open-webui/main/backend/open_webui/utils/headers.py | 200 | 543 | OWUI headers utility — confirms 4 user-info headers configurable via env: USER_NAME / USER_ID / USER_EMAIL / USER_ROLE |
| https://docs.continue.dev/reference | 200 | 201 958 | Continue.dev reference — explicit `requestOptions.headers` field documented as "Custom headers for HTTP requests" |
| https://raw.githubusercontent.com/continuedev/continue/main/core/llm/index.ts | 200 | 45 029 | Continue.dev core LLM source — `requestOptions?: RequestOptions` propagates to `fetchwithRequestOptions` (full custom-header support) |
| https://docs.cline.bot/provider-config/anthropic | 200 | 397 671 | Cline Anthropic provider — "(Optional) Custom Base URL: ... check 'Use custom base URL' and enter the URL" |
| https://docs.cline.bot/provider-config/openai-compatible | 200 | 370 655 | Cline OpenAI-compatible provider — "Base URL: Enter the base URL provided by your chosen provider. **This is a crucial step.**" |

## Anthropic precedent for X-* header opt-in

`anthropic-version` is the canonical example: a request-level header that opts the request into a behavior (API version pinning). The header is required to be sent by the client (it's not auto-injected at the edge). Anthropic also uses `anthropic-beta` for opt-in beta feature flags. **Conclusion:** Anthropic itself uses request-level custom headers as opt-in switches. A `X-Livinity-Mode: agent` header would follow the same idiom and be familiar to anyone consuming Anthropic's API. [VERIFIED: docs.anthropic.com/en/api/versioning text "anthropic-version: 2023-06-01"]

## OpenAI precedent

OpenAI's API uses ONLY `Authorization: Bearer <key>` + `base_url` for client-side configuration. There are no opt-in feature headers. SDKs don't expose a "send extra header X" surface in the standard quickstart. **Conclusion:** OpenAI's pattern is "configure base URL once, never fragment." This argues AGAINST URL-path opt-in (the OpenAI client would need a different `base_url` per mode — clients can only set ONE per session). [VERIFIED: openai-python README — `api_key=` and `base_url=` are the only two ClientOptions in the canonical example]

## Client-Compat Matrix

| Client | Custom headers? | base_url switching? | Evidence (URL + snippet) |
|--------|-----------------|---------------------|--------------------------|
| **Bolt.diy** | NO (per-provider; OpenAI-Like is best path) | YES (`OPENAI_LIKE_API_BASE_URL` env var) | https://raw.githubusercontent.com/stackblitz-labs/bolt.diy/main/app/lib/modules/llm/providers/openai-like.ts — `config = { baseUrlKey: 'OPENAI_LIKE_API_BASE_URL', apiTokenKey: 'OPENAI_LIKE_API_KEY' }`. Anthropic provider hardcodes `https://api.anthropic.com` — no base-URL override; no header injection hook. |
| **Open WebUI** | YES (env-var driven, single header set per Connection) | YES (per-Connection base URL) | https://raw.githubusercontent.com/open-webui/open-webui/main/backend/open_webui/routers/openai.py — `if ENABLE_FORWARD_USER_INFO_HEADERS and user: headers = include_user_info_headers(headers, user)`. Limitation: only the 4 `FORWARD_USER_INFO_HEADER_*` env-var-named headers are injectable; arbitrary header names not supported in standard build. |
| **Continue.dev** | YES (full arbitrary `requestOptions.headers`) | YES (`apiBase` in config) | https://docs.continue.dev/reference — "`requestOptions`: HTTP request options specific to the model. `headers`: Custom headers for HTTP requests." Source: https://raw.githubusercontent.com/continuedev/continue/main/core/llm/index.ts — `requestOptions?: RequestOptions` propagates through `fetchwithRequestOptions`. **Strongest custom-header support of the four.** |
| **Cline** | NO (per provider docs; only Base URL exposed) | YES ("Custom Base URL" toggle for Anthropic provider; Base URL required for OpenAI-Compatible) | https://docs.cline.bot/provider-config/anthropic — "(Optional) Custom Base URL: If you need to use a custom base URL for the Anthropic API, check 'Use custom base URL' and enter the URL." No mention of custom-header injection in either Anthropic or OpenAI-Compatible provider config pages. |

**Summary:** Of the 4 target clients, **all 4 support `base_url` switching**, but only **2 of 4 (Open WebUI, Continue.dev) support custom-header injection** — and OWUI's support is restricted to a fixed set of `FORWARD_USER_INFO_HEADER_*` env-var-named headers (not arbitrary). **Bolt.diy and Cline cannot send `X-Livinity-Mode: agent` in their stock configurations.**

## Decision Framework

| Candidate | Pros | Cons | Verdict |
|-----------|------|------|---------|
| **A. Header `X-Livinity-Mode: agent`** | Follows Anthropic's own `X-*` header idiom; clients pointing at one base URL can opt in/out per request; default = passthrough is implicit (no header = passthrough). | 50% of target clients (Bolt.diy, Cline) cannot send custom headers in stock config — they can ONLY get passthrough mode. Agent mode becomes "advanced configuration only". | Disqualified ALONE — leaves 50% of clients without a path to agent mode. |
| **B. URL path `/u/<id>/agent/v1/messages` vs `/u/<id>/v1/messages`** | Works for ALL 4 clients (every client supports `base_url`); zero per-request configuration; user picks mode at "configure broker" time. | Conflicts with OpenAI's "one base URL per session" idiom — but ONLY if a single client wants both modes simultaneously (an unrealistic external-client use case). Adds one more URL surface to test. | Strong fit for the universal-client-compatibility constraint. |
| **C. Header + path BOTH supported (path overrides header if both present)** | Universal compatibility (path covers Bolt.diy/Cline; header gives Continue.dev/OWUI per-request flexibility); minimal extra implementation effort over B alone (header check is a 1-liner once dispatch is in place). | Two surfaces to document; small duplication in test matrix; default behavior must be unambiguously specified (verdict: **passthrough** when neither path-segment `/agent/` is present AND no `X-Livinity-Mode: agent` header). | **CHOSEN** — see verdict below. |

## Verdict

**C — Both supported (path-segment `/agent/` and header `X-Livinity-Mode: agent`); path takes precedence; default (no path-segment, no header) = passthrough.**

### Worked Examples

**1. Default passthrough (any client, any auth):**
```bash
curl -X POST https://api.livinity.io/u/<userId>/v1/messages \
  -H "Authorization: Bearer liv_sk_..." \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'
```
→ Mode = **passthrough**. Broker forwards verbatim to `https://api.anthropic.com/v1/messages` (Q1 Strategy A); raw SSE bytes piped back if `stream:true`.

**2. Opt-in agent mode via URL path (works for ALL 4 target clients):**
```bash
curl -X POST https://api.livinity.io/u/<userId>/agent/v1/messages \
  -H "Authorization: Bearer liv_sk_..." \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'
```
→ Mode = **agent**. Broker invokes existing `createSdkAgentRunnerForUser()` path (`agent-runner-factory.ts:64-173`), Nexus identity + Nexus MCP tools injected, current aggregation behavior preserved.

**3. Opt-in agent mode via header (Continue.dev / Open WebUI only — clients with custom-header support):**
```bash
curl -X POST https://api.livinity.io/u/<userId>/v1/messages \
  -H "Authorization: Bearer liv_sk_..." \
  -H "anthropic-version: 2023-06-01" \
  -H "X-Livinity-Mode: agent" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'
```
→ Mode = **agent**. Same outcome as example 2.

**Precedence rule:** If BOTH path `/agent/` AND header `X-Livinity-Mode: passthrough` are present, **path wins** → agent mode. Document explicitly: header is a per-request override IFF the URL path is the default (no `/agent/` segment).

**Default behavior change (v30 breaking change for existing internal callers):** Today the route is `/:userId/v1/messages` and behavior is agent-mode-only. v30 flips this default to passthrough. Internal callers that currently rely on agent-mode behavior MUST migrate to `/u/:userId/agent/v1/messages`. Phase 57 plan documents the migration in user-facing release notes.

## Integration Point (cite — required by acceptance criteria)

- **Mode-dispatch site (path-based):** `livos/packages/livinityd/source/modules/livinity-broker/router.ts:36` — currently `router.post('/:userId/v1/messages', ...)`. Phase 57 splits into TWO route registrations:
  - `router.post('/:userId/v1/messages', ...)` → mode = passthrough by default; check `req.header('X-Livinity-Mode') === 'agent'` to override INTO agent mode.
  - `router.post('/:userId/agent/v1/messages', ...)` → mode = agent (forced; header ignored).
- **Header-precedent site (existing pattern to mirror):** `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts:82` — `if (multiUser && !forceRootHome) headers['X-LivOS-User-Id'] = userId`. Confirms broker is comfortable using `X-LivOS-*` and `X-Livinity-*` namespaces internally; new `X-Livinity-Mode` header at the inbound side is symmetrical.
- **Existing route table for OpenAI-compat (mirror this dispatch):** `livinity-broker/openai-router.ts:71-283`. OpenAI-compat surface gets the SAME treatment: register both `/:userId/v1/chat/completions` (passthrough by default) AND `/:userId/agent/v1/chat/completions` (forced agent mode), per Phase 57 plan 57-04.

## Risk + Mitigation

- **Risk:** Default-behavior flip breaks internal LivOS callers that hit `/:userId/v1/messages` today expecting agent-mode behavior.
  **Mitigation:** Phase 57 release notes list the migration explicitly; a one-time `grep` of in-repo callers (and a soft-warn log line emitted by the broker on the FIRST request per-server-process to the legacy URL without `X-Livinity-Mode: agent`) catches surviving callers within minutes of deploy. Internal LivOS AI Chat (the biggest internal consumer) calls nexus directly via `/api/agent/stream`, NOT through the broker, so it's unaffected.

- **Risk:** Path duplication (two URL families) inflates the test matrix.
  **Mitigation:** Phase 57 plan 57-03 reuses ONE handler implementation behind a `mode` parameter; only the route registration is duplicated. Tests cover (path × mode-source) × (sync × stream) = 8 cases — manageable, and Phase 63 live UAT samples 4 of them (one per client × stream/sync mix).

- **Risk:** Bolt.diy / Cline users want to opt INTO agent mode but their client only sets a base URL — they need to know to point at `/u/<id>/agent/v1` instead.
  **Mitigation:** Settings > AI Configuration > API Keys tab (FR-BROKER-E2-01) shows TWO copy-able example base URLs side by side with a tooltip: "Default (passthrough): `https://api.livinity.io/u/<your-id>/v1`" and "Agent mode (Nexus tools): `https://api.livinity.io/u/<your-id>/agent/v1`". Removes ambiguity at the configuration step.

## Sacred file SHA after Q3 task

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches required `4f868d318abff71f8c8bfbcf443b2393a553018b`. ✓ No edits made.
