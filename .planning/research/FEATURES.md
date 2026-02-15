# Feature Landscape: Claude Migration & OpenClaw-Inspired Features

**Domain:** Self-hosted AI agent platform (multi-provider, hybrid memory, skill marketplace, expanded channels)
**Researched:** 2026-02-15
**Confidence:** MEDIUM-HIGH

## Executive Summary

LivOS Nexus is evolving from a Gemini-only agent with session-based memory into a multi-provider, Claude-primary AI platform with hybrid memory, a skill marketplace, and an expanded channel ecosystem. This research maps eight feature areas against what the current codebase already supports, what the ecosystem expects, and what differentiates LivOS from alternatives like OpenClaw.

The existing codebase is well-architected for extension. The `Brain` class already has a tier-based model selection system that maps to provider routing. The `ChannelProvider` interface is a clean abstraction for adding Slack and Matrix. The `SkillLoader` already supports YAML frontmatter manifests and hot-reload. The `SessionManager` and memory service provide foundations for hybrid memory. The WebSocket server at `/ws/agent` provides a starting point for the RPC gateway.

Key insight: **LivOS is not starting from scratch.** Most features are extensions of existing abstractions, not greenfield builds. The primary risk is not "can we build it" but "can we maintain clean abstractions while adding complexity."

---

## 1. Multi-Provider AI Backend (Claude-Primary)

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Claude API integration** | Primary model. Users choosing LivOS over OpenClaw expect Claude support. Anthropic SDK (`@anthropic-ai/sdk`) provides TypeScript-native streaming, tool use, and extended thinking. | MEDIUM | New `AnthropicProvider` class, refactor `Brain` to use provider interface |
| **API key configuration (per-provider)** | Users must be able to set API keys for Claude, Gemini, and future providers. Current: single `gemini_api_key` in Redis. | LOW | Extend Redis config keys: `livos:config:anthropic_api_key`, `livos:config:openai_api_key`, etc. UI settings page. |
| **Model selection per tier** | Current `Brain.selectTier()` maps intent types to tiers (flash/haiku/sonnet/opus). Must work across providers -- e.g., "sonnet" maps to `claude-sonnet-4-5` or `gemini-3-flash-preview` depending on configured provider. | MEDIUM | Provider-specific model mapping tables. Config-driven default provider. |
| **Streaming response compatibility** | Current SSE stream emits `{type, turn, data}` events. Claude streaming uses different event format (message_start, content_block_delta, etc.). Must normalize to existing event protocol. | MEDIUM | Adapter layer in each provider that yields `ChatStreamChunk` (existing interface). |
| **Tool use / function calling** | Current system uses JSON-in-text parsing (`parseStep`). Claude has native tool_use content blocks. Both must work through the same `ToolRegistry`. | HIGH | Provider-specific agent loop adaptations. Claude native tool calling is significantly more reliable than JSON-in-text parsing. |
| **Token usage tracking** | Current: `inputTokens`/`outputTokens` tracked per chat call. Must work identically across providers for billing/monitoring. | LOW | Normalize usage metadata from each provider's response format. |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Provider fallback chain** | If Claude is down (429/503), automatically fall back to Gemini. Zero downtime for the agent. Users never see "API unavailable." | MEDIUM | Ordered provider list per tier. Retry logic with provider switching. Error classification (retryable vs permanent). |
| **Extended thinking (Claude)** | Claude's `thinking` content blocks expose chain-of-thought reasoning. Can surface in UI as collapsible "thinking" sections -- users see *how* the AI reasons. | MEDIUM | New `thinking_delta` event type in SSE stream. UI rendering of thinking blocks. |
| **Cost tracking dashboard** | Per-provider, per-model token costs displayed in settings. "You spent $2.30 on Claude Sonnet this week." Self-hosted users are cost-conscious. | MEDIUM | Token pricing table per model. Redis accumulator for daily/weekly costs. Settings UI widget. |
| **Native tool calling mode** | Switch from JSON-in-text parsing to Claude's native `tool_use` content blocks. Eliminates JSON parse failures, supports structured outputs, enables parallel tool calls. | HIGH | Major refactor of `AgentLoop.parseStep()`. Dual-mode: JSON-in-text for Gemini, native for Claude. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **OpenAI compatibility layer** | Adding an OpenAI-compatible API endpoint (like LiteLLM proxy) adds a translation hop, increases latency, and masks provider-specific features (extended thinking, vision). | Use each provider's native SDK directly. Provider interface abstracts differences internally, not via OpenAI compatibility. |
| **Self-hosted LLM support (Ollama/llama.cpp)** | Local models are dramatically worse at tool calling and agentic reasoning. Supporting them creates a "works but badly" experience that generates support issues. | Keep as future option. If added, clearly label as "experimental" with degraded agent capabilities. |
| **Automatic cheapest-provider routing** | Routing purely by cost (send to cheapest provider per token) ignores quality differences. Claude Sonnet at $3/MTok is not interchangeable with Gemini Flash at free tier for complex reasoning. | Route by tier (quality level), not by cost. User chooses default provider per tier. Fallback is for availability, not cost optimization. |

