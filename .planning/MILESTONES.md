# Milestones

## v14.0 Remote PC Control Agent (Shipped: 2026-03-24)

**Phases completed:** 7 phases, 14 plans, 26 tasks

**Key accomplishments:**

- RFC 8628 device auth flow with 3 API routes, device-auth helper library, Drizzle schema, and approval UI page
- DeviceRegistry with nested userId->deviceId mapping, /device/connect WebSocket endpoint with HS256 JWT auth, 30s heartbeat, and reconnection buffering
- Agent CLI with start/stop/status commands, WebSocket ConnectionManager with DeviceAuth, heartbeat pong, exponential backoff reconnection, and 9-tool capability advertisement
- RFC 8628 OAuth device flow in agent setup command with JWT base64url decode, credential storage, and token expiry gates in start and reconnect paths
- 4 new tunnel protocol types and bidirectional message routing between LivOS tunnel WS and device agent WS
- DeviceBridge module with dynamic proxy tool lifecycle: registers device tools in Nexus on connect, unregisters on disconnect, routes tool execution through tunnel WS
- Cross-platform shell execution via child_process.spawn with PowerShell/bash detection, 100KB truncation, and structured JSON output (stdout, stderr, exitCode, duration)
- Five file operation tools (list/read/write/delete/rename) with home-directory path traversal protection, 1MB read limit, and structured JSON output
- Process listing and system info collection tools using systeminformation, wired into agent dispatcher with DeviceBridge parameter schemas
- Screenshot capture tool using node-screenshots native addon with JPEG encoding, graceful fallback, and all 9 agent tools fully wired
- tRPC devices router with list/rename/remove endpoints backed by DeviceBridge Redis queries and tunnel disconnect messaging
- My Devices panel with device card grid, online/offline pulse indicators, rename/remove dialogs, integrated into dock and spotlight
- End-to-end audit trail for device tool executions: agent local JSON-lines log, relay pass-through, Redis storage (capped 1000/device), tRPC query, and UI Activity dialog
- Dangerous command blocklist with 21 regex patterns enforced in shell tool, plus OS user display in agent status

---

## v11.0 Nexus Agent Fixes (Shipped: 2026-03-22)

**Phases completed:** 9 phases (26-34), 9 commits

**Key accomplishments:**

- Sub-agent scheduler coupling: schedule+scheduled_task validation with error on missing task
- Cron tool migrated from setTimeout to BullMQ (restart-persistent)
- Tool profile names aligned with actual registered tools (removed 14 phantom names)
- MultiAgentManager.cleanup() wired into daemon cycle (every 5 min), Redis pipeline optimization
- Multi-channel notification routing: createdVia/createdChatId fields, routeSubagentResult helper
- SubagentConfig.skills renamed to tools with backward compat
- NATIVE_SYSTEM_PROMPT: tool overview (14 categories), sub-agent guidance, WhatsApp rules consolidated
- progress_report multi-channel: Telegram/Discord/Slack/Matrix/Web/WhatsApp routing
- Misc: Lua atomic recordRun, JSON parse safety, dead code removed, complexity limit 500→1000

**Last phase number:** 34 (v11.0)

---

## v10.0 App Store Platform (Shipped: 2026-03-21)

**Phases completed:** 25 phases, 33 plans, 54 tasks

**Key accomplishments:**

- Replaced 63 catch (err: any) patterns with typed catch blocks using formatErrorMessage utility across daemon.ts and api.ts
- Typed catch blocks and error handling in livinityd AI modules
- One-liner:
- One-liner:
- X-API-Key header added to all 4 daemon memory service fetch calls using LIV_API_KEY env var
- Production-grade install.sh with main() wrapper, ERR trap, OS/arch detection, and 7 idempotent dependency installers
- Whiptail TUI configuration wizard with TTY detection, text fallback, and openssl-generated secrets for .env creation
- Complete 823-line installer with 4 systemd services, Redis password/AOF config, UFW firewall, and show_banner() with server IP and service commands
- Relay project scaffolded with 14 tunnel message types, env-based config, and 4-table PostgreSQL schema
- Hardened install.sh with fail-fast Docker image pulls, tor/data + app-data directory creation, and subshell-isolated Kimi CLI handling
- Drizzle ORM schema, X-Api-Key auth middleware, and 5 app catalog REST endpoints restored from backup/post-v9.0 branch with build passing
- install_history table with three authenticated endpoints: POST install-event records events, GET user/apps returns installed apps by instance, GET user/profile returns user stats
- Store layout shell with sidebar navigation, search topbar, and token-based auth context provider using Apple App Store aesthetic
- Featured hero with category-gradient cards, category-grouped app grids, and real-time search/filter for the /store discover page
- App detail page at /store/[id] with large icon, name, tagline, description, version, verified badge, info grid, and placeholder Install button following Apple aesthetic
- Bidirectional postMessage bridge between store iframe and LivOS parent with origin-validated install/uninstall/open/status messaging and dynamic UI state
- iframe App Store window embedding livinity.io/store with bidirectional postMessage bridge for install/uninstall/status commands
- Install event reporting from LivOS bridge to platform API, plus /store/profile page with user info, installed apps by instance, and chronological history timeline

---

## Completed

### v1.0 — Open Source Foundation

**Completed:** 2026-02-05
**Phases:** 1-10 (21 plans)
**Summary:** Config system, security foundation, AI exports/migration, configurability, TypeScript quality, security hardening, documentation, installer script.

### v1.1 — UI Redesign

**Completed:** 2026-02-06
**Phases:** 1-3 (6 plans)
**Summary:** Complete UI redesign with semantic design tokens, responsive mobile, AI chat with conversation sidebar.

