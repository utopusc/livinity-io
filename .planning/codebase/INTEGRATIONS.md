# External Integrations

**Analysis Date:** 2026-02-03

## AI/LLM Providers

**Google Gemini (Primary):**
- SDK: `@google/generative-ai` ^0.21.0
- Auth: `GEMINI_API_KEY` env var
- Models used:
  - `gemini-3-flash-preview` - Default for flash/haiku/sonnet tiers
  - `gemini-2.5-pro` - Heavy tasks (opus tier)
- Implementation: `nexus/packages/core/src/brain.ts`, `livos/packages/livcoreai/src/brain.ts`
- Features: Streaming, multi-turn chat, token counting

**Anthropic Claude (Fallback):**
- SDK: `@anthropic-ai/sdk` ^0.39.0
- Auth: `ANTHROPIC_API_KEY` env var
- Status: Configured but currently using Gemini as primary
- Implementation: SDK imported but Brain class primarily uses Gemini

## Messaging Channels

**WhatsApp (Primary Channel):**
- SDK: `@whiskeysockets/baileys` ^7.0.0 (unofficial Web API)
- Implementation: `nexus/packages/whatsapp/src/index.ts`
- Auth: Multi-file auth state stored in `/opt/nexus/whatsapp-auth/`
- Features:
  - QR code linking (stored in Redis as base64)
  - Command prefix: `!` (only `!command` messages processed)
  - Chat history storage (last 50 messages per chat)
  - Outbox polling for daemon-initiated messages
- Config via Redis:
  - `nexus:wa_status` - Connection status
  - `nexus:wa_qr` - QR code for linking
  - `nexus:wa_history:<jid>` - Chat history
  - `nexus:wa_outbox` - Outgoing message queue
  - `nexus:inbox` - Incoming message queue

**Telegram:**
- SDK: `grammy` ^1.0.0
- Implementation: `nexus/packages/core/src/channels/telegram.ts`
- Auth: Bot token via Redis `nexus:telegram:config`
- Config keys: `token`, `enabled`
- Status tracked in Redis: `nexus:telegram:status`

**Discord:**
- SDK: `discord.js` ^14.0.0
- Implementation: `nexus/packages/core/src/channels/discord.ts`
- Auth: Bot token via Redis `nexus:discord:config`
- Config keys: `token`, `enabled`
- Status tracked in Redis: `nexus:discord:status`

**Slack:**
- SDK: `@slack/bolt` ^4.0.0
- Status: Dependency present, implementation pending

**LINE:**
- SDK: `@line/bot-sdk` ^9.0.0
- Status: Dependency present, implementation pending

## Data Storage

**PostgreSQL:**
- Version: 16 (systemd service `postgresql@16-main`)
- Client: `pg` ^8.13.0
- Connection: `DATABASE_URL` env var
- Format: `postgresql://nexus:<password>@localhost:5432/nexus`
- Usage: Nexus persistent storage, conversations, skills

**Redis:**
- Server: Native redis-server (systemd)
- Client: `ioredis` ^5.4.0
- Connection: `REDIS_URL` env var
- Format: `redis://:<password>@localhost:6379`
- Usage:
  - Message queues (inbox, outbox)
  - Pub/sub for config updates
  - Session storage
  - Channel status/config
  - API key storage (`livos:config:gemini_api_key`)
  - WhatsApp state

**SQLite (Memory Service):**
- Client: `better-sqlite3` ^11.0.0
- Usage: Local memory/context storage for Nexus
- Location: Python memory service at port 3300

## Docker Integration

**Docker API:**
- Client: `dockerode` ^4.0.0
- Connection: Default Docker socket
- Implementation: `livos/packages/livinityd/source/modules/ai/routes.ts`
- Capabilities:
  - List containers
  - Start/stop/restart containers
  - Direct management via tRPC endpoints

**Running Containers (Production):**
| Container | Image | Purpose |
|-----------|-------|---------|
| immich_server_1 | ghcr.io/immich-app/immich-server:v2.3.1 | Photo management |
| immich_postgres_1 | ghcr.io/immich-app/postgres:14 | Immich database |
| immich_machine-learning_1 | ghcr.io/immich-app/immich-machine-learning:v2.3.1 | ML processing |
| immich_redis_1 | valkey/valkey:8-bookworm | Immich cache |
| vikunja_web_1 | vikunja/vikunja:0.24.6 | Task management |
| vikunja_db_1 | mariadb:10.11.8 | Vikunja database |
| n8n_server_1 | n8nio/n8n:1.123.5 | Workflow automation |
| auth | livos/auth-server:1.0.5 | Auth service |
| tor_proxy | livos/tor:0.4.7.8 | Tor proxy |

## Web Scraping

**Firecrawl:**
- Config: `FIRECRAWL_URL=http://localhost:3002`
- Usage: Web scraping for research/content skills
- Status: Self-hosted instance expected

## Reverse Proxy & SSL

**Caddy:**
- Config: `/etc/caddy/Caddyfile`
- Features: Auto HTTPS, reverse proxy
- Routes:
  - `livinity.cloud` -> `127.0.0.1:8080` (LivOS)
  - `vikunja2.livinity.cloud` -> `127.0.0.1:4523`
  - `n8n.livinity.cloud` -> `127.0.0.1:5678`
  - `immich.livinity.cloud` -> `127.0.0.1:2283`

