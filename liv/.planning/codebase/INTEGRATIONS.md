# External Integrations - Nexus

**Last Updated:** January 26, 2026
**Project:** Nexus - Personal AI Server (7/24 autonomous AI operating system)

## AI APIs

### Google Gemini (Primary)

**Integration:** `packages/core/src/brain.ts`

```typescript
// SDK: @google/generative-ai@^0.21.0
// Config: process.env.GEMINI_API_KEY

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
```

**Models & Tiers (January 2026):**

| Tier | Model | Use Case | Cost Profile |
|------|-------|----------|--------------|
| flash/haiku | `gemini-2.5-flash` | Routine tasks, classification, parsing, summarization | Cheapest, fastest |
| sonnet | `gemini-2.5-pro` | Analysis, code review, research, debugging | Mid-tier |
| opus | `gemini-2.5-pro` | Architecture, multi-step reasoning, complex planning | Highest precision |

**Usage Pattern:**

1. **Intent Classification** - Always uses `flash` tier for cost efficiency
   - Classifies incoming commands (shell, docker, file ops, AI tasks)
   - Supports bilingual input (Turkish + English keywords)
   - Returns JSON with action type and parameters

2. **Knowledge Integration** - Fallback reasoning
   - Routes unmatched intents to appropriate tier
   - Custom system prompt: "You are Nexus, a personal AI server assistant. Be concise and actionable."
   - Max tokens: 200-1024 depending on task

**Endpoints:**
- `model.generateContent()` - Standard text generation with streaming support
- System instruction: Custom prompt per tier
- Generation config: maxOutputTokens configured per request

**Error Handling:**
- Logs tier, error message, stack trace
- Throws caught errors for upstream handling
- Fallback to "ask" action on JSON parse failure

### Anthropic Claude (SDK Installed, Not Active)

**Integration:** `packages/core/package.json`

```json
{
  "@anthropic-ai/sdk": "^0.39.0"
}
```

**Status:** Installed but not used in current codebase. May be used for future fallback or model comparison.

## Web Scraping & Crawling

### Firecrawl (Self-Hosted Docker)

**Integration:** `packages/worker/src/jobs/scrape.ts`

```typescript
const FIRECRAWL_URL = process.env.FIRECRAWL_URL || 'http://localhost:3002';

// API call
const response = await fetch(`${FIRECRAWL_URL}/v1/scrape`, {
  method: 'POST',
  body: JSON.stringify({
    url,
    formats: [format],  // 'markdown' | 'html' | 'text'
    waitFor: 3000
  })
});
```

**Docker Setup:** `deploy/docker-compose.yml`

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `firecrawl-api` | `trieve/firecrawl:v0.0.46` | 3002 | Web scraping API |
| `firecrawl-worker` | `trieve/firecrawl:v0.0.46` | - | Background job processor |
| `redis-firecrawl` | `redis:7-alpine` | - | Dedicated Redis for Firecrawl |

**Configuration:**
```yaml
Environment:
  - NUM_WORKERS_PER_QUEUE=4
  - REDIS_URL=redis://redis-firecrawl:6379
  - REDIS_RATE_LIMIT_URL=redis://redis-firecrawl:6379
Memory limits: 2GB per container
```

**Supported Formats:**
- `markdown` - Extracted semantic structure
- `html` - Raw HTML output
- `text` - Plain text

**Job Integration:**
- Triggered via MCP tool: `nexus_scrape`
- Queued in BullMQ: `scrape` job type
- Results stored: `nexus:result:{jobId}` (Redis, 1hr TTL)

### Playwright (Browser Automation)

**Integration:** `deploy/docker-compose.yml` + Test framework

| Service | Image | Purpose |
|---------|-------|---------|
| `playwright` | `mcr.microsoft.com/playwright:v1.49.1-noble` | Browser automation for testing |

**Configuration:**
```yaml
Command: sleep infinity
Shared Memory: 1GB
Memory limit: 2GB
```

**Usage:**
- Run Playwright tests via MCP: `nexus_test`
- Supports custom test commands and paths
- Integration with test job processor (`TestJob` in `packages/worker/src/jobs/test.ts`)

## Database Integration

### PostgreSQL

**Integration:** `packages/core/package.json`

```typescript
// Library: pg@^8.13.0
// Types: @types/pg@^8.0.0

import { Client } from 'pg';
const client = new Client({
  connectionString: process.env.DATABASE_URL
  // Example: postgresql://nexus:NexusDB2024!@localhost:5432/nexus
});
```

**Environment Variable:**
```bash
DATABASE_URL=postgresql://nexus:NexusDB2024!@localhost:5432/nexus
```

