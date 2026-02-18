# Current AI Architecture Analysis

**Analysis Date:** 2026-02-18

## System Overview

LivOS is a self-hosted AI-powered home server OS built as a monorepo with two main subsystems:

- **LivOS** (`livos/`): Frontend UI (React + Vite + Tailwind + shadcn/ui) and backend daemon (Express + tRPC), managed with pnpm
- **Nexus** (`nexus/`): AI core (Express + BullMQ + Redis), managed with npm

Nexus runs as a standalone backend process (port 3200) that LivOS communicates with via HTTP REST/SSE. They share a Redis instance for state coordination.

---

## 1. AI Pipeline: Message Flow

### 1.1 Entry Points

Messages enter the Nexus AI system through five pathways:

| Entry Point | Flow | File |
|---|---|---|
| **Web UI** | React UI -> tRPC -> livinityd AiModule -> SSE to Nexus `/api/agent/stream` | `livos/packages/ui/src/routes/ai-chat/index.tsx` -> `livos/packages/livinityd/source/modules/ai/index.ts` |
| **WebSocket** | JSON-RPC 2.0 WS -> `WsGateway` -> `AgentLoop` / `SdkAgentRunner` | `nexus/packages/core/src/ws-gateway.ts` |
| **REST SSE** | `POST /api/agent/stream` -> `AgentLoop` / `SdkAgentRunner` | `nexus/packages/core/src/api.ts:921` |
| **Redis Inbox** | `BLPOP nexus:inbox` -> `Daemon.addToInbox()` -> classify -> route | `nexus/packages/core/src/index.ts:333` |
| **Channel Messages** | Telegram/Discord/Slack/Matrix -> `ChannelManager.onMessage()` -> `Daemon.addToInbox()` | `nexus/packages/core/src/index.ts:390` |

### 1.2 Web UI Flow (Primary Path)

```
User types message in AI Chat UI
  -> trpcReact.ai.send.useMutation() or trpcReact.ai.stream.useSubscription()
    -> livos/packages/livinityd/source/modules/ai/routes.ts (tRPC route "send" or "stream")
      -> AiModule.chat(conversationId, message, onEvent?)
        -> HTTP POST to Nexus /api/agent/stream (SSE)
          -> api.ts creates AgentLoop or SdkAgentRunner
            -> AgentLoop.run(task) — ReAct loop with tool calling
              -> Brain.chat() or Brain.chatStream()
                -> ProviderManager.chat() or .chatStream()
                  -> ClaudeProvider (primary) or GeminiProvider (fallback)
            -> SSE events stream back (thinking, chunk, tool_call, observation, final_answer, done)
          -> AiModule parses SSE events
        -> tRPC forwards events to React UI via observable subscription
      -> React renders streaming response
```

### 1.3 Channel Message Flow (WhatsApp/Telegram/Discord)

```
Message arrives via channel adapter (e.g., Telegram bot)
  -> ChannelManager.onMessage()
    -> Daemon.addToInbox(text, 'telegram', undefined, {chatId}, chatId)
      -> For real-time channels: processInboxItem() immediately
      -> For others (mcp, cron): queued in inbox array for polling loop
        -> Daemon.cycle() processes queued items

processInboxItem():
  1. Check slash commands (/think, /verbose, /model, /reset)
  2. Check skill triggers (regex match against message)
  3. If skill matches: SkillLoader.execute()
  4. If no skill: Router.classify() (rule-based first, then AI classification)
  5. Router.route(intent) -> registered handler (shell, docker, agent, etc.)
  6. For complex tasks: 'agent' handler -> AgentLoop with complexity assessment
  7. Response sent back via sendChannelResponse() / sendWhatsAppResponse()
```

### 1.4 MCP Server Flow (External IDE Integration)

```
IDE (e.g., Claude Code) connects to MCP server
  -> nexus/packages/mcp-server/src/index.ts (port 3100, Streamable HTTP)
    -> MCP tools push to Redis queue: redis.lpush('nexus:inbox', ...)
    -> Some tools poll for answer: redis.get('nexus:answer:{requestId}')
    -> Nexus core processes via BLPOP and sends response back via Redis
```

### 1.5 Dual Agent Mode

The system supports two agent execution modes, selected based on Claude auth method:

