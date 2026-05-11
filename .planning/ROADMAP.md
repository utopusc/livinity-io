# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- ✅ **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (shipped local 2026-05-01) — see [milestones/v29.4-ROADMAP.md](milestones/v29.4-ROADMAP.md)
- ✅ **v29.5 v29.4 Hot-Patch Recovery + Verification Discipline** — Phases 49-54 (shipped local 2026-05-02 via `--accept-debt`) — see [milestones/v29.5-ROADMAP.md](milestones/v29.5-ROADMAP.md)
- ✅ **v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope)** — Phases 56-63 (shipped local 2026-05-04 via `--accept-debt`) — see [milestones/v30.0-ROADMAP.md](milestones/v30.0-ROADMAP.md)
- ✅ **v31.0 Liv Agent Reborn** — Phases 64-79 (closed 2026-05-05 — P77+P78+P79 hot-fix wave shipped same day; bytebot MCP working end-to-end via host GNOME desktop)
- ✅ **v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime** — Phases 80-91 (CODE-COMPLETE 2026-05-06 via autonomous wave-based dispatch; pending Mini PC UAT signoff — see [.planning/phases/91-uat-polish/UAT-CHECKLIST.md](phases/91-uat-polish/UAT-CHECKLIST.md))
- ✅ **v33.0 WebApp Launcher + Teach/Auto Modes** — Phases 92-98 (CODE-COMPLETE 2026-05-08; pending Mini PC UAT signoff — see [.planning/phases/98-uat-polish/UAT-CHECKLIST.md](phases/98-uat-polish/UAT-CHECKLIST.md))
- ⏸ **(deferred) Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes as future slot e.g. v34+)

---

## Phases

<details>
<summary>✅ v30.0 Livinity Broker Professionalization (Phases 56-63) — SHIPPED 2026-05-04 via --accept-debt</summary>

Real-API-key broker for external/open-source apps (Bolt.diy, Open WebUI, Continue.dev, Cline, Cursor) — Bearer + x-api-key dual-auth, public api.livinity.io endpoint, true token streaming, spec-compliant rate-limit + alias resolver + provider stub, per-user usage tracking + Settings UI. v30.5 informal scope (F1/F6/F8) folded into close. F2-F5 + F7 → v31 carryover.

8 phases / 44 plans (41 summaries) / 166 commits since v30.0 seed (`d59b1b51`).

</details>

### 🟢 v31.0 Liv Agent Reborn (Active — Phases 64-76)

**Goal:** Make AI Chat the WOW centerpiece of LivOS. Replace "Nexus" cosmetic identity with "Liv" project-wide. Adopt Suna's UI patterns verbatim (side panel + per-tool views + browser/computer-use display). Add computer use via Bytebot desktop image. Polish streaming UX, reasoning cards, lightweight memory, agent marketplace.

**Source plan:** `.planning/v31-DRAFT.md` (851 lines, file-level breakdown user-validated 2026-05-04).

**UI scope guard (locked):** ONLY Suna UI patterns. NO Hermes UI per user direction 2026-05-04.

**Estimated effort:** 171-229 hours (6-12 weeks solo at 4-6h/day).

**Phase summary:**