**Current State:**
- Library installed and configured
- Connection string parsed from env
- Data models: Not exposed in code layer (possible schema in deployment)
- Usage: Likely for persistent task tracking, audit logs, user sessions

### Redis

**Integration:** Multi-instance setup across packages

| Package | Client | Purpose |
|---------|--------|---------|
| `core` | `ioredis@^5.4.0` | Inbox queue, response polling, scheduler state |
| `worker` | `ioredis@^5.4.0` | Job result storage |
| `whatsapp` | `ioredis@^5.4.0` | Message state, response channels |
| `mcp-server` | `ioredis@^5.4.0` | Tool request queuing |
| `firecrawl` (Docker) | Native | Rate limiting, job queue |

**Configuration:**
```bash
REDIS_URL=redis://:NexusRedis2024!@localhost:6379
```

**Key Namespaces:**

| Key Pattern | Purpose | TTL |
|-------------|---------|-----|
| `nexus:inbox` | Incoming message queue (list) | - |
| `nexus:answer:{requestId}` | Response polling cache | 120s |
| `nexus:result:{jobId}` | Job output | 3600s |
| `nexus:logs` | Recent daemon logs (list) | - |
| `nexus:stats` | Runtime statistics | - |
| `nexus:wa_pending:{jid}` | WhatsApp response channel | 120s |
| `nexus:memory_queue` | Cognee memory submissions | - |
| `nexus:schedules` | Cron task definitions (list) | - |

**Connection Options:**
```typescript
const redis = new IORedis(url, {
  maxRetriesPerRequest: null  // For use with BullMQ
});
```

## Message Queue

### BullMQ

**Integration:** `packages/worker/src/index.ts`

```typescript
import { Worker, Job } from 'bullmq';

const worker = new Worker(
  'nexus-jobs',  // Queue name
  async (job: Job) => { /* handler */ },
  { connection, concurrency: 2 }
);
```

**Queue Configuration:**
- Queue name: `nexus-jobs`
- Connection: Redis (shared)
- Concurrency: 2 workers
- Concurrency strategy: Sequential processing

**Job Types Supported:**

| Job Type | Handler | Purpose |
|----------|---------|---------|
| `scrape` | `ScrapeJob.process` | Web content extraction via Firecrawl |
| `test` | `TestJob.process` | Playwright test execution |
| `research` | `ResearchJob.process` | Web research and aggregation |
| `leadgen` | `LeadgenJob.process` | Lead generation workflow |

**Job Lifecycle:**
1. Enqueued from daemon or MCP tools
2. Worker picks up based on concurrency
3. Handler processes (with error retry logic)
4. Result stored: `nexus:result:{jobId}` (Redis, 1hr TTL)
5. Error events logged and stored

**Event Handling:**
```typescript
worker.on('failed', (job, err) => { /* handle */ });
worker.on('completed', (job) => { /* handle */ });
```

## Docker Integration

### Docker Engine API

**Integration:** `packages/core/src/docker-manager.ts`

```typescript
// Library: dockerode@^4.0.0
// Socket: /var/run/docker.sock (Unix default)

import Docker from 'dockerode';
const docker = new Docker();
```

**Supported Operations:**

| Operation | Method | Purpose |
|-----------|--------|---------|
| List containers | `docker.listContainers()` | Get all container info |
| Start container | `container.start()` | Bring up stopped container |
| Stop container | `container.stop()` | Graceful shutdown |
| Restart container | `container.restart()` | Restart with clean state |
| Inspect container | `container.inspect()` | Get detailed metadata |
| Get logs | `container.logs()` | Retrieve container output |
| Execute command | `container.exec()` | Run cmd inside container |
| Cleanup | `getContainers()` + health checks | Monitor & remove dead containers |

**Usage Examples:**

```bash
# Via MCP tool: nexus_docker_manage
docker-manage: operation="start", name="nexus-firecrawl"

# Via daemon handler: docker-manage
{operation: "logs", name: "nexus-playwright", tail: 50}

# Via shell execution
docker exec nexus-firecrawl ps aux
```

**Health Checks:**
- Automatic cleanup every 10 daemon cycles (~5 minutes)
- Monitors exited containers
- Resource limits enforced (see docker-compose.yml)

## WhatsApp Integration

### Baileys Library

**Integration:** `packages/whatsapp/src/index.ts`

```typescript
// Library: @whiskeysockets/baileys@^6.7.0

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from '@whiskeysockets/baileys';

// Initialize
const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
const sock = makeWASocket({
  auth: state,
  printQRInTerminal: false,
  logger: pino({ level: 'warn' })
});
```

