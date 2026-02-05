# Technology Stack - Nexus

**Last Updated:** January 26, 2026
**Project:** Nexus - Personal AI Server (7/24 autonomous AI operating system)

## Language & Runtime

| Component | Language | Runtime | Version |
|-----------|----------|---------|---------|
| Core, Worker, WhatsApp, MCP | TypeScript | Node.js | ES2022 module |
| Memory Server | Python | Python 3 | 3.x |

## Build & Compilation

- **TypeScript Compiler:** `typescript@^5.7.0`
- **Development Runner:** `tsx@^4.0.0` (watch mode for dev)
- **Target:** ES2022 modules with strict mode enabled
- **Output:** Compiled to `dist/` directory
- **Configuration:** `tsconfig.base.json` shared across monorepo

## Package Management

- **Monorepo Tool:** npm workspaces
- **Workspace Structure:**
  - `packages/core` - Main daemon and orchestration
  - `packages/worker` - Job queue processor (BullMQ)
  - `packages/whatsapp` - WhatsApp bot integration (Baileys)
  - `packages/mcp-server` - Model Context Protocol server
  - `packages/memory` - Python knowledge graph API (Cognee)
  - `packages/hooks` - Shared utilities

## Core Dependencies

### AI & LLM

| Package | Version | Purpose |
|---------|---------|---------|
| `@google/generative-ai` | ^0.21.0 | Google Gemini API integration |
| `@anthropic-ai/sdk` | ^0.39.0 | Anthropic Claude API (installed but not actively used in code) |

**AI Model Routing (Gemini 2.5):**
- `gemini-2.5-flash`: Routine tasks, classification, parsing (tier: flash/haiku)
- `gemini-2.5-pro`: Analysis, code review, research (tier: sonnet/opus)

### Message Queue & Job Processing

| Package | Version | Purpose |
|---------|---------|---------|
| `bullmq` | ^5.0.0 | Distributed job queue with Redis backend |

**Supported Job Types:**
- `scrape` - Web content extraction (Firecrawl)
- `test` - Playwright test execution
- `research` - Web research tasks
- `leadgen` - Lead generation

### Database & Cache

| Package | Version | Purpose |
|---------|---------|---------|
| `ioredis` | ^5.4.0 | Redis client (async) |
| `pg` | ^8.13.0 | PostgreSQL client (TypeScript types included) |

**Usage Patterns:**
- Redis: Message queue (nexus:inbox), response polling, session state
- PostgreSQL: Persistent data storage (configured but data model not exposed in code)

### Docker Integration

| Package | Version | Purpose |
|---------|---------|---------|
| `dockerode` | ^4.0.0 | Docker Engine API client |

**Supported Operations:**
- Container lifecycle: start, stop, restart
- Container inspection: logs, stats, info
- Command execution: docker exec inside containers
- Cleanup: health checks, resource monitoring

### Communication & APIs

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^4.21.0 | HTTP server framework (MCP only) |
| `@modelcontextprotocol/sdk` | ^1.12.0 | MCP server SDK for Claude integration |
| `node-fetch` | ^3.3.0 | HTTP client for async requests |

### WhatsApp Integration

| Package | Version | Purpose |
|---------|---------|---------|
| `@whiskeysockets/baileys` | ^6.7.0 | WhatsApp Web automation library |
| `qrcode-terminal` | ^0.12.0 | Terminal QR code display for auth |
| `pino` | ^9.0.0 | Structured logging |

### Task Scheduling & Utilities

| Package | Version | Purpose |
|---------|---------|---------|
| `node-cron` | ^3.0.0 | Cron job scheduling |
| `dotenv` | ^16.4.0 | Environment variable loading |
| `winston` | ^3.17.0 | Application logging |
| `zod` | ^3.24.0 | Schema validation (MCP tools) |

### Python Dependencies (Memory)

Located in `packages/memory/src/requirements.txt`:

| Package | Version | Purpose |
|---------|---------|---------|
| `cognee` | >=0.1.0 | Knowledge graph / semantic memory |
| `fastapi` | >=0.115.0 | Python async web framework |
| `uvicorn` | >=0.32.0 | ASGI web server |
| `pydantic` | >=2.0.0 | Data validation and settings |

## Architecture Layers

### 1. Daemon Core (`packages/core/src/`)

**Main Entry:** `index.ts`

- **Brain** (`brain.ts`): AI reasoning engine with tiered model selection
- **Router** (`router.ts`): Intent classification and handler routing
  - Rule-based classification (Turkish + English keywords)
  - Fallback to Gemini Flash for AI classification
- **Daemon** (`daemon.ts`): Main orchestration loop
  - Inbox processor: Consumes messages from Redis queue
  - Handler registration: Shell, Docker, PM2, sysinfo, files, cron
  - Scheduled health checks (Docker cleanup every 5 min)
