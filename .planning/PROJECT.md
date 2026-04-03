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
- ✓ Multi-Provider AI — v16.0
  - ✓ ClaudeProvider restored (467 lines) with @anthropic-ai/sdk
  - ✓ Dual provider: Claude + Kimi in ProviderManager with config-driven fallback
  - ✓ Native tool calling, streaming, vision/multimodal for both providers
  - ✓ Model tier mapping: haiku/sonnet/opus (Claude) + kimi-for-coding (Kimi)
  - ✓ Claude auth: API key input + OAuth PKCE, Redis-backed storage
  - ✓ Provider toggle in Settings UI with per-provider auth cards
  - ✓ Active provider badge in AI chat interface
  - ✓ Config-driven primary_provider with automatic fallback on failure
- ✓ Precision Computer Use — v17.0
  - ✓ DPI-aware screenshot pipeline: sharp resize from physical to logical pixels
  - ✓ Fixed coordinate mapping chain: AI target → logical → robotjs (no DPI mismatch)
  - ✓ Windows UI Automation accessibility tree via persistent PowerShell subprocess
  - ✓ `screen_elements` tool: 11 interactive types, pipe-delimited, 100 element cap
  - ✓ DPI awareness (PerMonitorAwareV2) at agent startup on Windows
  - ✓ Accessibility-first AI prompt: Elements-First Workflow with screenshot fallback
  - ✓ SHA-256 hash-based screenshot caching (skip re-capture when tree unchanged)
- ✓ Remote Desktop Streaming — v18.0
  - ✓ install.sh GUI detection (X11/Wayland/headless) with x11vnc systemd service
  - ✓ NativeApp lifecycle for x11vnc with auto-start, idle timeout, port health-check
  - ✓ Caddy `pc.{domain}` subdomain with JWT cookie gating and stream_close_delay
  - ✓ /ws/desktop WebSocket-to-TCP bridge with JWT auth + Origin validation
  - ✓ Standalone noVNC browser viewer with full mouse/keyboard input
  - ✓ Connection status, auto-reconnect (exponential backoff 1s-30s)
  - ✓ Fullscreen mode with dynamic xrandr resolution resize
  - ✓ Accessible via tunnel relay at `pc.{username}.livinity.io`

### Validated (v19.0)

- ✓ Custom domain CRUD on livinity.io dashboard — v19.0
- ✓ DNS verification (A record + TXT record with Cloudflare DoH cross-validation) — v19.0
- ✓ Domain sync via tunnel relay to LivOS (Redis + PostgreSQL) — v19.0
- ✓ Domains tab in Servers app with colored status badges — v19.0
- ✓ Domain-to-app mapping via Docker container selection — v19.0
- ✓ Auto Caddy on-demand TLS with Let's Encrypt for custom domains — v19.0
- ✓ Domain status lifecycle (pending → verified → active → dns_changed) — v19.0
- ✓ Settings "My Domains" section replacing old Domain & HTTPS wizard — v19.0

### Validated (v20.0)

- ✓ Claude Agent SDK as default agent runner (SdkAgentRunner, 60s watchdog, per-tier budget caps) — v20.0
- ✓ MCP tool bridge hardened (image support, 50k truncation, per-tool logging) — v20.0
- ✓ Real-time WebSocket streaming (/ws/agent, AgentSessionManager, auto-reconnect) — v20.0
- ✓ Professional chat UI (streamdown + Shiki, streaming markdown, auto-scroll) — v20.0
- ✓ Live tool call visualization (animated expandable cards, tool-specific renderers) — v20.0
- ✓ Mid-conversation interaction (follow-ups + interrupt while agent works) — v20.0
- ✓ Conversation persistence (Redis storage, sidebar history, page refresh restore) — v20.0
- ✓ Cost tracking ($X.XXXX badge from SDK result, budget enforcement) — v20.0
- ✓ Nexus AI Settings panel removed — v20.0

### Validated (v21.0)

- ✓ AI Chat real-time agent status overlay (thinking/executing/responding phases, step list, tool badges) — v21.0
- ✓ Conversation persistence across tab close/reopen via localStorage + Redis auto-load — v21.0
- ✓ Sidebar Agents tab (renamed from LivHub) with agent listing, detail views, messaging, loop controls, creation form — v21.0
- ✓ Slash command `/` dropdown menu with 6 built-in + dynamic commands from backend, keyboard navigation, real-time filtering — v21.0
- ✓ Conditional tool registration (WhatsApp, channel, Gmail gated behind connection state checks) — v21.0
- ✓ Autonomous skill creation + MCP tool installation via enhanced system prompt — v21.0
- ✓ Configurable model tier selection via nexus/config/tiers.json with runtime selectTier() — v21.0
- ✓ Autonomous schedule/loop management via system prompt guidance — v21.0
- ✓ Self-evaluation after-task reflection + pre-seeded Self-Improvement Agent (6-hour loop, flash tier) — v21.0
- ✓ System prompt optimized: 72% token reduction (3214→899 tokens), self-awareness section added — v21.0