### Feature Dependencies

```
API Key Config
  +-- Provider Interface (abstract Brain)
      +-- Claude Provider (@anthropic-ai/sdk)
      +-- Gemini Provider (existing, refactored)
      +-- Model Mapping Tables
      +-- Provider Fallback Chain
          +-- Error Classification
  +-- Native Tool Calling (Claude)
      +-- Extended Thinking
  +-- Token Usage Tracking
      +-- Cost Dashboard
```

---

## 2. Hybrid Memory System

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Session context (conversation history)** | Already exists. `SessionManager` stores conversation history in Redis with idle timeout and pruning. Must continue to work. | ALREADY BUILT | Existing `SessionManager` |
| **Long-term memory (facts/preferences)** | Already exists. Memory service stores facts with Gemini embeddings in SQLite. Must continue to work. | ALREADY BUILT | Existing `nexus-memory` service |
| **Semantic search (vector similarity)** | Already exists. Memory service uses cosine similarity on Gemini `text-embedding-004` embeddings. Must continue to work. | ALREADY BUILT | Existing embedding + search in memory service |
| **Automatic memory extraction** | Agent should automatically identify and store important facts from conversations without user explicitly saying "remember this." Current: only stores when user invokes `memory_add` tool. | MEDIUM | Post-conversation analysis step. LLM call to extract facts. Background job via BullMQ worker. |
| **Memory deduplication** | As automatic extraction adds memories, duplicates accumulate ("User likes coffee" stored 50 times). Must detect and merge duplicates. | MEDIUM | Embedding similarity threshold for dedup. Merge strategy (keep most recent, combine metadata). |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Knowledge graph layer** | Track entity relationships: "Emre (user) -> works_at -> CompanyX", "Server4 -> runs -> Nexus". Enables multi-hop reasoning: "What services run on the server where I deployed my project?" | HIGH | Graph database (Neo4j, or lightweight: SQLite with adjacency tables). Entity extraction pipeline. Graph query integration in memory search. |
| **Temporal awareness** | Memories tagged with time context. "User had a meeting with Ali on Feb 10" -- agent knows this was 5 days ago, not current. Zep's temporal knowledge graph shows 18.5% accuracy improvement. | MEDIUM | Timestamp metadata on all memories. Time-aware search ranking. Relative time references in context injection. |
| **Hierarchical memory scoping** | Mem0-style scoping: user-level (preferences), session-level (current task context), agent-level (learned patterns). Different scopes have different retention policies. | MEDIUM | Scope field on memories. Scope-aware search that combines results from all applicable scopes. |
| **Memory compression** | Compress old conversation history into summaries rather than keeping full transcripts. Mem0 reports 90% lower token usage with compressed context. | MEDIUM | Periodic summarization job (BullMQ). Replace full history with summary + recent messages. |
| **Context window optimization** | Intelligently assemble context from session history + relevant memories + knowledge graph within token budget. Not just "dump everything." | MEDIUM | Token counting. Relevance-scored context assembly. Prioritization: recent > relevant > background. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **External vector database (Pinecone/Weaviate)** | Self-hosted product should not depend on external SaaS for core functionality. SQLite with embeddings works fine at LivOS scale (single-user, thousands of memories, not millions). | Keep SQLite + in-process cosine similarity. Consider pgvector if moving to PostgreSQL for scale. |
| **Full conversation replay** | Storing and replaying complete conversation transcripts is a privacy concern and storage hog. Users on a home server don't want gigabytes of chat logs. | Store compressed summaries + extracted facts. Keep only last N messages in session history. |
| **Cross-user memory sharing** | LivOS is single-user. Building multi-user memory isolation adds complexity for a non-existent use case. | Single user_id. No tenant isolation needed. |