| Mode | When Used | Class | How It Works |
|---|---|---|---|
| **API Key** (default) | `nexus:config:claude_auth_method` = `api-key` | `AgentLoop` | Custom ReAct loop with JSON-in-text (Gemini) or native tool_use (Claude) |
| **SDK Subscription** | `nexus:config:claude_auth_method` = `sdk-subscription` | `SdkAgentRunner` | Uses `@anthropic-ai/claude-agent-sdk` query(), spawns Claude Code CLI subprocess |

Selection logic in `nexus/packages/core/src/api.ts:966-988`:
```typescript
const authMethod = claudeProvider ? await claudeProvider.getAuthMethod() : 'api-key';
const useSdk = authMethod === 'sdk-subscription';
const agent = useSdk ? new SdkAgentRunner(agentConfig) : new AgentLoop(agentConfig);
```

---

## 2. AI Providers

### 2.1 Provider Architecture

```
Brain (nexus/packages/core/src/brain.ts)
  └── ProviderManager (nexus/packages/core/src/providers/manager.ts)
      ├── ClaudeProvider (nexus/packages/core/src/providers/claude.ts) — PRIMARY
      └── GeminiProvider (nexus/packages/core/src/providers/gemini.ts) — FALLBACK
```

**AIProvider Interface** (`nexus/packages/core/src/providers/types.ts`):
```typescript
export interface AIProvider {
  readonly id: string;
  readonly supportsVision: boolean;
  readonly supportsToolCalling: boolean;
  chat(options: ProviderChatOptions): Promise<ProviderChatResult>;
  chatStream(options: ProviderChatOptions): ProviderStreamResult;
  think(options: { prompt: string; systemPrompt?: string; tier?: ModelTier; maxTokens?: number }): Promise<string>;
  isAvailable(): Promise<boolean>;
  getModels(): Record<string, string>;
}
```

### 2.2 Provider Details

**ClaudeProvider** (`nexus/packages/core/src/providers/claude.ts`):
- SDK: `@anthropic-ai/sdk` (Anthropic)
- Models: `claude-haiku-4-5` (flash/haiku), `claude-sonnet-4-5` (sonnet), `claude-opus-4-6` (opus)
- API key: Redis `nexus:config:anthropic_api_key` or env `ANTHROPIC_API_KEY`
- Auth method: Redis `nexus:config:claude_auth_method` (`api-key` | `sdk-subscription`)
- Features: Vision (yes), Native tool calling (yes), OAuth PKCE login flow
- Supports both streaming and non-streaming

**GeminiProvider** (`nexus/packages/core/src/providers/gemini.ts`):
- SDK: `@google/generative-ai`
- Models: `gemini-3-flash-preview` (flash/haiku/sonnet), `gemini-3-pro-preview` (opus)
- API key: Redis `livos:config:gemini_api_key` or env `GEMINI_API_KEY`
- Features: Vision (yes), Native tool calling (no — uses JSON-in-text mode)
- Built-in retry with exponential backoff via `retryAsync()`

### 2.3 Fallback Strategy

`ProviderManager` tries providers in order: Claude first, Gemini second. Falls back on:
- HTTP 429 (rate limit), 502, 503, 529
- Timeout, ECONNRESET, socket hang up, fetch failed, ECONNREFUSED, "overloaded"

If a stream has already yielded chunks, fallback is NOT attempted (partial delivery).

### 2.4 Model Tier Mapping

| Tier | Claude | Gemini |
|---|---|---|
| flash | claude-haiku-4-5 | gemini-3-flash-preview |
| haiku | claude-haiku-4-5 | gemini-3-flash-preview |
| sonnet | claude-sonnet-4-5 | gemini-3-flash-preview |
| opus | claude-opus-4-6 | gemini-3-pro-preview |

---

## 3. Agent System

### 3.1 AgentLoop (`nexus/packages/core/src/agent.ts`)

The primary agent execution engine. Implements a ReAct (Reason + Act) loop:

**Loop Structure:**
1. Send task + system prompt + message history to Brain
2. Parse response: tool_call or final_answer
3. If tool_call: execute via ToolRegistry, add observation, continue
4. If final_answer: return result
5. Repeat until maxTurns, maxTokens, timeout, or completion

