# v31.0 Requirements — "Liv Agent Reborn"

**Source:** `.planning/v31-DRAFT.md` (851-line plan, 12 phases P64-P76, comprehensive file-level breakdown drafted with user 2026-05-04)
**Sources of UI/UX patterns:** Suna (kortix-ai/suna preserved fork) — UI patterns ONLY. Bytebot (bytebot-ai/bytebot, archived 2026-03-07, Apache 2.0) — desktop image + 16 tool schemas + system prompt only.
**UI scope guard:** ONLY Suna UI patterns. NO Hermes UI patterns (per user direction 2026-05-04).
**Effort estimate:** 171-229 hours (6-12 weeks solo at 4-6h/day).

---

## Hard Constraints (carry from v30.0)

- **D-NO-BYOK** — Subscription-only, no Anthropic API key path
- **BROKER_FORCE_ROOT_HOME** — Use `/root/.claude/.credentials.json` for subscription auth
- **D-NO-SERVER4** — Mini PC + Server5 are the only deploy targets
- **Sacred file constraint RETIRED** — `nexus/packages/core/src/sdk-agent-runner.ts` was actively developed under v29-v30; current SHA `9f1562be...`. Phase 65 Liv rename will functionally verify subscription path post-rename.
- **Side panel auto-open behavior** — ONLY for `browser-*` and `computer-use-*` tool patterns (Suna behavior, user direction 2026-05-04)

---

## v1 Requirements

### CARRY (Phase 64 — v30.5 Final Cleanup at v31 Entry)

- [ ] **CARRY-01**: F7 Suna sandbox network blocker resolved (manual `docker network connect` test on Mini PC, then permanent fix via `KORTIX_SANDBOX_URL=http://host.docker.internal:14000` env override OR `extra_hosts`)
- [ ] **CARRY-02**: 14 carryforward UATs from v29.3-v29.5 walked on Mini PC (4 v29.5 + 4 v29.4 + 6 v29.3)
- [ ] **CARRY-03**: Phase 63's 11 plan walks completed (formal mandatory live verification)
- [ ] **CARRY-04**: 3 v28.0 hot-patch quick-tasks resolved or archived to backlog (260425-sfg / 260425-v1s / 260425-x6q)
- [x] **CARRY-05
**: External client compat matrix UAT — Bolt.diy + Cursor + Cline + Continue.dev + Open WebUI live walkthrough each documented

### RENAME (Phase 65 — Liv Rename Foundation)

- [ ] **RENAME-01**: `nexus/` directory → `liv/` via `git mv`
- [ ] **RENAME-02**: All `@nexus/*` npm scope → `@liv/*` (6 package.json files + ~100 import statements)
- [ ] **RENAME-03**: All `NEXUS_*` env vars → `LIV_*` (consolidate with existing LIV_BASE_DIR pattern)
- [ ] **RENAME-04**: All `nexus:*` Redis key prefixes → `liv:*` (5 occurrences, all docs per scope analysis)
- [ ] **RENAME-05**: All "Nexus" user-visible strings → "Liv" in UI components, error messages, log lines
- [ ] **RENAME-06**: `update.sh` paths `/opt/nexus/` → `/opt/liv/` (20 occurrences)
- [ ] **RENAME-07**: `livos/install.sh` env var references updated (26 occurrences)
- [ ] **RENAME-08**: `.github/workflows/deploy.yml` updated (8 occurrences)
- [ ] **RENAME-09**: Mini PC migration script (`scripts/migrate-nexus-to-liv.sh`) executes atomic move + symlink fallback
- [ ] **RENAME-10**: Mini PC `/opt/nexus/` → `/opt/liv/` migration verified, all 4 systemd services green
- [ ] **RENAME-11**: Smoke test: `curl https://bruce.livinity.io/api/agent/stream -d '{"task":"hello"}'` returns SSE
- [ ] **RENAME-12**: Subscription Claude responds via `/v1/messages` post-rename (sacred file functional verification)
- [ ] **RENAME-13**: All `.planning/*.md`, `CLAUDE.md`, `README.md` updated; memory files updated

### DESIGN (Phase 66 — Liv Design System v1)

