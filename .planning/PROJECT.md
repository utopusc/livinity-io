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

## Current State: v27.0 Shipped (Docker Management Upgrade)

**Shipped 2026-04-25.** Livinity's Docker management is now best-in-class self-hosted: Dockhand-parity feature set (file browser, GitOps stacks, vulnerability scanning, compose graph, multi-host) plus AI-powered diagnostics — the unique moat no competing Docker manager replicates. 33/33 requirements satisfied across 7 phases.

**11 deployment-time UAT items deferred** (live-LLM round-trips + remote-host infrastructure tests) — code paths fully wired, see `.planning/STATE.md` Deferred Items section.

## Current State: v28.0 Shipped (Docker Management UI)

**Shipped 2026-04-26.** Server Management is now a standalone Dockhand-style Docker app — `LIVINITY_docker` window app with persistent left sidebar (12 entries), top StatusBar with env + 8 stat pills, multi-environment Dashboard, dedicated sections per resource type, plus 4 NEW surfaces (cross-container Logs, Activity Timeline, multi-tab Shell, Registry). 20/20 DOC requirements satisfied across 6 phases. Backend foundation reused from v27.0 — v28.0 was UI restructure with minimal additive backend (envId WS extensions + registry_credentials table + 4 thin tRPC routes).

**45 deployment-time UAT items** + 10 info-severity tech-debt items deferred (window-app pattern incompatibility prevents real URL-bar deep-linking — v29.0+).

## Current Milestone: v30.0 Backup & Restore

**Goal:** Korumalı, otomatize ve test-edilebilir backup/restore — kullanıcı LivOS'tan gönül rahatlığıyla self-host edebilsin, data kaybı korkusu olmasın.

