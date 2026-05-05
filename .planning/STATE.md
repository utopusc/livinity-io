---
gsd_state_version: 1.0
milestone: v31.0
milestone_name: Liv Agent Reborn
status: Server5 platform.apps.suna row updated (env-override fix shipped); scripts/suna-insert.sql synced; Mini PC redeploy + browser smoke test deferred to user-walk
last_updated: "2026-05-05T01:05:00.000Z"
last_activity: "2026-05-05 — P68-05 LivToolPanel shipped: 14/14 vitest pass; commits `e830bd23` (component, race-attributed to 73-05) + `4f5c0857` (test). PANEL-08 + PANEL-09 marked complete. Phase 68 now 5/7."
progress:
  total_phases: 10
  completed_phases: 4
  total_plans: 57
  completed_plans: 37
  percent: 65
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v31.0 Liv Agent Reborn — Nexus → Liv rename + Suna-only UI overhaul + Bytebot computer use
**Last shipped milestone:** v30.0 Livinity Broker Professionalization (incl. v30.5 informal scope) — closed 2026-05-04 via `--accept-debt`
**Next action:** Walk Steps A + B documented in `.planning/phases/64-v30-5-final-cleanup-at-v31-entry/64-SUNA-FIX-EVIDENCE.md` (Mini PC redeploy + Suna "Navigate to google.com" smoke test). Then re-invoke `/gsd-execute-phase 64` to close out 64-04, or move to Phase 65 (NOT autonomous — see v31-DRAFT.md line 177).

## Current Position

Phase: 64 (v30.5 Final Cleanup) — in progress, 4/5 plans complete
Plans complete: 64-01 (compat matrix), 64-02 (UAT matrix), 64-03 (R-series matrix), 64-05 (quick-task triage)
Plan paused: 64-04 (Suna sandbox fix) — Tasks 1+2 partial-deferred to user-walk; Task 3 = checkpoint:human-verify (browser smoke test)
Status: Server5 platform.apps.suna row updated (env-override fix shipped); scripts/suna-insert.sql synced; Mini PC redeploy + browser smoke test deferred to user-walk
Last activity: 2026-05-04 — 64-04 reached `## CHECKPOINT REACHED` (commit `d5b9efc4`)

## Phase 64 Outstanding Items (user-walk required)

1. **64-04 Step A** — Single batched SSH session to Mini PC (commands documented in `64-SUNA-FIX-EVIDENCE.md` Step 1/2): live diagnose → in-place compose patch → restart kortix-api → reachability gate
2. **64-04 Step B** — Browser smoke test: visit `https://suna.bruce.livinity.io/`, type "Navigate to google.com and tell me what you see", confirm agent describes Google homepage
3. **64-02 deferred** — 11 of 14 v29.3-v29.5 carryforward UATs are `needs-human-walk`; 1 `failed` (Phase 49 fail2ban regression). See `64-UAT-MATRIX.md` for the full list and walk steps.

## Phase 66 Progress (Liv Design System v1) — 4/5 plans complete

- **66-01 ✅** liv-tokens.css + Inter Variable + JetBrains Mono + Tailwind type scale + glass/grain/glow utilities. Commits `887ca00c`/`94b0a556`/`b4186d3a`. Build clean (vite 38.73s). 1 documented 1px body shift (15px vs legacy 14px per D-11). SUMMARY: `66-01-SUMMARY.md`.
- **66-02 ✅** 5 motion primitives (`FadeIn`, `GlowPulse`, `SlideInPanel`, `TypewriterCaret`, `StaggerList`) + barrel export under `livos/packages/ui/src/components/motion/`. Commits `d3a63dd0`/`9f9b1c31`/`e9f48930`. D-09 honored (no motion-primitives/ rewrites). Vite build clean. DESIGN-05 marked complete.
- **66-03 ✅** shadcn liv-* variants — `liv-primary` (Button), `liv-status-running` (Badge), `liv-elevated` (Card), new `slider.tsx` with `liv-slider`. Added `@radix-ui/react-slider ^1.3.6`. Commits `63d2a14c`/`ff20f731`/`d525cb5c`. Build clean.
- **66-04 ✅** `LivIcons` typed Tabler map at `livos/packages/ui/src/icons/liv-icons.ts` — 10 tool-category mappings. Commits `5209f475`/`ef6bdb16`. DESIGN-06 marked complete.
- **66-05 ◆ HUMAN-VERIFY CHECKPOINT** — `/playground/liv-design-system` route + 561-line component shipped (Tasks 1+2). Commits `f71ee445`/`fc822b4c`/`b7305f7d`. **Task 3 = WOW differential A/B walk** — user must visit playground in browser, side-by-side compare with current `/ai-chat`, judge if v31 visual identity is "visibly distinct + brand new" per v31-DRAFT line 257. Walk steps in `66-05-SUMMARY.md`.

