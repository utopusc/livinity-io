# Domain Pitfalls: Claude Migration & OpenClaw Feature Integration

**Domain:** Multi-provider AI migration, subscription auth, memory integration, skill marketplace, WebSocket gateway
**Target System:** LivOS / Nexus production deployment (server4 production, server5 test)
**Researched:** 2026-02-15
**Milestone:** v1.4 Claude Migration & OpenClaw Features

---

## Critical Pitfalls

Mistakes that cause production outages, data loss, or complete feature failure.

### Pitfall 1: Gemini-to-Claude Message Role Mapping Breaks Agent Loop

**What goes wrong:** The current `ChatMessage` interface uses `role: 'user' | 'model'` (Gemini convention). Claude's Messages API uses `role: 'user' | 'assistant'`. Simply find-and-replacing `'model'` with `'assistant'` seems trivial but has deep ramifications: the entire `agent.ts` file pushes `{ role: 'model', text: responseText }` after every LLM response, and `{ role: 'user', text: observation }` for tool results. If the role mapping is incomplete or inconsistent, Claude will reject the message array with a 400 error ("messages must alternate between user and assistant roles"), crashing every agent invocation.

**Why it happens:** Gemini is lenient about consecutive same-role messages; Claude strictly enforces alternation. In the current codebase, `agent.ts` line 381 pushes `role: 'model'` for unparseable responses and line 401 for final answers, then pushes `role: 'user'` for observations. If any code path produces two consecutive `user` or `assistant` messages (e.g., tool result followed by another tool result without an assistant message in between), Claude silently rejects the entire conversation.

**Consequences:**
- All agent invocations fail with 400 errors
- No error recovery possible -- the message history is corrupted
- Production WhatsApp/Telegram/Discord bots stop responding entirely
- SSE streaming endpoint returns error events immediately

**Warning signs:**
- Agent works for single-turn but fails on multi-turn
- "messages must alternate between user and assistant roles" in error logs
- Works with simple queries but fails when tools are involved

**Prevention:**
1. Create a message normalization layer between the internal `ChatMessage[]` format and Claude's expected format. This layer merges consecutive same-role messages and handles the `model` -> `assistant` rename.
2. Add a pre-flight validation function that checks message alternation before sending to Claude API. Log and fix any violations rather than letting Claude reject them.
3. Change the `ChatMessage.role` type from `'user' | 'model'` to `'user' | 'model' | 'assistant'` and add a mapping function in the Brain class -- do NOT change the role values throughout the codebase, as that would break Gemini compatibility during the transition period.
4. Write integration tests that replay actual multi-turn agent conversations (with tool calls) against Claude's validation rules.

**Detection:** Unit test that passes a sequence of messages through the normalization layer and asserts alternation. Integration test against Claude API with `max_tokens: 1` just to validate message format.

**Phase:** Must be addressed in Phase 1 (Brain abstraction layer). This is the single most likely cause of "it works in dev, breaks in prod."

**Confidence:** HIGH -- verified against Claude API documentation at [platform.claude.com/docs/en/api/messages-streaming](https://platform.claude.com/docs/en/api/messages-streaming) and the current `agent.ts` source code.

---

### Pitfall 2: Tool Calling Format Mismatch Causes Silent Agent Failures

**What goes wrong:** The current `AgentLoop` uses a JSON-in-text approach where the LLM outputs `{"type": "tool_call", "tool": "...", "params": {...}}` as plain text, and `parseStep()` extracts it with JSON.parse and regex fallbacks. Claude's native tool calling uses a fundamentally different mechanism: you pass `tools` in the API request, and Claude returns `content` blocks with `type: "tool_use"` containing `id`, `name`, and `input` fields. You then return `tool_result` blocks in the next user message matching by `tool_use_id`.

If you continue using the text-based JSON approach with Claude, you lose: (a) guaranteed valid tool schemas, (b) parallel tool calling, (c) streaming tool input deltas, and (d) the `stop_reason: "tool_use"` signal. If you switch to native tool calling, the entire `parseStep()` mechanism and the ReAct prompt must be rewritten.

**Why it happens:** The existing architecture was designed around Gemini's lack of native tool calling support (Gemini uses FunctionDeclaration but the codebase chose to implement its own JSON-in-text protocol). Claude has mature native tool calling with `input_json_delta` streaming events, but adopting it requires restructuring both the Brain interface and the AgentLoop.

**Consequences:**
- If kept as text-based: Claude may refuse to emit raw JSON (its system prompt training discourages unstructured JSON dumps), tool calls become unreliable, no parallel tool use
- If switched to native but incompletely: Tool results missing `tool_use_id` cause 400 errors, partial JSON in streaming needs accumulation, `stop_reason` parsing changes
- Streaming tool input arrives as `input_json_delta` partial JSON strings that must be accumulated and parsed only after `content_block_stop` -- failing to do this causes parse errors

**Warning signs:**
- Claude wraps JSON in markdown code blocks despite prompt instructions
- Tool calls succeed on simple tools but fail on complex parameter schemas
- "tool_use ids were found without tool_result blocks" errors in logs

**Prevention:**
1. **Phase 1 decision: Choose one approach and commit.** Recommended: Use native Claude tool calling AND keep the text-based approach as Gemini fallback. The Brain abstraction layer should normalize both into a common `ToolCall` type.
2. Create a `ToolCallResult` interface: `{ toolCallId: string, toolName: string, input: Record<string, unknown> }` that both providers map to.
3. For Claude native tool calling, convert the existing `ToolRegistry.toJsonSchemas()` output to Claude's `input_schema` format (they're similar but Claude uses `input_schema` not `parameters`).
4. For tool results, Claude requires `{ type: "tool_result", tool_use_id: "...", content: "..." }` in the user message. The Brain layer must handle this mapping transparently.
5. Handle parallel tool calls: Claude may return multiple `tool_use` blocks in one response. The AgentLoop currently assumes one tool call per turn. This must be restructured or Claude must be instructed to use sequential calls via `disable_parallel_tool_use: true`.

