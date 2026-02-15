# Research Summary: v1.5 Claude Migration & AI Platform

**Milestone:** v1.5 — Claude Migration & AI Platform
**Research Date:** 2026-02-15
**Overall Confidence:** HIGH
**Synthesized from:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

LivOS is migrating from a Gemini-only agent system to a multi-provider AI platform with Claude as primary. This is **not a greenfield project** — the existing architecture has clean abstraction points (Brain class, ChannelProvider interface, SkillLoader, SessionManager, memory service) that enable extension rather than replacement.

**Critical Discovery:** Anthropic blocked subscription OAuth tokens (`sk-ant-oat01-*`) from third-party tools in January 2026. LivOS MUST use standard API keys (`sk-ant-api03-*`), not subscription tokens from `claude setup-token`. The original auth plan is not viable.

**Key Insight:** The migration touches five core systems: (1) AI abstraction layer (Brain), (2) agent execution engine (AgentLoop), (3) streaming protocol (SSE events), (4) memory with embeddings, and (5) auth configuration. All other features (channels, skills, WebSocket gateway, parallel execution) integrate cleanly at existing seams.

**Primary Risk:** Tool calling format mismatch. The current ReAct loop uses JSON-in-text parsing; Claude has native tool_use content blocks. These must coexist during transition, requiring dual-mode support in AgentLoop. Second risk: Message role mapping — Claude requires strict user/assistant alternation, Gemini allows consecutive same-role messages.

