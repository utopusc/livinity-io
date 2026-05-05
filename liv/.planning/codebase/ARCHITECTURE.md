# Nexus Architecture Documentation

**System Overview:** Nexus is a 7/24 autonomous AI server daemon built on Node.js/TypeScript. It implements an event-driven polling loop architecture that classifies tasks, routes them through handlers, and executes them across Docker, shell, and external services.

---

## System Architecture Pattern

### Event-Driven Daemon Loop

Nexus operates on a **continuous polling daemon cycle** (~30s interval) that processes messages asynchronously:

```
┌─────────────────────────────────────────────────────────────────┐
│                   DAEMON MAIN LOOP (30s cycle)                  │
└─────────────────────────────────────────────────────────────────┘
         │
         ├─► 1. INBOX PROCESSING
         │   └─► Redis: nexus:inbox (RPOP)
         │       │
         │       ├─► Parse message + source + requestId + params
         │       │
         │       ├─► CLASSIFY (Router.classify)
         │       │   └─► Rule-based OR AI-based intent extraction
         │       │
         │       ├─► ROUTE (Router.route)
         │       │   └─► Find registered handler OR ask Brain
         │       │
         │       └─► EXECUTE Handler
         │           └─► Store result in Redis (nexus:answer:{requestId})
         │
         ├─► 2. DOCKER HEALTH CHECK (every 10 cycles = ~5 min)
         │   └─► DockerManager.cleanup() - stop idle containers
         │
         └─► 3. LOGGING (every 120 cycles = ~1 hour)
             └─► Store hourly stats to Redis

┌─────────────────────────────────────────────────────────────────┐
│                      REDIS INBOX FLOW                           │
└─────────────────────────────────────────────────────────────────┘
  MCP Server          WhatsApp            Core API          Cron
       │                  │                   │               │
       ├─► nexus:inbox ←──┴───────────────────┴───────────────┤
       │                                                       │
       ├─► Daemon pops & classifies                           │
       │                                                       │
       ├─► nexus:answer:{requestId} ← Stores result           │
       │                                                       │
       └─► MCP/Client polls for response (500ms intervals)    │
```

### Layered Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    ENTRY POINTS (Input)                      │
├──────────────────────────────────────────────────────────────┤
│ MCP Server        │ WhatsApp Bot      │ Express API          │
│ (port 3100)       │ (Baileys/WA)      │ (port 3200)          │
│ Text-based tools  │ Message handler   │ Webhooks, Status     │
└──────────────────────────────────────────────────────────────┘
         │                   │                    │
         └───────────────────┴────────────────────┘
                             │
                    Redis Inbox (nexus:inbox)
                             │
┌──────────────────────────────────────────────────────────────┐
│                  BRAIN LAYER (Intelligence)                  │
├──────────────────────────────────────────────────────────────┤
│ Brain (Gemini API integration)                               │
│ ├─ think() - Call LLM with tier selection                   │
│ ├─ selectTier() - Cost optimization (flash/haiku/sonnet)   │
│ └─ Model mapping: Gemini 2.5 Flash/Pro                      │
└──────────────────────────────────────────────────────────────┘
         │
         ├────► Router.classify()
         │      ├─ Rule-based patterns (turkish + english)
         │      └─ AI classification (flash tier)
         │
         └────► Router.route()
                ├─ Find handler from registry
                └─ OR ask Brain (with tier selection)
                             │
┌──────────────────────────────────────────────────────────────┐
│                  ROUTER LAYER (Routing)                      │
├──────────────────────────────────────────────────────────────┤
│ Router (Intent classification & handler dispatch)            │
│ ├─ register(action, handler) - Handler registry             │
│ ├─ classify(input, source) - Intent extraction              │
│ └─ route(intent) - Handler lookup & execution               │
└──────────────────────────────────────────────────────────────┘
         │
         ├─► Handler: shell (ShellExecutor)
         ├─► Handler: docker-manage (DockerManager)
         ├─► Handler: docker-exec (DockerManager.exec)
         ├─► Handler: pm2 (PM2 commands via shell)
         ├─► Handler: sysinfo (System monitoring)
         ├─► Handler: files (File operations)
         ├─► Handler: status (Daemon status)
         ├─► Handler: logs (Log retrieval)
         ├─► Handler: docker (List containers)
         ├─► Handler: cron (Task scheduling)
         └─► Handler: ask (Brain reasoning)
                             │
