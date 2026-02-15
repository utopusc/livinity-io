# Technology Stack: Claude Migration & OpenClaw Feature Integration

**Project:** LivOS Nexus AI Provider Migration + Feature Expansion
**Researched:** 2026-02-15
**Overall confidence:** HIGH (verified against official docs, npm registry, existing codebase, and multiple web sources)

---

## Critical Discovery: Claude Subscription Auth is Blocked for Third-Party Tools

Anthropic deployed strict technical safeguards in January 2026 blocking `sk-ant-oat01-*` OAuth tokens (from `claude setup-token`) from working outside their official Claude Code CLI. Third-party tools that spoofed the Claude Code client identity were shut down. The error message: "This credential is only authorized for use with Claude Code and cannot be used for other API requests."

**Impact on LivOS:**
- The original plan to use `claude setup-token` for subscription-based auth is **NOT VIABLE**
- LivOS must use standard Anthropic API keys (`sk-ant-api03-*` format) from console.anthropic.com
- Alternative: OpenRouter provides unified access to Claude + 400 other models via a single API key with OpenAI-compatible endpoints

**Recommendation:** Use standard Anthropic API key auth as primary. Add OpenRouter as optional multi-provider gateway for users who want cost optimization or provider diversity. Do NOT attempt to use subscription OAuth tokens.

