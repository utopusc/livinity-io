# Nexus — Autonomous AI Server Agent

## What This Is

Nexus is a 24/7 autonomous AI operating system running on a Contabo VPS (Server 4). It manages server infrastructure, processes tasks from multiple channels (MCP, WhatsApp, webhooks, cron), and orchestrates Docker containers, PM2 processes, and shell commands. Currently a single-step command dispatcher, it is being evolved into a full ReAct agent with modular skill/plugin architecture — enabling Gemini to autonomously plan, execute, observe, and iterate on complex multi-step tasks.

## Core Value

Gemini can autonomously solve complex server management tasks through a ReAct loop (Plan → Execute → Observe → Reflect → Repeat), with modular skills that anyone can add by dropping files into a folder.

## Requirements

### Validated

- ✓ Multi-channel message ingestion (MCP, WhatsApp, cron, webhook, daemon) — existing
- ✓ Intent classification (rule-based + Gemini Flash fallback) — existing
- ✓ Handler registry for action routing — existing
- ✓ Docker container lifecycle management (list, start, stop, restart, inspect, logs, exec) — existing
- ✓ Shell command execution with safety blocklist — existing
- ✓ PM2 process management — existing
- ✓ System monitoring (CPU, RAM, disk, network) — existing
- ✓ File operations (read, write, list, stat, delete, mkdir) — existing
- ✓ BullMQ job queue with worker processes — existing
- ✓ MCP server with 14 tools (request-response polling via Redis) — existing
- ✓ Cost-optimized AI tier system (none/flash/sonnet/opus) — existing
- ✓ WhatsApp bot integration — existing
- ✓ Web scraping (Firecrawl), research aggregation, lead generation — existing
- ✓ Winston logging with file rotation — existing

### Active

- [ ] ReAct agent loop (Plan → Execute → Observe → Reflect → Repeat) with max turn limit
- [ ] Tool registry — agents can discover and call registered tools dynamically
- [ ] Modular skill system — drop `.ts`/`.js` files into `skills/` folder, auto-loaded on startup
- [ ] Skill YAML frontmatter (name, description, tools, triggers, model_tier) — Claude Code style
- [ ] Skills can define their own tools that become available to the agent
- [ ] Subagent spawning — main agent can delegate to focused subagents
- [ ] Agent memory/scratchpad within a task (working context across turns)
- [ ] Observation loop — agent analyzes action results before deciding next step
- [ ] Error recovery — agent retries or adjusts approach on failure
- [ ] Skill auto-discovery and hot-reload without restart

### Out of Scope

- Multi-LLM support (OpenAI, Claude API, local models) — focus on Gemini first, abstract later
- Web UI / dashboard — CLI and MCP are sufficient interfaces
- Paid marketplace for skills — open source, community-driven
- Kubernetes / multi-server orchestration — single server is the scope
- Mobile app — WhatsApp is the mobile interface

## Context

**Technical Environment:**
- Server: Contabo VPS (12GB RAM, 193GB disk, Ubuntu), 81+ days uptime
- Runtime: Node.js 22 (ES2022, ESM modules), TypeScript strict mode
- AI: Google Gemini 2.5 (Flash for classification, Pro for reasoning)
- Queue: Redis + BullMQ for async job processing
- Containers: Docker with dockerode, 5+ protected containers
- Process Manager: PM2 with 5 services (core, mcp, whatsapp, worker, memory)
- MCP: HTTP streaming server on port 3100, bridges Claude Desktop to Nexus
- Memory: Python-based Cognee knowledge graph service

**Prior Work:**
- Full server management just implemented (shell, docker, pm2, sysinfo, files handlers)
- Router upgraded with detailed AI classification prompt for 16+ actions
- Request-response bridge via Redis (requestId polling) working end-to-end
- Bilingual support (Turkish + English) in rule-based classification

**Architecture Insight from Codebase Map:**
- Event-driven daemon with 30s cycle loop
- Intent → Handler pattern is extensible but currently static (compile-time registration)
- No agent loop — each message processed in single pass (classify → execute → done)
- Redis is the universal IPC — inbox, answers, memory, notifications, schedules

## Constraints

- **AI Provider**: Gemini only (cost optimization via tier system is core design)
- **Runtime**: Node.js + TypeScript (existing codebase, no rewrite)
- **IPC**: Redis (already deployed, all packages depend on it)
- **Deployment**: Single server, PM2 managed, no container orchestration
- **Backward Compatibility**: Existing MCP tools, WhatsApp bot, and API must continue working
- **Skill Format**: Deklarative YAML frontmatter + TypeScript handler (Claude Code inspired)
- **Plugin Loading**: File-based — `skills/` directory, auto-discovered at startup

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Gemini-only for agent loop | Cost optimization, existing tier system, single provider simplicity | — Pending |
| File-based skill loading (not npm) | Lower barrier to entry, simpler development cycle, hot-reload possible | — Pending |
| YAML frontmatter + TS handler | Declarative metadata separate from logic, Claude Code proven pattern | — Pending |
| Redis for agent IPC | Already deployed, all packages use it, proven at current scale | — Pending |
| ReAct with max turn limit | Prevents infinite loops, controllable cost, observable behavior | — Pending |
| In-process agent loop (not separate worker) | Lower latency, direct tool access, simpler architecture | — Pending |

---
*Last updated: 2026-01-26 after initialization*
