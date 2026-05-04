# Phase 57: A1+A2 Passthrough Mode + Agent Mode Opt-In — Research

**Researched:** 2026-05-02
**Domain:** Livinity Broker dual-mode dispatch (passthrough vs agent) — direct passthrough to Anthropic Messages API for external clients; legacy Strategy B HTTP-proxy to nexus retained behind opt-in header for LivOS internal callers
**Confidence:** HIGH for code-level integration points (verified by Read); HIGH for Anthropic SSE/auth spec (verified via docs.anthropic.com); MEDIUM for subscription-token forwarding viability (verified extraction location in `nexus/src/daemon.ts:324`, but live header-forward to api.anthropic.com untested in this session — requires Phase 57 implementation).

## Summary

Phase 57 adds a **mode dispatcher** to the broker's two existing handlers (`router.ts` Anthropic Messages, `openai-router.ts` OpenAI Chat Completions) that branches on the `X-Livinity-Mode` request header:

- **Header `agent`** → existing Strategy B HTTP-proxy to nexus `/api/agent/stream` (sacred file path) — **byte-identical to v29.5**.
- **Header absent OR any other value** → **NEW** passthrough handler that forwards directly to `https://api.anthropic.com/v1/messages` via the already-present `@anthropic-ai/sdk@^0.80.0` (registry: 0.92.0 latest). System prompt + `tools[]` forwarded verbatim. NO Nexus identity injection. NO Nexus MCP tools. Sacred file untouched.

The passthrough handler reuses the existing per-user `homeOverride` pattern from Phase 40: livinityd reads `~/.claude/.credentials.json` at the per-user `homeOverride` path (`/opt/livos/data/users/<userId>/.claude/.credentials.json`), extracts `claudeAiOauth.accessToken` (sk-ant-oat01-* prefix), and passes it to `new Anthropic({ authToken: <token> })`. The Anthropic TS SDK's `authToken` option produces `Authorization: Bearer <token>` headers (verified at github.com/anthropics/anthropic-sdk-typescript `src/client.ts` `bearerAuth()`).

**Primary recommendation (Q1 verdict):** **SDK-direct via `@anthropic-ai/sdk` with explicit `authToken` extraction** — see Architectural Verdicts below. Single new file `livinity-broker/passthrough-handler.ts` (~150 LOC) implements the forward; both routers gain a 5-line dispatcher branch.

---

<user_constraints>
## User Constraints (from 57-CONTEXT.md)

### Locked Decisions

