# Nexus Directory & File Structure

**Project Type:** TypeScript/Node.js monorepo using npm workspaces.

---

## Root Directory Layout

```
C:/Users/hello/Desktop/Projects/contabo/nexus/
├── package.json                    # Monorepo root (workspaces config)
├── tsconfig.base.json              # Base TypeScript config
├── .env.example                    # Environment variables template
│
├── .git/                           # Git repository
│
├── .planning/
│   └── codebase/
│       ├── ARCHITECTURE.md         # System architecture (this guide)
│       └── STRUCTURE.md            # Directory structure (this file)
│
├── packages/                       # Monorepo packages
│   ├── core/                       # Main daemon + core logic
│   ├── mcp-server/                 # MCP protocol server
│   ├── whatsapp/                   # WhatsApp bot
│   ├── worker/                     # Async job worker
│   ├── memory/                     # Cognee memory (stub)
│   └── hooks/                      # Git/session hooks
│
└── deploy/
    └── docker-compose.yml          # Docker Compose configuration
```

---

## Packages Directory (Monorepo Structure)

### 1. packages/core

**Purpose:** Main daemon, event loop, routing, and core handlers.

```
packages/core/
├── package.json                    # Dependencies: ioredis, dockerode, bullmq, winston, etc.
├── tsconfig.json                   # Extends tsconfig.base.json
│
└── src/
    ├── index.ts                    # ENTRY POINT - Initialize and start daemon
    │                               # (80 lines)
    │
    ├── daemon.ts                   # CORE - Event loop & handler registration
    │                               # (368 lines)
    │                               # Exports: Daemon class
    │                               # ├─ start() - Begin event loop
    │                               # ├─ cycle() - Single daemon cycle
    │                               # ├─ addToInbox() - Add message to queue
    │                               # └─ registerHandlers() - Register built-in handlers
    │
    ├── router.ts                   # ROUTING - Intent classification & dispatch
    │                               # (177 lines)
    │                               # Exports: Router class, Intent, TaskResult
    │                               # ├─ classify() - Rule-based or AI classification
    │                               # ├─ route() - Execute handler or ask Brain
    │                               # ├─ register() - Register handler
    │                               # └─ ruleBasedClassify() - Pattern matching
    │
    ├── brain.ts                    # AI LAYER - Gemini integration & tier selection
    │                               # (78 lines)
    │                               # Exports: Brain class, ModelTier type
    │                               # ├─ think() - Call Gemini API
    │                               # └─ selectTier() - Cost optimization
    │
    ├── docker-manager.ts           # DOCKER API - Container lifecycle & exec
    │                               # (171 lines)
    │                               # Exports: DockerManager class
    │                               # ├─ list() - List all containers
    │                               # ├─ startTool() - Start tool container
    │                               # ├─ stopTool() - Stop tool container
    │                               # ├─ startContainer() - Start by name
    │                               # ├─ stopContainer() - Stop by name
    │                               # ├─ restartContainer() - Restart by name
    │                               # ├─ inspectContainer() - Get container info
    │                               # ├─ containerLogs() - Get logs
    │                               # ├─ exec() - Execute command in container
    │                               # └─ cleanup() - Stop idle containers
    │
    ├── shell.ts                    # SHELL EXECUTION - Command runner with safety
    │                               # (55 lines)
    │                               # Exports: ShellExecutor class
    │                               # ├─ execute() - Run shell command
    │                               # ├─ BLOCKED_PATTERNS - Safety blocklist
    │                               # └─ Output truncation (10K max)
    │
    ├── scheduler.ts                # CRON JOBS - BullMQ integration
    │                               # (62 lines)
    │                               # Exports: Scheduler class
    │                               # ├─ start() - Initialize BullMQ worker
    │                               # ├─ addJob() - Queue a job
    │                               # └─ stop() - Cleanup
    │
    ├── api.ts                      # EXPRESS API - HTTP endpoints
    │                               # (66 lines)
    │                               # Exports: createApiServer() function
    │                               # ├─ POST /api/webhook/git - Git webhooks
    │                               # ├─ GET /api/notifications - Fetch notifications
    │                               # ├─ POST /api/session - Session events
    │                               # ├─ GET /api/health - Health check
    │                               # └─ GET /api/status - Daemon status
    │
    └── logger.ts                   # LOGGING - Winston configuration
                                    # (17 lines)
                                    # Exports: logger instance
                                    # ├─ Console transport
                                    # └─ File transport (/opt/nexus/logs/nexus.log)
```

