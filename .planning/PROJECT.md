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

### Active (v1.1 — UI Redesign)

*This milestone's goals:*

**Complete UI Redesign — Minimal & Clean (Apple/Linear style):**
- [ ] Replace Umbrel-inherited UI with Livinity-branded modern interface
- [ ] Redesign desktop layout with cleaner grid, spacing, and typography
- [ ] Redesign dock with refined animations and minimal aesthetics
- [ ] Redesign window system with improved glassmorphism and polish
- [ ] Redesign sheet/modal system for consistency and elegance
- [ ] Redesign settings pages with structured, clean layouts
- [ ] Redesign app store with modern card-based browsing
- [ ] Redesign file manager with clean, functional interface
- [ ] Redesign AI chat interface with professional conversation UI
- [ ] Redesign login/onboarding flow with branded experience
- [ ] Update color system with refined palette and better contrast
- [ ] Update typography system with tighter hierarchy
- [ ] Improve animations and micro-interactions
- [ ] Ensure mobile responsiveness across all redesigned views
- [ ] Create cohesive Livinity brand identity throughout UI

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

---
*Last updated: 2026-02-06 — v1.1 milestone (UI Redesign)*