**Dual Parsing Mode:**
- **Claude native**: Uses `tools` parameter in API call; Claude returns `tool_use` content blocks
- **Gemini JSON-in-text**: Agent writes JSON `{"type":"tool_call","tool":"...","params":{...}}` in response text; parsed with `parseStep()`

**Key Config** (from `resolveAgentConfig()`):
```typescript
maxTurns: 30          // Max reasoning turns
maxTokens: 200000     // Total token budget
timeoutMs: 600000     // 10 minute timeout
tier: 'sonnet'        // Default model tier
maxDepth: 3           // Max subagent nesting
maxRetries: 3         // Transient error retries
retryDelayMs: 1000    // Exponential backoff base
```

**System Prompts:**
- `AGENT_SYSTEM_PROMPT` — for JSON-in-text mode (Gemini), includes tool descriptions in text
- `CLAUDE_NATIVE_SYSTEM_PROMPT` — for Claude native tool calling, no tool list in text

**Features:**
- Subagent spawning (recursive AgentLoop with scoped tool registry)
- Approval gate (human-in-the-loop via `ApprovalManager`)
- Tool policy filtering (profiles: minimal, basic, coding, messaging, full)
- Streaming events via EventEmitter (`thinking`, `chunk`, `tool_call`, `observation`, `final_answer`, `error`, `done`)
- User preferences (thinkLevel, verboseLevel, responseConfig, modelTier)

### 3.2 SdkAgentRunner (`nexus/packages/core/src/sdk-agent-runner.ts`)

Alternative agent that delegates to Claude Code CLI via the official SDK:

```typescript
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
```

- Converts Nexus tools to SDK MCP tool definitions (Zod schemas)
- Creates in-process MCP server hosting all Nexus tools
- Calls `query()` which spawns Claude Code CLI subprocess
- CLI handles its own OAuth auth (`~/.claude/.credentials.json`)
- Model mapping: opus -> claude-opus-4-6, sonnet -> claude-sonnet-4-5, haiku -> claude-haiku-4-5

### 3.3 Complexity-Based Routing

Before launching the agent, the Daemon assesses complexity via a quick flash-tier call (`nexus/packages/core/src/daemon.ts:930-944`):

```
Complexity 1-3: Standard agent (default tier, standard maxTurns)
Complexity 4-5: Enhanced agent (sonnet tier, maxTurns >= 20, methodical approach guidance)
```

### 3.4 Session Management

- `SessionManager` (`nexus/packages/core/src/session-manager.ts`): Manages conversation history per-sender in Redis
- `UserSessionManager` (`nexus/packages/core/src/user-session.ts`): Per-user preferences (think level, verbose level, model tier)
- Conversations stored in Redis with configurable idle timeout and reset triggers

---

## 4. Tool System

### 4.1 Tool Definition

```typescript
// nexus/packages/core/src/types.ts
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
  requiresApproval?: boolean;
}
```

### 4.2 ToolRegistry (`nexus/packages/core/src/tool-registry.ts`)

Central registry for all tools. Supports:
- Registration/unregistration
- Policy-based filtering (profiles: minimal, basic, coding, messaging, full)
- Conversion to Claude tool_use format
- Conversion to JSON schemas
- Approval requirement checking

### 4.3 Built-in Tools (registered in `Daemon.registerTools()`)

