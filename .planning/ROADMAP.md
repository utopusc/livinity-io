# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- ✅ **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (shipped local 2026-05-01) — see [milestones/v29.4-ROADMAP.md](milestones/v29.4-ROADMAP.md)
- ✅ **v29.5 v29.4 Hot-Patch Recovery + Verification Discipline** — Phases 49-54 (shipped local 2026-05-02 via `--accept-debt`) — see [milestones/v29.5-ROADMAP.md](milestones/v29.5-ROADMAP.md)
- ✅ **v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope)** — Phases 56-63 (shipped local 2026-05-04 via `--accept-debt`) — see [milestones/v30.0-ROADMAP.md](milestones/v30.0-ROADMAP.md)
- ✅ **v31.0 Liv Agent Reborn** — Phases 64-79 (closed 2026-05-05 — P77+P78+P79 hot-fix wave shipped same day; bytebot MCP working end-to-end via host GNOME desktop)
- ✅ **v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime** — Phases 80-91 (CODE-COMPLETE 2026-05-06 via autonomous wave-based dispatch; pending Mini PC UAT signoff — see [.planning/phases/91-uat-polish/UAT-CHECKLIST.md](phases/91-uat-polish/UAT-CHECKLIST.md))
- ⏸ **(deferred) Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes as future slot e.g. v33.0)

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
- (deferred) Backup & Restore — 8 phases defined in `milestones/v30.0-DEFINED/`, renumbered to future slot (likely v32.0)

---

*Last updated: 2026-05-04 — v31.0 milestone opened with 13 phases (64-76); REQUIREMENTS.md derived from `.planning/v31-DRAFT.md` user-validated plan*
