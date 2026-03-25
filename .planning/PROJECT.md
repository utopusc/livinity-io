# Livinity — Self-Hosted AI Server Platform

## What This Is

Livinity is a self-hosted AI-powered home server OS (LivOS) with a central platform (livinity.io) that provides tunnel routing, user registration, and API key management. Users install LivOS on their own hardware, enter an API key from livinity.io, and their server becomes accessible globally via `{username}.livinity.io`. Apps are accessible via `{app}.{username}.livinity.app`. The platform handles DNS, tunnel relay, and user management — the user just runs one command.

## Core Value

**One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.** No port forwarding, no DNS setup, no tunnel configuration — enter your API key and you're live.

## Requirements

### Validated

*All features from v1.0 through v13.0 — see MILESTONES.md*

Key validated capabilities:
- ✓ Web UI with desktop-like windowed interface
- ✓ Docker application management (Portainer-level: create, edit, exec, stacks, events)
- ✓ File manager, AI chat, tool system, skill system
- ✓ Multi-user: PostgreSQL, JWT, login screen, invite system
- ✓ Per-user isolation: files, AI, apps, settings, Docker containers
- ✓ Per-user subdomain routing, app gateway middleware
- ✓ Caddy reverse proxy, Cloudflare Tunnel support
- ✓ Onboarding wizard with personalization
- ✓ Remote PC Control Agent — v14.0
  - ✓ Cross-platform agent binary (Windows/Mac/Linux) with Node.js SEA
  - ✓ livinity.io OAuth Device Authorization Grant (RFC 8628)
  - ✓ Secure WSS tunnel through relay with JWT auth
  - ✓ AI tools: shell, files (list/read/write/delete/rename), processes, system info, screenshot
  - ✓ "My Devices" UI panel with device cards, rename, remove
  - ✓ Dynamic proxy tool registration in Nexus ToolRegistry
  - ✓ Connection status, heartbeat, exponential backoff auto-reconnect
  - ✓ End-to-end audit logging (agent → relay → LivOS → UI)
  - ✓ Dangerous command blocklist (21 patterns, configurable)
- ✓ Agent Installer & Setup UX — v14.1
  - ✓ Web-based OAuth setup wizard (React SPA on local HTTP server)
  - ✓ Cross-platform system tray icon with connection status
  - ✓ Native installers: Windows .exe (Inno Setup), macOS .dmg, Linux .deb
  - ✓ Auto-start on boot (registry, LaunchAgent, systemd)
  - ✓ livinity.io/download with platform detection
- ✓ AI Computer Use — v15.0
  - ✓ 8 desktop automation tools (6 mouse + 2 keyboard) via @jitsi/robotjs
  - ✓ Screen info tool (resolution, displays, active window) + screenshot coordinate metadata
  - ✓ Multimodal vision: Kimi receives screenshot images, analyzes UI, determines coordinates
  - ✓ Autonomous screenshot→analyze→act→verify loop with 50-action step limit
  - ✓ Live monitoring: real-time screenshot feed, click/type overlays, action timeline
  - ✓ Session controls: pause/resume/stop with AbortController SSE abort
  - ✓ User consent dialog before AI takes device control
  - ✓ Emergency stop: 3x Escape hotkey → full protocol chain → session abort
  - ✓ Enriched audit logging with coordinates/text for all computer use actions
  - ✓ 60-second inactivity auto-timeout

## Current Milestone: v16.0 Multi-Provider AI

**Goal:** Add Claude (Anthropic) as a second AI provider alongside Kimi, with a settings toggle to switch between them.

**Target features:**
- Restore ClaudeProvider from git history (467 lines, fully functional)
- Re-add `@anthropic-ai/sdk` package dependency
- Register Claude in ProviderManager alongside Kimi (fallback support)
- Claude auth endpoints (API key + optional OAuth PKCE)
- Provider selection config (`primary: 'claude' | 'kimi'`)
- Provider toggle in Settings UI
- Both providers support: streaming, tool calling, vision, model tiers

### Active

- [ ] Restore ClaudeProvider and register in ProviderManager
- [ ] Add `@anthropic-ai/sdk` dependency
- [ ] Claude authentication (API key + OAuth PKCE)
- [ ] Provider selection in config schema
- [ ] Provider toggle in Settings UI
- [ ] Streaming, tool calling, vision support for both providers
- [ ] Model tier mapping (haiku/sonnet/opus)