| Tool Name | Description | Source |
|---|---|---|
| `status` | Nexus daemon health status | `nexus/packages/core/src/daemon.ts:1070` |
| `logs` | Read daemon log file | `nexus/packages/core/src/daemon.ts:1085` |
| `shell` | Execute shell commands | `nexus/packages/core/src/daemon.ts:1104` |
| `docker_list` | List Docker containers | `nexus/packages/core/src/daemon.ts:1124` |
| `docker_manage` | Start/stop/restart/inspect/logs containers | `nexus/packages/core/src/daemon.ts:1135` |
| `docker_exec` | Execute command inside container | `nexus/packages/core/src/daemon.ts:1168` |
| `pm2` | PM2 process management | `nexus/packages/core/src/daemon.ts:1190` |
| `sysinfo` | System resource info (CPU, RAM, disk) | `nexus/packages/core/src/daemon.ts:1225` |
| `files` | File system operations (read/write/list/stat/delete/mkdir) | `nexus/packages/core/src/daemon.ts:1252` |
| `cron` | Schedule delayed task execution | `nexus/packages/core/src/daemon.ts:1311` |
| `scrape` | Web scraping via Firecrawl (localhost:3002) | `nexus/packages/core/src/daemon.ts:1339` |
| `whatsapp_send` | Send WhatsApp message to contact | `nexus/packages/core/src/daemon.ts:1372` |
| `memory_search` | Search long-term memory | `nexus/packages/core/src/daemon.ts:1419` |
| `memory_add` | Store info in long-term memory | `nexus/packages/core/src/daemon.ts:1463` |
| `web_search` | Google search via Firecrawl scraping | `nexus/packages/core/src/daemon.ts:1497` |
| `task_state` | Persistent key-value state (Redis-backed) | `nexus/packages/core/src/daemon.ts:1539` |
| `progress_report` | Send WhatsApp progress update mid-task | `nexus/packages/core/src/daemon.ts:1587` |
| `subagent_create` | Create persistent subagent | `nexus/packages/core/src/daemon.ts:1618` |
| `spawn_subagent` | (Virtual) Delegate subtask to child agent | Added dynamically in `AgentLoop.run()` |

### 4.4 MCP-Sourced Tools

External MCP servers register additional tools prefixed as `mcp_{serverName}_{toolName}`. Managed by:
- `McpClientManager` (`nexus/packages/core/src/mcp-client-manager.ts`): Connects to configured MCP servers, discovers tools, registers them
- `McpConfigManager` (`nexus/packages/core/src/mcp-config-manager.ts`): CRUD for MCP server configs in Redis
- Supported transports: `stdio` (child process) and `streamableHttp` (HTTP)
- Security: Command allowlist for stdio, SSRF protection for HTTP

### 4.5 Skill-Sourced Tools

Skills can export custom tools that get registered in the ToolRegistry:
```typescript
// In a skill file:
export const tools: Tool[] = [{ name: 'custom_tool', ... }];
```

---

## 5. MCP Integration

### 5.1 MCP Server (Nexus Exposes Tools to IDEs)

**File:** `nexus/packages/mcp-server/src/index.ts`
**Port:** 3100 (configurable via `MCP_PORT`)
**Protocol:** Streamable HTTP (`@modelcontextprotocol/sdk/server`)

Exposes Nexus capabilities as MCP tools that external clients (Claude Code, Cursor, etc.) can use:
- `nexus_task`, `nexus_status`, `nexus_logs`, `nexus_scrape`, `nexus_remember`
- `nexus_ask`, `nexus_test`, `nexus_cron`, `nexus_shell`
- `nexus_docker_manage`, `nexus_docker_exec`, `nexus_pm2`, `nexus_sysinfo`
- `nexus_agent`, `nexus_files`

Communication: MCP tools push to `nexus:inbox` Redis queue, poll `nexus:answer:{requestId}` for results.

### 5.2 MCP Client (Nexus Consumes External MCP Servers)

**File:** `nexus/packages/core/src/mcp-client-manager.ts`
**Protocol:** Both stdio and Streamable HTTP client

Connects to external MCP servers configured via the API or UI, discovers their tools, and registers them as Nexus tools with `mcp_` prefix.

### 5.3 SDK MCP Server (In-Process for Claude Code)

When using `SdkAgentRunner`, tools are exposed via `createSdkMcpServer()` from `@anthropic-ai/claude-agent-sdk`:
```typescript
const mcpServer = createSdkMcpServer({
  name: 'nexus-tools',
  tools: sdkTools,
});
```
This is an in-process MCP server passed to the SDK's `query()` call.

---

## 6. Skill System

### 6.1 Architecture

Skills are pluggable TypeScript/JavaScript modules loaded from the filesystem.

**SkillLoader** (`nexus/packages/core/src/skill-loader.ts`):
- Loads from `NEXUS_SKILLS_DIR` (default: `/opt/nexus/app/skills`)
- Parses YAML frontmatter from comment blocks
- Compiles regex trigger patterns
- Registers custom tools exported by skills
- Hot-reload via `fs.watch`

**Skill Types:**
- `simple`: Direct handler function
- `autonomous`: Spawns an AgentLoop with scoped tools and custom system prompt

### 6.2 Skill File Format