**Configuration:**
- **Auth Directory:** `/opt/nexus/whatsapp-auth`
- **Owner JID:** `process.env.WHATSAPP_OWNER_JID` (e.g., `905xxxxxxxxxx@s.whatsapp.net`)
- **Enabled Flag:** `process.env.WHATSAPP_ENABLED` (default: true)

**Message Flow:**

```
1. Incoming message event: messages.upsert
   ├─ Extract text from conversation/extendedTextMessage
   ├─ Security filter: Only respond to OWNER_JID
   └─ Acknowledge: "Nexus received. Processing..."

2. Queue message to daemon
   └─ Redis: nexus:inbox with source='whatsapp'

3. Response polling
   ├─ Subscribe to response channel: nexus:wa_response:{timestamp}
   ├─ Poll every 500ms (timeout: 60s)
   └─ Send response back to WhatsApp

4. Disconnect handling
   └─ Auto-reconnect on network failure (5s delay)
```

**Authentication:**
- QR code display in terminal (first run)
- Credentials stored in multi-file auth state
- Auto-resume on reconnect

**Message Types Supported:**
- Plain text (conversation)
- Extended text (with formatting)

## Model Context Protocol (MCP)

### MCP Server

**Integration:** `packages/mcp-server/src/index.ts`

```typescript
// Library: @modelcontextprotocol/sdk@^1.12.0

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const server = new McpServer({ name: 'nexus', version: '1.0.0' });
```

**Endpoint:**
```
POST/GET/DELETE http://0.0.0.0:{MCP_PORT}/mcp
```

**Session Management:**
- Unique session ID per Claude connection
- Transport: StreamableHTTP for SSE support
- Session tracking: In-memory dictionary

**Tools Exposed (13 tools):**

| Tool | Description | Timeout | Returns |
|------|-------------|---------|---------|
| `nexus_task` | Submit arbitrary task | - | Task queued confirmation |
| `nexus_status` | Get daemon status | - | Inbox length, last log, stats |
| `nexus_logs` | Retrieve recent logs | - | N log lines (configurable) |
| `nexus_scrape` | Scrape URL (Firecrawl) | - | Markdown/text content |
| `nexus_remember` | Store in memory (Cognee) | - | Confirmation |
| `nexus_ask` | Ask with memory search | 30s | AI-generated answer |
| `nexus_test` | Run Playwright tests | - | Test queued confirmation |
| `nexus_cron` | Schedule recurring task | - | Schedule confirmation |
| `nexus_shell` | Execute shell command | 30-60s | Command output (10KB max) |
| `nexus_docker_manage` | Manage containers | - | Operation result |
| `nexus_docker_exec` | Run cmd in container | - | Command output |
| `nexus_pm2` | Manage PM2 processes | - | Process status |
| `nexus_sysinfo` | System monitoring | 20s | CPU/RAM/disk/network info |
| `nexus_files` | File operations | - | File content or operation result |

**Tool Input Validation:**
- Zod schema validation (`zod@^3.24.0`)
- Runtime parameter checking
- Safe defaults for optional params

**Request/Response Pattern:**

```json
// Request
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "nexus_shell",
    "arguments": {"command": "ls -la /opt"}
  },
  "id": "123"
}

// Response (via polling)
{
  "jsonrpc": "2.0",
  "result": {
    "content": [{"type": "text", "text": "...output..."}]
  },
  "id": "123"
}
```

## Knowledge Graph & Memory

### Cognee

**Integration:** `packages/memory/src/server.py`

```python
# Library: cognee>=0.1.0

import cognee

# Configuration (before import via environment)
os.environ["LLM_PROVIDER"] = "gemini"
os.environ["LLM_MODEL"] = "gemini/gemini-2.5-flash"
os.environ["EMBEDDING_PROVIDER"] = "gemini"
os.environ["EMBEDDING_MODEL"] = "gemini/text-embedding-004"
os.environ["EMBEDDING_DIMENSIONS"] = "768"
```

**API Endpoints:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/add` | Add knowledge to graph |
| `POST` | `/search` | Search semantic memory |
| `POST` | `/reset` | Clear all knowledge |
| `GET` | `/health` | Health check |

**Request/Response:**

```python
# Add memory
POST /add
{
  "content": "Nexus is a personal AI server running on Server 4",
  "tags": ["system", "intro"],
  "source": "mcp"
}

# Search memory
POST /search
{
  "query": "What is Nexus?",
  "limit": 10
}