**Target features:**
- Snapshot scope: PostgreSQL (livos DB), Redis (settings/conversations), app data volumes (/opt/livos/data), per-app Docker volumes, .env secrets
- Scheduled backups (cron-like — daily/weekly/custom)
- Multiple destinations: local disk, S3-compatible (S3/B2/Wasabi/MinIO/SFTP)
- Encryption at rest (passphrase-derived key, age or libsodium)
- Retention policies (keep N most recent + age-based pruning)
- Manual "Backup Now" trigger from UI
- Restore flow: full disaster recovery (restore-to-fresh-install) + partial restore (single app data, single user)
- Backup history UI with status, size, duration, restore button
- Restore drill (test-restore that doesn't overwrite production)

**Key context:**
- v29.0 update flow newly stabilized (cgroup-escape, SIGPIPE survival, self-rsync) — backup builds on its job-orchestration patterns (`scheduled_jobs` PG table, node-cron handlers)
- Mini PC has system PostgreSQL (NOT Dockerized) — `pg_dump` direct, not via container exec
- Per-user Docker isolation (v7.0) means per-app volumes too — backup must enumerate per-user containers
- Multi-user system: backups should respect user boundaries (admin can backup all, user can backup own data; admin cross-user backup is sensitive — needs explicit consent)
- Phase 20 (v27.0) already has volume-backup + S3/SFTP/local destinations + AES-256-GCM credential vault → reuse, don't reinvent
- Strategic positioning: "AI + Self-Hosting" category gap — robust backup is the trust foundation that lets AI features ship without data-loss anxiety

### Active (v30.0)

- [ ] BAK-* requirements (defined in REQUIREMENTS.md after this milestone is bootstrapped)

### Validated (v29.0 — Deploy & Update Stability)

- ✓ Phase 31 BUILD-01/02/03 — `update.sh` build-pipeline integrity: verify_build helper + 10 wired call sites, multi-dir @nexus+core dist-copy loop, worker/mcp-server masking strip + memory-build injection
- ✓ Phase 32 ROLL-01/02 — systemd OnFailure auto-rollback: livos-rollback.sh + livos-precheck.sh + JSON history records, 61.1s synthetic-trigger rollback validated end-to-end
- ✓ Phase 33 OBS-01 — Update observability surface: tee + EXIT-trap canonical `update-<ts>-<sha>.log` + `<ts>-success|failed.json`, Settings > Software Update past-deploys UI
- ✓ Phase 34 UX — Update UX hardening (Install Update mutation onError toast, pending guards, sidebar badge)
- ✓ Phase 35 — GitHub Actions update.sh smoke test (PR-time regression catch via Docker container)
- ✓ v29.1 hot-patches (post-milestone) — cgroup-escape via `systemd-run --scope`, SIGPIPE survival via `trap '' PIPE` + `tee --output-error=warn-nopipe`, completion sentinel for honest success reporting, update.sh self-rsync (atomic mv pattern)

### Validated (v28.0 — Docker Management UI Dockhand-Style)

- ✓ DOC-01/02/03 — Standalone LIVINITY_docker app shell, 12-entry collapsible sidebar, 48px top StatusBar with EnvironmentSelector + 8 stat pills + Search button + AlertsBell + theme toggle. LIVINITY_server-control deprecated everywhere (Phase 24)
- ✓ DOC-04/05/06 — Multi-env Dashboard with EnvCardGrid + TopCpuPanel (top-10 cross-env, Logs/Shell/Restart quick chips) + TagFilterChips (localStorage-persisted single-select). environments.tags TEXT[] column (Phase 25)
- ✓ DOC-07/08/09/10 — Containers / Images / Volumes / Networks each own section with search + detail panel + programmatic deep-link via useDockerResource zustand store. Phase 19 vuln-scan + Phase 22 env-aware tRPC + Phase 23 AI Diagnose / Explain CVEs preserved end-to-end (Phase 26)
- ✓ DOC-11/12 — Stacks section (YAML/Git/AI deploy tabs preserved) + Schedules section with AddBackupDialog volume pre-fill (consume-and-clear). 4815-line legacy server-control deleted (Phase 27)
- ✓ DOC-13 — Cross-container Logs multiplexed WS aggregator (color stripe + name prefix + grep + severity + live-tail + 5000-line ring buffer) (Phase 28)
- ✓ DOC-14 — Activity Timeline unified from 3 sources (dockerEvents + scheduler.lastRun + ai_alerts) with filter chips + click-through routing (Phase 28)
- ✓ DOC-15 — Cross-container Shell with multi-tab xterm sessions (display:none preserves state). docker-exec-socket envId-aware (Phase 29)
- ✓ DOC-16 — Registry section with AES-256-GCM credential vault (lift+shift from Phase 21 git-credentials) + Docker Hub + private registry search + pullImage with optional registryId (Phase 29)
- ✓ DOC-17 — Docker Settings section with Environments + Appearance (theme + sidebar density compact/comfortable) + Palette tabs (Phase 29)
- ✓ DOC-18 — cmd+k command palette with categorized search across 7 categories + recent-searches ring buffer (Phase 29)
- ✓ DOC-19 — Theme toggle persistence verified (light/dark/system per-user, cross-instance sync)
- ✓ DOC-20 — Programmatic deep-link API closure across all 5 resource types + Copy Deep Link buttons on detail panels. URL-bar form deferred to v29.0+ (window-app pattern constraint)

### Validated (v27.0 — Docker Management Upgrade)

- ✓ Real-time container log streaming via WebSocket (xterm + ANSI colors, no polling) (Phase 17)
- ✓ AES-256-GCM-encrypted stack secrets injected via execa env at compose-up (never written to .env disk) (Phase 17)
- ✓ Redeploy-with-pull `controlStack('pull-and-up')` action + extended AI `docker_manage` tool (5 new ops) (Phase 17)
- ✓ Container file browser via dockerode exec + tar streaming — 4 tRPC procs + 2 binary REST endpoints, no host-volume mounts (Phase 18)
- ✓ Compose YAML → React Flow service-dependency graph (js-yaml client-side parsing, topological grid layout) (Phase 19)
- ✓ On-demand Trivy image vuln scanning with SHA256-keyed 7-day Redis cache + severity-badge UI (Phase 19)
- ✓ node-cron-driven scheduler with PG-backed `scheduled_jobs` table, in-flight Set mutex, 3 built-in handlers (Phase 20)
- ✓ Volume backup with S3/SFTP/local destinations, alpine-tar streaming, AES-256-GCM credential vault (Phase 20)
- ✓ GitOps stack deployment: schema for git-backed stacks, AES-256-GCM credentials, simple-git blobless clone, HMAC-SHA256 webhook redeploy (Phase 21)
- ✓ Hourly auto-sync scheduler handler closes the GitOps loop (Phase 21)
- ✓ Multi-host Docker: `environments` PG table (socket / tcp-tls / agent), `getDockerClient(envId)` factory, env-aware tRPC routes (Phase 22)
- ✓ Outbound docker-agent: `@livos/docker-agent` Node binary, `/agent/connect` token-authed WS, Redis pub/sub revocation with 5s SLA (Phase 22)
- ✓ Reactive AI diagnostics: container log/stats analyzer + natural-language compose generator + CVE plain-English explainer via `/api/kimi/chat` one-shot bridge, Redis-cached (Phase 23)
- ✓ Proactive AI resource-pressure alerts: default-disabled `ai-resource-watch` cron handler with threshold priority + 60-min dedupe (Phase 23)
- ✓ Autonomous AI Chat container diagnostics: `docker_diagnostics` MCP tool registered in nexus tool registry, LLM-router-driven invocation (Phase 23)

### Validated (v26.0 — Device Security & User Isolation)

- ✓ Per-user device ownership enforcement — devices.user_id FK to users(id) ON DELETE RESTRICT, backfill migration, Redis cache owner-keyed, tunnel protocol carries userId end-to-end (Phase 11)
- ✓ Single authorizeDeviceAccess middleware used at DeviceBridge, tRPC, and /internal/device-tool-execute HTTP with audit-logged failures (Phase 12)
- ✓ Shell tool boundary hardened: local shell has no device_id param, RESERVED_TOOL_NAMES blocks rogue tool overrides, device proxy shell schema documents ownership constraint (Phase 13)
- ✓ DeviceBridge WS handshake bound to user session JWT (sessionId claim), 60s expiry watchdog closes with code 4401, Redis pub/sub session revocation closes bridges with code 4403 on logout (Phase 14)
- ✓ Immutable device_audit_log PG table with BEFORE UPDATE/DELETE trigger enforcement, SHA-256 params digest, admin-only audit.listDeviceEvents tRPC query (Phase 15)
- ✓ Admin cross-user device listing (tRPC + platform REST) and force-disconnect via new admin_force_disconnect tunnel verb, audit-attributed to admin user_id (Phase 16)
- ✓ AI agent auto-approval behavior preserved (user constraint honored — no approval friction added)

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
*Last updated: 2026-04-26 — v29.0 Deploy & Update Stability milestone started (PROJECT.md only; REQUIREMENTS.md + ROADMAP.md to follow)*