```typescript
/**
---
name: my-skill
description: Does something useful
triggers:
  - '^do something'
  - '^run my task'
tools:
  - shell
  - files
model_tier: sonnet
type: autonomous
max_turns: 15
---
*/

export async function handler(ctx: SkillContext): Promise<SkillResult> {
  // Simple skill: direct execution
  const result = await ctx.executeTool('shell', { cmd: 'uptime' });
  return { success: true, message: result.output };
}

// Or for autonomous skills:
export async function handler(ctx: SkillContext): Promise<SkillResult> {
  const agentResult = await ctx.runAgent({
    task: ctx.message,
    systemPrompt: 'You are a specialized agent...',
    tools: ['shell', 'files'],
    maxTurns: 10,
  });
  return { success: agentResult.success, message: agentResult.answer };
}
```

### 6.3 Skill Context (`SkillContext`)

Available to skill handlers:
- `message`: Raw user message
- `params`: Extracted parameters
- `source`: Message source channel
- `toolRegistry`: Full tool registry reference
- `executeTool(name, params)`: Scoped tool execution (only allowed tools)
- `runAgent(options)`: Spawn an AgentLoop with scoped tools
- `redis`: Scoped Redis helper (nexus:task_state: prefix)
- `sendProgress(message)`: Send WhatsApp progress update
- `think(prompt, options)`: Direct Brain.think() call

### 6.4 Skill Marketplace

- `SkillRegistryClient` (`nexus/packages/core/src/skill-registry-client.ts`): Fetches catalog from GitHub repo
- `SkillInstaller` (`nexus/packages/core/src/skill-installer.ts`): Downloads, validates, installs skills
- Default registry: `https://github.com/utopusc/livinity-skills`
- Install dir: `/opt/nexus/skills/marketplace`

### 6.5 Skill Generator

`SkillGenerator` (`nexus/packages/core/src/skill-generator.ts`): AI-powered skill creation — generates skill files from natural language descriptions using Brain.think().

---

## 7. Memory System

### 7.1 Memory Service

**File:** `nexus/packages/memory/src/index.ts`
**Port:** 3300 (configurable via `MEMORY_PORT`)
**Storage:** SQLite (`better-sqlite3`) at `/opt/nexus/data/memory/memory.db`

**Features:**
- Semantic search with Gemini embeddings (`text-embedding-004`)
- Time-decay scoring (70% relevance + 30% recency, 30-day half-life)
- Automatic deduplication (cosine similarity threshold 0.92)
- Session binding (link memories to agent sessions)
- REST API with X-API-Key auth

**Endpoints:**
- `POST /add` — Add memory (with dedup)
- `POST /search` — Semantic search
- `POST /context` — Assemble memory context within token budget
- `GET /memories/:userId` — List user memories
- `DELETE /memories/:id` — Delete memory
- `POST /reset` — Reset memories

### 7.2 Memory Extraction Pipeline

**File:** `nexus/packages/core/src/index.ts:165-256`
**Queue:** BullMQ `nexus-memory-extraction`

After each conversation, a BullMQ job extracts memorable facts:
1. Flash-tier Gemini call with extraction prompt
2. Parses JSON array of memory strings
3. Stores each (max 5) via HTTP to memory service at localhost:3300
4. Concurrency: 2 workers

### 7.3 Memory in Agent Context

When the `agent` handler fires (`nexus/packages/core/src/daemon.ts:895-927`):
1. Fetches relevant memories via `POST localhost:3300/context` (2s timeout, best-effort)
2. Prepends memory context to the task string
3. Agent also has `memory_search` and `memory_add` tools for on-demand access

---

## 8. Messaging Channels

### 8.1 Channel Architecture

**ChannelManager** (`nexus/packages/core/src/channels/index.ts`):
- Manages multiple messaging platform adapters
- Unified `onMessage()` callback for all channels
- Config stored in Redis as `nexus:{channel}:config`

**Adapters:**
| Channel | File | Protocol |
|---|---|---|
| Telegram | `nexus/packages/core/src/channels/telegram.ts` | Telegram Bot API |
| Discord | `nexus/packages/core/src/channels/discord.ts` | Discord.js |
| Slack | `nexus/packages/core/src/channels/slack.ts` | Slack Bolt |
| Matrix | `nexus/packages/core/src/channels/matrix.ts` | Matrix SDK |
| WhatsApp | External process, uses Redis `nexus:wa_outbox` / `nexus:inbox` | Baileys via separate process |

