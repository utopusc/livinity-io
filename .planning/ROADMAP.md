# Roadmap — LivOS

## Milestones

- ✅ **v29.3 Marketplace AI Broker (Subscription-Only)** — Phases 39-44 (shipped local 2026-05-01) — see [milestones/v29.3-ROADMAP.md](milestones/v29.3-ROADMAP.md)
- ✅ **v29.4 Server Management Tooling + Bug Sweep** — Phases 45-48 (shipped local 2026-05-01) — see [milestones/v29.4-ROADMAP.md](milestones/v29.4-ROADMAP.md)
- ✅ **v29.5 v29.4 Hot-Patch Recovery + Verification Discipline** — Phases 49-54 (shipped local 2026-05-02 via `--accept-debt`) — see [milestones/v29.5-ROADMAP.md](milestones/v29.5-ROADMAP.md)
- ✅ **v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope)** — Phases 56-63 (shipped local 2026-05-04 via `--accept-debt`) — see [milestones/v30.0-ROADMAP.md](milestones/v30.0-ROADMAP.md)
- 🟢 **v31.0 Liv Agent Reborn** — Phases 64-76 (active; consumes [REQUIREMENTS.md](REQUIREMENTS.md))
- ⏸ **(deferred) Backup & Restore** — paused, 8 phases / 47 BAK-* reqs defined in [milestones/v30.0-DEFINED/](milestones/v30.0-DEFINED/) (resumes as future slot e.g. v32.0)

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
- [ ] **Phase 65: Liv Rename + Foundation Cleanup** (RENAME-01..13) — Nexus → Liv project-wide (~5,800 occurrences); `nexus/` → `liv/` git mv; @nexus/* → @liv/*; NEXUS_* → LIV_*; nexus:* Redis → liv:*; Mini PC `/opt/nexus/` → `/opt/liv/` migration
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

**Dependencies:**
```
P64 → P65 → P66 ─┬→ P67 ─┬→ P68 → P69 → P70
                  │        ├→ P73
                  │        ├→ P74
                  │        ├→ P75
                  │        └→ P76
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

**Depends on:** Phase 64 (v30.5 cleanup so we don't rename a half-broken state).

**Requirements:** RENAME-01..13

**Success criteria:**
1. `git grep -i "nexus" liv/ livos/` returns 0 (allowed: archived planning docs)
2. All systemd units green on Mini PC after `/opt/nexus/` → `/opt/liv/` migration
3. Subscription Claude responds via `/v1/messages` post-rename
4. Mini PC migration script idempotent + rollback-ready (< 10 min rollback target)

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

**Plans:** 6 plans in 4 waves
- [ ] 72-01-PLAN.md (Wave 1) — 16 Bytebot tool schemas verbatim copy in livinityd computer-use module (CU-LOOP-01)
- [ ] 72-02-PLAN.md (Wave 1) — Bytebot system prompt verbatim copy with 3 narrow D-12 edits (You are Liv / 1280x960 / NEEDS_HELP+COMPLETED) (CU-LOOP-03)
- [ ] 72-03-PLAN.md (Wave 2, deps: 72-01,72-02) — BytebotBridge HTTP client + createComputerUseRouter factory + LivAgentRunner D-16 stub replacement (preserves fallback) + agent-runs.ts wiring under BYTEBOT_BRIDGE_ENABLED gate (CU-LOOP-02, CU-LOOP-04)
- [ ] 72-04-PLAN.md (Wave 2, deps: 72-01) — BYTEBOT_LLM_PROXY_URL env-var spec + D-NO-BYOK gate (validateBytebotLlmProxyUrl rejects api.anthropic/openai/kimi/moonshot) + buildBytebotComposeEnvBlock helper + operator doc (CU-LOOP-06)
- [ ] 72-05-PLAN.md (Wave 3, deps: 72-03) — LivNeedsHelpCard with amber+GlowPulse + Take over/Provide guidance/Cancel + post-takeover button morph; useLivAgentStream extended with runMeta; LivToolPanel mount (autonomous=false, human-verify) (CU-LOOP-05)
- [ ] 72-06-PLAN.md (Wave 4, deps: 72-01..72-05) — Integration test (fake bytebotd, 7 scenarios) + Mini PC UAT walk script (3 ROADMAP scenarios) (autonomous=false, human-verify, BLOCKED until P71 deployed) (CU-LOOP-07)

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