### Validated (v22.0)

- ✓ Unified Capability Registry: 5-type manifest model (tools, skills, MCPs, hooks, agents), Redis persistence, auto-sync from 4 data sources, REST + tRPC search API — v22.0
- ✓ Unified Capabilities Panel: 6-tab sidebar (Skills, MCPs, Hooks, Agents, Prompts, Analytics) replacing 3 separate panels — v22.0
- ✓ Intent Router v2: TF-IDF keyword/trigger scoring, 30% context budget cap, 15 capability max, Redis caching, LLM fallback — v22.0
- ✓ Auto-Provisioning Engine: dependency resolution, dynamic per-session system prompts, discover_capability tool for mid-conversation search — v22.0
- ✓ Livinity Marketplace MCP: 5 livinity_* tools (search/install/uninstall/recommend/list), GitHub-backed registry — v22.0
- ✓ AI Self-Modification: create_hook + create_agent_template tools, enhanced skill_generate with auto-registry, hook event dispatcher — v22.0
- ✓ Auto-Install UI: marketplace recommendation cards in chat with Install/Dismiss, prompt template CRUD, analytics view — v22.0
- ✓ Learning Loop: Redis stream tool call logging, co-occurrence mining, proactive suggestions, user feedback with success_rate aggregation — v22.0

## Current State (post v22.0 — AGI Platform)

Livinity now features a unified capability orchestration platform. All capability types (tools, skills, MCPs, hooks, agents) are discoverable through a single registry with semantic search. Intent-based routing dynamically selects capabilities per conversation with context budget management. The AI can autonomously create skills, hooks, and agent templates, with a learning loop that logs tool usage, mines patterns, and incorporates user feedback. Marketplace tools enable one-command capability installation from GitHub-backed registries.

### Validated (v23.0)

- ✓ PWA installability: vite-plugin-pwa, manifest, service worker, Apple meta tags — v23.0
- ✓ Mobile: dock hidden, system apps in app grid, bottom tab bar — v23.0
- ✓ Mobile: full-screen app rendering via MobileAppRenderer + MobileAppContext — v23.0
- ✓ Mobile: safe area CSS (tailwindcss-safe-area, viewport-fit=cover) — v23.0
- ✓ Mobile: install prompt banner, WS reconnect on resume, keyboard-safe input — v23.0

## Current Milestone: v25.0 Memory & WhatsApp Integration

**Goal:** Enable persistent cross-session AI memory across all channels, add WhatsApp as a messaging channel with QR code authentication, unify conversation storage across all platforms, and provide a memory management UI.

**Target features:**
- Cross-session memory: AI can recall and search all previous conversations
- WhatsApp channel: QR code auth, headless/browser mode, AI trigger from WhatsApp
- Unified conversation store: Telegram + Web UI + WhatsApp + Discord in single store
- Memory management UI: Settings page to view, search, delete memories
- Channel-unified userId: Same user recognized across channels

### Active

- [ ] WhatsApp integration with QR code authentication (whatsapp-web.js or Baileys)
- [ ] WhatsApp message routing to Nexus agent handler with userId mapping
- [ ] Cross-session conversation search (AI can query "what did we discuss last week?")
- [ ] Unified userId mapping across channels (Telegram, WhatsApp, Web UI, Discord)
- [ ] Memory management UI in Settings (view, search, delete stored memories)
- [ ] Conversation history tool for AI to search past conversations semantically
- [ ] WhatsApp Settings panel in Integrations (QR code display, connection status)

### Out of Scope