### 8.2 Response Routing

Per-request response routing uses closure-captured context from the InboxItem:
- `sendWhatsAppResponse()`: Pushes to `nexus:wa_outbox` Redis queue
- `sendChannelResponse()`: Uses `ChannelManager.sendMessage()` for Telegram/Discord/Slack/Matrix

---

## 9. Frontend AI Components

### 9.1 AI Chat Page

**File:** `livos/packages/ui/src/routes/ai-chat/index.tsx`

Full-featured chat interface with:
- Conversation list (sidebar)
- Message history with markdown rendering (ReactMarkdown + remark-gfm)
- Tool call display (expandable with params and output)
- MCP panel (lazy-loaded, `ai-chat/mcp-panel.tsx`)
- Skills panel (lazy-loaded, `ai-chat/skills-panel.tsx`)
- Mobile-responsive with drawer navigation
- tRPC integration for all operations

### 9.2 AI Config Page (Settings)

**File:** `livos/packages/ui/src/routes/settings/ai-config.tsx`

- API key management (Gemini + Anthropic, with validation)
- Claude auth method toggle (API Key vs SDK Subscription)
- Claude CLI OAuth login flow (PKCE)
- Primary provider selection

### 9.3 Nexus Config Page (Settings)

**File:** `livos/packages/ui/src/routes/settings/nexus-config.tsx`

- Full Nexus config editing (agent defaults, retry, session, tools, heartbeat, response style, approval, tasks)

### 9.4 Integrations Page (Settings)

**File:** `livos/packages/ui/src/routes/settings/integrations.tsx`

- Telegram, Discord, Slack, Matrix channel configuration
- Connection testing

### 9.5 Subagents Page

**File:** `livos/packages/ui/src/routes/subagents/`

- CRUD for persistent subagents
- Schedule/cron management

### 9.6 tRPC Bridge Layer

**File:** `livos/packages/livinityd/source/modules/ai/routes.ts`

The tRPC router bridges the LivOS frontend to Nexus:
- `ai.getConfig` / `ai.setConfig` — API key management via Redis
- `ai.send` / `ai.stream` — Chat via SSE to Nexus `/api/agent/stream`
- `ai.getNexusConfig` / `ai.updateNexusConfig` — Config management via Nexus REST API
- `ai.listSubagents` / `ai.createSubagent` / etc. — Subagent CRUD via Nexus REST API
- `ai.getClaudeCliStatus` / `ai.startClaudeLogin` / etc. — Claude auth management
- `ai.getChannels` / `ai.updateChannel` / `ai.testIntegration` — Channel management
- `ai.listTools` — Tool registry listing
- `ai.listDockerContainers` / `ai.manageDockerContainer` — Direct Docker management

---

## 10. Configuration System

### 10.1 Nexus Configuration

**Schema:** `nexus/packages/core/src/config/schema.ts` (Zod validation)
**Manager:** `nexus/packages/core/src/config/manager.ts`
**Storage:** Redis key `nexus:config`

Full configuration sections:
```
NexusConfig {
  version, retry, models, agent, subagents,
  tools, exec, session, memory, contextPruning,
  heartbeat, tts, logging, diagnostics, api,
  channels, skills, messageQueue, response,
  approval, tasks
}
```

### 10.2 Key Redis Keys

| Key | Purpose | Set By |
|---|---|---|
| `livos:config:gemini_api_key` | Gemini API key | Settings UI |
| `nexus:config:anthropic_api_key` | Anthropic API key | Settings UI |
| `nexus:config:claude_auth_method` | `api-key` or `sdk-subscription` | Settings UI |
| `nexus:config:primary_provider` | `claude` or `gemini` | Settings UI |
| `nexus:config` | Full NexusConfig JSON | ConfigManager |
| `nexus:inbox` | Incoming message queue (list) | MCP server, channels |
| `nexus:wa_outbox` | WhatsApp outgoing messages (list) | Daemon, tools |
| `nexus:answer:{requestId}` | MCP polling responses | Daemon |
| `nexus:{channel}:config` | Channel adapter config | Settings UI |
| `nexus:{channel}:status` | Channel connection status | Channel adapters |
| `nexus:{channel}:last_chat_id` | Last active chat for heartbeat | Message handler |
| `nexus:mcp:status:{name}` | MCP server connection status | McpClientManager |
| `nexus:task_state:{key}` | Persistent task state | task_state tool |
| `liv:ui:conv:{id}` | Conversation history | AiModule |
| `liv:ui:convs` | Conversation ID set | AiModule |

