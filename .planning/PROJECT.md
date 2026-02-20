# LivOS - Self-Hosted AI-Powered Home Server OS

## What This Is

LivOS is a self-hosted home server operating system with an integrated autonomous AI agent (Nexus). Users interact via Telegram, Discord, and a web UI. The AI agent runs through Claude Code SDK (subscription mode), with MCP tools for shell, Docker, files, browser control, and more. The goal is an OpenClaw-class personal AI platform that anyone can install with a single command.

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

### Active (v2.0 — OpenClaw-Class AI Platform)

**Goal:** Transform LivOS into an OpenClaw-class personal AI platform with voice interaction, visual canvas, multi-agent coordination, webhook automation, Gmail integration, chat commands, DM security, onboarding CLI, session compaction, usage tracking, and stability fixes. Telegram + Discord only. Claude Code Auth exclusively.

**Target features:**
- [ ] Voice Wake/Talk Mode (Cartesia TTS, Deepgram STT) with UI API key setup
- [ ] Live Canvas (A2UI-inspired web-based visual AI workspace)
- [ ] WebSocket Gateway improvements (real-time streaming, replace polling)
- [ ] Multi-Agent Sessions (coordination, session tools)
- [ ] LivHub Skills Registry (ClawHub-inspired, marketplace with gating)
- [ ] Webhook Triggers (external events trigger agent tasks)
- [ ] Gmail Integration (Pub/Sub listener, email as channel)
- [ ] Chat Commands (/status, /think, /usage, /new, /reset, /compact, /activation)
- [ ] DM Pairing Security (activation code for new users)
- [ ] Onboarding CLI (livinity onboard --install-daemon guided setup)
- [ ] Session Compaction (summarize long conversations to save tokens)
- [ ] Usage Tracking (per-user token/cost tracking)
- [ ] Fix existing broken features (process stability, memory service, built-in tool leak)

### Out of Scope

- WhatsApp — disabled for v2.0, only Telegram + Discord
- Slack/Matrix — already built in v1.5, maintenance only
- Mobile app — web-first approach, mobile later
- Multi-tenancy — single-user home server focus
- Cloud hosting option — self-hosted only
- Native desktop/mobile apps — web-based only for now
- Payment/billing system — free open source project
- Self-hosted LLM support — Claude Code Auth only
- Gemini/OpenAI as primary — Claude Code Auth exclusively

## Context

**Current State (post v1.5):**
- Running in production on Contabo VPS (45.137.194.103)
- AI runs via Claude Code SDK (SdkAgentRunner, subscription mode, dontAsk)
- Nexus tools exposed via MCP (nexus-tools server)
- Chrome DevTools MCP for browser control
- 5 channel providers (WhatsApp, Telegram, Discord, Slack, Matrix)
- Skill marketplace with Git-based registries
- WebSocket JSON-RPC 2.0 gateway
- Human-in-the-loop approval system
- Parallel agent execution via BullMQ

**Known Issues:**
- nexus-core: 153 PM2 restarts in 47 hours (stability problem)
- Memory service returns empty results frequently
- SdkAgentRunner tools:[] doesn't disable built-in Bash/Read/Write
- Agent runs 6-13 turns for simple greetings (should be 1-2)
- grammy loses polling offsets on restart (mitigated with dedup)

**Technical Environment:**
- Node.js 22+, TypeScript 5.7+
- React 18 + Vite for frontend
- Express + tRPC for backend
- Redis for state, queues, pub/sub
- PostgreSQL for persistent data
- Docker for containerized apps
- Caddy for reverse proxy
- Claude Code SDK (@anthropic-ai/claude-agent-sdk)

**Target Users:**
- Self-hosters who want a personal server with AI
- Developers who want to extend with custom tools/skills
- Privacy-conscious users avoiding cloud services

## Constraints

- **Auth**: Claude Code Auth ONLY — no API keys, no Gemini, no OpenAI
- **Channels**: Telegram + Discord only for v2.0
- **Tech Stack**: Keep existing Node.js/TypeScript stack
- **Compatibility**: Must work on standard Linux VPS (Ubuntu 22.04+)
- **Resources**: Single VPS deployment (2-4 CPU, 4-8GB RAM typical)
- **Zero Breaking Changes**: Existing installations should upgrade smoothly

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep Nexus as single AI daemon | Most complete implementation, already multi-channel | ✓ Good |
| Event-driven over polling | Reduces latency from 30s to instant | ✓ Good |
| Single install script | Lowers barrier to entry for non-technical users | ✓ Good |
| Claude Code SDK subscription mode | No API keys needed, uses user's Claude subscription | ✓ Good |
| SdkAgentRunner with dontAsk | Auto-approve all MCP tools, Claude handles permissions | ✓ Good |
| Telegram + Discord only (v2.0) | Focus on two working channels, WhatsApp deferred | — Pending |
| Cartesia for TTS | High quality, low latency voice synthesis | — Pending |
| Deepgram for STT | Real-time speech recognition, WebSocket API | — Pending |
| Web-based Live Canvas | No native app needed, A2UI-inspired visual workspace | — Pending |
| LivHub (not ClawHub) | Own branding for skill registry | — Pending |

---
*Last updated: 2026-02-20 — v2.0 milestone (OpenClaw-Class AI Platform)*