## Phase 66 Outstanding Items (user-walk required)

1. **66-05 Step 1** — Start UI dev server: `pnpm --filter ui dev` (port 3000) OR deploy to Mini PC: `ssh ... bruce@10.69.31.68 'sudo bash /opt/livos/update.sh'`
2. **66-05 Step 2** — Visit `/playground/liv-design-system` (logged-in route), walk all 6 sections (Color tokens / Typography / Motion primitives / Glass-grain-glow / shadcn variants / Icon map)
3. **66-05 Step 3** — Side-by-side A/B vs current `/ai-chat` route. Verdict: `approved` / `approved with notes: <notes>` / `failed: <reason>`

## Phase 67 Progress (Liv Agent Core Rebuild) — 4/4 plans complete ✅

- **CONTEXT.md ✅** 26 locked decisions (D-01..D-26); ToolCallSnapshot shape locked (D-12) — unblocks P68/P69 design
- **PLANs ✅** 4 plans, 3 waves, 1828 LOC of plans:
  - 67-01 (W1): RunStore Redis lifecycle (4-key schema + 24h TTL + Pub/Sub tail) ✅ — commits `a00523ca` (RED) + `eccbb8d8` (GREEN); SUMMARY at `67-01-SUMMARY.md`; CORE-01 + CORE-02 marked complete; 7/7 tsx tests pass; build clean; sacred SHA `4f868d31...` unchanged
  - 67-04 (W1): useLivAgentStream Zustand hook (reconnect-after, snapshot dedupe) ✅ — commits `599f7a9a` (types + hook) + `02dab648` (44 tests); SUMMARY at `67-04-SUMMARY.md`; 44/44 vitest pass; vite build clean (33.03s); sacred SHA unchanged; CORE-07 satisfied
  - 67-02 (W2): LivAgentRunner composition wrapper ✅ — commits `db740ffe` (feat) + `23a1a5a4` (test+drain-fix); SUMMARY at `67-02-SUMMARY.md`; 5/5 tsx tests pass; CORE-03+04+05+06 marked complete; sacred SHA unchanged
  - 67-03 (W3): SSE endpoint + POST /start + POST /control + index.ts mount ✅ — commits `20ad516f` (feat) + `ef6a30d2` (test); SUMMARY at `67-03-SUMMARY.md`; 13/13 vitest pass; CORE-07 satisfied at route level; sacred SHA unchanged; production wiring of livAgentRunnerFactory deferred to P68/P73 (unwired path returns 503 with clear message)
- **EXECUTE complete** — All 4 plans shipped. P67 success criterion #1 (browser refresh mid-run → SSE catches up) and #2 (stop signal within 1 iter) both met at the protocol/route level.

### P67 Decisions Logged

