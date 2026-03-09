# LivOS - Self-Hosted AI-Powered Home Server OS

## What This Is

LivOS is a self-hosted home server operating system with an integrated autonomous AI agent (Nexus). Users interact via Telegram, Discord, and a web UI. The AI agent runs through Kimi Code (replacing Claude Code), with MCP tools for shell, Docker, files, browser control, and more. The goal is an OpenClaw-class personal AI platform that anyone can install with a single command.

## Core Value

**One-command deployment of a personal AI-powered server that just works.** Users should be able to run a single install script and have a fully functional home server with AI assistant ready to use.

## Current Milestone: v6.0 — Claude Code → Kimi Code Migration

**Goal:** Complete migration from Claude Code to Kimi Code as the AI backbone. Remove all Anthropic/Claude dependencies, replace with Kimi Code CLI + auth system, adapt MCP tools, update UI, remove Gemini fallback.

**Target features:**
- Replace Claude Code CLI with Kimi Code CLI installation and auth flow
- Implement KimiProvider (replaces ClaudeProvider) with Kimi's OAuth-style auth
- Replace SdkAgentRunner with Kimi Code equivalent agent runner
- Write MCP adapter layer for Kimi Code's tool calling format
- Remove Gemini fallback — Kimi as sole AI provider
- Update Settings UI: Kimi auth flow (URL → code → paste), remove Claude/Gemini sections
- Update onboarding wizard for Kimi Code setup
- Remove @anthropic-ai/sdk and @anthropic-ai/claude-agent-sdk dependencies
- Clean all Redis keys, env vars, config schema for Kimi

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

### Active (v6.0 — Claude Code → Kimi Code Migration)

- [ ] Install Kimi Code CLI on server, verify it works
- [ ] Implement KimiProvider with Kimi's OAuth auth flow (URL → code → paste)
- [ ] Replace SdkAgentRunner with Kimi Code agent runner
- [ ] Write MCP adapter for Kimi Code's tool calling format
- [ ] Remove ClaudeProvider, Gemini fallback, all Anthropic SDK imports
- [ ] Update config schema (models, auth methods, Redis keys)
- [ ] Update Settings UI for Kimi auth and config
- [ ] Update onboarding wizard for Kimi Code setup
- [ ] Remove @anthropic-ai/sdk and @anthropic-ai/claude-agent-sdk packages
- [ ] End-to-end test: UI chat → Kimi Code → tool execution → response

### Out of Scope

- WhatsApp — disabled for v2.0, only Telegram + Discord
- Slack/Matrix — already built in v1.5, maintenance only
- Mobile app — web-first approach, mobile later
- Multi-tenancy — single-user home server focus
- Cloud hosting option — self-hosted only
- Native desktop/mobile apps — web-based only for now
- Payment/billing system — free open source project
- Self-hosted LLM support — Kimi Code only for now
- New backend features — UI only for v5.0
- Dark theme — fully light theme only

## Context

**Current State (post v4.0 revert):**
- Running production on Contabo VPS (45.137.194.103)
- UI: Vite + React 18 + Tailwind 3.4 + shadcn/ui
- v4.0 ui-next (Next.js 16) was built but reverted back to Vite/React
- Current UI has dark theme with semantic tokens in tailwind.config.ts
- Glassmorphic onboarding wizard exists but has hardcoded English and dark-only colors
- motion-primitives already partially installed (5 components in src/components/motion-primitives/)
- Tailwind config has semantic tokens (text-primary, text-secondary, surface-base, etc.) but all hardcoded to dark values

**Technical Environment:**
- Node.js 22+, TypeScript 5.7+
- React 18 + Vite for frontend
- Tailwind CSS 3.4 with semantic design tokens
- shadcn/ui components
- Framer Motion for animations
- motion-primitives (partially installed)
- Express + tRPC for backend

## Constraints

- **UI Framework**: Vite + React 18 (NOT Next.js)
- **Theme**: Light theme ONLY (no dark mode toggle)
- **Component Library**: motion-primitives.com/docs as primary source
- **Design System**: Update existing tailwind semantic tokens for light values
- **i18n**: All user-facing strings must use t() function
- **Compatibility**: Must work with existing tRPC backend (no backend changes)
- **Piece-by-piece**: Each screen is a separate phase, approved individually

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep Vite/React over Next.js | v4.0 Next.js rewrite was reverted; Vite/React is proven stable | ✓ Good |
| Light theme only | User preference, cleaner professional look | — Pending |
| motion-primitives | Professional animations, referenced by user | — Pending |
| Piece-by-piece phases | User wants to approve each screen individually | — Pending |
| Full i18n | Current wizard has hardcoded strings, must fix | — Pending |

---
*Last updated: 2026-03-09 — v6.0 milestone (Claude Code → Kimi Code Migration)*
