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

## Current State: v29.2 Shipped (Factory Reset mini-milestone) — 2026-04-29

**Delivered:** Tek tıkla "fabrika ayarlarına dön" — kullanıcı UI'dan Settings > Advanced > Factory Reset'e bastığında kirli/bozuk bir Mini PC durumundan SSH'e gerek kalmadan temiz bir kuruluma dönebiliyor.

**Shipped features:**
- Settings > Advanced > Danger Zone red destructive button (admin-only)
- Confirmation modal: 7-item explicit deletion list as `<ul>` + `<li>` (consent surface = the list itself)
- preserve-account-vs-fresh radio (default: "Restore my account")
- Type-`FACTORY RESET`-to-confirm strict equality gate
- Pre-flight blocking: update-in-progress check + 5s AbortController network reachability
- Backend `system.factoryReset({preserveApiKey})` tRPC route (200ms detached spawn via systemd-run --scope --collect cgroup-escape)
- Idempotent wipe (sshd preserved, scoped Docker volumes/containers, IF EXISTS DROP, literal-path rm -rf)
- Pre-wipe `tar -czf` snapshot recovery model (install.sh has no --resume)
- `livos-install-wrap.sh` wrapper closes route-spawn argv leak window (v29.2.1 will close install.sh's own window via 5-line env-var patch)
- 4-way install.sh failure classification (api-key-401 / server5-unreachable / install-sh-failed / install-sh-unreachable) via PIPESTATUS exit capture
- JSON event row at `/opt/livos/data/update-history/<ts>-factory-reset.json` (extends Phase 33 OBS-01 schema)
- BarePage progress overlay polls listUpdateHistory @ 2s; 90s reconnect threshold for livinityd-killed-mid-wipe
- Post-reset routing: success+preserve→/login, success+fresh→/onboarding, failed→error page (3 buttons), rolled-back→recovery page
- `/help/factory-reset-recovery` static page with verbatim SSH recovery command

**Stats:** 3 phases / 11 plans / 19 requirements / 184 unit tests passing / 50 commits / 48 source files modified
**Audit:** `.planning/v29.2-MILESTONE-AUDIT.md` — passed (19/19, 10/10 integration, no blockers)
**Archive:** `.planning/milestones/v29.2-ROADMAP.md` + `.planning/milestones/v29.2-REQUIREMENTS.md`

**v29.2.1 carry-forwards:**
- install.sh env-var fallback patch (closes install.sh's own argv leak window)
- install.sh ALTER USER patch (improves install.sh's native idempotency)
- update.sh patch to populate `/opt/livos/data/cache/install.sh.cached`

**Manual verification deferred (opt-in, not blockers):**
- Phase 37: `factory-reset.integration.test.sh` on Mini PC scratchpad (4 fail-closed gates)
- Phase 38: 11 browser-based UI flow checks

### Shipped (v29.2)

- [x] FR-AUDIT-01..05 (5/5) → Phase 36 install.sh audit
- [x] FR-BACKEND-01..07 (7/7) → Phase 37 backend factory reset
- [x] FR-UI-01..07 (7/7) → Phase 38 UI factory reset

## Current State: v29.3 Shipped Local (Marketplace AI Broker, Subscription-Only) — 2026-05-01

**Delivered:** Marketplace AI apps can reach Claude through a per-user subscription-backed broker (`livinity-broker:8080/u/:userId/v1/{messages,chat/completions}`) without entering an API key, while staying ToS-compliant via per-user OAuth + HOME isolation. The sacred `SdkAgentRunner` runs all traffic — broker translates Anthropic Messages and OpenAI Chat Completions formats into the same `query()` invocation underneath.

**Shipped features:**
- **Risk closure (Phase 39):** `claude.ts` OAuth-fallback-with-raw-SDK path deleted; subscription tokens never reach `@anthropic-ai/sdk`. Pinned with `no-authtoken-regression.test.ts`.
- **Per-user OAuth + HOME isolation (Phase 40):** synthetic `/opt/livos/data/users/<id>/.claude/` dirs (mode 0o700); 3 tRPC routes (status / startLogin / logout); Settings UI multi-user branch; sacred `SdkAgentRunner` got ONE surgical edit at line 266 adding `homeOverride?: string` plumbing (behavior-preserving).
- **Anthropic Messages broker (Phase 41):** `POST /u/:userId/v1/messages` (sync + Anthropic-spec SSE chunks); HTTP-proxy strategy to nexus `/api/agent/stream` (Strategy B); `X-LivOS-User-Id` header → per-user `homeOverride` wiring closes Phase 40's deferred AI-Chat HOME-wiring carry-forward.
- **OpenAI-compat broker (Phase 42):** `POST /u/:userId/v1/chat/completions` (sync + SSE); pure in-process bidirectional translation (no LiteLLM sidecar); model alias table (gpt-4 / gpt-4o / claude-sonnet-4-6 → default Anthropic; unknowns warn-and-fall-through).
- **Marketplace integration (Phase 43):** manifest schema `requiresAiProvider: true` flag + `injectAiProviderConfig()` pure function + `apps.ts:963` integration point auto-inject `ANTHROPIC_BASE_URL` / `ANTHROPIC_REVERSE_PROXY` / `LLM_BASE_URL` + `extra_hosts: livinity-broker:host-gateway` into per-user docker-compose at install time.
- **Per-user usage dashboard (Phase 44):** PG `broker_usage` table + Express response capture middleware mounted BEFORE broker; tRPC `usage.getMine` (private) + `usage.getAll` (admin) + Settings > AI Configuration "Usage" subsection (banner / 3 stat cards / 30-day recharts BarChart / per-app table / admin filter view).

**Stats:** 6 phases (39-44) / 28 plans / ~150 automated tests / ~6,500 LOC delta (mostly additive — sacred file 1 surgical edit, broker module byte-identical Phases 41-44).
**Audit:** `.planning/milestones/v29.3-MILESTONE-AUDIT.md` — `gaps_found` (accepted as v29.4 carry-forward) · **Integration check:** `.planning/milestones/v29.3-INTEGRATION-CHECK.md`.
**Archive:** `.planning/milestones/v29.3-ROADMAP.md` + `v29.3-REQUIREMENTS.md` + `v29.3-phases/` (39-44).

**Acknowledged debt at close (carry-forward to v29.4):**
- C1 — Broker error path collapses to HTTP 500; never forwards 429 + drops Retry-After. FR-DASH-03 only synthetic-verifiable.
- C2 — Sacred file integrity test BASELINE_SHA stale (`623a65b9...` vs current `4f868d31...`) due to v43.x model-bump commits.
- C3 — `claudePerUserStartLogin` + `usage.getMine` + `usage.getAll` not in `httpOnlyPaths` — UX hang risk under WS reconnect.
- C4 — OpenAI SSE adapter emits no `usage` chunk → zero `broker_usage` rows for OpenAI streaming traffic.
- **MiroFish anchor app dropped** 2026-05-01 per user direction — manifest draft preserved as planning artifact only.

**Manual UAT deferred (opt-in, not blockers):**
- 6 UAT files (`40-UAT.md` 27 steps · `41-UAT.md` 34 steps · `42-UAT.md` 9 sections including verbatim openai Python SDK smoke test · `43-UAT.md` · `44-UAT.md`) un-executed pending Mini PC deploy.

### Shipped (v29.3)

- [x] FR-RISK-01 → Phase 39 (OAuth fallback closure)
- [x] FR-AUTH-01..03 → Phase 40 (per-user OAuth + HOME isolation; POSIX-enforced isolation deferred per D-40-05)
- [x] FR-BROKER-A-01..04 → Phase 41 (Anthropic Messages broker)
- [x] FR-BROKER-O-01..04 → Phase 42 (OpenAI-compat broker)
- [x] FR-MARKET-01 → Phase 43 (manifest auto-injection); FR-MARKET-02 dropped 2026-05-01
- [x] FR-DASH-01..02 → Phase 44 (dashboard mechanism); FR-DASH-03 partial (debt accepted, C1 carry-forward)

## Current State: v29.4 Shipped Local (Server Management Tooling + Bug Sweep) — 2026-05-01

**Delivered:** Admin SSH lockout recovery via UI without SSH access (Fail2ban admin panel with unban + whitelist + manual ban with self-ban guardrails + immutable audit log + mobile cellular toggle), live SSH session viewer with click-to-ban cross-link, AI diagnostics surface (capability registry restore + atomic-swap resync + model identity 6-step diagnostic + per-user marketplace app health probe), and 4 carry-forward bug fixes from v29.3 — all without new third-party dependencies and zero new database migrations.

**Shipped features:**
- **Phase 45 — Carry-Forward Sweep** (FR-CF-01..04): broker 429 forwarding + Retry-After preservation (strict 429-only allowlist over 9 status codes × 2 routers), sacred SHA audit-only re-pin from `623a65b9...` to `4f868d31...` with audit comment listing v43.x drift commits, 3 namespaced httpOnlyPaths entries, OpenAI SSE adapter `usage` chunk with real token plumbing.
- **Phase 46 — Fail2ban Admin Panel** (FR-F2B-01..06): new `Security` sidebar entry inside `LIVINITY_docker` (13th SECTION_ID) with auto-discovered jail list + 5s polling + 4-state binary detection. Unban modal with ignoreip whitelist checkbox (= passive SSH gateway, "Claude SSH from cloud" closed). Manual ban-IP modal with type-`LOCK ME OUT` + Zod CIDR /0-/7 reject + dual-IP self-ban detection. Audit log REUSES `device_audit_log` (sentinel `device_id='fail2ban-host'`). Mobile cellular toggle + Settings backout toggle.
- **Phase 47 — AI Diagnostics** (FR-TOOL/MODEL/PROBE): shared `diagnostics-section.tsx` scaffold with 3 cards. Capability registry diagnostic with 3-way categorization + atomic-swap Lua RENAME resync + override re-apply. Model Identity 6-step diagnostic returned verdict `neither` → **Branch N taken** (no remediation needed; sacred file untouched). `apps.healthProbe` privateProcedure with PG scoping (anti-port-scanner) + 5s undici timeout.
- **Phase 48 — Live SSH Session Viewer** (FR-SSH-01..02): WebSocket `/ws/ssh-sessions` streams live `journalctl -u ssh -o json --follow`. Click-to-ban cross-link to Phase 46's `ban-ip-modal.tsx` pre-populated via additive `initialIp` prop. 5000-line ring buffer + 4px scroll-tolerance + Resume-tailing button. RBAC at WS handshake closes 4403 for non-admin.

**Stats:** 4 phases (45-48) / 17 plans / ~280 automated tests / 0 new deps / 0 new DB tables / sacred file SHA `4f868d31...` byte-identical across all 4 phases.
**Audit:** `.planning/milestones/v29.4-MILESTONE-AUDIT.md` — `passed` (cleanest v29.x close to date — zero gaps, zero scope creep) · **Integration check:** `.planning/milestones/v29.4-INTEGRATION-CHECK.md` (18/18 reqs wired, 5/5 E2E flows complete).
**Archive:** `.planning/milestones/v29.4-ROADMAP.md` + `v29.4-REQUIREMENTS.md` + `v29.4-phases/` (45-48).

**Manual UAT deferred (opt-in, not blockers):**
- 4 UAT files (45/46/47/48) un-executed pending Mini PC deploy. Same pattern as v29.3 closed with.
- v29.3 carry-forward UATs (6 files: 39-44) STILL un-executed — optional walk alongside v29.4 UATs at next deploy cycle.

**Tech debt (v29.5+ optional):**
- Atomic-swap `syncAll` documented stub (D-WAVE5-SYNCALL-STUB) in 47-02 — production registry Re-sync atomically swaps zero keys until follow-up wires real `PrefixedWriteRedis.syncAll`.
- ~80+ commits ahead of origin/master — push gate before any Mini PC deploy.

### Shipped (v29.4)

- [x] FR-CF-01..04 → Phase 45 (Carry-forward sweep)
- [x] FR-F2B-01..06 → Phase 46 (Fail2ban admin panel)
- [x] FR-TOOL-01..02 → Phase 47 (Capability registry diagnostic + atomic-swap resync)
- [x] FR-MODEL-01..02 → Phase 47 (Branch N — verdict=neither, sacred file untouched)
- [x] FR-PROBE-01..02 → Phase 47 (Per-user app health probe)
- [x] FR-SSH-01..02 → Phase 48 (Live SSH session viewer + click-to-ban)

## Current State: v29.5 Shipped Local (Hot-Patch Recovery + Verification Discipline) — 2026-05-02

**Delivered:** Closed 4 v29.4 regressions (A1 tool registry empty, A2 streaming gone, A3 MiroFish still present, A4 Security panel not rendering) via 8 hot-patch commits + introduced **D-LIVE-VERIFICATION-GATE** so future milestones cannot ship `passed` while phases hold `human_needed` verification status. Closed via `--accept-debt` because ad-hoc Bolt.diy live testing surfaced 3 new architectural issues (broker block-level streaming, identity contamination via Nexus system prompt + tools injection, OpenAI-Like provider env compat) that exceed v29.5's hot-patch scope and require the v30.0 Broker Professionalization milestone to fix properly.

**Shipped features:**
- **Phase 49 — Mini PC Live Diagnostic (single-batch SSH):** Server5 batched fixture captured (`platform` DB, `apps` table is the source of truth, `/opt/platform` layout, recent platform git log for Bolt.diy attribution). Mini PC SSH was banned by fail2ban from prior session — fallback per D-49-02: `v29.4-REGRESSIONS.md` used as fixture; 4 verdict blocks synthesized.
- **Phase 50 — A1 Tool Registry Built-in Seed:** `livos/packages/livinityd/source/modules/seed-builtin-tools.ts` (90 LOC) writes 9 `BUILT_IN_TOOL_IDS` to `nexus:cap:tool:*` idempotently as the first step after Redis connection in livinityd boot; `_meta:lastSeedAt` sentinel; reuses canonical `BUILT_IN_TOOL_IDS` source from `capabilities.ts`; 4/4 fake-Redis integration tests passing.
- **Phase 51 — A2 Streaming Regression Fix (deploy-layer):** `update.sh` UI fresh-build hardening (rm -rf dist + verify_build reordered after build) — root cause was stale UI bundle from short (1m 2s) deploys skipping vite rebuild. Sacred file UNTOUCHED; Branch N reversal explicitly DEFERRED per D-51-03.
- **Phase 52 — A3 Marketplace State Correction:** MiroFish DELETED from livinityd `builtin-apps.ts` (the actual marketplace source-of-truth) AND Server5 `apps` table archived. Bolt.diy hot-patches landed (commits `a3d5b128` wrangler-install + `fcc3ae4d` `OPENAI_LIKE_API_KEY`). FR-A3-04 root cause documented: marketplace source-of-truth confusion — `platform_apps` table doesn't exist; `builtin-apps.ts` is canonical.
- **Phase 53 — A4 Fail2ban Security Panel Render (no-op):** Local code already correct from Phase 46. Real root cause was collapsed sidebar (UI density "compact"); Phase 51's fresh-build was the actual remediation since stale bundle compounded the visibility issue.
- **Phase 54 — B1 Live-Verification Gate (gsd toolkit):** `/gsd-complete-milestone` hard-blocks `passed` audit when `human_needed` count > 0; AskUserQuestion default = "No"; `--accept-debt` flag appends forensic-trail entry to MILESTONES.md with timestamp, milestone, phases, count, reason, mode. **First real-world invocation = this very v29.5 close.**

**Stats:** 6 phases (49-54) / 6 plans / 8 ship commits / 0 new deps / 0 new DB migrations on Mini PC / sacred file `sdk-agent-runner.ts` byte-identical at `4f868d318abff71f8c8bfbcf443b2393a553018b` across all v29.5 phases.
**Audit:** Closed via `--accept-debt` override (B1 gate would have returned `human_needed` for Phases 49+51). Forensic entry: `MILESTONES.md` "Live-Verification Gate Overrides" section, timestamp `2026-05-02T19:35:00Z`.
**Archive:** `.planning/milestones/v29.5-ROADMAP.md` + `v29.5-REQUIREMENTS.md` + `v29.5-phases/` (49-54).

**Carry-forward to v30.0 Broker Professionalization (the dominant carry-forward driver):**

- Phase 55 (live verification) NEVER walked — 14 formal UATs deferred (4 v29.5 + 4 v29.4 + 6 v29.3 carry).
- **Identity contamination** — broker prepends Nexus identity + Nexus tools to external requests. v30 Phase 57 (passthrough mode) bypasses Agent SDK for external traffic.
- **Block-level streaming** — `sdk-agent-runner.ts:382-389` aggregates `assistant` messages into single chunks; external clients see "non-streaming" or 504. v30 Phase 58 implements true token streaming via Anthropic native SSE pass-through.
- **Auth model wrong for external** — URL-path identity + container IP guard. External consumers expect `Authorization: Bearer liv_sk_*`. v30 Phase 59 introduces per-user PG `api_keys` table; v30 Phase 60 introduces public `api.livinity.io` on Server5.
- **OpenAI-Like provider compat** — `OPENAI_LIKE_API_KEY` hot-patched in v29.5; v30 spec compliance work covers this end-to-end with proper `liv_sk_*` Bearer.
- **Branch N reversal still pending** — re-evaluate during v30 Phase 56 spike.

### Shipped (v29.5)

- [x] FR-A1-01..02 → Phase 50 (tool registry seed module + integration test)
- [x] FR-A1-03..04 → DEFERRED to v30 Phase 63 (live verification on Mini PC)
- [x] FR-A2-01 → Phase 49 (root cause: stale UI bundle from short deploys)
- [x] FR-A2-02 → Phase 51 (deploy-layer fresh-build hardening)
- [x] FR-A2-03 → DEFERRED to v30 Phase 63 (live token-streaming verification)
- [x] FR-A2-04 → DEFERRED per D-51-03 (Branch N reversal pending Phase 56 spike)
- [x] FR-A3-01..02 → Phase 52 (MiroFish removed; Bolt.diy lives in livinityd, not Server5)
- [x] FR-A3-03 → DEFERRED to v30 Phase 63
- [x] FR-A3-04 → Phase 52 (root cause documented: marketplace source-of-truth confusion)
- [x] FR-A4-01..02 → Phase 53 (no code change needed; collapsed sidebar was the real issue + stale bundle)
- [x] FR-A4-03..04 → DEFERRED to v30 Phase 63
- [x] FR-B1-01..05 → Phase 54 (gsd toolkit gate landed; first invocation = this v29.5 close)
- [⚠] FR-VERIFY-01..05 → DEFERRED to v30 Phase 63 (mandatory live verification not executed in v29.5)

## Current State: v30.0 Shipped Local (Livinity Broker Professionalization, incl. v30.5 informal scope) — 2026-05-04

**Delivered:** Livinity Broker is now a real-API-key experience for external/open-source apps (Bolt.diy / Open WebUI / Continue.dev / Cline / Cursor) — Bearer-token-authed (`Authorization: Bearer liv_sk_*` AND `x-api-key:` Anthropic-spec dual accept), public-endpoint at `https://api.livinity.io` (Server5 platform Caddy with caddy-ratelimit + caddy-dns/cloudflare custom build), true-token-streaming (Anthropic verbatim SSE forward + OpenAI 1:1 translation), rate-limit-aware (Anthropic-spec headers + 429 with Retry-After), multi-spec-compliant (alias resolver + provider stub interface). Each external client uses its own system prompt + its own tools without Nexus identity contamination. Phase 63 R-series (R1-R3.11) live-verified end-to-end during Bolt.diy debug sessions — subscription auth via /root creds breakthrough at R3.8, dynamic client-tools MCP bridge at R3.9, full disallowedTools at R3.11. v30.5 informal scope (F1 + F6 + F8) folded into close.

**Closed via `--accept-debt`** 2026-05-04: Phases 60+62 VERIFICATION human_needed (live UAT walks waived); Phase 63 formal walkthrough waived (R-series live-verified piece-by-piece via Bolt debug sessions); 14 carryforward UATs from v29.3-v29.5 + 11 Phase 63 plan walks deferred to v31 P64 (v30.5 final cleanup at v31 entry). Forensic entry: `MILESTONES.md` "Live-Verification Gate Overrides" section, timestamp `2026-05-04T16:30:00Z`.

**Stats:** 8 phases (56-63) / 44 plans (41 summaries) / 166 commits since v30.0 seed (`d59b1b51`) / 0 new top-level npm deps / `device_audit_log` REUSE for api-keys audit (no new table).
**Audit:** Skipped formal `/gsd-audit-milestone` per user direction (close-and-continue priority for v31 momentum).
**Archive:** `.planning/milestones/v30.0-ROADMAP.md` + `.planning/milestones/v30.0-REQUIREMENTS.md` + `.planning/milestones/v30.0-phases/` (8 phase dirs).

**v30.5 informal scope (folded in):**
- F1 Built-in tool isolation (R3.11 disallowedTools blocks Bash/Read/Write/ToolSearch/all Claude Code built-ins) ✓
- F6 External client compat (`bearer-auth.ts` accepts both Bearer + x-api-key Anthropic spec) ✓
- F8 Multi-subdomain LivOS (80%) — manual Redis insert pattern works; needs `additionalServices` BuiltinAppManifest field for portability

**Acknowledged debt at close (carry-forward to v31 — Liv Agent Reborn):**
- F7 Suna marketplace sandbox network blocker — kortix-api can't reach kortix-sandbox (different Docker networks). 3 fix candidates documented. Lifted into v31 P71 (Computer Use Foundation) — Bytebot per-session container architecture solves this category correctly.
- F2 Token-level streaming cadence — Agent SDK subprocess flush patterns to investigate. Lifted into v31 P74.
- F3 Multi-turn tool_result protocol — Bolt sends `tool_result` in messages[]. Lifted into v31 P74.
- F4 Caddy timeout for long agentic sessions — `transport http { read_timeout 5m }` config. Lifted into v31 P74.
- F5 Identity preservation across turns — systemPrompt accumulation audit. Lifted into v31 P74.

**Sacred file note:** `nexus/packages/core/src/sdk-agent-runner.ts` current SHA `9f1562be...` after 25 normal feature commits since v22 era. The pre-v30 "UNTOUCHED" rule was stale memory; file was actively developed under v29-v30 broker work (model bumps, broker passthrough, OAuth isolation, R3.11 disallowedTools) and stayed functional throughout. v31 P65 Liv rename will functionally verify subscription path post-rename. Constraint retired going into v31.

### Shipped (v30.0)

- [x] FR-RESEARCH-01..07 → Phase 56 (7 architectural questions resolved, 9 D-30-XX decisions locked)
- [x] FR-BROKER-A1-01..04 → Phase 57 (Passthrough mode preserves client system prompt + tools verbatim)
- [x] FR-BROKER-A2-01..02 → Phase 57 (Agent mode opt-in via header for LivOS in-app chat)
- [x] FR-BROKER-C1-01..02 → Phase 58 (Anthropic verbatim SSE forward via async iterator)
- [x] FR-BROKER-C2-01..03 → Phase 58 (OpenAI 1:1 translation with usage chunk + crypto chatcmpl id)
- [x] FR-BROKER-B1-01..05 → Phase 59 (`liv_sk_*` Bearer middleware + 4 tRPC procs + audit reuse)
- [x] FR-BROKER-B2-01..02 → Phase 60 (api.livinity.io public endpoint + rate-limit perimeter)
- [x] FR-BROKER-C3-01..03 → Phase 61 (rate-limit headers prefix-loop forward + canonical translation)
- [x] FR-BROKER-D1-01..02 → Phase 61 (alias resolver + Redis SETNX seed)
- [x] FR-BROKER-D2-01..02 → Phase 61 (BrokerProvider interface + 4 stubs)
- [x] FR-BROKER-E1-01..03 → Phase 62 (broker_usage.api_key_id FK + capture middleware + insertUsage)
- [x] FR-BROKER-E2-01..02 → Phase 62 (Settings API Keys CRUD + filter dropdown + admin filter chip)
- [⚠] FR-VERIFY-V30-01..08 → Phase 63 (R1-R3.11 live-verified ad-hoc; formal walkthrough waived via --accept-debt; lifted into v31 P64)

## Next Milestone: v31.0 Liv Agent Reborn (PLANNED)

**Goal:** Make AI Chat the WOW centerpiece of LivOS. Replace "Nexus" cosmetic identity with "Liv" project-wide. Adopt Suna's UI patterns (side panel + per-tool views + browser/computer-use display) verbatim. Add computer use via Bytebot desktop image. Polish streaming UX, reasoning cards, lightweight memory.

**Why this milestone exists:** User direct feedback 2026-05-04 — current AI Chat UI feels broken/dysfunctional. Suna's UI proves the bar (real-time tool execution panel, live VNC iframe for browser, per-tool view components). Bytebot proves computer use is achievable in self-hosted Docker. Combining the two with a Nexus → Liv rebrand creates a flagship UX moment for LivOS.

**Target features (12 phases planned, P64-P76):**
- **P64 v30.5 cleanup** — Suna sandbox fix attempt + 14 carryforward UATs walkthrough + Phase 63 wrap
- **P65 Liv Rename** — Nexus → Liv project-wide (~5,800 occurrences across 250+ TS files; @nexus/* → @liv/*; /opt/nexus/ → /opt/liv/ Mini PC migration; systemd unit alignment)
- **P66 Liv Design System v1** — color tokens (deep navy + cyan + amber + violet), motion primitives (FadeIn/GlowPulse/SlideInPanel/TypewriterCaret), typography (Inter Variable + JetBrains Mono), shadcn liv-* variants, Tabler icons unified
- **P67 Liv Agent Core Rebuild** — Redis-as-SSE-relay (24h TTL, reconnectable runs), ToolCallSnapshot data model, LivAgentRunner wrapper around SdkAgentRunner (sacred file unchanged internally)
- **P68 Side Panel + Tool View Dispatcher** — Suna's ToolCallSidePanel ported as LivToolPanel (fixed overlay, live/manual mode, slider, Cmd+I, Jump-to-Live pulse pill); auto-opens ONLY for browser-*/computer-use-* tools
- **P69 Per-Tool Views Suite** — 9 view components (Browser/Command/FileOp/StrReplace/WebSearch/WebCrawl/WebScrape/DataProvider/Mcp/Generic) all Suna-derived
- **P70 Composer + Streaming UX Polish** — auto-grow textarea, slash command menu expansion (6+ commands), Suna typing dots, streaming caret, welcome screen with suggestion cards
- **P71 Computer Use Foundation** — Bytebot desktop image (Apache 2.0, ghcr.io/bytebot-ai/bytebot-desktop:edge) added to livinity-apps catalog with per-user compose templating; react-vnc embed; app gateway auth middleware
- **P72 Computer Use Agent Loop** — 16 Bytebot tool schemas + system prompt verbatim copy (1280x960 coordinate space, screenshot-before-act, 3-retry NEEDS_HELP); livinityd computer-use module (TS); BYTEBOT_LLM_PROXY_URL → broker → Kimi (no Bytebot agent code used); NEEDS_HELP/takeover UI flow
- **P73 Reliability Layer** — ContextManager (75% Kimi window threshold summarization), BullMQ background queue (Redis-backed), reconnectable runs with exponential backoff
- **P74 F2-F5 Carryover from v30.5** — token cadence, multi-turn tool_result, Caddy timeout, identity preservation
- **P75 Reasoning Cards + Lightweight Memory** — Kimi `reasoning_content` collapsible card render, Postgres tsvector FTS over conversations, pinned messages, conversation export
- **P76 Agent Marketplace + Onboarding Tour** — agent_templates table + 8-10 seed agents, Suna marketplace UX adapted, first-run interactive tour (9 steps)

**Estimated effort:** 171-229 hours (6-12 weeks solo at 4-6h/day).

**Locked decisions for v31 entry:**
- ONLY Suna UI patterns (NO Hermes UI per user direction 2026-05-04)
- Side panel auto-opens ONLY for browser-*/computer-use-* tools (Suna behavior)
- Bytebot desktop image only — agent code NOT used; broker proxy pattern (BYTEBOT_LLM_PROXY_URL) routes Kimi via existing Livinity broker
- Subscription-only preserved (D-NO-BYOK)
- Single-user privileged mode accepted for Bytebot containers (Mini PC single-user constraint)

**Phase plan draft:** `.planning/v31-DRAFT.md` (851 lines, file-level breakdown). Awaits `/gsd-new-milestone v31` formal intake.

---

## Previous Milestone: v30.0 Livinity Broker Professionalization (Real API Endpoint Mode) — CLOSED 2026-05-04

**Goal:** Transform Livinity Broker into a "real-API-key" experience for external/open-source apps (Bolt.diy, Open WebUI, Continue.dev, Cline) — Bearer-token-authed, public-endpoint, true-token-streaming, rate-limit-aware, multi-spec-compliant. Each external client must be able to use its own system prompt and its own tools without identity contamination from Nexus.

**Why this milestone exists:** Live Bolt.diy testing during v29.5 close revealed that the broker's current architecture is fundamentally wrong for external consumers. Broker prepends Nexus identity + Nexus tools to every request, aggregates streaming into single chunks, ignores client-supplied tools, and uses URL-path identity instead of standard Bearer auth. External clients see broken streaming, identity collapse, or 504 timeouts.

**Target features (5 categories):**
- **A — Architectural Refactor:** Passthrough mode (default for external) bypassing Agent SDK + opt-in agent mode (current behavior, header-gated)
- **B — Auth & Public Surface:** Per-user `liv_sk_*` Bearer tokens + public `api.livinity.io` reverse proxy on Server5 (TLS + rate-limit perimeter)
- **C — Spec Compliance:** True token streaming (Anthropic native SSE + OpenAI translation adapter rewrite) + rate-limit headers + provider interface stub
- **D — Model Strategy:** Friendly alias resolution (opus/sonnet/haiku → current Claude family) + multi-provider interface stub (Anthropic only in v30)
- **E — Observability:** Per-token usage tracking accuracy + Settings > AI Configuration > API Keys + Usage tabs

**Phase plan (8 phases, 56-63):**
- Phase 56: Research spike (mandatory before any implementation can plan)
- Phase 57: A1 Passthrough mode (depends on 56)
- Phase 58: C1+C2 True token streaming (depends on 57)
- Phase 59: B1 Bearer token auth (parallel)
- Phase 60: B2 Public endpoint (depends on 59)
- Phase 61: C3+D1+D2 Spec compliance + model aliases + provider stub (depends on 57, 58)
- Phase 62: E1+E2 Usage tracking + Settings UI (depends on 59)
- Phase 63: **Mandatory live verification** with 3 external clients + 14 carry-forward UATs (depends on 57-62)

**Key context:**
- Phases continue from v29.5's last (56 onwards).
- Server4 remains off-limits (D-NO-SERVER4).
- Sacred file `sdk-agent-runner.ts` SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` — UNTOUCHED in v30 (passthrough mode bypasses it; agent mode keeps current behavior).
- D-NO-BYOK preserved — broker issues its own `liv_sk_*` tokens; user's raw `claude_*` keys never enter the broker.
- D-LIVE-VERIFICATION-GATE active — Phase 63 must close cleanly without `--accept-debt`.
- Old "v30.0 Backup & Restore" definition (8 phases / 47 BAK-* reqs in `milestones/v30.0-DEFINED/`) is DEFERRED to a future milestone slot — the v30.0 number is now claimed by Broker Professionalization.

### Defined (v30.0 — Backup & Restore — PAUSED)

v30.0 milestone fully bootstrapped (research + REQUIREMENTS + ROADMAP, 8 phases / 47 BAK-* requirements) on 2026-04-28. Paused in favor of v29.2 Factory Reset. Resume with phase renumbering when v29.2 ships.

**Archived artifacts:**
- `.planning/milestones/v30.0-DEFINED/REQUIREMENTS.md` (47 BAK-* requirements)
- `.planning/milestones/v30.0-DEFINED/ROADMAP.md` (Phase 36-43 details — will renumber to 39-46 when resumed)
- `.planning/milestones/v30.0-DEFINED/research/` (STACK / FEATURES / ARCHITECTURE / PITFALLS / SUMMARY)

Working source files (`.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/research/`) repurposed for v29.2.

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
| Subscription-only path (no BYOK) for v29.3 broker | Single auth surface; closes ToS risk; matches user mandate (D-NO-BYOK) | ✓ Good (v29.3) |
| Per-user `.claude/` synthetic dirs over real Linux user accounts | Avoids `useradd` complexity; livinityd-application-layer enforced; future security audit can add POSIX accounts | — Pending (D-40-05/16) |
| Strategy B (HTTP proxy to /api/agent/stream) for broker | Reuses single nexus SdkAgentRunner instance; no cross-package brain/toolRegistry handle problem; sacred file untouched | ✓ Good (v29.3 Phase 41) |
| Pure in-process TS translation for OpenAI broker (not LiteLLM sidecar) | No new container, no new dep, simpler ops; tools intentionally ignored per D-42-12 | ✓ Good (v29.3 Phase 42) |
| MiroFish anchor app dropped at v29.3 close | User priority shift — manifest mechanism still ships; future anchor-app conversation deferred to v30+ | — Closed by user 2026-05-01 |
| Synthetic-INSERT verification path for FR-DASH-03 banner | Live 429 path requires C1 broker fix in v29.4; banner UI logic verified via unit tests + synthetic rows for v29.3 | — Pending (debt) |
| D-LIVE-VERIFICATION-GATE (v29.5 Phase 54) | Milestones cannot ship `passed` while phases hold `human_needed` verification. AskUserQuestion default = "No"; `--accept-debt` flag appends forensic-trail entry to MILESTONES.md | ✓ Good (v29.5; first real-world invocation = v29.5's own close) |
| D-51-03 — Branch N reversal deferred | Insufficient evidence sacred-file model preset is the actual cause of A2 streaming regression; deploy-layer fresh-build fix shipped first; reversal pending Phase 56 spike findings | — Pending (v30) |
| v30.0 Broker Professionalization supersedes v30.0 Backup & Restore | Live Bolt.diy testing revealed broker architecture is fundamentally wrong for external API consumers (identity contamination, block-level streaming, wrong auth model). Bigger blocker than backup work; v30 slot reassigned, backup deferred to a future milestone | — Pending (v30 entry) |

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
*Last updated: 2026-05-04 — v30.0 closed via `--accept-debt` (incl. v30.5 informal scope); v31 "Liv Agent Reborn" planned (12 phases P64-P76 drafted at `.planning/v31-DRAFT.md`, awaiting `/gsd-new-milestone v31` formal intake)*