┌──────────────────────────────────────────────────────────────┐
│               EXECUTION HANDLERS LAYER                       │
├──────────────────────────────────────────────────────────────┤
│ ShellExecutor    │ DockerManager    │ Scheduler            │
│ ├─ execute()     │ ├─ list()        │ ├─ addJob()          │
│ └─ BLOCKED:      │ ├─ startTool()   │ ├─ Worker            │
│   rm -rf /, mkfs │ ├─ stopTool()    │ └─ Queue (bullmq)    │
│                  │ ├─ start/stop    │                       │
│                  │ ├─ restart       │    Cron Worker       │
│                  │ ├─ inspect       │    ├─ Async job      │
│                  │ ├─ logs          │    ├─ Concurrency:3  │
│                  │ └─ cleanup()     │    └─ Persistence    │
└──────────────────────────────────────────────────────────────┘
         │
         └────► External Services
                ├─ Firecrawl (Web scraping)
                ├─ Docker daemon (/var/run/docker.sock)
                ├─ PM2 processes
                └─ System shell (/bin/sh)
                             │
┌──────────────────────────────────────────────────────────────┐
│              WORKER PACKAGE (Async Jobs)                     │
├──────────────────────────────────────────────────────────────┤
│ BullMQ Worker (queue: nexus-jobs, concurrency: 2)           │
│ ├─ ScrapeJob - URL scraping via Firecrawl                  │
│ ├─ TestJob - Playwright test execution                     │
│ ├─ ResearchJob - Multi-source web research                 │
│ └─ LeadgenJob - Lead generation tasks                      │
│                                                              │
│ Results stored: nexus:result:{jobId} (TTL: 1h)             │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Request to Response Flow (Synchronous - MCP)

```
MCP Client
    │
    ├─► nexus_shell ("ls -la /opt/nexus")
    │
    ├─► POST /mcp
    │   └─► registerTools(server, redis)
    │
    ├─► requestAndPoll()
    │   ├─ Generate requestId
    │   ├─ Push: nexus:inbox = {message, source:'mcp', requestId, params}
    │   ├─ Poll: GET nexus:answer:{requestId} (500ms intervals, 30s timeout)
    │   └─ Return: response text
    │
    └─ Response (shell output)
```

### 2. Message to Inbox to Action Flow

```
Source (MCP/WhatsApp/API)
    │
    ├─► Redis List: nexus:inbox
    │   {message, source, requestId?, params?, timestamp}
    │
    ├─► Daemon.cycle() - RPOP from inbox
    │
    │   Step 1: CLASSIFY
    │   ├─ Input: "docker ps"
    │   ├─ Rule: /^docker (ps|list|listele)/
    │   ├─ Match! Return: {type:'docker_command', action:'docker', params:{cmd:'list'}}
    │   │
    │   └─ If no rule: AI classify (Gemini flash)
    │
    │   Step 2: MERGE PARAMS
    │   └─ Object.assign(intent.params, requestParams)
    │
    │   Step 3: ROUTE
    │   ├─ intent.action = 'docker'
    │   ├─ Handler found? ✓ dockerHandler
    │   └─ Execute handler(intent)
    │
    │   Step 4: STORE RESULT
    │   └─ If requestId: SET nexus:answer:{requestId} = result (TTL: 120s)
    │
    └─ Client polls & retrieves result
```

### 3. Docker Container Management Flow