---

## 3. Skill Marketplace

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **SKILL.md manifest format** | OpenClaw has established SKILL.md with YAML frontmatter as the standard for agent skills. LivOS already has a similar format (YAML frontmatter in `/** --- ... --- */` comments). Standardize to be compatible. | LOW | Update `SkillLoader.parseFrontmatter()` to also support standalone SKILL.md files alongside current embedded format. |
| **Skill directory structure** | Each skill is a directory: `skill-name/SKILL.md` + `skill-name/index.ts` + optional `skill-name/tools/`. Current: flat `.ts` files with embedded frontmatter. | MEDIUM | Refactor `SkillLoader` to handle both directory-based and flat-file skills. |
| **Skill installation from registry** | `livosity install <skill-slug>` or UI-based install. Download skill from registry, place in `~/.nexus/skills/`, auto-load. | MEDIUM | Registry client (HTTP). Download + extract. Validate manifest. Place in skills dir. Hot-reload picks it up. |
| **Skill versioning** | Skills have semantic versions. Updates are visible in UI. User can pin versions. | LOW | `version` field in SKILL.md. Registry tracks versions. Install specific version or latest. |
| **Skill permissions declaration** | Skills declare what they need: filesystem access, network, environment variables, shell execution. User approves before install. | MEDIUM | `requires` field in SKILL.md. Permission check at install time. UI approval dialog. |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **LivOS-native skill format** | While compatible with OpenClaw SKILL.md format for reading, LivOS skills can use TypeScript with full type safety, access `SkillContext.runAgent()` for autonomous multi-phase pipelines, and declare custom tools. OpenClaw skills are markdown-only instructions. | LOW | Already exists in current skill system. Document and promote as differentiator. |
| **Progressive skill loading** | OpenClaw only loads skill name+description at startup, fetching full instructions when needed. LivOS should do the same -- reduces startup time and memory with large skill collections. | MEDIUM | Lazy loading in `SkillLoader`. Load frontmatter only, defer handler import until trigger match. |
| **Community registry (self-hostable)** | Unlike ClawHub (centralized), offer a registry that can be self-hosted or point to community instances. GitHub repos as registries (like current app gallery). | MEDIUM | Git-based registry (like existing `livinity-apps` gallery). Index file listing skills. `git pull` to update. |
| **Skill analytics** | Track usage: how often each skill is triggered, success rate, average execution time. Helps users identify valuable vs unused skills. | LOW | Redis counters per skill. Stats endpoint in API. |
| **Skill conflict resolution** | When two skills have overlapping triggers, precedence rules determine which runs. OpenClaw uses: workspace > local > bundled. | LOW | Priority field or directory-based precedence. Already partially handled by `SkillLoader.matchTrigger()` (first match wins). |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Centralized marketplace with accounts** | Running a centralized service (user accounts, ratings, payments) is a product company, not a feature. LivOS is self-hosted -- users shouldn't depend on our servers. | Git-based registries. Community ratings via GitHub stars. Anyone can host a registry. |
| **Skill sandboxing/isolation** | Running untrusted code in sandboxes (VMs, containers per skill) is massive complexity. Skills are code that runs with Nexus privileges -- same as installing an npm package. | Permission declarations in manifest (trust but verify). Community review process. Users install at their own risk (like npm). |
| **Auto-updating skills** | Silently updating installed skills can break workflows. Users need control over when updates happen. | Notify of available updates. User manually triggers update. Pin versions for stability. |

---

