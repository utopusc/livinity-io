# LivOS - Self-Hosted AI-Powered Home Server OS

## What This Is

LivOS is a self-hosted home server operating system with an integrated autonomous AI agent (Nexus). Users interact via Telegram, Discord, and a web UI. The AI agent runs through Claude Code SDK (subscription mode), with MCP tools for shell, Docker, files, browser control, and more. The goal is an OpenClaw-class personal AI platform that anyone can install with a single command.

## Core Value

**One-command deployment of a personal AI-powered server that just works.** Users should be able to run a single install script and have a fully functional home server with AI assistant ready to use.

## Current Milestone: v5.3 — UI Polish & Consistency

**Goal:** Apply motion-primitives and light theme polish across remaining modules. Polish Files (path bar, empty states, loading animations). Extend design language to Dashboard/Home. Ensure visual consistency across all windows. Performance audit for motion-heavy components.

**Target features:**
- Files polish: path bar breadcrumbs, empty states with illustrations, loading skeletons, file operation animations
- Dashboard/Home: motion-primitives integration (Tilt, Spotlight, AnimatedGroup, AnimatedNumber)
- Visual consistency: cross-module audit for colors, typography, spacing, border radius, window chrome
- Performance: audit motion-heavy components, reduce re-renders, lazy-load where needed

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

### Active (v5.3 — UI Polish & Consistency)

- [ ] Files polish: path bar breadcrumbs with transitions
- [ ] Files polish: empty states with illustrations/animations
- [ ] Files polish: loading skeletons with staggered reveal
- [ ] Files polish: file operation animations (copy, move, delete)
- [ ] Dashboard/Home: motion-primitives integration
- [ ] Dashboard/Home: widget cards with Tilt/Spotlight effects
- [ ] Dashboard/Home: stats with AnimatedNumber
- [ ] Visual consistency: window chrome audit across all apps
- [ ] Visual consistency: shared component styling (buttons, inputs, dropdowns)
- [ ] Visual consistency: color palette, typography, spacing audit
- [ ] Performance: motion component audit (Tilt, Spotlight, animations)
- [ ] Performance: reduce re-renders in animated components

### Out of Scope

- WhatsApp — disabled for v2.0, only Telegram + Discord
- Slack/Matrix — already built in v1.5, maintenance only
- Mobile app — web-first approach, mobile later
- Multi-tenancy — single-user home server focus
- Cloud hosting option — self-hosted only
- Native desktop/mobile apps — web-based only for now
- Payment/billing system — free open source project
- Self-hosted LLM support — Claude Code Auth only
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
*Last updated: 2026-03-07 — v5.3 milestone (UI Polish & Consistency)*