```
Handler: docker-manage
    │
    ├─ Input: {operation:'start', name:'nexus-firecrawl'}
    │
    ├─ DockerManager.startContainer(name)
    │   ├─ List all containers
    │   ├─ Find by name (exact or /name)
    │   ├─ Check state
    │   └─ Start via Docker socket
    │
    └─ Result: {success:true, message:"Container nexus-firecrawl started."}
```

---

## Key Abstractions

### 1. Intent (packages/core/src/router.ts)

```typescript
interface Intent {
  type: string;                          // e.g. 'shell_command', 'docker_command'
  action: string;                        // e.g. 'shell', 'docker-manage'
  params: Record<string, any>;           // {cmd: "ls", operation: "start"}
  source: 'mcp'|'whatsapp'|'cron'|...;  // Request origin
  raw: string;                           // Original user input
}
```

**Responsibility:** Normalized representation of user intent after classification. Used throughout the system for routing and parameter passing.

### 2. TaskResult (packages/core/src/router.ts)

```typescript
interface TaskResult {
  success: boolean;                      // Operation succeeded?
  message: string;                       // Human-readable result/status
  data?: any;                            // Structured response data
}
```

**Responsibility:** Standardized response format from all handlers. Converted to Redis response (nexus:answer:{requestId}).

### 3. Handler (packages/core/src/daemon.ts)

```typescript
type Handler = (intent: Intent) => Promise<TaskResult>;
```

**Responsibility:** Pure async function that processes an Intent and returns TaskResult. Handlers are registered in the Router and executed during routing.

**Handler Categories:**
- **System Handlers:** status, logs, cron
- **Shell Handlers:** shell, systemctl
- **Docker Handlers:** docker, docker-manage, docker-exec
- **Process Handlers:** pm2
- **System Info Handlers:** sysinfo
- **File Handlers:** files
- **AI Handlers:** ask (delegates to Brain)

### 4. Brain (packages/core/src/brain.ts)

```typescript
class Brain {
  async think(options: ThinkOptions): Promise<string>
  selectTier(intentType: string): ModelTier
}

type ModelTier = 'none' | 'flash' | 'haiku' | 'sonnet' | 'opus';
```

**Responsibility:**
- AI-powered classification and reasoning
- Cost optimization via model tier selection
- Gemini API integration (mapped to Flash/Pro models)

**Tier Selection Logic:**
```
Level 0 (none):     docker_command, file_read, cron_set, etc. → No AI
Level 1 (flash):    classify, summarize, parse → Gemini Flash (cheapest)
Level 2 (sonnet):   research, analyze, code_review → Gemini Pro (mid)
Level 3 (opus):     architecture, complex_plan → Gemini Pro (advanced)
```

---

## Entry Points Per Package

### 1. packages/core (Daemon & Core Logic)

**Main Entry:** `packages/core/src/index.ts`

```typescript
main()
  ├─ Create Redis client (process.env.REDIS_URL)
  ├─ Initialize Brain (Gemini API key)
  ├─ Initialize Router (attach Brain)
  ├─ Initialize DockerManager
  ├─ Initialize ShellExecutor
  ├─ Initialize Scheduler (BullMQ)
  │
  ├─ Create Daemon
  │   ├─ Register built-in handlers
  │   ├─ Start scheduler
  │   └─ Start main event loop (daemon.cycle())
  │
  ├─ Create Express API server (port 3200)
  │   ├─ POST /api/webhook/git
  │   ├─ GET /api/notifications
  │   ├─ POST /api/session
  │   ├─ GET /api/health
  │   └─ GET /api/status
  │
  ├─ Start Redis inbox poller
  │   └─ Every 1s: RPOP nexus:inbox → daemon.addToInbox()
  │
  └─ Setup graceful shutdown (SIGINT/SIGTERM)
```