## 4. Additional Channels (Slack + Matrix)

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Slack channel** | Slack is the most-requested enterprise messaging integration. `@slack/socket-mode` + `@slack/web-api` provide WebSocket-based bot without public endpoints (critical for self-hosted). | MEDIUM | New `SlackProvider` implementing `ChannelProvider`. Socket Mode requires App Token with `connections:write` scope. |
| **Matrix/Element channel** | Matrix is the open-source, self-hostable alternative to Slack. Aligns with LivOS self-hosted philosophy. `@vector-im/matrix-bot-sdk` (v0.8.0, maintained by Element) provides bot API. | MEDIUM | New `MatrixProvider` implementing `ChannelProvider`. Requires homeserver URL + access token. |
| **Channel-agnostic message routing** | Current `ChannelManager` routes messages from any channel to the agent. New channels must plug into the same pipeline: `IncomingMessage` -> agent -> `OutgoingMessage`. | LOW | Already exists. `ChannelProvider` interface is clean. New channels just implement it. |
| **Channel-specific text limits** | Each channel has different message length limits (Slack: 40K, Matrix: no limit, Telegram: 4096, Discord: 2000). Must chunk responses appropriately. | LOW | Already handled by `chunkText()` in `channels/types.ts`. Add limits to `CHANNEL_META`. |
| **Per-channel configuration UI** | Users configure bot tokens, channel IDs, etc. through LivOS settings. Current: Telegram and Discord have Redis-based config. | LOW | Extend existing settings UI pattern. Add Slack App Token, Matrix homeserver fields. |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Cross-channel context** | Agent remembers conversation context across channels. "I told you on Telegram to check the server" works when asked on Discord. Unified session identity. | MEDIUM | Cross-channel session mapping. User identity resolution across channels (same user on Telegram and Slack). |
| **Channel-specific formatting** | Slack uses mrkdwn (different from Markdown). Matrix uses HTML. Discord uses its own Markdown variant. Agent responses auto-format for each channel. | LOW | Post-processing step in each `ChannelProvider.sendMessage()`. Convert standard markdown to channel-specific format. |
| **Rich message types** | Slack: Block Kit for interactive buttons, dropdowns. Discord: embeds with colors, fields. Matrix: HTML with images. Move beyond plain text responses where channels support it. | HIGH | Channel-specific message builders. Agent needs to specify intent ("show options", "show status") and channel formats it. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **14+ channels like OpenClaw** | Supporting Signal, Line, Zalo, BlueBubbles, iMessage, Google Chat, Microsoft Teams, etc. is maintenance hell. Each has unique SDK, auth flow, rate limits, and quirks. | Support the 5 most impactful: WhatsApp (existing), Telegram (existing), Discord (existing), Slack (new), Matrix (new). Cover 95% of user needs. |
| **Channel-specific slash commands** | Building Slack slash commands, Discord slash commands, Telegram /commands separately creates per-channel feature fragmentation. | Unified command system. All channels use the same `!` prefix or natural language routing. Channel-specific command registration only for platform requirements (Slack needs it for app directory). |
| **Interactive message flows (Slack Block Kit)** | Complex multi-step UI flows in chat (dropdown menus, modal forms) are impressive demos but brittle in production. State management across message interactions is hard. | Keep responses text-based with simple inline actions. Use web UI for complex interactions. |

---

## 5. WebSocket RPC Gateway

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **JSON-RPC 2.0 over WebSocket** | Standardized bidirectional RPC. Current WebSocket at `/ws/agent` is ad-hoc (custom message format). Upgrade to JSON-RPC 2.0 for interoperability with MCP clients and standard tooling. | MEDIUM | JSON-RPC message framing: `{jsonrpc: "2.0", method, params, id}`. Response: `{jsonrpc: "2.0", result, id}`. Notifications: no id. |
| **Authentication on connect** | Current WebSocket has no authentication. Must authenticate via API key or JWT on connection handshake (query param or first message). | LOW | Validate `X-Api-Key` header or `?token=` query param on WebSocket upgrade. Reject unauthenticated connections. |
| **Agent streaming via WebSocket** | Current SSE endpoint (`POST /api/agent/stream`) works but SSE is unidirectional. WebSocket allows bidirectional: client can cancel, send follow-up, or provide human-in-the-loop input mid-stream. | MEDIUM | Refactor agent stream to support WebSocket transport. Multiplexed sessions (multiple concurrent agent runs on one connection). |
| **Connection lifecycle management** | Heartbeat/ping-pong, reconnection handling, session resume after disconnect. | LOW | WebSocket ping/pong frames. Client-side reconnection logic. Session state persistence in Redis for resume. |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Multiplexed sessions** | Single WebSocket connection supports multiple concurrent agent tasks. Each has a unique session ID. Client can monitor multiple background tasks simultaneously. | MEDIUM | Session ID in each JSON-RPC message. Map of active sessions server-side. Events scoped to session ID. |
| **Server-initiated notifications** | Server pushes events without client request: "Docker container crashed", "Scheduled task completed", "New WhatsApp message arrived." Real-time dashboard updates. | MEDIUM | JSON-RPC notification format (no id). Redis pub/sub for internal events -> WebSocket push. |
| **MCP-compatible transport** | WebSocket gateway speaks the same protocol as MCP (JSON-RPC 2.0 over WebSocket). External MCP clients can connect directly to Nexus as an MCP server. | HIGH | Implement MCP server protocol over the WebSocket gateway. Expose Nexus tools as MCP tools. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **GraphQL subscriptions** | GraphQL adds schema complexity, tooling requirements, and a learning curve. LivOS API is simple REST + WebSocket. Adding GraphQL is over-engineering. | Keep REST for CRUD, WebSocket for real-time. |
| **gRPC** | gRPC requires protobuf compilation, is not browser-native, and adds build complexity. JSON-RPC over WebSocket is simpler and works everywhere. | JSON-RPC 2.0 over WebSocket. Standard, simple, browser-compatible. |
| **Socket.IO** | Socket.IO adds a heavy abstraction layer, custom protocol, and Node.js-specific client. Raw WebSocket with JSON-RPC is more portable. | Use `ws` library (already in codebase) with JSON-RPC framing. |