## Model Context Protocol (MCP)

**MCP Server:**
- SDK: `@modelcontextprotocol/sdk` ^1.12.0
- Implementation: `nexus/packages/mcp-server/src/index.ts`
- Port: 3100
- Purpose: Expose tools to external MCP clients

**MCP Client Manager:**
- Implementation: `nexus/packages/core/src/mcp-client-manager.ts`
- Purpose: Connect to external MCP servers for tool discovery

## Email/SMTP

**Configuration (from `.env.example`):**
```bash
NOTIFICATION_EMAIL=<email>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<gmail>
SMTP_PASS=<app-password>
```
- Usage: Notifications, heartbeat alerts
- Status: Configured in env, used by heartbeat system

## Authentication

**JWT-based Auth:**
- Library: `jsonwebtoken` ^9.0.1, `express-jwt` ^8.4.1
- Secret: `JWT_SECRET` env var
- Implementation: `livos/packages/livinityd/` auth middleware

**Session Management:**
- Library: `express-session` ^1.17.3
- Store: `session-file-store` ^1.5.0
- Implementation: File-based session storage

**2FA (TOTP):**
- Library: `notp` ^2.0.3, `thirty-two` ^1.0.2
- Usage: Optional 2FA for user accounts

**API Key Auth:**
- Header: `X-API-Key`
- Env var: `LIV_API_KEY`
- Usage: Inter-service authentication (livinityd <-> nexus)

## Monitoring & Observability

**Logging:**
- Library: `winston` ^3.17.0
- Format: Structured JSON logs
- Locations: `/opt/livos/logs/`, `/opt/nexus/logs/`

**System Information:**
- Library: `systeminformation` (forked)
- Usage: CPU, memory, disk, temperature monitoring
- Implementation: Settings/device info pages

**Error Tracking:**
- None configured (uses logging only)

## Scheduled Tasks & Background Jobs

**BullMQ:**
- Queue system for async job processing
- Redis-backed
- Implementation: `nexus/packages/worker/src/index.ts`

**Node-cron:**
- Library: `node-cron` ^3.0.0
- Usage: Schedule manager for recurring tasks
- Implementation: `nexus/packages/core/src/schedule-manager.ts`

## Skills System

**Skill Loader:**
- Location: `nexus/skills/`
- Files: TypeScript skill definitions
- Skills available:
  - `content.ts` - Content generation
  - `deploy.ts` - Deployment automation
  - `leadgen-auto.ts` - Lead generation
  - `research.ts` - Research tasks
  - `server-health.ts` - Server health checks
  - `server-monitor.ts` - Monitoring
  - `site-audit.ts` - Website audits
  - `skill-create.ts` - Dynamic skill creation
  - `subagent-manage.ts` - Subagent management

## Environment Configuration

**Required Environment Variables:**
```bash
# AI (Required)
GEMINI_API_KEY           # Google Gemini API key

# Database (Required)
REDIS_URL                # Redis connection string
DATABASE_URL             # PostgreSQL connection (for nexus)

# Security (Required)
JWT_SECRET               # JWT signing secret
LIV_API_KEY              # Inter-service API key

# Services (Defaults available)
NODE_ENV=production
MCP_PORT=3100
API_PORT=3200
MEMORY_PORT=3300
DAEMON_INTERVAL_MS=30000
DEFAULT_MODEL=gemini-2.0-flash

# Optional
ANTHROPIC_API_KEY        # Claude fallback
WHATSAPP_ENABLED=true    # Enable WhatsApp
FIRECRAWL_URL            # Web scraping service
```

**Config Storage:**
- Runtime config stored in Redis (keys like `livos:config:*`, `nexus:*:config`)
- Persistent config in `.env` files
- UI config changes published via Redis pub/sub

## Webhooks & Callbacks

**Incoming:**
- tRPC subscriptions for real-time streaming
- Redis pub/sub for config updates (`nexus:channel:updated`, `nexus:wa_command`)

**Outgoing:**
- WhatsApp outbox polling system
- Channel message delivery (Telegram, Discord)
- Heartbeat notifications (configurable target)

## Internal APIs

**LivOS Daemon (livinityd):**
- Port: 8080
- Protocol: tRPC over HTTP
- Endpoints: `/trpc/*`
- Auth: JWT + session

**Nexus Core API:**
- Port: 3200
- Protocol: REST + tRPC
- Endpoints:
  - `/api/nexus/config` - Config management
  - `/api/subagents` - Subagent CRUD
  - `/api/schedules` - Schedule management
  - `/api/channels/{type}/test` - Channel testing
- Auth: `X-API-Key` header

**MCP Server:**
- Port: 3100
- Protocol: MCP (Model Context Protocol)
- Purpose: Tool exposure for external AI clients

**Memory Service:**
- Port: 3300
- Protocol: HTTP (Python Flask/FastAPI)
- Purpose: Context/memory storage

---

*Integration audit: 2026-02-03*