**Build Output:**
```
packages/core/dist/
├── index.js
├── daemon.js
├── router.js
├── brain.js
├── docker-manager.js
├── shell.js
├── scheduler.js
├── api.js
├── logger.js
└── *.js.map                       # Source maps
```

**Dependencies:**
```json
{
  "@anthropic-ai/sdk": "^0.39.0",
  "@google/generative-ai": "^0.21.0",
  "bullmq": "^5.0.0",
  "dockerode": "^4.0.0",
  "dotenv": "^16.4.0",
  "ioredis": "^5.4.0",
  "pg": "^8.13.0",
  "node-cron": "^3.0.0",
  "winston": "^3.17.0"
}
```

---

### 2. packages/mcp-server

**Purpose:** MCP (Model Context Protocol) server for Claude and other AI clients.

```
packages/mcp-server/
├── package.json                    # Dependencies: @modelcontextprotocol/sdk, express, ioredis
├── tsconfig.json                   # Extends tsconfig.base.json
│
└── src/
    ├── index.ts                    # ENTRY POINT - MCP server initialization
    │                               # (77 lines)
    │                               # ├─ Express app setup
    │                               # ├─ POST /mcp - Handle MCP requests
    │                               # ├─ GET /mcp - Session polling
    │                               # ├─ DELETE /mcp - Session cleanup
    │                               # ├─ GET /health - Health check
    │                               # └─ Session management
    │
    └── tools/
        └── index.ts                # TOOL REGISTRATION - MCP tool definitions
                                    # (253 lines)
                                    # Exports: registerTools(server, redis)
                                    # ├─ Helper: requestAndPoll() - Sync request pattern
                                    # │
                                    # └─ Tools:
                                    #   ├─ nexus_shell - Execute shell commands
                                    #   ├─ nexus_docker_manage - Docker lifecycle
                                    #   ├─ nexus_docker_exec - Run in container
                                    #   ├─ nexus_pm2 - Process management
                                    #   ├─ nexus_sysinfo - System info
                                    #   ├─ nexus_files - File operations
                                    #   ├─ nexus_task - Submit task
                                    #   ├─ nexus_status - Get daemon status
                                    #   ├─ nexus_logs - Get logs
                                    #   ├─ nexus_scrape - Web scraping
                                    #   ├─ nexus_remember - Store memory
                                    #   ├─ nexus_ask - Ask Brain
                                    #   ├─ nexus_test - Run tests
                                    #   └─ nexus_cron - Schedule tasks
```

**Build Output:**
```
packages/mcp-server/dist/
├── index.js
├── tools/
│   └── index.js
└── *.js.map
```

**Dependencies:**
```json
{
  "@modelcontextprotocol/sdk": "^1.12.0",
  "express": "^4.21.0",
  "zod": "^3.24.0",
  "ioredis": "^5.4.0",
  "dotenv": "^16.4.0"
}
```

**Protocol:** MCP (Model Context Protocol) JSON-RPC over HTTP with StreamableHTTPServerTransport

---

### 3. packages/whatsapp

**Purpose:** WhatsApp bot for receiving and responding to messages.

```
packages/whatsapp/
├── package.json                    # Dependencies: @whiskeysockets/baileys, ioredis, qrcode-terminal
├── tsconfig.json                   # Extends tsconfig.base.json
│
└── src/
    ├── index.ts                    # ENTRY POINT - WhatsApp bot initialization
    │                               # (116 lines)
    │                               # ├─ startBot() - Initialize Baileys socket
    │                               # ├─ Message handling & Redis push
    │                               # └─ pollForResponse() - Poll for answers
    │
    └── types/
        └── qrcode-terminal.d.ts    # TypeScript definitions for qrcode-terminal
```

**Build Output:**
```
packages/whatsapp/dist/
├── index.js
├── types/
│   └── qrcode-terminal.d.ts
└── *.js.map
```

**Dependencies:**
```json
{
  "@whiskeysockets/baileys": "^6.7.0",
  "ioredis": "^5.4.0",
  "dotenv": "^16.4.0",
  "qrcode-terminal": "^0.12.0",
  "pino": "^9.0.0"
}
```

**Authentication:** Multi-file auth state stored in `/opt/nexus/whatsapp-auth/`

---

### 4. packages/worker

**Purpose:** Async job worker for long-running tasks (scraping, testing, research, lead gen).