- [ ] **Phase 64: v30.5 Final Cleanup at v31 Entry** (CARRY-01..05) — F7 Suna sandbox network blocker fix + 14 carryforward UATs + Phase 63's 11 plan walks + 3 v28.0 quick-tasks resolution + external client compat matrix UAT
- [~] **Phase 65: Liv Rename + Foundation Cleanup** (RENAME-01..13) — Nexus → Liv project-wide (~5,800 occurrences); `nexus/` → `liv/` git mv; @nexus/* → @liv/*; NEXUS_* → LIV_*; nexus:* Redis → liv:*; Mini PC `/opt/nexus/` → `/opt/liv/` migration. **Progress 2026-05-05:** 4/6 plans shipped (65-01 preflight + 65-02 git mv + 65-03 source sweep + 65-06 docs/memory). 65-04 (deploy scripts) + 65-05 (Mini PC migration script + cutover) pending. Sacred SHA `4f868d31...` preserved across all shipped plans.
- [ ] **Phase 66: Liv Design System v1** (DESIGN-01..07) — color tokens (deep navy + cyan + amber + violet), motion primitives (FadeIn/GlowPulse/SlideInPanel/TypewriterCaret), typography (Inter Variable + JetBrains Mono), shadcn liv-* variants, Tabler icons unified
- [x] **Phase 67: Liv Agent Core Rebuild** (CORE-01..07) — 4/4 plans complete 2026-05-04; Redis-as-SSE-relay (24h TTL, reconnectable runs), ToolCallSnapshot data model, LivAgentRunner wrapper around SdkAgentRunner, SSE endpoint with `?after=` resume support — production wiring of livAgentRunnerFactory deferred to P68/P73 (route surface complete + 503 stub when unwired)
- [x] **Phase 68: Side Panel + Tool View Dispatcher** (PANEL-01..10 + PANEL-AUTO-OPEN-E2E) — 7/7 plans complete 2026-05-04; LivToolPanel auto-open contract (visual-tools-only, STATE.md line 79 LOCKED) shipped + E2E regression-protected via 8 integration tests; Cmd+I global shortcut; orphan until P70 mounts in ai-chat/index.tsx; sacred SHA `4f868d31...` unchanged across all 7 plans
- [ ] **Phase 69: Per-Tool Views Suite** (VIEWS-01..11) — 9 view components (Browser/Command/FileOp/StrReplace/WebSearch/WebCrawl/WebScrape/Mcp/Generic) all Suna-derived + inline tool pill (Suna pattern, not Hermes)
- [ ] **Phase 70: Composer + Streaming UX Polish** (COMPOSER-01..09) — auto-grow textarea, stop button toggle, slash commands expanded, mention menu, voice + model badge, streaming caret, agent status, typing dots, welcome screen
- [ ] **Phase 71: Computer Use Foundation** (CU-FOUND-01..07) — Bytebot desktop image to livinity-apps catalog (per-user compose templating, port 14100+, --privileged, shm 2g); react-vnc embed; app gateway auth; container lifecycle (30min idle timeout, max 1/user)
- [ ] **Phase 72: Computer Use Agent Loop** (CU-LOOP-01..07) — 16 Bytebot tool schemas + system prompt verbatim copy; livinityd computer-use module; BYTEBOT_LLM_PROXY_URL → broker → Kimi; NEEDS_HELP/takeover UI flow
- [ ] **Phase 73: Reliability Layer** (RELIAB-01..06) — ContextManager (75% Kimi window summarization) ✅ 73-01+73-03; BullMQ background queue per-user concurrency=1 ✅ 73-02+73-04; reconnectable runs (boot-recovery scan) — pending 73-05; per-user resource limits — deferred
- [ ] **Phase 74: F2-F5 Carryover from v30.5** (BROKER-CARRY-01..05) — token cadence streaming, multi-turn tool_result protocol, Caddy timeout for long agentic, identity preservation across turns
- [ ] **Phase 75: Reasoning Cards + Lightweight Memory** (MEM-01..08) — Kimi reasoning_content collapsible amber card, Postgres tsvector FTS over conversations, pinned messages, conversation export
- [ ] **Phase 76: Agent Marketplace + Onboarding Tour** (MARKET-01..07) — agent_templates table + 8-10 seed agents, Suna marketplace UX adapted, first-run interactive tour (9 steps), Settings "Liv Agent" section
- [ ] **Phase 77: MCP Agent Loop Integration** (MCP-AGENT-01..04) — Wire McpClientManager-discovered tools into agent loop so registered MCP servers' tools reach Claude's `tools[]` array; close discovery gap identified by 2026-05-05 deploy investigation. Sacred file `liv/packages/core/src/sdk-agent-runner.ts` MUST remain untouched (D-NO-BYOK / sdk-subscription-only). Pattern: extend at `agent-runs.ts` factory boundary or via SDK option construction, NOT inside the sacred runner. Deliverables: McpConfigManager.listServers() → mcpServers config injection at runtime; Bytebot env-flag default-on (gated by linux+file-exists guards); integration tests for MCP tool snapshot emission end-to-end.
- [ ] **Phase 78: Provider Endpoint + MCP Browser Dialog** (PROV-01..03 + MCP-UI-01..04) — Three coupled fixes for "Kimi" badge / MCP page / Suna inline-marketplace feel: (a) liv-core `/api/providers` endpoint reports broker active provider (Claude) so livinityd tRPC stops falling back to hardcoded `'kimi'`; (b) MCP panel install/uninstall buttons wired to actual tRPC mutations + currently-running-tools section; (c) `LivMcpBrowserDialog` component (Suna `BrowseDialog` parity) opened from composer `+ MCP` button + agent settings — `/agent-marketplace` route stays as community-agent destination (Suna parity confirmed).
- [x] **Phase 79: Bytebot Hot-Fix Wave** (BYTEBOT-01..04) — 4 sequential fixes shipped 2026-05-05 to make bytebot MCP work end-to-end via Mini PC's host GNOME desktop: 79-01 (`AgentSessionManager` MCP injection + `nexus-tools` legacy wrapper default-OFF), 79-02 (JSON-Schema → Zod converter for MCP SDK 1.25.x), 79-03 (XAUTHORITY GDM path `/run/user/1000/gdm/Xauthority`), 79-04 (scrot subprocess replaces nut-js native binding for reliable framebuffer capture). User confirmed working "Tamam simdi calisiyor".

### 🟢 v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime (Active — Phases 80-91)

**Goal:** Suna-faithful UI rewrite + Hermes-inspired background runtime patterns. Light theme. Single MCP source of truth. 4-5 specialized seed agents. Per-agent model badges. Direct in-place at `/ai-chat` (Redis flag-gated). 12 phases / 4-6 günde ship via parallel waves.

**Source plan:** [v32-DRAFT.md](v32-DRAFT.md) (master plan + 5 locked answers from user 2026-05-05).

**Phase summary:**

- [x] **Phase 80: Foundation** (V32-FOUND-01..05) — OKLCH design tokens (Suna globals.css verbatim), `:root`+`.dark` swap, Geist Sans/Mono fonts via @fontsource-variable, Tailwind config extension, ThemeProvider + useTheme hook, `/playground/v32-theme` preview route. **Wave 1 — file-disjoint, paralel P85+P87.**
- [x] **Phase 81: Chat UI Port** (V32-CHAT-01..08) — `routes/ai-chat/v32/{MessageThread, ChatComposer, MessageInput, FileAttachment, AttachmentGroup, preview-renderers}.tsx`, gradient pill rendering, streaming caret animation, drag-drop on Card. Suna `ThreadContent.tsx` + `chat-input/*` ported with LivOS auth/API substitutions. **Wave 2.**
- [x] **Phase 82: Tool Side Panel** (V32-PANEL-01..06) — `ToolCallPanel.tsx` (`fixed inset-y-0 right-0 z-30` overlay, slide-in animation, slider scrubber, live/manual mode, "Jump to Live" pill, Cmd+I close, `liv-sidebar-toggled` event). `isVisualTool(name)` regex extended to `mcp_bytebot_*`. **Wave 2 paralel P81+P83.**
- [x] **Phase 83: Per-Tool Views** (V32-VIEWS-01..11) — `ToolViewRegistry.tsx` JS object dispatch, `ToolViewWrapper.tsx` shared chrome, 9 view components (Browser/Command/FileOp/StrReplace/WebSearch/WebCrawl/WebScrape/Mcp/Generic), `MCPContentRenderer.tsx` + `mcp-format-detector.ts` (search/table/JSON/markdown/error/plain auto-detect), `getMCPServerColor()` per-server identity. **Wave 2 paralel P81+P82.**
- [x] **Phase 84: MCP Single Source of Truth** (V32-MCP-01..09) — `BrowseDialog.tsx` (modal, search + categorized sidebar + server cards), `ConfigDialog.tsx` (credentials form from `configSchema` + tool-selection checkboxes), `ConfiguredMcpList.tsx` (per-agent), `MCPConfigurationNew.tsx` wrapper, source selector pill: "Official" (default `registry.modelcontextprotocol.io`) / "Smithery" (gated by `liv:config:smithery_api_key`), `mcp-smithery-client.ts` new client. tRPC: `mcp.search`, `mcp.installToAgent`, `mcp.removeFromAgent`. DEPRECATE `mcp-panel.tsx` from sidebar. **Wave 3 (depends on P83 view + P85 schema).**
- [x] **Phase 85: Agent Management** (V32-AGENT-01..10) — DB migration: `agents` table (agent_id PK, user_id FK, name, description, system_prompt, model_tier, configured_mcps JSONB, agentpress_tools JSONB, avatar emoji, avatar_color, is_default, is_public, marketplace_published_at, download_count, created_at, updated_at). tRPC: `agents.{list,get,create,update,delete,publish,unpublish,clone}`. Routes: `/agents` grid + `/agents/:id` two-pane editor (Manual + Agent Builder Beta tabs). 500ms debounced autosave. `AgentCard.tsx` (rounded-2xl + h-50 color zone + backdrop-blur badges + group-hover delete). 5 seed agents migration: Liv Default + Researcher + Coder + Computer Operator + Data Analyst. **Wave 1 schema migration; Wave 2 UI paralel P81+P82+P83.**
- [x] **Phase 86: Marketplace** (V32-MKT-01..06) — Route `/marketplace` (replaces `/agent-marketplace`), 4-col responsive grid (sm:2/lg:3/xl:4), search input + sort select (newest/popular/most_downloaded) + tag filter chip strip, `MarketplaceCard.tsx` (h-50 color zone + backdrop-blur download badge + tag badges + creator/date), "Add to Library" mutation → `agents.cloneFromMarketplace`. Existing `agent_templates` table data migrated to `agents` table with `is_public:true`. **Wave 3 paralel P84.**
- [x] **Phase 87: Hermes-inspired Background Runtime** (V32-HERMES-01..07) — Extend `liv/packages/core/src/liv-agent-runner.ts`: (1) new `RunStore.ChunkType.status_detail` payload `{phase, phrase, elapsed}` emitted on each assistant turn + tool dispatch + tool result, (2) `THINKING_VERBS[15]` constants from Hermes verbatim, (3) `maxIterations` LivAgentRunnerOptions field default 90 — INCR counter with error chunk on breach, (4) `_pendingSteer` field + `injectSteer(guidance)` method drained on next assistant turn, (5) `WSClientMessage.steer` type added to `agent-session.ts`, (6) `ToolCallSnapshot.batchId?` additive optional field for parallel grouping, (7) 4-pass JSON repair chain in legacy `kimi-agent-runner.ts` (defensive, low-prio). Sacred `sdk-agent-runner.ts` UNTOUCHED (post-P77 SHA `f3538e1d` baseline). **Wave 1 — backend file-disjoint, paralel P80+P85-schema.**
- [x] **Phase 88: WebSocket → SSE Migration** (V32-MIGRATE-01..05) — Refactor `routes/ai-chat/v32/index.tsx` to use `useLivAgentStream` (P67-04 SSE) instead of legacy `useAgentSocket` (WebSocket). Bridge SSE chunks → UI state: text → MessageThread, tool_snapshot → ToolCallPanel auto-open (when `isVisualTool` matches), status_detail → animated phrase card (consumes P87 chunks). Reconnect-with-after-idx logic validated. Deprecate `useAgentSocket` for v32 chat (legacy `/ai-chat` keeps it during cutover grace). **Wave 4 (depends on P81+P82+P87).**
- [x] **Phase 89: Theme Toggle + Accessibility + Keyboard** (V32-A11Y-01..06) — `<ThemeToggle>` component (sun/moon icon) in chat header, system default → `<html class>` toggle persisted to localStorage. Keyboard shortcuts: Cmd+I (close panel), Cmd+K (composer focus), Cmd+/ (slash menu), Cmd+Shift+C (copy last message). ARIA labels on all interactive components. WCAG AA color contrast verification on light theme. Focus-visible rings (Tailwind `focus-visible:ring-2`). **Wave 4 paralel P88.**
- [x] **Phase 90: Cutover** (V32-CUT-01..05) — Set `liv:config:new_chat_enabled=true` Redis flag, switch `/ai-chat/index.tsx` default routing to `v32/`. Remove `mcp-panel.tsx` sidebar tab from `routes/ai-chat/index.tsx`. `/agent-marketplace` → `/marketplace` HTTP 301 redirect in livinityd `server/index.ts` + client-side fallback. Update Dock app entry. Schedule `useAgentSocket` removal for v33. Update STATE.md + memory. **Wave 5.**
- [x] **Phase 91: UAT + Polish** (V32-UAT-01..06) — Full flow smoke test on Mini PC: open chat → chat with each of 5 seed agents → see streaming → tool pill → click pill → side panel opens → screenshot tool → image visible → switch theme to light → no flash → marketplace browse → Add to Library → see in /agents. Mobile responsive verification. A/B blink test: side-by-side screenshot vs current `/ai-chat` (the `igrenc` baseline). User-driven UAT signoff. **Wave 5 (final).**

**Dependency graph:**
```
                                          ┌─→ P81 (chat UI)         ┐
                                          │                          ├─→ P88 (WS→SSE)  ┐
P80 (foundation) ─────────────────────────┼─→ P82 (tool panel)      ─┤                  ├─→ P90 (cutover) ─→ P91 (UAT)
                                          │                          │   P89 (a11y)    ─┘
                                          ├─→ P83 (per-tool views)  ─┴─→ P84 (MCP SoT) ─┐
P85-schema (DB migration) ────────────────┼─→ P85-UI (agent mgmt)   ─┐                  │
                                          ├─→ P86 (marketplace)     ─┤                  │
                                          │                          │                  │
P87 (Hermes runtime) ─────────────────────┴──────────────────────────┴──────────────────┘
```

**Wave plan (parallel execution):**
- **Wave 1** (start now, all file-disjoint): P80 + P85-schema + P87 — 3 paralel agent
- **Wave 2** (after Wave 1): P81 + P82 + P83 + P85-UI + P86 — 5 paralel
- **Wave 3** (after Wave 2): P84 — single (depends on multiple Wave 2 deliverables)
- **Wave 4** (after Wave 3): P88 + P89 — 2 paralel
- **Wave 5** (after Wave 4): P90 → P91 — sequential (cutover then UAT)

**Locked decisions for v32 entry:**
- Direct in `/ai-chat` (`liv:config:new_chat_enabled` Redis flag during dev, set true at P90 cutover)
- MCP source: official MCP Registry preserved, optional Smithery toggle (gated by API key)
- 5 specialized seed agents (Liv Default + Researcher + Coder + Computer Operator + Data Analyst)
- Per-agent model badge ("Liv Default · Claude Sonnet 4.6")
- All 5 Hermes patterns ported at P87
- Light theme REQUIRED, theme toggle at P89
- Sacred `sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED throughout v32

---

### 🟡 v33.0 WebApp Launcher + Teach/Auto Modes (HOT-FIX IN PROGRESS — Phases 92-100)

**Status (2026-05-08):** P92-P98 code-complete; UAT discovered protocol mismatch — backend ships fMP4 but frontend (`use-webapp-vnc.ts`) is a noVNC RFB client. Phase 99 added to swap backend to per-window `x11vnc -id <wid>` (the original D-V33-03 design that P93 spike incorrectly rejected). 5 host-Chrome fixes shipped 2026-05-08 (`5e126607..4c55b173`) preserved through swap.

**Milestone closure summary (2026-05-08):**

- **Code-complete:** all 7 phases (92-98) shipped in 7 waves, ~50 atomic commits across master since `743a414b` (P93 close).
- **Commit ranges by phase:**
  - P92 (metadata extractor): `d86d185e..318e2bb4` (5 commits)
  - P93 (streaming + window manager): `cf61685d..743a414b` (14 commits)
  - P94 (desktop launcher): `dfac4bb5..aa08a3e0` (6 commits)
  - P95 (stream window + AI panel): `e303017b..966ea050` (8 commits) plus deploy hot-fix `952226c8` (libva-utils for vainfo)
  - P96 (teach mode): `cfd83100..d85904bf` interleaved with P97 (6 commits + 1 fixture rollup `74f198c1`)
  - P97 (auto mode): `072bb074..acb8354c` (8 commits)
  - P98 (UAT + polish + lifecycle hookup): this commit batch
- **Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across **every** v33 commit. Verified before AND after every phase per `97-03` sacred-SHA verification harness.
- **Tests:** 200/200 streaming + window-manager green (P93 baseline); ~95 new test cases added across the milestone.
- **Lifecycle hookup:** P98 wired `streamManager` + `webappWindowManager` singletons into `livinityd.start()` so the tRPC `webapp.window.*` and `streams.*` routes return real responses (previously `SERVICE_UNAVAILABLE` because the optional fields were declared but never instantiated — see `93-SUMMARY.md` carry-over).
- **Ship date (code-complete):** 2026-05-08. Final flip to `Shipped` deferred until user-walked Mini PC UAT (`UAT-CHECKLIST.md`) reports PASS — per `feedback_milestone_uat_gate.md`.


**Goal:** Right-click desktop → "Add WebApp" → URL → auto-detected favicon + title → desktop icon. Click → host Chrome (existing user profile, NOT containerized) opens new window at URL → window-scoped VNC stream + v32 AI panel below with Watch/Teach/Auto/Chat modes. Teach mode records user actions as reusable skills; Auto mode runs goal-driven bytebot loop using skill-as-context, scoped to that one Chrome window via `xdotool --window <wid>`.

**Source plan:** [v33-DRAFT.md](v33-DRAFT.md) (v2 — host-direct after user pivot away from per-WebApp containers).

**Estimated effort:** 17-26 days solo (4-6h/day) — 3-5 weeks.

**Phase summary:**

- [x] **Phase 92: WebApp Metadata Extractor** (V33-META-01..04) — livinityd tRPC `webapp.extractMetadata({url})` returns `{title, faviconUrl, description, ogImage}`. Redis cache 24h. URL validation (reject file://, javascript:, intranet IPs). Postgres `webapps` table migration. Files: `livos/packages/livinityd/source/modules/webapps/{metadata-extractor,trpc-router}.ts`.
- [x] **Phase 93: Streaming Subsystem + Window Manager** (V33-WIN-01..07) — Code-complete 2026-05-07. ffmpeg fMP4 (libx264 / h264_vaapi) + Node WS fan-out replaces the rejected per-window x11vnc design (Mutter incompat). PipeWire screencast portal as primary per-window source (D-93-04); ffmpeg x11grab crop + GeometryTracker as fallback. install.sh + update.sh apt-install 18 binaries (ffmpeg/gstreamer/xdotool/ydotool/vainfo/portal/etc). New modules under livos/packages/livinityd/source/modules/{streaming,webapps}/. New tRPC namespaces streams.* (3) + webapp.window.* (4) — all 7 in httpOnlyPaths. WS endpoint `/ws/stream/:id` with JWT-from-query + ownership check (404 on foreign). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED. 200/200 tests green incl. integration test with fake-encoder fixture. Mini PC live deploy + 2h UAT in P98.
- [x] **Phase 94: Desktop "Add WebApp" Context Menu + Persistence** (V33-DESK-01..04) — Extend `desktop-context-menu.tsx` with new ContextMenuItem. AddWebAppDialog (URL input + metadata preview). WebAppIcon component renders alongside Docker apps via `app-grid.tsx`. tRPC `webapps.{create,list,delete,update}`.
- [x] **Phase 95: WebApp Stream Window + AI Panel + Mode Selector** (V33-STREAM-01..07) — New window content type `webapp-stream` registered with window manager. Vertical split: 70% react-vnc/noVNC connected to wsUrl, 30% v32 chat panel. Toolbar (back/forward/refresh/copy URL/fullscreen). Mode selector pill (Watch/Teach/Auto/Chat). Per-WebApp agent session via `LivAgentRunner` SSE. Postgres `webapp_agent_sessions`.
- [x] **Phase 96: Teach Mode — Action Recording** (V33-TEACH-01..07) — `useTeachRecorder` hook captures VNC client mouse/keyboard events. Screenshot every event + 1s heartbeat. Save dialog → POST `webapps.skills.create`. Postgres `webapp_skills` table (JSONB action log + screenshot blob refs). Skills sidebar UI. Replay scrubber (timeline w/ thumbnails).
- [x] **Phase 97: Auto Mode — Skill-Guided Bytebot, Window-Scoped** (V33-AUTO-01..07) — Extend native primitives (`screenshot.ts`, `input.ts`) with `windowId?: number` param: `maim -i <wid>`, `xdotool --window <wid> ...`. New tool `webapp_replay_skill({skillId, freeFormGoal?})`. Skill context builder injects `<previously-learned-skill>` block into agent system prompt. Per-WebApp bytebot MCP spawn with `BYTEBOT_TARGET_WINDOW_ID` env. Vision-validated stepping. Failure recovery (3 strikes → needs help). Sacred SHA UNTOUCHED — extensions through `LivAgentRunner` + `LivMcpClientManager`.
- [x] **Phase 98: UAT + Polish + Docs** (V33-UAT-01..03) — Full flow test: 3 WebApps (facebook/gmail/x), profile sharing verified, teach a skill in each, run auto mode, verify autonomy + needs-help recovery. Resource verification. WebApp delete cascade (skills + sessions). User docs `docs/webapp-launcher.md`. ROADMAP close + memory updates.
- [~] **Phase 99: WebApp VNC Swap — fMP4 → x11vnc** (V33-VNC-01..05) — PARTIAL-PASS 2026-05-08. Protocol-level mismatch RESOLVED: backend now serves RFB over `/ws/stream/:streamId` via per-window `x11vnc -id <wid>` + WS↔TCP `vnc-bridge.ts`. Single WebApp click → stream window with live RFB handshake + bidirectional input verified on Mini PC. UAT-DISCOVERED GAPS deferred to Phase 100: (G-99-UAT-1) multi-stream concurrent broken — second WebApp click does not produce an independent stream; (G-99-UAT-2..4) stream window UI redesign needed (drop URL bar, full-bleed stream, move Chat/Teach/Watch/Auto out of inline pane into floating icon buttons anchored on the window edge like the existing drag/close buttons). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 12 Phase 99 commits (`9a61d78a..cd6f442a`).

- [ ] **Phase 100: Multi-Stream + Stream-Window Redesign** (V33-MULTI-01..05) — Close the four UAT gaps from Phase 99: (1) two concurrent WebApps must each have their OWN stream + own x11vnc port + own stream window (current single-stream-only is the kill-gate); (2) drop URL bar from stream window (URL is bound to the WebApp; redundant inside); (3) stream area fills the window (no toolbar chrome); (4) Chat/Teach/Watch/Auto inline panel REMOVED — replaced with a floating icon-button row anchored to the stream window's bottom edge (mirroring the existing top drag-to-move + close button pattern). Each button opens its own popover/sheet on click. Backend: investigate Chrome `--new-window` IPC merge against `--user-data-dir=/home/bruce/.config/livos-chrome` (likely root cause of single-stream symptom); if confirmed, switch to `--app=URL` site-specific-browser mode (no IPC merge AND chromeless windows — partial fix for G-99-UAT-2). Frontend: rewire `webapp-stream-window.tsx` + `webapp-toolbar.tsx` + `webapp-mode-selector.tsx` to the new shape. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED throughout (no `liv/packages/core/` edits).

  **Plans:** 5 plans (written 2026-05-08)
  - [x] 100-01-PLAN.md — Mini PC kill-gate (autonomous=false, user-walked SSH) — empirical H1..H4 root-cause probe + sacred-SHA pre-commit hook bootstrap (✓ 2026-05-08, commits a6c519fd + bb36e8d1: H1 verified, B1 fix locked)
  - [x] 100-02-PLAN.md — Backend argv swap `--new-window URL` → `--app=URL` (✓ 2026-05-08, commits 3bbcfb2f + 00a5b0bd: argv swap shipped, Test 11 invariant locked, 226/226 webapps+streaming tests green, sacred SHA preserved)
  - [x] 100-03-PLAN.md — Frontend full-bleed: drop URL bar + ResizablePanelGroup; root flex-col (✓ 2026-05-08, commits ff99ebfd + 6702780c: webapp-toolbar.tsx deleted, webapp-stream-window.tsx slimmed 776→524 lines, root flex-col + pb-9 reservation locked, 13/13 invariant tests green, sacred SHA preserved)
  - [x] 100-04-PLAN.md — Frontend bottom 4-icon action-bar + slide-in drawers Chat/Teach/Watch/Auto (✓ 2026-05-08, commits b2145d09 + b7e19f60 + af77d2e6: 4 drawer components shipped, bottom-bar at `absolute inset-x-0 bottom-0 z-20` wired with Sheet host `!w-[35%]` + `closeButton={false}`, second-click closes, WEBAPP_MODE_CHANGE_EVENT dispatch preserved, mode-selector collapsed to 22-line constants module, 17/17 invariant tests green, sacred SHA preserved)
  - [~] 100-05-PLAN.md — git push + Mini PC deploy via update.sh + user-walked UAT (✓ deploy GREEN 2026-05-08 — Mini PC `4954d9ba`; UAT 9/11 PASS via interactive checkpoint; FAIL on Row 3 click routing + Row 9 chat → bytebot scope; v33 milestone flip BLOCKED — Plan 100-06 queued for routing fix). Sacred SHA `f3538e1d…` preserved on disk + at HEAD.

  - [x] 100-06-PLAN.md (inline-executed) — UI revisions per user feedback after PARTIAL-PASS deploy: action bar moved OUTSIDE the WebApp window (mirrors window-chrome.tsx top close-button pattern; new `webapp-floating-action-bar.tsx`), round buttons (`rounded-full bg-white/90 backdrop-blur-xl + soft shadow` — close-button parity), Watch mode dropped (`webapp-watch-drawer.tsx` deleted; `WebAppMode` collapsed 4 → 3), fixed `1280×720` WebApp window resolution (`window-manager.tsx`). State via new `webapp-drawer-store.ts` (Zustand keyed by webappId). 21/21 invariants PASS, build clean. (✓ 2026-05-08, commit f18c8973; deployed Mini PC `f18c8973`)
  - [ ] 100-07-PLAN.md — Routing fix (creative: click bypass via `xdotool --window <wid>` tRPC mutation + chat MCP scoping system-prompt fix + explicit windowId on every bytebot tool call). Original 100-06 scope, renumbered when 100-06 was redirected to UI revisions on 2026-05-08.

  **Phase 100 status: PARTIAL-PASS 2026-05-08** — visual rewire + multi-stream creation work + 4 user-requested UI corrections shipped; routing fix queued as Plan 100-07. v33 milestone remains CODE-COMPLETE-PENDING-UAT-SIGNOFF until 100-07 ships and Phase 100 UAT re-walks the routing rows (R3 + R9) PASS. PHASE-SUMMARY.md committed.

**Dependency graph:**
```
P92 (metadata) ─┬─→ P94 (context menu) ─┐
                │                         ├─→ P95 (stream window + AI panel) ─┬─→ P96 (teach mode) ─┐
P93 (window mgr+vnc) ─────────────────────┘                                    │                      ├─→ P98 (UAT) ─→ P99 (VNC swap)
                                                                               └─→ P97 (auto mode)   ─┘
```

**Wave plan (parallel execution):**
- **Wave 1** (paralel — backend foundation): P92 + P93 — 2 paralel agents
- **Wave 2** (single — UI gateway): P94
- **Wave 3** (single — heaviest UI phase): P95
- **Wave 4** (paralel — agent capabilities): P96 + P97 — 2 paralel agents
- **Wave 5** (final): P98

**Locked decisions for v33 entry** (per v33-DRAFT.md §4):
- Host Chrome with `--new-window` per WebApp (no Docker containers — user explicit)
- Shared user Chrome profile across WebApps (Google login persists)
- Window discovery via xdotool title-poll (CDP deferred to v34)
- Per-window streaming via `x11vnc -id <wid>` + websockify (with ffmpeg/maim fallback if Mutter blocks)
- Single Mini PC user only in v33 (multi-user → v34)
- AI panel reuses v32 chat components (no new chat surface)
- Sacred `sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED throughout v33

---

### v31 Dependencies (legacy)

**Dependencies:**
```
P64 → P65 → P66 ─┬→ P67 ─┬→ P68 → P69 → P70
                  │        ├→ P73
                  │        ├→ P74
                  │        ├→ P75
                  │        ├→ P76
                  │        └→ P77 → P78
                  └→ P71 → P72
```

P65 (rename) blocks all subsequent. P66 (design system) provides tokens for P68/P69/P70/P71/P75/P76. P67 (core rebuild) blocks anything using new ToolCallSnapshot model. P71 (CU foundation) blocks P72 (CU agent loop). P73-P76 can run in parallel after P67 done.

**Locked decisions for v31 entry:**
- ONLY Suna UI patterns (NO Hermes UI)
- Side panel auto-opens ONLY for `browser-*`/`computer-use-*` tools
- Bytebot: desktop image only (Apache 2.0); agent code NOT used
- Subscription-only preserved (D-NO-BYOK)
- Single-user privileged Bytebot containers accepted
- Sacred file old "UNTOUCHED" rule retired (was stale memory; current SHA `9f1562be...` after 25 normal commits)

**Carry from v30.0 (mapped into v31 phases):**
- F7 Suna sandbox network blocker → P71 (Bytebot per-session container architecture solves this category)
- F2-F5 broker improvements → P74 (dedicated carryover phase)
- 14 carryforward UATs + Phase 63's 11 plan walks → P64 (v30.5 final cleanup)

---

## Phase Details

### Phase 64: v30.5 Final Cleanup at v31 Entry

**Goal:** Resolve all v30.0 carry-forward items before v31 momentum builds. Suna sandbox network blocker fixed; 14 carryforward UATs walked; Phase 63's 11 plan walks completed; external client compat matrix documented.

**Depends on:** Nothing (first phase of v31).

**Requirements:** CARRY-01..05

**Success criteria:**
1. Suna marketplace install → "Navigate to google.com" smoke test passes via Suna UI
2. 14 UAT files (4 v29.5 + 4 v29.4 + 6 v29.3) walked on Mini PC with results documented
3. Phase 63 R-series formal walkthrough complete (11 plans)
4. External client compat matrix doc written (Bolt.diy + Cursor + Cline + Continue.dev + Open WebUI quirks)
5. 3 v28.0 quick-tasks resolved or moved to backlog ✓ (P64-05, all 3 already-resolved — see `.planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-QUICK-TASK-TRIAGE.md`)

### Phase 65: Liv Rename + Foundation Cleanup

**Goal:** Project-wide cosmetic rename Nexus → Liv. Mechanical, high blast radius, must be atomic.

**Progress (2026-05-05):** 5/6 plans shipped — 65-01 (preflight), 65-02 (git mv + 6 package.json), 65-03 (source-code sweep, 4 commits), 65-04 (deploy scripts: update.sh + livos/install.sh + .github/workflows/{deploy,update-sh-smoke}.yml; Server4 deploy DELETED per HARD RULE; commit `65d584dc`), 65-06 (active docs + memory file). Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` preserved across all shipped plans. Pending: 65-05 (Mini PC migration script + LIVE CUTOVER user-walk).

**Depends on:** Phase 64 (v30.5 cleanup so we don't rename a half-broken state).

**Requirements:** RENAME-01..13 (RENAME-13 documentation update marked complete by 65-06)

**Success criteria:**
1. `git grep -i "nexus" liv/ livos/` returns 0 (allowed: archived planning docs) — ✅ achieved by 65-03
2. All systemd units green on Mini PC after `/opt/nexus/` → `/opt/liv/` migration — ⏳ awaits 65-05 cutover
3. Subscription Claude responds via `/v1/messages` post-rename — ⏳ awaits 65-05 smoke test
4. Mini PC migration script idempotent + rollback-ready (< 10 min rollback target) — ⏳ scripts authored in 65-05

### Phase 66: Liv Design System v1

**Goal:** Establish visual identity that produces "WOW" reaction. Tokens, motion language, typography, glow primitives, icon language.

**Depends on:** Phase 65 (rename complete; design tokens prefix `liv-` consistent).

**Requirements:** DESIGN-01..07

**Success criteria:**
1. Storybook/playground shows every token, motion, variant in one place
2. Side-by-side screenshot vs current ai-chat shows visible WOW differential
3. All shadcn liv-* variants render with proper accent + glow
4. Motion primitives reusable across subsequent phases — **MET (2026-05-04 via 66-02; FadeIn/GlowPulse/SlideInPanel/TypewriterCaret/StaggerList barrel exported from `@/components/motion`)**

### Phase 67: Liv Agent Core Rebuild

**Goal:** Replace direct WS streaming with Redis-as-SSE-relay. Introduce ToolCallSnapshot data model. Wrap SdkAgentRunner with new LivAgentRunner orchestrator.

**Depends on:** Phase 65 (uses `liv/` paths).

**Requirements:** CORE-01..07

**Success criteria:**
1. Browser refresh mid-agent-run → SSE catches up from last chunk
2. `stop` signal terminates loop within 1 iteration
3. Tool snapshots arrive paired (assistantCall + toolResult) not separate chunks
4. Reasoning chunks distinguished from text chunks in stream

**Plans:** 4 plans in 3 waves (4/4 complete ✅)
- [x] 67-01-PLAN.md (Wave 1) — RunStore: Redis-backed agent-run lifecycle (createRun/appendChunk/getChunks/subscribeChunks/setControl/markComplete/markError + 24h TTL) — ✅ done 2026-05-04, commits `a00523ca`+`eccbb8d8`, 7/7 tests pass, sacred SHA verified, CORE-01+CORE-02 complete
- [x] 67-02-PLAN.md (Wave 2, deps: 01) — LivAgentRunner: composition wrapper around SdkAgentRunner; reasoning extraction (D-14), tool snapshot batching (D-15), computer-use stub (D-16) — ✅ done 2026-05-04, commits `db740ffe`+`23a1a5a4`, 5/5 tests pass, sacred SHA verified, CORE-03..06 complete
- [x] 67-03-PLAN.md (Wave 3, deps: 01,02) — POST /api/agent/start + GET /api/agent/runs/:runId/stream (SSE with ?after= resume + 15s heartbeat) + POST /api/agent/runs/:runId/control — ✅ done 2026-05-04, commits `20ad516f`+`ef6a30d2`, 13/13 vitest pass, sacred SHA verified, CORE-07 complete (route surface; production runner factory wiring deferred to P68/P73)
- [x] 67-04-PLAN.md (Wave 1) — useLivAgentStream React hook (Zustand-backed; reconnect-after; ToolCallSnapshot dedupe by toolId) — ✅ done 2026-05-04, commits `599f7a9a`+`02dab648`, 44/44 tests pass

### Phase 68: Side Panel + Tool View Dispatcher

**Goal:** Port Suna's ToolCallSidePanel as LivToolPanel. Wire Zustand store. Tool view dispatcher with GenericToolView fallback. Auto-open behavior for visual tools only.

**Depends on:** Phase 66 (design tokens), Phase 67 (ToolCallSnapshot data model).

**Requirements:** PANEL-01..10

**Success criteria:**
1. Visual tool auto-open: Agent runs `browser-navigate` → panel slides in automatically, even if user previously closed
2. Non-visual tool no auto-open: Agent runs `execute-command` → no panel pop; tool inline; clickable to open
3. Click any tool call in chat → panel slides in, focuses that tool
4. Cmd+I → panel closes; stays closed until next visual tool

### Phase 69: Per-Tool Views Suite

**Goal:** Implement all 9 tool view components + inline tool row. Each visually distinct using Suna pattern.

**Depends on:** Phase 68 (panel + dispatcher framework).

**Requirements:** VIEWS-01..11

**Success criteria:**
1. Each tool type renders with distinct view component (visually verifiable)
2. Status transitions smooth (running → done with check icon morph)
3. Browser tool shows live VNC for computer-use category, static screenshot otherwise
4. Diff rendering correct on str-replace
5. Mobile readable for all 9 views

### Phase 70: Composer + Streaming UX Polish

**Goal:** Transform input composer into delightful interaction. Polish streaming feedback. Suna patterns + welcome screen. Mount LivToolPanel + wire useLivAgentStream snapshot bridge (deferred handoff from P67/P68).

**Depends on:** Phase 66 (design tokens), Phase 67 (streaming model + useLivAgentStream hook), Phase 68 (LivToolPanel + useLivToolPanelStore).

**Requirements:** COMPOSER-01..09

**Plans:** 8 plans in 3 waves
- [x] 70-01-PLAN.md (Wave 1) — LivComposer auto-grow textarea + file attachment + slash/mention trigger detection (COMPOSER-01, COMPOSER-02) — commits `0ae8e69b` (RED) + `e3cbb4c9` (GREEN); 14/14 vitest pass; build clean (41.91s); sacred SHA unchanged. SUMMARY: `70-01-SUMMARY.md`.
- [ ] 70-02-PLAN.md (Wave 1) — LivSlashMenu with 6+ built-in commands + filter helper (COMPOSER-03)
- [ ] 70-03-PLAN.md (Wave 1) — LivWelcome screen with greeting + 4 suggestion cards (COMPOSER-09)
- [ ] 70-04-PLAN.md (Wave 1) — LivStreamingText with TypewriterCaret + markdown gate (COMPOSER-05)
- [ ] 70-05-PLAN.md (Wave 1) — LivAgentStatus (6 visual states + GlowPulse) + LivTypingDots (500ms cycle) (COMPOSER-07, COMPOSER-08)
- [x] 70-06-PLAN.md (Wave 2, deps: 70-01) — LivStopButton color toggle (red↔cyan) + LivModelBadge inline (COMPOSER-02, COMPOSER-04) — commits `d9521f61` (RED) + `72367292` (GREEN); 13/13 vitest pass; build clean (45.63s); sacred SHA unchanged. SUMMARY: `70-06-SUMMARY.md`.
- [x] 70-07-PLAN.md (Wave 2, deps: 70-01) — LivMentionMenu placeholder (9 stub mentions, P76 swaps real data) (COMPOSER-04) — commits `7e09c8f9` (feat) + `9a91d7fd` (test); 13/13 vitest pass; build clean (37.89s); sacred SHA unchanged. SUMMARY: `70-07-SUMMARY.md`.
- [ ] 70-08-PLAN.md (Wave 3, deps: 70-01..70-07) — Integration: mount LivToolPanel + LivComposer + LivWelcome in index.tsx; wire useLivAgentStream snapshot bridge; swap chat-messages.tsx to LivAgentStatus/LivStreamingText/LivTypingDots (all 9 COMPOSER reqs)

**Success criteria:**
1. Type message → streaming caret hugs last token (no orphan)
2. Drag image → preview chip appears
3. Press `/` → slash menu opens with 6+ commands
4. First open → welcome screen with 4 suggestion cards visible

### Phase 71: Computer Use Foundation

**Goal:** Get bytebot-desktop image installed per-user, react-vnc embedding live, app gateway authenticating /computer-use endpoint.

**Depends on:** Phase 65 (uses `liv/` naming for env vars + paths).

**Requirements:** CU-FOUND-01..07

**Success criteria:**
1. User triggers "/computer start" → container spawns within 15s
2. VNC iframe loads, shows XFCE desktop
3. User can take over mouse (viewOnly=false)
4. Idle 30 min → container stops, next start fresh
5. Single user constraint enforced (max 1 active container per user account)

### Phase 72: Computer Use Agent Loop

**Goal:** Wire Liv agent to bytebotd. Agent issues 16 Bytebot tools, screenshots come back as tool results, NEEDS_HELP flow when agent stuck.

**Depends on:** Phase 71 (CU foundation), Phase 67 (LivAgentRunner with computer-use tool routing hook).

**Requirements:** CU-LOOP-01..07

**Success criteria:**
1. "Navigate to google.com and search 'weather'" → end-to-end works, side panel shows live VNC, screenshots per step
2. "Open Firefox and read https://news.ycombinator.com" → application tool launches, browser navigation, content extracted
3. Agent stuck (e.g., login page) → emits NEEDS_HELP → user takes over → completes login → returns control → agent resumes

**Plans:** 9 plans (2 shipped + 7 new native plans), 3 waves (RE-ARCHITECTED #2 2026-05-05 — NATIVE X11 PORT FINAL; old 72-03..06 + 72-mcp-01..06 all superseded; see 72-CONTEXT.md D-NATIVE-* register)
- [x] 72-01-PLAN.md (Wave 0, shipped) — 17 Bytebot tool schemas verbatim copy in livinityd computer-use module (CU-LOOP-01) — REUSED by NEW#3 architecture
- [x] 72-02-PLAN.md (Wave 0, shipped) — Bytebot system prompt verbatim copy; REUSED in NEW#3 (kept for future direct-prompt mode in P75) (CU-LOOP-03)
- [~] 72-03-PLAN.md (DEPRECATED OLD#1 — bytebot-desktop container approach)
- [~] 72-04-PLAN.md (DEPRECATED OLD#1 — BYTEBOT_LLM_PROXY_URL env-var spec)
- [~] 72-05-PLAN.md (DEPRECATED OLD#1 — NEEDS_HELP UI via RunMeta)
- [~] 72-06-PLAN.md (DEPRECATED OLD#1 — old integration test + UAT)
- [~] 72-mcp-01-PLAN.md (DEPRECATED OLD#2 — bytebot-mcp MCP server wrapping bytebotd HTTP daemon)
- [~] 72-mcp-02-PLAN.md (DEPRECATED OLD#2 — BytebotdHttpClient HTTP wrapper)
- [~] 72-mcp-03-PLAN.md (DEPRECATED OLD#2 — categorize patch under MCP HTTP arch; carried forward into 72-native-05)
- [~] 72-mcp-04-PLAN.md (DEPRECATED OLD#2 — registerBytebotMcpServer under MCP HTTP arch; carried forward into 72-native-06)
- [~] 72-mcp-05-PLAN.md (DEPRECATED OLD#2 — LivNeedsHelpCard under MCP HTTP arch; carried forward into 72-native-05)
- [~] 72-mcp-06-PLAN.md (DEPRECATED OLD#2 — UAT under MCP HTTP arch; superseded by 72-native-07)
- [x] 72-native-01-PLAN.md (Wave 1) — native/screenshot.ts via @nut-tree-fork/nut-js screen.capture (CU-LOOP-02)
- [x] 72-native-02-PLAN.md (Wave 1) — native/input.ts via nut-js mouse + keyboard (CU-LOOP-02)
- [x] 72-native-03-PLAN.md (Wave 1) — native/window.ts via wmctrl spawn (CU-LOOP-02)
- [x] 72-native-04-PLAN.md (Wave 1) — LivDesktopViewer UI (replaces deprecated react-vnc role) + computerUse.takeScreenshot tRPC (CU-LOOP-05)
- [x] 72-native-05-PLAN.md (Wave 2, deps: native-01..03) — mcp/server.ts + mcp/tools.ts + categorizeTool patch + LivNeedsHelpCard UI (CU-LOOP-04, CU-LOOP-05)
- [ ] 72-native-06-PLAN.md (Wave 2, deps: native-01..03,05) — bytebot-mcp-config.ts + livinityd boot wire + ALLOWED_COMMANDS tsx patch (CU-LOOP-06)
- [ ] 72-native-07-PLAN.md (Wave 3, deps: native-01..06) — Mini PC UAT walk + install.sh patch + computer-use-deploy.sh; autonomous=false, human-verify (CU-LOOP-07)

### Phase 73: Reliability Layer

**Goal:** Make agent runs survive crashes, reconnects, long durations. ContextManager prevents Kimi window overflow. BullMQ backgrounds long tasks.

**Depends on:** Phase 67 (run-store base), Phase 72 (computer-use long runs need this).

**Requirements:** RELIAB-01..06

**Success criteria:**
1. 3-hour agent run survives without context overflow error
2. Browser refresh mid-run → SSE catches up, no chunks lost
3. Stop button mid-run → loop terminates within 1 iteration
4. Pause + Resume → run continues from exact state

### Phase 74: F2-F5 Carryover from v30.5

**Goal:** Tackle 4 deferred broker improvements that were in v30.5 scope.

**Depends on:** Phase 67 (broker integration via LivAgentRunner).

**Requirements:** BROKER-CARRY-01..05

**Success criteria:**
1. Type "hi" → tokens stream visibly word-by-word (cadence test)
2. Long tool chain → no `tool_use_id mismatch` errors (Kimi strict validation)
3. 10-min agent run → no Caddy 504 timeouts
4. Ask agent "who are you?" → consistent "Liv Agent powered by Kimi" response

### Phase 75: Reasoning Cards + Lightweight Memory

**Goal:** Show Kimi reasoning to user via custom Liv-designed reasoning card. Implement minimal memory via Postgres tsvector FTS.

**Depends on:** Phase 67 (reasoning chunk emission), Phase 66 (GlowPulse motion primitive).

**Requirements:** MEM-01..08

**Success criteria:**
1. Kimi reasoning collapsible card visible in chat with amber glow when streaming
2. Conversation history search returns highlighted snippets within 300ms debounced
3. Pinned messages auto-injected into agent context
4. Export thread as Markdown / JSON works

### Phase 76: Agent Marketplace + Onboarding Tour

**Goal:** Browse/clone agent templates (Suna pattern adapted). First-run tour that triggers WOW.

**Depends on:** All previous phases (showcase the full UX).

**Requirements:** MARKET-01..07

**Success criteria:**
1. User opens marketplace → sees 8+ agent templates with cards
2. "Add to Library" clones template → appears in user's agent list
3. First-time user opens AI Chat → 9-step tour plays automatically
4. Tour replayable from Settings

---

### Phase 100: Multi-Stream + Stream-Window Redesign

**Goal:** Close the four UAT gaps from Phase 99 so v33 (WebApp Launcher) can ship: (1) two concurrent WebApps must each get their own independent stream + own x11vnc port + own stream window component; (2) drop URL bar from stream window — URL is bound to the WebApp icon and redundant inside the stream view; (3) stream area fills the window (no inline toolbar/agent panel chrome below it, only the standard top drag-strip + close-X); (4) Chat / Teach / Watch / Auto inline pane removed and replaced with a floating icon-button row anchored to the stream window's bottom edge (mirrors the existing top drag/close pattern), each button opening its own slide-in drawer (~35% window width). Backend root-cause work is empirical-first on the Mini PC: 100-01 verifies which of H1..H4 (Chrome `--new-window` IPC merge vs. xdotool matcher race vs. frontend single-render vs. wid-collision-via-merge) is the real cause; 100-02 implements the locked fix (default candidate: swap `--new-window URL` → `--app=URL` site-specific-browser mode, which also delivers full-bleed chromeless windows for free → solves G-99-UAT-2 in the same commit). 100-03/100-04 do the frontend rewire. 100-05 deploys to Mini PC + walks UAT-CHECKLIST.md A-J with the user.

**Depends on:** Phase 99 (PARTIAL-PASS — RFB protocol swap shipped; Phase 100 inherits `vnc-bridge.ts`, `stream-manager.ts` discriminated union, WS dispatch, fresh `VNC_PORT_COUNTER` ring 15900..16099 — all locked / unmodified).

**Requirements:** V33-MULTI-01..05

**Locked decisions (D-100-*):**
- **D-100-SACRED:** `liv/packages/core/src/sdk-agent-runner.ts` SHA must equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every commit (pre/post `git hash-object` gate).
- **D-100-NO-SERVER4:** Mini PC `bruce@10.69.31.68` only.
- **D-100-NO-BYOK:** Subscription-only Agent SDK; no `@anthropic-ai/sdk` paths.
- **D-100-FMP4-ALIVE:** `Fmp4Fanout`, `encoder-args`, `pipewire-portal`, `geometry-tracker` preserved byte-for-byte (desktop-stream native app keeps using them).
- **D-100-SHARED-PROFILE:** Chrome continues to share `/home/bruce/.config/livos-chrome` (no per-WebApp profile dir; loses Google login if split).
- **D-100-X11VNC-CANONICAL:** Phase 99-02 `spawnVncForWindow` argv recipe is locked, not modified.
- **D-100-LIVE-VERIFY-FIRST:** No 100-02 backend change ships until 100-01 has empirically pinned the real root cause on the Mini PC.

**Success criteria (UAT-walkable):**
1. Open WebApp A → stream window opens at port 15900, RFB handshake, captured Chrome visible.
2. Open WebApp B → SECOND stream window opens at port 15901, independent RFB handshake, independent Chrome window with different URL captured.
3. Both stream windows render simultaneously; mouse input in one does not reach the other.
4. Each window has NO URL bar — only the standard drag-strip + close-X.
5. Stream area fills the window (no inline toolbar/agent panel below it).
6. Bottom edge of each window has a row of 4 icon-buttons (Chat / Teach / Watch / Auto).
7. Clicking Chat opens a slide-in drawer with the chat surface; second click closes; opens again on Chat-icon click.
8. Clicking Teach opens the teach-recorder UI in a slide-in drawer; same close behavior; same swap-on-other-button-click behavior.
9. Bytebot Auto mode in WebApp A does not interfere with WebApp B (per-window MCP env confirmed via `BYTEBOT_TARGET_WINDOW_ID`).
10. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all Phase 100 commits.
11. Mini PC user-walked UAT signoff documented in `UAT-CHECKLIST.md` sections A-J → v33 milestone flips to ✅ Shipped.

---

### Phase 101: LivOS Universal App Orchestration

**Goal:** Six-pillar orchestration upgrade per user UAT 2026-05-10:
- (A) Tek Chrome process + multi-port per-app stream (same Google login across all)
- (B) Ubuntu native apps as first-class LivOS citizens (dock-launchable + auto-stream)
- (C) Luse window-context auto-awareness (chat session knows hangi pencerede)
- (D) SelfClaude action-driven Teach (click → instruction popover → step)
- (E) Chat animations (thinking dots + idle pulse)
- (F) Hermes per-tool phrase relay (close 100-10-10 backend gap)

**Full context:** `.planning/phases/101-livos-universal-app-orchestration/101-CONTEXT.md` (10 sub-plans, 4 parallel waves, locked decisions D-101-*, 20-row UAT)

**Trigger:** 2026-05-10 live diagnostic on Mini PC during Phase 100-10. Per-WebApp Xvfb (`:10`, `:11`, ...) was code-correct but every new `--app=URL` spawn IPC-redirected to the existing Chrome PID on `:10`, so no window appeared on `:11`. User chose to keep shared profile → 100-10-08 restored Phase 99 single-display + per-wid x11vnc behavior. The user's actual long-term vision — Luse opens ports + spawns multi-screen Chrome targets + navigates between windows + teaching mode compatible — needs a different architecture: drive ONE Chrome process via CDP, create multiple Target/Browser contexts, and bind x11vnc / capture per-target.

**Direction (high-level — Phase 101 CONTEXT will harden):**
- Run a single Chrome with `--remote-debugging-port=<N>` against `/home/bruce/.config/livos-chrome` (singleton-friendly).
- Use CDP `Target.createBrowserContext` / `Target.createTarget({url, browserContextId})` to spawn isolated tab/window targets while sharing the user-data-dir.
- Each Luse-driven target gets its own wid (via `Browser.getWindowForTarget` + `Browser.setWindowBounds`); x11vnc per-wid (D-99-01 baseline) captures it.
- Luse MCP tools (`mcp__luse__list_windows`, `screenshot_window`, `focus_window`, `create_stream`, `list_streams` from 100-10-03/04) keep their public shape; their internals shift from xdotool/wmctrl primitives to CDP-aware calls.
- The 100-10-08 scaffolding (`DisplayAllocator`, `xvfbStartFn`/`fluxboxStartFn` opts, `-display :N` branch in `vnc-bridge.ts`, `VncWindowTarget = {display: string}` variant, `LuseMcpDescriptor.display` override) is retained for the case where Phase 101 needs per-display targets for parity (e.g., second physical display, remote rendering, debug surfaces).

**Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST stay untouched. Pre-commit hook continues to enforce.

**Phase 101 sub-goals (tracked):**
- A. CDP-driven Luse orchestration — same-profile multi-target Chrome via Chrome DevTools Protocol (see Direction above)
- B. SelfClaude action-driven Teach pattern — event-driven click + per-step instruction prompt; replaces today's interval-based frame capture. See `.planning/phases/100-multi-stream-window-redesign/100-10-12-RESEARCH.md` for design input.
- C. Per-tool streaming backend bridge — agent-session.ts → runStore status_detail relay so Hermes phrase reaches WebApp chat UI (gap identified in 100-10-10 SUMMARY)

**Status:** CONTEXT authored 2026-05-10 (101-CONTEXT.md). Ready for `/gsd-plan-phase 101 --chain` or `/gsd-autonomous --only 101`.

**Decomposition:** 10 sub-plans across 4 parallel waves:
- **Wave 1 (3 plans, parallel):** 101-01 Chrome CDP bootstrap, 101-02 port allocator (15900..15999), 101-03 native app spawner
- **Wave 2 (3 plans, parallel):** 101-04 CDP WebApp spawn (replaces window-manager argv), 101-05 native app stream binder, 101-06 Luse auto-context injection
- **Wave 3 (3 plans, parallel):** 101-07 LivOS dock native app UI, 101-08 SelfClaude Teach v3 refactor, 101-09 chat animations + Hermes phrase relay
- **Wave 4 (1 plan, user-walked):** 101-10 Mini PC deploy + 20-row UAT

**Plans:** 11 plans (Wave 0 scaffolding plan added — 101-00)

Plans:
- [x] 101-00-PLAN.md — Wave 0 test-stub scaffolding + chrome-remote-interface install + test:run scripts (SHIPPED 2026-05-11 `1cfafcfe..39297f8c`)
- [ ] 101-01-PLAN.md — Chrome CDP bootstrap + chrome-remote-interface install + livinityd wire-up
- [ ] 101-02-PLAN.md — Per-app stream port allocator (15900..15999) + StreamManager refactor
- [ ] 101-03-PLAN.md — Native app spawner + Redis config store + tRPC apps.native.{list,create,delete,get}
- [ ] 101-04-PLAN.md — CDP-driven WebApp spawn (rewrites window-manager.spawn body)
- [ ] 101-05-PLAN.md — Native app window-bind + apps.native.spawn(id) stream wire-up
- [ ] 101-06-PLAN.md — Luse auto-context injection (activeWid + activeAppMeta in WS envelope)
- [ ] 101-07-PLAN.md — Dock native-app form + icon + launch hook (UI)
- [ ] 101-08-PLAN.md — SelfClaude Teach v3 (event-driven recorder + popover + v3 replay)
- [ ] 101-09-PLAN.md — Chat thinking-dots + idle-pulse + Hermes status_detail relay (Pillar E+F)
- [ ] 101-10-PLAN.md — Mini PC deploy + 20-row UAT walk (autonomous: false)

---

### Phase 102: Per-App Display Pivot

**Goal:** Correct Phase 101's CDP-on-shared-`:1` architecture mistake (user UAT 2026-05-11). Each app gets a DEDICATED Xvfb display + its own Chrome process. Master profile seed-copy at spawn time gives same Google login across all apps without sharing user-data-dir (singleton lock isolated). x11vnc captures whole display (no WID polling). Luse coords 1:1 with 1280x720 (no 1920x1080 drift).

**Full context:** `.planning/phases/102-per-app-display-pivot/102-CONTEXT.md` (10 sub-plans, 4 parallel waves, locked decisions D-102-*, 25-row UAT)

**Trigger:** 2026-05-11 user UAT verbatim: "Yeni screen derken ayri Xvfb display mi istiyorsun evet. Ayni screen de iki farkli yayin yapiyorsun ustuste bindiginde sorun cikiyor. Luse duzgun kullanamiyor ayrica luse ssleri 1920x1080 aliyor bizim screen res farkli." SelfClaude reference works well (per-app user-data-dir pattern). Phase 102 adopts it + master profile seed-copy for shared Google login.

**Direction:**
- Per-app Xvfb `:N` (N ∈ 10..99) at 1280x720x24
- Per-app Chrome subprocess with own `--user-data-dir=/tmp/livos-chrome-app-<uuid>` (singleton-isolated)
- Master profile at `/opt/livos/data/chrome-master/` seeded via `cp -r` at every spawn (~10MB, ~200ms)
- Chromeless fullscreen Chrome via `--app=URL --start-fullscreen` flags
- x11vnc `-display :N` whole-screen capture (no `-id <wid>` WID filter)
- Luse env switches `LUSE_TARGET_WINDOW_ID` → `LUSE_TARGET_DISPLAY=:N` (all X11 ops scope to :N)
- Master Chrome Login UI in Settings (one-time login → all apps inherit)
- Clean shutdown lifecycle (Chrome + x11vnc + Xvfb + /tmp dir cleanup)

**Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.

**Phase 101 salvage:** ~70% retained (PortAllocator, NativeAppSpawner, Luse auto-context, dock UI, Teach v3, chat anims, Hermes relay). Replaced: 101-04 CDP-driven spawn → 102-04 Xvfb + Chrome subprocess spawn. Optional: 101-01 ChromeCdpClient kept but not wired in v1 (per-app Chrome doesn't need CDP control unless Luse later requires it).

**Status:** CONTEXT authored 2026-05-11 (102-CONTEXT.md). Ready for `/gsd-autonomous --only 102`.

**Decomposition:** 10 sub-plans across 4 parallel waves:
- **Wave 1 (3 plans, parallel):** 102-01 DisplayAllocator + XvfbSpawner, 102-02 ChromeProcessSpawner, 102-03 MasterProfileSeeder
- **Wave 2 (3 plans, parallel):** 102-04 window-manager rewrite (Xvfb + Chrome subprocess flow), 102-05 native-app-binder display swap, 102-06 Luse env switch (LUSE_TARGET_DISPLAY)
- **Wave 3 (3 plans, parallel):** 102-07 Master Chrome Login UI, 102-08 close lifecycle (kill Chrome+x11vnc+Xvfb+rm /tmp), 102-09 x11vnc -display :N rewrite
- **Wave 4 (1 plan, user-walked):** 102-10 Mini PC deploy + 25-row UAT

**Plans:** 10 plans (Wave 0 not needed — test stubs added per-plan)

Plans:
- [ ] 102-01-PLAN.md — DisplayAllocator + XvfbSpawner
- [ ] 102-02-PLAN.md — ChromeProcessSpawner (per-app subprocess + --app=URL fullscreen)
- [ ] 102-03-PLAN.md — MasterProfileSeeder (cp -r master → app dir)
- [ ] 102-04-PLAN.md — window-manager rewrite (Xvfb + Chrome process + x11vnc orchestrator)
- [ ] 102-05-PLAN.md — native-app-binder display swap (DisplayAllocator instead of WM_CLASS)
- [ ] 102-06-PLAN.md — Luse LUSE_TARGET_DISPLAY env switch
- [ ] 102-07-PLAN.md — Master Chrome Login UI in Settings
- [ ] 102-08-PLAN.md — App close lifecycle (clean Chrome+x11vnc+Xvfb+/tmp)
- [ ] 102-09-PLAN.md — x11vnc -display :N whole-screen rewrite
- [ ] 102-10-PLAN.md — Mini PC deploy + 25-row UAT walk (autonomous: false)

---

### Phase 103: Master Chrome Streaming + Single-MCP Display-Aware

**Goal:** Close the two functional loose ends from Phase 102 by (a) making the Master Chrome Login flow usable on a headless Mini PC via the existing per-app streaming pipeline (Xvfb + x11vnc + noVNC viewer embedded in the Settings panel), and (b) replacing the 1-MCP-server-per-WebApp luse architecture with a single global display-aware MCP whose tools accept an optional `display: ":N"` arg — eliminating the Claude Code wildcard-permission prompt the user explicitly rejected ("permissionu vermek istemiyorum bunu tek mcp den coz").

**Trigger:** 2026-05-11 user UAT on Phase 102 r14 deploy. (1) Master Chrome Login button spawns Chrome on the host `:0` display which is invisible on a headless box ("Open Master Chrome buna tikliyorum ama acilmiyor en azindan streaming baslasa pencereden iyi olurdu"). (2) Phase 102 r12 hot-fix Bug B mandate: per-WebApp Luse MCP creates one MCP entry per WebApp (`luse:webapp:<slug>-<uuid>`), forcing Claude Code to prompt for wildcard permission per registration. User explicitly chose single-MCP redesign over per-app: "permissionu vermek istemiyorum bunu tek mcp den coz".

**Direction:**
- **Master Chrome streaming (sub-goal A):**
  - Allocate a managed Xvfb display (DisplayAllocator) for the master login session — NOT `:0`
  - Reuse `chrome-process-spawner.ts` shape but with `--user-data-dir=/opt/livos/data/chrome-master/` (skip profile-seeder; the master IS the seed source)
  - Spawn `x11vnc -display :N -rfbport <allocated>` + create a StreamSession via existing stream-manager
  - `chromeMaster.startLogin` returns `{wsUrl, streamId, display, pid, startedAt}`
  - UI: master-chrome-login.tsx renders `useWebAppVnc(wsUrl)` viewer inline when running; existing canvas + tRPC click/key/scroll dispatch reused (master is a special WebApp under the hood)
  - Lifecycle: master Chrome exit (user closes window in noVNC) → stream stops + Xvfb killed + display released; profile is now populated and persisted in `/opt/livos/data/chrome-master/` for subsequent per-app `cp -r` seeds
- **Single-MCP display-aware (sub-goal B):**
  - Default `LIVOS_PER_APP_LUSE=0` (skip per-app MCP registration entirely)
  - Modify global `luse` MCP server (`livos/packages/livinityd/source/modules/computer-use/mcp/server.ts`) — add optional `display: ":N"` param to relevant tools (list_windows, computer_screenshot, computer_click_mouse, computer_type, computer_press_keys, computer_drag_mouse, etc.); tool handlers set `DISPLAY=:N` env when executing X11 ops via execFile; default fallback `LUSE_TARGET_DISPLAY` (=`:1`)
  - Modify `buildActiveDisplaySnippet` (carried from 102-06): instruct agent in system prompt to ALWAYS pass `display: ":N"` arg when scoping to active WebApp
  - Result: 1 global MCP, ~20 tools, scoping via param — cleaner tool surface for the agent and no Claude Code wildcard permission prompt
- **UX polish carry-overs:**
  - Settings → Chrome Profile theme-aware text colours (already shipped in r14a — Phase 103 carries the regression test)
  - Master Chrome inner-block duplicate header removal (already shipped in r14a)

**Sacred:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.

**Depends on:** Phase 102 (Wave 0-3 SHIPPED; sub-goal A reuses 102-01 DisplayAllocator + 102-02 ChromeProcessSpawner shape + 102-09 x11vnc -display capture path; sub-goal B drops 102-06 per-app luse-mcp-config and re-shapes its `LUSE_TARGET_DISPLAY` env into a per-call MCP tool arg).

**Status:** Planned 2026-05-11 (6 plans, 3 waves). Run `/gsd-execute-phase 103` to begin Wave 1.

**Plans:** 6 plans

Plans:
- [x] 103-01-PLAN.md — Sub-goal A backend: widen chrome-process-spawner USER_DATA_DIR_RE + refactor master-login-routes to factory-injected router with startLogin/stopLogin/input.* (Wave 1) — ✅ Shipped 2026-05-11 (`978f7bae..f0f09922`, 3 commits, sacred SHA preserved)
- [ ] 103-02-PLAN.md — Sub-goal A UI: embedded noVNC viewer + input dispatch in master-chrome-login.tsx (Wave 2)
- [x] 103-03-PLAN.md — Sub-goal B native: withScopedDisplay + display arg on 13 X11-touching luse tools (Wave 1) — ✅ Shipped 2026-05-11 (`d38af35f..2bd32a25`, 3 commits, sacred SHA preserved)
- [x] 103-04-PLAN.md — Sub-goal B prompt: buildActiveDisplaySnippet prescriptive "MUST pass display" instruction (Wave 1) — ✅ Shipped 2026-05-11 (`dc86a7c2..cab8b331`, 2 commits TDD RED+GREEN, sacred SHA preserved)
- [ ] 103-05-PLAN.md — Sub-goal B production: flip LIVOS_PER_APP_LUSE default OFF + orphan-sweep boot pass (Wave 2)
- [ ] 103-06-PLAN.md — Deploy + 12-row UAT walk (Wave 3, autonomous: false)

**Non-goals (deferred to later phase):**
- Two-way profile sync (auth changes in app A propagate back to master) — keep one-way master → apps from Phase 102
- Per-app profile retention (user marks "save this app's state for next launch")
- Master Chrome multi-account (multiple Google identities) — single profile only

---

## Coverage

All v31 requirements (CARRY/RENAME/DESIGN/CORE/PANEL/VIEWS/COMPOSER/CU-FOUND/CU-LOOP/RELIAB/BROKER-CARRY/MEM/MARKET) mapped to phases 64-76. 100% coverage. See REQUIREMENTS.md Traceability table (filled by phase planning).

---

## Project-Level Milestone Index (carry-over)

- v19.0 Custom Domain Management (shipped 2026-03-27)
- v20.0 Live Agent UI (shipped 2026-03-27)
- v21.0 Autonomous Agent Platform (shipped 2026-03-28)
- v22.0 Livinity AGI Platform (shipped 2026-03-29)
- v23.0 Mobile PWA (shipped 2026-04-01)
- v24.0 Mobile Responsive UI (shipped 2026-04-01)
- v25.0 Memory & WhatsApp Integration (shipped 2026-04-03)
- v26.0 Device Security & User Isolation (shipped 2026-04-24)
- v27.0 Docker Management Upgrade (shipped 2026-04-25)
- v28.0 Docker Management UI (Dockhand-Style) (shipped 2026-04-26)
- v29.0 Deploy & Update Stability (shipped 2026-04-27)
- v29.2 Factory Reset (shipped 2026-04-29)
- v29.3 Marketplace AI Broker (Subscription-Only) (shipped local 2026-05-01)
- v29.4 Server Management Tooling + Bug Sweep (shipped local 2026-05-01)
- v29.5 v29.4 Hot-Patch Recovery + Verification Discipline (shipped local 2026-05-02 via `--accept-debt`)
- v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope) (shipped local 2026-05-04 via `--accept-debt`)
- **v31.0 Liv Agent Reborn** (active — Phases 64-76)
- **v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime** (CODE-COMPLETE 2026-05-06 — Phases 80-91 — pending UAT)
- **v33.0 WebApp Launcher + Teach/Auto Modes** (CODE-COMPLETE 2026-05-08 — Phases 92-98 — pending UAT)
- (deferred) Backup & Restore — 8 phases defined in `milestones/v30.0-DEFINED/`, renumbered to future slot (likely v32.0)

---

*Last updated: 2026-05-08 — v33.0 milestone CODE-COMPLETE (Phases 92-98 shipped; final flip to ✅ Shipped deferred to post-UAT signoff per `feedback_milestone_uat_gate.md`).*