- [ ] **DESIGN-01**: Color tokens at `livos/packages/ui/src/styles/liv-tokens.css` — Liv signature palette (deep navy + cyan accent + amber reasoning glow + violet MCP, plus emerald/rose status colors)
- [ ] **DESIGN-02**: Motion primitives at `livos/packages/ui/src/components/motion/` — `<FadeIn>`, `<GlowPulse>`, `<SlideInPanel>`, `<TypewriterCaret>`, `<StaggerList>`
- [ ] **DESIGN-03**: Typography scale (Inter Variable for display/body, JetBrains Mono for code)
- [ ] **DESIGN-04**: Glassmorphism + grain utility classes (`.liv-glass`, `.liv-grain`, `.liv-glow-amber`)
- [x] **DESIGN-05
**: Tabler icon mapping at `livos/packages/ui/src/icons/liv-icons.ts` (every tool category → Tabler icon)
- [x] **DESIGN-06
**: Shadcn liv-* variants (`<Button variant="liv-primary">`, `<Card variant="liv-elevated">`, `<Badge variant="liv-status-running">`, `<Slider className="liv-slider">`)
- [ ] **DESIGN-07**: Storybook/playground page demonstrates every token, motion, variant in one place

### CORE (Phase 67 — Liv Agent Core Rebuild)

- [x] **CORE-01
**: `liv/packages/core/src/run-store.ts` (NEW) — Redis-backed `RunStore` class with `createRun / appendChunk / getChunks / subscribeChunks / markComplete / markError`
- [x] **CORE-02
**: Redis schema `liv:agent_run:{runId}:{meta,chunks,control}` + Pub/Sub `liv:agent_run:{runId}:tail` with 24h TTL
- [ ] **CORE-03**: `liv/packages/core/src/liv-agent-runner.ts` (NEW) — wraps SdkAgentRunner; emits reasoning chunks, tool snapshots, computer-use tool routing, context manager hook
- [ ] **CORE-04**: `livos/packages/livinityd/source/modules/ai/sse-endpoint.ts` (NEW) — Express SSE handler at `GET /api/agent/runs/:runId/stream` with reconnect support via `?after=`
- [ ] **CORE-05**: `POST /api/agent/start` queues to BullMQ, returns `{runId}` immediately
- [ ] **CORE-06**: Frontend `livos/packages/ui/src/lib/use-liv-agent-stream.ts` hook with SSE reconnect (exponential backoff 1s/2s/4s/8s)
- [x] **CORE-07
**: Browser refresh mid-run → SSE catches up from last chunk; tool snapshots arrive paired (assistantCall + toolResult); reasoning chunks distinguished from text

### PANEL (Phase 68 — Side Panel + Tool View Dispatcher)

- [x] **PANEL-01
**: `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx` (NEW, ~300 LOC port of Suna ToolCallSidePanel) — fixed overlay `inset-y-0 right-0 z-30`, responsive widths
- [x] **PANEL-02
**: Live/Manual mode state machine; "Jump to Live" pulse pill (cyan glow) when manual + running; "Jump to Latest" when manual + idle
- [x] **PANEL-03
**: Step counter ("Step 3 of 7") via completedSnapshots filtering; slider navigation (shadcn Slider, liv-slider variant)
- [ ] **PANEL-04**: Cmd+I keyboard shortcut closes panel; listens for `liv-sidebar-toggled` event to auto-close on sidebar expand
- [ ] **PANEL-05**: `livos/packages/ui/src/routes/ai-chat/tool-views/index.tsx` (NEW) — `getToolView(toolName)` switch dispatcher with `GenericToolView` fallback
- [ ] **PANEL-06**: `livos/packages/ui/src/store/liv-chat-store.ts` (NEW Zustand) — state + actions + `appendSnapshot` auto-open logic for visual tools
- [ ] **PANEL-07**: Auto-open behavior — Side panel auto-opens ONLY when tool name matches `/^(browser-|computer-use-|screenshot)/`; non-visual tools (shell/file/web-search/MCP) render inline ONLY
- [ ] **PANEL-08**: Manual open works for all tool categories (click tool badge → open panel at that snapshot)
- [ ] **PANEL-09**: User-closed panel re-opens automatically with new visual tool snapshot
- [ ] **PANEL-10**: Mobile portrait → panel full-width on click

### VIEWS (Phase 69 — Per-Tool Views Suite)