```
packages/worker/
├── package.json                    # Dependencies: bullmq, ioredis, dockerode, winston
├── tsconfig.json                   # Extends tsconfig.base.json
│
└── src/
    ├── index.ts                    # ENTRY POINT - BullMQ worker setup
    │                               # (62 lines)
    │                               # ├─ Connect to Redis
    │                               # ├─ Route jobs to handlers
    │                               # ├─ Store results in Redis
    │                               # └─ Error handling
    │
    ├── logger.ts                   # LOGGING - Worker logger
    │                               # (Similar to core/logger.ts)
    │
    └── jobs/
        ├── scrape.ts               # SCRAPE JOB - URL scraping via Firecrawl
        │                           # (50 lines)
        │                           # Exports: ScrapeJob class
        │                           # └─ process(job) - Static handler
        │                           # Input: {url, format:'markdown'|'text'|'html'}
        │                           # Output: {success, message, data:{url, content}}
        │
        ├── test.ts                 # TEST JOB - Playwright test execution
        │                           # (status: referenced, implementation minimal)
        │
        ├── research.ts             # RESEARCH JOB - Multi-source web research
        │                           # (70 lines)
        │                           # Exports: ResearchJob class
        │                           # └─ process(job) - Static handler
        │                           # Input: {query, depth:3}
        │                           # Output: {success, message, data:{query, sources:[]}}
        │
        └── leadgen.ts              # LEADGEN JOB - Lead generation
                                    # (status: referenced, implementation minimal)
```

**Build Output:**
```
packages/worker/dist/
├── index.js
├── logger.js
├── jobs/
│   ├── scrape.js
│   ├── test.js
│   ├── research.js
│   ├── leadgen.js
│   └── *.js.map
└── *.js.map
```

**Dependencies:**
```json
{
  "bullmq": "^5.0.0",
  "ioredis": "^5.4.0",
  "dockerode": "^4.0.0",
  "dotenv": "^16.4.0",
  "node-fetch": "^3.3.0",
  "winston": "^3.17.0"
}
```

**Queue Configuration:**
- Queue name: `nexus-jobs`
- Concurrency: 2 workers
- Job handlers: scrape, test, research, leadgen

---

### 5. packages/memory

**Purpose:** Cognee knowledge graph integration (currently placeholder).

```
packages/memory/
├── package.json                    # Placeholder package
└── src/
    └── index.ts                    # (stub or minimal implementation)
```

**Status:** Ready for Cognee integration. MCP tool `nexus_remember` pushes to `nexus:memory_queue`.

---

### 6. packages/hooks

**Purpose:** Git hooks and session lifecycle hooks.

```
packages/hooks/
├── check-inbox.js                  # Git hook - Check inbox before commit
├── session-start.js                # Session hook - Initialize session
└── (additional hooks as needed)
```

**Not core to daemon, used for automation.**

---

## Configuration Files

### tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "allowImportingTsExtensions": false
  }
}
```

**Settings:**
- ES2022 (modern JavaScript)
- Strict type checking
- ES modules (ESM)
- Output: `dist/` directory per package
- Source maps enabled for debugging

---

### deploy/docker-compose.yml

**Services Defined:**
- `nexus-core` - Main daemon + API
- `nexus-mcp` - MCP server
- `nexus-whatsapp` - WhatsApp bot
- `nexus-worker` - Async job worker
- `redis` - Redis instance
- `firecrawl` - Web scraping service
- (Other infrastructure services)

**Volumes:**
- `/opt/nexus/` - Shared data directory
- `/opt/nexus/logs/` - Log files
- `/var/run/docker.sock` - Docker socket (for container management)

---

### .env.example

**Template for environment variables:**

```bash
# Redis
REDIS_URL=redis://redis:6379

# AI/APIs
GEMINI_API_KEY=your_gemini_key_here

# Daemon
DAEMON_INTERVAL_MS=30000
API_PORT=3200
MCP_PORT=3100
SHELL_CWD=/opt/nexus

# WhatsApp
WHATSAPP_ENABLED=true
WHATSAPP_OWNER_JID=905xxxxxxxxxx@s.whatsapp.net

# External Services
FIRECRAWL_URL=http://firecrawl:3002

