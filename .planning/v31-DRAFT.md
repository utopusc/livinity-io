# v31 — Liv Agent: The "WOW" Milestone

**Codename:** Liv Agent — Reborn
**Replaces:** Nexus brand entirely (cosmetic) + Liv Agent UI/UX (substantive)
**Status:** DRAFT (pending /gsd-new-milestone formal intake)
**Sources:** Suna (Kortix preserved fork — UI/UX), Bytebot (computer use desktop image only)
**UI scope guard:** ONLY Suna UI patterns. NO Hermes UI patterns (per user direction 2026-05-04).
**Prerequisites:** v30.5 closure (F7 sandbox network blocker resolved)

---

## 0. Vision & Success Criteria — "WOOOOOWWWWW"

### What user must feel on first open
1. **Kapı açar açmaz görsel etki** — color tokens, motion language, micro-interactions öyle olmalı ki "bu ChatGPT clone değil" hissi ilk 2 saniyede gelsin
2. **Mesaj attığım anda hayata gelmeli** — typing indicator, reasoning card açılışı, tool call snapshot'lar akarken canlı feedback
3. **Tool call'lar gizemli değil, gösteri olmalı** — sağ panelde live VNC iframe, browser action'ları gerçek zamanlı, dosya diff'leri renkli
4. **Computer use bir spectacle** — agent "ekrana baktığını" göstermeli, screenshot'lar fade-in, action overlay (click ringi, type cursor)
5. **Reasoning şeffaf** — Kimi `reasoning_content` collapsible gold card olarak görünmeli, kullanıcı "neden" diye sormak zorunda kalmamalı
6. **Hata bile estetik** — error state'ler kırmızı çığlık değil, anlamlı animation + recovery affordance

### Falsifiable success criteria
- [ ] User signs in → ai-chat route → first 5s shows: animated welcome, agent status badge pulse, slash command hint floating, theme reveal animation
- [ ] User sends "navigate to google.com and screenshot" → side panel opens with smooth slide-in, live VNC visible within 3s, screenshot captured + displayed in step counter
- [ ] User opens any past tool call → manual mode, slider navigation, "Jump to Live" pill if agent still running
- [ ] User sees Kimi reasoning expanded → gold-themed Section component, Markdown rendered with caret animation if streaming
- [ ] User imports an existing Suna agent template → marketplace UI, clone-to-library button, agent appears in own list
- [ ] All tools (shell/file/browser/web-search/MCP) render with distinct view component, status badges, expand/collapse working
- [ ] Computer use container spawns on-demand per session, 30-min idle timeout, react-vnc embedded with viewOnly=false (user takeover works)
- [ ] Long agentic run survives page reload — Redis SSE relay reconnects, user sees catch-up
- [ ] Context auto-summarizes at 75% Kimi window
- [ ] All "Nexus" strings replaced with "Liv" — UI, code, paths, services, env vars

---

## 1. Architecture Decisions (locked before phase work begins)

### A. Liv Core (replaces Nexus core)
- **Path:** `liv/packages/core/src/` (was `nexus/packages/core/src/`)
- **Agent runtime:** Keep SdkAgentRunner pattern (subscription Claude via /root creds), add new `LivAgentRunner` orchestrator that wraps it with: side panel data shape, reasoning extraction, computer use tool routing, context manager hook
- **Streaming wire protocol:** Switch from direct WS to **Redis-as-SSE-relay** (Suna pattern) — agent run identified by UUID, chunks RPUSH'd to `liv:agent_run:{id}:chunks`, 24h TTL, client SSE reads + Pub/Sub for live tail
- **Tool call data model:** New `ToolCallSnapshot` interface matching Suna's `ToolCallInput` (assistantCall + toolResult + isSuccess + isStreaming sentinel)

### B. Liv UI (overhaul)
- **Path:** `livos/packages/ui/src/routes/ai-chat/` (kept; this is correct location)
- **State management:** Move from useReducer-only to **Zustand store** (`useLivChatStore`) for: messages, toolCallSnapshots, agentStatus, sidePanelState, computerUseState. tRPC for fetches, WS/SSE for streams, Zustand as the single source.
- **Layout shift:** Current split-pane → **fixed overlay side panel** (Suna pattern). Chat column doesn't resize, side panel slides in/out as `fixed inset-y-0 right-0 z-30`.
- **Design system:** New `liv-ds` color tokens, motion primitives, typography scale. Suna's shadcn + zinc palette as visual base, evolved into Liv brand identity (deep navy + cyan accent + amber reasoning glow).
- **Icons:** Stay on Tabler (`@tabler/icons-react`). Map every Suna Lucide reference → Tabler equivalent in component port.