### 10.3 Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `API_PORT` | `3200` | Nexus API port |
| `API_HOST` | `127.0.0.1` | Nexus API bind host |
| `GEMINI_API_KEY` | — | Gemini API key fallback |
| `ANTHROPIC_API_KEY` | — | Anthropic API key fallback |
| `NEXUS_BASE_DIR` | `/opt/nexus` | Nexus root directory |
| `NEXUS_SKILLS_DIR` | `/opt/nexus/app/skills` | Skills directory |
| `AGENT_MAX_TURNS` | `30` | Agent max turns |
| `AGENT_MAX_TOKENS` | `200000` | Agent token budget |
| `AGENT_TIMEOUT_MS` | `600000` | Agent timeout |
| `AGENT_TIER` | `sonnet` | Default model tier |
| `AGENT_MAX_DEPTH` | `3` | Max subagent nesting |
| `LIV_API_KEY` | — | API key for inter-service auth |
| `NEXUS_API_URL` / `LIV_API_URL` | `http://localhost:3200` | Nexus API URL (from livinityd) |
| `MCP_PORT` | `3100` | MCP server port |
| `MEMORY_PORT` | `3300` | Memory service port |
| `MEMORY_DATA_DIR` | `/opt/nexus/data/memory` | Memory SQLite path |
| `SKILL_REGISTRY_URL` | `https://github.com/utopusc/livinity-skills` | Skill marketplace repo |

---

## 11. Supporting Subsystems

### 11.1 Router (`nexus/packages/core/src/router.ts`)

Intent classification with two-phase approach:
1. **Rule-based**: Regex patterns for common commands (shell, docker, pm2, sysinfo, cron, etc.)
2. **AI-based**: Flash-tier Gemini call to classify ambiguous inputs

Short messages (<80 chars) skip AI classification and go directly to `ask` (agent) handler.

### 11.2 Subagent Manager (`nexus/packages/core/src/subagent-manager.ts`)

Persistent, named AI agents with:
- Custom system prompts and tool scoping
- Cron-based scheduling via `ScheduleManager`
- Continuous loop execution via `LoopRunner`
- CRUD stored in Redis

### 11.3 Heartbeat Runner (`nexus/packages/core/src/heartbeat-runner.ts`)

Periodic AI-generated messages sent to configured channels. Configurable interval, active hours, and target channels.

### 11.4 Approval Manager (`nexus/packages/core/src/approval-manager.ts`)

Human-in-the-loop tool approval:
- Policies: `always` (all tools), `destructive` (only requiresApproval tools), `never`
- Creates pending requests, waits for resolution (5 min timeout)
- Audit trail in Redis
- Exposed via REST API and WebSocket

### 11.5 Task Manager (`nexus/packages/core/src/task-manager.ts`)

BullMQ-based parallel task execution:
- Submit tasks that run as independent AgentLoop instances
- Configurable concurrency (default 4)
- Per-task token budget, timeout, max turns

### 11.6 WebSocket Gateway (`nexus/packages/core/src/ws-gateway.ts`)

JSON-RPC 2.0 WebSocket gateway:
- Auth on upgrade (API key header or JWT query param)
- Methods: `agent.run`, `agent.cancel`, `tools.list`, `system.ping`
- Multiplexed concurrent agent sessions per connection
- Redis pub/sub for notification delivery

### 11.7 Worker (`nexus/packages/worker/src/index.ts`)

Separate process for background BullMQ job processing.

---