- Native mobile app (Swift/Kotlin) — PWA approach instead
- Payment/billing system — deferred (Stripe/Lemonsqueezy TBD)
- Dark theme for livinity.io — light/premium theme only
- Multi-region tunnel relay — single relay (Server5) for now
- White-label/reseller — direct platform only
- Per-user MCP server settings — deferred
- Audio streaming via desktop stream — deferred to future version
- Multi-monitor desktop streaming — single display for now
- File transfer via desktop stream — deferred to future version
- Clipboard sync via desktop stream — deferred to future version
- Per-user desktop session isolation — single shared display for now
- Per-device permission matrix — future (all-or-nothing for now)
- Clipboard sync as AI tool — future
- Multi-device orchestration — future
- Per-app computer use permissions — future (all-or-nothing for now)
- Browser-only computer use mode — full desktop for now
- macOS AXUIElement accessibility — requires Swift CLI binary build pipeline
- Linux AT-SPI2 accessibility — availability varies by distro
- Multi-monitor accessibility tree — single primary for now
- Element highlighting on screenshots — future enhancement
- Multi-provider simultaneous use — one provider at a time
- OpenAI/GPT support — only Claude + Kimi for now
- Per-conversation provider switching — global setting only
- Provider-specific tool formats in UI — abstracted away

## Context

**Current State (post v20.0 — Live Agent UI shipped):**
- LivOS running on production (Server4: 45.137.194.103, livinity.cloud)
- Mini PC test server (bruce-EQ: 10.69.31.68, livinity.live via CF Tunnel)
- Multi-user fully working: PostgreSQL, JWT, per-user Docker, app gateway
- Portainer-level Docker management: container CRUD, exec, stacks, events, engine info
- Remote PC Control Agent: cross-platform agent binary, OAuth device flow, 9 AI tools, My Devices UI
- AI Computer Use: autonomous screenshot→analyze→act loop, live monitoring, emergency stop
- Multi-Provider AI: Claude + Kimi dual provider with Settings toggle, config-driven fallback
- Precision Computer Use: DPI-aware screenshots, Windows UIA accessibility tree, accessibility-first AI prompt
- Remote Desktop Streaming: x11vnc + noVNC web viewer at `pc.{username}.livinity.io`, install.sh auto-setup with GUI detection, JWT-protected WebSocket bridge, fullscreen + auto-reconnect + xrandr resize
- **Custom Domain Management: Platform domain CRUD + DNS verification, relay Caddy auto-SSL routing, tunnel domain sync, LivOS domains UI, Settings "My Domains" section with tunnel-synced domains and Configure dialog**
- **v20.0 Phase 11 (Agent SDK Backend Integration):** SdkAgentRunner is now the default agent runner for /api/agent/stream. 60s watchdog, per-tier budget caps ($2-$10), restricted subprocess env. ProviderManager preserved alongside as fallback.

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
| sharp for screenshot resize | De facto Node.js image processing, Anthropic uses same approach | ✓ Good |
| PowerShell UIA persistent subprocess | .NET built-in on Windows, zero external deps, stdin/stdout IPC | ✓ Good |
| Pipe-delimited element format | Compact tokens, proven by Windows-Use, AI-parseable | ✓ Good |
| Accessibility-first prompt (not screenshot-first) | Element coords more reliable than pixel-guessing | ✓ Good |
| Restore ClaudeProvider from git (not rewrite) | 467 lines already working, agent loop uses Anthropic format natively | ✓ Good |
| Config-driven provider fallback | Redis primary_provider + ProviderManager.init() on startup | ✓ Good |
| API key + OAuth PKCE dual auth for Claude | Flexibility: API key for quick setup, OAuth for subscription users | ✓ Good |
| x11vnc + noVNC (not Guacamole/KasmVNC) | Lightweight, streams actual host display, no Java/separate auth | ✓ Good |
| WS-to-TCP bridge in livinityd (not websockify) | Reuses existing WS auth patterns, no separate process | ✓ Good |
| NativeApp for x11vnc (not Docker) | Must capture host X11 display, Docker can't access it | ✓ Good |
| Standalone HTML viewer (not React embed) | Self-contained page for `pc.{domain}`, no build step | ✓ Good |
| Vendored noVNC ESM (not npm CJS) | npm package ships CJS only, browser needs ESM imports | ✓ Good |
| Drizzle ORM for platform domain schema | Type-safe, lightweight, works with Next.js server components | ✓ Good |
| Dual DNS resolver (system + Cloudflare DoH) | Cross-validation prevents false positives from cached DNS | ✓ Good |
| Redis cache for relay ask endpoint | Sub-5ms domain authorization, Caddy 500ms timeout safe | ✓ Good |
| Catch-all HTTPS block (not per-domain) | Auto-scales with on_demand_tls, no Caddyfile changes per domain | ✓ Good |
| domain_sync tunnel messages (not API polling) | Real-time sync, works offline with reconnect batch sync | ✓ Good |
| Reuse domain.platform.* routes (not new aliases) | Avoids dead code, existing routes already complete | ✓ Good |

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
*Last updated: 2026-04-02 after v25.0 milestone started (Memory & WhatsApp Integration)*
