# Architecture

**Analysis Date:** 2026-02-03

## Pattern Overview

**Overall:** Distributed AI-Powered Home Server OS

LivOS is a self-hosted operating system with an integrated AI agent (Nexus). The architecture follows a microservices pattern with two main systems communicating via Redis:

1. **LivOS (livinityd)** - The home server OS backend with web UI
2. **Nexus** - The autonomous AI agent system with multi-channel messaging

**Key Characteristics:**
- Event-driven communication via Redis queues and pub/sub
- Monorepo with pnpm workspaces
- TypeScript throughout (Node.js 22+)
- PM2 for process management in production
- Caddy as reverse proxy for HTTPS and subdomain routing

## System Architecture

```
                                 [Internet]
                                     |
                                  [Caddy]
                                     |
                    +----------------+----------------+
                    |                                 |
             livinity.cloud:443                 *.livinity.cloud
                    |                                 |
               [livinityd]                    [Docker Apps]
                 :8080                         Immich, Vikunja, n8n
                    |
                    |---- [React UI] (served by livinityd)
                    |
             [Redis] <---- pub/sub & queues ----> [Nexus Core]
               :6379                                 :3200
                                                      |
                                    +-----------------+-----------------+
                                    |         |       |        |        |
                              [WhatsApp] [Telegram] [MCP]  [Worker] [Memory]
                                         [Discord]  :3100            :3300
```

## Layers

**Presentation Layer (livos/packages/ui):**
- Purpose: React SPA with desktop-like windowed interface
- Location: `livos/packages/ui/src/`
- Contains: React components, providers, routing, tRPC client
- Depends on: livinityd tRPC API
- Used by: End users via browser

**API Layer (livos/packages/livinityd):**
- Purpose: Backend server for LivOS, serves UI, manages apps, files, users
- Location: `livos/packages/livinityd/source/`
- Contains: Express server, tRPC router, module system
- Depends on: Docker, filesystem, Redis
- Used by: UI, external API clients

**AI Core Layer (nexus/packages/core):**
- Purpose: Autonomous AI agent daemon with tool execution
- Location: `nexus/packages/core/src/`
- Contains: Daemon, Brain (LLM), Agent loop, Tool registry, Skill loader
- Depends on: Redis, Gemini API, external services
- Used by: Messaging channels, API clients, scheduled tasks

