# Technology Stack

**Analysis Date:** 2026-02-03

## Languages

**Primary:**
- TypeScript 5.7+ - All backend services, frontend, and AI components
- JavaScript (ES2022 target) - Build outputs, config files

**Secondary:**
- Python 3.x - Memory service (`nexus/packages/memory/src/server.py`), some utilities
- Shell/Bash - Deployment scripts, setup automation

## Runtime

**Environment:**
- Node.js 22.x (required: `>=22.0.0` in `livos/package.json`)
- Production server: Node.js v22.21.0

**Package Managers:**
- pnpm 10.28.2 - Primary for livos monorepo (`livos/pnpm-workspace.yaml`)
- npm - Used for nexus workspace packages
- Lockfiles: `pnpm-lock.yaml` (livos), `package-lock.json` (nexus)

## Frameworks

**Backend:**
- Express 4.18.x - HTTP server for livinityd and AI services
- tRPC 11.1.x - Type-safe API layer (`@trpc/server`, `@trpc/client`)
- Hono - Used by MCP SDK internally

**Frontend:**
- React 18.x - UI framework
- React Router 6.17 - Client-side routing
- Vite 4.4.x - Build tool and dev server

**AI/Agent:**
- Google Generative AI SDK 0.21.x - Primary LLM provider (Gemini models)
- Anthropic SDK 0.39.x - Secondary LLM provider (Claude models)
- Model Context Protocol (MCP) SDK 1.12+ - Tool/skill framework

**Testing:**
- Vitest 2.1.x - Unit and integration tests for backend
- Playwright 1.40.x - E2E tests for UI

**Build/Dev:**
- TypeScript 5.7+ - Static typing
- tsx 4.x - TypeScript execution without compilation
- SWC - Fast React compilation via `@vitejs/plugin-react-swc`
- Vite - Frontend bundling with HMR

## Monorepo Structure

**LivOS Workspace (`livos/`):**
```
packages:
  - packages/ui          # React frontend
  - packages/livinityd   # Main daemon/backend
  - packages/livcoreai   # AI agent framework library
  - packages/liv         # Embedded Nexus-like AI stack
  - packages/marketplace # App marketplace
```

**Nexus Workspace (`nexus/`):**
```
packages/*:
  - packages/core        # Brain, Daemon, Agent loop
  - packages/mcp-server  # MCP tool server
  - packages/memory      # SQLite/Python memory service
  - packages/whatsapp    # WhatsApp bridge
  - packages/worker      # BullMQ job processor
  - packages/hooks       # Deployment hooks
```

## Key Dependencies

**Critical (AI/Agent):**
- `@google/generative-ai` ^0.21.0 - Gemini API client (primary LLM)
- `@anthropic-ai/sdk` ^0.39.0 - Claude API client (fallback)
- `@modelcontextprotocol/sdk` ^1.12.0 - MCP tool framework
- `bullmq` ^5.0.0 - Redis-backed job queues
- `ioredis` ^5.4.0 - Redis client for pub/sub, caching, queues

**Messaging Channels:**
- `@whiskeysockets/baileys` ^7.0.0 - WhatsApp Web API (unofficial)
- `discord.js` ^14.0.0 - Discord bot
- `grammy` ^1.0.0 - Telegram bot
- `@slack/bolt` ^4.0.0 - Slack integration
- `@line/bot-sdk` ^9.0.0 - LINE messaging

**Infrastructure:**
- `dockerode` ^4.0.0 - Docker API client
- `pg` ^8.13.0 - PostgreSQL client
- `better-sqlite3` ^11.0.0 - SQLite for memory service
- `winston` ^3.17.0 - Structured logging
- `node-cron` ^3.0.0 - Cron scheduling
- `ws` ^8.x - WebSocket server/client

**UI Critical:**
- `@tanstack/react-query` 5.74.x - Server state management
- `@trpc/react-query` 11.1.x - tRPC React bindings
- `zustand` ^5.0.2 - Client state management
- `tailwindcss` 3.4.x - Utility-first CSS
- `framer-motion` 10.16.x - Animations
- `@radix-ui/*` - Headless UI primitives

**Server Management:**
- `systeminformation` - System stats (forked from getumbrel)
- `node-pty` ^1.0.0 - PTY for terminal emulation
- `@parcel/watcher` ^2.5.1 - File watching
- `isomorphic-git` ^1.24.5 - Git operations
- `helmet` ^7.1.0 - Security headers

## Configuration

**TypeScript:**
- Target: ES2022
- Module: ES2022 with bundler resolution
- Strict mode enabled
- Source maps and declarations generated

**Environment Variables (Production):**
```bash
# AI
GEMINI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>

# Database
DATABASE_URL=postgresql://nexus:<pass>@localhost:5432/nexus
REDIS_URL=redis://:<pass>@localhost:6379

# Services
NODE_ENV=production
MCP_PORT=3100
API_PORT=3200
MEMORY_PORT=3300

# Security
JWT_SECRET=<secret>
LIV_API_KEY=<key>
```

**Build Configuration:**
- Vite config: `livos/packages/ui/vite.config.ts`
- Tailwind config: `livos/packages/ui/tailwind.config.ts`
- PostCSS config: `livos/packages/ui/postcss.config.js`
- TypeScript base: `nexus/tsconfig.base.json`

## Process Management

**PM2 Ecosystem Files:**
- `livos/ecosystem.config.cjs` - LivOS services
- `nexus/deploy/ecosystem.config.cjs` - Nexus services

**Production Services (PM2):**
| Service | Script | Port | Memory Limit |
|---------|--------|------|--------------|
| livos | `source/cli.ts` (tsx) | 8080 | 500M |
| nexus-core | `packages/core/dist/index.js` | - | 500M |
| nexus-mcp | `packages/mcp-server/dist/index.js` | 3100 | 300M |
| nexus-whatsapp | `packages/whatsapp/dist/index.js` | - | 300M |
| nexus-worker | `packages/worker/dist/index.js` | - | 500M |
| nexus-memory | `packages/memory/src/server.py` | 3300 | 500M |
| liv-worker | `packages/worker/dist/index.js` | - | 500M |

## Platform Requirements

**Development:**
- Node.js 22+
- pnpm 8+ (livos) / npm (nexus)
- Docker (for container management)
- Redis (local or remote)

**Production Server:**
- Ubuntu Linux (Contabo VPS at 45.137.194.103)
- Node.js 22.21.0
- pnpm 10.28.2
- PostgreSQL 16
- Redis Server
- Docker CE
- Caddy (reverse proxy, auto HTTPS)
- PM2 (process manager)

## Build Commands

**LivOS:**
```bash
pnpm install                    # Install dependencies
pnpm build                      # Build all packages
pnpm build:ui                   # Build frontend only
pnpm build:livd                 # Build daemon only
pnpm build:livcoreai            # Build AI library only
pnpm dev:ui                     # Dev server (port 3000)
pnpm dev:livd                   # Dev daemon
```

**Nexus:**
```bash
npm install                     # Install dependencies
npm run build                   # Build all packages + skills
npm run build:skills            # Build skills only
npm run dev:core                # Dev core daemon
npm run dev:mcp                 # Dev MCP server
npm run dev:whatsapp            # Dev WhatsApp bridge
```

---

*Stack analysis: 2026-02-03*