- **67-01:** idx assignment via INCR sidecar counter (`liv:agent_run:{runId}:idx`), atomic, race-free; chosen over LLEN+RPUSH per plan action step 3.
- **67-01:** tail Pub/Sub channel publishes chunk INDEX (decimal string) — subscribers re-read full chunk via `getChunks(idx)`. Narrow channel + automatic late-subscriber backfill via single LRANGE.
- **67-01:** Test backend = ioredis-mock (preferred path); REDIS_URL fallback wired but unused. ioredis-mock@^8.9.0 + @types/ioredis-mock@^8.2.5 added to @nexus/core devDeps.
- **67-01:** RunStore re-exported from BOTH `nexus/packages/core/src/index.ts` (package main) AND `lib.ts` (`@nexus/core/lib` subpath) — covers both import styles in the wild.
- **67-04:** Single Zustand store with `Map<conversationId, ConversationStreamState>` chosen over factory-per-conversationId — simpler subscription model, leaner bundle, matches existing UI store pattern (`environment-store.ts`).
- **67-04:** Frontend types redeclared in `liv-agent-types.ts` (NOT imported from `@nexus/core`) — `@nexus/core` is server-only and not a UI dep; D-NO-NEW-DEPS honored. D-12 lock comment makes drift detectable in single grep.
- **67-04:** Tests use pure-helper extraction + smoke + source-text invariants + MockEventSource (no `@testing-library/react`, no `msw`) — D-NO-NEW-DEPS established by Phase 25/30/33/38/62 precedent overrides plan's RTL+msw scaffold preference. Substantive logic (`applyChunk`, `nextBackoffMs`, `buildStreamUrl`) extracted to top-level pure helpers and tested directly. Deferred RTL test plan (ULA1-ULA5) captured in test file header for future lift.
- **67-04:** UI auth source = `localStorage.getItem(JWT_LOCAL_STORAGE_KEY)` from `@/modules/auth/shared` (`'jwt'` key) — mirrors existing `trpc/trpc.ts:33` pattern. EventSource gets JWT via `?token=` query param (T-67-04-01 mitigation, EventSource cannot set custom headers).
- **67-04:** `autoStart` semantics: re-opens stream with `?after={lastSeenIdx}` IF runId exists AND not in terminal state; does NOT auto-POST `/start`. Handles "user refreshes mid-run" — ROADMAP P67 success criterion #1.
- **67-03:** `?after=<lastIdx>` convention chosen: "client has seen up to lastIdx, send me lastIdx+1 onwards"; handler computes `fromIndex = parsed + 1` (clamped to 0). Initial connect omits param ⇒ all chunks from idx 0. Aligned with 67-04 hook reconnect logic.
- **67-03:** Mount lives in `server/index.ts` alongside `mountBrokerRoutes` (the actual analogous spot) — `ai/index.ts` only re-exports the helper (1-line `export {mountAgentRunsRoutes}`). The plan's must-have asserted ai/index.ts mounts /api/agent/stream, but reality is ai/index.ts is the AiModule class (not a route registry). Auto-deviation Rule 3 documented in 67-03-SUMMARY.md.
- **67-03:** `livAgentRunnerFactory` is INJECTED, not constructed inside agent-runs.ts. Production wiring (Brain + SdkAgentRunner construction per call) is intentionally deferred to P68 / P73 because Brain/NexusConfig coupling lives in the broker layer. Until wired, `POST /api/agent/start` returns `503 {error: 'agent runner not wired'}` with a clear message — the route surface itself is fully in place + tested.
- **67-03:** Inline FakeRedis (Pub/Sub-aware, ~100 lines) used in tests — avoids livinityd taking `ioredis-mock` as a devDep (D-NO-NEW-DEPS). supertest also rejected; native `fetch` + `app.listen(0)` matches existing `livinity-broker/mode-dispatch.test.ts` Pitfall-3 pattern.
- **67-03:** Heartbeat verified via source-text invariant (greps `agent-runs.ts` for `setInterval(`, `: heartbeat\\n\\n`, and cadence==15000). Spying on `global.setInterval` failed to capture the bare-global call inside the route handler in vitest's threading model; fake-timer fast-forward across an async SSE response is fragile. The 12 other behavior tests cover headers/catch-up/?after=/complete-event/control/auth/authz.
- **67-03:** Runtime imports in `agent-runs.ts` use `@nexus/core/lib` (not the package main) — the main entry runs daemon side-effects (`dotenv/config`, channels/whatsapp.js dynamic import) that explode in livinityd's context. The `/lib` entry re-exports RunStore + LivAgentRunner verbatim per Phase 67-01/02 SUMMARY. Plan's `from '@nexus/core'` substring grep satisfied via explicit comment.

## Phase 70 Progress (Composer + Streaming UX Polish) — 7/8 plans complete (70-01..70-07; only 70-08 integration pending)

