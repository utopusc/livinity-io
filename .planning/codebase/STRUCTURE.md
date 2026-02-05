# Codebase Structure

**Analysis Date:** 2026-02-03

## Directory Layout

```
livinity-io/
├── .planning/              # GSD planning documents
│   └── codebase/           # Architecture docs (this file)
├── _archive/               # Archived/deprecated files
├── livos/                  # LivOS home server OS
│   ├── packages/
│   │   ├── livinityd/      # Backend daemon
│   │   ├── ui/             # React frontend
│   │   ├── livcoreai/      # AI SDK (shared)
│   │   ├── liv/            # Liv shared packages
│   │   └── marketplace/    # App marketplace
│   ├── skills/             # LivOS-specific skills
│   ├── logs/               # Development logs
│   ├── ecosystem.config.cjs # PM2 config
│   └── package.json        # pnpm workspace root
└── nexus/                  # Autonomous AI agent system
    ├── packages/
    │   ├── core/           # Main AI daemon
    │   ├── mcp-server/     # MCP protocol server
    │   ├── whatsapp/       # WhatsApp integration
    │   ├── worker/         # Background job worker
    │   ├── memory/         # AI memory service
    │   └── hooks/          # React hooks (shared)
    ├── skills/             # AI skills (TypeScript)
    ├── deploy/             # Deployment scripts
    └── package.json        # npm workspace root
```

## Directory Purposes

**livos/packages/livinityd:**
- Purpose: LivOS backend server daemon
- Contains: Express server, tRPC API, module system
- Key files:
  - `source/index.ts` - Main Livinityd class
  - `source/cli.ts` - CLI entry point
  - `source/modules/` - Feature modules
  - `source/modules/server/` - HTTP server, tRPC, WebSocket

**livos/packages/livinityd/source/modules:**
- `ai/` - AI chat bridge (routes.ts, index.ts)
- `apps/` - Docker app management
- `backups/` - Backup system (Restic-based)
- `files/` - File browser, shares, recents
- `server/` - HTTP server, tRPC setup
- `user/` - User authentication, settings
- `utilities/` - Logger, file store, helpers
- `system/` - OS-level operations
- `domain/` - Custom domain setup

**livos/packages/ui:**
- Purpose: React SPA frontend
- Contains: Components, routes, providers, hooks
- Key files:
  - `src/main.tsx` - React entry point
  - `src/router.tsx` - React Router config
  - `src/trpc/trpc.ts` - tRPC client

**livos/packages/ui/src:**
- `routes/` - Page components (app-store, settings, etc.)
- `modules/` - Feature modules (desktop, window, sidebar)
- `features/` - Self-contained features (files, backups)
- `components/` - Shared UI components
- `providers/` - React context providers
- `hooks/` - Custom React hooks
- `shadcn-components/` - shadcn/ui components
- `layouts/` - Page layout wrappers

**nexus/packages/core:**
- Purpose: Main AI agent daemon
- Contains: Daemon, Brain, Agent, Tools, Skills
- Key files:
  - `src/index.ts` - Main entry, initializes everything
  - `src/daemon.ts` - Central orchestrator (~3000 lines)
  - `src/agent.ts` - ReAct agent loop
  - `src/brain.ts` - LLM abstraction (Gemini)
  - `src/api.ts` - Express REST/WebSocket API
  - `src/tool-registry.ts` - Tool management

**nexus/packages/core/src:**
- `channels/` - Messaging adapters (telegram.ts, discord.ts)
- `config/` - Configuration schema and manager
- `infra/` - Infrastructure (retry, backoff, errors)
- `modules/` - Feature modules (apps)

**nexus/packages/mcp-server:**
- Purpose: Model Context Protocol server
- Contains: MCP endpoint for Claude/Cursor integration
- Key files:
  - `src/index.ts` - Express server with MCP transport
  - `src/tools/` - MCP-exposed tools

**nexus/packages/worker:**
- Purpose: Background job processing
- Contains: BullMQ worker with job handlers
- Key files:
  - `src/index.ts` - Worker entry
  - `src/jobs/` - Job handlers (scrape, research, leadgen)

**nexus/packages/memory:**
- Purpose: AI memory with embeddings
- Contains: SQLite storage, Gemini embeddings
- Key files:
  - `src/index.ts` - Express API with SQLite

**nexus/skills:**
- Purpose: Reusable AI task templates
- Contains: TypeScript skills with YAML frontmatter
- Key files:
  - `server-health.ts` - System health check
  - `research.ts` - Web research skill
  - `deploy.ts` - Deployment skill
  - `_templates/` - Skill templates

## Key File Locations

