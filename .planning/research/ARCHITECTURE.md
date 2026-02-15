# Architecture Research: Claude Migration & AI Platform Integration

**Dimension:** Architecture
**Milestone:** v1.5 — Claude Migration & AI Platform
**Date:** 2026-02-15

## Executive Summary

The migration from Gemini to Claude touches the AI abstraction layer (Brain class), the agent execution engine (AgentLoop), streaming infrastructure, and auth flow. OpenClaw-inspired features (multi-provider, hybrid memory, skill marketplace, expanded channels, WebSocket gateway) integrate at well-defined seams in the existing architecture.

## Current Architecture Analysis

### AI Pipeline (what changes)

```
User Message
  → Daemon.handleInbox()        # Routes by source (WhatsApp, Telegram, Discord, API, Web)
  → Brain.selectTier()           # Classifies intent → model tier (none/flash/haiku/sonnet/opus)
  → AgentLoop.run()              # ReAct loop: think → tool_call → observe → repeat
    → Brain.chatStream()         # Gemini SDK: generateContentStream()
    → parseStep()                # JSON response → {type, tool, params} or {type, answer}
    → ToolRegistry.execute()     # 25+ tools + MCP tools
  → Response back to channel
```

**Key coupling points to Gemini:**
1. `brain.ts:1` — `import { GoogleGenerativeAI } from '@google/generative-ai'`
2. `brain.ts:68-73` — `GEMINI_MODELS` mapping (flash/haiku/sonnet/opus → model names)
3. `brain.ts:90-115` — `getGeminiClient()` — API key from Redis/env
4. `brain.ts:134-171` — `chat()` — Gemini `generateContent()` with Gemini response format
5. `brain.ts:174-259` — `chatStream()` — Gemini `generateContentStream()` with stream format
6. `brain.ts:261-274` — `geminiCall()` — Simple completion
7. `brain.ts:276-294` — `selectTier()` — Tier selection (model-agnostic, keep as-is)

**Key coupling points in AgentLoop:**
- `agent.ts:302-332` — Calls `brain.chatStream()` / `brain.chat()` — these return generic interfaces
- The AgentLoop itself is **model-agnostic** — it only cares about `{text, inputTokens, outputTokens}`
- Tool calling is done via JSON in the response text (ReAct pattern), NOT via native tool_use blocks

### Memory Service (what extends)

```
Current: nexus/packages/memory/ (port 3300)
  → PostgreSQL + pgvector
  → Embeddings via Gemini embedding model
  → API: POST /add, POST /search, POST /recent
```

For hybrid memory, extend this service with:
- Long-term memory layer (already partially exists — `memory_add` / `memory_search` tools)
- Graph relationships between memories (new — requires schema extension)
- Session context binding (new — tie memories to conversation sessions)

### Channel System (what extends)

```
Current: nexus/packages/core/src/channels/
  → ChannelManager — manages Telegram + Discord adapters
  → WhatsApp — separate (baileys via wa-bridge, Redis inbox/outbox)
  → Web UI — via tRPC API + SSE streaming
```

New channels (Slack, Matrix) follow the same adapter pattern:
- Implement `ChannelAdapter` interface
- Register in `ChannelManager`
- Message normalization already handled

## Integration Architecture for New Features

### 1. Brain Class Migration (MODIFY — brain.ts)

Replace Gemini SDK with Anthropic SDK. The Brain class interface stays the same — only internals change.

```
Before:                              After:
GoogleGenerativeAI                   Anthropic (from @anthropic-ai/sdk)
generateContent()                    messages.create()
generateContentStream()              messages.stream()
GEMINI_MODELS mapping                CLAUDE_MODELS mapping
Redis key: gemini_api_key            Redis key: claude_auth_token
```

**Critical design decision:** Use Claude's Messages API with subscription token auth. The `claude setup-token` CLI generates a token that works with the Anthropic SDK when passed as the API key.

### 2. Multi-Provider Abstraction (NEW — provider.ts)

Create a provider abstraction layer ABOVE Brain:

```typescript
// New file: nexus/packages/core/src/providers/
interface AIProvider {
  chat(options: ChatOptions): Promise<ChatResult>
  chatStream(options: ChatOptions): ChatStreamResult
  think(options: ThinkOptions): Promise<string>
  isAvailable(): Promise<boolean>
}

class ClaudeProvider implements AIProvider { ... }    // Primary
class GeminiProvider implements AIProvider { ... }    // Fallback
class OpenAIProvider implements AIProvider { ... }    // Optional

class ProviderManager {
  private providers: Map<string, AIProvider>
  private primary: string  // 'claude'

  async chat(options): Promise<ChatResult> {
    // Try primary, fallback to others
  }
}
```

Brain class becomes a thin wrapper around ProviderManager.

### 3. Subscription Token Management (MODIFY — brain.ts + NEW — auth/)

```
Token flow:
  install.sh installs Claude Code CLI
  → User clicks "Connect Claude" in LivOS UI
  → UI opens terminal/popup to run `claude setup-token`
  → Token stored in Redis: livos:config:claude_auth_token
  → Brain reads token on each request (same pattern as current gemini_api_key)
```

**New components:**
- `livos/packages/livinityd/source/modules/auth/claude-auth.ts` — Token management
- `livos/packages/ui/src/routes/settings/claude-auth.tsx` — UI settings page
- tRPC endpoint: `settings.claudeAuth.getStatus` / `settings.claudeAuth.setToken`

### 4. Hybrid Memory (EXTEND — memory service)

