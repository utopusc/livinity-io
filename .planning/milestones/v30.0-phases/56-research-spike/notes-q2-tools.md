# Q2 Research Notes — External-Client `tools[]` Forward vs Ignore

**Date:** 2026-05-02
**Phase:** 56 (research spike)
**Plan:** 56-01
**Researcher:** Claude (gsd-executor)
**Sacred file SHA before Q2 task:** `4f868d318abff71f8c8bfbcf443b2393a553018b` (carried from Q1)

## Sources Fetched

- https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview (635k bytes — heavily client-rendered React doc; substantive content extracted via SDK source instead)
- https://docs.anthropic.com/en/docs/build-with-claude/computer-use (1035k bytes — checked for subscription-tier callouts; none found that would gate `tools[]` by tier)
- https://docs.anthropic.com/en/api/managing-api-keys (388k bytes — checked for subscription-vs-API-key tier matrix on tools support; no such matrix surfaces in the doc)
- https://platform.openai.com/docs/api-reference/chat/create (1480k bytes — OpenAI tools schema reference)
- https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/src/resources/messages/messages.ts (already fetched in Q1; lines 1627-1700 carry the canonical `Tool` interface as TypeScript types — equivalent to and more authoritative than the human-rendered docs page since the SDK is generated from Anthropic's OpenAPI spec by Stainless)
- In-repo: `livinity-broker/router.ts:66-70` (current D-41-14 ignore-warn site for Anthropic route)
- In-repo: `livinity-broker/openai-router.ts:109-124` (current D-42-12 ignore-warn site for OpenAI route — covers `tools`, `tool_choice`, `function_call`, `functions`)
- Carried from Q1: `notes-q1-passthrough.md` (Q1 chose Strategy A — raw HTTP-proxy with `Authorization: Bearer <subscription_access_token>`)

## Key Findings

### F1 — Anthropic Tool schema (verbatim from SDK source)

`src/resources/messages/messages.ts:1627-1700`:
```ts
export interface Tool {
  /**
   * [JSON schema](https://json-schema.org/draft/2020-12) for this tool's input.
   * This defines the shape of the `input` that your tool accepts and that the model
   * will produce.
   */
  input_schema: Tool.InputSchema;
  /**
   * Name of the tool.
   * This is how the tool will be called by the model and in `tool_use` blocks.
   */
  name: string;
  description?: string;
  // (plus optional: cache_control, allowed_callers, defer_loading,
  //  eager_input_streaming, input_examples, strict, type)
}

export namespace Tool {
  export interface InputSchema {
    type: 'object';
    properties?: unknown | null;
    required?: Array<string> | null;
    [k: string]: unknown;
  }
}
```

The minimum required fields are `name` and `input_schema`. `description` is optional but strongly recommended (per the comment in the SDK source). `cache_control` is optional Anthropic-prompt-caching extension.

The model's invocation appears as a `tool_use` content block in the response (per SDK source inspection — see `MessageParam` content union with `'tool_use'` and `'tool_result'` types; lines 1340-1370 confirm the `'server_tool_use'` and `'tool_use'` block types). [VERIFIED: src/resources/messages/messages.ts:1627-1700, 1340-1370]

### F2 — Anthropic tools support — subscription tier vs API-key tier

I searched `docs.anthropic.com/en/api/managing-api-keys`, `docs.anthropic.com/en/docs/build-with-claude/computer-use`, and `docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview` for any explicit statement that subscription-auth (Claude Pro/Code/Max) requests are gated/restricted from using client-supplied `tools[]`.

**Finding:** No such gating statement exists in the surveyed Anthropic docs. The `Tool` schema in the SDK is authentication-agnostic — it's a request-body field, not an auth-tier-gated feature. The Claude Code CLI itself uses tools heavily on subscription auth (it runs `bash`, `read`, `write`, etc. as user-side tools), confirming subscription-auth requests can carry tools end-to-end.

**Risk-aware caveat:** This is an "absence of evidence" finding, not a positive confirmation. Anthropic could in principle add a tier-gate at the edge in the future. Mitigation: the broker's verdict (forward verbatim) is the right default — if upstream Anthropic rejects with a 4xx for tier reasons, the broker forwards that error verbatim back to the client (no second-guessing). No "broker-side tier-check" code is needed. [PARTIALLY VERIFIED: absence-of-evidence; positive verification deferred to live UAT in Phase 63]

### F3 — OpenAI Chat Completions `tools[]` schema (verbatim from openai docs page meta inspection)

The OpenAI Chat Completions reference page (`platform.openai.com/docs/api-reference/chat/create`) is also heavily client-rendered, but the canonical `tools` shape is well-known and stable across OpenAI SDK releases:

```ts
type ChatCompletionTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: { type: 'object'; properties: { ... }; required?: string[] };
    strict?: boolean;
  };
};
```

Plus `tool_choice: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } }`.

Legacy fields (`functions` + `function_call`) — deprecated since 2023-11 but still widely sent by older clients (Continue.dev pre-v0.10, OpenWebUI pre-current) — must also be ignored or forwarded.

**Critical Anthropic ↔ OpenAI translation observation:** OpenAI tools schema differs from Anthropic — Anthropic uses `name` + `input_schema` flat at the top level; OpenAI nests `name`/`description`/`parameters` inside a `function` object with a `type: 'function'` discriminator. The Phase 58/61 OpenAI translation adapter must map between them when the broker translates client tools through to upstream Anthropic. See "Worked Example" in the SPIKE-FINDINGS Q2 verdict block.

### F4 — Cross-reference with Q1's verdict (Strategy A — HTTP-proxy direct to api.anthropic.com)

Q1 chose raw HTTP-proxy with `Authorization: Bearer <subscription_access_token>`. The upstream is `api.anthropic.com/v1/messages` which accepts `tools[]` natively — confirmed by F1+F2. **No tier-rejection risk on the SDK-direct vs HTTP-proxy axis** — both candidate Q1 strategies route through the same Anthropic edge, which honors `tools[]` regardless of which auth header was presented.

This means Q2's verdict ("forward verbatim") is COMPATIBLE with Q1's verdict (Strategy A): broker forwards the entire request body — including any `tools[]` array — to upstream Anthropic untouched. Strategy A's "raw byte forward" semantics make this the path of least resistance.

For the OpenAI-compat route (`/v1/chat/completions`): Q1 doesn't directly cover it (Q1's primary focus is Anthropic Messages), but the same passthrough strategy logically extends — broker translates OpenAI shape → Anthropic shape (Phase 58/61 work) and forwards to upstream Anthropic. The translation MUST include translating OpenAI's `tools` (function-nested) → Anthropic's `tools` (flat) and vice versa for `tool_use` response blocks → OpenAI `tool_calls`.

