# Livinity Broker — Dual-Mode Dispatch (Phase 57+)

## Overview

The Livinity Broker exposes two REST surfaces for LLM traffic:

- `POST /u/:userId/v1/messages` — Anthropic Messages API
- `POST /u/:userId/v1/chat/completions` — OpenAI Chat Completions API

On every request the broker inspects the `X-Livinity-Mode` request header
(case-insensitive, surrounding whitespace ignored). The header value
determines which of two dispatch paths handles the request.

The default behavior — **passthrough mode** — was introduced in Phase 57 to
support external API consumers (Bolt.diy, Open WebUI, Continue.dev, Cline,
custom integrations). Pre-Phase-57 the broker implicitly ran in agent mode
for every request, which prepended a Nexus identity preamble + Nexus MCP
tool surface to every upstream call. That behavior contaminated external
clients trying to set their own persona or expose their own tools. The
header opt-in pattern lets internal LivOS code that *does* want the Nexus
agent stack continue to receive it explicitly.

## Modes

| Header value | Mode | Behavior |
|---|---|---|
| absent OR any value other than `agent` | passthrough (DEFAULT) | Forwards request directly to api.anthropic.com via `@anthropic-ai/sdk` with subscription Bearer token from `~/.claude/.credentials.json`; preserves `system` prompt + `tools[]` verbatim; NO Nexus identity injection; NO Nexus MCP tools |
| `agent` (case-insensitive) | agent (OPT-IN) | Existing Strategy B HTTP-proxy to nexus `/api/agent/stream`; Nexus identity + MCP tools injected; for LivOS internal callers only |

The case-insensitive comparison covers `agent`, `AGENT`, `Agent`,
`AgEnT`, etc. Surrounding whitespace (e.g. `  agent  `) is also stripped
before comparison. If the header is absent, empty, an empty array, or
contains anything other than the literal token `agent` (case-insensitive,
post-trim), the request falls through to passthrough.

## When to use agent mode

Today the broker has zero internal callers — LivOS in-app chat uses
`/ws/agent` directly (a websocket on the nexus side, not the broker's HTTP
surface). Future internal callers wanting Nexus tooling MUST send
`X-Livinity-Mode: agent` explicitly; otherwise they will silently fall
through to passthrough mode and lose the Nexus tool surface.

## Sacred file boundary

Passthrough mode does NOT touch `nexus/packages/core/src/sdk-agent-runner.ts`
(SHA `4f868d318abff71f8c8bfbcf443b2393a553018b`). Agent mode keeps it
byte-identical. The integrity test
`nexus/packages/core/src/__tests__/sdk-agent-runner-integrity.test.ts`
asserts this SHA on every CI run; any drift fails the build. The v30.0
locked decision **D-30-07** preserves this byte-identical contract across
the entire milestone.

## How to set the header (curl examples)

```bash
# Default = passthrough (no Nexus identity, client tools honored)
curl -X POST http://livinity-broker:8080/u/abc123/v1/messages \
  -H 'Content-Type: application/json' \
  -d '{"model":"sonnet","max_tokens":256,"messages":[{"role":"user","content":"Who are you?"}]}'

# Opt-in agent mode (Nexus identity + MCP tools — for internal tooling only)
curl -X POST http://livinity-broker:8080/u/abc123/v1/messages \
  -H 'Content-Type: application/json' \
  -H 'X-Livinity-Mode: agent' \
  -d '{"model":"sonnet","max_tokens":256,"messages":[{"role":"user","content":"Who are you?"}]}'
```

## Future caller checklist

- Does my caller need Nexus MCP tools (shell, files_read, etc.)?
  If yes → send `X-Livinity-Mode: agent`.
- Does my caller send arbitrary client tools that should be honored
  by the upstream model? If yes → use passthrough (default — do not
  send the header).
- Is my caller external/third-party (not part of the LivOS source tree)?
  If yes → use passthrough (default). External clients should never
  need to send `X-Livinity-Mode`.
- Does my caller want the upstream model's response forwarded verbatim,
  with no broker-side rewrites of `system`, `tools`, `tool_choice`, or
  the response body? If yes → use passthrough.

## Module layout (Phase 57)

| File | Purpose |
|---|---|
| `mode-dispatch.ts` | `resolveMode(req): BrokerMode` — header parse, returns `'passthrough'` or `'agent'` |
| `credential-extractor.ts` | `readSubscriptionToken({ livinityd, userId })` — reads per-user `~/.claude/.credentials.json`, extracts `claudeAiOauth.accessToken` |
| `passthrough-handler.ts` | `passthroughAnthropicMessages(...)` — Anthropic SDK forward; uses `authToken` extraction; throws `UpstreamHttpError` on non-2xx so existing 429 forwarding pattern in `router.ts` applies |
| `router.ts` | Anthropic Messages route; dispatches on `resolveMode(req)` |
| `openai-router.ts` | OpenAI Chat Completions route; dispatches on `resolveMode(req)` |

The agent-mode path stays exactly as it was in v29.5 — nothing inside
`agent-runner-factory.ts`, `translate-request.ts`, `sse-adapter.ts`,
`sync-response.ts`, or `openai-translator.ts` changed for agent mode in
Phase 57. Only the dispatcher and the new passthrough handler are
additive.