**Confidence:** HIGH -- verified via [GitHub Issue #18340](https://github.com/anthropics/claude-code/issues/18340), [Anthropic blocks article](https://ai-checker.webcoda.com.au/articles/anthropic-blocks-claude-code-subscriptions-third-party-tools-2026), and multiple January 2026 reports.

---

## Recommended Stack

### 1. Core AI Provider: @anthropic-ai/sdk

| Property | Value | Rationale |
|----------|-------|-----------|
| Package | `@anthropic-ai/sdk` | Official Anthropic TypeScript SDK |
| Current installed | `0.39.0` | Already in package.json at `^0.39.0` |
| Upgrade to | `^0.74.0` | Latest as of 2026-02-15, adds MCP helpers, Zod tool support, structured outputs |
| Auth | Standard API key (`ANTHROPIC_API_KEY`) | OAuth tokens blocked for third-party use |

**Why upgrade from 0.39.0 to 0.74.0:**
- Native MCP tool helpers (`mcpTools()`, `mcpMessages()`) from `@anthropic-ai/sdk/helpers/beta/mcp`
- Zod-based tool definitions (`betaZodTool`) for type-safe structured tool calling
- Structured outputs with `strict: true` -- guaranteed JSON schema compliance
- `messages.stream()` helper with event emitters (`.on('text', ...)`, `.on('contentBlock', ...)`)
- Message batches API for background processing
- Built-in token counting (`message.usage.input_tokens`, `message.usage.output_tokens`)

**Key API mapping (Gemini -> Claude):**

| Gemini Pattern | Claude Equivalent |
|----------------|-------------------|
| `new GoogleGenerativeAI(key)` | `new Anthropic({ apiKey: key })` |
| `model.generateContent()` | `client.messages.create()` |
| `model.generateContentStream()` | `client.messages.create({ stream: true })` or `client.messages.stream()` |
| `systemInstruction: prompt` | `system: prompt` (top-level param) |
| `role: 'model'` | `role: 'assistant'` |
| `parts: [{ text }]` | `content: text` or `content: [{ type: 'text', text }]` |
| `parts: [{ inlineData: { data, mimeType } }]` | `content: [{ type: 'image', source: { type: 'base64', media_type, data } }]` |
| `usageMetadata.promptTokenCount` | `message.usage.input_tokens` |
| `usageMetadata.candidatesTokenCount` | `message.usage.output_tokens` |

**Claude model tier mapping (replacing GEMINI_MODELS):**

```typescript
const CLAUDE_MODELS: Record<string, string> = {
  flash: 'claude-haiku-4-5',        // $1/$5 per MTok -- fast, cheap
  haiku: 'claude-haiku-4-5',        // Same as flash for cost optimization
  sonnet: 'claude-sonnet-4-5',      // $3/$15 per MTok -- balanced
  opus: 'claude-opus-4-6',          // $5/$25 per MTok -- most capable
};
```

**Confidence:** HIGH -- verified via [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview), [SDK GitHub](https://github.com/anthropics/anthropic-sdk-typescript), [npm registry](https://www.npmjs.com/package/@anthropic-ai/sdk).

---

### 2. Native Tool Calling (Replacing Custom JSON Parsing)

**Current approach (agent.ts):** The AgentLoop asks Gemini to output JSON with `type: "tool_call"` or `type: "final_answer"`, then parses it with regex fallbacks when JSON is malformed. This is fragile -- see `parseStep()` with 3 fallback strategies.

**Claude's native approach:** Claude has first-class tool calling via the `tools` parameter. The model returns structured `tool_use` content blocks with guaranteed JSON schema compliance when `strict: true` is set.

**Recommendation:** Migrate from custom JSON parsing to Claude's native tool calling. This eliminates the entire `parseStep()` method and its regex fallbacks.

**Native tool calling pattern:**

```typescript
const response = await client.messages.create({
  model: 'claude-sonnet-4-5',
  max_tokens: 4096,
  system: systemPrompt,
  messages: conversationHistory,
  tools: toolRegistry.toClaudeTools(), // New method needed
  tool_choice: { type: 'auto' },
});

// Response content blocks are typed:
for (const block of response.content) {
  if (block.type === 'text') {
    // Model's thinking/response text
  } else if (block.type === 'tool_use') {
    // block.name = tool name
    // block.input = params (already parsed, schema-validated)
    // block.id = tool_use_id (needed for tool_result)
  }
}
```

**Tool result format (feed back to model):**

```typescript
messages.push({
  role: 'user',
  content: [{
    type: 'tool_result',
    tool_use_id: block.id,
    content: toolResult.output,
    is_error: !toolResult.success,
  }],
});
```

**Impact on ToolRegistry:** Add a `toClaudeTools()` method that converts the existing `Tool[]` format to Claude's tool schema format:

```typescript
toClaudeTools(): Anthropic.Tool[] {
  return this.listAll().map(t => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        t.parameters.map(p => [p.name, {
          type: p.type,
          description: p.description,
          enum: p.enum,
        }])
      ),
      required: t.parameters.filter(p => p.required).map(p => p.name),
    },
  }));
}
```

**Confidence:** HIGH -- verified via [Anthropic tool use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) and [SDK README](https://github.com/anthropics/anthropic-sdk-typescript).

---

### 3. Multi-Provider Support: Provider Abstraction Layer

**Recommendation:** Do NOT add Vercel AI SDK or LangChain. Build a thin provider abstraction within the existing Brain class.

**Why not Vercel AI SDK:**
- LivOS has a custom ReAct loop (AgentLoop) with specific streaming, tool-calling, subagent, and skill integration patterns
- Vercel AI SDK would require rewriting the entire agent architecture to use their `generateText`/`streamText` abstractions
- The overhead of learning and maintaining a framework abstraction is not justified for 2-3 providers
- LivOS's agent loop is already well-tested and battle-hardened

**Why not LangChain:**
- Heavy dependency tree, opinionated abstractions
- LivOS already has its own tool registry, agent loop, and skill system
- Would create a parallel abstraction layer that conflicts with existing patterns

**Recommended approach:** Create a `ModelProvider` interface within Brain:

```typescript
interface ModelProvider {
  id: string;
  chat(options: ChatOptions): Promise<ChatResult>;
  chatStream(options: ChatOptions): ChatStreamResult;
  supportsVision: boolean;
  supportsToolCalling: boolean;
  models: Record<string, string>;
}
```

Three implementations:
1. `ClaudeProvider` -- primary, using `@anthropic-ai/sdk`
2. `GeminiProvider` -- fallback, using existing `@google/generative-ai` code
3. `OpenRouterProvider` -- optional, for multi-model access via OpenAI-compatible API

**OpenRouter integration (optional, add later):**

| Property | Value | Rationale |
|----------|-------|-----------|
| Package | `openai` | OpenRouter uses OpenAI-compatible API |
| Version | `^6.22.0` | Latest, well-maintained |
| Base URL | `https://openrouter.ai/api/v1` | Override in OpenAI client constructor |
| Auth | `OPENROUTER_API_KEY` | Single key for 400+ models |

```typescript
import OpenAI from 'openai';

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});
```

**Phase recommendation:** Implement Claude provider first. Keep Gemini as fallback. Add OpenRouter in a later phase if users request multi-model support.

**Confidence:** HIGH for provider abstraction approach. MEDIUM for OpenRouter (not verified hands-on, but API compatibility is well-documented).

---

### 4. Hybrid Memory System Enhancement

**Current state:** Memory service exists at `nexus/packages/memory/` using SQLite + Gemini embeddings with cosine similarity search. This is a solid foundation.

**What to add (inspired by OpenClaw):**

#### 4a. Session Memory (Redis-based, already exists)

The existing `SessionManager` handles session state and conversation history in Redis. **No changes needed** for session-level memory.

#### 4b. Long-term Memory (SQLite, already exists)

The existing `@nexus/memory` service with SQLite + embeddings covers this. **Enhancement needed:**

| Enhancement | Library | Version | Purpose |
|-------------|---------|---------|---------|
| Vector search | `sqlite-vec` | `^0.1.7` | Native SQLite vector extension, replaces manual cosine similarity |
| Hybrid search | (built-in FTS5) | N/A | SQLite FTS5 for BM25 keyword search alongside vector similarity |

**sqlite-vec integration with existing better-sqlite3:**

```typescript
import * as sqliteVec from 'sqlite-vec';

// Load extension into existing better-sqlite3 connection
sqliteVec.load(db);

// Create vector table
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
    embedding float[768]
  );
`);
```

**Why sqlite-vec over pgvector:** LivOS memory is a self-contained microservice using SQLite. Moving to PostgreSQL for vector search would mean refactoring the entire memory service. sqlite-vec provides native vector search within the existing SQLite setup, which is simpler and aligned with the "local-first" philosophy. OpenClaw uses the same approach.

**Why not a separate vector database (Pinecone, Weaviate, Milvus):** Self-hosted requirement. Adding another database container increases complexity for minimal gain at LivOS's scale (single-user, thousands of memories, not millions).

#### 4c. Knowledge Graph (Future Phase)

| Enhancement | Library | Version | Purpose |
|-------------|---------|---------|---------|
| Temporal knowledge graph | `graphiti` (via MCP) | Latest | Entities, relationships, temporal facts |

**Recommendation:** Do NOT add Graphiti in the initial migration. It requires Neo4j or FalkorDB as a graph database backend, which adds significant infrastructure complexity. Instead:
1. First: Enhance SQLite memory with sqlite-vec + FTS5 hybrid search
2. Later: Evaluate Graphiti MCP server as an optional add-on for users who want knowledge graph capabilities

**OpenClaw's approach for reference:** OpenClaw uses plain Markdown files as memory source of truth with hybrid search (70% vector, 30% BM25). Their memory architecture is simpler than it appears -- the graph layer is a community extension, not core.

**Confidence:** HIGH for sqlite-vec approach (verified via [sqlite-vec docs](https://alexgarcia.xyz/sqlite-vec/js.html) and [OpenClaw memory docs](https://docs.openclaw.ai/concepts/memory)). LOW for Graphiti integration (Python-native, Node.js support via MCP only).

---

### 5. Channel System Expansion

**Current channels:** Telegram (`grammy`), Discord (`discord.js`), WhatsApp (custom Redis bridge)

**New channels to add:**

#### 5a. Slack

| Property | Value | Rationale |
|----------|-------|-----------|
| Package | `@slack/bolt` | Already in package.json at `^4.0.0` |
| Upgrade to | `^4.6.0` | Latest stable |
| Pattern | Socket Mode | No public URL needed, ideal for self-hosted |

**Already installed.** The dependency is in package.json but no Slack channel provider exists yet. Create `channels/slack.ts` implementing the existing `ChannelProvider` interface.

**Implementation complexity:** LOW -- the `ChannelProvider` interface is well-defined, and `@slack/bolt` Socket Mode matches the pattern of Telegram/Discord (persistent connection, event-driven messages).

#### 5b. Matrix

| Property | Value | Rationale |
|----------|-------|-----------|
| Package | `matrix-js-sdk` | Official Matrix.org SDK |
| Version | `^40.2.0` | Latest, actively maintained |
| Pattern | Sync loop | Matrix uses long-polling sync, similar to Telegram |

**New dependency required.** Matrix is the most requested self-hosted chat protocol for privacy-focused users. It aligns perfectly with LivOS's self-hosted philosophy.

**Implementation complexity:** MEDIUM -- Matrix SDK is larger and more complex than grammy/discord.js. The sync loop pattern is different from WebSocket-based channels.

#### 5c. Line (already in package.json)

| Property | Value | Rationale |
|----------|-------|-----------|
| Package | `@line/bot-sdk` | Already at `^9.0.0` |
| Pattern | Webhook | Requires public URL for webhook delivery |

**Already installed** but no provider implemented. Lower priority than Slack/Matrix since Line is primarily used in Japan/Thailand.

**Channel type expansion:**

```typescript
// Current
export type ChannelId = 'telegram' | 'discord';

// Expanded
export type ChannelId = 'telegram' | 'discord' | 'slack' | 'matrix' | 'line' | 'whatsapp';
```

**WhatsApp promotion:** WhatsApp currently uses a custom Redis-bridge approach (not a channel provider). It should be migrated into the channel system as a proper `ChannelProvider` for consistency.

**Confidence:** HIGH for Slack and Matrix viability. The `ChannelProvider` interface is clean and extensible.

---

### 6. WebSocket RPC Gateway (OpenClaw-Inspired)

**Current state:** LivOS already has a WebSocket endpoint at `/ws/agent` (see `api.ts` line 667). It accepts `{ type: "agent", task: "..." }` and streams `AgentEvent` objects back.

**OpenClaw's approach:** Full JSON-RPC-style protocol with challenge-response auth, request/response/event frame types, idempotency keys, and multi-role connections (operator vs node).

**Recommendation:** Evolve the existing WebSocket endpoint, do NOT rebuild from scratch.

**What to adopt from OpenClaw:**

| Feature | Adopt? | Rationale |
|---------|--------|-----------|
| Request/Response/Event frame types | YES | `{type:"req", id, method, params}` / `{type:"res", id, ok, payload}` / `{type:"event", event, payload}` |
| Method-based routing | YES | Replace single `agent` message type with methods: `agent.run`, `agent.cancel`, `config.get`, `tools.list` |
| Challenge-response auth | NO | LivOS is localhost-only. JWT auth on WebSocket upgrade is sufficient |
| Idempotency keys | LATER | Useful for retry-safe operations but not critical for initial migration |
| Device pairing | NO | OpenClaw concept not applicable to LivOS (single-user server) |
| State versioning | LATER | Useful for config sync but adds complexity |

**Proposed protocol:**

```typescript
// Client -> Server
interface WsRequest {
  type: 'req';
  id: string;          // UUID for correlation
  method: string;      // e.g., 'agent.run', 'tools.list'
  params?: unknown;
}

// Server -> Client (response to request)
interface WsResponse {
  type: 'res';
  id: string;          // Matches request id
  ok: boolean;
  payload?: unknown;
  error?: string;
}

// Server -> Client (async events, streaming)
interface WsEvent {
  type: 'event';
  event: string;       // e.g., 'agent.chunk', 'agent.tool_call', 'agent.done'
  payload?: unknown;
}
```

**No new dependencies needed.** The existing `ws` package (`^8.18.0`) handles this. The protocol change is a code-level refactor of `setupWebSocket()`.

**Confidence:** HIGH -- verified via [OpenClaw Gateway Protocol](https://docs.openclaw.ai/gateway/protocol). The protocol pattern is straightforward JSON over WebSocket.

---

### 7. Sub-Agent Parallel Execution

**Current state:** SubAgent spawning exists in `AgentLoop.spawnSubagent()` but is **sequential** -- each subagent runs one at a time within the parent's turn.

**Enhancement:** Enable parallel sub-agent execution using `Promise.allSettled()`.

**No new dependencies needed.** This is a code-level change to the AgentLoop:

```typescript
// New tool: spawn_parallel
if (step.tool === 'spawn_parallel') {
  const tasks = step.params.tasks as Array<{ task: string; tools?: string[] }>;
  const results = await Promise.allSettled(
    tasks.map(t => this.spawnSubagent({ task: t.task, tools: t.tools }, depth))
  );
  // Merge results into observation
}
```

**BullMQ integration (already installed):** For long-running parallel tasks, use the existing BullMQ setup instead of in-process `Promise.allSettled()`. BullMQ is already a dependency and the worker infrastructure exists.

**Confidence:** HIGH -- pure code change, no new dependencies.

---

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| Vercel AI SDK (`ai` package) | Would require rewriting AgentLoop, tool registry, and streaming patterns. LivOS's custom ReAct loop is more flexible and already battle-tested |
| LangChain / LangGraph | Heavy framework, opinionated abstractions that conflict with existing architecture. Dependency bloat |
| `@anthropic-ai/claude-agent-sdk` | High-level agent framework by Anthropic. LivOS already has its own AgentLoop with subagents, skills, and tool policies. Would be redundant |
| Pinecone / Weaviate / Milvus | Separate vector database service. Overkill for single-user self-hosted. sqlite-vec provides vector search within existing SQLite |
| Neo4j / FalkorDB | Graph database for knowledge graph. Too heavy for initial migration. Evaluate later as optional add-on |
| `claude setup-token` auth | BLOCKED by Anthropic for third-party tools as of January 2026. Use standard API keys |
| OpenAI Agents SDK (`@openai/agents`) | Different agent paradigm. LivOS has its own proven agent loop |
| Socket.IO | Unnecessary abstraction over WebSocket. LivOS already uses raw `ws` which is simpler and sufficient |
| Matrix Appservice SDK | Over-engineered for a simple bot. `matrix-js-sdk` with client API is sufficient |

---

## Recommended Stack Summary

### New Dependencies to Add

```bash
# Upgrade existing
npm install @anthropic-ai/sdk@^0.74.0    # Upgrade from 0.39.0

# New for memory enhancement
cd packages/memory
npm install sqlite-vec@^0.1.7             # Vector search for SQLite

# New for Matrix channel (when implementing)
cd packages/core
npm install matrix-js-sdk@^40.2.0         # Matrix chat protocol

# Optional: Multi-provider via OpenRouter (later phase)
npm install openai@^6.22.0               # OpenAI-compatible SDK for OpenRouter
```

### Dependencies Already Installed (No Action Needed)

| Package | Current Version | Status |
|---------|----------------|--------|
| `@google/generative-ai` | `^0.21.0` | Keep as Gemini fallback provider |
| `@slack/bolt` | `^4.0.0` | Already installed, needs channel provider implementation |
| `@line/bot-sdk` | `^9.0.0` | Already installed, low priority |
| `ws` | `^8.18.0` | Already installed, sufficient for WS-RPC gateway |
| `bullmq` | `^5.0.0` | Already installed, use for parallel sub-agent jobs |
| `ioredis` | `^5.4.0` | Already installed, continue for session/state/pubsub |
| `better-sqlite3` | `^11.0.0` | Already installed in memory package |

### Dependencies to Remove (Eventually)

| Package | When | Why |
|---------|------|-----|
| `@google/generative-ai` | After migration is stable | Only if Gemini fallback is dropped entirely |

**Recommendation:** Keep `@google/generative-ai` indefinitely as a fallback provider. Gemini offers very competitive pricing ($0.10/$0.40 per MTok for Flash) and having a fallback prevents outages if Anthropic has issues.

---

## Integration Points with Existing LivOS

| Existing Component | Change Needed | Effort |
|-------------------|---------------|--------|
| `brain.ts` | Refactor to multi-provider with Claude as primary | HIGH -- core of migration |
| `agent.ts` (AgentLoop) | Switch from JSON parsing to native tool calling | HIGH -- rewires agent loop |
| `tool-registry.ts` | Add `toClaudeTools()` method | LOW -- additive |
| `api.ts` (WebSocket) | Evolve to RPC protocol | MEDIUM -- backward-compatible possible |
| `api.ts` (SSE stream) | Update to use new Brain API | MEDIUM -- follows brain changes |
| `channels/types.ts` | Expand ChannelId union type | LOW -- additive |
| `channels/index.ts` | Register new providers | LOW -- pattern exists |
| `config/schema.ts` | Add provider config section | LOW -- additive |
| `session-manager.ts` | No changes needed | NONE |
| `skill-loader.ts` | Update Brain type references | LOW -- type-only changes |
| `memory/index.ts` | Add sqlite-vec, FTS5 hybrid search | MEDIUM -- enhances existing |
| `mcp-client-manager.ts` | No changes needed | NONE |

---

## Provider Auth Configuration

### Redis-based (dynamic, UI-configurable)

```
nexus:config:provider          = "claude" | "gemini" | "openrouter"
nexus:config:anthropic_api_key = "sk-ant-api03-..."
nexus:config:gemini_api_key    = "AIza..." (existing)
nexus:config:openrouter_key    = "sk-or-..." (optional)
```

### Environment-based (startup fallback)

```env
ANTHROPIC_API_KEY=sk-ant-api03-...
GEMINI_API_KEY=AIza...               # existing
OPENROUTER_API_KEY=sk-or-...         # optional
AI_PROVIDER=claude                    # default provider
```

**API key source priority:** Redis > Environment > Error

---

## Cost Comparison (per million tokens)

| Provider | Input | Output | Best For |
|----------|-------|--------|----------|
| Claude Haiku 4.5 | $1.00 | $5.00 | Fast tasks, classification |
| Claude Sonnet 4.5 | $3.00 | $15.00 | Agent loop, balanced |
| Claude Opus 4.6 | $5.00 | $25.00 | Complex reasoning |
| Gemini Flash | $0.10 | $0.40 | Cheapest option for bulk work |
| Gemini Pro | $1.25 | $5.00 | Comparable to Haiku |
| OpenRouter (varies) | Varies | Varies | Access to 400+ models |

**Recommendation:** Default to Claude Sonnet 4.5 for agent loop (best quality/cost ratio). Keep Gemini Flash available as a "budget mode" for high-volume, low-complexity tasks.

---

## Sources

### HIGH Confidence
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview) -- model IDs, pricing, context windows
- [Anthropic SDK TypeScript GitHub](https://github.com/anthropics/anthropic-sdk-typescript) -- API patterns, streaming, tool use
- [Anthropic Tool Use Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) -- native tool calling
- [Anthropic Streaming Messages](https://docs.anthropic.com/en/api/messages-streaming) -- SSE event types
- [sqlite-vec Documentation](https://alexgarcia.xyz/sqlite-vec/js.html) -- Node.js integration with better-sqlite3
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) -- v0.74.0 latest
- Existing codebase: `brain.ts`, `agent.ts`, `tool-registry.ts`, `api.ts`, `channels/`, `memory/`

### MEDIUM Confidence
- [OpenClaw Gateway Protocol](https://docs.openclaw.ai/gateway/protocol) -- WS-RPC frame format
- [OpenClaw Memory Architecture](https://docs.openclaw.ai/concepts/memory) -- hybrid search approach
- [OpenRouter Documentation](https://openrouter.ai/docs/guides/overview/models) -- multi-provider API
- [matrix-js-sdk GitHub](https://github.com/matrix-org/matrix-js-sdk) -- Matrix client SDK
- [@slack/bolt npm](https://www.npmjs.com/package/@slack/bolt) -- v4.6.0 latest

### LOW Confidence (Needs Validation)
- [Anthropic blocks subscription tokens](https://github.com/anthropics/claude-code/issues/18340) -- policy may evolve, re-check before implementation
- sqlite-vec v0.1.7 stability in production -- alpha-versioned, needs testing
- Matrix SDK complexity -- large SDK, actual bot implementation effort needs prototyping
- Graphiti Node.js viability -- primarily Python, MCP server is community-maintained

---

*Research completed: 2026-02-15*