**Recommended Strategy:** Multi-provider abstraction with Claude as primary, Gemini as fallback. Keep the existing AgentEvent SSE format (don't break frontend). Implement native Claude tool calling but maintain JSON-in-text fallback for Gemini. Enhance memory with sqlite-vec (not a separate vector DB). Expand channels incrementally (Slack first, Matrix second). Defer OAuth token support, knowledge graphs, and visual workflow builders.

---

## Key Findings

### 1. Stack Additions (from STACK.md)

**Core Dependencies:**

| Package | Action | Version | Purpose |
|---------|--------|---------|---------|
| `@anthropic-ai/sdk` | **Upgrade** | `^0.39.0` → `^0.74.0` | Native MCP helpers, Zod tools, structured outputs, message streaming |
| `sqlite-vec` | **Add** | `^0.1.7` | Native SQLite vector extension for memory service |
| `matrix-js-sdk` | **Add** | `^40.2.0` | Matrix chat channel (self-hosted friendly) |
| `openai` | **Optional** | `^6.22.0` | OpenRouter multi-provider gateway (later phase) |

**Already Installed (use as-is):**
- `@slack/bolt@^4.0.0` — Socket Mode for Slack channel (no implementation yet)
- `@line/bot-sdk@^9.0.0` — Line channel (low priority)
- `bullmq@^5.0.0` — Background jobs for parallel agent execution
- `ws@^8.18.0` — WebSocket RPC gateway (extend existing)

**Auth Method Change:**
- Original plan: Subscription tokens via `claude setup-token` — **BLOCKED by Anthropic**
- Required approach: Standard API keys from console.anthropic.com
- Storage: Redis key `nexus:config:anthropic_api_key` (parallel to `gemini_api_key`)

**Model Tier Mapping:**

```typescript
const CLAUDE_MODELS = {
  flash: 'claude-haiku-4-5',        // $1/$5 per MTok — fast, cheap
  haiku: 'claude-haiku-4-5',        // Same as flash
  sonnet: 'claude-sonnet-4-5',      // $3/$15 per MTok — agent default
  opus: 'claude-opus-4-6',          // $5/$25 per MTok — complex reasoning
};
```

**Cost Comparison:** Claude Sonnet ($3/$15) vs Gemini Flash ($0.10/$0.40). Recommendation: Default to Sonnet for quality, keep Gemini as "budget mode" fallback.

---

### 2. Feature Table Stakes (from FEATURES.md)

**Multi-Provider Backend (Must-Have):**
- Claude API integration with streaming + native tool calling
- API key configuration per provider (UI + Redis storage)
- Model selection per tier (flash/haiku/sonnet/opus) mapping to provider models
- Token usage tracking normalized across providers
- Provider fallback chain (if Claude 429/503, try Gemini)

**Hybrid Memory (Must-Have):**
- Session context (conversation history) — **already exists**
- Long-term memory (facts/preferences) — **already exists**
- Semantic search (vector similarity) — **already exists**
- Automatic memory extraction (post-conversation fact extraction) — **new**
- Memory deduplication (prevent accumulation) — **new**

**Additional Channels (Must-Have):**
- Slack provider (Socket Mode, no public endpoints)
- Matrix provider (self-hosted friendly)
- Channel-agnostic message routing — **already exists**
- Per-channel configuration UI — **extend existing pattern**

**Skill Marketplace (Must-Have):**
- SKILL.md manifest format (OpenClaw compatibility)
- Skill installation from Git-based registry (like app gallery)
- Skill versioning and permissions declaration
- Progressive skill loading (lazy load handlers)

**WebSocket RPC Gateway (Must-Have):**
- JSON-RPC 2.0 over WebSocket (standardize existing `/ws/agent`)
- Authentication on connect (API key or JWT)
- Agent streaming via WebSocket (bidirectional, cancellable)
- Multiplexed sessions (multiple concurrent tasks per connection)

**Human-in-the-Loop (Must-Have):**
- Tool approval gate for destructive operations
- Approval response from any channel
- Configurable approval policy (always/destructive/never)

**Parallel Execution (Should-Have):**
- Independent background tasks (BullMQ-based)
- Task status monitoring and cancellation
- Fan-out/fan-in pattern (defer to later phase)

---

### 3. Architecture Decisions (from ARCHITECTURE.md)

**Brain Class Migration:**

```
BEFORE (Gemini-only):
  Brain.chat() → generateContent()
  Brain.chatStream() → generateContentStream()
  GEMINI_MODELS mapping
  Redis: livos:config:gemini_api_key

AFTER (Multi-provider):
  ProviderManager.chat() → ClaudeProvider | GeminiProvider
  Brain → thin wrapper around ProviderManager
  Provider-specific model mappings
  Redis: anthropic_api_key, gemini_api_key, openrouter_key
```

**Provider Interface:**

```typescript
interface AIProvider {
  chat(options: ChatOptions): Promise<ChatResult>
  chatStream(options: ChatOptions): ChatStreamResult
  isAvailable(): Promise<boolean>
  supportsVision: boolean
  supportsToolCalling: boolean
  models: Record<string, string>
}
```

Three implementations: `ClaudeProvider` (primary), `GeminiProvider` (fallback), `OpenRouterProvider` (optional).

**Tool Calling Strategy:**
- Claude: Native `tool_use` content blocks with `tool_result` responses
- Gemini: JSON-in-text parsing (existing `parseStep()` method)
- AgentLoop: Dual-mode support — detect provider, use appropriate mechanism
- No abstraction layer for tool calling — let each provider use native format
- ToolRegistry gains `toClaudeTools()` method for schema conversion

**Memory Enhancement:**

```
Current: PostgreSQL + pgvector + Gemini embeddings
Extended:
  ├── memories table (existing — vector search)
  ├── memory_sessions table (NEW — session context binding)
  ├── memory_relations table (NEW — graph edges, defer to later phase)
  └── sqlite-vec integration (REPLACE manual cosine similarity)
```

Keep Gemini API key for embeddings even after Claude migration (embeddings are cheap, different feature).

**Streaming Protocol:**
- **Keep existing AgentEvent format** — no frontend changes required
- Map Claude events to AgentEvents:
  - `content_block_delta` (text_delta) → `{type: 'chunk', data: text}`
  - `content_block_start` (tool_use) → `{type: 'tool_call', data: {tool, params}}`
  - `message_stop` → `{type: 'done', data: {answer, success}}`
- Use Anthropic SDK's `.messages.stream()` helper with `.on('text')` events

**Channel Expansion:**

```
nexus/packages/core/src/channels/
  ├── telegram.ts (existing)
  ├── discord.ts (existing)
  ├── slack.ts (NEW — @slack/bolt Socket Mode)
  ├── matrix.ts (NEW — matrix-js-sdk)
  └── index.ts (register new adapters in ChannelManager)
```

Each adapter: ~150-200 LOC following existing pattern. No architectural changes needed.

**WebSocket Gateway:**
- Extend existing `/ws/agent` endpoint (don't create separate service)
- Add JSON-RPC 2.0 framing: `{jsonrpc: "2.0", method, params, id}`
- Add authentication on connection (API key or JWT validation)
- Support multiplexed sessions (session ID per request)

---

### 4. Critical Pitfalls (from PITFALLS.md)

**Top 5 Risks to Watch:**

#### 1. Message Role Mapping Breaks Agent Loop (CRITICAL)
- **Issue:** Gemini uses `role: 'model'`, Claude uses `role: 'assistant'`. Claude strictly enforces user/assistant alternation; Gemini allows consecutive same-role messages.
- **Impact:** All multi-turn agent invocations fail with 400 errors. Production bots stop responding.
- **Prevention:** Normalization layer that merges consecutive messages + pre-flight validation before API calls.
- **Phase:** Phase 1 (Brain abstraction layer).

#### 2. Tool Calling Format Mismatch (CRITICAL)
- **Issue:** Current system uses JSON-in-text (`parseStep()` with regex fallbacks). Claude has native `tool_use` content blocks with `tool_use_id` tracking.
- **Impact:** If kept as text: unreliable tool calls, no parallel use. If switched incompletely: missing `tool_use_id` causes 400 errors.
- **Prevention:** Dual-mode support — native for Claude, JSON-in-text for Gemini. ToolRegistry gains `toClaudeTools()` method.
- **Phase:** Phase 1 (Brain abstraction) + Phase 2 (AgentLoop adaptation).

#### 3. SSE Streaming Format Breaks Frontend (CRITICAL)
- **Issue:** Claude emits `content_block_delta`, `message_stop` events. Current frontend expects `chunk`, `tool_call`, `done` AgentEvents.
- **Impact:** Frontend shows blank responses, tool visualizations break, no user-visible errors.
- **Prevention:** Keep existing AgentEvent format as SSE contract. Brain layer translates Claude events to AgentEvents.
- **Phase:** Phase 1 (Brain abstraction layer).

#### 4. API Key Auth Only (No Subscription Tokens) (HIGH)
- **Issue:** Anthropic blocked subscription OAuth tokens from third-party tools in Jan 2026. Cannot use `claude setup-token`.
- **Impact:** Original auth plan is not viable. Must use standard API keys.
- **Prevention:** Use API key auth (`sk-ant-api03-*` format). Add key validation on save. Store in Redis: `nexus:config:anthropic_api_key`.
- **Phase:** Phase 1 (configuration) + Phase 2 (auth UI).

#### 5. Memory Embeddings Tied to Gemini (HIGH)
- **Issue:** Memory service uses Gemini `text-embedding-004` via hard-coded HTTP call. Removing Gemini key breaks memory search.
- **Impact:** Memory search degrades silently. New memories without embeddings never match old ones.
- **Prevention:** Keep Gemini API key for embeddings (different feature, cheap) OR integrate alternative embedding provider (local sentence-transformers, OpenAI embed).
- **Phase:** Phase 3 (Memory integration).

**Other Notable Risks:**
- **Leaky abstraction (lowest-common-denominator):** Use capability-based design with `providerOptions` bag, not uniform interface.
- **Conversation history format incompatible:** Define provider-neutral format with `role: 'user' | 'assistant'`, migrate existing sessions.
- **WebSocket lacks authentication:** Add API key or JWT validation on connection upgrade (SEC issue).
- **Skill marketplace security:** Arbitrary code execution risk — start with curated gallery, implement capability system before allowing untrusted sources.
- **Token budget mismatch:** Claude costs 10-50x more than Gemini. Add provider-specific defaults and cost tracking.
- **Response routing race condition:** `currentChannelContext` is instance state, causes cross-channel leakage. Pass context per-request.

---

## 5. Recommended Build Order

Based on dependencies, risk, and integration points:

### Phase 1: Provider Abstraction + Claude Integration (Foundation)
**Duration:** 7-10 days
**Why first:** Everything depends on clean provider abstraction.

**Tasks:**
1. Define provider-neutral conversation format (`role: 'user' | 'assistant'`, `content: string | ContentBlock[]`)
2. Create `AIProvider` interface + `ProviderManager`
3. Implement `ClaudeProvider` with `@anthropic-ai/sdk@^0.74.0`
4. Refactor existing Gemini code into `GeminiProvider`
5. Message normalization layer (handle role mapping, alternation validation)
6. Streaming event mapping (Claude events → AgentEvents, keep existing SSE contract)
7. Token/cost defaults per provider
8. API key config (Redis + Settings UI for `anthropic_api_key`)
9. Provider fallback logic (if Claude fails, try Gemini)
10. Integration tests: replay multi-turn conversations with tool calls

**Deliverable:** Brain abstraction that works with both Claude and Gemini. Existing functionality preserved.

**Critical Pitfalls to Address:** #1 (role mapping), #3 (streaming format), #4 (API key auth), #11 (token budget).

---

### Phase 2: Native Tool Calling + AgentLoop Adaptation
**Duration:** 5-7 days
**Why second:** Requires Brain abstraction from Phase 1.

**Tasks:**
1. Add `toClaudeTools()` method to ToolRegistry (convert to `input_schema` format)
2. Dual-mode tool calling in AgentLoop:
   - Detect provider type
   - For Claude: extract `tool_use` content blocks, return `tool_result` blocks
   - For Gemini: keep existing `parseStep()` JSON-in-text
3. Handle parallel tool calls (Claude may return multiple `tool_use` blocks) OR disable with `disable_parallel_tool_use: true`
4. Test with complex parameter schemas (nested objects, enums)
5. Extended thinking support (expose `thinking` content blocks as collapsible UI sections)

**Deliverable:** Claude native tool calling working end-to-end. Gemini fallback unchanged.

**Critical Pitfalls to Address:** #2 (tool format mismatch), #7 (ReAct prompt compatibility).

---

### Phase 3: Hybrid Memory + Channel Expansion
**Duration:** 7-10 days
**Why third:** Independent of Brain changes, well-defined integration points.

**Tasks:**
1. **Memory enhancements:**
   - Add `sqlite-vec@^0.1.7` to memory service
   - Schema migration: `memory_sessions` table
   - Automatic memory extraction (post-conversation LLM call, BullMQ background job)
   - Memory deduplication (embedding similarity threshold)
   - Temporal awareness (timestamp metadata, time-aware search ranking)
   - Context window optimization (relevance-scored assembly within token budget)
2. **Channel expansion:**
   - Implement `SlackProvider` (Socket Mode, `@slack/bolt`)
   - Implement `MatrixProvider` (`matrix-js-sdk`)
   - Update `ChannelId` type, register in ChannelManager
   - Test message routing, text chunking, formatting
3. **Fix response routing race condition:**
   - Remove `this.currentChannelContext` instance state
   - Pass channel context per-request through processing chain

**Deliverable:** Slack and Matrix channels working. Memory search quality improved.

**Critical Pitfalls to Address:** #5 (embedding provider), #12 (routing race condition).

---

### Phase 4: WebSocket Gateway + Human-in-the-Loop
**Duration:** 5-7 days
**Why fourth:** Enables HITL, depends on WebSocket from Phase 3.

**Tasks:**
1. **WebSocket RPC upgrade:**
   - JSON-RPC 2.0 message framing (`{jsonrpc: "2.0", method, params, id}`)
   - Authentication on connection (API key or JWT in upgrade request)
   - Method-based routing (`agent.run`, `agent.cancel`, `tools.list`)
   - Multiplexed sessions (session ID per request)
   - Server-initiated notifications (Redis pub/sub → WebSocket push)
2. **Human-in-the-loop:**
   - Tool metadata: `requiresApproval: boolean`
   - Agent loop pause on approval_request event
   - Approval response from any channel (stored in Redis, agent polls)
   - Configurable approval policy (always/destructive/never)
   - Audit trail (log all approvals)

**Deliverable:** WebSocket RPC gateway. Tool approval system working.

**Critical Pitfalls to Address:** #9 (WebSocket auth).

---

### Phase 5: Skill Marketplace + Parallel Execution
**Duration:** 7-10 days
**Why last:** Most complex, builds on all previous phases.

**Tasks:**
1. **Skill marketplace:**
   - SKILL.md manifest schema (OpenClaw-compatible YAML frontmatter)
   - Directory-based skills (`skill-name/SKILL.md` + `skill-name/index.ts`)
   - Git-based registry client (like app gallery)
   - Skill installation flow (download, validate, place in `~/.nexus/skills/`)
   - Progressive loading (lazy import handlers)
   - Permission declarations + approval before install
   - Skill analytics (usage tracking in Redis)
2. **Parallel execution:**
   - BullMQ job per agent task
   - Task status monitoring (Redis state, API endpoint)
   - Task cancellation (AbortController signal)
   - Resource-aware scheduling (concurrency limits)
   - Global rate limiting (distribute budget across concurrent agents)

**Deliverable:** Skill marketplace working (curated gallery only). Parallel agent execution.

**Critical Pitfalls to Address:** #10 (skill security — curated only, no untrusted sources yet), #17 (resource isolation).

---

## 6. What NOT to Build

**Explicit Exclusions (Anti-Features):**

| Technology/Feature | Why Excluded | Alternative |
|-------------------|--------------|-------------|
| **Subscription OAuth tokens** | Blocked by Anthropic for third-party tools (Jan 2026) | Use standard API keys |
| **Vercel AI SDK** | Would require rewriting AgentLoop, tool registry, streaming patterns | Build provider abstraction natively |
| **LangChain / LangGraph** | Heavy framework, opinionated abstractions, dependency bloat | Native TypeScript agent loop |
| **Separate vector database (Pinecone/Weaviate/Milvus)** | Overkill for single-user self-hosted | sqlite-vec within existing SQLite |
| **Neo4j / FalkorDB graph database** | Too heavy for initial migration | Defer knowledge graph to later phase |
| **OpenAI compatibility layer** | Adds translation hop, masks provider-specific features | Use native SDKs directly |
| **Self-hosted LLM support (Ollama)** | Local models are dramatically worse at tool calling and agentic reasoning | Defer to post-milestone as "experimental" |
| **14+ channels like OpenClaw** | Maintenance hell, unique SDKs, auth flows, rate limits per channel | Support 5 impactful channels: WhatsApp, Telegram, Discord, Slack, Matrix |
| **Centralized skill marketplace with accounts** | Product company, not a feature. Users shouldn't depend on our servers | Git-based registries, community ratings via GitHub stars |
| **Visual workflow builder** | Drag-and-drop is impressive but scope-creeping. Multi-month effort | Text-based workflow definitions (skills support multi-phase pipelines already) |
| **GraphQL subscriptions** | Schema complexity, tooling requirements, learning curve | Keep REST + WebSocket |
| **gRPC** | Protobuf compilation, not browser-native, build complexity | JSON-RPC 2.0 over WebSocket |

---

## Confidence Assessment

| Area | Confidence | Source Quality | Gaps to Address |
|------|------------|----------------|-----------------|
| **Stack (Claude API integration)** | HIGH | Official Anthropic docs, SDK source, npm registry | None — well-documented |
| **Stack (Subscription auth)** | HIGH | GitHub issues, Anthropic blocks article, community reports | Exact OAuth token expiry timing not fully documented |
| **Features (Multi-provider routing)** | MEDIUM-HIGH | LiteLLM, Portkey patterns, verified against codebase | Custom implementation complexity uncertain |
| **Features (Hybrid memory)** | MEDIUM | Mem0, Zep academic papers, OpenClaw docs | Production stability of sqlite-vec (alpha-versioned) needs testing |
| **Features (Skill marketplace)** | MEDIUM-HIGH | OpenClaw SKILL.md format documented, LivOS already has foundations | Security model (capability system) needs design |
| **Architecture (Brain abstraction)** | HIGH | Current codebase analysis, Claude SDK docs, Gemini SDK docs | None — integration points are clean |
| **Architecture (Streaming protocol)** | HIGH | Current api.ts SSE implementation, Claude streaming events | None — mapping is straightforward |
| **Pitfalls (Message format)** | HIGH | Claude API docs, agent.ts source analysis | None — well-documented |
| **Pitfalls (Tool calling)** | HIGH | Claude tool use docs, current parseStep() implementation | None — dual-mode approach is proven |
| **Pitfalls (WebSocket auth)** | HIGH | api.ts source shows no auth check | None — obvious security issue |
| **Pitfalls (Token expiry)** | MEDIUM | Community reports (GitHub issues), not official docs | Anthropic doesn't document exact token expiry behavior for setup-token |

**Overall Confidence: HIGH** — All critical integration points are well-documented. Main uncertainties are around subscription auth (blocked, must use API keys instead) and production stability of sqlite-vec (alpha version).

---

## Gaps to Address

**Before Phase 1 Starts:**
1. Verify latest `@anthropic-ai/sdk` version (docs reference 0.74.0, confirm it's current)
2. Test API key auth flow end-to-end with Claude API
3. Create test Anthropic account with API key for development

**During Phase 1:**
1. Design provider-neutral conversation format (decide on schema for content blocks)
2. Write migration script for existing Redis session data (Gemini format → neutral format)
3. Define token budget defaults per provider (how much to allocate for Haiku vs Sonnet vs Opus?)

**During Phase 3:**
1. Decide embedding provider strategy: keep Gemini, add alternative, or re-embed with new model?
2. Test sqlite-vec production stability (alpha-versioned, needs validation)
3. Matrix SDK complexity assessment (large SDK, prototype bot implementation effort)

**During Phase 5:**
1. Design capability system for skills (what permissions to support? how to enforce?)
2. Define skill security review process (who reviews? what criteria?)
3. Prototype skill sandboxing (worker threads? VM isolation? or trust-based with manifests?)

---

## Sources

**HIGH Confidence:**
- [Anthropic Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Anthropic SDK TypeScript GitHub](https://github.com/anthropics/anthropic-sdk-typescript)
- [Anthropic Tool Use Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
- [Anthropic Streaming Messages](https://docs.anthropic.com/en/api/messages-streaming)
- [sqlite-vec Documentation](https://alexgarcia.xyz/sqlite-vec/js.html)
- [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk)
- Existing codebase: `brain.ts`, `agent.ts`, `tool-registry.ts`, `api.ts`, `channels/`, `memory/`

**MEDIUM Confidence:**
- [OpenClaw Gateway Protocol](https://docs.openclaw.ai/gateway/protocol)
- [OpenClaw Memory Architecture](https://docs.openclaw.ai/concepts/memory)
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/skills)
- [OpenRouter Documentation](https://openrouter.ai/docs/guides/overview/models)
- [matrix-js-sdk GitHub](https://github.com/matrix-org/matrix-js-sdk)
- [@slack/bolt npm](https://www.npmjs.com/package/@slack/bolt)
- [Mem0 Research Paper](https://arxiv.org/abs/2504.19413)
- [Zep Temporal Knowledge Graph](https://blog.getzep.com/content/files/2025/01/ZEP__USING_KNOWLEDGE_GRAPHS_TO_POWER_LLM_AGENT_MEMORY_2025011700.pdf)

**LOW Confidence (Needs Validation):**
- [Anthropic blocks subscription tokens](https://github.com/anthropics/claude-code/issues/18340) — policy may evolve, re-check before implementation
- sqlite-vec v0.1.7 stability in production — alpha-versioned, needs testing
- Matrix SDK complexity — large SDK, actual bot implementation effort needs prototyping
- Exact OAuth token expiry behavior (1-year figure from community sources)

---

## Ready for Roadmap

This summary provides the roadmapper with:
- **Clear technology decisions:** What to add, upgrade, and exclude
- **Feature prioritization:** Table stakes vs differentiators vs anti-features
- **Build order:** 5 phases with dependencies and durations
- **Risk mitigation:** Top 5 critical pitfalls with prevention strategies
- **Integration strategy:** Where to extend vs replace existing code

**Next Steps:**
1. Roadmapper creates phase definitions in `.planning/phases/`
2. Each phase gets a PLAN.md with detailed tasks
3. Use `/gsd:research-phase` for deep dives as needed (e.g., skill security model, memory migration strategy)

---

**Research completed:** 2026-02-15
**Files synthesized:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Synthesizer:** GSD Research Synthesis Agent