- [ ] **VIEWS-01**: `livos/packages/ui/src/routes/ai-chat/components/liv-tool-row.tsx` (NEW, ~120 LOC) — Suna inline tool pill pattern, status dot + label + elapsed timer + chevron
- [ ] **VIEWS-02**: `BrowserToolView.tsx` — two modes: live VNC iframe (when computer-use category, react-vnc embed), static screenshot (multi-strategy parser: JSON.content → regex `ToolResult(output='...')` → image_url → fallback messages[])
- [ ] **VIEWS-03**: `CommandToolView.tsx` — terminal-style dark bg, command at top, output streaming with caret, exit code badge in footer
- [ ] **VIEWS-04**: `FileOperationToolView.tsx` — file icon + path header, operation type badge, content with shiki syntax highlighting
- [ ] **VIEWS-05**: `StrReplaceToolView.tsx` — inline diff with generic 12-line `colorizeDiff` util in `tool-views/utils.ts` (+lines emerald, -lines rose)
- [ ] **VIEWS-06**: `WebSearchToolView.tsx` — search query at top, results as cards (favicon + title + URL + snippet)
- [ ] **VIEWS-07**: `WebCrawlToolView.tsx` — crawl target URL header, progress (pages/depth), result tree
- [ ] **VIEWS-08**: `WebScrapeToolView.tsx` — URL + scraped content (markdown rendered) + extracted images gallery
- [ ] **VIEWS-09**: `McpToolView.tsx` — MCP server name badge + tool name + JSON args + content rendered via mcp-content-renderer
- [ ] **VIEWS-10**: `GenericToolView.tsx` — raw JSON formatted with collapse for nested objects, fallback for unknown tools
- [ ] **VIEWS-11**: `tool-views/utils.ts` — `getToolView`, `getToolIcon`, `getUserFriendlyToolName`, `colorizeDiff`, `extractScreenshot`, `isVisualTool` (used by PANEL-07 auto-open)

### COMPOSER (Phase 70 — Composer + Streaming UX Polish)

- [ ] **COMPOSER-01**: `livos/packages/ui/src/routes/ai-chat/liv-composer.tsx` (NEW, ~400 LOC, replaces chat-input.tsx) — auto-grow textarea (24px → 200px Suna pattern)
- [ ] **COMPOSER-02**: Stop button color toggle red↔cyan with icon Square↔ArrowUp; file attachment (drag-drop + click + paste from clipboard); file preview chips
- [ ] **COMPOSER-03**: Slash command menu expanded — `/clear`, `/think`, `/computer`, `/agent <name>`, `/file <path>`, `/skill <name>`
- [ ] **COMPOSER-04**: Mention menu (`@`) for agents, MCP tools, skills; voice input button (port voice-button.tsx, polish UX); model badge inline
- [ ] **COMPOSER-05**: `liv-streaming-text.tsx` — react-markdown + remark-gfm renderer with CSS-only blinking caret on last text block
- [ ] **COMPOSER-06**: Code blocks with shiki syntax highlighting + copy button on hover; mermaid diagram inline support
- [ ] **COMPOSER-07**: `liv-agent-status.tsx` — states (idle/listening/thinking/executing/responding/error) with distinct icon + animation + accent color
- [ ] **COMPOSER-08**: `liv-typing-dots.tsx` — Suna dots animation (`'' → '.' → '..' → '...'` at 500ms) while waiting for first token
- [ ] **COMPOSER-09**: Welcome screen — animated greeting time-of-day adaptive, suggestion cards (3-4 starter prompts), recent conversations strip, slash command hint floating

### CU-FOUND (Phase 71 — Computer Use Foundation)

- [ ] **CU-FOUND-01**: Bytebot desktop catalog entry in `builtin-apps.ts` — image `ghcr.io/bytebot-ai/bytebot-desktop:edge`, port range 14100+, `--privileged`, `shm_size: 2g`, `RESOLUTION=1280x960`, `DISPLAY=:0`
- [ ] **CU-FOUND-02**: App gateway auth middleware for desktop subdomain — validates JWT session + active computer-use task, exposes only `/computer-use`, `/websockify`, `/screenshot` endpoints
- [ ] **CU-FOUND-03**: react-vnc dependency added; `liv-vnc-screen.tsx` wrapper with loading state, error fallback, scale-to-fit, fullscreen button, takeover indicator
- [ ] **CU-FOUND-04**: WebSocket URL pattern `wss://desktop.bruce.livinity.io/websockify?token=<session-token>`
- [ ] **CU-FOUND-05**: Standalone computer-use route at `/computer` for direct desktop access (bonus)
- [ ] **CU-FOUND-06**: `container-manager.ts` — `ensureContainer(userId)`, `stopContainer(userId)`, `getStatus(userId)`; spawn on first computer-use tool call; 30-min idle timeout; max 1 active container per user
- [ ] **CU-FOUND-07**: User triggers "/computer start" → container spawns within 15s; VNC iframe loads showing XFCE desktop; user can take over mouse (viewOnly=false)

### CU-LOOP (Phase 72 — Computer Use Agent Loop)