**Detection:** Test with a tool that has complex nested parameters. If the schema doesn't translate correctly, the tool call will have wrong or missing fields.

**Phase:** Must be addressed in Phase 1 (Brain abstraction layer), with the AgentLoop adaptation in Phase 2.

**Confidence:** HIGH -- verified against Claude tool use documentation at [platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) and the actual `agent.ts` `parseStep()` implementation.

---

### Pitfall 3: SSE Streaming Format Change Breaks Frontend Without Warning

**What goes wrong:** The current SSE streaming endpoint (`POST /api/agent/stream`) emits `AgentEvent` objects with types like `thinking`, `chunk`, `tool_call`, `observation`, `final_answer`, `error`, `done`. These events are constructed from the Gemini stream where text arrives as continuous `chunk.text()` strings.

Claude streaming uses a completely different event model: `message_start`, `content_block_start`, `content_block_delta` (with `text_delta` or `input_json_delta` subtypes), `content_block_stop`, `message_delta`, `message_stop`. The text arrives in `delta.text` not `chunk.text()`. Tool inputs arrive as `input_json_delta` partial JSON strings, not complete objects.

If the backend switches to Claude streaming without updating the SSE event format, the frontend (LivOS UI) will receive garbled or missing data. If the event format IS changed, the frontend must be updated simultaneously or it will break.

**Why it happens:** The SSE format is an implicit API contract between the Nexus backend and the LivOS frontend. There's no versioned protocol -- the frontend simply parses `data: ${JSON.stringify(event)}` and expects specific `type` values. Changing the backend streaming without a coordinated frontend update creates a silent incompatibility.

**Consequences:**
- Frontend shows blank responses (events received but not parsed)
- Streaming progress indicators stop working
- Tool call visualization breaks
- No error shown to user -- just silence or partial text

**Warning signs:**
- Frontend console shows unknown event types
- Streaming works in API testing but not in UI
- Agent completes successfully server-side but UI shows "error" or nothing

**Prevention:**
1. **Keep the existing `AgentEvent` format as the SSE contract.** The Brain streaming layer should translate Claude's event stream into the existing `AgentEvent` types. The frontend should not need to change.
2. Map Claude events to AgentEvents:
   - `content_block_delta` with `text_delta` -> `{ type: 'chunk', data: delta.text }`
   - `content_block_start` with `tool_use` -> `{ type: 'tool_call', data: { tool, params } }` (accumulate input_json_delta first)
   - `message_stop` with accumulated text -> `{ type: 'done', data: { answer, success } }`
3. Use the Anthropic SDK's `client.messages.stream()` helper which provides `.on('text', callback)` event handler, making it easy to emit chunk events matching the current format.
4. Test streaming with a Claude API call that includes tool use to verify the full event sequence maps correctly.
5. Version the SSE event format (add an `apiVersion` field) so future changes can be detected by the frontend.

**Detection:** Side-by-side comparison: run the same task against Gemini and Claude, diff the SSE event sequences.

**Phase:** Must be addressed in Phase 1 (Brain abstraction layer) since the streaming endpoint is the primary consumer of Brain.chatStream().

**Confidence:** HIGH -- verified by reading the current `api.ts` SSE implementation (line 584-660) and Claude's streaming event format from official docs.

---

### Pitfall 4: Claude Subscription Token Expiry Causes Silent Auth Failures