- **Phase 56 spike DEFERRED** — its 7 architectural questions are resolved INLINE by this RESEARCH.md, NOT via a separate spike execution. Phase 57's Q1/Q2/Q3/Q7 are the four questions that block Phase 57; Q4/Q5/Q6 belong to later phases.
- **Mode opt-in mechanism = HEADER-based** (`X-Livinity-Mode: agent`, case-insensitive). Default behavior (header absent OR any other value) = passthrough mode. URL-path alternative (`/u/<id>/agent/v1/...`) is fallback only if a fatal header conflict surfaces (none found — see Q3 verdict).
- **Sacred file UNTOUCHED** — `nexus/packages/core/src/sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` byte-identical at end of Phase 57. Verified at start of research: matches. `BASELINE_SHA` constant in `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts:42` unchanged.
- **`@anthropic-ai/sdk@^0.80.0` already in `nexus/packages/core/package.json:34`** — D-NO-NEW-DEPS preserved. Broker imports from this dep without adding it locally to `livos/packages/livinityd/package.json` (already pulled in transitively via `@nexus/core` workspace dep, but the broker may need a direct dep entry for type clarity — implementation choice during planning).
- **D-NO-BYOK preserved** — broker NEVER stores or accepts user's raw Anthropic API key. Subscription auth flows from per-user `~/.claude/.credentials.json` only.
- **D-NO-SERVER4 preserved** — Mini PC + Server5 only. Server4 is OFF-LIMITS.
- **D-LIVINITYD-IS-ROOT preserved** — livinityd reads per-user credentials.json files (mode 0o600 owned by livinityd's effective user).
- **Existing per-user URL-path identity (`/u/:userId/v1/...`) UNCHANGED** — Bearer auth is Phase 59. Public endpoint is Phase 60. Phase 57 does NOT touch `auth.ts`.

### Claude's Discretion

- Single `passthrough-handler.ts` vs split into `passthrough-anthropic.ts` + `passthrough-openai.ts` — recommendation in plan: ONE file, two exported handlers (sharing the SDK client construction + credential extraction helpers).
- Whether to add a thin `dispatch.ts` mode resolver vs inlining a 5-line `if (req.headers['x-livinity-mode']?.toLowerCase() === 'agent')` check in each router. Recommendation: shared `resolveMode(req)` helper in `livinity-broker/mode-dispatch.ts` (testable in isolation).
- Logging format for passthrough requests — JSON line consistent with existing broker logger format (e.g., `[livinity-broker:passthrough] user=<id> model=<x> stream=<bool>`).
- Where to add `X-Livinity-Mode: agent` header on the LivOS in-app chat side — `livos/packages/ui/src/hooks/use-agent-socket.ts:367` is the in-app chat entry, but it talks to `/ws/agent` NOT to the broker `/v1/messages`. **Critical finding (see Q3 verdict): the LivOS in-app chat does NOT call the broker today.** No header injection needed in v30 unless/until an internal caller migrates from `/ws/agent` to broker — see Q3 risk analysis.

### Deferred Ideas (OUT OF SCOPE for Phase 57)

- True token streaming for passthrough (Phase 58 — Phase 57 emits aggregate-then-restream as transitional, OR raw Anthropic SSE pass-through via SDK's `messages.stream()` — see Q1 verdict for chosen path).
- Bearer token auth `liv_sk_*` (Phase 59).
- Public `api.livinity.io` (Phase 60).
- Rate-limit headers + model aliases + provider stub (Phase 61).
- Per-API-key usage tracking (Phase 62).
- D-51-03 Branch N reversal (sacred-file edit) — verdict in Cross-Cuts: **NOT NEEDED for v30** (passthrough resolves external identity contamination; agent mode internal-only and acceptable there).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FR-BROKER-A1-01 | Passthrough is DEFAULT for `/v1/messages` and `/v1/chat/completions`; forwards to upstream Anthropic API; preserves `system` prompt verbatim; forwards `tools[]` if present | Q1 verdict (SDK-direct) + Q2 verdict (forward tools) below; integration in `router.ts:36-187` + `openai-router.ts:71-283` |
| FR-BROKER-A1-02 | Passthrough emits NO Nexus identity injection (sacred file `sdk-agent-runner.ts:264-270` line not reached in passthrough) | Trivially satisfied — passthrough never invokes `createSdkAgentRunnerForUser()` (the only call site of sacred file). Verification: integration test asserts response from passthrough mode does NOT contain "powered by" or "Nexus" substrings |
| FR-BROKER-A1-03 | Passthrough emits NO Nexus MCP tools (`mcpServers['nexus-tools']` not injected) | Same trivial satisfaction — passthrough doesn't construct `agentConfig.mcpServers`. Verification: assert response `tool_use` blocks (if any) match client-supplied tool names verbatim |
| FR-BROKER-A1-04 | Sacred file byte-identical at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` | Verified pre-research SHA matches. Phase 57 plans MUST run `git hash-object` before/after every wave. Integrity test `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` BASELINE_SHA unchanged |
| FR-BROKER-A2-01 | Agent mode opt-in via `X-Livinity-Mode: agent` header | Q3 verdict (header-based, no fatal conflicts) below; dispatcher integration at `router.ts:42` (after body parse) and `openai-router.ts:78` (after body parse) |
| FR-BROKER-A2-02 | Agent mode preserves current Nexus-tooled behavior end-to-end | No code change to agent-mode branch — it simply becomes the conditional path. v29.5 integration tests `livinity-broker/integration.test.ts` + `openai-integration.test.ts` re-run unchanged |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Mode dispatch (`X-Livinity-Mode` header parse) | livinityd Express (broker handlers `router.ts` + `openai-router.ts`) | — | Header is a request-time concern; lives at handler entry |
| Passthrough forward to api.anthropic.com | livinityd (NEW `passthrough-handler.ts`) | api.anthropic.com (upstream) | Bypasses nexus entirely; uses `@anthropic-ai/sdk` from broker context |
| Subscription token extraction (read `~/.claude/.credentials.json`) | livinityd (NEW helper in `passthrough-handler.ts`) | per-user `homeOverride` filesystem | livinityd is root and can read per-user dirs (mode 0o700) |
| Agent mode (Strategy B) | livinityd → nexus `/api/agent/stream` → sacred `sdk-agent-runner.ts` | UNCHANGED | Existing path preserved verbatim |
| `tools[]` honoring | upstream Anthropic (passthrough) — model invokes client tools | client (interprets `tool_use` blocks in response) | Broker is transparent in passthrough; doesn't translate or filter |
| `broker_usage` capture | livinityd `usage-tracking/capture-middleware.ts` mounted at `/u/:userId/v1` BEFORE broker (server/index.ts:1228) | PG `broker_usage` table | UNCHANGED — middleware sees both modes' responses |

---

## Architectural Verdicts (Phase 56 Q1/Q2/Q3/Q7)

### Q1 Verdict — Passthrough Strategy: **SDK-direct with explicit `authToken` extraction**

**Chosen path:** Use `@anthropic-ai/sdk@^0.80.0` (already in `nexus/packages/core/package.json:34`; registry latest 0.92.0) directly from livinityd. Construct an `Anthropic` client per request with `authToken` extracted from the per-user `~/.claude/.credentials.json` file.

**Rationale (≥3 reasons):**
1. **D-NO-NEW-DEPS preserved.** `@anthropic-ai/sdk` is already in nexus core's deps and reachable from livinityd via the `@nexus/core` workspace edge. Optionally add to `livos/packages/livinityd/package.json` for hygiene (zero registry change since same version is hoisted).
2. **Sacred file untouched.** SDK-direct path is fully outside `sdk-agent-runner.ts`. The sacred file's identity-line (lines 264-270) and aggregation loop (lines 378-389) are simply not reached.
3. **SDK accepts `authToken` option** that produces `Authorization: Bearer <token>` headers — verified via github.com/anthropics/anthropic-sdk-typescript `src/client.ts` `bearerAuth()` method (returns `buildHeaders([{ Authorization: 'Bearer ${this.authToken}' }])`). Anthropic's API normally documents `x-api-key` only, but the SDK's wire-level support for `Authorization: Bearer` is the documented mechanism Claude Code itself uses to forward subscription `accessToken` (sk-ant-oat01-*) to api.anthropic.com.
4. **Streaming primitive built-in.** SDK's `messages.stream()` exposes a token-by-token async iterator over the canonical Anthropic SSE event sequence — Phase 58 can pipe this directly into the response stream without re-parsing. Phase 57 may transitionally aggregate via `await stream.finalMessage()`, then write the JSON response (sync mode) or emit a single `message_delta`-equivalent SSE chunk (stream mode), and Phase 58 swaps in true pass-through.
5. **Subscription token forwarding is real, but proceed with caveat.** Token in `claudeAiOauth.accessToken` (sk-ant-oat01-...) is the same OAuth token Claude Code CLI sends to api.anthropic.com when running `claude` subprocess. Forwarding it from broker's livinityd (running as same user via `homeOverride` HOME) preserves per-user identity at upstream. **Risk:** if Anthropic adds tier-restricted endpoint behavior for OAuth-vs-API-key (e.g., "tools only on API-key tier"), Phase 57 implementation must surface upstream 403 verbatim. Verified at this research date that Messages API doc lists tools without tier gating (see Q2).

**Alternatives considered (≥2):**
- **Alt A — HTTP-proxy via `fetch()` directly to `https://api.anthropic.com/v1/messages`** (mirroring `agent-runner-factory.ts:64-173` pattern but pointing at Anthropic instead of nexus). Disqualified because:
  - Reinvents auth header construction (Bearer + `anthropic-version`), retry logic, error mapping, SSE parser. Pure churn vs SDK reuse.
  - Same SDK behavior available without re-implementation. SDK is already a dep — using it is strictly less code.
- **Alt B — Hybrid: spawn Claude Code CLI subprocess with `HOME=<userDir>/.claude/`** (mirroring sacred file's pattern but in a NEW location, not editing sacred file). Disqualified because:
  - Spawn overhead (~50ms per request) for a stateless HTTP forward.
  - Conflates the agent-tooled path with the passthrough goal — passthrough must be NO MCP tools; the CLI subprocess always loads a tool set.
  - Aggregation would still apply at SDK boundary (defeats Phase 58 token-streaming goal).

**Code-level integration point:**
- **File:** `livos/packages/livinityd/source/modules/livinity-broker/passthrough-handler.ts` (NEW, ~150 LOC)
- **Exports:** `passthroughAnthropicMessages(opts)` → handles `/v1/messages`; `passthroughOpenAIChatCompletions(opts)` → handles `/v1/chat/completions` (translates OpenAI body → Anthropic body, then calls Anthropic-Messages handler, then translates response shape back).
- **Anthropic Messages handler line-by-line:**
  1. Resolve `homeOverride` for `userId` (reuse pattern from `nexus/src/api.ts:2435`: `join(dataDir, 'users', userId, '.claude')`).
  2. Read `<homeOverride>/.credentials.json`. Parse JSON. Extract `creds.claudeAiOauth.accessToken`.
  3. Construct `const client = new Anthropic({ authToken: accessToken, defaultHeaders: { 'anthropic-version': '2023-06-01' } })`.
  4. If `body.stream === true`: invoke `client.messages.stream({ model: body.model, max_tokens: body.max_tokens, system: body.system, messages: body.messages, tools: body.tools })`. Phase 57 transitional path: `await stream.finalMessage()` → emit synthetic Anthropic SSE sequence (`message_start` / `content_block_start` / single `content_block_delta` / `content_block_stop` / `message_delta` / `message_stop`) using existing `sse-adapter.ts` patterns. Phase 58 swaps in true pass-through (raw event proxying).
  5. If `body.stream === false`: invoke `client.messages.create(...)` and forward the JSON response verbatim with `res.status(200).json(response)`.
  6. Wrap in try/catch — on `Anthropic.APIError`, extract `err.status` + `err.headers['retry-after']`, throw `UpstreamHttpError` so existing 429 forwarding pattern (`router.ts:158-185`) applies unchanged.
- **Mode dispatch (NEW file `livinity-broker/mode-dispatch.ts`):**
  ```typescript
  export type BrokerMode = 'passthrough' | 'agent'
  export function resolveMode(req: Request): BrokerMode {
    const header = req.headers['x-livinity-mode']
    const value = Array.isArray(header) ? header[0] : header
    return typeof value === 'string' && value.trim().toLowerCase() === 'agent' ? 'agent' : 'passthrough'
  }
  ```
- **Insertion in `router.ts`:** After body validation (line 63, after `messages` check), branch:
  ```typescript
  const mode = resolveMode(req)
  if (mode === 'passthrough') {
    return passthroughAnthropicMessages({ livinityd: deps.livinityd, userId: auth.userId, body, res })
  }
  // mode === 'agent' — existing code from line 65 onward unchanged
  ```
- **Insertion in `openai-router.ts`:** Same branch after line 107 (after `messages` validation). On passthrough mode, the OpenAI handler translates body → Anthropic body, then calls `passthroughAnthropicMessages`, then translates response back via existing `openai-translator.ts` helpers (or, simpler, pre-aggregate then re-build OpenAI shape via `buildSyncOpenAIResponse`).

**Risk + Mitigation:**
- **Risk 1: Subscription `accessToken` rejected by api.anthropic.com for `/v1/messages`.** Anthropic's official docs list `x-api-key` only. The SDK's `bearerAuth()` is a documented pattern but the wire test happens at execution. **Mitigation:** Phase 57 implementation includes integration test (mocked Anthropic 401 response → passthrough handler surfaces 401 to client). If live test in Phase 63 fails with 401, fallback is to ship a documented "user supplies API key in Settings" toggle that bypasses subscription extraction (escalate to v30.1 — out of scope for Phase 57's core deliverable).
- **Risk 2: `accessToken` expires (8-hour TTL per OAuth spec).** Subscription tokens refresh via `refreshToken` POST to `auth.kimi.com`-equivalent endpoint (per nexus's pattern in claude.ts OAuth refresh). **Mitigation:** Phase 57 plan includes a token-refresh helper that catches 401 from upstream, refreshes via `refreshToken`, retries once. Reuse pattern from existing nexus claude provider OAuth refresh (claude.ts has `refreshToken` flow).
- **Risk 3: `~/.claude/.credentials.json` missing for a user (subscription not configured).** Per-user OAuth login is a separate UX flow (Phase 40 Settings "Connect Claude" button). **Mitigation:** passthrough handler returns HTTP 401 with body `{"type":"error","error":{"type":"authentication_error","message":"User <id> has not configured Claude subscription. Visit Settings > AI Configuration to log in."}}` so external clients see actionable Anthropic-spec error.
- **Risk 4: Per-user `homeOverride` dir doesn't exist (single-user mode + admin user).** **Mitigation:** When `BROKER_FORCE_ROOT_HOME=true` (existing env var, see `agent-runner-factory.ts:77`), passthrough handler resolves credential file to `process.env.HOME || '/root'`. Same-shape fallback as agent-mode.

**D-NO-NEW-DEPS Implications:** ZERO new npm deps. `@anthropic-ai/sdk@^0.80.0` already at `nexus/packages/core/package.json:34`. Optionally add `"@anthropic-ai/sdk": "^0.80.0"` to `livos/packages/livinityd/package.json:dependencies` for type-clarity hygiene (no registry change; same version hoisted).

---

### Q2 Verdict — External Client `tools[]`: **Forward verbatim in passthrough mode**

**Chosen path:** In passthrough mode, forward the client's `tools[]` array unchanged to upstream Anthropic. Reverses `D-41-14` warn-and-ignore (router.ts:66-70) and `D-42-12` (openai-router.ts:110-124) FOR THE PASSTHROUGH BRANCH ONLY. Agent mode keeps current ignore-and-warn behavior.

**Rationale (≥3 reasons):**
1. **Anthropic Messages API natively supports `tools[]`** with the documented schema `{name, description, input_schema}` (verified via platform.claude.com/docs/en/api/messages — "Optional Request Body Fields: tools - Array of tool definitions"). NO tier restriction documented for the `tools` field on the public Messages API (no "tools require API-key tier" gating language found).
2. **External clients depend on this behavior** for their core use case. Bolt.diy invokes its own `editor` / `terminal` / `wrangler-install` tools; Open WebUI invokes user-defined tools; Continue.dev invokes its code-edit tools. Without forwarding, the model never invokes any tool and external clients believe the model is broken.
3. **Trivial implementation** — SDK's `messages.create()` and `messages.stream()` accept `tools` as a top-level field; broker just passes `body.tools` through. Zero translation needed for the Anthropic Messages route.
4. **OpenAI route requires translation** — OpenAI's `tools[]` shape is `{type: "function", function: {name, description, parameters}}` whereas Anthropic's is `{name, description, input_schema}`. Phase 57 plan must translate OpenAI tools → Anthropic tools before forwarding (and tool_calls in response → Anthropic tool_use). This translation is well-known (LiteLLM does it; the broker's existing `openai-translator.ts` has a partial pattern). **Defer detailed implementation** to plan-author; reuse `openai-translator.ts` style.

**Alternatives considered:**
- **Alt A — Continue ignoring tools (status quo D-41-14 / D-42-12).** Disqualified because external clients (Bolt.diy live test in v29.5) explicitly broke when tools couldn't be invoked. Requirement FR-BROKER-A1-01 explicitly says "forwarding the client's `tools[]` array if present."
- **Alt B — Forward with allowlist filter** (e.g., reject tools whose `name` matches `mcp__*` to prevent MCP-namespace collision). Disqualified because passthrough is a transparent proxy — adding allowlist logic re-introduces a "broker is opinionated" surface that contradicts the passthrough-mode goal. If a malicious client sends a tool named `mcp__nexus-tools__shell`, upstream Anthropic just sees a custom tool with that string name — it's not the actual MCP tool because passthrough mode doesn't bind any MCP server.

**Code-level integration points:**
- **`livinity-broker/router.ts:66-70`** — passthrough branch SKIPS the warn-and-ignore log; passes `body.tools` through to `passthroughAnthropicMessages()`. Agent branch keeps the existing log + drops tools.
- **`livinity-broker/openai-router.ts:110-124`** — passthrough branch SKIPS the three warn-and-ignore logs (tools / tool_choice / functions); translates OpenAI `tools` → Anthropic `tools` then forwards. Agent branch keeps existing behavior.
- **Worked example (passthrough request):**
  ```http
  POST /u/abc123/v1/messages HTTP/1.1
  Content-Type: application/json
  X-Livinity-Mode: (absent — defaults to passthrough)

  {
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Use the calculator to add 2 and 3"}],
    "tools": [{
      "name": "calculator",
      "description": "Adds two numbers",
      "input_schema": {"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]}
    }]
  }
  ```
  Expected response (sync mode) contains a `content_block` with `type: "tool_use"` invoking the client's `calculator` tool. NO Nexus MCP tool (`shell`, `files_read`, etc.) appears in response.

**Risk + Mitigation:**
- **Risk:** External client supplies a malformed `tools` array that triggers Anthropic 400. **Mitigation:** Pass `Anthropic.APIError` 400 status + body verbatim through to client (the existing `UpstreamHttpError` forwarding handles this at lines 158-185 of router.ts).
- **Risk:** OpenAI `tools` translation has edge cases (e.g., `parameters.$ref` JSON Schema features Anthropic's `input_schema` rejects). **Mitigation:** Phase 57 plan ships a unit test suite for `openai-translator.ts:translateToolsToAnthropic()` covering the 5 most common shapes (no-params, simple-params, enum-params, nested-object-params, array-params); edge cases that fail translation surface as 400 to client with actionable message.

---

### Q3 Verdict — Agent Mode Opt-In: **Header `X-Livinity-Mode: agent` (case-insensitive)**

**Chosen path:** Header-based opt-in. Default (header absent or any non-`agent` value) = passthrough. CONTEXT.md commits to this; this verdict confirms NO fatal conflicts found in the codebase.

**Rationale (≥3 reasons):**
1. **Zero existing internal callers send `X-Livinity-Mode`.** Verified by codebase grep: `X-Livinity-Mode` appears ONLY in planning docs (.planning/), never in source. No livinityd code, no nexus code, no UI code currently emits this header. **Conclusion:** introducing it as the agent-mode trigger conflicts with nothing.
2. **CRITICAL FINDING — LivOS in-app chat does NOT call the broker.** The in-app AI Chat (`livos/packages/ui/src/routes/ai-chat/index.tsx:25`) uses `useAgentSocket()` (`livos/packages/ui/src/hooks/use-agent-socket.ts:367`) which connects to `wss://<host>/ws/agent` — a WebSocket route on livinityd, NOT the broker `/u/:userId/v1/messages`. The `/ws/agent` route ultimately calls nexus `/api/agent/stream` directly (see `livinityd/source/modules/server/ws-agent.ts`). **THE BROKER IS USED EXCLUSIVELY BY MARKETPLACE APP CONTAINERS** (Bolt.diy, Open WebUI via injected `ANTHROPIC_BASE_URL=http://livinity-broker:8080/u/<id>` per `livinityd/source/modules/apps/inject-ai-provider.ts:8`). **This means FR-BROKER-A2-02 ("Agent mode preserves current behavior so LivOS in-app chat remains unchanged") is satisfied AUTOMATICALLY — the in-app chat doesn't use the broker, so no header injection is required from the UI side.** The "Migration order" concern in CONTEXT.md (in-app chat needs to add the header) **does NOT apply to v30** — in-app chat goes through `/ws/agent`, not the broker. Plan can flip passthrough to default in a single wave without breaking internal flows.
3. **Express middleware compatibility verified.** Mounted middleware chain (per `livinityd/source/modules/server/index.ts:1228-1234`):
   - `mountUsageCaptureMiddleware` (Phase 44) — patches `res.json`/`res.write`/`res.end`, calls `next()`. Reads `req.params.userId`, NOT request headers. Doesn't strip or filter `X-Livinity-Mode`.
   - `mountBrokerRoutes` → `createBrokerRouter()` → `containerSourceIpGuard` → `express.json()` → `resolveAndAuthorizeUserId` → handler. None of these middleware reads or strips custom headers (verified by Read of `auth.ts`, `router.ts`, capture-middleware.ts).
   - **CORS** — broker is not internet-facing in v29.5 (RFC 1918 IP guard at `auth.ts:32-68` rejects external traffic). When Phase 60 makes it public, CORS preflight will need `X-Livinity-Mode` in `Access-Control-Allow-Headers`, but that's Phase 60's concern, NOT Phase 57's.
4. **Header name is unambiguous.** No standard or de-facto header named `X-Livinity-Mode` exists in HTTP RFCs or Anthropic SDK conventions. Anthropic uses `anthropic-version`, `anthropic-beta` (lowercase, no `X-`); OpenAI uses no custom request headers in standard paths. Zero risk of collision.

**Alternatives considered:**
- **Alt A — URL path `/u/<id>/agent/v1/messages` vs default `/u/<id>/v1/messages`.** Disqualified because (a) header is additive (zero changes to external clients' base_url config — they default to passthrough); (b) URL fragments would force MORE refactoring of marketplace `inject-ai-provider.ts` (today it injects ONE base_url per app — adding agent vs passthrough means TWO base_urls, doubling the env complexity); (c) header is the well-trodden pattern (Anthropic uses `anthropic-beta`).
- **Alt B — Header AND URL path both supported (path overrides header).** Disqualified because nothing in v30 requires both; KISS principle says don't add fallback complexity until evidence forces it.

**Code-level integration point:**
- **NEW** `livinity-broker/mode-dispatch.ts:resolveMode()` (see Q1 code snippet) — single source of truth for header parsing.
- **`router.ts`** — insertion AT line 64 (after body validation, before `tools` warn log):
  ```typescript
  const mode = resolveMode(req)
  if (mode === 'passthrough') {
    return passthroughAnthropicMessages({ livinityd: deps.livinityd, userId: auth.userId, body, res })
  }
  ```
- **`openai-router.ts`** — insertion AT line 108 (same structure):
  ```typescript
  const mode = resolveMode(req)
  if (mode === 'passthrough') {
    return passthroughOpenAIChatCompletions({ livinityd: deps.livinityd, userId: auth.userId, body, res })
  }
  ```

**Worked example (curl):**
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

**Risk + Mitigation:**
- **Risk:** A future internal LivOS feature decides to call the broker (e.g., a planning subsystem). It would default to passthrough and lose Nexus tools/identity. **Mitigation:** Document the header opt-in pattern in `livinityd/source/modules/livinity-broker/README.md` (NEW); any internal code calling the broker must explicitly send `X-Livinity-Mode: agent`. Phase 57 plan includes a search-grep audit verifying no internal code calls the broker without the header (today: zero such calls exist).
- **Risk:** A misconfigured external proxy (e.g., a future Server5 Caddy rewrite in Phase 60) strips custom headers. **Mitigation:** Phase 60's Caddy config explicitly preserves `X-Livinity-Mode` in the upstream proxy directive. Phase 57 doesn't address this directly; flag for Phase 60 plan.
- **Risk:** External client (e.g., Bolt.diy) accidentally adds the header. **Mitigation:** Practically impossible — clients don't know about Livinity-specific headers unless explicitly configured. Spec the header name as Livinity-internal in the README.

---

### Q7 Verdict — Block-Level Streaming for Agent Mode: **Confirm; Agent SDK aggregates by design; Agent mode keeps current behavior; passthrough fixes via SDK pass-through**

**Chosen path:** Agent mode KEEPS current Strategy B HTTP-proxy to nexus `/api/agent/stream` which ultimately invokes sacred `sdk-agent-runner.ts`. The sacred file's loop at `sdk-agent-runner.ts:378-389` extracts text from `assistant.content[].text` blocks and emits `chunk` events per assistant turn — this is block-level streaming (one chunk per content_block), NOT token-level. Phase 57 does NOT change this. Phase 58 fixes streaming for the PASSTHROUGH path only (which uses Anthropic SDK's `messages.stream()` whose async iterator emits `content_block_delta` events token-by-token).

**Rationale (≥3 reasons):**
1. **Sacred file's aggregation is by Agent SDK design.** Sacred file lines 378-389 read from `SDKAssistantMessage.message.content[].text` — the `@anthropic-ai/claude-agent-sdk@^0.2.84` returns assistant messages as discrete content blocks already aggregated into final form. The SDK's `query()` API exposes turn-level callbacks, not token-level deltas. To get token-level streaming, one must bypass the Agent SDK entirely (which is what passthrough does via `@anthropic-ai/sdk` — a SEPARATE package).
2. **D-51-03 implication: Branch N reversal NOT NEEDED in v30.** D-51-03 deferred the question of reverting an earlier sacred-file edit ("`feat(43.10): inject model identity line — fix Claude 3.5 Sonnet hallucination`"). Q1 verdict (passthrough bypasses sacred file) means external clients see no Nexus identity injection — the original problem motivating Branch N reversal is RESOLVED for the external use case via passthrough mode. Internal callers (none today, since `/ws/agent` doesn't go through broker) would need agent mode and acceptably see the identity line ("you are powered by Claude Sonnet 4.6"). Therefore D-51-03 verdict: **"Not needed in v30 — passthrough handles external; agent mode internal-only and identity-line acceptable there"**.
3. **Passthrough streaming via SDK is real token streaming.** SDK's `messages.stream()` exposes the canonical Anthropic SSE event sequence as JS events: `message_start`, `content_block_start`, `content_block_delta` (one per token group), `content_block_stop`, `message_delta`, `message_stop`, plus interspersed `ping`. Verified at platform.claude.com/docs/en/api/messages-streaming (event sequence quoted in Code Examples below). Phase 57 may emit aggregate-then-restream as transitional (use `await stream.finalMessage()` then synthesize a single Anthropic SSE sequence with one fat `content_block_delta`); Phase 58 swaps in true pass-through (proxy raw events).
4. **Agent SDK aggregation is INDEPENDENT of broker code.** No broker-side change can fix Agent-mode streaming without editing sacred file. Per D-51-03 deferral and v30's sacred-file-untouched contract, Agent mode in v30 emits 1-N aggregated chunks per turn (one per assistant content block). Phase 58 explicitly targets only the passthrough path for token streaming — Agent mode streaming remains as-is.

**Alternatives considered:**
- **Alt A (this verdict)** — confirm Agent SDK aggregates → passthrough fixes externally → D-51-03 not needed for v30.
- **Alt B — Find Agent SDK can stream tokens but sacred-file loop forces aggregation → flag D-30-XX deferred sacred edit.** Rejected because the loop EXTRACTS aggregated blocks; even if SDK exposed token deltas, the loop body would need to change. Sacred-file boundary is binding.
- **Alt C — Agent SDK streams natively → triggers D-51-03 reversal re-eval.** Rejected on same grounds; even if true, the FIX requires sacred-file edit which is out-of-scope for v30 per D-51-03 + sacred-file contract.

**Code-level integration point (READ-ONLY references):**
- **`nexus/packages/core/src/sdk-agent-runner.ts:378-389`** — aggregation site (block-level extract from `assistant.content[]`). **READ-ONLY in Phase 57. No edit recommendation.**
- **`livos/packages/livinityd/source/modules/livinity-broker/router.ts:88-117`** — agent-mode SSE branch UNCHANGED in Phase 57.
- **`livos/packages/livinityd/source/modules/livinity-broker/router.ts:88-117`** in passthrough mode (NEW): handler uses Anthropic SDK `messages.stream()` async iterator instead of `createSdkAgentRunnerForUser`. Phase 58 wires the iterator to emit raw SSE.

**D-51-03 implication (verbatim entry for Cross-Cuts):**
> **D-30-01: D-51-03 re-evaluation — Not needed in v30. Rationale: Q1 verdict (passthrough bypasses sacred file) resolves external identity contamination; agent mode internal-only and the identity-line is acceptable for any future internal caller that explicitly opts in via `X-Livinity-Mode: agent`. (Phase 57 inline-research outcome — Phase 56 spike absorbed.)**

**Risk + Mitigation:**
- **Risk:** A future internal feature wants Nexus tools BUT no identity line. **Mitigation:** Sacred file untouched; if such a feature emerges in v31+, plan a sacred-edit hotpatch with full audit trail. Today there is no such feature.
- **Risk:** Phase 58's true streaming for passthrough has different timing characteristics than Agent mode's aggregated chunks, and a UI that consumes both modes may render inconsistently. **Mitigation:** Not Phase 57's concern — UI components that consume `/v1/messages` SSE always render token-by-token (each delta updates the bubble); aggregated chunks just appear as "fast streaming." External clients (Bolt.diy/Open WebUI) use real Anthropic SSE format and render correctly with both Phase 57 transitional aggregate AND Phase 58 token-streaming.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/sdk` | `^0.80.0` (registry latest 0.92.0 [VERIFIED: npm view 2026-05-02]) | Anthropic Messages SDK with `authToken` + `messages.create/stream` + tool support | Already at `nexus/packages/core/package.json:34` (and via `@nexus/core` workspace edge for livinityd). Officially maintained by Anthropic. |
| `@anthropic-ai/claude-agent-sdk` | `^0.2.84` (registry latest 0.2.126 [VERIFIED: npm view]) | Used by sacred file ONLY; no Phase 57 edit | UNCHANGED — agent mode keeps existing dep |
| `express` | `^4.18.2` | Router host (mounting `/u` at `livinityd/source/modules/server/index.ts:1234`) | Already present |
| `ioredis` | `^5.4.0` | Redis primitives for token cache + token-refresh deduplication | Already present in both nexus + livinityd |
| `node:fs/promises` | builtin | Read `~/.claude/.credentials.json` per-user | builtin |
| `node:path` | builtin | `join(dataDir, 'users', userId, '.claude')` | builtin |

### Supporting (existing patterns to reuse)
| Pattern | Source | Use in Phase 57 |
|---------|--------|-----------------|
| `homeOverride` resolution | `nexus/src/api.ts:2418-2436` | Same regex `/^[a-zA-Z0-9_-]+$/` for userId; same path build `join(dataDir, 'users', userId, '.claude')` |
| `UpstreamHttpError` 429+Retry-After | `livinity-broker/agent-runner-factory.ts:18-27` | Wrap `Anthropic.APIError` and re-throw — existing 429 catch in `router.ts:158-185` and `openai-router.ts:248-282` handles the rest unchanged |
| `BROKER_FORCE_ROOT_HOME` env override | `livinity-broker/agent-runner-factory.ts:77` | Fallback for single-user mode — passthrough handler reads same env var |
| `mountUsageCaptureMiddleware` ordering | `livinityd/source/modules/server/index.ts:1228` (BEFORE broker) | UNCHANGED — middleware sees both modes' responses transparently |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/sdk` | Raw `fetch()` to api.anthropic.com | More code, no benefit; SDK already a dep |
| Read credentials.json directly | Spawn `claude` CLI subprocess | 50ms overhead, conflates with agent path |
| `messages.stream()` for Phase 57 streaming | `messages.create()` then synthetic SSE | Same UX in Phase 57 (transitional); 58 swaps to stream() |

**Installation:** No `npm install` required. Optionally add the type-clarity entry:
```bash
# Optional hygiene — same version, no registry change (hoisted)
cd livos/packages/livinityd
# Edit package.json manually to add: "@anthropic-ai/sdk": "^0.80.0" under dependencies
pnpm install --frozen-lockfile  # if pnpm; or npm i if npm
```

**Version verification:**
```bash
npm view @anthropic-ai/sdk version
# Returns: 0.92.0  (registry latest 2026-05-02)

git grep -n '"@anthropic-ai/sdk"' nexus/packages/core/package.json
# nexus/packages/core/package.json:34:    "@anthropic-ai/sdk": "^0.80.0",

git hash-object nexus/packages/core/src/sdk-agent-runner.ts
# Returns: 4f868d318abff71f8c8bfbcf443b2393a553018b  ✓ matches BASELINE
```

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  External marketplace app container (Bolt.diy / Open WebUI / Continue.dev)   │
│  env: ANTHROPIC_BASE_URL=http://livinity-broker:8080/u/<userId>              │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │  POST /u/abc123/v1/messages (or /v1/chat/completions)
                                 │  Content-Type: application/json
                                 │  [optional] X-Livinity-Mode: agent
                                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  livinityd Express app (port 8080)                                            │
│                                                                                │
│  Middleware chain (server/index.ts:1221-1234):                                 │
│  ① express.json (10MB limit)                                                  │
│  ② mountUsageCaptureMiddleware  ─ wraps res.json/res.write/res.end             │
│  ③ mountBrokerRoutes            ─ /u router                                    │
│       ├─ containerSourceIpGuard   (RFC1918 + loopback only)                    │
│       ├─ resolveAndAuthorizeUserId (URL :userId → users table → multi-user)    │
│       └─ ─────────────────────────────────────────────────────                 │
│                                  │                                             │
│                       NEW Phase 57 dispatch (mode-dispatch.ts):                │
│                       resolveMode(req) → 'passthrough' | 'agent'               │
│                                  │                                             │
│             ┌────────────────────┴────────────────────┐                        │
│             ▼                                          ▼                       │
│   passthrough-handler.ts                      agent-runner-factory.ts          │
│   (NEW Phase 57)                              (UNCHANGED — Strategy B)         │
│                                                                                │
│   ① homeOverride =                            ① fetch(`${LIV_API_URL}/api/agent/stream`)│
│     join(dataDir,'users',userId,'.claude')                                     │
│   ② read credentials.json                     ② parse SSE                      │
│   ③ extract claudeAiOauth.accessToken         ③ yield AgentEvent              │
│   ④ new Anthropic({authToken})                ④ throw UpstreamHttpError on 429│
│   ⑤ messages.create() OR messages.stream()                                    │
│   ⑥ pass tools[] verbatim                                                     │
│   ⑦ system prompt verbatim                                                    │
│             │                                          │                       │
│             ▼                                          ▼                       │
└─────────────┼──────────────────────────────────────────┼───────────────────────┘
              │                                          │
              ▼                                          ▼
   ┌──────────────────────────┐         ┌─────────────────────────────────┐
   │  api.anthropic.com       │         │  nexus core (port 3200)         │
   │  /v1/messages            │         │  /api/agent/stream              │
   │                          │         │     ↓                            │
   │  Authorization: Bearer   │         │  SdkAgentRunner (SACRED)         │
   │  x-api-key (NOT used)    │         │  - Nexus identity prepend (264)  │
   │  anthropic-version       │         │  - mcpServers['nexus-tools']     │
   │                          │         │  - block-level aggregation (378) │
   └──────────────────────────┘         └─────────────────────────────────┘
                │                                          │
                └─────────────── Anthropic SSE ────────────┘
                                  │
                                  ▼
                  Response back to client (both modes)
                  ⓘ Usage capture middleware writes broker_usage row
```

**Key flow:** External marketplace request → mode dispatch on header → passthrough (default, NO Nexus injection) OR agent (sacred path UNCHANGED).

### Recommended Project Structure (NEW + modified files)

```
livos/packages/livinityd/source/modules/livinity-broker/
├── router.ts                  # MODIFY: insert mode dispatch after body validation (line 64)
├── openai-router.ts           # MODIFY: insert mode dispatch after body validation (line 108)
├── auth.ts                    # UNCHANGED
├── agent-runner-factory.ts    # UNCHANGED — agent-mode path
├── sse-adapter.ts             # UNCHANGED — agent-mode SSE
├── openai-sse-adapter.ts      # UNCHANGED — agent-mode OpenAI SSE
├── sync-response.ts           # UNCHANGED
├── translate-request.ts       # UNCHANGED — agent-mode translation
├── openai-translator.ts       # MODIFY: add translateToolsToAnthropic + translateToolUseToOpenAI helpers
├── types.ts                   # MODIFY: add BrokerMode type, PassthroughOpts type
├── index.ts                   # UNCHANGED
├── mode-dispatch.ts           # NEW: resolveMode(req) → 'passthrough' | 'agent'
├── passthrough-handler.ts     # NEW: passthroughAnthropicMessages + passthroughOpenAIChatCompletions
├── credential-extractor.ts    # NEW: readSubscriptionToken(userId) → { accessToken } | null
├── mode-dispatch.test.ts      # NEW: unit tests for resolveMode
├── passthrough-handler.test.ts # NEW: integration test with mocked api.anthropic.com (nock or msw)
├── credential-extractor.test.ts # NEW: unit test (read fixture credentials.json)
└── README.md                  # NEW: documents header pattern for any future internal callers
```

### Pattern 1: Mode Dispatcher

**What:** Single helper reads `X-Livinity-Mode` header, returns typed mode enum.
**When to use:** Both router.ts and openai-router.ts call this AT line ~64 (router) / ~108 (openai-router) immediately after body validation.
**Example (verified pattern source: `auth.ts:32-68` style — defensive, header-shape-tolerant):**
```typescript
// livinity-broker/mode-dispatch.ts
import type { Request } from 'express'

export type BrokerMode = 'passthrough' | 'agent'

export function resolveMode(req: Request): BrokerMode {
  const raw = req.headers['x-livinity-mode']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return 'passthrough'
  return value.trim().toLowerCase() === 'agent' ? 'agent' : 'passthrough'
}
```

### Pattern 2: Subscription Token Extraction

**What:** Per-user credential read with fallback to root HOME (matches `BROKER_FORCE_ROOT_HOME` semantics).
**When to use:** Inside passthrough handler before constructing Anthropic client.
**Example (pattern source: `nexus/src/daemon.ts:319-330` for read; `nexus/src/api.ts:2435` for path):**
```typescript
// livinity-broker/credential-extractor.ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isMultiUserMode } from '../ai/per-user-claude.js'
import type Livinityd from '../../index.js'

export interface SubscriptionToken {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
}

export async function readSubscriptionToken(opts: {
  livinityd: Livinityd
  userId: string
}): Promise<SubscriptionToken | null> {
  const { livinityd, userId } = opts
  const dataDir = process.env.LIVOS_DATA_DIR || '/opt/livos/data'
  const multiUser = await isMultiUserMode(livinityd).catch(() => false)
  const forceRootHome = process.env.BROKER_FORCE_ROOT_HOME === 'true'

  let credPath: string
  if (multiUser && !forceRootHome) {
    credPath = join(dataDir, 'users', userId, '.claude', '.credentials.json')
  } else {
    credPath = join(process.env.HOME || '/root', '.claude', '.credentials.json')
  }

  try {
    const raw = await readFile(credPath, 'utf8')
    const json = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string; refreshToken?: string; expiresAt?: string } }
    const oauth = json.claudeAiOauth
    if (!oauth?.accessToken) return null
    return { accessToken: oauth.accessToken, refreshToken: oauth.refreshToken, expiresAt: oauth.expiresAt }
  } catch {
    return null
  }
}
```

### Pattern 3: Anthropic Pass-through Handler

**What:** Construct SDK with `authToken`, call `messages.create()` (sync) or `messages.stream()` (Phase 57 transitional aggregate; Phase 58 will swap to true streaming).
**Source for SDK init pattern:** github.com/anthropics/anthropic-sdk-typescript `src/client.ts` (verified).
**Example skeleton:**
```typescript
// livinity-broker/passthrough-handler.ts
import Anthropic from '@anthropic-ai/sdk'
import type { Response } from 'express'
import { readSubscriptionToken } from './credential-extractor.js'
import { UpstreamHttpError } from './agent-runner-factory.js'
import type { AnthropicMessagesRequest } from './types.js'
import type Livinityd from '../../index.js'

export async function passthroughAnthropicMessages(opts: {
  livinityd: Livinityd
  userId: string
  body: AnthropicMessagesRequest
  res: Response
}): Promise<void> {
  const { livinityd, userId, body, res } = opts
  const token = await readSubscriptionToken({ livinityd, userId })
  if (!token) {
    res.status(401).json({
      type: 'error',
      error: { type: 'authentication_error', message: `User ${userId} has no Claude subscription configured. Visit Settings > AI Configuration.` },
    })
    return
  }

  const client = new Anthropic({
    authToken: token.accessToken,
    defaultHeaders: { 'anthropic-version': '2023-06-01' },
  })

  try {
    if (body.stream === true) {
      // Phase 57 TRANSITIONAL: aggregate then re-stream as single Anthropic SSE sequence
      // Phase 58 swaps to true pass-through via SDK's messages.stream() event iterator
      const message = await client.messages
        .stream({
          model: body.model,
          max_tokens: body.max_tokens ?? 4096,
          system: body.system,
          messages: body.messages,
          tools: body.tools,
        })
        .finalMessage()
      // Emit synthetic SSE sequence (one fat content_block_delta for transitional)
      // ... see plan author for SSE emission detail
    } else {
      const response = await client.messages.create({
        model: body.model,
        max_tokens: body.max_tokens ?? 4096,
        system: body.system,
        messages: body.messages,
        tools: body.tools,
      })
      res.status(200).json(response)
    }
  } catch (err: any) {
    // Map Anthropic.APIError → UpstreamHttpError so existing 429 forwarding handles uniformly
    if (err?.status && typeof err.status === 'number') {
      const retryAfter = err.headers?.['retry-after'] ?? null
      throw new UpstreamHttpError(`upstream Anthropic returned ${err.status}: ${err.message}`, err.status, retryAfter)
    }
    throw err
  }
}
```

### Anti-Patterns to Avoid
- **Don't try to extract subscription token in nexus** — sacred-file boundary. Token extraction lives in livinityd.
- **Don't add a new dep when SDK is present** — D-NO-NEW-DEPS. Use `@anthropic-ai/sdk` even if `fetch()` would also work.
- **Don't filter tools** — pass-through is transparent. Allowlists/denylists belong to a different (future) policy layer.
- **Don't mutate `body` in place** — Pass body to SDK as-is or destructure into named fields. Mutation causes confusing test breakage.
- **Don't import sacred file** — `sdk-agent-runner.ts` is read-only; passthrough must not even import its types.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anthropic SSE parsing | Custom event-line parser | `@anthropic-ai/sdk` `messages.stream()` async iterator | SDK handles event boundaries, ping events, signature_delta thinking blocks (verified at platform.claude.com SSE doc) |
| Anthropic auth header construction | Custom `Authorization` builder | `new Anthropic({ authToken })` | SDK builds `Authorization: Bearer ${token}` correctly + adds `anthropic-version` |
| OpenAI ↔ Anthropic tools translation | Custom translator | Reuse pattern from `openai-translator.ts` (existing file); LiteLLM source on GitHub for reference shapes | Existing pattern in repo |
| 429 + Retry-After forwarding | Custom 429 catch | Existing `UpstreamHttpError` (`agent-runner-factory.ts:18-27`) + existing catch blocks (`router.ts:158-185`, `openai-router.ts:248-282`) | Already implemented Phase 45 |
| Token refresh | Custom refresh loop | Reuse pattern from `nexus/src/providers/claude.ts` OAuth refresh | Pattern exists; transplant verbatim |
| Per-user file path validation | Custom regex | `/^[a-zA-Z0-9_-]+$/` already in `auth.ts:95` and `nexus/src/api.ts:2423` | Same regex |

**Key insight:** Phase 57 is mostly **wiring existing pieces**. The only NEW IP is the credential extractor (~30 LOC) and the mode dispatcher (~10 LOC).

---

## Common Pitfalls

### Pitfall 1: Passthrough Handler Imports Sacred File Indirectly
**What goes wrong:** Author imports `AgentEvent` from `@nexus/core` for type-only use, but `@nexus/core/dist/index.js` re-exports symbols transitively from sacred file. Build accidentally drags sacred-file types into broker bundle, then any subsequent edit triggers a cascade.
**Why it happens:** TypeScript type-only imports collapse at compile time, but tooling (vite/tsc) sometimes resolves dependencies aggressively.
**How to avoid:** Phase 57 plan includes a `git grep '@nexus/core' livinity-broker/passthrough-handler.ts livinity-broker/credential-extractor.ts livinity-broker/mode-dispatch.ts` audit step — must return zero matches.
**Warning signs:** TypeScript errors mentioning `SDKAssistantMessage`, `BetaMessage`, etc. appearing in passthrough builds.

### Pitfall 2: Subscription Token Logged Verbatim in Error Messages
**What goes wrong:** `readSubscriptionToken()` throws a path-leaking error (`ENOENT: /opt/livos/data/users/abc123/.claude/.credentials.json`), broker logger captures full path including userId, log shipper aggregates to a public-readable file.
**Why it happens:** Default Node `fs.readFile` errors include the absolute path.
**How to avoid:** The credential-extractor wraps reads in try/catch and returns `null` on any failure. Log only `userId` + `multiUserMode` + `forceRootHome`, NEVER the path or contents.
**Warning signs:** A grep of broker logs reveals strings starting with `/opt/livos/data/users/`.

### Pitfall 3: Header Casing Variations
**What goes wrong:** Test asserts `req.headers['X-Livinity-Mode']` (PascalCase) but Express normalizes to lowercase. Test passes; production fails because test was checking the wrong key.
**Why it happens:** Node http parser lowercases all header names per RFC 7230 §3.2.
**How to avoid:** `resolveMode()` reads `req.headers['x-livinity-mode']` (lowercase) — Express guarantees this. Unit tests assert lowercase access.
**Warning signs:** Test uses uppercase header key; production logs show "header undefined" for known agent-mode requests.

### Pitfall 4: Bolt.diy/External Client Can't Set Custom Headers
**What goes wrong:** Phase 57 ships header-based opt-in but a future internal caller wants agent mode AND lives in a context where adding custom headers is hard (e.g., a Caddy `reverse_proxy` directive that doesn't pass through arbitrary headers).
**Why it happens:** External clients (Bolt.diy, Open WebUI) DON'T need agent mode (they want passthrough). Internal callers might.
**How to avoid:** Today there are NO internal callers of the broker — `/ws/agent` goes direct to nexus. Phase 57 is safe. If a future internal caller emerges, document the header in `livinity-broker/README.md` and require explicit opt-in.
**Warning signs:** A new code path calls broker without header and gets passthrough behavior unexpectedly. Audit grep `livinity-broker:8080` across `livos/` + `nexus/` after Phase 57 ships — only `inject-ai-provider.ts:8` (marketplace apps) should match.

### Pitfall 5: `homeOverride` Path Doesn't Exist (User Hasn't Configured Subscription)
**What goes wrong:** Multi-user mode user installs Bolt.diy from marketplace, sends a chat. Their `~/.claude/.credentials.json` doesn't exist (they never logged into Claude Code). Bolt.diy gets a confusing 500 instead of a clear "set up subscription" message.
**Why it happens:** Per-user dirs are created by Phase 40 OAuth flow; until that flow runs, the path is missing.
**How to avoid:** `passthroughAnthropicMessages()` returns 401 + `{"error":{"type":"authentication_error","message":"User <id> has no Claude subscription configured."}}` when `readSubscriptionToken()` returns null.
**Warning signs:** Production 500 errors with stack trace including `ENOENT credentials.json`.

### Pitfall 6: Agent Mode Integration Tests Fail Because of Translation Drift
**What goes wrong:** Phase 57 plan adds new translation helpers in `openai-translator.ts` that change behavior for shared paths (passthrough + agent mode both call `resolveModelAlias` etc.). Existing v29.5 OpenAI integration tests fail.
**Why it happens:** Tests are tightly coupled to the current behavior; adding new branches to shared helpers risks regression.
**How to avoid:** New helpers (`translateToolsToAnthropic`, `translateToolUseToOpenAI`) live in NEW files or are NEW exports — never modify existing exports' behavior. Run `livos/packages/livinityd/source/modules/livinity-broker/integration.test.ts` and `openai-integration.test.ts` after every wave; failures = regression.
**Warning signs:** Test failures in agent-mode-only tests after Phase 57 changes.

### Pitfall 7: Sacred File SHA Drift via Workspace Symlink Re-resolution
**What goes wrong:** A `pnpm install` during Phase 57 dev re-resolves the `@nexus/core` workspace edge, potentially re-running tsc on the source which (if anyone has a stale Edit) could overwrite `dist/sdk-agent-runner.js`. The TS source SHA stays the same, but the test checks source.
**Why it happens:** `BASELINE_SHA` checks `nexus/packages/core/src/sdk-agent-runner.ts` (TS source), not `dist/sdk-agent-runner.js`.
**How to avoid:** Phase 57 plan includes pre-flight + post-execute `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` checks in EVERY wave. Drift = phase blocker.
**Warning signs:** `git status` shows `nexus/packages/core/src/sdk-agent-runner.ts` as modified.

---

## Code Examples

Verified patterns from official sources:

### Anthropic SSE Event Sequence (from platform.claude.com docs)

```
event: message_start
data: {"type": "message_start", "message": {"id": "msg_...", "type": "message", "role": "assistant", "content": [], "model": "claude-opus-4-7", "stop_reason": null, "stop_sequence": null, "usage": {"input_tokens": 25, "output_tokens": 1}}}

event: content_block_start
data: {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}

event: ping
data: {"type": "ping"}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hello"}}

event: content_block_delta
data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "!"}}

event: content_block_stop
data: {"type": "content_block_stop", "index": 0}

event: message_delta
data: {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 15}}

event: message_stop
data: {"type": "message_stop"}
```
Source: [https://platform.claude.com/docs/en/api/messages-streaming](https://platform.claude.com/docs/en/api/messages-streaming) (lines 376-389 of fetched content). Phase 58 builds on this. Phase 57's transitional path emits a degenerate version of this sequence (one big `content_block_delta` with the full final text).

### Anthropic SDK ClientOptions (from github.com/anthropics/anthropic-sdk-typescript `src/client.ts`)

```typescript
export interface ClientOptions {
  apiKey?: string | ApiKeySetter | null | undefined;
  authToken?: string | null | undefined;          // ← used by Phase 57 for subscription tokens
  baseURL?: string | null | undefined;
  timeout?: number | undefined;
  fetchOptions?: MergedRequestInit | undefined;
  fetch?: Fetch | undefined;
  maxRetries?: number | undefined;
  defaultHeaders?: HeadersLike | undefined;
  defaultQuery?: Record<string, string | undefined> | undefined;
  dangerouslyAllowBrowser?: boolean | undefined;
  logLevel?: LogLevel | undefined;
  logger?: Logger | undefined;
}

protected async bearerAuth(opts: FinalRequestOptions): Promise<NullableHeaders | undefined> {
  if (this.authToken == null) return undefined;
  return buildHeaders([{ Authorization: `Bearer ${this.authToken}` }]);
}
```
Source: [github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts). Verified that constructing `new Anthropic({ authToken: '<token>' })` produces `Authorization: Bearer <token>` headers — exactly what subscription auth needs.

### Existing Subscription Credential Read (from `nexus/src/daemon.ts:319-330`)

```typescript
const credPath = join(homedir(), '.claude', 'credentials.json');
const creds = JSON.parse(await readFile(credPath, 'utf8'));
hasCliAuth = !!(creds && (creds.apiKey || creds.oauthToken || Object.keys(creds).length > 0));
```
Source: in-repo, verified. Phase 57's `credential-extractor.ts` follows this read pattern but uses per-user `homeOverride` path and extracts `claudeAiOauth.accessToken` specifically.

### credentials.json Structure (verified via WebSearch — Anthropic Claude Code authentication docs)

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": "2026-02-23T05:40:22.000Z",
    "scopes": ["user:profile", "user:inference", "user:sessions:claude_code", "user:mcp_servers"],
    "subscriptionType": null,
    "rateLimitTier": null
  }
}
```
Source: WebSearch result citing Claude Code authentication docs at code.claude.com/docs/en/authentication. File mode 0600 on Linux. Token TTL 28800s (8 hours). Refresh via POST `https://platform.claude.com/v1/oauth/token` with `grant_type=refresh_token` (verified from `nexus/src/providers/claude.ts:55-58`).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All broker traffic through Strategy B (HTTP-proxy → nexus → sacred file) | Mode-dispatched: passthrough default + agent opt-in | Phase 57 (this) | External clients no longer see Nexus identity / tools |
| Client `tools[]` warn-and-ignored (D-41-14, D-42-12) | Forwarded verbatim in passthrough mode; ignored in agent mode | Phase 57 | Bolt.diy / Open WebUI / Continue.dev tools work |
| Block-level streaming everywhere | Block-level retained for agent mode (sacred); passthrough uses Anthropic SDK token streaming (Phase 58) | Phases 57+58 | Phase 57 transitional aggregate; 58 = real streaming |

**Deprecated in v30 (after Phase 57):**
- Direct caller assumption that broker prepends Nexus identity → must explicitly opt in via `X-Livinity-Mode: agent`.
- D-41-14 / D-42-12 blanket "ignore tools" → applies ONLY to agent mode after Phase 57.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest@^2.1.2` (livos), `tsx` ad-hoc tests (nexus) — already present |
| Config file | `livos/packages/livinityd/package.json` test script line 16 |
| Quick run command | `cd livos/packages/livinityd && npm run test -- livinity-broker` |
| Full suite command | `cd livos/packages/livinityd && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FR-BROKER-A1-01 (passthrough default) | `POST /u/<id>/v1/messages` with no header → SDK-direct path; with `X-Livinity-Mode: agent` → existing nexus path | integration (mocked api.anthropic.com) | `npm run test -- livinity-broker/passthrough-handler.test` | ❌ Wave 0 (NEW) |
| FR-BROKER-A1-01 (system prompt verbatim) | Submit `system: "You are Bolt"` → upstream call body has same string verbatim | unit (mock SDK constructor; assert `messages.create` called with `system: "You are Bolt"`) | `npm run test -- livinity-broker/passthrough-handler.test::system_verbatim` | ❌ Wave 0 |
| FR-BROKER-A1-01 (tools forwarded) | Submit `tools: [{name: "calculator", ...}]` → upstream `messages.create` called with same array | unit | `npm run test -- livinity-broker/passthrough-handler.test::tools_forward` | ❌ Wave 0 |
| FR-BROKER-A1-02 (no Nexus identity injection) | Response body does NOT contain "powered by" or "Nexus" string | integration | `npm run test -- livinity-broker/passthrough-handler.test::no_nexus_identity` | ❌ Wave 0 |
| FR-BROKER-A1-03 (no Nexus MCP tools) | Response `tool_use` blocks (if any) match client-supplied tool names verbatim; no `shell` / `files_read` / `mcp__*` | integration | `npm run test -- livinity-broker/passthrough-handler.test::no_mcp_tools` | ❌ Wave 0 |
| FR-BROKER-A1-04 (sacred file SHA stable) | `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` returns `4f868d318abff71f8c8bfbcf443b2393a553018b` | shell + assert | `bash -c "test \$(git hash-object nexus/packages/core/src/sdk-agent-runner.ts) = 4f868d318abff71f8c8bfbcf443b2393a553018b"` | ✅ (manual integrity test at `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts` — runs via `npm run test:phase39`) |
| FR-BROKER-A2-01 (header opt-in works) | `X-Livinity-Mode: agent` triggers Strategy B; absent triggers passthrough | unit (resolveMode tests with various header values) | `npm run test -- livinity-broker/mode-dispatch.test` | ❌ Wave 0 |
| FR-BROKER-A2-02 (agent mode unchanged) | All existing v29.5 broker integration tests pass unchanged when client adds `X-Livinity-Mode: agent` header | integration (re-run existing tests with header injected) | `npm run test -- livinity-broker/integration.test livinity-broker/openai-integration.test` (modified to send agent header) | ✅ (existing tests; modify to send header) |
| Cross-cut: token extraction (subscription configured) | Read fixture `credentials.json` → returns `{accessToken, refreshToken, expiresAt}` | unit | `npm run test -- livinity-broker/credential-extractor.test::happy_path` | ❌ Wave 0 |
| Cross-cut: token extraction (no creds file) | Returns null → handler returns 401 with actionable message | unit | `npm run test -- livinity-broker/credential-extractor.test::missing_creds` | ❌ Wave 0 |
| Cross-cut: 429 forwarding | Mocked Anthropic 429 → handler emits 429 + Retry-After verbatim | integration | `npm run test -- livinity-broker/passthrough-handler.test::upstream_429` | ❌ Wave 0 |
| Cross-cut: Anthropic SDK auth | New `Anthropic({authToken})` produces `Authorization: Bearer <token>` (verified via mock fetch capture) | unit | `npm run test -- livinity-broker/passthrough-handler.test::auth_header_format` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- livinity-broker/passthrough-handler.test livinity-broker/mode-dispatch.test livinity-broker/credential-extractor.test` (~5s)
- **Per wave merge:** `npm run test -- livinity-broker` (full broker test dir, ~30s) + `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` SHA check
- **Phase gate:** Full `npm test` green before `/gsd-verify-work` invocation
- **Live verification:** Phase 63 — Bolt.diy live test (FR-VERIFY-V30-02) — confirms passthrough self-identifies as Bolt, broker_usage row written

### Wave 0 Gaps
- [ ] `livinity-broker/mode-dispatch.test.ts` — unit tests for `resolveMode()` covering 6 cases (header absent, agent, AGENT, Agent, garbage, array form)
- [ ] `livinity-broker/passthrough-handler.test.ts` — integration tests with mocked `@anthropic-ai/sdk` (covers FR-BROKER-A1-01..03)
- [ ] `livinity-broker/credential-extractor.test.ts` — unit tests with fixture credentials.json files
- [ ] Modify `livinity-broker/integration.test.ts` and `openai-integration.test.ts` to inject `X-Livinity-Mode: agent` header in their requests (FR-BROKER-A2-02)
- [ ] Create `livinity-broker/README.md` documenting the header pattern for future internal callers
- [ ] No framework install needed — vitest already in livinityd dev-deps line 56

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Subscription token (`accessToken`) read from per-user credentials.json (mode 0o600); forwarded as `Authorization: Bearer` to upstream only |
| V3 Session Management | no | Stateless per-request token lookup |
| V4 Access Control | yes | Existing per-user URL-path identity (`/u/:userId/v1/...`) + IP guard preserved; token scoped to `userId` |
| V5 Input Validation | yes | Body validation already in `router.ts:43-63` and `openai-router.ts:78-107`; passthrough preserves it; Anthropic SDK does additional validation upstream |
| V6 Cryptography | partial | Token storage uses Anthropic's existing OAuth scheme (we read, don't generate). No new crypto in Phase 57. |

### Known Threat Patterns for `livinityd` + Express + Anthropic SDK

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Subscription token logged in error message | Information Disclosure | Try/catch around credential read; log only `userId` + boolean status; never path or contents (Pitfall 2) |
| Cross-user token reuse via path-traversal in `userId` | Spoofing / EoP | `/^[a-zA-Z0-9_-]+$/` regex at `auth.ts:95` (existing) — same regex used in passthrough credential path build |
| Header injection via `X-Livinity-Mode` value | Tampering | `resolveMode()` accepts only literal "agent" (case-insensitive trim); any other value → passthrough default. No string-formatting or eval of header value. |
| Replay of expired access token | Spoofing | Passthrough handler catches 401 from upstream → triggers refresh via `refreshToken` → retries once. Subsequent failures surface 401 to client. |
| External client passes hostile `tools[]` to upstream | Tampering (against OTHER USERS) | Tools are passed to upstream Anthropic where they're sandboxed in the model's response (model returns `tool_use` blocks, but execution is the client's responsibility). Broker never executes client tools. |
| MITM between broker and api.anthropic.com | Information Disclosure / Tampering | SDK uses HTTPS by default to `https://api.anthropic.com`; no plaintext fallback |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Subscription `accessToken` (sk-ant-oat01-*) is accepted as `Authorization: Bearer` for `POST /v1/messages` (i.e., the SAME way Claude Code CLI uses it via Agent SDK) | Q1 verdict | **MEDIUM RISK.** Anthropic docs explicitly cite `x-api-key` only. SDK's `bearerAuth()` is a real code path, but Anthropic could (in theory) reject Bearer auth on `/v1/messages` for non-Claude-Code-CLI flows. **Mitigation:** Phase 57 implementation MUST include integration test with mocked 401 + a Phase 63 LIVE test (Bolt.diy) before declaring victory. If 401, fallback plan = Phase 57.1 hot-patch documenting subscription incompatibility and offering API-key path (out of v30 scope per D-NO-BYOK). [ASSUMED — to verify in Phase 57 plan execution] |
| A2 | Anthropic Messages API accepts client-supplied `tools[]` from any auth tier (subscription or API key) | Q2 verdict | LOW. Public docs do not mention tier gating for tools. If wrong, upstream returns 400; broker forwards verbatim. [ASSUMED — verified absence of contrary evidence in fetched docs but no explicit "tools work on subscription" statement] |
| A3 | LivOS in-app chat does NOT use the broker (uses `/ws/agent` instead) | Q3 verdict | LOW. Verified by codebase grep: `livos/packages/ui/src/hooks/use-agent-socket.ts:367` calls `wss://<host>/ws/agent`. No UI code calls `/u/.../v1/...`. **If wrong:** in-app chat would default to passthrough and lose Nexus tools. Phase 57 plan includes a final grep audit to confirm. [VERIFIED: in-repo grep] |
| A4 | `mountUsageCaptureMiddleware` (`livinityd/source/modules/server/index.ts:1228`) does NOT strip `X-Livinity-Mode` header | Q3 verdict | LOW. Verified by Read of `usage-tracking/capture-middleware.ts:29-60` — middleware patches `res` only, does not mutate `req.headers`. [VERIFIED] |
| A5 | `@anthropic-ai/sdk@^0.80.0` (or ^0.92.0) supports `messages.stream()` returning an iterable of canonical Anthropic SSE events (for Phase 58 — but Phase 57 only needs `finalMessage()`) | Q1 verdict + Phase 58 link | LOW. Verified at platform.claude.com/docs/en/api/messages-streaming TypeScript example. [VERIFIED: docs] |
| A6 | Existing `BROKER_FORCE_ROOT_HOME=true` env on Mini PC means single-shared-subscription mode; passthrough handler must respect it | Pattern 2 | MEDIUM. Mini PC currently runs single-user with this set (per `agent-runner-factory.ts:41-50` rationale). If passthrough doesn't honor it, single-user installs break. **Mitigation:** `credential-extractor.ts` reads same env var (Pattern 2 above). [ASSUMED — to verify with `cat /opt/livos/.env | grep BROKER_FORCE_ROOT_HOME` on Mini PC during Phase 63 UAT] |
| A7 | `Anthropic.APIError.headers['retry-after']` (lowercase) is the canonical SDK error shape for 429 | Risk 1 of Q1 | LOW. SDK normalizes header names to lowercase per Node http parser. If wrong, 429 forwarding silently drops Retry-After (clients still see 429, just no retry hint). [ASSUMED — to confirm by inspecting SDK error type during Phase 57 plan] |

**If A1 fails (subscription token rejected by upstream):** This is the largest single risk. Phase 57 plan should structure waves so live verification of A1 is the FIRST integration test (run before code freeze). If 401 returned, escalate immediately; do not proceed to wider test suite.

---

## Open Questions

1. **Should passthrough handler retry once on token-expiry 401 (auto-refresh) or surface 401 verbatim and let user re-login?**
   - What we know: refresh token + endpoint exist (verified `nexus/src/providers/claude.ts:56`).
   - What's unclear: whether retry-on-401 is a UX win or a complexity tax.
   - Recommendation: Phase 57 plan ships **single retry on 401 with refresh** — best UX, low code (~20 LOC). If refresh also fails, surface 401 with actionable message.

2. **Should `mode-dispatch.ts` log every mode resolution at debug level for first 30 days post-deploy (observability)?**
   - What we know: Existing broker logger uses `livinityd.logger.log()` for warn-and-ignore tools.
   - What's unclear: whether observability is needed (likely yes for first deploy; can be silenced later).
   - Recommendation: Plan adds an info log per request: `[livinity-broker] mode=passthrough user=<id> path=<v1/messages>` — easy to grep and silence later.

3. **Should the passthrough handler add an `anthropic-beta` header for any beta features (e.g., extended thinking, prompt caching)?**
   - What we know: Anthropic uses `anthropic-beta: feature1,feature2` header for opt-in features.
   - What's unclear: whether external clients sending body fields like `thinking: {...}` need a corresponding beta header.
   - Recommendation: Phase 57 ships WITHOUT beta header injection. If a client sends `thinking` and Anthropic rejects, surface the 400 verbatim — client adds the beta header themselves. **Defer to a future explicit "passthrough beta header pass-through" decision.**

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@anthropic-ai/sdk` | Q1 verdict (passthrough) | ✓ | `^0.80.0` (registry latest 0.92.0) | — |
| `@anthropic-ai/claude-agent-sdk` | Agent mode (sacred file) | ✓ | `^0.2.84` | — (read-only) |
| `vitest` | Wave 0 tests | ✓ | `^2.1.2` (livinityd dev-deps line 56) | — |
| `tsx` | Test runner for nexus integrity test | ✓ | `^4.7.1` | — |
| Node 22+ | Runtime | ✓ | per Mini PC + dev-deps `@types/node@^22` | — |
| `git` | Sacred-file SHA verification | ✓ | system | — |

**Missing dependencies:** None. Phase 57 is implementable with current toolchain.

---

## Sources

### Primary (HIGH confidence — verified in repo or official docs)
- `livos/packages/livinityd/source/modules/livinity-broker/router.ts` — entire file Read [VERIFIED]
- `livos/packages/livinityd/source/modules/livinity-broker/openai-router.ts` — entire file Read [VERIFIED]
- `livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts` — entire file Read [VERIFIED]
- `livos/packages/livinityd/source/modules/livinity-broker/auth.ts` — entire file Read [VERIFIED]
- `livos/packages/livinityd/source/modules/livinity-broker/index.ts` — entire file Read [VERIFIED]
- `livos/packages/livinityd/source/modules/apps/inject-ai-provider.ts` — entire file Read [VERIFIED]
- `livos/packages/livinityd/source/modules/usage-tracking/capture-middleware.ts` — lines 1-60 Read [VERIFIED]
- `livos/packages/livinityd/source/modules/server/index.ts:1215-1235` — broker mount point Read [VERIFIED]
- `nexus/packages/core/src/providers/claude.ts:1-200` — Read [VERIFIED]
- `nexus/packages/core/src/sdk-agent-runner.ts:260-300, 370-405` — Read (READ-ONLY) [VERIFIED]
- `nexus/packages/core/src/providers/sdk-agent-runner-integrity.test.ts:1-50` — Read [VERIFIED]
- `nexus/packages/core/src/api.ts:2400-2520` — agent stream handler with homeOverride [VERIFIED]
- `nexus/packages/core/src/daemon.ts:319-330` — credentials.json read pattern [VERIFIED]
- `nexus/packages/core/package.json` — dep versions [VERIFIED]
- `livos/packages/livinityd/package.json` — dep versions [VERIFIED]
- `livos/packages/ui/src/routes/ai-chat/index.tsx:25` — confirms `useAgentSocket` (NOT broker) [VERIFIED]
- `livos/packages/ui/src/hooks/use-agent-socket.ts:367` — confirms `/ws/agent` WebSocket route [VERIFIED]
- `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b` [VERIFIED via Bash]
- `npm view @anthropic-ai/sdk version` → `0.92.0` [VERIFIED]
- `npm view @anthropic-ai/claude-agent-sdk version` → `0.2.126` [VERIFIED]
- [Anthropic Messages Streaming Docs](https://platform.claude.com/docs/en/api/messages-streaming) [CITED] — SSE event sequence
- [Anthropic API Overview](https://platform.claude.com/docs/en/api/overview) [CITED] — auth headers spec
- [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages) [CITED] — body schema, tools field
- [github.com/anthropics/anthropic-sdk-typescript src/client.ts](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts) [CITED] — ClientOptions + bearerAuth() code

### Secondary (MEDIUM confidence — verified via WebSearch with credible sources)
- [Claude Code Authentication Docs](https://code.claude.com/docs/en/authentication) [CITED via WebSearch] — credentials.json structure (`claudeAiOauth.accessToken` etc.)
- [Bolt.diy GitHub Issues](https://github.com/stackblitz-labs/bolt.diy/issues/958) [CITED] — confirms ANTHROPIC_BASE_URL works for custom endpoints

### Tertiary (LOW confidence — needs validation in Phase 57 plan execution)
- A1 (subscription token = Bearer for /v1/messages) — flagged in Assumptions Log

---

## Metadata

**Confidence breakdown:**
- Architectural verdicts (Q1/Q2/Q3/Q7): HIGH — code-level integration points cited file:line; alternatives genuinely evaluated; sacred-file boundary respected throughout
- Standard stack: HIGH — all libs verified in package.json; no new deps
- Code examples: HIGH — sources cited (in-repo file:line OR official docs URL)
- Architecture pattern (mode dispatch + passthrough handler + credential extractor): HIGH structure / MEDIUM line-count estimates
- Common pitfalls: HIGH (drawn from in-repo evidence and known Express/SDK gotchas)
- Validation architecture: MEDIUM — Wave 0 tests are NEW; framework already exists
- Assumption A1 (subscription Bearer auth viability): MEDIUM — strongest single risk; plan must surface this as the first thing to verify

**Research date:** 2026-05-02
**Valid until:** 2026-06-01 (30 days; key risks: Anthropic SDK version drift, Anthropic API auth-policy changes for OAuth tokens)

**Final sacred file SHA check:** `git hash-object nexus/packages/core/src/sdk-agent-runner.ts` → `4f868d318abff71f8c8bfbcf443b2393a553018b` ✓ unchanged from start of research.