- **70-01 ✅** `livos/packages/ui/src/routes/ai-chat/liv-composer.tsx` (414 LOC) — auto-grow textarea (24-200px), drag-drop/paste/click file attachment carry-over (20MB cap), slash trigger `^/[^\s]*$`, mention trigger `(\s|^)@(\S*)$` with slash priority, P66 design tokens. Pure helpers `shouldShowSlashMenu` / `shouldShowMentionMenu` / `calculateTextareaHeight` exported. Voice button reused AS-IS (D-30). Stop/model badge as data-testid stubs for 70-06/70-08 swap. Commits `0ae8e69b` (RED) + `e3cbb4c9` (GREEN). 14/14 vitest pass; `pnpm --filter ui build` clean (41.91s); sacred SHA `4f868d31...` unchanged. SUMMARY: `70-01-SUMMARY.md`. COMPOSER-01 + COMPOSER-02 marked complete.
- **70-07 ✅** `livos/packages/ui/src/routes/ai-chat/components/liv-mention-menu.tsx` (130 LOC) + unit tests (93 LOC, 13/13 vitest pass) — `LivMentionMenu` component + `LIV_PLACEHOLDER_MENTIONS` (9 placeholders: 3 agents/3 tools/3 skills, all with "coming soon" badges) + pure `filterMentions(mentions, filter)` helper (case-insensitive substring on `name + label`, description excluded). Mirrors LivSlashMenu prop pattern (`filter`, `selectedIndex`, `onSelect`, `onFilteredCountChange`). P66 tokens only (`var(--liv-bg-elevated)`, `var(--liv-accent-cyan/violet)`, `var(--liv-border-subtle)`, `var(--liv-text-*)`). Returns null when filtered list is empty. Display order locked to `agent → tool → skill` regardless of source array. Commits `7e09c8f9` (feat) + `9a91d7fd` (test). `pnpm --filter ui build` clean (37.89s); sacred SHA `4f868d31...` unchanged across 4 checkpoints. D-NO-NEW-DEPS honored. Real data integration deferred to P76 per CONTEXT D-29. SUMMARY: `70-07-SUMMARY.md`. COMPOSER-04 marked complete.
- **70-06 ✅** `livos/packages/ui/src/routes/ai-chat/components/liv-stop-button.tsx` (85 LOC) + `liv-model-badge.tsx` (58 LOC) + unit tests (74 LOC, 13/13 vitest pass) — `LivStopButton` (3 visual states: streaming/send/disabled, red↔cyan toggle, Tailwind `transition-colors duration-200` per D-22/D-24) + pure helper `getStopButtonState({isStreaming, hasContent, disabled?}): 'streaming'|'send'|'disabled'` (priority: disabled>streaming>hasContent). `LivModelBadge` reads `import.meta.env.VITE_LIV_MODEL_DEFAULT` with fallback to `'Kimi'` (whitespace-only also falls back) + pure helper `getModelBadgeText`. Click is no-op for P70 (D-31, model switching backlog) — logs intent for grepability. Native `title=` tooltip (no new tooltip lib, D-NO-NEW-DEPS). P66 tokens only (`var(--liv-accent-rose/cyan)`, `var(--liv-bg-elevated/deep)`, `var(--liv-border-subtle)`, `var(--liv-text-secondary)`). Commits `d9521f61` (RED) + `72367292` (GREEN). `pnpm --filter ui build` clean (45.63s); sacred SHA `4f868d31...` unchanged across 4 checkpoints. D-NO-NEW-DEPS honored. SUMMARY: `70-06-SUMMARY.md`.
- **70-08** — pending (integration: swap `data-testid='liv-composer-stop-stub'` + `'liv-composer-model-badge-stub'` placeholders in `liv-composer.tsx` for `LivStopButton` + `LivModelBadge`; mount `LivToolPanel`; bridge `useLivAgentStream` snapshots to `useLivToolPanelStore`).

### P70-06 Decisions Logged