**Messaging Layer (nexus/packages/*):**
- Purpose: Multi-channel communication (WhatsApp, Telegram, Discord)
- Location: `nexus/packages/whatsapp/`, `nexus/packages/core/src/channels/`
- Contains: Channel adapters, message routing
- Depends on: Nexus Core, platform SDKs
- Used by: End users via messaging apps

**Background Jobs Layer (nexus/packages/worker):**
- Purpose: Async job processing (scraping, research, lead generation)
- Location: `nexus/packages/worker/src/`
- Contains: BullMQ worker, job handlers
- Depends on: Redis, Nexus Core
- Used by: Nexus Core for long-running tasks

## Data Flow

**User Chat Flow (UI to AI):**

1. User sends message via LivOS UI AI Chat window
2. UI calls livinityd tRPC `ai.chat` mutation
3. livinityd AiModule forwards to Nexus Core via HTTP SSE (`/api/agent/stream`)
4. Nexus AgentLoop processes with Gemini, executes tools
5. SSE stream sends events back: thinking, tool_call, observation, final_answer
6. livinityd AiModule parses stream, saves conversation to Redis
7. UI receives final response

**WhatsApp/Telegram Flow:**

1. User sends message to bot
2. Channel adapter receives message, publishes to `nexus:inbox` Redis queue
3. Nexus Core BLPOP picks up message, creates InboxItem
4. Daemon processes through AgentLoop
5. Response pushed to `nexus:wa_outbox` or sent via ChannelManager
6. Channel adapter delivers response to user

**State Management:**

- **Redis**: Primary state store for both systems
  - Session data, conversation history
  - Config settings, API keys
  - Message queues (inbox, outbox)
  - Job queue (BullMQ)
- **SQLite**: Memory service for AI embeddings
- **YAML**: LivOS persistent config (`livinity.yaml`)

## Key Abstractions

**Daemon (`nexus/packages/core/src/daemon.ts`):**
- Purpose: Central orchestrator for Nexus AI system
- Size: ~3000 lines - handles inbox, tools, skills, scheduling
- Pattern: Event loop with inbox queue processing

**Brain (`nexus/packages/core/src/brain.ts`):**
- Purpose: LLM abstraction layer (Gemini models)
- Methods: `think()`, `chat()`, `chatStream()`
- Pattern: Tiered model selection (flash/haiku/sonnet/opus)

**AgentLoop (`nexus/packages/core/src/agent.ts`):**
- Purpose: ReAct-style agent execution
- Pattern: Think -> Act -> Observe loop with tool calling
- Supports: Streaming, subagents, configurable depth/turns

**ToolRegistry (`nexus/packages/core/src/tool-registry.ts`):**
- Purpose: Centralized tool management
- Methods: `register()`, `execute()`, `listForPrompt()`
- Pattern: Policy-based filtering (profiles, allow/deny lists)

**Skill (`nexus/skills/*.ts`):**
- Purpose: Reusable task templates with tool combinations
- Examples: `server-health.ts`, `research.ts`, `deploy.ts`
- Pattern: YAML frontmatter + TypeScript handler

**Livinityd (`livos/packages/livinityd/source/index.ts`):**
- Purpose: Main LivOS server class
- Contains: Module initialization, lifecycle management
- Modules: Server, User, Apps, Files, Notifications, Backups, AI

## Entry Points

**LivOS Production (`livos/packages/livinityd/source/cli.ts`):**
- Location: `livos/packages/livinityd/source/cli.ts`
- Triggers: PM2 via `ecosystem.config.cjs`
- Responsibilities: Parse args, create Livinityd instance, start server on :8080

**Nexus Core (`nexus/packages/core/src/index.ts`):**
- Location: `nexus/packages/core/src/index.ts`
- Triggers: PM2 via `ecosystem.config.cjs`
- Responsibilities: Initialize all managers, start daemon, API on :3200, WebSocket

**Nexus MCP Server (`nexus/packages/mcp-server/src/index.ts`):**
- Location: `nexus/packages/mcp-server/src/index.ts`
- Triggers: PM2
- Responsibilities: MCP protocol endpoint on :3100 for Claude/Cursor integration

**Nexus Worker (`nexus/packages/worker/src/index.ts`):**
- Location: `nexus/packages/worker/src/index.ts`
- Triggers: PM2
- Responsibilities: BullMQ worker for async jobs

**Nexus Memory (`nexus/packages/memory/src/index.ts`):**
- Location: `nexus/packages/memory/src/index.ts`
- Triggers: PM2
- Responsibilities: SQLite-based memory with Gemini embeddings on :3300

## Error Handling

**Strategy:** Graceful degradation with retry and logging

**Patterns:**
- Exponential backoff with jitter for LLM calls (`nexus/packages/core/src/infra/retry.ts`)
- Transient error detection for automatic retries
- SSE stream reconnection in UI
- PM2 auto-restart on process crash
- Redis connection retry

## Cross-Cutting Concerns

**Logging:**
- livinityd: Custom logger with child loggers per module
- Nexus: Winston-style logger (`logger.ts`)
- PM2: Separate log files per service

**Validation:**
- Zod schemas for tRPC inputs (livinityd)
- Zod schemas for Nexus config (`nexus/packages/core/src/config/schema.ts`)

**Authentication:**
- LivOS UI: JWT tokens stored in cookies
- Nexus API: Optional API key header (`X-API-Key`)
- Inter-service: Redis password, shared keys

**Configuration:**
- livinityd: YAML file store + env vars
- Nexus: Redis-stored config with schema validation
- Both: `.env` files for secrets

## Deployment Architecture (Server)

**Server:** 45.137.194.103 (Contabo VPS)

**Directory Structure:**
- `/opt/livos/` - LivOS monorepo deployment
- `/opt/nexus/` - Nexus monorepo deployment (actually at `/opt/nexus/app/`)
- `/opt/livinity/` - Docker app data

**Services (PM2):**
| Service | Port | Description |
|---------|------|-------------|
| livos | 8080 | Main LivOS server |
| nexus-core | 3200 | AI daemon + API |
| nexus-mcp | 3100 | MCP server |
| nexus-whatsapp | - | WhatsApp bridge |
| nexus-worker | - | Background jobs |
| nexus-memory | 3300 | Memory service |
| liv-worker | - | LivOS background worker |

**Docker Containers:**
- Immich (photos), Vikunja (tasks), n8n (automation)
- auth, tor_proxy (LivOS system containers)

**Reverse Proxy (Caddy):**
- `livinity.cloud` -> localhost:8080
- `*.livinity.cloud` -> Docker app ports

---

*Architecture analysis: 2026-02-03*