**Key Classes:**
- `Daemon` (daemon.ts) - Main event loop & handler registration
- `Router` (router.ts) - Intent classification & routing
- `Brain` (brain.ts) - Gemini AI integration
- `DockerManager` (docker-manager.ts) - Docker API wrapper
- `ShellExecutor` (shell.ts) - Shell command execution with safety blocklist
- `Scheduler` (scheduler.ts) - BullMQ job scheduling
- `logger` (logger.ts) - Winston logger to console + file

### 2. packages/mcp-server (MCP Protocol Server)

**Main Entry:** `packages/mcp-server/src/index.ts`

```typescript
Express app (port 3100)
  ├─ POST /mcp (StreamableHTTPServerTransport)
  │   ├─ Initialize MCP server (first request)
  │   ├─ Register tools via registerTools()
  │   └─ Handle MCP JSON-RPC
  │
  ├─ GET /mcp (Session polling)
  │
  ├─ DELETE /mcp (Session cleanup)
  │
  └─ GET /health (Health check)
```

**Tools Registered:** (packages/mcp-server/src/tools/index.ts)
- `nexus_shell` - Execute shell commands
- `nexus_docker_manage` - Docker container lifecycle
- `nexus_docker_exec` - Run commands in containers
- `nexus_pm2` - Process management
- `nexus_sysinfo` - System monitoring
- `nexus_files` - File operations
- `nexus_task` - General task submission
- `nexus_status` - Daemon status
- `nexus_logs` - Get logs
- `nexus_scrape` - Web scraping
- `nexus_remember` - Memory storage
- `nexus_ask` - Ask Brain question
- `nexus_test` - Run tests
- `nexus_cron` - Schedule tasks

**Data Flow:**
```
Tool Call → requestAndPoll()
  ├─ Push to nexus:inbox (with requestId)
  ├─ Poll nexus:answer:{requestId} (500ms intervals, 30s timeout)
  └─ Return result
```

### 3. packages/whatsapp (WhatsApp Bot)

**Main Entry:** `packages/whatsapp/src/index.ts`

```typescript
startBot() using Baileys
  ├─ Authenticate (QR code or saved auth)
  ├─ Connect to WhatsApp
  │
  ├─ On message received:
  │   ├─ Verify sender (OWNER_JID only)
  │   ├─ Extract text
  │   ├─ Push to nexus:inbox (source:'whatsapp')
  │   ├─ Send acknowledgment
  │   └─ pollForResponse(jid)
  │
  └─ On response ready:
      └─ Send back to WhatsApp
```

**Response Mechanism:**
```
Message → nexus:inbox (source: 'whatsapp')
  ├─ Daemon processes
  ├─ Stores: nexus:wa_pending:{jid} = channel
  └─ Response sent back to WhatsApp
```

### 4. packages/worker (Async Job Worker)

**Main Entry:** `packages/worker/src/index.ts`

```typescript
BullMQ Worker (queue: 'nexus-jobs', concurrency: 2)
  ├─ Listen for jobs
  ├─ Route to job handler
  │   ├─ ScrapeJob (packages/worker/src/jobs/scrape.ts)
  │   │   └─ Call Firecrawl API for URL scraping
  │   ├─ TestJob (packages/worker/src/jobs/test.ts)
  │   │   └─ Run Playwright tests
  │   ├─ ResearchJob (packages/worker/src/jobs/research.ts)
  │   │   └─ Multi-source research via Firecrawl
  │   └─ LeadgenJob (packages/worker/src/jobs/leadgen.ts)
  │       └─ Lead generation task
  ├─ Store result: nexus:result:{jobId} (TTL: 1h)
  └─ Log completion
```

**Job Data Structure:**
```typescript
job.data = {
  action: string;        // 'scrape', 'test', 'research', 'leadgen'
  params: {...};         // {url, query, depth, etc}
  intentType?: string;   // Classification hint
  raw?: string;          // Original message
}
```

### 5. packages/memory (Cognee Integration)

**Status:** Placeholder/stub package (memory queue sink exists in MCP tools)