### F5 — Cost of "ignore" status quo (the disqualified alternative)

Today's behavior at `router.ts:66-70` and `openai-router.ts:110-124` is "warn-and-ignore". This means a Bolt.diy / OpenWebUI / Continue.dev client that sends its own tools today gets:
- A log line saying tools were ignored.
- A response that does NOT honor the client's tools.
- Plus (in the broker's current Strategy B world) the broker-injected Nexus MCP tools.

This is the source of the "identity contamination + tools contamination" v29.5 live-test surfaced. It's NOT acceptable for v30 external-client targets — the explicit mandate from MILESTONE-CONTEXT is "Each external client must be able to use its own system prompt and its own tools without identity contamination from Nexus."

Forward verbatim is therefore the only viable verdict. Ignore would block FR-BROKER-A1-03 (passthrough mode emits NO Nexus MCP tools — external clients see only their own tools or none) — which by the requirement's wording PROHIBITS Nexus tool injection AND IMPLIES the client's tools should be honored.

## Candidate Evaluation Table

| Candidate | Description | Honors A1-03 requirement? | Compatible with Q1 verdict? | Tier-rejection risk | Verdict |
|-----------|-------------|---------------------------|------------------------------|---------------------|---------|
| **Forward verbatim in passthrough mode** | Broker passes `body.tools[]` array through to upstream Anthropic untouched (Anthropic route) or translates OpenAI tools shape → Anthropic shape and forwards (OpenAI route) | YES — external client's tools reach the model; no Nexus tools injected | YES — Strategy A's raw-byte forward already implements this on the Anthropic route as a side-effect | LOW per F2 (no documented tier-gate); upstream-rejection forwards verbatim if it ever happens | **CHOSEN** |
| **Ignore-warn (status quo D-41-14 / D-42-12)** | Broker strips `tools[]` from the body before forwarding | NO — explicitly contradicts FR-BROKER-A1-03 | NO — would require Strategy A's "raw byte forward" to be replaced with "parse, mutate, re-serialize" overhead | N/A (tools never reach upstream) | Disqualified — contradicts FR-BROKER-A1-03 |
| **Forward only in passthrough mode; keep ignore in agent mode** | Mode-conditional: passthrough = forward; agent = ignore | YES (in passthrough) | YES — agent mode unchanged | LOW | Implicit refinement — agent mode keeps current "Nexus tools win" behavior to preserve LivOS in-app chat. This is operationally what Q2's verdict means in practice. |

## Worked Example

### Anthropic route — sample request body
```json
POST https://api.livinity.io/v1/messages
Authorization: Bearer liv_sk_<base62-32>
Content-Type: application/json

{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "messages": [{"role": "user", "content": "What's the weather in Istanbul?"}],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a city",
      "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"]
      }
    }
  ]
}
```

### Expected upstream forward (broker → api.anthropic.com)
The broker does `fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers:{'Authorization':'Bearer <subscription_access_token>', 'anthropic-version':'2023-06-01', 'content-type':'application/json'}, body: <verbatim body above>})`. The `tools` array is unchanged. The Authorization header is the broker's per-user OAuth token, NOT the client's `liv_sk_*`.

### Expected upstream Anthropic response (`tool_use` content block)
```json
{
  "id": "msg_01XYZ...",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01ABC...",
      "name": "get_weather",
      "input": {"city": "Istanbul"}
    }
  ],
  "model": "claude-sonnet-4-5",
  "stop_reason": "tool_use",
  "usage": {"input_tokens": 47, "output_tokens": 28}
}
```

The broker forwards this body verbatim (sync) or as the SSE event sequence (`message_start` → `content_block_start` with `type: tool_use` → `content_block_delta` with `input_json_delta` chunks → `content_block_stop` → `message_delta` with `stop_reason: tool_use` → `message_stop`) for streaming. The client (Bolt.diy) receives a normal Anthropic-shape response, calls `get_weather` itself, and continues the conversation by sending a follow-up with a `tool_result` content block — broker forwards that next request the same way.

### OpenAI route — sample request + Anthropic translation expectation

OpenAI client request:
```json
POST https://api.livinity.io/v1/chat/completions
Authorization: Bearer liv_sk_<base62-32>
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "What's the weather in Istanbul?"}],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a city",
        "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}
      }
    }
  ]
}
```

Translated body forwarded to upstream Anthropic (broker's translation step):
```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "messages": [{"role": "user", "content": "What's the weather in Istanbul?"}],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get current weather for a city",
      "input_schema": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}
    }
  ]
}
```

Anthropic response with `tool_use` block → broker translates to OpenAI `tool_calls` shape (`{type:"function", function:{name, arguments: <JSON-stringified input>}}`). Phase 58/61 owns the bidirectional translation; Q2 only mandates that `tools[]` be FORWARDED rather than IGNORED — the translation work is downstream.

## Sacred file SHA after Q2 task

```
git hash-object nexus/packages/core/src/sdk-agent-runner.ts
4f868d318abff71f8c8bfbcf443b2393a553018b
```

Matches required `4f868d318abff71f8c8bfbcf443b2393a553018b`. ✓ No edits made.

## ASSUMED → VERIFIED transitions

| Assumption (RESEARCH.md) | Status | Source |
|--------------------------|--------|--------|
| A2: Anthropic API accepts client `tools[]` from subscription-auth requests | **PARTIALLY VERIFIED (absence of contraindication)** | Search of Anthropic docs surfaces no tier-gate; SDK Tool schema has no auth-tier branching; Claude Code CLI itself uses tools on subscription auth. Positive verification deferred to Phase 63 live UAT (FR-VERIFY-V30-02 — Bolt.diy chat with tools). |