### C. Computer Use (Bytebot-derived)
- **Image source:** `ghcr.io/bytebot-ai/bytebot-desktop:edge` (Apache 2.0)
- **Catalog entry:** Add to livinity-apps as `bytebot-desktop` manifest, port range 14100+ (avoid Suna's 13737-13739 range)
- **Bridge service:** New `liv/packages/computer-use/` — TypeScript module inside livinityd. NO separate NestJS service.
- **LLM routing:** Bytebot ProxyService pattern — `BYTEBOT_LLM_PROXY_URL=http://localhost:3200/v1` → existing Livinity broker → Kimi (no Bytebot agent code, just bytebotd HTTP daemon)
- **VNC display:** `react-vnc` (3KB) embedded in `BrowserToolView` when tool is computer-use; viewOnly=false for user takeover
- **Per-session container:** Spawn on first computer-use tool call; 30-min idle timeout via cron; max 1 container per user (subscribe to user_app_instances pattern)

### D. Naming Convention
- npm scope: `@nexus/*` → `@liv/*`
- env vars: `NEXUS_*` → `LIV_*` (consolidate)
- Redis keys: `nexus:*` → `liv:*` (no active runtime keys with nexus prefix per scope analysis)
- Filesystem: `nexus/` → `liv/` (git mv); `/opt/nexus/` → `/opt/liv/` (Mini PC migration)
- systemd: `liv-core.service`, `liv-worker.service`, `liv-memory.service` (already Liv-prefix ✓)
- Brand: "Nexus Agent" → "Liv Agent"; "Nexus" → "Liv" everywhere user-visible

### E. What we will NOT do (scope guards)
- ❌ **ANY Hermes UI pattern** (user direction 2026-05-04 — UI inspiration ONLY from Suna)
- ❌ Hermes' Python skill auto-generation (defer indefinitely)
- ❌ Hermes' messaging gateway (Telegram/Discord/Slack/Signal/Email) — defer v32+; partial Telegram already exists
- ❌ Bytebot agent code (use only desktop image)
- ❌ Bytebot's PostgreSQL schema (reuse livos pg with `computer_use_tasks` table)
- ❌ Bytebot Next.js UI (embed react-vnc directly into LivOS UI instead)
- ❌ Multi-tenant computer use (single user per Mini PC)
- ❌ Suna's Dramatiq/RabbitMQ (use BullMQ — already have Redis)
- ❌ Replace SdkAgentRunner internals (subscription path is gold; wrap, don't rewrite)

---

## 2. Phase Breakdown — 12 Phases

```
P64: v30.5 Closure (prerequisite, NOT v31)
P65 v31-Phase1:  Liv Rename + Foundation Cleanup
P66 v31-Phase2:  Liv Design System v1 (the WOW visual base)
P67 v31-Phase3:  Liv Agent Core Rebuild (SSE relay + ToolCallSnapshot model)
P68 v31-Phase4:  Side Panel + Tool View Dispatcher (Suna)
P69 v31-Phase5:  Per-Tool Views Suite (Suna 14-component port, Hermes ToolCall row pattern)
P70 v31-Phase6:  Composer + Streaming UX Polish (Hermes streaming caret, dots, auto-grow)
P71 v31-Phase7:  Computer Use Foundation (Bytebot image + react-vnc + app gateway auth)
P72 v31-Phase8:  Computer Use Agent Loop (bytebotd bridge + 16 tools + system prompt + NEEDS_HELP)
P73 v31-Phase9:  Reliability Layer (ContextManager + BullMQ queue + reconnectable runs)
P74 v31-Phase10: F2-F5 Carryover from v30.5 (token cadence, tool_result protocol, Caddy timeout, identity)
P75 v31-Phase11: Reasoning Cards + Lightweight Memory (Hermes patterns, NO skill auto-gen)
P76 v31-Phase12: Agent Marketplace + Onboarding Tour (Suna marketplace adapted, first-run WOW)
```

---

## P64: v30.5 Closure (prerequisite)

**Goal:** Resolve F7 Suna sandbox network blocker, audit v30.5, archive milestone.

**Blocker recap:** kortix-api (network `suna_default`) cannot reach kortix-sandbox (default bridge). 3 fix candidates from memory.

**Recommendation:** Try fix candidate (1) first — manual `docker network connect suna_default kortix-sandbox` on Mini PC. If theory confirmed:
- Engineer permanent fix as **(3) env override**: `KORTIX_SANDBOX_URL=http://host.docker.internal:14000` in compose, sidesteps Docker DNS entirely. Lower risk than patching Suna source.
- If host.docker.internal unavailable on Linux, fall back to **(2) source patch** in kortix-api Docker spawn config.

**Deliverables:**
- Sandbox network fix committed + Mini PC redeployed
- "Navigate to google.com" smoke test passes via Suna UI
- `.planning/milestones/v30.5-MILESTONE-AUDIT.md` written
- F2-F5 explicitly tagged as carryover to v31 (not failed)

**Estimate:** 1-3 hours (mostly verification, fix is small)

---

## P65 — Phase 1: Liv Rename + Foundation Cleanup

**Goal:** Project-wide cosmetic rename Nexus → Liv. Mechanical, high blast radius, must be atomic.

### Pre-flight
- Create branch `liv-rename` from master
- Snapshot current systemd state on Mini PC (`systemctl list-units --type=service | grep -E 'liv|nexus'`)
- Snapshot `/opt/nexus/` and `/opt/livos/` directories on Mini PC (rsync to backup path)
- Verify update.sh current behavior (dry-run)
- Document Redis runtime keys: `redis-cli --scan --pattern 'nexus:*'` (expected: empty per scope analysis)

### Tasks
1. **Code rename pass** (find/replace with manual review)
   - `nexus/` directory → `liv/` (`git mv nexus liv`)
   - `@nexus/*` → `@liv/*` in all package.json (6 files) + every import statement (~100)
   - `nexus.` Redis key prefix in source → `liv.` (5 occurrences, all docs per scope)
   - `NEXUS_*` env vars → `LIV_*` (consolidate with existing LIV_BASE_DIR pattern)
   - `Nexus Agent` user-visible strings → `Liv Agent`
   - `Nexus` in error messages, log lines, comments → `Liv`
2. **Build/deploy script updates**
   - `update.sh`: 20 occurrences of `/opt/nexus` → `/opt/liv`
   - `update.sh`: build commands (`pnpm --filter @liv/...`)
   - `livos/install.sh`: 26 env var references
   - `.github/workflows/deploy.yml`: 8 occurrences
3. **Mini PC migration script**
   - `scripts/migrate-nexus-to-liv.sh` — atomic move + symlink fallback for grace period
   - Steps: stop liv-* services → rsync `/opt/nexus/` to `/opt/liv/` → update systemd unit `WorkingDirectory` paths → reload daemon → start liv-* → smoke test → on success, archive `/opt/nexus/` → `/opt/nexus.archived-2026-XX-XX/`
4. **Functional verification**
   - `pnpm install` clean from root
   - `pnpm build` for all packages
   - livinityd starts, agent stream responds
   - SDK agent runner verified working (no subscription path regression)
5. **Documentation update**
   - `.planning/STATE.md` reflects rename
   - All `.planning/v*.md` updated (find/replace ok)
   - `CLAUDE.md`, `README.md` updated
   - Memory files: replace `@nexus/*` mentions with `@liv/*`

### Files most affected (top 5)
- `livos/packages/livinityd/source/modules/ai/routes.ts` (259 occurrences)
- `liv/packages/core/src/api.ts` (54)
- `liv/packages/core/src/daemon.ts` (41)
- `liv/packages/core/src/config/manager.ts` (40)
- `liv/packages/cli/src/commands/setup.ts` (35)

### Verification
- `git grep -i "nexus" liv/ livos/` returns 0 (allowed: archived planning docs)
- All systemd units green
- Smoke test: `curl https://bruce.livinity.io/api/agent/stream -d '{"task":"hello"}'` returns SSE
- Sacred file functional: subscription Claude responds via /v1/messages

### Rollback
- Git: `git checkout master && git branch -D liv-rename`
- Mini PC: revert systemd units, mv `/opt/nexus.bak.*` back, restart services
- Time-to-rollback target: < 10 min

### Blast radius
**HIGH** — every running service touched. Do this in single PR, single deploy window, single 2-hour focus session. NOT in autonomous mode.

### Estimate
6-10 hours focused work + 2 hours Mini PC migration window.

---

## P66 — Phase 2: Liv Design System v1 (the WOW visual base)

**Goal:** Establish visual identity that produces the "WOW" reaction. Tokens, motion language, typography, glow primitives, icon language.

### Why this is Phase 2 (not later)
Every subsequent UI phase consumes these tokens. Building tool views, side panel, composer on shadcn-default looks generic. Investing in design system once = every later phase looks distinct.

### Deliverables

#### 2.1 Color tokens (`livos/packages/ui/src/styles/liv-tokens.css`)
Hermes-inspired but Liv-branded:
```css
:root {
  /* Surface system */
  --liv-bg-deep:      #050b14;   /* deepest, full background */
  --liv-bg-elevated:  #0a1525;   /* cards, panels */
  --liv-bg-glass:     rgba(20, 30, 50, 0.6); /* overlay glass */
  --liv-border-subtle: rgba(120, 180, 255, 0.08);

  /* Text */
  --liv-text-primary:   #e8f0ff;
  --liv-text-secondary: #a8b8cc;
  --liv-text-tertiary:  #6b7a8f;

  /* Accent — Liv signature glow */
  --liv-accent-cyan:   #4dd0e1;   /* primary action */
  --liv-accent-amber:  #ffbd38;   /* reasoning/thinking glow */
  --liv-accent-violet: #a78bfa;   /* MCP/extensions */
  --liv-accent-emerald: #4ade80;  /* success */
  --liv-accent-rose:   #fb7185;   /* error */

  /* Motion durations */
  --liv-dur-instant: 100ms;
  --liv-dur-fast:    200ms;
  --liv-dur-normal:  350ms;
  --liv-dur-slow:    600ms;

  /* Easing — bespoke, not stock */
  --liv-ease-out:     cubic-bezier(0.16, 1, 0.3, 1);    /* "wow" entrance */
  --liv-ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1); /* slight overshoot */
}
```

#### 2.2 Motion primitives (`livos/packages/ui/src/components/motion/`)
- `<FadeIn delay={0} y={8}>` — Framer Motion entrance for cards
- `<GlowPulse color="amber">` — wraps child with breathing glow (used for reasoning, agent thinking)
- `<SlideInPanel from="right">` — side panel entrance
- `<TypewriterCaret />` — port of Hermes StreamingCaret, anchored to last block
- `<StaggerList>` — children appear with 50ms staggered delay

#### 2.3 Typography
- Display: `Inter Variable` 600 weight for headings
- Body: `Inter Variable` 400, optical-sizing auto
- Mono: `JetBrains Mono` for code/tool input/diff
- Scale: `text-display-1` (48px), `text-display-2` (36px), `text-h1` (24px), `text-body` (15px), `text-caption` (12px), `text-mono-sm` (13px)

#### 2.4 Glassmorphism + grain (Hermes pattern, polished)
- `.liv-glass`: `backdrop-filter: blur(12px) saturate(1.2)` + `bg-glass` token
- `.liv-grain`: subtle `repeating-conic-gradient` overlay (Hermes pattern, lower opacity)
- `.liv-glow-amber`: `box-shadow: 0 0 24px rgba(255,189,56,0.2), inset 0 1px 0 rgba(255,189,56,0.1)`

#### 2.5 Icon system migration
- Stay on Tabler. Build `livos/packages/ui/src/icons/liv-icons.ts` mapping every tool category → Tabler icon (replaces ad-hoc imports)
- Map Suna's Lucide refs in port: `MonitorPlay → IconScreenShare`, `Terminal → IconTerminal2`, `Globe → IconWorldSearch`, etc.

#### 2.6 New shadcn variants (`livos/packages/ui/src/components/ui/`)
- `<Button variant="liv-primary">` — cyan accent + glow on hover
- `<Card variant="liv-elevated">` — glass + border-subtle
- `<Badge variant="liv-status-running">` — pulsing dot + cyan
- `<Slider className="liv-slider">` — Suna's customized slider, cyan track

### Verification
- Storybook page (or simple `/playground` route) showing every token, motion, variant in one place
- Side-by-side screenshot vs current `ai-chat/index.tsx` — visible WOW differential
- A/B blink test: show 2 screenshots to user, "which says brand new product?"

### Estimate
8-12 hours including Storybook setup + 2 design iterations

---

## P67 — Phase 3: Liv Agent Core Rebuild

**Goal:** Replace direct WS streaming with Redis-as-SSE-relay. Introduce `ToolCallSnapshot` data model. Wrap SdkAgentRunner with new `LivAgentRunner` orchestrator. Don't touch SDK runner internals.

### Deliverables

#### 3.1 `liv/packages/core/src/run-store.ts` (NEW)
- Class `RunStore` — Redis-backed run lifecycle
- Methods: `createRun(userId, task) → runId`, `appendChunk(runId, chunk)`, `getChunks(runId, fromIndex)`, `subscribeChunks(runId, callback)`, `markComplete(runId, finalResult)`, `markError(runId, error)`
- Redis schema:
  - `liv:agent_run:{runId}:meta` — JSON {userId, task, status, createdAt, completedAt}
  - `liv:agent_run:{runId}:chunks` — Redis List, each entry JSON {idx, type, payload, ts}
  - `liv:agent_run:{runId}:control` — read by loop each iter (stop signal)
  - Pub/Sub channel: `liv:agent_run:{runId}:tail`
- TTL: 24h on all keys

#### 3.2 `liv/packages/core/src/liv-agent-runner.ts` (NEW)
- Wraps SdkAgentRunner
- Adds:
  - Reasoning content extraction (Kimi `reasoning_content` field) → emit as `chunk.type='reasoning'`
  - Tool call snapshot batching: pair assistant tool_use with subsequent tool_result → emit `chunk.type='tool_snapshot'`
  - Computer use tool routing: when tool name matches `computer_use_*`, route to bytebotd bridge instead of native exec
  - Context manager hook: count tokens, trigger summarization at 75%

#### 3.3 `livos/packages/livinityd/source/modules/ai/sse-endpoint.ts` (NEW)
- Express SSE handler at `GET /api/agent/runs/:runId/stream`
- Reads `liv:agent_run:{runId}:chunks` from index ?after= (resume support)
- Subscribes to `liv:agent_run:{runId}:tail` for live tail
- Heartbeat every 15s
- Auth: existing JWT middleware

#### 3.4 `livos/packages/livinityd/source/modules/ai/routes.ts` (MODIFY)
- `POST /api/agent/start` — creates RunStore run, queues to BullMQ (Phase 9), returns `{runId}`
- Existing WS endpoint kept for backward-compat one milestone, then deprecated v32

#### 3.5 Frontend `livos/packages/ui/src/lib/use-liv-agent-stream.ts` (NEW)
- Hook: `const { messages, snapshots, status, sendMessage, stop } = useLivAgentStream({ conversationId })`
- Internal: opens SSE to `/api/agent/runs/{runId}/stream`, reconnects on drop with `?after=lastIdx`
- Returns Zustand store-backed state

### Files affected
- NEW: `liv/packages/core/src/run-store.ts`
- NEW: `liv/packages/core/src/liv-agent-runner.ts`
- NEW: `livos/packages/livinityd/source/modules/ai/sse-endpoint.ts`
- MODIFY: `livos/packages/livinityd/source/modules/ai/routes.ts`
- NEW: `livos/packages/ui/src/lib/use-liv-agent-stream.ts`
- KEEP: `liv/packages/core/src/sdk-agent-runner.ts` (unchanged internals)

### Verification
- Start agent run, kill browser, reopen → SSE catches up from last chunk
- Send `stop` → loop checks control key, terminates within next iter
- Tool snapshots arrive as paired (assistantCall + toolResult) not as separate chunks
- Reasoning chunks distinguished from text chunks in stream

### Estimate
12-16 hours (greenfield code, but well-bounded)

---

## P68 — Phase 4: Side Panel + Tool View Dispatcher

**Goal:** Port Suna's ToolCallSidePanel as `LivToolPanel`. Wire Zustand store. Tool view dispatcher with `GenericToolView` fallback.

**Auto-open behavior (Suna-aligned, user direction 2026-05-04):**
- Panel auto-opens ONLY when agent invokes a **visual** tool: `browser-*`, `computer-use-*`, screenshot tools
- Other tools (shell, file, web-search, MCP) render inline as expandable cards in chat — they do NOT trigger auto-open
- User CAN manually open panel by clicking any tool badge (regardless of category)
- Once open, panel stays open and continues live-mode auto-advance for ALL subsequent tools (not just visual)
- User-closed panel stays closed unless a new visual tool starts (re-opens automatically with that snapshot)

### Deliverables

#### 4.1 `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx` (NEW)
- Port Suna `tool-call-side-panel.tsx` ~300 LOC
- Layout: `fixed inset-y-0 right-0 z-30` overlay (does NOT push chat)
- Width: `w-full md:w-[500px] lg:w-[600px] xl:w-[680px]`
- State: `navigationMode: 'live' | 'manual'`, `internalIndex`, `toolCallSnapshots[]`
- Live mode: auto-advance to latest completed snapshot when agentStatus='running'
- Manual mode: triggered when user navigates to non-tail
- "Jump to Live" pulse pill (cyan + glow) when manual + running
- "Jump to Latest" when manual + idle
- Step counter ("Step 3 of 7") via completedSnapshots filtering
- Slider navigation (shadcn Slider, liv-slider variant)
- Cmd+I to close (Cmd+\\ alt for left-handers — bonus)
- Listens for `liv-sidebar-toggled` event to auto-close on sidebar expand

#### 4.2 `livos/packages/ui/src/routes/ai-chat/tool-views/index.tsx` (NEW)
- Dispatcher: `getToolView(toolName: string): React.FC<ToolViewProps>`
- Switch statement matching Suna pattern
- Returns one of: BrowserToolView, CommandToolView, FileOperationToolView, StrReplaceToolView, WebSearchToolView, WebCrawlToolView, WebScrapeToolView, DataProviderToolView, McpToolView, GenericToolView
- Each component implemented in P69

#### 4.3 `livos/packages/ui/src/routes/ai-chat/tool-views/types.ts` (NEW)
- `ToolViewProps` interface (matches Suna)
- `ToolCallSnapshot` shape

#### 4.4 `livos/packages/ui/src/store/liv-chat-store.ts` (NEW — Zustand)
- State: `messages, snapshots, agentStatus, sidePanelOpen, sidePanelUserClosed, currentSnapshotIdx, navigationMode`
- Actions: `addMessage, appendSnapshot, openPanelAt(idx), navigatePanel(idx), setLiveMode, closePanel`
- Computed: `completedSnapshots`, `displayIndex`, `displayTotalCalls`
- **Auto-open logic** (in `appendSnapshot` action):
  - If new snapshot tool name matches `/^(browser-|computer-use-|screenshot)/` → set `sidePanelOpen=true`, `currentSnapshotIdx=newIdx`
  - This RE-OPENS panel even if user previously closed it (visual tools always demand attention)
  - For non-visual tools: only advance index if `sidePanelOpen` already true (live mode)
- `closePanel` sets both `sidePanelOpen=false` AND `sidePanelUserClosed=true` (sticky until next visual tool)
- Subscribes to `useLivAgentStream` (P67) for incoming chunks

#### 4.5 `livos/packages/ui/src/routes/ai-chat/index.tsx` (MAJOR MODIFY)
- Replace `computer-use-panel.tsx` mount with `<LivToolPanel />`
- Tool call badges in messages dispatch `openPanelAt(idx)` to Zustand
- Layout: chat column flex-1, side panel overlay
- Mobile: panel takes full width, chat hidden when open

### Files affected
- NEW: `livos/packages/ui/src/routes/ai-chat/liv-tool-panel.tsx`
- NEW: `livos/packages/ui/src/routes/ai-chat/tool-views/{index.tsx,types.ts,utils.ts}`
- NEW: `livos/packages/ui/src/store/liv-chat-store.ts`
- MAJOR MODIFY: `livos/packages/ui/src/routes/ai-chat/index.tsx`
- DELETE (eventually): `computer-use-panel.tsx` (replaced by LivToolPanel + BrowserToolView)
- MODIFY: `chat-messages.tsx` — tool badges become clickable, dispatch `openPanelAt`

### Verification
- **Visual tool auto-open:** Agent runs `browser-navigate` → panel slides in automatically, even if user had closed it
- **Non-visual tool no auto-open:** Agent runs `execute-command` → no panel pop; tool renders inline; clicking it opens panel
- Click any tool call in chat → panel slides in, focuses that tool (manual open works for all categories)
- Panel open + agent runs new tools → panel auto-advances (live mode for all)
- Click previous tool → enters manual mode, "Jump to Live" pill appears
- Cmd+I → panel closes smooth, stays closed until next visual tool
- Mobile portrait → panel full-width on click

### Estimate
14-18 hours

---

## P69 — Phase 5: Per-Tool Views Suite

**Goal:** Implement all tool view components. Each visually distinct using Suna's per-tool view pattern. Inline preview rows in chat for non-visual tools (collapsible, click to open panel). Full visual tool views (browser, computer-use) auto-open the side panel.

### Inline preview component (Suna pattern, Liv-styled)

#### 5.1 `livos/packages/ui/src/routes/ai-chat/components/liv-tool-row.tsx` (NEW)
- Suna's inline tool call display, ported and Liv-styled. NO Hermes UI patterns.
- Props: `toolCall: ToolCallSnapshot, onClick: () => void`
- Inline pill style (matches Suna's chat-inline tool badge, not a giant card)
- Status indicator: small dot left of label
  - `running` → cyan pulse dot
  - `done` → emerald static dot
  - `error` → rose static dot
- Label: tool icon (Tabler) + user-friendly tool name (`getUserFriendlyToolName('browser-navigate')` → "Browser Navigate")
- Right side: elapsed timer (Suna pattern, simple `Xs` or `X.Xs` format), chevron arrow indicating clickable
- Hover state: subtle background lift, cursor pointer
- Click → calls `openPanelAt(snapshotIdx)` from Zustand store
- Inline expansion NOT supported (Suna doesn't do this — clicking opens the panel for full detail)
- Visual tool rows (browser-*, computer-use-*) get a subtle cyan accent border to hint they auto-opened the panel

### Side panel views

#### 5.2 `tool-views/BrowserToolView.tsx` (NEW)
- Two modes:
  - **Live + computer-use**: `react-vnc` `<VncScreen url={wsUrl} viewOnly={false} />` — full P71 wiring
  - **Static screenshot**: parse multi-strategy from toolResult content (JSON.content, regex `ToolResult(output='...')`, image_url, fallback messages[])
- URL bar at footer: truncated max-w-[200px]
- Status badge top-right
- Animated progress bar 0→95% during running, jump 100% on complete
- Animated "navigating to https://..." line during browser-navigate

#### 5.3 `tool-views/CommandToolView.tsx` (NEW)
- Terminal-style: dark bg, monospace
- Command at top in muted accent: `$ git status`
- Output below, streaming with Hermes caret
- Exit code badge in footer (0 = green, non-0 = red)

#### 5.4 `tool-views/FileOperationToolView.tsx` (NEW)
- Header: file icon + path
- Operation type badge (Created / Modified / Deleted / Read)
- Body: file content with syntax highlighting (use `shiki` lib, lazy-loaded)
- For Read: show line count, file size

#### 5.5 `tool-views/StrReplaceToolView.tsx` (NEW)
- Inline diff (Suna's str-replace tool view pattern)
- Generic 12-line diff colorizer util in `tool-views/utils.ts` (split by newline, apply color class per +/- prefix)
- File path header
- Stats: "+5 / -2"
- Context lines in muted, + lines emerald, - lines rose

#### 5.6 `tool-views/WebSearchToolView.tsx` (NEW)
- Search query at top in muted
- Results as cards (favicon + title + URL + snippet)
- Click result → opens in new tab

#### 5.7 `tool-views/WebCrawlToolView.tsx` (NEW)
- Crawl target URL header
- Progress: pages crawled / depth
- Result tree (hierarchical)

#### 5.8 `tool-views/WebScrapeToolView.tsx` (NEW)
- URL + scraped content (markdown rendered)
- Extracted images as gallery

#### 5.9 `tool-views/McpToolView.tsx` (NEW)
- MCP server name badge
- Tool name + args (JSON formatted)
- Result rendered via `mcp-content-renderer` (text vs image vs JSON)

#### 5.10 `tool-views/GenericToolView.tsx` (NEW — fallback)
- Raw JSON formatted with collapse for nested objects
- Status badge
- Used for unknown tools

#### 5.11 `tool-views/utils.ts` (NEW)
- `getToolView(name)` switch (Suna's getToolComponent pattern)
- `getToolIcon(name)` → Tabler icon component
- `getUserFriendlyToolName(name)` → "Browser Navigate" from "browser-navigate" (Suna pattern)
- `colorizeDiff(diffText)` → React nodes (generic util, ~12 lines)
- `extractScreenshot(toolResult, messages)` → base64 or URL or null (Suna's multi-strategy parser)
- `isVisualTool(name)` → boolean (returns true for browser-*, computer-use-*, screenshot* — used by P68 auto-open)

### Files affected
- NEW: `liv-tool-row.tsx` (~120 LOC, Suna inline tool pill pattern, Liv-styled)
- NEW: 9 tool-view components (~150-300 LOC each, all Suna-derived)
- NEW: `tool-views/utils.ts`
- MODIFY: `chat-messages.tsx` — replace inline tool render with `<LivToolRow>`

### Verification
- Each tool type renders with distinct view component (visually verifiable)
- Status transitions smooth (running → done with check icon morph)
- Diff rendering correct on str-replace
- Browser tool shows live VNC when computer-use category, static otherwise
- Mobile readable for all 9 views

### Estimate
30-40 hours (largest single phase, can split into 5a/5b if needed)

---

## P70 — Phase 6: Composer + Streaming UX Polish

**Goal:** Transform the input composer into a delightful interaction. Polish streaming feedback. Hermes patterns + Suna composer features.

### Deliverables

#### 6.1 `livos/packages/ui/src/routes/ai-chat/liv-composer.tsx` (NEW, replaces chat-input.tsx)
- Auto-grow textarea (24px → 200px, Suna pattern verbatim)
- Stop button color toggle: red when streaming, cyan otherwise; icon Square ↔ ArrowUp
- File attachment: drag-drop + click + paste (images from clipboard!)
- File preview chips above textarea (filename + size + remove X)
- Slash command menu (port and expand existing 94-line slash-command-menu.tsx):
  - `/clear` — reset conversation
  - `/think` — force reasoning mode
  - `/computer` — start computer use task
  - `/agent <name>` — switch agent
  - `/file <path>` — attach file from filesystem
  - `/skill <name>` — invoke saved skill (P75)
- Mention menu (`@`): mention agents, MCP tools, skills
- Voice input button (port voice-button.tsx, polish UX)
- Model badge inline (shows current Kimi tier; clickable to switch)

#### 6.2 `livos/packages/ui/src/routes/ai-chat/components/liv-streaming-text.tsx` (NEW, replaces streaming-message.tsx)
- Markdown renderer based on `react-markdown` + `remark-gfm` (Suna's stack)
- Streaming caret: blinking cursor at end of last rendered text block (small CSS-only animation, no external library)
- HighlightedText prop for FTS results (P75)
- Typewriter speed adaptive: catch-up if buffer ahead, slow if smooth
- Code blocks with shiki syntax highlighting + copy button on hover (Suna pattern)
- Mermaid diagram inline support (for agent-generated diagrams)

#### 6.3 `livos/packages/ui/src/routes/ai-chat/components/liv-agent-status.tsx` (NEW, polish agent-status-overlay.tsx)
- States: idle, listening, thinking, executing, responding, error
- Each state: distinct icon + animation + accent color
- Position: top of chat, sticky during streaming
- Hover reveals: current task, elapsed time, token count
- Click reveals: full agent state inspector (debug mode)

#### 6.4 `livos/packages/ui/src/routes/ai-chat/components/liv-typing-dots.tsx` (NEW)
- Suna's dots animation: '' → '.' → '..' → '...' at 500ms
- Used while waiting for first token after send

#### 6.5 Welcome / first-message screen
- Replace blank chat with: animated greeting, time-of-day adaptive ("Good evening, [name]"), suggestion cards (3-4 starter prompts), recent conversations strip
- "What can Liv do?" expandable showing tool categories with icons
- Slash command hint floating ("Press `/` for commands")

### Files affected
- NEW: `liv-composer.tsx` (~400 LOC, replaces chat-input.tsx)
- NEW: `liv-streaming-text.tsx` (~200 LOC, replaces streaming-message.tsx)
- NEW: `liv-agent-status.tsx` (~150 LOC, polishes agent-status-overlay.tsx)
- NEW: `liv-typing-dots.tsx` (~50 LOC)
- NEW: `liv-welcome.tsx` (~250 LOC)
- MODIFY: `index.tsx` — wire all new components

### Verification
- Type message → see streaming caret hugging last token
- Drag image → preview chip appears
- Press `/` → slash menu opens with 6+ commands
- Long response → catch-up typewriter visible smooth
- First open → welcome screen with 4 suggestion cards visible

### Estimate
20-25 hours

---

## P71 — Phase 7: Computer Use Foundation

**Goal:** Get bytebot-desktop image installed per-user, react-vnc embedding live, app gateway authenticating /computer-use endpoint.

### Deliverables

#### 7.1 Bytebot desktop catalog entry
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` — add `bytebot-desktop` BuiltinAppManifest
- Image: `ghcr.io/bytebot-ai/bytebot-desktop:edge`
- Single port mapping: `${PORT_BASE}:9990` (where PORT_BASE is per-user assigned, e.g., 14100 for user 1)
- `--privileged` flag, `shm_size: 2g`, capabilities + cap_drop minimum needed
- Env: `RESOLUTION=1280x960`, `DISPLAY=:0`
- Health check: `curl http://localhost:9990/health`
- subdomain: `desktop` (so URL is `desktop.bruce.livinity.io`)
- public:false (auth required, gateway middleware enforces)

#### 7.2 App gateway auth for /computer-use
- `livos/packages/livinityd/source/modules/server/index.ts` — new middleware for desktop subdomain
- Validates JWT session
- Validates user has active computer-use task (prevents direct access without agent control)
- Strips bytebotd's port 9990 default behavior, only exposes /computer-use, /websockify, /screenshot endpoints

#### 7.3 react-vnc integration
- `pnpm add react-vnc` in `livos/packages/ui`
- `livos/packages/ui/src/routes/ai-chat/tool-views/components/liv-vnc-screen.tsx` (NEW)
  - Wraps `<VncScreen>` with: loading state, error fallback, scale-to-fit, fullscreen button, takeover indicator (shows when user mouse takes over)
- WebSocket URL pattern: `wss://desktop.bruce.livinity.io/websockify?token=<session-token>`
- Connection multiplexing: one WS per user session, shared between BrowserToolView and standalone view

#### 7.4 Standalone computer-use route (bonus)
- `livos/packages/ui/src/routes/computer/index.tsx` (NEW)
- Full-screen VNC view for users who want direct desktop access (no agent)
- Useful for debugging or manual setup

#### 7.5 Lifecycle management
- `livos/packages/livinityd/source/modules/computer-use/container-manager.ts` (NEW)
- Methods: `ensureContainer(userId) → containerInfo`, `stopContainer(userId)`, `getStatus(userId)`
- On first computer-use tool call → spawn container if not running
- Idle timer: 30 min no activity → stop container, clear volume
- Per-user singleton (max 1 active container per user account)

### Files affected
- NEW: bytebot-desktop manifest in `builtin-apps.ts`
- NEW: `livos/packages/livinityd/source/modules/computer-use/container-manager.ts`
- NEW: `livos/packages/ui/src/routes/ai-chat/tool-views/components/liv-vnc-screen.tsx`
- NEW: `livos/packages/ui/src/routes/computer/index.tsx`
- MODIFY: `server/index.ts` — desktop subdomain auth middleware

### Verification
- User triggers "/computer start" → container spawns within 15s
- VNC iframe loads, shows XFCE desktop
- User can take over mouse (viewOnly=false)
- Idle 30 min → container stops, next start fresh
- Multiple users isolated (no cross-bleed)

### Estimate
12-16 hours

---

## P72 — Phase 8: Computer Use Agent Loop

**Goal:** Wire Liv agent to bytebotd. Agent issues 16 Bytebot tools, screenshots come back as tool results, NEEDS_HELP flow when agent stuck.

### Deliverables

#### 8.1 `liv/packages/computer-use/src/bytebot-tools.ts` (NEW)
- Const export: 16 Bytebot tool schemas (verbatim copy from Bytebot's `agent.tools.ts`)
- Tools: `screenshot`, `click_mouse`, `move_mouse`, `drag_mouse`, `scroll`, `type_text`, `press_keys`, `wait`, `application`, `read_file`, `write_file`, `cursor_position`, `paste_text`, `cua_command`, `set_task_status` (NEEDS_HELP/COMPLETED), etc.

#### 8.2 `liv/packages/computer-use/src/bytebot-bridge.ts` (NEW)
- Class `BytebotBridge` — wraps bytebotd HTTP API
- Methods: `executeAction(userId, action) → ToolResult`
- POST to `http://localhost:${userPort}/computer-use {action, ...params}`
- Capture screenshot after action (750ms settle delay — load-bearing per Bytebot research)
- Returns `ToolResult { content: { image_url, message }, isSuccess }`
- Error handling: retry once on network blip, then surface error

#### 8.3 `liv/packages/computer-use/src/system-prompt.ts` (NEW)
- Verbatim port of Bytebot's `agent.constants.ts` system prompt
- Adaptations for Liv: replace "Bytebot" → "Liv", coordinate space anchor (1280x960), NEEDS_HELP / COMPLETED state instructions
- Inject into Liv agent system prompt when active task is computer-use type

#### 8.4 `liv/packages/core/src/liv-agent-runner.ts` (MODIFY)
- Detect computer-use task type (presence of computer_use tools in available set OR explicit task type)
- Route tool calls matching `computer_use_*` names to `BytebotBridge.executeAction`
- Inject computer-use system prompt addendum
- Track NEEDS_HELP state in run metadata

#### 8.5 NEEDS_HELP UX
- `livos/packages/ui/src/routes/ai-chat/components/liv-needs-help-card.tsx` (NEW)
- When agent emits `set_task_status({status: 'NEEDS_HELP', message: '...'})`:
  - Side panel shows banner: "Liv needs help — [message]"
  - Action buttons: "Take over" (user gets mouse), "Provide guidance" (text input → injected as user message), "Cancel task"
  - When user takes over → VNC viewOnly=false visible cursor, agent paused, returns control button

#### 8.6 Computer use task UI flow
- User says "navigate to gmail.com and check unread"
- Liv agent detects browser/computer task → spawns container → sends `screenshot` tool → analyzes → sends `click_mouse` etc.
- Side panel auto-opens with BrowserToolView in live mode
- VNC iframe shows agent's actions in real-time
- User can pause anytime (Stop button on side panel header)

### Files affected
- NEW: `liv/packages/computer-use/` (entire new package)
- MODIFY: `liv-agent-runner.ts` — tool routing logic
- NEW: `liv-needs-help-card.tsx`
- MODIFY: `BrowserToolView.tsx` — wire to live VNC for computer-use category

### Verification
- "Navigate to google.com and search 'weather'" → end-to-end works, side panel shows live VNC, screenshots captured per step
- "Open Firefox and read https://news.ycombinator.com" → application tool used to launch, browser navigation, content extracted
- Agent gets stuck (e.g., login page) → emits NEEDS_HELP → user takes over → completes login → returns control → agent resumes

### Estimate
20-25 hours

---

## P73 — Phase 9: Reliability Layer

**Goal:** Make agent runs survive crashes, reconnects, long durations. ContextManager prevents Kimi window overflow. BullMQ backgrounds long tasks.

### Deliverables

#### 9.1 `liv/packages/core/src/context-manager.ts` (NEW)
- Class `ContextManager` — token counting + summarization
- Threshold: 75% of Kimi-for-coding context window (~150k of 200k)
- On threshold: take oldest N messages (preserve last 10 + system + recent tool results), summarize via cheap Kimi call
- Inject summary as `{role: 'system', content: '<context_summary>...</context_summary>'}`
- Persist summary checkpoint in `liv:agent_run:{runId}:summary_checkpoint` Redis key
- Survives reconnect: on reload, replay summary + recent messages

#### 9.2 `liv/packages/core/src/queue/agent-queue.ts` (NEW)
- BullMQ queue `liv:agent-jobs`
- Worker subscribes, processes one agent run at a time per user (concurrency: per-user 1, global N)
- Job data: `{runId, userId, task, conversationHistory}`
- On completion: marks `agent_run:{runId}:meta` status='completed'
- On failure: status='error', error message stored

#### 9.3 `liv/packages/core/src/run-store.ts` (EXTEND)
- Add `pauseRun(runId)` / `resumeRun(runId)` — control via Redis pub/sub
- Add `forkRun(runId, fromIndex)` — branching support (UI in P75)
- Add `editMessage(runId, messageIdx, newContent)` — message editing (replace + invalidate downstream)

#### 9.4 Frontend reconnection
- `use-liv-agent-stream.ts` — SSE reconnect logic with exponential backoff (1s, 2s, 4s, 8s)
- On reconnect: include `?after=<lastIdx>` query param to catch up
- UI banner: "Reconnecting..." (subtle, top of chat)

#### 9.5 Per-user resource limits
- Max concurrent runs per user: 3
- Max run duration: 60 min (configurable)
- Max tokens per run: 500k (Kimi soft limit)
- Limits enforced in BullMQ worker + run-store

### Files affected
- NEW: `liv/packages/core/src/context-manager.ts`
- NEW: `liv/packages/core/src/queue/agent-queue.ts`
- EXTEND: `liv/packages/core/src/run-store.ts`
- MODIFY: `livos/packages/ui/src/lib/use-liv-agent-stream.ts` — reconnect logic
- MODIFY: `liv-agent-runner.ts` — context manager hook

### Verification
- 3-hour agent run → context summarized 3-4 times, no overflow error
- Browser refresh mid-run → SSE catches up, no chunks lost
- Stop button in mid-run → loop terminates within 1 iteration
- Pause + Resume → run continues from exact state

### Estimate
14-18 hours

---

## P74 — Phase 10: F2-F5 Carryover from v30.5

**Goal:** Tackle the 4 deferred broker improvements that were in v30.5 scope.

### F2: Token-level streaming cadence
- Currently: chunks arrive batched
- Fix: stream tokens as they emit from Kimi SSE, debounce to ~50ms intervals client-side
- Files: `liv/packages/core/src/providers/kimi.ts` (SSE parser), `livos/packages/ui/src/lib/use-liv-agent-stream.ts`

### F3: Multi-turn tool_result protocol
- Currently: tool results sometimes lose continuity across turns
- Fix: ensure `assistant.tool_calls[].id` consistently matches `tool.tool_call_id` in next turn
- Validation: assistant message with tool_calls MUST be followed by tool messages with matching IDs before next user message
- Files: `liv-agent-runner.ts`, `sdk-agent-runner.ts` adapter layer

### F4: Caddy proxy timeout for long agentic sessions
- Currently: Caddy default 30s timeout drops long-running streams
- Fix: Caddy config block for `/api/agent/runs/*` with `transport http { read_timeout 30m write_timeout 30m }`
- Files: Mini PC Caddyfile (deploy via update.sh)

### F5: Identity preservation across turns
- Currently: agent occasionally hallucinates being Claude 3.5 Sonnet (broker passthrough)
- Fix: inject identity line in every system prompt: "You are Liv Agent, powered by Kimi-for-coding. Today is [date]."
- Files: `liv-agent-runner.ts` system prompt builder

### Verification
- Type "hi" → tokens stream visibly word-by-word (cadence test)
- Long tool chain → no `tool_use_id mismatch` errors (Kimi strict validation)
- 10-min agent run → no Caddy 504 timeouts
- Ask agent "who are you?" → consistent "Liv Agent powered by Kimi" response

### Estimate
6-10 hours (mostly tweaks, well-understood)

---

## P75 — Phase 11: Reasoning Cards + Lightweight Memory

**Goal:** Show Kimi reasoning to user via custom Liv-designed reasoning card (NOT Hermes-styled). Implement minimal memory (FTS over conversations) using Postgres tsvector. Skill auto-generation explicitly out of scope.

### Deliverables

#### 11.1 Reasoning card component
- `livos/packages/ui/src/routes/ai-chat/components/liv-reasoning-card.tsx` (NEW)
- Collapsible card, default collapsed
- Header: amber glow icon (Brain or Sparkles) + "Liv is thinking..." (when streaming) or "Reasoning" (when done) + duration
- Body: Markdown-rendered reasoning_content
- Glow pulse animation while streaming (uses GlowPulse motion primitive from P66)

#### 11.2 Wire reasoning extraction
- `liv-agent-runner.ts` already extracts (P67) — emit `chunk.type='reasoning'`
- `chat-messages.tsx` renders reasoning chunks via `<LivReasoningCard>`

#### 11.3 Conversation FTS (minimal memory)
- PostgreSQL: add `tsvector` column to `messages` table, GIN index
- Backfill via migration
- API: `GET /api/conversations/search?q=<query>` returns matching messages with snippets
- UI: Sessions sidebar gets search input (debounced 300ms — common UX pattern, not Hermes-derived)
- HighlightedText component (P66 motion primitive) for snippet rendering

#### 11.4 Pinned messages
- User can pin any message (right-click or hover menu)
- Pinned messages always available in agent context (auto-injected to system prompt)
- UI: pin icon on hover, "Pinned" sidebar section

#### 11.5 Conversation export (bonus)
- Export thread as Markdown / JSON / PDF
- Useful for sharing with humans

### What NOT in this phase
- ❌ Auto skill-generation (defer indefinitely — Hermes-derived idea, dropped per UI scope guard)
- ❌ Skill execution from slash command (defer)
- ❌ FTS5 SQLite local store (we use postgres tsvector — already in stack)

### Estimate
12-16 hours

---

## P76 — Phase 12: Agent Marketplace + Onboarding Tour

**Goal:** Browse/clone agent templates (Suna pattern, adapted). First-run tour that triggers WOW.

### Deliverables

#### 12.1 Agent marketplace UI
- `livos/packages/ui/src/routes/marketplace/agents/index.tsx` (NEW)
- Grid layout: 2/3/4 columns by breakpoint
- Cards: emoji avatar + name + 2-line description + tag chips + clone count + "Add to Library" button
- Filter: tags (Coding / Research / Computer Use / etc.)
- Sort: newest, popular, most-cloned
- Pagination: 20 per page

#### 12.2 Backend marketplace
- New table `agent_templates` in livos pg: `slug, name, description, system_prompt, tools_enabled, tags, clone_count, created_at`
- Seed 8-10 starter templates: General Assistant, Code Reviewer, Researcher, Computer Operator, MCP Manager, etc.
- API: `GET /api/agent-templates`, `POST /api/agent-templates/:slug/clone`
- Clone creates entry in `user_agents` (existing table) with copy of template config

#### 12.3 First-run onboarding tour
- `livos/packages/ui/src/routes/onboarding/liv-tour.tsx` (NEW)
- Triggers on first-ever ai-chat open (cookie-flag)
- Steps:
  1. Welcome modal (animated Liv logo + tagline)
  2. Tour starts: highlight composer ("Type to chat with Liv")
  3. Highlight slash command hint ("Press / for commands")
  4. Highlight agent picker ("Switch agents anytime")
  5. Demo: pre-filled "Take a screenshot of google.com" → user clicks Send → side panel opens, VNC visible
  6. Highlight side panel ("Watch Liv work in real-time")
  7. Highlight reasoning card ("See why Liv decides")
  8. Highlight marketplace ("Get more agents")
  9. Done, party emoji animation
- Skippable, replayable from settings

#### 12.4 Settings updates
- New section: "Liv Agent" with: model picker (default Kimi), tool permissions, computer use enabled toggle, idle timeout slider, reasoning visibility toggle
- "Replay onboarding tour" button

### Estimate
16-20 hours

---

## 3. Cross-Phase Concerns

### Testing strategy
- Each phase: unit tests for new modules, integration test for happy path, smoke test on Mini PC
- E2E: Playwright test "send message → see streaming → tool call opens panel → reasoning card → done"
- WOW test: take screencap of finished v30.5 chat, take screencap of v31 chat after every 2 phases — visual diff doc

### Migration plan
- v30.5 → v31 transition: feature flag `LIV_NEW_UI=true` in env
- New UI accessible at `/ai-chat-v2` during P67-P76 development
- After P76 verification: swap routes, archive old components
- Memory backfill: run migration script for tsvector column (P75)

### Risk register
| Risk | Mitigation |
|---|---|
| Liv rename breaks Mini PC deployment | P64 atomic deploy window, snapshot rollback ready |
| Bytebot privileged container security | Mini PC single-user, document exposure, no public Mini PC |
| react-vnc browser compat issues | Test on Chrome/Firefox/Safari, fallback to MJPEG screenshot polling |
| Kimi rate limits during long context | ContextManager P73 prevents overflow; user notified at 90% |
| BullMQ Redis memory growth | TTL 24h on all run keys; monitor Redis usage |
| WOW design system polarizes users | A/B test theme picker (P66), keep current as "classic" option |
| 12-phase scope creep | Each phase has explicit "NOT in this phase" list |

### Rollback strategy per phase
- Each phase ships behind feature flag where possible
- Each phase has dedicated branch + PR
- Each merge tagged for fast revert
- Critical phases (P65 rename, P67 SSE refactor, P71/72 computer use) have documented rollback runbook

### Dependencies between phases
```
P64 → P65 → P66 ─┬→ P67 ─┬→ P68 → P69 → P70
                 │        ├→ P73
                 │        ├→ P74
                 │        ├→ P75
                 │        └→ P76
                 └→ P71 → P72
```
- P65 (rename) blocks all subsequent (cosmetic but pervasive)
- P66 (design system) provides tokens for P68/P69/P70/P71/P75/P76
- P67 (core rebuild) blocks anything using new ToolCallSnapshot model
- P71 (CU foundation) blocks P72 (CU agent loop)
- P73-P76 can run in parallel after P67 done

### Parallel work opportunities
- Backend work (P67, P71, P73, P74) and frontend work (P66, P68, P69, P70, P76) can be staffed in parallel
- Solo dev: serial in priority order

---

## 4. Estimated Total Effort

| Phase | Hours (low) | Hours (high) |
|---|---|---|
| P64 v30.5 close | 1 | 3 |
| P65 Liv rename | 6 | 10 |
| P66 Design system | 8 | 12 |
| P67 Core rebuild | 12 | 16 |
| P68 Side panel | 14 | 18 |
| P69 Per-tool views | 30 | 40 |
| P70 Composer + UX | 20 | 25 |
| P71 CU foundation | 12 | 16 |
| P72 CU agent loop | 20 | 25 |
| P73 Reliability | 14 | 18 |
| P74 F2-F5 carry | 6 | 10 |
| P75 Reasoning + memory | 12 | 16 |
| P76 Marketplace + tour | 16 | 20 |
| **TOTAL** | **171** | **229** |

At 4-6 focused hours/day: ~6-12 weeks for solo dev.

---

## 5. Definition of Done — v31 Ships When

- [ ] All 12 phases (P65-P76) closed with VERIFICATION.md
- [ ] No "Nexus" string in source (allowed: archived planning docs)
- [ ] WOW test: external observer sees ai-chat for first time, comments on visual quality unprompted
- [ ] Computer use end-to-end: "search youtube for cat videos and play one" → works
- [ ] **Side panel auto-open verified**: visual tools (browser-*, computer-use-*) trigger auto-open; non-visual tools (shell, file, web-search, MCP) do NOT auto-open but are clickable to open
- [ ] All Suna UI patterns ported: side panel (live/manual mode, slider, Cmd+I), tool view registry (9 components), browser view (VNC + screenshot multi-strategy parsing), composer auto-grow, marketplace, inline tool pills
- [ ] All Bytebot artifacts integrated: desktop image, 16 tool schemas, system prompt
- [ ] F2-F5 carryover items closed
- [ ] No regression vs v30.5: subscription path works, Suna marketplace install works, broker x-api-key auth works
- [ ] Memory updated to reflect v31 completion + remove stale rules
- [ ] `.planning/v31-MILESTONE-AUDIT.md` written

---

## 6. Open Questions for /gsd-new-milestone Intake

1. Phase numbering: continue from current (P65+)? Or restart for v31?
2. Worktrees: use isolated worktree per phase (`.claude/worktrees/v31-pX-name`) or single branch?
3. Code review: spawn `/gsd-code-review` per phase or batch at v31 audit?
4. Parallel UI/backend: solo dev means serial, but P67+P71 could run in parallel branches if you want
5. WOW design tokens: lock now or iterate during P66 with screenshots?
6. F2-F5 specifics: are the v30.5 problem statements still valid, or have they shifted?
7. Marketplace seed agents: which 8-10 to ship in P76?

---

*Generated: 2026-05-04*
*Status: AWAITING USER REVIEW*
*Next action: User reviews → invokes `/gsd-new-milestone v31` with this doc as input*