- [ ] **CU-LOOP-01**: `liv/packages/computer-use/src/bytebot-tools.ts` — verbatim copy of 16 Bytebot tool schemas from `agent.tools.ts` (screenshot, click_mouse, move_mouse, drag_mouse, scroll, type_text, press_keys, wait, application, read_file, write_file, cursor_position, paste_text, cua_command, set_task_status, etc.)
- [ ] **CU-LOOP-02**: `liv/packages/computer-use/src/bytebot-bridge.ts` — `BytebotBridge` class wrapping bytebotd HTTP API; POST to `http://localhost:${userPort}/computer-use {action, ...params}`; capture screenshot after action with 750ms settle delay
- [ ] **CU-LOOP-03**: `liv/packages/computer-use/src/system-prompt.ts` — verbatim port of Bytebot system prompt (1280x960 coordinate space, screenshot-before-act, 3-retry NEEDS_HELP, "Liv" branding)
- [ ] **CU-LOOP-04**: `liv-agent-runner.ts` modified — detect computer-use task, route `computer_use_*` tool calls to `BytebotBridge.executeAction`, inject computer-use system prompt addendum, track NEEDS_HELP state
- [ ] **CU-LOOP-05**: `liv-needs-help-card.tsx` (NEW) — when agent emits `set_task_status({status: 'NEEDS_HELP', message})`, side panel shows banner with "Take over" / "Provide guidance" / "Cancel task" buttons; user takeover pauses agent, returns control button
- [ ] **CU-LOOP-06**: BYTEBOT_LLM_PROXY_URL routing wired through Livinity broker → Kimi (no Bytebot agent code used)
- [ ] **CU-LOOP-07**: End-to-end test: "navigate to google.com and search 'weather'" → side panel auto-opens with BrowserToolView in live mode, VNC iframe shows agent actions, screenshots captured per step

### RELIAB (Phase 73 — Reliability Layer)

- [ ] **RELIAB-01**: `liv/packages/core/src/context-manager.ts` — token counting + 75% Kimi window threshold summarization (~150k of 200k); summarize oldest N messages via cheap Kimi call; persist summary checkpoint in Redis
- [ ] **RELIAB-02**: `liv/packages/core/src/queue/agent-queue.ts` — BullMQ queue `liv:agent-jobs`; per-user concurrency 1, global N; job data `{runId, userId, task, conversationHistory}`
- [ ] **RELIAB-03**: `run-store.ts` extended with `pauseRun`, `resumeRun`, `forkRun`, `editMessage`
- [ ] **RELIAB-04**: Frontend `use-liv-agent-stream.ts` reconnection with exponential backoff + UI banner "Reconnecting..."
- [ ] **RELIAB-05**: Per-user resource limits (max 3 concurrent runs, 60min max duration, 500k max tokens per run) enforced in BullMQ worker + run-store
- [ ] **RELIAB-06**: 3-hour agent run survives without context overflow error; browser refresh mid-run catches up; Stop button terminates within 1 iteration; Pause+Resume continues from exact state

### BROKER-CARRY (Phase 74 — F2-F5 Carryover from v30.5)

- [x] **BROKER-CARRY-01
 (F2)**: Token-level streaming cadence — `liv/packages/core/src/providers/kimi.ts` SSE parser streams tokens as Kimi emits, debounce ~50ms client-side
- [ ] **BROKER-CARRY-02 (F3)**: Multi-turn tool_result protocol — assistant `tool_calls[].id` consistently matches `tool.tool_call_id` in next turn; validation in liv-agent-runner adapter layer
- [ ] **BROKER-CARRY-03 (F4)**: Caddy proxy timeout for long agentic — Mini PC Caddyfile config block for `/api/agent/runs/*` with `transport http { read_timeout 30m write_timeout 30m }`
- [x] **BROKER-CARRY-04
 (F5)**: Identity preservation — inject identity line in every system prompt: "You are Liv Agent, powered by Kimi-for-coding. Today is [date]."
- [x] **BROKER-CARRY-05
**: Verification — token cadence visible word-by-word; long tool chains no `tool_use_id mismatch` errors; 10min agent run no Caddy 504 timeouts; "who are you?" returns consistent "Liv Agent powered by Kimi"

### MEM (Phase 75 — Reasoning Cards + Lightweight Memory)