**What goes wrong:** Unlike Gemini (which uses a simple API key that never expires), Claude subscription auth via `claude setup-token` creates a token with a finite lifetime. Standard OAuth tokens expire after 8-12 hours. Even `setup-token` long-lived tokens have a 1-year expiry. When the token expires, every LLM call silently fails with a 401 error. The retry logic in `Brain` treats 401 as a non-retryable error (it's not in `isRetryableError`), so the agent immediately fails without any user-facing indication of what went wrong.

**Why it happens:** The current `getGeminiClient()` pattern reads the API key from Redis (`livos:config:gemini_api_key`) and caches it. There's no concept of token refresh because API keys don't expire. When migrating to Claude subscription auth, the same pattern of "read once, cache forever" will silently fail when the token expires. GitHub issues [#12447](https://github.com/anthropics/claude-code/issues/12447) and [#19078](https://github.com/anthropics/claude-code/issues/19078) on the claude-code repo document this exact failure mode in production.

**Consequences:**
- All AI functionality stops working silently
- No user-visible error -- messages just never get responses
- Heartbeat runner, scheduled agents, and loop runners all fail simultaneously
- Token expiry can happen at 3 AM with no one monitoring

**Warning signs:**
- Sudden increase in 401 errors in logs
- All agent invocations fail simultaneously (not gradually)
- Brain.chat() and Brain.chatStream() both fail with same error
- Redis still has the token cached, but it's expired

**Prevention:**
1. **Support both auth modes:** API key (never expires, simple) and subscription token (expires, needs refresh). The Brain class should detect which mode is in use.
2. For subscription tokens, implement a token health check that runs on a timer (every 30 min) and proactively refreshes before expiry.
3. Add specific 401 handling in the retry logic: on 401, attempt token refresh once, then retry. Add `401` to the retriable error patterns but with a refresh-first strategy.
4. Store token metadata (expires_at, refresh_token) alongside the token in Redis: `nexus:config:claude_token_meta`.
5. Add a health check endpoint that verifies the token is still valid (call Claude API with `max_tokens: 1` and a trivial prompt).
6. Send a proactive notification (via Telegram/Discord/WhatsApp) when token is within 24 hours of expiry.
7. Consider defaulting to API key auth for simplicity and only using subscription auth as an opt-in feature.

**Detection:** Health check endpoint that returns token expiry time. Alert when < 24 hours remaining.

**Phase:** Phase 2 (Auth integration). Must be designed alongside the Brain abstraction but can be implemented after basic Claude support works.

**Confidence:** MEDIUM -- based on GitHub issues and community reports. The exact expiry behavior of `setup-token` vs standard OAuth is not fully documented by Anthropic; the 1-year figure comes from community sources at [claude-did-this.com](https://claude-did-this.com/claude-hub/getting-started/setup-container-guide).

---

### Pitfall 5: Memory Service Uses Gemini Embeddings -- Breaks When Gemini Key Removed

**What goes wrong:** The current memory service (`nexus/packages/memory/src/index.ts`) uses Gemini's `text-embedding-004` model for vector embeddings via a direct HTTP call to `generativelanguage.googleapis.com`. If the project migrates to Claude as primary provider and the user removes their Gemini API key, all memory operations (search and add) silently degrade to keyword-only search (no embeddings). Worse, if new memories are added without embeddings while old memories have Gemini embeddings, the vector similarity search returns inconsistent results -- new memories never match.

**Why it happens:** The memory service was built with a hard dependency on Gemini embeddings. The `getEmbedding()` function only knows how to call Gemini. Claude does not offer an embedding model. This creates a hidden dependency on Gemini even after "full migration" to Claude.

**Consequences:**
- Memory search quality degrades silently (no error, just bad results)
- Users think memory is working but it's returning keyword matches only
- Mixed embedding sources (some Gemini, some none) in the same database make similarity scores meaningless
- If someone later adds a different embedding provider, existing embeddings are incompatible (different vector dimensions, different semantic spaces)

**Warning signs:**
- Memory search returns irrelevant results
- `[Memory] No Gemini API key available for embeddings` in logs (currently just a warning, not an error)
- Memory add succeeds but `embedding` column is NULL in SQLite

**Prevention:**
1. **Keep Gemini API key for embeddings even after Claude migration.** Embeddings are cheap ($0.00 per 1M tokens for text-embedding-004) and there's no reason to remove this dependency.
2. If Gemini key must be removed, integrate an alternative embedding provider (e.g., local sentence-transformers, OpenAI text-embedding-3-small, or Cohere embed-v3). Add this as a configurable option.
3. Add a startup health check that verifies embedding generation works. If not, log an ERROR (not warning) and disable vector search entirely rather than returning inconsistent results.
4. If changing embedding models, re-embed all existing memories on migration. Do NOT mix embeddings from different models in the same database.
5. Store the embedding model name alongside each memory so the system knows which memories need re-embedding.

**Detection:** Startup check that attempts to generate one embedding. Alert if it fails.

**Phase:** Phase 3 (Memory integration). Must be designed in Phase 1 but implemented when hybrid memory is added.

**Confidence:** HIGH -- verified by reading `nexus/packages/memory/src/index.ts` line 79-100 which contains the hard-coded Gemini embedding call.

---

## Moderate Pitfalls

Mistakes that cause significant delays, degraded experience, or technical debt.

### Pitfall 6: Leaky Multi-Provider Abstraction (Lowest Common Denominator)

**What goes wrong:** When building a Brain abstraction layer that supports both Gemini and Claude, there's strong temptation to create a lowest-common-denominator interface that only exposes features both providers support. This means losing:
- Claude's native tool calling (Gemini doesn't use it in this codebase)
- Claude's extended thinking (budget_tokens, thinking blocks)
- Claude's parallel tool use
- Claude's `stop_reason` semantic signals (`end_turn`, `tool_use`, `max_tokens`, `pause_turn`)
- Claude's content block structure (multiple text + tool_use blocks in one response)
- Claude's prompt caching
- Gemini's inline vision with `inlineData` (Claude uses different image format)

The abstraction becomes a straitjacket that prevents using the best features of either provider.

**Why it happens:** Clean abstraction design favors symmetry. When providers have different capabilities, the natural instinct is to hide the differences behind a uniform interface. But AI providers are NOT interchangeable -- their strengths and interaction patterns differ fundamentally. As noted in [ProxAI's analysis](https://www.proxai.co/blog/archive/llm-abstraction-layer), "every time a provider updates its API, an internal wrapper must be updated too" and the maintenance burden grows exponentially.

**Consequences:**
- Can't use Claude's superior tool calling
- Can't use extended thinking when it would help
- Performance degrades because provider-specific optimizations are unavailable
- Every new Claude/Gemini feature requires changes to the abstraction layer

**Prevention:**
1. **Use a "capability-based" abstraction, not a "uniform" abstraction.** Define a core interface (chat, stream, think) but allow provider-specific extensions via an `options` bag.
2. Design pattern: `Brain.chat(options)` has a `providerOptions?: Record<string, unknown>` field where Claude-specific options (extended thinking, tool choice, cache control) can be passed without polluting the generic interface.
3. **Do NOT abstract tool calling.** Let each provider handle tools in its native format. The AgentLoop should call `brain.chatWithTools()` which returns a normalized `ToolCallResult[]`, but the internal mechanism differs per provider.
4. Accept that switching providers mid-conversation is NOT a goal. The provider is chosen at agent startup and stays fixed for the session.
5. Start with a thin wrapper, not a thick one. Add abstraction only where both providers genuinely share behavior.

**Detection:** Review the abstraction interface. If it has zero provider-specific options, it's too thin. If it has a `provider: 'claude' | 'gemini'` switch in every method, it's too thick.

**Phase:** Phase 1 (Brain abstraction). This is a design decision, not an implementation bug.

**Confidence:** HIGH -- based on established software engineering principles and real-world multi-provider abstraction failures documented by [Ably](https://ably.com/topic/websocket-architecture-best-practices) and [ProxAI](https://www.proxai.co/blog/archive/llm-abstraction-layer).

---

### Pitfall 7: AgentLoop ReAct Prompt Assumes Text-Only Response Format

**What goes wrong:** The current `AGENT_SYSTEM_PROMPT` in `agent.ts` instructs the LLM to respond in one of two JSON formats: `{"type": "tool_call", ...}` or `{"type": "final_answer", ...}`. This is parsed by `parseStep()` which expects the entire LLM response to be a single JSON object.

If Claude is used with native tool calling enabled, the response contains `content` blocks (text + tool_use), NOT a single JSON string. The `parseStep()` method will either (a) fail to parse the response and treat it as a free-form final answer, or (b) parse the text portion but miss the tool_use blocks entirely. Either way, tool calls are lost.

If Claude is used WITHOUT native tool calling (text-only mode), it can follow the JSON protocol, but Claude's training makes it more likely to add explanatory text around the JSON, wrap it in markdown code blocks, or produce other formatting that breaks `parseStep()`.

**Why it happens:** The ReAct pattern implemented in `agent.ts` was designed for Gemini, which readily emits raw JSON when instructed. Claude models, especially Opus and Sonnet, tend to be more "chatty" and may add context around their JSON output. The `parseStep()` regex fallbacks help but are fragile.

**Prevention:**
1. **For Claude with native tool calling:** Remove the JSON-in-text protocol entirely. Instead, check `response.stop_reason === 'tool_use'` and extract tool calls from `content` blocks of type `tool_use`. The "thought" is the text block that precedes the tool_use block.
2. **For Claude without native tool calling (fallback):** Strengthen the system prompt with Claude-specific instructions: use `<tool_call>` XML tags instead of JSON (Claude is better at structured XML), or use `tool_choice: {"type": "any"}` to force tool use when appropriate.
3. **For the transition period:** Support both parsing modes. If the response contains native tool_use blocks, use those. Otherwise, fall back to `parseStep()`.
4. Consider using Claude's `stop_reason` to drive the agent loop instead of parsing response text. When `stop_reason === 'tool_use'`, execute tools. When `stop_reason === 'end_turn'`, extract the final answer from text blocks.

**Detection:** Run the agent with a task that requires tool use. If the first tool call fails to parse, the prompt format is incompatible.

**Phase:** Phase 2 (AgentLoop adaptation). Depends on the Brain abstraction from Phase 1.

**Confidence:** HIGH -- verified by reading the Claude streaming response examples which show `stop_reason: "tool_use"` and `content_block_start` with `type: "tool_use"` structure, contrasted with the current `parseStep()` implementation.

---

### Pitfall 8: Conversation History Format Incompatible Between Providers

**What goes wrong:** The `SessionManager` stores conversation history as `ChatMessage[]` with `role: 'user' | 'model'` and a simple `text` string. When the user switches providers (or when the system is migrated), existing conversation history cannot be replayed to Claude because:
1. Role `'model'` must become `'assistant'`
2. Claude requires `content` (array of content blocks), not `text` (string)
3. Tool use history must include `tool_use_id` for Claude, which was never stored
4. Images use different formats (Gemini: `inlineData`, Claude: base64 `source` blocks)

Old conversations stored in Redis/sessions become unusable, and replaying them to Claude produces 400 errors.

**Why it happens:** The conversation history format was designed for Gemini. No serialization format was chosen with provider-independence in mind.

**Consequences:**
- Context loss on provider switch (agent "forgets" everything)
- Session continuity breaks during migration
- If history is blindly passed to Claude, API errors crash the agent

**Prevention:**
1. Define a provider-neutral conversation format NOW (before migration starts). Use `role: 'user' | 'assistant'` (Claude's convention, which is more standard), `content: string | ContentBlock[]`, and include tool metadata.
2. Write a one-time migration script that converts existing Redis session data from Gemini format to the neutral format.
3. In the Brain abstraction, convert from neutral format to provider-specific format just before the API call. This keeps storage provider-independent.
4. For the transition period, add a `format_version` field to stored sessions so the system can detect and convert old formats.

**Detection:** Load an existing session from Redis and attempt to pass it to Claude -- if it fails, format migration is needed.

**Phase:** Phase 1 (Brain abstraction). The neutral format must be defined before any Claude integration.

**Confidence:** HIGH -- verified by examining `ChatMessage` interface in `brain.ts` and Claude's message format requirements.

---

### Pitfall 9: WebSocket Agent Endpoint Lacks Authentication

**What goes wrong:** The current WebSocket endpoint (`/ws/agent`) in `api.ts` has NO authentication. Any client that can connect to the WebSocket can execute arbitrary agent tasks with full tool access (shell commands, file operations, Docker management). This is already a security issue with Gemini, but it becomes worse when expanding to multiple channels and adding a WebSocket gateway.

**Why it happens:** The REST API uses `requireApiKey` middleware, but the WebSocket connection setup in `setupWebSocket()` (line 667-723) performs no authentication check. The `ws.on('message')` handler directly creates an `AgentLoop` with full tool access.

**Consequences:**
- Unauthenticated remote code execution via `shell` tool
- Docker container manipulation
- File system read/write
- Memory access (read stored user data)

**Warning signs:**
- WebSocket connections from unknown IPs in logs
- Unexpected agent executions

**Prevention:**
1. **Add authentication to WebSocket.** Require either:
   - API key in the WebSocket upgrade request (query param or header): `ws://host:3200/ws/agent?apiKey=XXX`
   - JWT token validation on connection
   - First message must be an auth message before any agent messages are accepted
2. Rate limit WebSocket connections per IP.
3. Add connection logging with source IP.
4. Consider restricting WebSocket to localhost only (it's currently only used by the LivOS frontend on the same server).

**Detection:** Attempt to connect to `/ws/agent` without credentials from an external network.

**Phase:** Phase 3 (WebSocket gateway). Must be addressed before any public-facing WebSocket functionality.

**Confidence:** HIGH -- verified by reading `api.ts` line 667-723 which shows no auth check.

---

### Pitfall 10: Skill Marketplace Security -- Arbitrary Code Execution Risk

**What goes wrong:** The current `SkillLoader` dynamically imports JavaScript/TypeScript files from the `skills/` directory using `import()`. If a skill marketplace is added where users can install third-party skills, those skills will execute with the same Node.js process permissions as Nexus core -- meaning full filesystem access, network access, and access to all registered tools, Redis, and the Brain instance.

**Why it happens:** Skills receive a `SkillContext` that includes `redis`, `brain`, and `onAction` -- essentially unlimited access to the entire Nexus system. There's no sandboxing, capability restriction, or permission model.

**Consequences:**
- Malicious skill steals API keys from Redis or environment
- Skill exfiltrates conversation history
- Skill installs backdoor (writes to filesystem, adds cron job)
- Skill crashes entire Nexus process via unhandled exception or infinite loop
- Supply chain attack via skill dependency

**Prevention:**
1. **Do NOT allow arbitrary skill installation from untrusted sources in v1.4.** Start with a curated gallery only.
2. For marketplace skills, implement a review process before listing.
3. Consider running marketplace skills in isolated contexts:
   - Separate Node.js worker threads with limited APIs
   - Docker containers for untrusted skills
   - vm2/isolated-vm for lightweight sandboxing (though these have known escapes)
4. Implement a capability system: skills declare what they need (e.g., `needs: ['redis:read', 'brain:chat']`) and are only given those capabilities.
5. Add resource limits: timeout per skill execution, memory limits, network restrictions.
6. Version pin skills and verify checksums on load.
7. Skills should receive a SCOPED Redis client (restricted to `nexus:skills:{skillName}:*` keyspace) instead of the full Redis connection.

**Detection:** Code review of skill source. Audit `import()` paths. Monitor network connections from the Nexus process.

**Phase:** Phase 5 (Skill marketplace). This is a design-time decision that must be made early even if implementation is deferred.

**Confidence:** HIGH -- the arbitrary code execution risk is self-evident from reading `skill-loader.ts`.

---

### Pitfall 11: Token Budget Mismatch Between Gemini and Claude

**What goes wrong:** The current `AgentLoop` has `maxTokens: 200000` (200K) as the default token budget and sends `maxOutputTokens: 2048` per turn to Gemini. Claude models have different context window sizes and pricing:
- Claude 3.5 Haiku: 200K context, but much more expensive per token than Gemini Flash
- Claude Sonnet 4: 200K context
- Claude Opus 4: 200K context but extremely expensive

Running the same 200K token budget with Claude Opus could cost $60+ per agent session (at ~$15/MTok input + $75/MTok output). The tier mapping (`flash` -> cheap, `sonnet` -> mid, `opus` -> expensive) has completely different cost implications with Claude.

**Why it happens:** The tier system was designed with Gemini pricing in mind, where `flash` and `sonnet` both map to `gemini-3-flash-preview` (cheap) and `opus` maps to `gemini-3-pro-preview` (moderate). With Claude, each tier is a genuinely different model with 10-50x cost differences.

**Consequences:**
- Unexpectedly high API costs
- Token budget runs out faster with Claude's more verbose responses
- `maxOutputTokens: 2048` is too low for Claude's structured responses (tool use blocks + text)
- Users hit rate limits faster on Claude (lower default rate limits than Gemini)

**Prevention:**
1. Create provider-specific token budget defaults. Claude should have lower `maxTokens` defaults to control costs.
2. Increase `maxOutputTokens` per turn from 2048 to at least 4096 for Claude -- tool use responses with JSON input tend to be longer.
3. Add cost tracking per provider. Log estimated cost per agent session.
4. Add configurable cost limits: `maxCostPerSession` alongside `maxTokens`.
5. Review the tier mapping: Does `sonnet` mean "mid-tier" (Gemini Flash) or "capable" (Claude Sonnet 4)? Make tier semantics consistent.
6. Consider using Claude Haiku as default tier instead of Sonnet to control costs.

**Detection:** Monitor token usage and estimated costs in the first week after migration.

**Phase:** Phase 1 (Brain abstraction). Token/cost defaults must be provider-specific from the start.

**Confidence:** MEDIUM -- pricing may change. Current estimates based on published Anthropic pricing as of early 2025 training data.

---

### Pitfall 12: Daemon Response Routing Assumes Single Channel per Message

**What goes wrong:** The current `Daemon.processInboxItem()` sets `this.currentChannelContext` per message and routes the response back to that channel. When expanding to WebSocket gateway and more channels, race conditions emerge: if two messages arrive simultaneously from different channels (Telegram and Discord), `this.currentChannelContext` gets overwritten by the second message before the first message's response is sent. The first message's response goes to the wrong channel.

**Why it happens:** `currentChannelContext` and `currentWhatsAppJid` are instance variables on the Daemon class, not per-request state. The `processInboxItem()` method is async and can be called concurrently (via `addToInbox` -> immediate processing for realtime sources).

**Consequences:**
- Responses sent to wrong channel
- User on Telegram receives response meant for Discord user
- WhatsApp JID routing goes to wrong conversation
- Intermittent, hard to reproduce (race condition)

**Warning signs:**
- Users report receiving responses to questions they didn't ask
- Cross-channel message leakage
- Bug appears under load but not in testing

**Prevention:**
1. **Pass channel context as a parameter through the processing chain**, not as instance state. Each `InboxItem` already has `source` and `from` -- use these directly in `sendChannelResponse()` instead of `this.currentChannelContext`.
2. Make `processInboxItem()` fully self-contained: all context needed for response routing must come from the `item` parameter.
3. Remove `this.currentWhatsAppJid` and `this.currentChannelContext` instance variables.
4. If shared mutable state is truly needed (e.g., for the `progress_report` tool), use AsyncLocalStorage or pass context through the tool execution chain.

**Detection:** Load test with simultaneous messages from different channels. Check response routing correctness.

**Phase:** Phase 3 (Channel expansion / WebSocket gateway). Must be fixed before adding more concurrent channels.

**Confidence:** HIGH -- the race condition is visible in the source code: `processInboxItem` is called from both the polling loop and `addToInbox` immediate path.

---

## Minor Pitfalls

Mistakes that cause annoyance, degraded DX, or fixable issues.

### Pitfall 13: Anthropic SDK Already Installed But Unused

**What goes wrong:** The `@anthropic-ai/sdk@0.39.0` is already in `package.json` but not imported anywhere in the source code. When someone starts implementing Claude support, they may install a different version or import it incorrectly. The existing version (0.39.0) may not support the latest Claude features (the current SDK version is likely 0.40+).

**Prevention:**
1. Check the latest Anthropic SDK version before starting implementation. Update if needed.
2. Use the SDK's built-in streaming helpers (`client.messages.stream()`) rather than raw HTTP streaming.
3. The Anthropic SDK uses `import Anthropic from '@anthropic-ai/sdk'` (default export), not named exports like ioredis.

**Phase:** Phase 1. Quick check at start of implementation.

**Confidence:** HIGH -- verified in package.json.

---

### Pitfall 14: Gemini Model Names Hardcoded as Preview Versions

**What goes wrong:** The `GEMINI_MODELS` mapping in `brain.ts` uses `gemini-3-flash-preview` and `gemini-3-pro-preview`. These are preview model names that may be deprecated or renamed by Google. If Gemini support must be maintained alongside Claude, hardcoded preview model names will eventually break.

**Prevention:**
1. Move model names to configuration (Redis or config file) so they can be updated without code changes.
2. Add model name validation on startup -- call Gemini's models.list endpoint to verify configured models exist.

**Phase:** Phase 1 (Brain abstraction). Make model names configurable as part of the provider configuration.

**Confidence:** MEDIUM -- preview model names are inherently unstable, but timing of deprecation is unknown.

---

### Pitfall 15: Missing Error Type Distinction for Claude API Errors

**What goes wrong:** The current error handling in `agent.ts` and `brain.ts` uses pattern matching on error messages (`/rate.?limit/i`, `/429/i`, etc.) to detect retryable errors. Claude's Anthropic SDK throws typed errors (`APIError`, `AuthenticationError`, `RateLimitError`, `InternalServerError`) that should be caught by type, not by message string matching.

**Prevention:**
1. Import Anthropic error types: `import { APIError, RateLimitError, AuthenticationError } from '@anthropic-ai/sdk'`
2. Add type-based error detection alongside the existing string-based detection:
   ```typescript
   if (err instanceof RateLimitError) return true;
   if (err instanceof APIError && err.status >= 500) return true;
   ```
3. Handle Claude-specific errors: `overloaded_error` (529 equivalent), `api_error` (500), `authentication_error` (401).

**Phase:** Phase 1 (Brain abstraction). Implement alongside the Claude provider.

**Confidence:** HIGH -- verified from Claude SDK source in the installed `@anthropic-ai/sdk@0.39.0`.

---

### Pitfall 16: Image/Vision Format Differences Between Providers

**What goes wrong:** The current `ChatMessage.images` field uses `{ base64: string, mimeType: string }` which maps directly to Gemini's `inlineData` format. Claude expects images in a different format:
```json
{
  "type": "image",
  "source": {
    "type": "base64",
    "media_type": "image/jpeg",
    "data": "<base64>"
  }
}
```

If vision support (used for browser screenshots via Playwright MCP) is not properly translated, Claude will reject messages containing images.

**Prevention:**
1. Add an image format conversion function in the Brain abstraction layer.
2. Test with the existing browser screenshot functionality to verify images are correctly passed to Claude.
3. Note that Claude supports `image/jpeg`, `image/png`, `image/gif`, and `image/webp` -- verify the browser screenshots use a supported format.

**Phase:** Phase 1 (Brain abstraction). Must be included in the message format translation.

**Confidence:** HIGH -- format difference is documented in both APIs.

---

### Pitfall 17: Parallel Agent Execution Without Resource Isolation

**What goes wrong:** When expanding to parallel agent execution (multiple agent loops running simultaneously for different users/channels), all agents share the same `ToolRegistry`, `Brain`, and Redis connection. Issues:
- Shell tool executions from different agents can interfere (cwd conflicts)
- Docker operations from concurrent agents can conflict
- Token budget is tracked per-agent but API rate limits are global per-account
- Redis state mutations from concurrent agents can corrupt shared data

**Prevention:**
1. Create per-agent resource scopes: each agent gets a scoped `ToolRegistry` (already supported via `createScopedRegistry()`).
2. Implement global rate limiting at the Brain level, not per-agent.
3. Use Redis key prefixes per agent session to prevent state conflicts.
4. Add a semaphore for mutually-exclusive tools (shell, docker) to prevent concurrent conflicting operations.
5. Track API usage globally and distribute budget across concurrent agents.

**Phase:** Phase 4 (Parallel execution). Design the isolation model early.

**Confidence:** MEDIUM -- the existing system rarely runs concurrent agents, so this is theoretical until parallel execution is implemented.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation | Pitfall # |
|-------------|---------------|------------|-----------|
| Brain abstraction layer | Lowest-common-denominator abstraction | Capability-based design, not uniform | 6 |
| Brain abstraction layer | Message role mapping breaks | Normalization layer with validation | 1 |
| Brain abstraction layer | Streaming format breaks frontend | Keep existing AgentEvent contract | 3 |
| Brain abstraction layer | Token budget mismatch | Provider-specific defaults | 11 |
| AgentLoop adaptation | Tool calling format mismatch | Dual-mode: native + text fallback | 2 |
| AgentLoop adaptation | ReAct prompt incompatible | Provider-specific prompts | 7 |
| Auth integration | Token expiry silent failures | Health check + proactive refresh | 4 |
| Memory integration | Embedding provider dependency | Keep Gemini for embeddings or add alternative | 5 |
| Channel expansion | Response routing race condition | Per-request context, not instance state | 12 |
| WebSocket gateway | No authentication | Add auth to WS upgrade | 9 |
| Skill marketplace | Arbitrary code execution | Sandboxing + capability model | 10 |
| Parallel execution | Resource contention | Per-agent scoping + global rate limits | 17 |

---

## Sources

**Official Documentation (HIGH confidence):**
- [Claude Messages API Streaming](https://platform.claude.com/docs/en/api/messages-streaming) -- streaming event types, tool_use in streaming
- [Claude Tool Use Implementation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) -- tool definition format, tool_result format, parallel tool use
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) -- SDK patterns, error types

**Codebase Analysis (HIGH confidence):**
- `nexus/packages/core/src/brain.ts` -- Current Gemini-specific implementation
- `nexus/packages/core/src/agent.ts` -- AgentLoop, parseStep(), ReAct prompt
- `nexus/packages/core/src/api.ts` -- SSE streaming, WebSocket endpoint (no auth)
- `nexus/packages/core/src/daemon.ts` -- Message routing, channel context race condition
- `nexus/packages/memory/src/index.ts` -- Gemini embedding dependency

**Community Reports (MEDIUM confidence):**
- [Claude Code OAuth token expiration issue #12447](https://github.com/anthropics/claude-code/issues/12447) -- Token expiry in autonomous workflows
- [Claude Code OAuth expired immediately #19078](https://github.com/anthropics/claude-code/issues/19078) -- Token expiry after fresh login
- [Claude Did This - Setup Container Auth](https://claude-did-this.com/claude-hub/getting-started/setup-container-guide) -- setup-token documentation

**Architecture Guidance (MEDIUM confidence):**
- [ProxAI - LLM Abstraction Layer](https://www.proxai.co/blog/archive/llm-abstraction-layer) -- Multi-provider abstraction pitfalls
- [Ably - WebSocket Architecture Best Practices](https://ably.com/topic/websocket-architecture-best-practices) -- Connection management, state sync