---

## 6. Human-in-the-Loop Agent Workflows

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Tool approval gate** | Before executing dangerous tools (shell, docker, file write), agent pauses and asks user for confirmation. "I want to run `rm -rf /tmp/old-backups`. Approve?" | MEDIUM | Tool metadata: `requiresApproval: boolean`. Agent loop pauses, emits `approval_request` event. Waits for client response via WebSocket. Timeout = reject. |
| **Approval response channel** | User can approve/reject from any connected client: web UI, WhatsApp, Telegram. Response routes back to the waiting agent. | MEDIUM | Approval request stored in Redis with unique ID. Any channel can respond. Agent polls or subscribes for approval. |
| **Configurable approval policy** | User configures which tools need approval: all tools, only destructive ones, or none (full autonomous mode). | LOW | `approval` field in `NexusConfig` or per-tool in `ToolPolicy`. Three modes: `always`, `destructive`, `never`. |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Confidence-based escalation** | Agent monitors its own confidence. Low-confidence decisions automatically escalate to human. "I'm 60% sure this is the right file to delete. Should I proceed?" | HIGH | Confidence scoring in agent reasoning. Threshold configuration. Requires model that can self-assess (Claude is better at this than Gemini). |
| **Edit-before-execute** | User can modify the tool parameters before approving. "I want to run `rm -rf /tmp/old-backups` -> User changes to `rm -rf /tmp/old-backups-2024`" -> Agent executes modified command. | MEDIUM | Approval response includes optional modified params. Agent uses modified params if provided. |
| **Audit trail** | Every approval decision logged: who approved, when, what was the original request, what was executed. Accountability for autonomous actions. | LOW | Redis or SQLite log. Structured entries: `{toolName, params, decision, decidedBy, channel, timestamp}`. |
| **Async approval with task parking** | Agent can park a task and continue with other work while waiting for human approval. Returns to parked task when approval arrives. | HIGH | Task queue with parking state. Agent can have multiple parked tasks. Complex state management. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Approval for every single tool call** | Requiring approval for `memory_search`, `list_files`, or `status` makes the agent unusable. Users will disable it immediately. | Only require approval for tools marked `destructive` or `requiresApproval`. Safe tools (read-only, status) never need approval. |
| **Complex approval workflows (multi-approver)** | Multi-approver chains, quorum voting, delegation -- enterprise features for a single-user home server. | Single user approves or rejects. Period. |
| **Time-delayed execution** | "Approve now, execute in 2 hours" adds scheduling complexity to the approval system. | Execute immediately on approval. For delayed execution, use the existing cron/scheduler system. |

---