- [ ] **MEM-01**: `liv-reasoning-card.tsx` — collapsible card (default collapsed) with amber glow icon + "Liv is thinking..." (streaming) or "Reasoning" (done) + duration
- [ ] **MEM-02**: GlowPulse motion primitive (P66) animates card while streaming; Markdown-rendered reasoning_content body
- [ ] **MEM-03**: liv-agent-runner extracts Kimi `reasoning_content` field, emits `chunk.type='reasoning'`; chat-messages renders via `<LivReasoningCard>`
- [ ] **MEM-04**: PostgreSQL `messages` table `tsvector` column + GIN index + backfill migration
- [ ] **MEM-05**: API `GET /api/conversations/search?q=<query>` returns matching messages with snippets
- [ ] **MEM-06**: Sessions sidebar search input (debounced 300ms) with HighlightedText snippet rendering
- [ ] **MEM-07**: Pinned messages — right-click or hover menu pin; pinned auto-injected into agent context system prompt; "Pinned" sidebar section
- [ ] **MEM-08**: Conversation export as Markdown / JSON / PDF (bonus)

### MARKET (Phase 76 — Agent Marketplace + Onboarding Tour)

- [ ] **MARKET-01**: `livos/packages/ui/src/routes/marketplace/agents/index.tsx` — grid layout 2/3/4 cols by breakpoint, cards (emoji avatar + name + 2-line description + tag chips + clone count + "Add to Library" button)
- [ ] **MARKET-02**: Filter by tags (Coding/Research/Computer Use/etc.); sort (newest/popular/most-cloned); pagination 20/page
- [ ] **MARKET-03**: PostgreSQL `agent_templates` table (slug, name, description, system_prompt, tools_enabled, tags, clone_count, created_at)
- [ ] **MARKET-04**: 8-10 seed agent templates (General Assistant, Code Reviewer, Researcher, Computer Operator, MCP Manager, etc.)
- [ ] **MARKET-05**: API `GET /api/agent-templates`, `POST /api/agent-templates/:slug/clone`; clone creates entry in existing `user_agents` table with copy of template config
- [ ] **MARKET-06**: `liv-tour.tsx` first-run interactive tour (9 steps: welcome → composer → slash hint → agent picker → demo task → side panel → reasoning card → marketplace → done); skippable, replayable from settings
- [ ] **MARKET-07**: Settings "Liv Agent" section — model picker, tool permissions, computer use toggle, idle timeout slider, reasoning visibility toggle, replay onboarding tour button

---

## Definition of Done — v31 Ships When

- [ ] All 13 phases (P64-P76) closed with VERIFICATION.md
- [ ] No "Nexus" string in source (allowed: archived planning docs)
- [ ] WOW test: external observer sees ai-chat for first time, comments on visual quality unprompted
- [ ] Computer use end-to-end: "search youtube for cat videos and play one" → works
- [ ] Side panel auto-open verified — visual tools (browser-*/computer-use-*) trigger auto-open; non-visual tools do NOT auto-open but are clickable
- [ ] All Suna UI patterns ported (side panel + tool view registry + browser view + composer auto-grow + marketplace + inline tool pills)
- [ ] All Bytebot artifacts integrated (desktop image + 16 tool schemas + system prompt)
- [ ] F2-F5 carryover items closed
- [ ] No regression vs v30.0: subscription path works, broker x-api-key auth works
- [ ] Memory updated to reflect v31 completion + remove stale rules
- [ ] `.planning/v31-MILESTONE-AUDIT.md` written

---

## Future Requirements (deferred to v32+)

- Hermes-style auto-skill-generation (Python pattern, needs adaptation; defer indefinitely)
- Hermes-style messaging gateway (Telegram/Discord/Slack/Signal/Email — partial Telegram already exists from v2.0)
- Multi-tenant computer use (>1 user per Mini PC)
- Browser-only computer use mode (full desktop only in v31)
- BackgroundJob worker for screenshot post-processing
- VNC quality settings UI
- Computer-use task scheduling (cron-style for Liv computer tasks)

## Out of Scope (v31)

- **Hermes UI patterns** — explicitly excluded per user direction 2026-05-04
- **Bytebot agent code** (NestJS service) — only desktop image + tool schemas + system prompt copied
- **Bytebot's PostgreSQL schema** — reuse livos pg with `computer_use_tasks` table if needed
- **Bytebot Next.js UI** — embed react-vnc directly into LivOS UI instead
- **Suna's Dramatiq/RabbitMQ** — use existing BullMQ + Redis
- **Replace SdkAgentRunner internals** — wrap, don't rewrite (subscription path is gold)
- **Multi-provider LLM** — D-NO-BYOK preserved; subscription Claude only via existing Livinity broker

---

## Traceability (filled by roadmap)

| REQ-ID | Phase | Status |
|--------|-------|--------|
| (Will be populated by roadmap creation) | | |

---

*Generated: 2026-05-04 — derived from `.planning/v31-DRAFT.md` user-validated 12-phase plan*