- **Docker Manager** (`docker-manager.ts`): Dockerode wrapper
- **Shell Executor** (`shell.ts`): Subprocess execution with timeout
- **Scheduler** (`scheduler.ts`): Cron task management
- **API** (`api.ts`): Express HTTP endpoint
- **Logger** (`logger.ts`): Winston logger

**Interval:** 30 seconds (configurable via `DAEMON_INTERVAL_MS`)

### 2. Message Queue Worker (`packages/worker/src/`)

**Entry:** `index.ts`
**Queue Name:** `nexus-jobs` (BullMQ)
**Concurrency:** 2 workers

**Job Types:**
- `scrape` → Firecrawl web scraper
- `test` → Playwright test runner
- `research` → Web search research
- `leadgen` → Lead generation workflow

Results stored in Redis with 1-hour expiration.

### 3. WhatsApp Integration (`packages/whatsapp/src/`)

**Entry:** `index.ts`

- **Library:** Baileys (WhatsApp Web automation)
- **Auth:** Multi-file auth state in `/opt/nexus/whatsapp-auth`
- **QR Code:** Terminal display for initial auth
- **Security:** Owner JID filtering (only process messages from authorized user)
- **Flow:** Incoming message → Redis queue → Daemon processing → Response polling

### 4. MCP Server (`packages/mcp-server/src/`)

**Entry:** `index.ts`
**Port:** 3100 (configurable `MCP_PORT`)
**Endpoint:** `/mcp` (POST/GET/DELETE)

**Transport:** Streamable HTTP (for Claude integration)

**Tools Registered (11 total):**
1. `nexus_task` - Submit arbitrary tasks
2. `nexus_status` - Daemon status
3. `nexus_logs` - Recent logs
4. `nexus_scrape` - Web scraping (Firecrawl)
5. `nexus_remember` - Store in memory (Cognee)
6. `nexus_ask` - Ask daemon with memory search
7. `nexus_test` - Run tests
8. `nexus_cron` - Schedule recurring tasks
9. `nexus_shell` - Execute shell commands (30s timeout)
10. `nexus_docker_manage` - Container lifecycle
11. `nexus_docker_exec` - Run command inside container
12. `nexus_pm2` - Process management
13. `nexus_sysinfo` - System monitoring
14. `nexus_files` - File operations

**Request/Response Model:** JSON-RPC 2.0 via requestId polling

### 5. Memory Server (`packages/memory/src/`)

**Entry:** `server.py`
**Port:** 3300 (configurable `MEMORY_PORT`)
**Framework:** FastAPI

**Endpoints:**
- `POST /add` - Add knowledge to graph
- `POST /search` - Search semantic memory
- `POST /reset` - Reset knowledge graph
- `GET /health` - Health check

**Backend:** Cognee (knowledge graph with Gemini embeddings)

## Communication Patterns

### Inter-Service Queue

```
Redis Queue: nexus:inbox
├── Sources: MCP, WhatsApp, Cron, Daemon, Webhooks
├── Format: JSON with message, source, requestId, params
└── Processing: Daemon polls every 1000ms
```

### Response Polling

```
Request → Redis nexus:answer:{requestId} (stored with 120s TTL)
Poll interval: 500ms
Timeout: 30-60 seconds (varies by tool)
```

### Worker Jobs

```
BullMQ Queue: nexus-jobs
├── Job types: scrape, test, research, leadgen
├── Results stored: nexus:result:{jobId}
└── Expiration: 1 hour
```

## Configuration

### Environment Variables

File: `.env.example`

```bash
# AI
ANTHROPIC_API_KEY=sk-ant-xxx
GEMINI_API_KEY=xxx

# Database
DATABASE_URL=postgresql://nexus:NexusDB2024!@localhost:5432/nexus
REDIS_URL=redis://:NexusRedis2024!@localhost:6379

# Features
WHATSAPP_ENABLED=true
WHATSAPP_OWNER_JID=905xxxxxxxxxx@s.whatsapp.net

# Services
DAEMON_INTERVAL_MS=30000
DEFAULT_MODEL=gemini-2.0-flash
MCP_PORT=3100
API_PORT=3200
MEMORY_PORT=3300

# Optional: Email notifications
NOTIFICATION_EMAIL=your@email.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

## Process Management

**Deployment:** PM2 ecosystem (see `deploy/ecosystem.config.cjs`)

```
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

**Script-based Deployment:** See `deploy/setup-server4.sh`

## Development Workflow

```bash
npm run dev:core       # Core daemon (hot-reload)
npm run dev:mcp        # MCP server
npm run dev:whatsapp   # WhatsApp bot
npm run dev:worker     # Job worker
npm run dev:memory     # Memory server (Python)

npm run build          # Build all packages
```

## Type Safety

- **Strict Mode:** Enabled across all TypeScript
- **Module Resolution:** bundler strategy
- **Shared Types:** `tsconfig.base.json` referenced by all workspace packages
- **Zod Validation:** MCP tool input schemas validated with runtime checks
