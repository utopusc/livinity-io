# LivOS - Self-Hosted AI-Powered Home Server OS

## What This Is

LivOS is a self-hosted home server operating system with an integrated autonomous AI agent (Nexus). Users interact via Telegram, Discord, and a web UI. The AI agent runs through Kimi Code, with MCP tools for shell, Docker, files, browser control, and more. The goal is an OpenClaw-class personal AI platform that anyone can install with a single command — now expanding to support multiple users sharing the same server.

## Core Value

**One-command deployment of a personal AI-powered server that just works.** Users should be able to run a single install script and have a fully functional home server with AI assistant ready to use — now for the whole household.

## Current Milestone: v7.0 — Multi-User Support

**Goal:** Transform LivOS from a single-user system into a multi-user platform where multiple people share one server, each with isolated apps, files, AI conversations, and personalized experience — while the admin retains full control.

**Target features:**
- PostgreSQL database migration from single-user YAML FileStore
- User account system with RBAC (admin/member/guest)
- Beautiful login screen with user avatar selection
- Per-user Docker app instances (same subdomain, different container per user)
- Dynamic App Gateway proxy (LivOS routes based on authenticated user)
- App sharing system (right-click → Share → select user → auto-access)
- Per-user file system isolation (/opt/livos/data/users/{username}/files/)
- Redis key namespacing for AI data isolation (nexus:u:{userId}:*)
- Domain-wide SSO cookie (.livinity.cloud) for seamless subdomain auth
- Docker compose templating system for per-user app instances
- Wildcard Caddy config (all subdomains → LivOS dynamic proxy)

## Requirements

### Validated

*Existing capabilities from codebase analysis:*

- ✓ Web UI with desktop-like windowed interface — existing
- ✓ Docker application management (install, start, stop, remove) — existing
- ✓ File manager with upload, download, rename, delete — existing
- ✓ User authentication with JWT — existing
- ✓ AI chat via web UI with SSE streaming — existing
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

### Validated (v1.5 — Claude Migration & AI Platform)

- ✓ Claude Code SDK subscription mode (SdkAgentRunner with dontAsk) — v1.5
- ✓ Multi-provider AI abstraction (AIProvider interface, ProviderManager) — v1.5
- ✓ Claude native tool calling (tool_use content blocks) — v1.5
- ✓ Gemini fallback with dual-mode AgentLoop — v1.5
- ✓ Hybrid memory (extraction, dedup, temporal scoring, session binding) — v1.5
- ✓ Slack channel provider (@slack/bolt Socket Mode) — v1.5
- ✓ Matrix channel provider (matrix-js-sdk) — v1.5
- ✓ WebSocket JSON-RPC 2.0 gateway with auth — v1.5
- ✓ Human-in-the-loop tool approval system — v1.5
- ✓ Git-based skill marketplace (LivHub) — v1.5
- ✓ BullMQ parallel agent execution — v1.5
- ✓ Telegram dedup + stale message filter — v1.5-fix
- ✓ Channel conversation history (all channels) — v1.5-fix
- ✓ AI-generated live updates to channels — v1.5-fix

### Validated (v2.0 — OpenClaw-Class AI Platform)

- ✓ All v2.0 features (83 requirements complete) — v2.0

### Validated (v5.0/v5.2 — Light Theme & UI Overhaul)

- ✓ Light theme design system (tailwind tokens, CSS variables) — v5.0
- ✓ motion-primitives integration (Tilt, Spotlight, Magnetic, AnimatedBackground, BorderTrail) — v5.2
- ✓ Files redesign: sidebar icons, grid/list items, toolbar, sort dropdown, search, view toggle — v5.2
- ✓ App Store redesign: sheet + window versions with light theme — v5.2
- ✓ Settings window routing fix — v5.2
- ✓ Window chrome cursor fix — v5.2

### Validated (v5.3 — UI Polish & Consistency)

- ✓ Files polish, Dashboard Tilt/Spotlight, visual consistency, performance audit — v5.3
- ✓ Apple Spotlight search, terminal dark theme, desktop search button — v5.3
- ✓ Strategic research (8 reports) — v5.3