### Out of Scope

- Mobile app — web-first approach, mobile later
- Payment/billing system — deferred (Stripe/Lemonsqueezy TBD)
- Dark theme for livinity.io — light/premium theme only
- Multi-region tunnel relay — single relay (Server5) for now
- White-label/reseller — direct platform only
- Per-user MCP server settings — deferred
- Full desktop streaming (RDP/VNC) — AI uses structured screenshot+action, not video stream
- Per-device permission matrix — future (all-or-nothing for now)
- Clipboard sync as AI tool — future
- Multi-device orchestration — future
- Per-app computer use permissions — v15.1 (all-or-nothing for now)
- Browser-only computer use mode — full desktop for now
- Multi-provider simultaneous use — one provider at a time
- OpenAI/GPT support — only Claude + Kimi for now
- Per-conversation provider switching — global setting only
- Provider-specific tool formats in UI — abstracted away

## Context

**Current State (post v14.1):**
- LivOS running on production (Server4: 45.137.194.103, livinity.cloud)
- Mini PC test server (bruce-EQ: 10.69.31.68, livinity.live via CF Tunnel)
- Multi-user fully working: PostgreSQL, JWT, per-user Docker, app gateway
- Portainer-level Docker management: container CRUD, exec, stacks, events, engine info
- Remote PC Control Agent: cross-platform agent binary, OAuth device flow, 9 AI tools, My Devices UI
- Agent architecture: agent → relay /device/connect → DeviceBridge → Nexus proxy tools
- Agent Installers: native .exe/.dmg/.deb, web setup wizard, system tray, auto-start, download page
- Existing agent tools: shell, files (list/read/write/delete/rename), processes, screenshot, system info

**Infrastructure:**
- Server4 (45.137.194.103) = LivOS production (livinity.cloud)
- Server5 (45.137.194.102) = Tunnel relay + livinity.io platform
- Mini PC (10.69.31.68) = Test server (livinity.live)

**Technical Environment:**
- LivOS: Node.js 22+, TypeScript, React 18 + Vite, Express + tRPC, Redis, PostgreSQL, Docker, Caddy
- Platform (new): Next.js 15, TypeScript, Tailwind CSS, PostgreSQL, Prisma/Drizzle

## Constraints

- **Server5 resources**: 8GB RAM — must handle tunnel relay + platform API efficiently
- **DNS**: Wildcard DNS for *.livinity.io and *.livinity.app required (Cloudflare DNS)
- **Tunnel protocol**: Must support WebSocket upgrades for tRPC subscriptions and voice
- **Latency**: Tunnel relay adds hop — must keep latency under 100ms for acceptable UX
- **Scale**: Initial target 50-100 concurrent tunnel connections

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Custom tunnel relay (not CF Tunnel) | Full control over routing, subdomain management, bandwidth tracking | ✓ Good |
| Next.js for livinity.io | SSR for landing SEO, API routes for dashboard, React ecosystem | ✓ Good |
| Server5 for relay | Available VPS, isolated from production LivOS | ✓ Good |
| Free: 1 subdomain + 50GB/mo | Low barrier to entry, premium for power users | — Pending |
| Payment deferred | Focus on core platform first, monetize after user base | — Pending |
| Apple-style premium design | Differentiates from typical dev-tool aesthetic | ✓ Good |
| TLS+Token for agent (not E2EE) | Simpler, relay is self-hosted/trusted, E2EE can layer on later | ✓ Good |
| Node.js SEA for agent binary | Same language as LivOS/Nexus, shared protocol types, fast iteration | ✓ Good |
| OAuth Device Grant (RFC 8628) | Standard for headless device auth, good UX for non-technical users | ✓ Good |
| Proxy tools in ToolRegistry (not MCP) | Simpler than MCP per device, uses existing ToolRegistry | ✓ Good |
| Redis for ephemeral device state | Fits transient connection data, PostgreSQL only for persistent metadata | ✓ Good |
| nut.js for computer use automation | TypeScript native, cross-platform mouse+keyboard, active maintenance | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 after v16.0 milestone start (Multi-Provider AI)*