## 7. Agent Parallel Execution and Coordination

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **Independent background tasks** | User can start a long-running agent task and start another one. Current: agent runs synchronously per session. | MEDIUM | BullMQ job per agent task. Status tracking in Redis. Results retrievable later. Already partially exists with `worker` package. |
| **Task status monitoring** | User can check: "What tasks are running? What's the status of task X?" | LOW | Redis-based task state: `{id, status, progress, startedAt, result}`. API endpoint to list/query tasks. |
| **Task cancellation** | User can cancel a running agent task. Current: no cancellation mechanism -- agent runs until completion or timeout. | MEDIUM | `AbortController` signal passed through agent loop. Cancel via API or WebSocket command. |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **Fan-out/fan-in pattern** | Decompose complex task into parallel subtasks, execute concurrently, aggregate results. "Research React, Vue, and Svelte in parallel, then compare." 36% latency reduction in benchmarks. | HIGH | Orchestrator agent that creates subtask jobs. BullMQ parallel processing. Result aggregation agent. |
| **Coordinated multi-agent workflows** | Specialized agents collaborating: researcher agent feeds planner agent feeds executor agent. Pipeline pattern. | HIGH | Agent pipeline definition. Inter-agent communication via Redis. Shared context passing. |
| **Resource-aware scheduling** | Don't run 5 agent tasks simultaneously if the server only has enough API budget for 2. Queue excess tasks. | MEDIUM | Concurrency limiter in BullMQ (already supported). API rate limit awareness. Dynamic concurrency based on provider rate limits. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **CrewAI/LangGraph framework integration** | These frameworks add massive dependency weight, Python interop requirements, and their own abstraction layers that fight with LivOS's TypeScript-native agent system. | Build coordination primitives natively in TypeScript. The existing `AgentLoop` + `SubagentManager` + BullMQ already provide the building blocks. |
| **Visual workflow builder** | Drag-and-drop agent workflow builders (like n8n for AI) are impressive but scope-creeping products. Building and maintaining a visual editor is a multi-month effort. | Text-based workflow definition. Skills can define multi-phase pipelines (already supported in `SkillFrontmatter.phases`). |
| **Unbounded parallel execution** | Running unlimited parallel agents will exhaust API rate limits, consume all server resources, and produce hard-to-debug failures. | Cap concurrent agents at configurable limit (default: 3). Queue excess. Backpressure via BullMQ. |

---

## 8. Claude Subscription Auth Flow

### Table Stakes

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| **API key authentication** | Standard Anthropic API key auth: `x-api-key` header. User enters key in LivOS settings, stored in Redis (like current Gemini key). | LOW | `livos:config:anthropic_api_key` in Redis. `AnthropicProvider` reads from Redis on each request (with caching, like current `Brain.getGeminiClient()`). |
| **Key validation on save** | When user enters API key, validate it by making a test request before saving. "Invalid API key" feedback immediately. | LOW | `POST /v1/messages` with minimal prompt. Check for 401 response. |

### Differentiators

| Feature | Value Proposition | Complexity | Depends On |
|---------|-------------------|------------|------------|
| **OAuth token support (Claude Pro/Max)** | Pro/Max subscribers can use their subscription instead of paying per-API-call. `claude setup-token` generates OAuth token. LivOS could accept this as alternative to API key. | HIGH | OAuth token storage and refresh. Token refresh triggered after 5 min or on 401. CLAUDE_CODE_OAUTH_TOKEN env var pattern. Complex auth flow. |
| **Provider health dashboard** | Show which providers are configured, their status (healthy/rate-limited/error), remaining quota estimates. | MEDIUM | Periodic health checks per provider. Rate limit tracking from response headers. UI dashboard widget. |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Claude subscription proxy/passthrough** | Proxying a user's Claude subscription (intercepting their OAuth flow) is ethically questionable and likely violates Anthropic's terms of service. | Support API keys (pay-per-use) as primary auth. OAuth token as user-provided optional input, not a proxy flow. |
| **API key rotation/management** | Automatic key rotation, multiple keys per provider, key pools -- enterprise features for a home server. | Single key per provider. User manually rotates via settings UI. |

---

## Feature Complexity Summary

### LOW Complexity (1-3 days each)
- API key configuration per provider (extend existing Redis pattern)
- Token usage tracking normalization
- Channel-specific text limits (extend `CHANNEL_META`)
- Per-channel configuration UI (extend existing settings pattern)
- Skill versioning (`version` field in manifest)
- Task status monitoring (Redis state + API endpoint)
- Approval policy configuration
- Skill analytics (Redis counters)
- Audit trail for approvals