```
Current memory service (port 3300):
  PostgreSQL + pgvector
  └── memories table (content, embedding, metadata, created_at)

Extended architecture:
  PostgreSQL + pgvector
  ├── memories table (existing — vector search)
  ├── memory_sessions table (NEW — session-bound context)
  ├── memory_relations table (NEW — graph edges between memories)
  └── memory_entities table (NEW — extracted entities for graph)

  Redis (existing):
  ├── Session context cache (conversation history)
  └── Memory access patterns (for relevance scoring)
```

No new database — extend PostgreSQL schema. No Neo4j/DynamoDB needed (OpenClaw's scale ≠ our scale).

### 5. Skill Marketplace (EXTEND — skill system)

```
Current skill system:
  nexus/packages/core/src/skill-loader.ts
  → Loads .js files from /opt/nexus/skills/
  → Hot-reload via file watcher
  → SkillGenerator creates skills from AI

Extended architecture:
  nexus/packages/core/src/skills/
  ├── skill-loader.ts (existing — local file loading)
  ├── skill-registry.ts (NEW — catalog of available skills)
  ├── skill-marketplace.ts (NEW — discover/install from GitHub)
  └── skill-manifest.ts (NEW — manifest schema for publishable skills)

  Gallery approach (reuse existing pattern):
  → Skills published as GitHub repos with manifest.json
  → skill-marketplace.ts fetches catalog, user installs
  → Same pattern as app-store gallery
```

### 6. WebSocket Gateway (EXTEND — api.ts)

```
Current:
  api.ts → setupWebSocket(httpServer) — basic WS for streaming

Extended:
  api.ts → setupWebSocket(httpServer) — enhanced with:
  ├── RPC message routing (method + params + id)
  ├── Bidirectional streaming (agent events ↔ user commands)
  ├── Connection auth (JWT token in handshake)
  └── Channel multiplexing (multiple conversations per connection)
```

No separate gateway service needed — extend existing WebSocket setup.

### 7. Channel Expansion (EXTEND — channels/)

```
New adapter files:
  nexus/packages/core/src/channels/
  ├── telegram.ts (existing)
  ├── discord.ts (existing)
  ├── slack.ts (NEW — @slack/bolt)
  ├── matrix.ts (NEW — matrix-js-sdk)
  └── index.ts (existing ChannelManager — register new adapters)
```

Each adapter: ~150-200 LOC following existing pattern.

### 8. Agent Enhancements (MODIFY — agent.ts)

```
Current capabilities:
  ✓ Sub-agent spawning (spawn_subagent tool)
  ✓ Tool policy (allow/deny lists)
  ✓ Streaming events
  ✓ Configurable tiers/tokens/turns

New capabilities:
  → Parallel sub-agent execution (Promise.all for independent subtasks)
  → Human-in-the-loop (pause agent, ask user, resume)
  → Agent memory persistence (save/restore agent state across sessions)
```

## Suggested Build Order

Based on dependencies and risk:

1. **Brain → Claude migration** (highest risk, core dependency)
   - Replace Gemini SDK with Anthropic SDK
   - Update model mapping
   - Test all existing functionality works

2. **Auth flow** (enables everything else)
   - install.sh Claude Code CLI install
   - Token storage in Redis
   - Settings UI for token management

3. **Multi-provider abstraction** (reduces risk)
   - Provider interface
   - Claude + Gemini providers
   - Fallback mechanism

4. **Streaming format update** (frontend impact)
   - Claude streaming format → SSE events
   - Frontend handles new format
   - Test web UI, API streaming

5. **Memory enhancement** (independent)
   - Schema migration
   - Graph relations
   - Session context binding

6. **Skill marketplace** (independent)
   - Manifest schema
   - GitHub-based discovery
   - Install/uninstall flow

7. **Channel expansion** (independent)
   - Slack adapter
   - Matrix adapter
   - Test with existing message flow

8. **WebSocket gateway enhancement** (independent)
   - RPC message format
   - Bidirectional streaming
   - Connection management

9. **Agent enhancements** (depends on 1, 3)
   - Parallel sub-agents
   - Human-in-the-loop
   - State persistence

## Component Dependency Graph

```
Brain Migration ──→ Multi-Provider ──→ Agent Enhancements
       │                                       │
       ▼                                       ▼
  Auth Flow ──→ Settings UI ──→ install.sh   Parallel Execution
       │                                    Human-in-the-loop
       ▼
  Streaming Update ──→ Frontend SSE

Memory Enhancement (independent)
Skill Marketplace (independent)
Channel Expansion (independent)
WebSocket Gateway (independent)
```

## What NOT to Build

| Skip | Reason |
|------|--------|
| Separate gateway process | Our scale doesn't need it — extend Express |
| Neo4j for graph memory | PostgreSQL adjacency list sufficient |
| DynamoDB for long-term memory | PostgreSQL already handles it |
| Pinecone for vectors | pgvector already works |
| Pi-like agent runtime | Our AgentLoop is equivalent and simpler |
| Custom OAuth server | `claude setup-token` handles auth |
| Kubernetes orchestration | Docker Compose sufficient for self-hosted |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Claude streaming format differs significantly | High | High | Build adapter layer, test thoroughly |
| Subscription token expires/revokes | Medium | High | Token refresh mechanism, clear error messaging |
| Tool calling format incompatibility | Medium | High | Our ReAct pattern is text-based (JSON in response), not native tool_use — minimal impact |
| Memory migration breaks existing data | Low | High | Schema migration with rollback |
| Multi-provider adds too much complexity | Medium | Medium | Start with Claude-only, add providers incrementally |