# Logging
LOG_LEVEL=info
```

---

## Build Output Structure

### Per Package

After running `npm run build` (or `npm run build --workspaces`):

```
packages/{name}/
├── dist/
│   ├── *.js                        # Compiled JavaScript (ESM)
│   ├── *.js.map                    # Source maps
│   └── **/*.js                     # Nested modules
│
└── src/
    └── *.ts                        # Source TypeScript (unchanged)
```

### Monorepo Build

```bash
npm run build                       # Builds all packages
npm run build -w @nexus/core        # Build specific package
```

---

## File Naming Conventions

### TypeScript Files

**Naming Pattern:** `kebab-case.ts`

- `daemon.ts` - Main daemon class
- `router.ts` - Routing logic
- `docker-manager.ts` - Docker integration
- `shell.ts` - Shell execution
- `api.ts` - Express API server

**Exceptions:** No underscores; use hyphens for multi-word files.

### Classes & Exports

**Naming Pattern:** `PascalCase`

```typescript
export class Daemon { }
export class Router { }
export class Brain { }
export class DockerManager { }
export class ShellExecutor { }
export class Scheduler { }
```

### Type & Interface Definitions

**Naming Pattern:** `PascalCase`

```typescript
export interface Intent { }
export interface TaskResult { }
export type Handler = (intent: Intent) => Promise<TaskResult>;
export type ModelTier = 'none' | 'flash' | 'haiku' | 'sonnet' | 'opus';
```

### Handler Functions

**Naming Pattern:** `camelCase` variables, passed as `Handler` type

```typescript
router.register('shell', async (intent) => { /* handler logic */ });
```

---

## Runtime Directory Structure

**On Server** (e.g., `/opt/nexus/`):

```
/opt/nexus/
├── logs/
│   └── nexus.log                   # Main daemon log (rotated)
│
├── whatsapp-auth/                  # WhatsApp Baileys auth state
│   ├── creds.json
│   ├── *.json
│   └── (other auth files)
│
└── (workspace/project files)
```

**Docker Volumes:**
- Host: `/opt/nexus/` → Container: `/opt/nexus/`
- Host: `/var/run/docker.sock` → Container: `/var/run/docker.sock` (Docker socket)

---

## Dependency Graph

### Monorepo Dependencies

```
@nexus/core
├─ ioredis (Redis client)
├─ dockerode (Docker API)
├─ bullmq (Job queue)
├─ @google/generative-ai (Gemini)
├─ winston (Logging)
└─ express (HTTP server)

@nexus/mcp-server
├─ @modelcontextprotocol/sdk (MCP protocol)
├─ express (HTTP server)
├─ ioredis (Redis client)
└─ zod (Schema validation)

@nexus/whatsapp
├─ @whiskeysockets/baileys (WhatsApp)
├─ ioredis (Redis client)
└─ qrcode-terminal (QR display)

@nexus/worker
├─ bullmq (Job queue)
├─ ioredis (Redis client)
└─ dockerode (Docker API)

@nexus/memory
├─ (stub - ready for Cognee)
```

### Shared Dependencies (via Monorepo)

- `ioredis` - Redis (core, mcp-server, whatsapp, worker)
- `bullmq` - Job queue (core scheduler + worker)
- `dotenv` - Environment loading
- TypeScript ecosystem (typescript, tsx, tsconfig.base.json)

---

## Package.json Structure

### Root (C:/Users/hello/Desktop/Projects/contabo/nexus/package.json)

```json
{
  "name": "nexus",
  "version": "1.0.0",
  "private": true,
  "description": "Personal AI Server - 7/24 calisan otonom AI isletim sistemi",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "dev:core": "npm run dev -w packages/core",
    "dev:mcp": "npm run dev -w packages/mcp-server",
    "dev:whatsapp": "npm run dev -w packages/whatsapp",
    "dev:worker": "npm run dev -w packages/worker",
    "dev:memory": "npm run dev -w packages/memory"
  }
}
```

### Individual Packages

Each package has:
```json
{
  "name": "@nexus/{package-name}",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js"
  },
  "dependencies": { /* package-specific */ },
  "devDependencies": { /* dev tools */ }
}
```

---

## Source vs. Build Structure Comparison

### Development (Source)

```
packages/core/src/
├── index.ts
├── daemon.ts
├── router.ts
└── ...
```

### Production (Compiled)

```
packages/core/dist/
├── index.js
├── daemon.js
├── router.js
├── *.js.map (source maps)
└── ...
```

**Entry Point Mapping:**
- Dev: `packages/core/src/index.ts` (via tsx watch)
- Prod: `packages/core/dist/index.js` (via node)

---

## Summary

| Aspect | Details |
|--------|---------|
| **Project Type** | Monorepo (npm workspaces) |
| **Language** | TypeScript ES2022 |
| **Module System** | ESM (export/import) |
| **Build Tool** | tsc (TypeScript Compiler) |
| **Package Count** | 6 (core, mcp-server, whatsapp, worker, memory, hooks) |
| **Total Source Files** | ~25 TypeScript files + configs |
| **Output Structure** | `dist/` per package |
| **Runtime Location** | `/opt/nexus/` (Docker volumes) |
| **Naming Convention** | kebab-case files, PascalCase classes |
| **Configuration** | .env, tsconfig.base.json, package.json |

