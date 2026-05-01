# Phase 42: OpenAI-Compatible Broker - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning
**Mode:** `--chain` (interactive: Claude presented 7-decision batch summary, user accepted all)

<domain>
## Phase Boundary

Marketplace apps that speak OpenAI Chat Completions format (`POST /v1/chat/completions`) — including MiroFish, CrewAI agents, LangChain stuff, etc. — can hit `http://livinity-broker:8080/u/<user_id>/v1/chat/completions` and get a valid OpenAI-format response, backed by Claude through Phase 41's existing broker infrastructure. Output validated by feeding it into the official `openai` Python SDK as a smoke test (FR-BROKER-O-04).

**Scope anchor:**
- Add OpenAI translation files to existing broker module: `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts` + `openai-router.ts`
- Mount new route on existing broker mount: `app.use('/u/:userId/v1/chat', openaiRouter)` (so the full path is `/u/:userId/v1/chat/completions`)
- Reuse Phase 41's: IP guard, user_id validation, request authorization, SdkAgentRunner HTTP-proxy, SSE streaming infrastructure
- Bidirectional translation: OpenAI request → Anthropic Messages format → Phase 41 internal call → Anthropic response → OpenAI Chat Completions format

**Out of scope:**
- Forwarding to actual OpenAI/non-Anthropic providers (broker ALWAYS forwards to Claude)
- LiteLLM sidecar container (chose in-process TS instead)
- Real OpenAI tool calling (client-provided tools ignored per D-41-14, same applies here)
- Marketplace manifest auto-injection (Phase 43)
- Dashboard (Phase 44)
- Sacred file modifications (Phase 41 already established broker doesn't touch SdkAgentRunner)

</domain>

<decisions>
## Implementation Decisions

### Translation Strategy (D-42-01..02)
- **D-42-01:** **In-process TypeScript translation** — NO LiteLLM sidecar container. Rationale: Phase 41 broker module already exists; in-process avoids extra Docker service / port / deployment complexity; OpenAI ↔ Anthropic format mapping is well-documented (~150 LoC); zero new external dependencies.
- **D-42-02:** Translation file structure within existing broker module:
  - `livos/packages/livinityd/source/modules/livinity-broker/openai-translator.ts` — bidirectional format conversion (request: OpenAI → Anthropic; response: Anthropic → OpenAI)
  - `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` — Express handler for `/v1/chat/completions` (sync + SSE variants)
  - Mount in `mountBrokerRoutes()` (Phase 41 export) — adds `/v1/chat/completions` to the same `/u/:userId/v1` prefix

### Mount + Network (D-42-03..04)
- **D-42-03:** Same broker mount as Phase 41 — `app.use('/u/:userId/v1', brokerRouter)` already exists; openai-router becomes a sub-router on the same prefix. Full URL pattern: `http://livinity-broker:8080/u/<user_id>/v1/chat/completions`
- **D-42-04:** Reuse Phase 41's IP guard middleware, user_id validation middleware, container source check. No new auth/network code needed — OpenAI route is just another endpoint behind the same protection.

### Request Translation: OpenAI → Anthropic (D-42-05..07)
- **D-42-05:** OpenAI request format expected:
  ```json
  {
    "model": "gpt-4",
    "messages": [
      {"role": "system", "content": "You are..."},
      {"role": "user", "content": "Hello"}
    ],
    "stream": true,
    "temperature": 0.7
  }
  ```
  Translation rules:
  - `messages[].role` mapping: `system` → extracted to top-level `system` field; `user` / `assistant` → preserved (Anthropic uses same role names)
  - `messages[].content` (string OR array): if string, wrap as `[{type: "text", text: "..."}]`; if already array (multimodal), preserve as-is
  - `temperature`, `max_tokens`, `top_p` etc.: pass-through to Anthropic Messages format
  - Tool-related fields (`tools`, `tool_choice`, `function_call`): IGNORED with warn log (per D-41-14 carry-forward)
- **D-42-06:** After translation, internally call Phase 41's existing translator/runner pipeline (the same code path that handles `/v1/messages`). No duplicate SdkAgentRunner instantiation logic — reuse Phase 41's machinery.
- **D-42-07:** Stream flag (`stream: true/false`) propagates: stream=true → use SSE adapter; stream=false → buffer response. Same as Phase 41.

### Response Translation: Anthropic → OpenAI (D-42-08..10)
- **D-42-08:** Sync response shape (Anthropic Messages → OpenAI Chat Completions):
  ```json
  {
    "id": "chatcmpl-<uuid>",
    "object": "chat.completion",
    "created": <unix_ts>,
    "model": "<requested_model>",
    "choices": [{
      "index": 0,
      "message": {"role": "assistant", "content": "<text>"},
      "finish_reason": "stop"
    }],
    "usage": {"prompt_tokens": N, "completion_tokens": M, "total_tokens": N+M}
  }
  ```
  Mapping:
  - Anthropic `content[].text` blocks concatenated → OpenAI `choices[0].message.content` string
  - Anthropic `stop_reason: "end_turn"` → OpenAI `finish_reason: "stop"`; `"max_tokens"` → `"length"`; `"tool_use"` → `"tool_calls"` (NOT used since we ignore tools — log warn)
  - Anthropic `usage.input_tokens` → OpenAI `prompt_tokens`; `output_tokens` → `completion_tokens`
- **D-42-09:** SSE stream chunks (Anthropic → OpenAI Chat Completions streaming spec):
  ```
  data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}
  data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
  data: [DONE]
  ```
  Mapping from Phase 41's SdkAgentRunner event stream:
  - First text chunk → emit a chunk with `delta.role: "assistant"` + `delta.content: "..."` (OpenAI requires role on first chunk)
  - Subsequent text chunks → `delta.content: "..."` only
  - Final → emit chunk with `finish_reason: "stop"` + empty delta, then `data: [DONE]\n\n`
- **D-42-10:** Generate `chatcmpl-<uuid>` ID per request (UUID v4 prefixed); `created` = `Math.floor(Date.now() / 1000)`.

### Model Aliasing (D-42-11)
- **D-42-11:** Hardcoded model name resolution table:
  - `gpt-4` / `gpt-4o` / `gpt-4-turbo` / `gpt-3.5-turbo` → `claude-sonnet-4-6` (default)
  - `claude-sonnet-4-6` / `claude-sonnet*` → `claude-sonnet-4-6` (pass-through)
  - `claude-opus*` → `claude-opus-4-6`
  - `claude-haiku*` → `claude-haiku-4-5`
  - Anything else → `claude-sonnet-4-6` + warn log "unknown model `<name>`, defaulting to claude-sonnet-4-6"
  - Returned `model` field in OpenAI response = the requested model (preserves caller's expectation), NOT the actual Claude model used. Internal logging records both.
- Future config-key option (Redis `nexus:config:broker_default_model`) deferred — one-line edit later if needed.

### Tool Calls (D-42-12)
- **D-42-12:** Client-provided `tools` array, `tool_choice`, and OpenAI `function_call` fields are IGNORED with warn log (carry-forward of Phase 41's D-41-14). Marketplace apps cannot inject tools mid-conversation; LivOS MCP tools available to SdkAgentRunner are the only available tools. Honest framing in tests + module docstring.

### Validation Smoke Test (D-42-13..14)
- **D-42-13:** FR-BROKER-O-04 explicit requirement: feed broker output into official `openai` Python SDK as smoke test. Add to UAT.md (manual step) — operator runs:
  ```python
  from openai import OpenAI
  client = OpenAI(base_url="http://127.0.0.1:8080/u/<test_user_id>/v1", api_key="ignored")
  response = client.chat.completions.create(
      model="gpt-4",
      messages=[{"role": "user", "content": "Say hello"}]
  )
  print(response.choices[0].message.content)  # Should print Claude's response
  # Streaming variant:
  for chunk in client.chat.completions.create(model="gpt-4", messages=[...], stream=True):
      print(chunk.choices[0].delta.content, end="")
  ```
- **D-42-14:** Automated smoke test alternative (no Python dependency): vitest/tsx test that hand-validates the SSE chunk format against OpenAI spec — assertions on `object: "chat.completion.chunk"`, `delta` shape, terminal `data: [DONE]`. Keeps CI fast.

### Sacred File Status (D-42-15)
- **D-42-15:** `nexus/packages/core/src/sdk-agent-runner.ts` is byte-identical to Phase 40 baseline `623a65b9a50a89887d36f770dcd015b691793a7f`. Phase 42 ONLY adds files in `livos/packages/livinityd/source/modules/livinity-broker/` and reuses Phase 41's HTTP-proxy machinery — no nexus changes. Verify via `git diff` regression check at every plan commit.

### Tests (D-42-16..18)
- **D-42-16:** Unit test: bidirectional translation. Round-trip a known OpenAI request → Anthropic format → response → OpenAI format. Assert all fields preserved or correctly transformed. Cover: system message extraction, content array vs string, temperature pass-through, tool ignore + warn.
- **D-42-17:** Unit test: SSE adapter format. Mock Phase 41's SdkAgentRunner-event stream; verify each emitted chunk matches OpenAI Chat Completions streaming spec exactly (object name, delta shape, finish_reason, terminal `[DONE]`).
- **D-42-18:** Integration test: mount broker on test express app, POST OpenAI-format request to `/u/<test>/v1/chat/completions`, verify response shape (sync + streaming variants). Negative test: unknown model → warn logged + still 200 with default Claude model used.

### Out-of-Scope Carry-Forwards (D-42-19..20)
- **D-42-19:** Marketplace manifest `requires_ai_provider` flag + env var auto-injection (with `LLM_BASE_URL=http://livinity-broker:8080/u/<id>/v1`) — Phase 43.
- **D-42-20:** Per-user usage dashboard — Phase 44.

### Claude's Discretion
- Exact OpenAI spec field validation strictness (e.g., reject vs ignore unknown top-level fields) — planner picks; recommend "ignore unknown top-level fields, pass-through known ones, log warn for tools/function_call"
- Whether to share UUID generation helper with future broker code or keep local — planner picks
- Internal logging verbosity — planner picks (default: info per request, debug for body content)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 42 source files (target)
- `livos/packages/livinityd/source/modules/livinity-broker/` (Phase 41 module — adds `openai-translator.ts` + `openai-router.ts`; modifies `index.ts` mount call)
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` (Phase 41 — reused for SdkAgentRunner HTTP-proxy invocation)
- `livos/packages/livinityd/source/modules/livinity-broker/sse-adapter.ts` (Phase 41 — reused as the underlying event source for the OpenAI SSE chunks)
- `nexus/packages/core/src/sdk-agent-runner.ts` (sacred — NOT modified; consumed indirectly via Phase 41's HTTP proxy)

### Project-level constraints
- `.planning/PROJECT.md` (D-NO-BYOK; sacred SdkAgentRunner; D-NO-SERVER4)
- `.planning/REQUIREMENTS.md` (FR-BROKER-O-01..04)
- `.planning/ROADMAP.md` (Phase 42 — 4 success criteria)
- `.planning/research/v29.3-marketplace-broker-seed.md` (LiteLLM-vs-in-process discussion; in-process chosen per D-42-01)

### Phase 41 artifacts (immediate predecessor)
- `.planning/phases/41-anthropic-messages-broker/41-SUMMARY.md` (Phase 41 deliverables; Phase 42 is purely additive on top)
- `.planning/phases/41-anthropic-messages-broker/41-CONTEXT.md` (D-41-XX still apply, especially D-41-14 client-tools-ignored)
- Sacred file baseline (still): `623a65b9a50a89887d36f770dcd015b691793a7f`

### External (OpenAI spec)
- OpenAI Chat Completions API spec: https://platform.openai.com/docs/api-reference/chat/create
- OpenAI streaming format: https://platform.openai.com/docs/api-reference/chat/streaming

### Memory references
- `feedback_subscription_only.md` — sacred SdkAgentRunner; Phase 42 doesn't touch it
- `MEMORY.md` Multi-User Architecture — synthetic per-user dirs, JWT-based user resolution

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 41)
- Phase 41's broker module + IP guard + user_id middleware (mount on the same `/u/:userId/v1` prefix)
- Phase 41's HTTP-proxy SdkAgentRunner integration (Strategy B — broker proxies to `/api/agent/stream`; Phase 42 reuses identically)
- Phase 41's SSE streaming infrastructure (Express SSE response setup, chunk write/flush pattern)
- Phase 41's request validation middleware (only need to swap the body shape validator)

### Established Patterns
- Module file structure: `index.ts` (exports), `router.ts` (Express), `auth.ts` (middleware), `translate-request.ts` (Anthropic) — Phase 42 mirrors with `openai-router.ts` + `openai-translator.ts`
- Test file naming: `*.test.ts` next to source, run via `tsx`
- Logging via `logger.info` / `logger.warn` (project-standard logger interface)

### Integration Points
- `mountBrokerRoutes()` in Phase 41 module — extend to also mount openai router
- Phase 41's existing `/v1/messages` and Phase 42's new `/v1/chat/completions` share the same per-user URL prefix `/u/:userId/v1`
- No nexus changes; all Phase 42 work is in livinityd

</code_context>

<specifics>
## Specific Ideas

- **In-process > LiteLLM** because the broker module already exists in livinityd. Adding a sidecar container would mean: new Docker compose entry, new port, new health check, new failure mode (sidecar crash kills broker). Pure TS keeps it one-process, one-deploy.
- **Reuse Phase 41 machinery** — Phase 42 is a translation shell on top of Phase 41. New code is ~150 LoC of mapping logic; no new HTTP server, no new auth, no new streaming.
- **OpenAI SDK smoke test** is the acceptance gate per FR-BROKER-O-04. Document it in UAT.md verbatim so deploy-time validation is one copy-paste.
- **Tool calls deferred forever** in v29.3 scope — both Phase 41 and Phase 42 ignore client tools. If marketplace apps grow tool-calling needs, that's a v30+ conversation.

</specifics>

<deferred>
## Deferred Ideas

- **LiteLLM sidecar** — not chosen for v29.3; if format coverage gaps emerge later (e.g., Cohere/Mistral compat), revisit then
- **Marketplace manifest auto-injection** — Phase 43 (FR-MARKET-01..02)
- **Per-user usage dashboard** — Phase 44 (FR-DASH-01..03)
- **Tool / function calling support** — out of v29.3 scope; client tools ignored throughout
- **Configurable model aliasing via Redis** — hardcoded for now; config option is one-line edit later
- **Vision / multimodal input pass-through (OpenAI gpt-4o vision format)** — only if MiroFish or another anchor app needs it; defer
- **Embeddings endpoint (`/v1/embeddings`)** — not in v29.3 scope; would be a separate broker layer

</deferred>

---

*Phase: 42-openai-compatible-broker*
*Context gathered: 2026-04-30*
*Decisions: 20 (D-42-01..D-42-20). User approved 7-recommendation summary as a batch.*