### MEDIUM Complexity (3-7 days each)
- Claude API provider integration (`@anthropic-ai/sdk`)
- Gemini provider refactor (extract from `Brain`)
- Provider fallback chain with error classification
- Extended thinking streaming
- Streaming response normalization
- Slack channel provider (Socket Mode)
- Matrix channel provider (`@vector-im/matrix-bot-sdk`)
- JSON-RPC 2.0 WebSocket upgrade
- WebSocket authentication
- Automatic memory extraction (post-conversation LLM call)
- Memory deduplication
- Temporal memory awareness
- Memory compression (summarization)
- Context window optimization
- SKILL.md manifest format support
- Skill installation from registry
- Tool approval gate (approval_request event)
- Multiplexed WebSocket sessions
- Server-initiated notifications
- Independent background tasks (BullMQ)
- Task cancellation (AbortController)
- Edit-before-execute approval
- Cross-channel context

### HIGH Complexity (7-14 days each)
- Native tool calling mode (Claude tool_use blocks)
- Knowledge graph layer
- Fan-out/fan-in parallel execution
- Coordinated multi-agent workflows
- Confidence-based escalation
- MCP-compatible WebSocket transport
- OAuth token support with refresh
- Rich channel-specific message types

---

## MVP Recommendation

For the first milestone of this migration, prioritize in this order:

### Phase 1: Provider Abstraction + Claude Integration
1. **Provider interface** (refactor `Brain` into pluggable providers)
2. **Claude provider** (`@anthropic-ai/sdk` with streaming + tool use)
3. **Gemini provider** (extract existing code into provider interface)
4. **API key config per provider** (Redis + Settings UI)
5. **Provider fallback** (basic: if primary fails, try secondary)

**Rationale:** This is the foundation. Everything else depends on clean provider abstraction.

### Phase 2: Hybrid Memory
1. **Automatic memory extraction** (post-conversation fact extraction)
2. **Memory deduplication** (prevent accumulation)
3. **Context window optimization** (smart context assembly)
4. **Temporal awareness** (time-tagged memories)

**Rationale:** Memory quality directly impacts agent usefulness. Better memory = better agent.

### Phase 3: Additional Channels + WebSocket
1. **Slack provider** (Socket Mode -- no public endpoints needed)
2. **Matrix provider** (self-hosted friendly)
3. **JSON-RPC 2.0 WebSocket upgrade** (standardize existing WS)
4. **WebSocket authentication**

**Rationale:** Channels are well-abstracted already. WebSocket upgrade enables HITL.

### Phase 4: Human-in-the-Loop + Skills
1. **Tool approval gate** (configurable per-tool approval)
2. **SKILL.md manifest format** (OpenClaw compatibility)
3. **Skill directory structure** (directory-based skills)
4. **Skill installation from registry** (git-based)

**Rationale:** HITL needs WebSocket (Phase 3). Skills benefit from provider abstraction (Phase 1).

### Phase 5: Advanced Agent Coordination
1. **Independent background tasks** (BullMQ-based)
2. **Task status + cancellation**
3. **Fan-out/fan-in** (parallel subtask execution)

**Rationale:** Most complex features. Build on top of all previous phases.

## Defer to Post-Milestone

- **OAuth token support** -- Complex auth flow, low priority for API-key users
- **Knowledge graph** -- HIGH complexity, MEDIUM value for single-user
- **Native Claude tool calling** -- Significant refactor, JSON-in-text works adequately
- **Rich channel message types** -- Nice-to-have, text works
- **Coordinated multi-agent workflows** -- Ambitious, defer until single-agent is solid
- **Cost tracking dashboard** -- Useful but not blocking
- **MCP-compatible WebSocket transport** -- Nice interop, not critical
- **Visual workflow builder** -- Anti-feature, don't build

---

## Sources

