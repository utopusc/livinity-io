---
gsd_state_version: 1.0
milestone: v31.0
milestone_name: Liv Agent Reborn
status: unknown
last_updated: "2026-05-08T23:47:32.097Z"
progress:
  total_phases: 41
  completed_phases: 18
  total_plans: 105
  completed_plans: 100
  percent: 95
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime — CODE-COMPLETE 2026-05-06; pending Mini PC UAT signoff
**Last shipped milestone:** v31.0 Liv Agent Reborn — closed 2026-05-05 (P64-P79 all complete)
**Next action:** USER WALK — Mini PC deploy + UAT-CHECKLIST.md (`.planning/phases/91-uat-polish/UAT-CHECKLIST.md`, 10 sections A-J). After UAT signoff: `/gsd-cleanup` to archive phase artifacts; then `/gsd-new-milestone` for v33.

## Current Position

Phase: 100 (multi-stream-window-redesign) — EXECUTING
Plan: 1 of 5
Milestone: v32.0 (active) — 8/12 phases complete
Wave 1: ✅ COMPLETE — `759ef597` P80, `9a276a11` P85-schema, `628ed1ca` P87, `12aa473f` summaries
Wave 2: ✅ COMPLETE — `4379ea89` P81, `6f758067` P82, `0df7475b` P83, `49d79510` P86, `52944d16` P85-UI
Wave 3: ✅ COMPLETE — `d719a175` P84 (MCP SoT + Smithery secondary + legacy mcp-panel deprecated)
Wave 4: ✅ COMPLETE — `50156555` P89 (ThemeToggle + Cmd-key shortcuts + a11y), `464eba3b` P88 (WS→SSE + status_detail UI + AgentSelector)
Wave 5: ✅ COMPLETE — `af860aa9` P90 (cutover + redirects + dock + 2 legacy file deletes), `771b7712` P91 (WCAG fix + UAT-CHECKLIST + static smoke)
Lifecycle: ◆ Code-complete; awaiting user-walked Mini PC UAT signoff. After UAT: cleanup deferred to user invocation.

## Wave 1 Deliverables (shipped)

- **P80 Foundation** (`759ef597`) — OKLCH design tokens, Geist Sans/Mono fonts, ThemeProvider+useTheme, `/playground/v32-theme` preview route. UI build clean (35.86s, 422 precache entries).
- **P85-schema** (`9a276a11`) — `agents` table (`id` UUID PK + nullable `user_id`), agents-repo with full CRUD/clone/publish, 5 stable seed UUIDs (Liv Default `1111…`, Researcher `2222…`, Coder `3333…`, Computer Operator `4444…`, Data Analyst `5555…`), `agent_templates` backfilled readonly. 23/23 + 86/86 tests pass.
- **P87 Hermes runtime** (`628ed1ca`) — 5 Hermes patterns ported (status_detail chunk, IterationBudget=90, steer injection, batchId per turn, JSON repair chain). `lib/hermes-phrases.ts` with 15 THINKING_VERBS + 3 WAITING_VERBS. Sacred sdk-agent-runner.ts SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED.

## Sacred Constraints (v32-wide)

