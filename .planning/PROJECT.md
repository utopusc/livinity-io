# LivOS - Self-Hosted AI-Powered Home Server OS

## What This Is

LivOS is a self-hosted home server operating system with an integrated autonomous AI agent (Nexus). Users interact via Telegram, Discord, and a web UI. The AI agent runs through Kimi Code, with MCP tools for shell, Docker, files, browser control, and more. The goal is an OpenClaw-class personal AI platform that anyone can install with a single command — now expanding to support multiple users sharing the same server.

## Core Value

**One-command deployment of a personal AI-powered server that just works.** Users should be able to run a single install script and have a fully functional home server with AI assistant ready to use — now for the whole household.

## Current Milestone: v7.1 — Per-User Isolation Completion

**Goal:** Complete per-user isolation across all settings, integrations, onboarding, and app store — building on the v7.0 database, auth, login, and basic isolation foundation already implemented.

**Target features:**
- Per-user wallpaper animation settings (localStorage → PostgreSQL user_preferences)
- Per-user integration configs (Telegram, Discord, Gmail) with nexus-core multi-user support
- Per-user MCP server settings
- Per-user Voice settings (Deepgram/Cartesia API keys)
- Onboarding personalization questions (role, use cases, style, tech stack → AI prompt)
- App Store per-user visibility (only show "Open" for apps user has access to)

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

### Validated (v1.0 through v6.0)

- ✓ All features from v1.0 through v6.0 — see MILESTONES.md

### Validated (v7.0 — Multi-User Foundation)

- ✓ PostgreSQL database with users, sessions, user_preferences, user_app_access tables
- ✓ JWT extended with {userId, role, sessionId}, backward-compatible verification
- ✓ Login screen with circular user avatars and password entry
- ✓ Invite system with admin-generated links (48h expiry)
- ✓ User management in Settings (roles, disable, sessions)
- ✓ Per-user file isolation (/opt/livos/data/users/{username}/files/)
- ✓ Per-user AI conversations via Redis key namespacing
- ✓ Per-user app visibility (myApps endpoint with access control)
- ✓ App sharing system (grant/revoke access, share dialog)
- ✓ Per-user accent color picker with CSS variable override
- ✓ Per-user wallpaper selection stored in PostgreSQL
- ✓ Domain-wide SSO cookie (.livinity.cloud)
- ✓ tRPC context with currentUser {id, username, role}
- ✓ Auto-grant app access on install
- ✓ Legacy app auto-migration for admin users

### Active (v7.1 — Per-User Isolation Completion)

- [ ] Per-user wallpaper animation settings (speed, hue, brightness, saturation)
- [ ] Per-user Telegram bot configuration
- [ ] Per-user Discord bot configuration
- [ ] Per-user Gmail OAuth credentials
- [ ] Per-user MCP server settings
- [ ] Per-user Voice settings (Deepgram/Cartesia keys)
- [ ] Onboarding personalization questions (role, use cases, style, tech stack)
- [ ] AI system prompt personalization from user preferences
- [ ] App Store per-user state (installed vs available vs accessible)

### Out of Scope

- WhatsApp — disabled for v2.0, only Telegram + Discord
- Slack/Matrix — already built in v1.5, maintenance only
- Mobile app — web-first approach, mobile later
- Cloud hosting option — self-hosted only
- Payment/billing system — free open source project
- Self-hosted LLM support — Kimi Code only for now
- Dark theme — fully light theme only
- Open self-registration — invite-only for security
- Per-user billing/quotas — simple shared server model first
- Per-user Docker container isolation (compose templating) — deferred to v7.2

## Context

**Current State (post v7.0 foundation):**
- Running production on Contabo VPS (45.137.194.103), 8GB RAM
- Multi-user: PostgreSQL, JWT with userId/role, login screen with avatars
- Per-user files, AI conversations, app visibility already working
- Accent color and wallpaper selection per-user via user_preferences table
- Nexus-core reads global Redis keys for integrations (not per-user yet)
- Wallpaper animation settings stored in localStorage (not per-user)
- Integration configs (Telegram, Discord, Gmail) stored globally in Redis
- MCP and Voice settings stored globally
- Onboarding wizard has no personalization questions

**Technical Environment:**
- Node.js 22+, TypeScript 5.7+
- React 18 + Vite for frontend
- Tailwind CSS 3.4 with semantic design tokens
- shadcn/ui components + Framer Motion
- Express + tRPC for backend
- Redis (ioredis) for sessions, configs, AI data
- PostgreSQL for users, preferences, app access
- Docker for app management
- Caddy for reverse proxy + auto HTTPS
- Kimi Code as sole AI provider

## Constraints

- **Global integrations**: Telegram/Discord bots are global (one bot token per server) — per-user means each user configures their OWN bot, not shared bot
- **Resource budget**: 8GB RAM server, 3-5 users max
- **Nexus-core compiled JS**: Must rebuild after changes (`npm run build --workspace=packages/core`)
- **Redis key migration**: Existing global keys must continue working for admin user
- **localStorage migration**: Wallpaper animation settings must migrate from localStorage to PostgreSQL

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Per-user bot tokens (not shared bot) | Each user's Telegram/Discord bot is their own — no message routing complexity | Pending |
| user_preferences for all per-user settings | Single table, key-value, already exists and works for wallpaper/accent | Pending |
| Onboarding research complete | 4 questions: role, use cases, style, tech stack — stored as preferences | Pending |
| Global keys remain for admin backward compat | Admin user falls back to global Redis keys if no per-user key exists | Pending |

---
*Last updated: 2026-03-13 — v7.1 milestone (Per-User Isolation Completion)*
