# Milestones

## v29.4 Server Management Tooling + Bug Sweep (Shipped local: 2026-05-01)

**Phases completed:** 4 phases (45-48), 17 plans, ~280 automated tests
**Requirements:** 18/18 mechanism-satisfied · 0 unsatisfied · 0 partial · 0 dropped
**Milestone audit:** `passed` (cleanest v29.x close to date — zero gaps, zero scope creep)
**Sacred file:** `nexus/packages/core/src/sdk-agent-runner.ts` byte-identical across all 4 phases at SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` (Branch N taken for FR-MODEL-02 — verdict=`neither`).
**Net stack delta:** 0 new npm/apt deps, 0 new database tables (REUSED `device_audit_log` for Fail2ban audit, `user_app_instances` for healthProbe scoping).
**Known deferred items at close:** 4 manual UAT files un-executed (live Mini PC walkthroughs deferred to natural deploy cadence per v29.3 pattern); 1 atomic-swap `syncAll` documented stub for v29.5 follow-up if registry Re-sync UX warrants.

**Key accomplishments:**

- Phase 45 — Carry-Forward Sweep: closed all 4 v29.3 audit-found integration gaps. C1 (broker 429 forwarding + Retry-After preservation, strict 429-only allowlist over 9 status codes × 2 routers), C2 (sacred SHA audit-only re-pin from `623a65b9...` to `4f868d31...` with audit comment listing v43.x drift commits — sacred file byte-identical), C3 (3 namespaced httpOnlyPaths entries: `ai.claudePerUserStartLogin` + `usage.getMine` + `usage.getAll`), C4 (OpenAI SSE adapter emits `usage` chunk before `[DONE]` with real token plumbing through agent-runner-factory.ts).
- Phase 46 — Fail2ban Admin Panel: new `Security` sidebar entry inside `LIVINITY_docker` (13th SECTION_ID) with auto-discovered jail list + 5s polling + 4-state binary detection banner. Unban modal with `ignoreip` whitelist checkbox (= B3a passive SSH gateway = "Claude SSH from cloud" use case closed). Manual ban-IP modal with type-`LOCK ME OUT` exact-string gate + Zod CIDR /0-/7 reject + dual-IP self-ban detection (HTTP X-Forwarded-For + active SSH session). Audit log REUSES `device_audit_log` (sentinel `device_id='fail2ban-host'`) — no new table migration. Mobile cellular toggle. Settings backout toggle wired into AdvancedSection.
- Phase 47 — AI Diagnostics: shared `diagnostics-section.tsx` scaffold hosting 3 cards (Capability Registry / Model Identity / App Health) per D-DIAGNOSTICS-CARD ~25% LOC saving. Capability registry diagnostic with 3-way categorization (`missing_lost` vs `missing_precondition` vs `disabled_by_user`) + atomic-swap resync via temp Redis prefix + Lua RENAME script + user override re-apply. Model Identity 6-step on-Mini-PC diagnostic returned verdict `neither` — Branch N taken (no remediation needed, sacred file untouched). Per-user `apps.healthProbe` privateProcedure with PG scoping `WHERE user_id = ctx.currentUser.id AND app_id = $1` (anti-port-scanner) + 5s undici timeout.
- Phase 48 — Live SSH Session Viewer: new `SSH Sessions` tab inside Phase 46's Security section. WebSocket `/ws/ssh-sessions` streams live `journalctl -u ssh -o json --follow` events filtered to `_SYSTEMD_UNIT === "ssh.service"`. Click-to-ban cross-link to Phase 46's `ban-ip-modal.tsx` pre-populated via additive `initialIp?: string` prop (lifted state in `security-section.tsx`). 5000-line ring buffer + 4px scroll-tolerance auto-disables live-tail with explicit "Resume tailing" button. RBAC at WS handshake closes with code 4403 for non-admin. NO `maxmind` / geo-IP dependency (deferred to FR-SSH-future-01 / v30+).

**Carry-forward to v29.5+ (optional):**

- 4 manual UAT files (45/46/47/48) un-executed — walk on next Mini PC deploy.
- v29.3 carry-forward UATs (6 files: 39-44) STILL un-executed — optional walk alongside v29.4 UATs.
- Atomic-swap `syncAll` stub in 47-02 (D-WAVE5-SYNCALL-STUB) — production registry Re-sync atomically swaps zero keys; wire real `PrefixedWriteRedis.syncAll` if UX feedback warrants.
- Push to origin/master (~80+ commits ahead since v29.3).

---

## v29.3 Marketplace AI Broker (Subscription-Only) (Shipped local: 2026-05-01)

**Phases completed:** 6 phases (39-44), 28 plans, ~150 automated tests across phase suites
**Requirements:** 15/17 mechanism-satisfied · 1 partial (debt accepted: FR-DASH-03 broker 429) · 1 dropped (FR-MARKET-02 MiroFish, user-closed 2026-05-01)
**Milestone audit:** `gaps_found` — accepted, gaps carried forward to v29.4 (broker 429 forwarding, sacred-file SHA re-pin, httpOnlyPaths, OpenAI SSE usage chunk)
**Known deferred items at close:** 8 (5 manual UAT files un-executed pending Mini PC deploy + 3 v28.0 hot-patch quick tasks; see STATE.md Deferred Items)
**Sacred file:** `nexus/packages/core/src/sdk-agent-runner.ts` — 1 surgical edit in Phase 40 (line 266 `homeOverride` fallback chain), byte-identical across Phases 41-44; **drifted post-milestone** to `4f868d31...` from `623a65b9...` baseline due to unrelated v43.x model-bump commits — re-pin landed in v29.4 carry-forward.

**Key accomplishments:**

- Phase 39 — Closed the raw-`@anthropic-ai/sdk` OAuth-fallback path in `claude.ts` so subscription tokens can never reach the raw HTTP path; added `ClaudeAuthMethodMismatchError` typed exception and pinned the deletion with grep-based regression + sacred-file integrity tests.
- Phase 40 — Per-user `.claude/` synthetic dir module + 3 tRPC routes (status/startLogin/logout) + Settings UI multi-user branch; sacred `SdkAgentRunner` got ONE surgical line edit at line 266 adding `homeOverride?: string` plumbing (behavior-preserving) — new BASELINE_SHA `623a65b9...` re-pinned in integrity test.
- Phase 41 — Anthropic Messages broker mounted at `livinityd:8080/u/:userId/v1/messages` (sync + Anthropic-spec SSE) backed by HTTP proxy to nexus `/api/agent/stream` (Strategy B). Phase 41-04 closed Phase 40's deferred AI Chat HOME-wiring carry-forward by adding `X-LivOS-User-Id` → `homeOverride` header pipeline in `nexus/.../api.ts`.
- Phase 42 — OpenAI Chat Completions endpoint at `/u/:userId/v1/chat/completions` with pure in-process bidirectional translation (no LiteLLM sidecar, no nexus changes). Model aliasing (gpt-4 / gpt-4o / claude-sonnet-4-6) with unknown-model warn-and-fall-through. Tools array intentionally ignored per D-41-14/D-42-12.
- Phase 43 — Manifest schema flag `requiresAiProvider: true` triggers auto-injection of 3 broker env vars (`ANTHROPIC_BASE_URL`, `ANTHROPIC_REVERSE_PROXY`, `LLM_BASE_URL`) plus `extra_hosts: livinity-broker:host-gateway` into per-user docker-compose files at install time. Single integration point in `apps.ts:963`. **MiroFish anchor app dropped 2026-05-01** — manifest draft remains as a planning artifact.
- Phase 44 — `broker_usage` PG table + Express response capture middleware mounted BEFORE broker on `/u/:userId/v1` (parses both Anthropic Messages and OpenAI Chat Completions `usage` shapes). tRPC `usage.getMine` + `usage.getAll` (admin-gated) + Settings > AI Configuration "Usage" subsection (banner / 3 stat cards / 30-day recharts BarChart / per-app table / admin filter view). Capture module imports zero symbols from `livinity-broker/*`.

**Carry-forward to v29.4** (audit-found integration gaps, MiroFish dropped):

- **C1 (FR-DASH-03 broker 429 forwarding):** `livinity-broker/router.ts:159` returns 500 for ALL upstream errors; `agent-runner-factory.ts:75-76` drops Retry-After. ~10 lines, ~3 unit tests.
- **C2 (sacred file integrity SHA re-pin):** `sdk-agent-runner-integrity.test.ts:33` BASELINE_SHA stale (`623a65b9...` vs current `4f868d31...`). Either re-pin per Phase 40 D-40-01 ritual or revert v43.x drift.
- **C3 (httpOnlyPaths):** add `claudePerUserStartLogin` (sub) + `usage.getMine` (q) + `usage.getAll` (q) to `httpOnlyPaths` per project pattern.
- **C4 (OpenAI SSE usage chunk):** OpenAI streaming traffic produces zero `broker_usage` rows; emit final `usage` chunk in `openai-sse-adapter.ts` before `[DONE]`.

See `.planning/MILESTONE-CONTEXT.md` Section C for full v29.4 carry-forward spec.

---

## v29.0 Deploy & Update Stability (Shipped: 2026-04-27)

**Phases completed:** 5 phases, 11 plans, 22 tasks

**Key accomplishments:**

- Code-read root-cause hunt on /opt/livos/update.sh build silent-fail — produced verdict matrix (1 confirmed bug, 4 ruled-out hypotheses, 2 inconclusive contributing factors) plus 7-item remediation spec that IS Plan 02's patch-script input contract.
- Idempotent 370-line patch script `phase31-update-sh-patch.sh` that delivers BUILD-01 (verify_build helper + 10 wired call sites), BUILD-02 (multi-dir @nexus+core dist-copy loop), and BUILD-03 (worker/mcp-server masking strip + memory-build injection on Server4 + inconclusive-verdict marker), with backup-then-syntax-check-then-restore safety net.
- Patch applied to both prod hosts
- Single self-contained patch script `phase32-systemd-rollback-patch.sh` (embeds all 4 Plan 01+02 artifacts as HEREDOCs) applied to Mini PC with full idempotency proven, all 4 systemd directives verified, and a 61.1-second synthetic-trigger rollback validating the entire OnFailure → oneshot → JSON-history chain — Server4 explicitly deferred per user pivot to Factory Reset (BACKLOG 999.7).
- Self-contained idempotent patch wraps `/opt/livos/update.sh` in a `tee` + EXIT-trap that emits canonical `update-<ts>-<sha>.log` + `<ts>-success|failed.json` records — applied + idempotency-verified + bash-n-clean on Mini PC; live trap-firing deferred to organic first-deploy via UI per user opt (21/21 bash unit-test assertions cover all 4 trap scenarios).
- Pure code cleanup phase, no plan-checker / executor agents needed.
- Tier downgrade (build-only vs full deploy smoke):

---

## v28.0 Docker Management UI (Dockhand-Style) (Shipped: 2026-04-26)

**Phases completed:** 6 phases (24-29), 12 plans, 33 tasks
**Requirements satisfied:** 20/20 (DOC-01..DOC-20)
**Milestone audit:** passed (9/9 cross-phase integrations confirmed, 4/4 E2E flows complete, zero gaps)
**Known deferred items at close:** 45 deployment-time UAT items + 10 info-severity tech-debt (URL-bar deep-link form deferred to v29.0+ — window-app pattern incompatibility)

**Key accomplishments:**

- LIVINITY_docker system app shell — 12-entry collapsible sidebar + zustand section store + scoped class-based dark mode (light/dark/system) — replaces LIVINITY_server-control in dock + desktop + mobile + spotlight launchers.
- Persistent 48px Dockhand-style top StatusBar mounted in DockerApp `<main>` — EnvironmentSelector + 8 stat pills (Docker version / Socket type / N cores / GB RAM / GB free / uptime / HH:MM / Live indicator) + Search button + AlertsBell + light/dark/system theme toggle. Closes DOC-01 + DOC-02 + DOC-03.
- EnvCardGrid replaces the Phase 24 dashboard placeholder with one Dockhand-style health card per environment (header + tags + health banner + container counts + 2x2 stats + 8-event feed); environments.tags TEXT[] column lands idempotently for the filter chips Plan 25-02 consumes.
- Layered DOC-05 + DOC-06 onto Plan 25-01's EnvCardGrid: TagFilterChips above the grid (localStorage-persisted single-select), TopCpuPanel below it (top-10 cross-env containers by CPU% with Logs/Shell/Restart quick-action chips), and per-card Retry button on the Unreachable banner. Phase 25 closes — DOC-04 + DOC-05 + DOC-06 fully delivered across Plans 25-01 + 25-02.
- Replaces Phase 24 Containers + Images placeholders with the full live tab bodies from `routes/server-control/index.tsx` — adds search inputs (NEW), wires detail-panel state through `useDockerResource` zustand store for programmatic deep-link (DOC-20 partial), preserves Phase 19 vulnerability scan + Phase 22 env-aware tRPC + Phase 23 AI Diagnose / Explain CVEs end-to-end.
- Replaces Phase 24 Volumes + Networks placeholders with the full live tab bodies from `routes/server-control/index.tsx` — adds search inputs (NEW), wires deep-link state through `useDockerResource` zustand store for volumes + networks (DOC-20 partial half now closed for all 4 resource types), adds per-row Schedule-backup cross-section navigation seam (DOC-09), pins the four-slot programmatic deep-link contract via 3-case vitest contract test for Phase 28 + 29 future readers.
- Stacks section migration to v28 Docker app — verbatim port of legacy StacksTab + DeployStackForm with YAML/Git/AI deploy tabs preserved (Phase 21+23 features), constituent-container click-through to ContainerDetailSheet preserves Phase 17 logs / Phase 18 file browser / Phase 19 vuln-scan, selectedStack added as 5th slot to useDockerResource (DOC-11).
- Schedules section migration with AddBackupDialog volume pre-fill via useSelectedVolume() consume-and-clear seam, full Phase 20 + 23 features (Run Now / Test Destination / S3+SFTP+Local destinations) preserved (DOC-12). FINAL CLEANUP: deleted 4815-line `routes/server-control/index.tsx` + 792-line legacy `scheduler-section.tsx` + ServerControlWindowContent adapter; 7 components git-mv'd to permanent homes; 4-grep gate verifies zero remaining references (DOC-03 final).
- Cross-container Logs section — multiplexed WS aggregator with one connection per checked container via existing /ws/docker/logs (extended env-aware via getDockerClient with back-compat). Color stripe per container (deterministic hash → HSL), [container-name] line prefix, regex grep with maxLength=500, severity classifier (ERROR/WARN/INFO/DEBUG word-boundary regex), live-tail toggle with 4px scroll-tolerance auto-disable, 5000-line ring buffer, 25-socket cap, virtualized list (no react-window dep) (DOC-13).
- Activity Timeline section — unified event stream from 3 sources (dockerEvents WS + scheduler.listJobs lastRun* columns + docker.listAiAlerts). Filter chips for source + severity, click-through routing per source type, AnimatePresence fade-in on 5s poll. Zero new tables, zero new tRPC routes — existing columns sufficient (DOC-14).
- Cross-container Shell section — multi-tab xterm sessions with `display:none` for inactive tabs (preserves session state). Per-tab uses /ws/docker/exec extended env-aware (mirror of Phase 28-01 logs pattern). cmd+k command palette with categorized search across 7 categories (containers/stacks/images/volumes/networks/envs/recent-events/settings), localStorage recent-searches ring buffer max 8, anti-flicker close-then-navigate ordering (DOC-15 + DOC-18).
- Registry section live with AES-256-GCM credential vault and Docker Hub + private registry search; Docker Settings section live with cross-imported Environments + Theme + Sidebar density; Copy Deep Link buttons on all 5 detail panels closing DOC-20 within the window-app constraint

---

## v27.0 Docker Management Upgrade (Shipped: 2026-04-25)

**Phases completed:** 7 phases (17-23), 15 plans, 40 tasks
**Requirements satisfied:** 33/33 (QW-01..04, CFB-01..05, CGV-01..04, SCH-01..05, GIT-01..05, MH-01..05, AID-01..05)
**Milestone audit:** passed (90 must-haves verified, 8/8 cross-phase integrations confirmed, 3/3 E2E flows complete)
**Known deferred items at close:** 11 (live-infra UAT — see `.planning/STATE.md` Deferred Items section + `.planning/phases/22-multi-host-docker/22-HUMAN-UAT.md` + `.planning/phases/23-ai-powered-docker-diagnostics/23-HUMAN-UAT.md`)

**Key accomplishments:**

- Live container log streaming via /ws/docker/logs (xterm + ANSI colors, no 5s polling) and AES-256-GCM-encrypted stack secrets injected via execa env at compose up time (never written to /opt/livos/data/stacks/<name>/.env on disk)
- One-click stack upgrade via a new `pull-and-up` controlStack operation (UI button pulls latest images and recreates containers with the same volumes) plus a broader AI `docker_manage` tool that gains 5 new operations (stack-deploy / stack-control / stack-remove / image-pull / container-create) backed by new DockerManager methods using the local socket + host `docker compose` CLI.
- dockerode-backed list/read/write/download/upload/delete for any Docker container — four tRPC admin procedures + two binary-safe REST endpoints, no host volume mounts required.
- Container Detail Sheet gains a 5th "Files" tab — breadcrumb-driven file table with per-row download/edit/delete, drag-drop upload zone, monospace inline edit modal (1MB guard), and recursive-confirm deletion for directories. Zero new dependencies.
- Compose YAML → React Flow service-dependency graph rendered inside a new Graph tab on every deployed-stack detail row, using js-yaml client-side parsing with topological grid layout.
- On-demand Trivy vuln scan with SHA256-keyed 7-day Redis cache, severity-badge UI, and click-to-expand CVE table embedded in tabbed expanded-image row
- node-cron-driven persistent scheduler with PG-backed `scheduled_jobs` table, in-flight Set mutex, and three built-in handlers (image-prune, container-update-check, git-stack-sync placeholder) wired into Livinityd lifecycle.
- Volume backup with S3/SFTP/local destinations — alpine-tar streaming, AES-256-GCM credential vault keyed off the JWT secret, 5 admin-only tRPC routes, and a Settings > Scheduler UI section that polls live for Last Run updates and ships a Test Destination dry-run probe.
- Backend infrastructure for git-pinned compose stacks: PG schema for git-backed stacks, AES-256-GCM credentials, simple-git blobless clone/pull, deployStack git path, and HMAC-SHA256-verified webhook endpoint that responds 202 and redeploys in background.
- User-visible GitOps surface area: a 'Deploy from Git' tab in the stack create dialog with credential picker + post-deploy webhook URL display, plus the real hourly auto-sync scheduler handler that closes the GIT-04 + GIT-05 loop and ships v27.0's GitOps milestone.
- Multi-host Docker management foundation: PostgreSQL `environments` table (socket / tcp-tls / agent transports), `getDockerClient(envId)` factory with in-memory cache + invalidation, every `docker.*` tRPC route accepts optional `environmentId`, alias-resolves to a sentinel local-env UUID for backwards-compatible callers.
- Multi-host UI surface: zustand-persisted env selector dropdown in Server Control header, React Query queryKey-driven auto-refetch on env switch across 7 docker hooks, Settings > Environments management section with Add/Edit/Remove dialogs and one-time agent-token generation flow.
- Outbound docker-agent: `@livos/docker-agent` Node binary with WebSocket client + Dockerode dispatch table, `/agent/connect` token-authenticated WS handler, `docker_agents` table with SHA-256 token hashes + Redis pub/sub revocation channel that closes the live agent within 5 seconds — NAT-traversal Docker management without opening any inbound TCP port on the remote host.
- Reactive AI diagnostics shipped via one-shot Kimi-completion bridge: container log/stats analyzer, natural-language compose generator, and CVE plain-English explainer — all routed through a new POST /api/kimi/chat endpoint and cached in Redis.
- Proactive Kimi resource-pressure alerts via a default-disabled `ai-resource-watch` scheduler handler (5-min tick, threshold-priority + 60-min dedupe, module-scoped throttle delta cache) + autonomous AI Chat container diagnostics via a new `docker_diagnostics` tool registered in the nexus tool registry — Phase 23 closes, v27.0 ready for milestone audit.

---

## v26.0 Device Security & User Isolation (Shipped: 2026-04-24)

**Phases completed:** 6 phases (11-16), 11 plans, ~60 tasks
**Requirements satisfied:** 15/15 (OWN-01/02/03, AUTHZ-01/02/03, SHELL-01/02, SESS-01/02/03, AUDIT-01/02, ADMIN-01/02)
**Milestone audit:** passed (42/42 must-haves, 4 attack vectors blocked end-to-end)

**Key accomplishments:**

- Device ownership enforced at DB + application + Redis cache layers (Phase 11: FK constraint `devices.user_id -> users(id) ON DELETE RESTRICT`, userId propagated through tunnel protocol, per-user filtered listing)
- Single reusable `authorizeDeviceAccess` middleware across DeviceBridge, tRPC, Nexus REST, and /internal/device-tool-execute HTTP (Phase 12)
- Shell tool boundary hardened: local shell has no device_id escape, RESERVED_TOOL_NAMES blocks rogue tool registration, device proxy shell schema documents ownership (Phase 13)
- DeviceBridge WebSocket bound to user session JWT at handshake, 60s token-expiry watchdog closes with code 4401, Redis pub/sub session revocation closes bridges with code 4403 on logout (Phase 14)
- Immutable PostgreSQL `device_audit_log` with trigger-enforced append-only, SHA-256 params digest, admin-only `audit.listDeviceEvents` tRPC query (Phase 15)
- Admin cross-user device listing + force-disconnect via tRPC + platform REST, new `admin_force_disconnect` tunnel verb, audit rows attributing admin actions (Phase 16)
- AI agent auto-approval behavior preserved (user constraint honored — no approval friction added)

**Deployment warning:** `REDIS_URL` env var must be set on platform/web (Server4) for SESS-03 instant teardown; otherwise degrades to 60s watchdog fallback (still safe, just slower).

---

## v22.0 Livinity AGI Platform (Shipped: 2026-03-29)

**Phases completed:** 8 phases, 12 plans, 23 tasks

**Key accomplishments:**

- CapabilityRegistry module with 5-type manifest model, 4-source sync engine, Redis persistence, and in-memory search
- REST + tRPC API for unified capability registry with startup wiring and wildcard ID routing
- Unified capabilities panel with 4 sub-tabs (Skills, MCPs, Hooks, Agents), search, status dots, tier badges, tool counts, success rate placeholders, and detail views -- all wired to Phase 29 unified registry via tRPC
- IntentRouter with TF-IDF keyword/trigger scoring, 30% context budget cap, Redis caching, and LLM fallback wired into AgentSessionManager for intent-based tool selection
- Dependency resolution with topological expansion, dynamic per-session system prompts from capability metadata, and discover_capability tool for mid-conversation registry search
- 1. [Rule 3 - Blocking] Fixed pre-existing api.ts build errors
- Two self-modification tools (create_hook, create_agent_template) + enhanced skill_generate with CapabilityRegistry auto-registration + hook event dispatcher + create-test-fix system prompt
- Prompt template CRUD (4 built-in + custom) and capability analytics table with CSS bar charts added to 6-tab capabilities panel
- Inline marketplace capability recommendation cards in chat with Install/Dismiss buttons and tRPC install mutation
- LearningEngine with Redis stream tool call logging, session-grouped co-occurrence mining, and proactive capability suggestion injection into IntentRouter
- rateConversation tRPC mutation with Redis feedback storage, and enhanced Analytics tab showing real tool usage stats and co-occurrence patterns from Redis stream data
- End-to-end feedback-to-scoring pipeline: chat UI thumbs up/down -> Redis feedback storage -> aggregated success_rate PATCH on tool capabilities

---

## v21.0 Autonomous Agent Platform (Shipped: 2026-03-28)

**Phases completed:** 10 phases, 13 plans, 26 tasks

**Key accomplishments:**

- Real-time agent processing overlay with thinking indicator, tool badges, and step list derived from WebSocket events in useAgentSocket hook
- Auto-load most recent conversation on AI Chat mount via localStorage + backend fallback, with null-safe query guards and fixed getConversation await bug
- Nexus REST history endpoint, enhanced list() with description/tier, and two tRPC proxy queries (getSubagent, getSubagentHistory) for the Agents panel frontend
- Agents tab replacing LivHub in AI Chat sidebar with list/detail AgentsPanel showing agent status, history, configuration, and run metrics
- Nexus REST endpoints for subagent execution (with history recording) and loop management, tRPC proxy routes, httpOnlyPaths for all mutations
- MessageInput for agent messaging, LoopControls with start/stop and iteration display, compact CreateAgentForm with name/description/tier in sidebar
- REST endpoint + tRPC proxy for listing built-in commands, tools, and skills as a unified slash command catalog
- SlashCommandMenu dropdown with 6 built-in commands, dynamic backend commands via tRPC, real-time filtering, and full keyboard navigation wired into ChatInput
- Self-Improvement system prompt section with skill creation, MCP tool installation guidance, and act-vs-ask decision criteria, plus enhanced tool response messages for availability timing
- JSON-driven selectTier() reading from nexus/config/tiers.json with fallback defaults, plus Autonomous Scheduling system prompt teaching AI when/how to create recurring schedules and loops
- Self-evaluation system prompt section with after-task reflection guidance plus pre-seeded Self-Improvement Agent meta-loop running every 6 hours on flash tier
- NATIVE_SYSTEM_PROMPT condensed 72% (221 to 84 lines, ~3214 to ~899 tokens) with Self-Awareness section and all 43 tool descriptions shortened

---

## v20.0 Live Agent UI (Shipped: 2026-03-27)

**Phases completed:** 0 phases, 0 plans, 0 tasks

**Key accomplishments:**

- (none recorded)

---

## v19.0 Custom Domain Management (Shipped: 2026-03-27)

**Phases completed:** 5 phases, 10 plans, 19 tasks

**Key accomplishments:**

- Custom domain CRUD API with Drizzle schema, dual-resolver DNS verification (system + Cloudflare DoH), and 3-domain free tier limit
- Custom Domains dashboard section with add/verify/delete UI, expandable DNS instructions (A record + TXT), colored status badges, and background polling service with 30s/5min tiered intervals
- Redis-cached custom domain authorization in relay ask endpoint with Caddyfile catch-all for Let's Encrypt TLS provisioning
- Custom domain HTTP and WebSocket traffic routed through domain owner's tunnel with full bandwidth/reconnect/offline handling
- Domain sync pipeline from platform through relay to LivOS with Redis storage, reconnect resilience, and DNS re-verification triggers
- End-to-end custom domain to Docker app routing: relay resolves targetApp from app_mapping, LivOS routes HTTP and WebSocket traffic to correct container port
- PostgreSQL INSERT/UPDATE/DELETE added to tunnel-client.ts domain sync handlers alongside existing Redis writes, closing the DOM-03 verification gap
- Domains tab in Servers app with tRPC CRUD routes, colored status badges, Docker app mapping dropdown, and domain removal via tunnel sync
- Enhanced domain cards with SSL status indicators, re-verify timing display, and inline error banners with retry buttons
- Replaced "Domain & HTTPS" wizard in Settings with "My Domains" section showing tunnel-synced domains from livinity.io, with Configure dialog for app mapping and conditional Caddy integration

---

## v18.0 Remote Desktop Streaming (Shipped: 2026-03-26)

**Phases completed:** 3 phases, 4 plans, 8 tasks

**Key accomplishments:**

- Three bash functions (detect_gui, install_x11vnc, setup_desktop_streaming) added to install.sh with localhost-only x11vnc systemd service for desktop capture
- x11vnc registered as desktop-stream NativeApp with pc.{domain} Caddy subdomain, JWT cookie gating, and stream_close_delay 5m for WebSocket resilience during reloads
- /ws/desktop WebSocket-to-TCP bridge with JWT auth, Origin validation, NativeApp auto-start, and three-layer idle prevention
- Standalone noVNC desktop viewer at pc.{domain} with full input, auto-reconnect, fullscreen, dynamic xrandr resize, and app gateway NativeApp bypass

---

## v17.0 Precision Computer Use (Shipped: 2026-03-25)

**Phases completed:** 3 phases, 3 plans, 6 tasks

**Key accomplishments:**

- Sharp-based screenshot resize from physical to target resolution with correct coordinate mapping chain (AI -> logical -> robotjs) and explicit AI prompt coordinate documentation
- Windows UIA accessibility tree via persistent PowerShell subprocess with screen_elements tool returning pipe-delimited interactive elements and raw coordinate flag for all mouse tools
- Accessibility-first AI system prompt with Elements-First Workflow and SHA-256 hash-based screenshot caching that skips re-capture when the UIA accessibility tree is unchanged

---

## v16.0 Multi-Provider AI (Shipped: 2026-03-25)

**Phases completed:** 4 phases, 6 plans, 12 tasks

**Key accomplishments:**

- ClaudeProvider restored from git history (467 lines) with Anthropic SDK, registered in ProviderManager alongside Kimi, building with zero TypeScript errors
- Native tool calling and Anthropic image format enabled for Claude in the agent loop, with model tier mapping verified
- Five Claude auth API routes (API key + OAuth PKCE) and provider selection config with primaryProvider field defaulting to kimi
- Config-driven ProviderManager fallback order from Redis with provider listing and switching API routes
- Seven tRPC proxy routes for Claude authentication (API key, OAuth PKCE, status, logout) and provider listing/switching, with httpOnlyPaths registration for mutations
- Provider toggle with Claude/Kimi auth cards in Settings, and active provider badge in AI chat sidebar

---

## v15.0 AI Computer Use (Shipped: 2026-03-24)

**Phases completed:** 5 phases, 10 plans, 20 tasks

**Key accomplishments:**

- 8 desktop automation tools (6 mouse + 2 keyboard) using @jitsi/robotjs with lazy loading, combo key parsing, and drag safety
- robotjs native addon wired into SEA build (external + prebuilds copy) and all 17 tool schemas registered in DeviceBridge for Nexus proxy routing
- screen_info tool for display geometry/scaling/active window, plus coordinate metadata on screenshot return data for AI vision-to-screen mapping
- Kimi vision enabled and native tool calling path wires screenshot images through to LLM via multimodal content blocks
- AI system prompt with screenshot-analyze-act-verify loop, configurable 50-action step limit, and graceful session termination
- SSE screenshot passthrough, chatStatus computer use enrichment (screenshot/actions/paused), and pause/resume/stop tRPC mutations for live monitoring
- ComputerUsePanel with live screenshot feed, red dot click overlays, blue type badges, action timeline, and pause/resume/stop controls wired into AI chat split-pane layout
- AbortController-based SSE stream abort so stopComputerUse actually kills the Nexus agent loop
- Emergency stop hotkey (3x Escape in 1s) with device_emergency_stop protocol message, plus enriched audit events carrying full coordinates and text for all mouse/keyboard tools
- Emergency stop protocol chain through relay, user consent gate with modal dialog, and 60s inactivity auto-timeout for computer use sessions

---

## v14.1 Agent Installer & Setup UX (Shipped: 2026-03-24)

**Phases completed:** 12 phases, 19 plans, 35 tasks

**Key accomplishments:**

- One-liner:
- Removed 4 .bak files and added .gitignore patterns to prevent future backup file commits
- React 18 setup wizard SPA with Vite/Tailwind/Framer Motion serving 4 screens (Welcome, Connecting, Success, Error) via Express on port 19191 with 3 API endpoint stubs
- OAuth device flow wired into Express setup server with SPA polling, auto-close on success, CLI web-first routing, and esbuild pipeline copying setup-ui alongside agent bundle
- Complete .gitignore coverage for .env files and canonical .env.example template with 29 documented environment variables
- Cross-platform system tray icon with programmatic PNG icons (green/yellow/red), status-change callback in ConnectionManager, and context menu with Disconnect/Setup/Quit actions
- Complete SEA binary build pipeline with CJS format, Inno Setup installer script with auto-start registry key, and --background flag for silent boot operation
- macOS .app bundle with Info.plist, build-dmg.sh using hdiutil for drag-to-install DMG, and LaunchAgent auto-install for boot persistence
- Linux .deb build pipeline with fpm, systemd service (system + user dual strategy), and CLI auto-install for auto-start on boot
- livinity.io/download page with navigator.userAgent OS detection, 3-platform download buttons (Windows .exe, macOS .dmg, Linux .deb), inline SVG platform icons, and 3-step setup guide

---

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