- `liv/packages/core/src/sdk-agent-runner.ts` SHA MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` at all times. Verified before/after every wave.
- D-NO-BYOK: subscription-only path (`@anthropic-ai/claude-agent-sdk`). No raw `@anthropic-ai/sdk` fallback.
- D-NO-SERVER4: Server4 is NOT ours. Mini PC (`bruce@10.69.31.68`) is the only deploy target. (Live deploy is user's job — orchestrator only ships to GitHub.)
- D-LIV-STYLED: Hermes runtime patterns adopted, KAWAII emoticons + ASCII frames NOT adopted.

## Blockers / Concerns

None — Wave 1 fully verified. Sacred SHA preserved. Builds green across 3 packages.

## Reference

- Milestone master plan: `.planning/v32-DRAFT.md`
- Roadmap: `.planning/ROADMAP.md` v32 section (lines 55-104)
- v31 archive note: see commit `37a82557` (which marked v31 complete in ROADMAP)
- Wave 1 SUMMARYs:
  - `.planning/phases/80-foundation-tokens-fonts-theme/80-SUMMARY.md`
  - `.planning/phases/85-agent-management/85-SCHEMA-SUMMARY.md`
  - `.planning/phases/87-hermes-background-runtime/87-SUMMARY.md`

**Planned Phase:** 100 (multi-stream-window-redesign) — 5 plans — 2026-05-08T23:31:54.172Z

**Planned Phase:** 100 (Multi-Stream + Stream-Window Redesign) — 5 plans — 2026-05-08T16:05:00.000Z (waves 1→2→3→4→5; sacred SHA hook installed in 100-01; v33 ✅ Shipped flip in 100-05)

## Phase 99 — PARTIAL-PASS (2026-05-08)

- **Shipped:** all 5 plans (12 commits `9a61d78a..cd6f442a`); pushed to GitHub; deployed to Mini PC (deployed SHA recorded as `cd6f442` by update.sh; all 4 services `active`).
- **What works (PASS):** single WebApp click → stream window with live RFB handshake (no `Invalid server version ftypiso`); mouse + keyboard pass-through.
- **What does NOT work (deferred to Phase 100):** multi-stream (2nd WebApp click does not produce an independent stream); URL bar in stream window unwanted; stream should fill window; Chat/Teach/Watch/Auto must move out of inline pane into floating icon-button row.
- **Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 12 commits (verified pre + post deploy).

## Phase 100 — PARTIAL-PASS (2026-05-08)

- **Shipped:** all 5 plans (13 execution commits `a6c519fd..4954d9ba`, +8 prior planning iterations); pushed to GitHub master; deployed to Mini PC (`/opt/livos/.deployed-sha` = `4954d9ba`; all 4 services `active`, including liv-memory which was NOT in the carry-over restart loop on this deploy).
- **What works (PASS — 9/11 UAT):**
  - Multi-stream creation: 2 concurrent WebApps render distinct streams on independent x11vnc ports (R1, R2).
  - Visual rewire: no URL bar / stream fills window / 4-icon bottom action-bar / Chat + Teach drawers slide-in (R4-R8).
  - Sacred SHA preserved on Mini PC (R10).
- **What does NOT work (FAIL — 2/11 UAT, deferred to Plan 100-06):**
  - Row 3 — click input routing: clicks on stream window A always operate on the LAST-opened WebApp's Chrome wid (x11vnc `-id <wid>` binds capture only; input forwards via `XTestFakeKey/MotionEvent` to focused window).
  - Row 9 — chat → bytebot scope routing: typing in WebApp A's Chat drawer always operates on the LAST-opened WebApp's bytebot (per-WebApp MCP servers ARE registered, but agent loop tool routing doesn't enforce per-chat scope).
- **Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 13 execution commits + post-deploy verification (verified live on `/opt/liv/packages/core/src/sdk-agent-runner.ts`). Pre-commit hook (`.husky/pre-commit` + `scripts/check-sacred.sh`) installed by 100-01 fired and passed on every commit.
- **PHASE-SUMMARY:** `.planning/phases/100-multi-stream-window-redesign/PHASE-SUMMARY.md` (committed).
- **UAT detail:** `.planning/phases/98-uat-polish/UAT-CHECKLIST.md` "Phase 100 — Multi-Stream + Stream-Window Redesign (PARTIAL-PASS 2026-05-08)" section.

## Plan 100-06 — Routing Fix (QUEUED, NOT YET PLANNED)

- Creative solution proposed (in `100-05-SUMMARY.md`): (a) click bypass via `xdotool --window <wid>` tRPC mutation; (b) chat MCP scoping — pin agent's tool whitelist to `mcp__bytebot:webapp:<wid>__*` per chat surface; (c) every bytebot tool call passes explicit `windowId` param (already supported by `tools.ts:98 defaultWindowId`).
- User chose path "(a) ship 100-02..04 + new 100-06 routing-fix" during the 100-01 checkpoint.
- Next step: user runs `/clear` then `/gsd-plan-phase 100-06` (or `/gsd-discuss-phase 100-06`) to spec the routing-fix plan.

**v33 milestone status:** all 9 phases (92-100) CODE-COMPLETE; Phase 99 PARTIAL-PASS, Phase 100 PARTIAL-PASS. v33 does NOT flip to ✅ Shipped in ROADMAP.md until Plan 100-06 ships AND Phase 100 UAT re-walks 11/11.