## 12. Service Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        LivOS Frontend                            │
│  React 18 + Vite + Tailwind + shadcn/ui + Framer Motion         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ AI Chat  │  │ Settings │  │Subagents │  │ MCP/Skills│        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       └──────────────┴──────────────┴──────────────┘             │
│                           │ tRPC                                 │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                    livinityd (tRPC server)                        │
│  ┌──────────────────────────────────────┐                        │
│  │ AiModule - bridges UI to Nexus       │                        │
│  │ (SSE client, conversation storage)   │                        │
│  └────────────────┬─────────────────────┘                        │
│                   │ HTTP SSE / REST                               │
└───────────────────┼──────────────────────────────────────────────┘
                    │
┌───────────────────┼──────────────────────────────────────────────┐
│              Nexus Core (port 3200)                               │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐             │
│  │  API Server │  │ WS Gateway  │  │   Daemon     │             │
│  │  (Express)  │  │ (JSON-RPC)  │  │ (main loop)  │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘             │
│         └────────────────┴────────────────┘                      │
│                          │                                       │
│  ┌───────────────────────┼──────────────────────────────┐        │
│  │              AgentLoop / SdkAgentRunner               │        │
│  │  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │        │
│  │  │  Brain   │  │ ToolRegistry │  │ SkillLoader   │  │        │
│  │  └────┬─────┘  └──────┬───────┘  └───────┬───────┘  │        │
│  │       │               │                   │          │        │
│  │  ┌────┴─────┐    ┌────┴─────┐      ┌─────┴─────┐   │        │
│  │  │Provider  │    │Built-in  │      │ Skill     │   │        │
│  │  │Manager   │    │Tools(17+)│      │ Files     │   │        │
│  │  │ Claude   │    │+ MCP     │      │ + Market  │   │        │
│  │  │ Gemini   │    │Tools     │      │ place     │   │        │
│  │  └──────────┘    └──────────┘      └───────────┘   │        │
│  └──────────────────────────────────────────────────────┘        │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐         │
│  │ Channel     │  │ Subagent     │  │ Task Manager    │         │
│  │ Manager     │  │ Manager      │  │ (BullMQ)        │         │
│  │ TG/DC/Slack │  │ + Scheduler  │  │                 │         │
│  └─────────────┘  └──────────────┘  └─────────────────┘         │
└──────────────────────────────────────────────────────────────────┘
                    │                           │
          ┌────────┴────────┐         ┌────────┴────────┐
          │    Redis 6+     │         │ Memory Service  │
          │ (State, Queues, │         │ (port 3300)     │
          │  Config, PubSub)│         │ SQLite + Gemini │
          └─────────────────┘         │ Embeddings      │
                                      └─────────────────┘

External:
  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
  │ MCP Server    │  │ Firecrawl     │  │ WhatsApp      │
  │ (port 3100)   │  │ (port 3002)   │  │ (Baileys)     │
  │ IDE ↔ Nexus   │  │ Web scraping  │  │ Redis bridge  │
  └───────────────┘  └───────────────┘  └───────────────┘
```

---

## 13. Key Architectural Observations

### Strengths
1. **Provider abstraction with automatic fallback** — Claude primary, Gemini fallback, transparent to callers
2. **Dual agent mode** — API-key (AgentLoop) and SDK-subscription (SdkAgentRunner) coexist
3. **Extensible tool system** — Built-in, MCP-sourced, and skill-sourced tools all in one registry
4. **Multi-channel support** — Telegram, Discord, Slack, Matrix, WhatsApp all route through the same processing pipeline
5. **Memory system** — Semantic search with embeddings, time-decay scoring, automatic extraction
6. **Human-in-the-loop** — Approval manager for destructive tool calls

### Concerns
1. **Gemini uses JSON-in-text** — Not native tool calling; relies on prompt engineering and JSON parsing with regex fallbacks
2. **Two different system prompts** — `AGENT_SYSTEM_PROMPT` (Gemini) vs `CLAUDE_NATIVE_SYSTEM_PROMPT` (Claude) diverge
3. **Large Daemon class** — `daemon.ts` is 1600+ lines, handles tool registration, routing, channel management, and agent orchestration
4. **Memory service is a separate HTTP process** — No in-process option; requires `localhost:3300` to be running
5. **WhatsApp uses Redis queue bridge** — Not a proper channel adapter like Telegram/Discord
6. **Tool duplication** — Router handlers (shell, docker, files) duplicate tool implementations; both exist simultaneously
7. **Firecrawl dependency** — Web search and scraping rely on Firecrawl at localhost:3002