# Response
{
  "success": true,
  "message": "Found 5 results for 'Nexus'",
  "data": {
    "results": [
      {"content": "Nexus is a personal AI server..."},
      ...
    ],
    "query": "What is Nexus?"
  }
}
```

**Knowledge Graph Features:**
- Semantic embeddings via Gemini text-embedding-004
- Graph traversal for context retrieval
- Tag-based categorization
- Source tracking for audit trails

**Cognify Process:**
- Analyzes added content
- Extracts entities and relationships
- Builds knowledge graph
- Enables semantic search

## Logging & Observability

### Winston Logger

**Integration:** Across all packages

```typescript
// Library: winston@^3.17.0

import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  format: format.json(),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/nexus.log' })
  ]
});
```

**Log Levels:** info, warn, error

**Structured Logging:**
```typescript
logger.info('Event description', { context: 'metadata', error: 'details' });
logger.error('Error occurred', { error: err.message, stack: err.stack });
```

### Pino Logger (WhatsApp)

**Integration:** `packages/whatsapp/src/index.ts`

```typescript
// Library: pino@^9.0.0

const logger = pino({ level: 'warn' });
```

**Purpose:** Reduce Baileys library verbosity in production

## External APIs & Services

### Web Research

**Job Type:** `research` in `packages/worker/src/jobs/research.ts`

- Likely: Web search API (Bing, Google, Brave Search)
- Triggered via MCP: `nexus_research`
- Results aggregated and returned to daemon

### Lead Generation

**Job Type:** `leadgen` in `packages/worker/src/jobs/leadgen.ts`

- Integration: Not fully exposed in code
- Triggered via: MCP or daemon command
- Likely: B2B data providers or email finder APIs

## Security & Configuration

### Environment Isolation
- `.env` loaded via `dotenv` at service startup
- Secrets never logged
- API keys in environment only (not in code)

### Access Control
- WhatsApp: Owner JID validation
- MCP: Session-based (implied Claude authentication)
- Docker: Local socket access only (no remote exposure)
- Shell: Implicit security through intentional routing

### Service-to-Service
- All inter-service communication via Redis (local)
- No external credential exposure
- Request/response correlation via requestId

## Deployment Architecture

See `deploy/docker-compose.yml` for full Docker stack:
- Firecrawl (web scraping)
- Playwright (browser automation)
- Redis (Firecrawl queue)

See `deploy/ecosystem.config.cjs` for PM2 processes:
- Core daemon
- Worker processes
- WhatsApp bot
- MCP server
- Memory server

## Integration Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Claude (MCP Client)                        │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP (MCP Protocol)
                     ▼
         ┌──────────────────────────┐
         │   MCP Server (3100)      │
         │  (13 tools registered)   │
         └──────────┬───────────────┘
                     │ Redis Queuing
                     ▼
         ┌──────────────────────────┐
         │   Daemon Core (30s loop) │◄──────┐
         │ - Router                 │       │
         │ - Brain (Gemini)         │       │
         │ - Handlers               │       │
         └──────────┬───────────────┘       │
                     │                      │
         ┌───────────┼────────────┬─────┐   │
         │           │            │     │   │
         ▼           ▼            ▼     ▼   │
    ┌────────┐  ┌──────────┐  ┌─────┐ └─────┘
    │ Docker │  │  Shell   │  │PM2  │
    │ Engine │  │Execution │  │Proc │
    └────────┘  └──────────┘  └─────┘
         │
    ┌────┴───────┐
    ▼            ▼
┌─────────┐  ┌────────────┐
│Firecrawl│  │Playwright  │
│(scrape) │  │(test)      │
└─────────┘  └────────────┘

┌──────────────────────────┐
│  WhatsApp (Baileys)      │
│  (Incoming messages)     │
└──────────┬───────────────┘
           │ Redis
           ▼
    ┌─────────────┐
    │ Daemon Inbox│
    └─────────────┘

┌────────────────────────────┐
│  Worker Pool (BullMQ)      │
│  scrape, test, research,   │
│  leadgen (2 concurrency)   │
└────────────────────────────┘

┌────────────────────────────┐
│  Memory Server (3300)      │
│  Cognee Knowledge Graph    │
│  (Gemini embeddings)       │
└────────────────────────────┘

┌────────────────────────────┐
│  PostgreSQL (persistent)   │
│  Redis (cache/queue)       │
└────────────────────────────┘
```

## Monitoring & Troubleshooting

### Health Endpoints
- MCP: `GET /health` → session count
- Memory: `GET /health` → service status
- Docker: Container logs via `docker-manage` tool

### Log Retrieval
- MCP: `nexus_logs` tool (configurable line count)
- Shell: `nexus_shell` tool with `tail -f /opt/nexus/logs/nexus.log`
- PM2: `pm2 logs` or `nexus_pm2` MCP tool

### Debugging
- Daemon status: `nexus_status` tool
- Container inspection: `nexus_docker_manage` inspect
- System metrics: `nexus_sysinfo` tool