**Entry Points:**
- `livos/packages/livinityd/source/cli.ts` - LivOS server entry
- `nexus/packages/core/src/index.ts` - Nexus daemon entry
- `nexus/packages/mcp-server/src/index.ts` - MCP server entry
- `nexus/packages/worker/src/index.ts` - Worker entry
- `livos/packages/ui/src/main.tsx` - UI entry

**Configuration:**
- `livos/ecosystem.config.cjs` - PM2 config for LivOS
- `nexus/packages/core/src/config/schema.ts` - Nexus config schema
- `livos/packages/livinityd/source/constants.ts` - LivOS constants

**Core Logic:**
- `nexus/packages/core/src/daemon.ts` - AI orchestrator
- `nexus/packages/core/src/agent.ts` - Agent loop
- `nexus/packages/core/src/brain.ts` - LLM interface
- `livos/packages/livinityd/source/modules/ai/index.ts` - AI bridge

**Testing:**
- `livos/packages/livinityd/source/modules/test-utilities/` - Test helpers
- `livos/packages/ui/` - Playwright tests (playwright/)

**tRPC Routers:**
- `livos/packages/livinityd/source/modules/server/trpc/` - tRPC setup
- `livos/packages/livinityd/source/modules/*/routes.ts` - Feature routers

## Naming Conventions

**Files:**
- `kebab-case.ts` for most files
- `index.ts` for module entry points
- `*.routes.ts` or `routes.ts` for tRPC routers
- `*.test.ts` for test files
- `use-*.ts` for React hooks

**Directories:**
- `kebab-case/` for feature directories
- `_*` prefix for internal/template directories

**Code:**
- `PascalCase` for classes and React components
- `camelCase` for functions and variables
- `SCREAMING_SNAKE_CASE` for constants

## Where to Add New Code

**New AI Tool:**
1. Add tool to `nexus/packages/core/src/daemon.ts` in `registerTools()` method
2. Define parameters, description, and execute function
3. Tool automatically appears in agent prompt

**New Skill:**
1. Create `nexus/skills/{skill-name}.ts`
2. Add YAML frontmatter (name, description, tools, triggers)
3. Export `handler(ctx: SkillContext)` function
4. Skill auto-loaded by SkillLoader

**New livinityd Module:**
1. Create `livos/packages/livinityd/source/modules/{module}/`
2. Add `index.ts` for module class
3. Add `routes.ts` for tRPC procedures
4. Register in `livos/packages/livinityd/source/index.ts`

**New UI Route:**
1. Create page in `livos/packages/ui/src/routes/{route}/index.tsx`
2. Add to router in `livos/packages/ui/src/router.tsx`
3. For windowed content, use WindowManager pattern instead

**New UI Window Content:**
1. Create content in `livos/packages/ui/src/modules/window/app-contents/{name}-content.tsx`
2. Register in WindowManager/dock configuration

**New React Hook:**
1. Create `livos/packages/ui/src/hooks/use-{name}.ts`
2. Export from hooks index if needed

**New shadcn Component:**
1. Use `npx shadcn-ui add {component}`
2. Component added to `src/shadcn-components/ui/`

## Special Directories

**.planning/:**
- Purpose: GSD planning and codebase docs
- Generated: Yes (by Claude)
- Committed: Yes

**_archive/:**
- Purpose: Deprecated/archived code
- Generated: No
- Committed: Yes (but should be cleaned)

**node_modules/:**
- Purpose: Dependencies
- Generated: Yes (by pnpm/npm)
- Committed: No

**dist/:**
- Purpose: Compiled TypeScript output
- Generated: Yes (by tsc/vite)
- Committed: No (except for deployment)

**logs/:**
- Purpose: Runtime logs
- Generated: Yes
- Committed: No

## Server Directory Structure

**Production (/opt/livos/):**
```
/opt/livos/
├── data/                   # Persistent data
│   ├── app-data/           # Docker app volumes
│   ├── app-stores/         # App store cache
│   ├── home/               # User home directory
│   ├── livinity.yaml       # Main config file
│   └── secrets/            # JWT, etc.
├── packages/               # Source packages
│   ├── livinityd/          # Server daemon
│   └── ui/                 # UI dist
├── ecosystem.config.cjs    # PM2 config
└── logs/                   # Server logs
```

**Production (/opt/nexus/app/):**
```
/opt/nexus/app/
├── packages/               # Compiled packages
│   └── core/dist/          # Core daemon
├── skills/                 # AI skills
├── src/                    # Live source (for skills)
├── ecosystem.config.cjs    # PM2 config
└── logs/                   # Service logs
```

---

*Structure analysis: 2026-02-03*