### Claude API & Authentication
- [Anthropic Client SDKs](https://docs.anthropic.com/en/api/client-sdks) - HIGH confidence
- [Claude Streaming Messages API](https://platform.claude.com/docs/en/api/messages-streaming) - HIGH confidence
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing) - HIGH confidence
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript) - HIGH confidence
- [Claude Code Authentication](https://code.claude.com/docs/en/authentication) - MEDIUM confidence

### Multi-Provider Routing
- [LiteLLM Routing & Fallbacks](https://docs.litellm.ai/docs/routing-load-balancing) - HIGH confidence
- [OpenRouter Provider Routing](https://openrouter.ai/docs/guides/routing/provider-selection) - MEDIUM confidence
- [Portkey Fallback System Design](https://portkey.ai/blog/how-to-design-a-reliable-fallback-system-for-llm-apps-using-an-ai-gateway/) - MEDIUM confidence
- [Statsig Provider Fallbacks](https://www.statsig.com/perspectives/providerfallbacksllmavailability) - MEDIUM confidence

### Hybrid Memory Architecture
- [Mem0 Research Paper](https://arxiv.org/abs/2504.19413) - HIGH confidence
- [Mem0 Graph Memory](https://mem0.ai/blog/graph-memory-solutions-ai-agents) - MEDIUM confidence
- [Zep Temporal Knowledge Graph](https://blog.getzep.com/content/files/2025/01/ZEP__USING_KNOWLEDGE_GRAPHS_TO_POWER_LLM_AGENT_MEMORY_2025011700.pdf) - HIGH confidence
- [Graphiti Knowledge Graph Memory](https://medium.com/@saeedhajebi/building-ai-agents-with-knowledge-graph-memory-a-comprehensive-guide-to-graphiti-3b77e6084dec) - MEDIUM confidence
- [Mem0 npm Package](https://www.npmjs.com/package/mem0ai) - MEDIUM confidence

### OpenClaw Skills Architecture
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/skills) - HIGH confidence
- [OpenClaw GitHub](https://github.com/openclaw/openclaw) - HIGH confidence
- [ClawHub Skills Registry](https://navtools.ai/tool/clawhub-ai) - MEDIUM confidence
- [OpenClaw Custom Skill Creation](https://zenvanriel.nl/ai-engineer-blog/openclaw-custom-skill-creation-guide/) - MEDIUM confidence

### Channel SDKs
- [Slack Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/) - HIGH confidence
- [Slack Node SDK](https://slack.dev/node-slack-sdk/socket-mode/) - HIGH confidence
- [@vector-im/matrix-bot-sdk](https://www.npmjs.com/package/@vector-im/matrix-bot-sdk) - MEDIUM confidence
- [Matrix Bot SDK Intro](https://matrix.org/docs/older/matrix-bot-sdk-intro/) - MEDIUM confidence

### WebSocket RPC
- [JSON-RPC 2.0 over WebSocket](https://www.ituonline.com/tech-definitions/what-is-json-rpc-over-websocket/) - MEDIUM confidence
- [Bidirectional JSON-RPC](https://github.com/bigstepinc/jsonrpc-bidirectional) - MEDIUM confidence

### Human-in-the-Loop
- [HITL AI Agents Complete Guide](https://fast.io/resources/ai-agent-human-in-the-loop/) - MEDIUM confidence
- [Amazon Bedrock HITL](https://aws.amazon.com/blogs/machine-learning/implement-human-in-the-loop-confirmation-with-amazon-bedrock-agents/) - MEDIUM confidence
- [LangGraph HITL](https://docs.langchain.com/oss/python/langchain/human-in-the-loop) - MEDIUM confidence

### Agent Parallel Execution
- [Azure AI Agent Orchestration Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) - HIGH confidence
- [OpenAI Agents SDK Parallel Agents](https://cookbook.openai.com/examples/agents_sdk/parallel_agents) - MEDIUM confidence
- [Google ADK Parallel Agents](https://google.github.io/adk-docs/agents/workflow-agents/parallel-agents/) - MEDIUM confidence

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Claude API Integration | HIGH | Official docs verified, SDK well-documented, streaming + tool use confirmed |
| Multi-Provider Routing | MEDIUM-HIGH | Well-established pattern (LiteLLM, Portkey), but custom implementation needed |
| Hybrid Memory | MEDIUM | Academic patterns verified (Mem0, Zep), custom implementation complexity uncertain |
| Skill Marketplace | MEDIUM-HIGH | OpenClaw format documented, LivOS already has foundations |
| Channels (Slack/Matrix) | HIGH | Official SDKs verified, `ChannelProvider` interface already exists |
| WebSocket RPC | MEDIUM | JSON-RPC 2.0 standard, but MCP-compatible transport needs deeper research |
| Human-in-the-Loop | MEDIUM | Patterns well-documented, but WebSocket-based approval flow is custom |
| Parallel Execution | MEDIUM | Patterns known, but integration with existing BullMQ + AgentLoop needs design |