### v1.2 — Visual Impact

**Completed:** 2026-02-07
**Phases:** 1-3 (6 plans)
**Summary:** Token value updates, component visual fixes, design enhancements.

### v1.3 — Browser App

**Completed:** 2026-02-10
**Phases:** 1-3 (5 plans)
**Summary:** Docker-based Chromium, App Store integration, Playwright MCP, proxy/anti-detection.

### v1.5 — Claude Migration & AI Platform

**Completed:** 2026-02-15
**Phases:** 1-5 (18 plans)
**Summary:** Multi-provider AI (Claude primary, Gemini fallback), native tool calling, hybrid memory, Slack/Matrix channels, WebSocket gateway, HITL approval, skill marketplace, parallel execution.

**Last phase number:** 5 (v1.5)

### v2.0 — OpenClaw-Class AI Platform

**Completed:** 2026-02-21
**Phases:** 1-6 (23 plans)
**Summary:** Voice interaction (Cartesia/Deepgram), Live Canvas, multi-agent sessions, LivHub, webhooks, Gmail, chat commands, DM security, onboarding CLI, session compaction, usage tracking, stability fixes.

**Last phase number:** 6 (v2.0)

### v3.0 — Next.js 16 UI Rewrite

**Completed:** 2026-03-04
**Phases:** 1-10
**Summary:** Complete UI rewrite using Next.js 16 + Tailwind 4 + Motion Primitives. Reverted back to Vite/React in v4.0.

**Last phase number:** 10 (v3.0)

### v4.0 — UI Polish, Fixes & Motion Primitives

**Completed:** 2026-03-04
**Phases:** 01-10 (10 phases)
**Summary:** Design system + motion-primitives install, App Store fix + redesign, auth pages polish, desktop + dock + windows, AI chat light theme, file manager, settings, system pages, skeletons, final deploy. 99 files changed. Deployed to livinity.cloud. Reverted from Next.js back to Vite/React.

**Last phase number:** 10 (v4.0)

### v5.0/v5.2 — Light Theme & UI Overhaul

**Completed:** 2026-03-07
**Phases:** v5.0 (10 phases) + v5.2 (1 phase, 6 plans)
**Summary:** Complete light theme redesign with semantic tokens, motion-primitives integration (Tilt, Spotlight, Magnetic, AnimatedBackground, BorderTrail). Files A-to-Z redesign (sidebar, toolbar, grid/list items). App Store redesign. Settings routing fix. Window chrome fix. Tabler Icons throughout.

**Last phase number:** 10 (v5.0) + v5.2

### v5.3 — UI Polish & Consistency + Apple Spotlight + Strategic Research

**Completed:** 2026-03-07
**Phases:** 4 phases (files polish, dashboard, visual consistency, performance)
**Summary:** Files path bar, empty states, loading skeletons. Dashboard Tilt/Spotlight effects. Visual consistency audit (borders, menus, shadows). Terminal dark theme fix. Apple Spotlight search integration (replaced cmdk). Desktop search button redesign. Comprehensive strategic research (8 reports, ~270KB) covering competitive analysis, product strategy, UX trends, feature roadmap, go-to-market, priority matrix.

**Last phase number:** 4 (v5.3)

**Strategic research output:** `.planning/research/strategic/` (SYNTHESIS.md for overview)

## Completed (cont.)

### v6.0 — Claude Code → Kimi Code Migration

**Completed:** 2026-03-09
**Phases:** 1-4 (8 plans, 29 requirements)
**Summary:** Complete migration from Claude Code to Kimi Code. KimiProvider (603 lines, OpenAI-compatible API), KimiAgentRunner (497 lines, CLI print mode + MCP bridging), Express/tRPC routes, Settings UI, onboarding wizard. Deleted ClaudeProvider, GeminiProvider, SdkAgentRunner. Removed @anthropic-ai/sdk, @anthropic-ai/claude-agent-sdk, @google/generative-ai. Zero Claude/Anthropic references in active source.

**Last phase number:** 4 (v6.0)

### v7.0 — Multi-User Foundation

**Completed:** 2026-03-13
**Phases:** 1-5 (planned), implemented across sessions
**Summary:** PostgreSQL migration, users/sessions/preferences tables, JWT with userId/role, login screen with avatars, invite system, user management, per-user file isolation, AI conversation isolation, app visibility/sharing, accent color picker, wallpaper selection per-user. Foundation for multi-user platform.

**Last phase number:** 5 (v7.0)

### v7.1 — Per-User Isolation Completion

**Completed:** 2026-03-13
**Phases:** 6-8 (3 phases, 15 requirements)
**Summary:** Per-user wallpaper animation settings (localStorage → PostgreSQL), per-user integration configs (Telegram/Discord/Gmail/Voice), onboarding personalization (role, use cases, style → AI prompt), App Store per-user visibility. MCP settings deferred to v7.2.

**Last phase number:** 8 (v7.1)

### v7.2 — Per-User Docker Isolation & Bugfixes

**Completed:** 2026-03-13
**Phases:** Ad-hoc (4 commits)
**Summary:** Per-user Docker container isolation (installForUser, user_app_instances table, per-user subdomains, per-user Caddy routing). Fixed: port mapping (manifest.port priority), volume triple-nesting, umbrel-app.yml manifest fallback, legacy env var resolution in compose, per-user container restart on startup, gateway appId extraction from qualified IDs, global Jellyfin port misconfiguration. 24/24 tests pass.

**Last phase number:** 8 (v7.2, continues from v7.1)