**Integration Points:**
- MCP tool: `nexus_remember` pushes to `nexus:memory_queue`
- Not yet actively processed (ready for Cognee integration)

---

## Configuration & Environment

**Environment Variables** (.env):
```bash
REDIS_URL=redis://localhost:6379          # Redis connection
GEMINI_API_KEY=abc123...                  # Google Gemini API
DAEMON_INTERVAL_MS=30000                  # Daemon cycle interval
API_PORT=3200                             # Core API server port
MCP_PORT=3100                             # MCP server port
SHELL_CWD=/opt/nexus                      # Shell executor working directory
WHATSAPP_ENABLED=true                     # Enable WhatsApp bot
WHATSAPP_OWNER_JID=905xxxxxxxxxx@...      # WhatsApp owner JID
FIRECRAWL_URL=http://localhost:3002       # Firecrawl API endpoint
LOG_LEVEL=info                            # Winston log level
```

**Build Configuration** (tsconfig.base.json):
- Target: ES2022
- Module: ES2022 (ESM)
- Output: `dist/` directory
- Strict mode enabled
- Source maps enabled

---

## Critical Data Structures

### Redis Keys

```
nexus:inbox                      List  - Message queue (JSON objects)
nexus:answer:{requestId}         String - Request response (TTL: 120s)
nexus:notifications              List  - Notification queue
nexus:active_session            String - Current session metadata
nexus:stats                      String - Hourly statistics JSON
nexus:logs                       List  - Log entries
nexus:last_log                   String - Last log message
nexus:memory_queue               List  - Memory/Cognee queue
nexus:wa_pending:{jid}          String - WhatsApp pending response channel
nexus:wa_response:{timestamp}   String - WhatsApp response
nexus:result:{jobId}            String - Worker job result (TTL: 1h)
nexus:schedules                  List  - Cron schedule queue
nexus-tasks (BullMQ queue)               - Scheduler queue
nexus-jobs (BullMQ queue)                - Worker queue
```

### Docker Container Naming

Protected containers (never auto-cleaned):
- `nexus-firecrawl`
- `nexus-firecrawl-worker`
- `nexus-puppeteer`
- `nexus-redis-firecrawl`
- `nexus-playwright`

---

## Safety & Security

### Shell Command Blocklist (packages/core/src/shell.ts)

Blocked patterns:
- `rm -rf /` - Recursive delete root
- `mkfs.` - Filesystem formatting
- Fork bomb: `:() { :|: & }`
- `dd if=... of=/dev/` - Direct disk write
- `shutdown|reboot|init 0` - System restart
- `chmod -R 777 /` - Dangerous permissions
- `rm -rf /*` - Delete all root files

### Intent-Based Access Control

All commands flow through:
1. **Classification** (rule-based or AI) → Intent type
2. **Routing** → Handler lookup
3. **Execution** → Handler with safety checks

No direct shell execution without intent classification.

---

## Deployment Structure

**Docker Compose** (deploy/docker-compose.yml):
- Main services: core, mcp-server, whatsapp, worker
- Infrastructure: redis, firecrawl, etc.

**Build Output:**
- Each package: `packages/{name}/dist/` (compiled JS)
- Entry point: `packages/{name}/dist/index.js`

---

## Summary Table

| Component | Package | Port | Purpose |
|-----------|---------|------|---------|
| Daemon | core | N/A | Main event loop |
| API Server | core | 3200 | Status, webhooks, health |
| MCP Server | mcp-server | 3100 | Claude/Tool interface |
| WhatsApp Bot | whatsapp | N/A | WhatsApp messages |
| Job Worker | worker | N/A | Async jobs (BullMQ) |
| Brain | core | N/A | Gemini AI classification |
| Router | core | N/A | Intent dispatch |
| Docker Manager | core | N/A | Container lifecycle |
| Scheduler | core | N/A | Cron jobs (BullMQ) |