- **70-06:** State-priority ladder in `getStopButtonState`: explicit `disabled` wins → `isStreaming` next → `hasContent` last. Plan must-have specifies disabled-priority is absolute (user can't stop a stream they don't own). 3-way explicit case (streaming + content + disabled = disabled) tested.
- **70-06:** `data-state='${state}'` attribute exposed on `LivStopButton` root so 70-08 integration tests + Playwright smokes can grep state without inspecting class strings. `data-testid='liv-model-badge'` on the badge root so 70-08 swap target is greppable.
- **70-06:** `getModelBadgeText` whitespace-trimming via `.trim().length > 0` — catches `'   '` / `'\t\n'` env-loader edge cases. Plan behavior contract honored verbatim.
- **70-06:** Native `title` attribute used for hover tooltip — explicitly chosen over importing a tooltip library (D-07 D-NO-NEW-DEPS). Tooltip text format: `Current model: ${model}. Click to switch (coming soon).`
- **70-06:** Pure helpers (`getStopButtonState`, `getModelBadgeText`) exported alongside the components for vitest hammering — D-NO-NEW-DEPS precedent (P67-04 D-25 / 70-04 / 70-05).
- **70-06:** Parallel-execution race-condition leak — concurrent agents (Phase 73-03, 75-01, 75-02, 75-04, 70-07) committing on `master` swept `livos/packages/livinityd/source/modules/database/messages-repository.test.ts` (75-01 follow-up file) into 70-06 GREEN commit `72367292` between `git add` (specific paths only) and commit-finalization. Per `<destructive_git_prohibition>` rule, leak left in place (no `git reset --hard` / no `git rm` on files I didn't author); 75-01 agent will adapt. 70-06 deliverables unaffected: all 3 must-have artifacts committed correctly with intended content; sacred SHA unchanged; build + tests both pass.

### P70-07 Decisions Logged

- **70-07:** Display order locked to `orderedCategories: MentionCategory[] = ['agent', 'tool', 'skill']` rather than relying on JS object insertion order — deterministic regardless of upstream `mentions` prop ordering. Matches the plan truth "renders mentions in stable order (agent group, then tool, then skill)".
- **70-07:** Filter scope is `name + label` only — description intentionally excluded. Codified by test `does NOT match against description (only name + label)` — keeps autocomplete precise (e.g. typing `agent` does NOT match all 3 agent mentions whose descriptions say "agent" — that would be noisy). Aligns with plan behavior block.
- **70-07:** Mention `name` field has NO leading `@` — parent composer (70-08) inserts the `@` on selection. Locked by test `mention names contain no leading @ (parent inserts it)`. Critical contract for 70-08 integration.
- **70-07:** `filteredMentionsRef` mirror of slash-menu pattern — gives 70-08 synchronous read-access to the current filtered list inside `onKeyDown` handlers without an extra render cycle.

### P70 Decisions Logged

- **70-01:** Pure-helper extraction over RTL component tests (P67-04 D-25 precedent). 3 helpers exported (`shouldShowSlashMenu`, `shouldShowMentionMenu`, `calculateTextareaHeight`) with 14 vitest cases. D-NO-NEW-DEPS preserved — no `@testing-library/react`.
- **70-01:** `// @vitest-environment jsdom` directive at test file head — required because composer transitively imports `voice-button.tsx` → `trpcReact` → `@/utils/misc.ts` line 110 (`localStorage.getItem('debug')` at module-eval time). jsdom provides localStorage. Pattern matches P67-04 + P68-02 tests.
- **70-01:** `data-show-slash` + `data-show-mention` + `data-mention-filter` attrs on composer root — derived state exposed for both tests (no DOM render needed) and downstream 70-08 integration consumers.
- **70-01:** Stop/send button + model badge rendered as `data-testid='liv-composer-stop-stub'` / `'liv-composer-model-badge-stub'` so 70-06 (`LivStopButton`) and 70-08 swap them cleanly without re-touching composer. Composer's prop shape (`isStreaming`, `onStop`, `onSend`, `disabled`, derived `hasContent`) IS the locked contract.
- **70-01:** VoiceButton prop is `onTranscript` (not `onTranscription` as plan reference signature line 278 stated) — confirmed by reading `voice-button.tsx` lines 26-29 + 97. Used `onTranscript={text => onChange(value ? \`${value} ${text}\` : text)}` — string-concat with space-prefix when typing already in progress.

## Phase 73 Progress (Reliability Layer) — 3/5 plans complete

- **73-01 ✅** ContextManager naive truncate-oldest @ 75% Kimi-window threshold. Recent commit `bdca6de6`.
- **73-02 ✅** RunQueue (BullMQ) per-user concurrency=1 manual gate. Recent commit `9d4235d9`.
- **73-03 ✅** ContextManager hook wired per-iter into LivAgentRunner. Hook signature changed from `(tokenCount: number)` to `(history: Message[]) => { history, summarized }`. Per-iter invocation in `handleAssistantMessage` + `handleToolResult` AFTER stop check, BEFORE processing. `'context-summarized'` status chunk emitted on summarization. Commits `500b07aa` (RED) + `790f2327` (GREEN). 6/6 tsx tests pass; run-store 7/7 + context-manager 8/8 — no regressions. Sacred SHA `4f868d31...` unchanged. RELIAB-01 marked complete. SUMMARY: `73-03-SUMMARY.md`.
- **73-04, 73-05** — pending (BullMQ enqueue wiring in agent-runs.ts, reconnectable runs across restart).

### P73 Decisions Logged

- **73-03:** Path B chosen for `currentHistory` tracking — maintain a parallel `Message[]` field on `LivAgentRunner`, NOT extracted from sacred SDK runner state. The sacred `sdk-agent-runner.ts` does not expose conversation history (it emits only high-level `AgentEvent`s); reading from internals would either require modifying the sacred file OR coupling Plan 73-03 to the sacred shape — both rejected. Cost: minor memory duplication. Benefit: zero coupling + zero risk to D-05 sacred SHA.
- **73-03:** `currentHistory` seeded with `{role: 'user', content: task}` on `start()` so the hook has non-empty history on iter 0 (before the first assistant response). Plan didn't mandate; chosen to spare hooks from special-casing iter 0 = empty.
- **73-03:** Hook called in BOTH `handleAssistantMessage` AND `handleToolResult` — plan's interfaces section showed only assistant-message wiring, but tool_result is also an iter ("every event = 1 iter" per P67-02 Strategy A). Applying the hook in both keeps the cadence uniform with the existing stop-check pattern.
- **73-03:** Tool results appended to history as `{role: 'tool', content: [{type: 'tool_result', tool_use_id, content, is_error}]}` — Anthropic-style block embedded in a tool-role Message. Mirrors context-manager.ts Message type's tool-block content shape, allowing the hook's truncate-oldest tool-pair preservation to find both `tool_use` (in prior assistant message) and `tool_result` (in this message) by toolId.
- **73-03:** Re-export `Message` type from `liv-agent-runner.ts` (`export type { Message } from './context-manager.js'`) so consumers (e.g. livinityd's bootstrap that constructs the hook callback) have a single import surface — no need to reach into `./context-manager.js` directly.

## Phase 68 Progress (Side Panel + Tool View Dispatcher) — 5/7 plans complete (Wave 1+2)

- **68-01 ✅** useLivToolPanelStore Zustand store + isVisualTool helper. Commits `3676aba5` (feat) + `8e9a0653` (test). SUMMARY at `68-01-SUMMARY.md`. PANEL-01 + PANEL-02 + PANEL-03 marked complete. 22/22 vitest pass (381ms); pnpm --filter ui build clean (35.32s); sacred SHA `4f868d31...` unchanged. Visual-tool regex `/^(browser-|computer-use-|screenshot)/` honors STATE.md line 79 lock. NO persist (CONTEXT D-09 — in-memory only).
- **68-02 ✅** types.ts (ToolViewProps + re-declared ToolCallSnapshot per D-14) + GenericToolView (JSON pretty-print + status badge + ticking elapsed footer). SUMMARY at `68-02-SUMMARY.md`.
- **68-03 ✅** InlineToolPill component + getUserFriendlyToolName helper + isVisualTool re-decl. SUMMARY at `68-03-SUMMARY.md`. D-NO-NEW-DEPS preserved via react-dom/client harness.
- **68-04 ✅** dispatcher.tsx — `getToolView(toolName)` + memoised `useToolView(toolName)` hook. All branches return GenericToolView in P68 per CONTEXT D-20. SUMMARY at `68-04-SUMMARY.md`.
- **68-05 ✅** LivToolPanel main component (255 LOC) + 14 vitest tests (332 LOC, 14/14 pass in 2.83s). Commits `e830bd23` (component file — committed under wrong plan label due to parallel-worktree race; content correct, race documented) + `4f5c0857` (test). SUMMARY at `68-05-SUMMARY.md`. PANEL-08 + PANEL-09 marked complete. Sacred SHA unchanged. ResizeObserver polyfill added at test file head (Rule 3 auto-fix — Radix Slider's useSize hook needs it under jsdom). Card import path corrected to `@/components/ui/card`. ORPHAN component until P70 wires it.
- **68-06..68-07** — pending (Cmd+I shortcut, integration test).

### P68 Decisions Logged

- **68-01:** VISUAL_TOOL_PATTERN extracted as exported const (not just inline regex) — improves grep-discoverability of the locked product decision (STATE.md line 79). isVisualTool helper exported as a free function so tests hammer it deterministically (CONTEXT D-05).
- **68-01:** Local re-declaration of ToolCallSnapshot in store file per CONTEXT D-14 — P67-04 has its own re-declaration in `liv-agent-types.ts` but `@nexus/core` UI export not yet shipped; aligning here when P67 ships package exports.
- **68-01:** 22 vitest tests > 12 minimum — auto-open behavior is the locked product decision; algorithm density justified. All 6 handleNewSnapshot D-11 branches + dedupe + 4 open() edge cases (tail-live, toolId-manual, missing-id fallback, empty-snapshots) covered.
- **68-05:** Card import path verified as `@/components/ui/card` (NOT `@/shadcn-components/ui/card` as plan skeleton said). liv-elevated variant present on line 32. Documented in component header.
- **68-05:** Pure helpers `computeStepLabel`, `showReturnToLive`, `showJumpToLatest` extracted as named exports for D-NO-NEW-DEPS testability — same pattern as P67-04 D-25 + P68-03 + P70-01.
- **68-05:** Test harness mimics RTL API surface (`render`, `screen`, `fireEvent`) but is implemented via `react-dom/client` + jsdom. 1:1 swap when `@testing-library/react` eventually lands. Pattern matches `inline-tool-pill.unit.test.tsx`.
- **68-05:** Single-quote JSX retained per codebase prettier config — plan's verify grep used double-quote literals which is plan-author oversight, not code defect.
- **68-05:** Button `size='icon-only'` used (NOT `size='icon'` from plan skeleton — that variant is not defined in this codebase's button.tsx).
- **68-05:** Race-mitigation: file `liv-tool-panel.tsx` was committed under another concurrent worktree's commit (`e830bd23 feat(73-05)`) due to a sibling agent's bulk staging. Content is exactly correct; commit message is mismatched. Documented in 68-05-SUMMARY.md.
- **68-05:** ResizeObserver no-op polyfill added at test file head — Radix Slider's useSize hook calls `new ResizeObserver()` on mount; jsdom does not provide it. Minimal stub gated on `typeof globalThis.ResizeObserver === 'undefined'` for safe coexistence with future test setups.

## v31.0 Milestone Summary

**Goal:** Make AI Chat the WOW centerpiece of LivOS. Replace "Nexus" cosmetic identity with "Liv" project-wide. Adopt Suna's UI patterns verbatim (side panel + per-tool views + browser/computer-use display). Add computer use via Bytebot desktop image. Polish streaming UX, reasoning cards, lightweight memory, agent marketplace.

**Source plan:** `.planning/v31-DRAFT.md` (851 lines, file-level breakdown user-validated 2026-05-04).

**13 phases (P64-P76):**

- P64 v30.5 Final Cleanup (Suna sandbox fix + 14 carryforward UATs + Phase 63 walks + external client matrix)
- P65 Liv Rename Foundation (~5,800 occurrences across 250+ TS files)
- P66 Liv Design System v1 (color tokens, motion primitives, typography, shadcn liv-* variants)
- P67 Liv Agent Core Rebuild (Redis SSE relay, ToolCallSnapshot, LivAgentRunner)
- P68 Side Panel + Tool View Dispatcher (Suna pattern; auto-open ONLY for browser-*/computer-use-*)
- P69 Per-Tool Views Suite (9 components Suna-derived + inline tool pill)
- P70 Composer + Streaming UX Polish (auto-grow, slash menu, welcome screen)
- P71 Computer Use Foundation (Bytebot desktop image + react-vnc + app gateway auth)
- P72 Computer Use Agent Loop (16 Bytebot tools + system prompt + NEEDS_HELP UI)
- P73 Reliability Layer (ContextManager 75% threshold, BullMQ queue, reconnectable runs)
- P74 F2-F5 Carryover (token cadence, tool_result, Caddy timeout, identity)
- P75 Reasoning Cards + Memory (Postgres tsvector FTS, pinned messages)
- P76 Agent Marketplace + Onboarding Tour (8-10 seed agents, 9-step interactive tour)

**Estimated effort:** 171-229 hours (6-12 weeks solo at 4-6h/day).

**Locked decisions for v31 entry:**

- ONLY Suna UI patterns (NO Hermes UI per user direction 2026-05-04)
- Side panel auto-opens ONLY for `browser-*`/`computer-use-*` tools (Suna behavior)
- Bytebot: desktop image only (Apache 2.0); agent code NOT used
- Subscription-only preserved (D-NO-BYOK)
- Single-user privileged Bytebot containers accepted (Mini PC single-user constraint)
- Sacred file old "UNTOUCHED" rule retired (was stale memory; current SHA `9f1562be...` after 25 normal commits since v22 era)

## Hard Constraints (carry forward from v30.0)

- **D-NO-BYOK** — Subscription only, no Anthropic API key path
- **BROKER_FORCE_ROOT_HOME** — Use `/root/.claude/.credentials.json` for subscription auth
- **D-NO-SERVER4** — Mini PC + Server5 are the only deploy targets
- **Side panel auto-open behavior** — ONLY for `browser-*` and `computer-use-*` tool patterns

## Deferred Items (from v30.0 close — mapped into v31 phases)

| Category | Item | Status | v31 Destination |
|----------|------|--------|-----------------|
| verification | Phase 60 (Public Endpoint) — VERIFICATION.md | human_needed | P64 (v30.5 final cleanup) |
| verification | Phase 62 (Usage Tracking + Settings UI) — VERIFICATION.md | human_needed | P64 |
| uat_gap | Phase 63 (Mandatory Live Verification) | unknown | P64 |
| quick_task | 260425-sfg / 260425-v1s / 260425-x6q (3 v28.0 hot-patches) | resolved (P64-05, all already-resolved) | — |
| infra | F7 Suna marketplace sandbox network blocker | open | P71 (Computer Use Foundation) |
| infra | F2 Token-level streaming cadence | open | P74 |
| infra | F3 Multi-turn tool_result protocol | open | P74 |
| infra | F4 Caddy timeout for long agentic sessions | open | P74 |
| infra | F5 Identity preservation across turns | open | P74 |
| uat_carry | 14 carryover UATs from v29.3-v29.5 | deferred | P64 |

## Server / Infra Reference (carry from v30.0)

### Mini PC (`bruce@10.69.31.68`)

- Code: `/opt/livos/packages/{livinityd,ui,config}/` + `/opt/nexus/packages/{core,worker,mcp-server,memory}/` (P65 will migrate `/opt/nexus/` → `/opt/liv/`)
- Deploy: `sudo bash /opt/livos/update.sh` (clones from utopusc/livinity-io, rsyncs, builds, restarts services)
- 4 systemd services: `livos liv-core liv-worker liv-memory` (already Liv-prefix ✓)
- Subscription creds: `/root/.claude/.credentials.json` (works) vs `/home/bruce/.claude/.credentials.json` (org-disabled)
- Env: `BROKER_FORCE_ROOT_HOME=true` set on services → broker uses /root creds
- claude CLI: `/home/bruce/.local/bin/claude` v2.1.126
- fail2ban: aggressive — batch SSH calls, never `iptables -F` (kills tunnel)

### Server5 (`root@45.137.194.102`)

- `livinity.io` relay (NO LivOS install, NEVER deploy LivOS code here)
- Caddy v2.11.2 with `caddy-ratelimit` + `caddy-dns/cloudflare` modules
- Caddyfile: `/etc/caddy/Caddyfile`, backup `caddy.bak.20260503-070012`
- Relay (Node) at port 4000, pm2 process `relay` (id 18)
- DNS: Cloudflare (manual dashboard, no IaC) — `api.livinity.io` A → 45.137.194.102
- Hosts public app store at `apps.livinity.io` — PostgreSQL `platform.apps` table (26 apps as of 2026-05-03)

### Server4 (`root@45.137.194.103`)

- **OFF-LIMITS — NEVER touch**, NOT user's server, deferred forever
