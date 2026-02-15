# LivOS - Self-Hosted AI-Powered Home Server OS

## What This Is

LivOS is a self-hosted home server operating system with an integrated autonomous AI agent (Nexus). Users can manage Docker applications, files, backups through a web UI, and interact with the AI via WhatsApp, Telegram, Discord, or the web interface. The goal is to make this an open-source project that anyone can install with a single terminal command.

## Core Value

**One-command deployment of a personal AI-powered server that just works.** Users should be able to run a single install script and have a fully functional home server with AI assistant ready to use.

## Requirements

### Validated

*Existing capabilities from codebase analysis:*

- ✓ Web UI with desktop-like windowed interface — existing
- ✓ Docker application management (install, start, stop, remove) — existing
- ✓ File manager with upload, download, rename, delete — existing
- ✓ User authentication with JWT — existing
- ✓ AI chat via web UI with SSE streaming — existing
- ✓ WhatsApp bot integration — existing
- ✓ Telegram bot integration — existing
- ✓ Discord bot integration — existing
- ✓ MCP server for Claude/Cursor integration — existing
- ✓ Background job processing with BullMQ — existing
- ✓ Memory service with embeddings — existing
- ✓ Tool system (shell, docker, files, scrape, etc.) — existing
- ✓ Skill system with hot-reload — existing
- ✓ Reverse proxy with Caddy (auto HTTPS) — existing

### Validated (v1.1 + v1.2)

- ✓ Complete UI redesign with Minimal & Clean design language — v1.1
- ✓ Semantic design token system (surface/border/text/radius/elevation) — v1.1
- ✓ Visual Impact redesign with improved token values — v1.2
- ✓ Mobile responsiveness with touch targets and blur optimization — v1.1
- ✓ AI chat with conversation sidebar, tool calls, MCP panel — v1.1

### Validated (v1.3 — Browser App)

- ✓ Custom Docker image (linuxserver/chromium + Node.js + Playwright MCP) — v1.3
- ✓ Access via subdomain (browser.domain.com) — v1.3
- ✓ Persistent browser sessions that survive container restarts — v1.3
- ✓ Playwright MCP auto-registration for AI browser control — v1.3
- ✓ SOCKS5/HTTP proxy configuration for privacy/geo-unblocking — v1.3
- ✓ Anti-detection flags to prevent automation fingerprinting — v1.3
- ✓ App Store integration (gallery manifest + builtin featured listing) — v1.3
- ✓ Crash recovery with stale lock file cleanup — v1.3

### Active (v1.5 — Claude Migration & AI Platform)

**Goal:** Replace Gemini AI backend with Claude subscription-based auth, integrate OpenClaw-inspired features (multi-provider, hybrid memory, skill marketplace, expanded channels), and add one-click Claude auth flow in the LivOS UI.

**Target features:**
- [ ] Claude Code CLI auto-install via install.sh
- [ ] One-click Claude subscription auth in LivOS UI (wrap `claude setup-token`)
- [ ] Brain class rewrite: @google/genai → @anthropic-ai/sdk with subscription token
- [ ] Multi-provider AI support (Claude primary, OpenAI/Gemini fallback)
- [ ] Hybrid memory system (session + long-term + vector + graph)
- [ ] Skill marketplace with community skill discovery and install
- [ ] Enhanced channel system (WhatsApp, Telegram, Discord, Slack, Matrix, Web, API, CLI)
- [ ] Agent capabilities: sub-agents, parallel execution, human-in-the-loop
- [ ] OpenClaw-inspired gateway pattern for WebSocket RPC communication
- [ ] Security: localhost-only services, Docker isolation, JWT auth preserved

### Out of Scope

- Mobile app — web-first approach, mobile later
- Multi-tenancy — single-user home server focus
- Cloud hosting option — self-hosted only for v1
- Video calling/real-time features — messaging sufficient for now
- Payment/billing system — free open source project

## Context

**Current State:**
- Running in production on Contabo VPS (45.137.194.103)
- Monorepo with pnpm (livos/) and npm (nexus/) workspaces
- 80% code duplication across 3 AI daemon implementations
- Hardcoded domain (livinity.cloud) and paths (/opt/livos, /opt/nexus)
- Security concerns: exposed secrets, incomplete shell blocklist

**Technical Environment:**
- Node.js 22+, TypeScript 5.7+
- React 18 + Vite for frontend
- Express + tRPC for backend
- Redis for state, queues, pub/sub
- PostgreSQL for persistent data
- Docker for containerized apps
- Caddy for reverse proxy

**Target Users:**
- Self-hosters who want a personal server with AI
- Developers who want to extend with custom tools/skills
- Privacy-conscious users avoiding cloud services

## Constraints

- **Tech Stack**: Keep existing Node.js/TypeScript stack — extensive existing code
- **Compatibility**: Must work on standard Linux VPS (Ubuntu 22.04+)
- **Resources**: Single VPS deployment (2-4 CPU, 4-8GB RAM typical)
- **Zero Breaking Changes**: Existing installations should upgrade smoothly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep Nexus as single AI daemon | Most complete implementation, already multi-channel | — Pending |
| Event-driven over polling | Reduces latency from 30s to instant | — Pending |
| Environment variables over .env files | Standard deployment practice, secrets manager compatible | — Pending |
| Single install script | Lowers barrier to entry for non-technical users | — Pending |

| Browser as App Store app | Install from store, not hardcoded into UI | — Pending |
| KasmVNC over iframe | Web viewer embedded in LivOS window | — Pending |
| Playwright MCP via hooks | Auto-register/deregister on app lifecycle | — Pending |

---
*Last updated: 2026-02-15 — v1.5 milestone (Claude Migration & AI Platform)*