### Validated (v6.0 — Kimi Code Migration)

- ✓ KimiProvider with OpenAI-compatible API, tool calling, streaming — v6.0
- ✓ KimiAgentRunner with CLI print mode + MCP bridging — v6.0
- ✓ Settings UI for Kimi auth and config — v6.0
- ✓ Onboarding wizard updated for Kimi Code — v6.0
- ✓ All Claude/Anthropic/Gemini code removed — v6.0
- ✓ Tool approval system with Telegram inline buttons — v6.0
- ✓ Chat UI approval prompt — v6.0

### Active (v7.0 — Multi-User Support)

- [ ] PostgreSQL migration from YAML FileStore
- [ ] Users table with RBAC (admin/member/guest)
- [ ] Session-based auth with domain-wide SSO cookie
- [ ] Login screen with user avatar selection
- [ ] Per-user Docker app instances with compose templating
- [ ] Dynamic App Gateway proxy (same subdomain → different container per user)
- [ ] App sharing system (right-click → Share → auto-access for target user)
- [ ] Per-user file system isolation
- [ ] Redis key namespacing for AI data isolation
- [ ] Wildcard Caddy config for dynamic routing
- [ ] User management UI in Settings (invite, roles, app access)

### Out of Scope

- WhatsApp — disabled for v2.0, only Telegram + Discord
- Slack/Matrix — already built in v1.5, maintenance only
- Mobile app — web-first approach, mobile later
- Cloud hosting option — self-hosted only
- Native desktop/mobile apps — web-based only for now
- Payment/billing system — free open source project
- Self-hosted LLM support — Kimi Code only for now
- Dark theme — fully light theme only
- Open self-registration — invite-only for security
- Per-user billing/quotas — simple shared server model first

## Context

**Current State (post v6.0):**
- Running production on Contabo VPS (45.137.194.103), 8GB RAM
- Single-user: one YAML FileStore, JWT {loggedIn: true}, no userId in tokens
- Nexus already has JID-based sessions (Telegram/Discord) but web UI is hardcoded 'web-ui'
- Caddy reverse proxy with per-app subdomain configs (rebuilt on each app install)
- Docker apps pulled from GitHub repos, patchComposeFile() modifies compose during install
- Domain: livinity.cloud with wildcard DNS available

**Technical Environment:**
- Node.js 22+, TypeScript 5.7+
- React 18 + Vite for frontend
- Tailwind CSS 3.4 with semantic design tokens
- shadcn/ui components + Framer Motion
- Express + tRPC for backend
- Redis (ioredis) for sessions, configs, AI data
- Docker for app management
- Caddy for reverse proxy + auto HTTPS
- Kimi Code as sole AI provider

## Constraints

- **Zero-downtime migration**: Existing single-user installation must auto-migrate
- **Resource budget**: 8GB RAM server, 3-5 users max
- **Security**: Per-user file isolation at OS level, path traversal prevention
- **Docker compose**: Apps come from GitHub repos — must template per-user without forking
- **Backward compatible**: Multi-user off by default, admin enables when ready
- **Cookie domain**: SSO requires `.livinity.cloud` domain-wide cookie
- **Single Kimi auth**: All users share same Kimi API credentials, data isolated per user

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep Vite/React over Next.js | v4.0 Next.js rewrite was reverted; Vite/React is proven stable | ✓ Good |
| Kimi Code as sole AI provider | v6.0 migration complete, working in production | ✓ Good |
| LivOS as dynamic proxy (not Caddy per-user) | Caddy can't do dynamic upstream routing based on auth; LivOS handles it | — Pending |
| PostgreSQL over extending YAML | YAML FileStore can't handle concurrent multi-user safely | — Pending |
| Shared-database, app-level isolation | Simpler than per-user DB schemas; matches Nextcloud pattern | — Pending |
| Invite-only registration | Home servers should never have open self-registration | — Pending |
| Per-user Docker networks | iptables isolation between user containers | — Pending |
| Compose templating over forking | Docker compose files from GitHub get modified per-user at install time | — Pending |

---
*Last updated: 2026-03-12 — v7.0 milestone (Multi-User Support)*
