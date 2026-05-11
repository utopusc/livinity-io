---
gsd_state_version: 1.0
milestone: v31.0
milestone_name: Liv Agent Reborn
status: unknown
last_updated: "2026-05-11T03:25:09.186Z"
progress:
  total_phases: 41
  completed_phases: 18
  total_plans: 132
  completed_plans: 131
  percent: 99
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime — CODE-COMPLETE 2026-05-06; pending Mini PC UAT signoff
**Last shipped milestone:** v31.0 Liv Agent Reborn — closed 2026-05-05 (P64-P79 all complete)
**Next action:** USER WALK — Mini PC deploy + UAT-CHECKLIST.md (`.planning/phases/91-uat-polish/UAT-CHECKLIST.md`, 10 sections A-J). After UAT signoff: `/gsd-cleanup` to archive phase artifacts; then `/gsd-new-milestone` for v33.

## Current Position

Phase: --phase (100-10) — EXECUTING
Plan: 1 of --name
Milestone: v33.0 (active) — Phase 100 PARTIAL-PASS; 100-08 closes residual bugs from 100-07

## 100-08 Wave Status (2026-05-10)

- Wave 1: ✅ COMPLETE — `6e0e028e..a37fe4de` (5 commits) — Xvfb :1 + fluxbox lifecycle + apt deps
- Wave 2: ✅ COMPLETE — `e775eb00..30b053e1` (4 commits) — WEBAPPS_X11_ENV :0→:1 cutover + XAUTHORITY drop
- Wave 3: ✅ COMPLETE — `410187d0..13781de7` (4 commits) — PerWebAppMcpDescriptor.display field
- Wave 4: ✅ COMPLETE — `45922fd1..d90186d0` (4 commits) — per-WebApp bytebot MCP via mcpConfigManager Redis pub-sub
- Wave 5: ✅ COMPLETE — `0ff00a94..a1988508` (4 commits) — chat-surface webappId scope filter + lag fallback (api.scope-filter.test.ts NEW)
- Wave 6: ⏸ PENDING — 100-08-06 user-walked Mini PC deploy + 11-step UAT (autonomous: false)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 21 commits

## 100-09 Wave Status (2026-05-10) — Bug Sweep + UX Refinement

User-feedback driven plan after 100-08 deploy. Multi-stream control verified working ✅. 6 sub-plans for 4 bugs + 2 UX rewrites:

- Wave 1 (09-01): ✅ COMPLETE — `35379252..0e77ce0f` (3 commits) — Bug 1: Screenshot 1920x1080 → window-bound. `maim -i 0x<hex>` argv fix.
- Wave 2 (09-02): ✅ COMPLETE — `2dc94f25..254024f3` (4 commits) — Bug 2: Scroll-down. ADDED missing user-canvas wheel listener + tRPC `webapp.input.scroll` + bytebot xdotool button 4/5 path.
- Wave 3 (09-03): ✅ COMPLETE — `d80439c9..a93db3b1` (3 commits) — Bug 3: Mouse smoothness. `smoothMove` interpolation (selfClaude pattern, 20 steps × 5ms sync).
- Wave 4 (09-04): ⏸ PENDING — 100-09-04 user-walked SSH probe (autonomous: false). Mouse latency probe + patch.
- Wave 5 (09-05): ✅ COMPLETE — `16a6140d..1b918cb1` (5 commits) — UX 1: Drop chat drawer. New `WebAppChatBottomBar` (inline at bottom). Chat icon toggles log expand/collapse.
- Wave 6 (09-06): ✅ COMPLETE — `1966fa1c..b85fcb83` (6 commits) — UX 2: Drop teach drawer. `TeachPopupHost` + `SaveSkillModal` + `SkillsPopover` (top-right). action_log v2 (per-event screenshot_b64 + viewport, session metadata). v1 lazy-upgrade.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 21 (09) commits

## 100-09 Hot-Fix Round (2026-05-10) — User Feedback After Deploy

Stream area inside WebApp window rendered `wmctrl -lG: Cannot get client list properties` instead of Chrome content. 3 new sub-plans dispatched same session:

- Wave 7 (09-07): ✅ COMPLETE — `18b75ce4..9c55635d` (3 commits) — fluxbox stderr capture (no more silent failures) + window-discovery xdotool fallback (works without EWMH). Defense in depth.
- Wave 8 (09-08): ✅ COMPLETE — `a33f2f4e..2c4f6a77` (3 commits) — Action bar 2-mode state machine. Click Message → bar TRANSFORMS to chat input (no more inline persistent bar inside window).
- Wave 9 (09-09): ✅ COMPLETE — `ba8df06c..b2156f5c` (3 commits) — Teach button itself turns red + numeric click-count badge. NO top-right widget. NO time counter.

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 9 hot-fix commits (+ 21 prior 09-01..06 commits).

**Pending user actions:**

1. Mini PC redeploy — pulls 09-07/08/09 fixes. `bash /opt/livos/update.sh` on `bruce@10.69.31.68`
2. Plan 100-08-06 — formal Mini PC deploy + 11-step UAT (multi-stream + per-WebApp control already informally validated)
3. Plan 100-09-04 — mouse latency probe + patch (user-walked SSH)
4. **Plan 100-10 — Luse rename + per-WebApp Xvfb + UI polish** — CONTEXT written 2026-05-10 (commit `dc4cfbc7`). 8 user-reported issues. After `/clear` next session, run `/gsd-plan-phase 100-10`.

## 100-10 Context (2026-05-10) — READY FOR PLANNING

`.planning/phases/100-multi-stream-window-redesign/100-10-CONTEXT.md` (committed `dc4cfbc7`) — comprehensive 8-issue + 10-decision + 7-plan-outline context. User said `/clear` next, then run `/gsd-plan-phase 100-10`.

Key decisions captured:

- D-100-10-A: Per-WebApp Xvfb (`:10+index`) — solves multi-stream overlap + Chrome direct capture
- D-100-10-B: Bytebot → Luse rename (project-wide, like Nexus→Liv P65)
- D-100-10-C: Luse new tools (list_windows, screenshot_window, focus, create_stream, etc.)
- D-100-10-D..G: UI cleanup (Skill button outside, Chat in-place, full-fit, remove Auto)
- D-100-10-H: Sacred SHA preserved throughout
- D-100-10-I: action_log backwards-compat shim (mcp__bytebot__* → mcp__luse__* lazy translate)

Wave 1: 10-01 (Xvfb allocator foundation)
Wave 2: 10-02 (Bytebot→Luse rename foundation)
Wave 3: 10-03 + 10-04 + 10-05 + 10-06 (parallel: Luse tools + UI cleanup + chat response mode)
Wave 4: 10-07 (user-walked deploy + 15-step UAT)

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` will stay UNTOUCHED throughout (sacred file has zero bytebot references; rename pass doesn't touch it).
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

**Planned Phase:** 100-10 (Luse rename + per-WebApp Xvfb + UI polish + multi-window cascade + Phase 101 plant) — 11 plans — 2026-05-11T03:25:09.174Z

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

## Plan 100-06 — UI Revisions (SHIPPED 2026-05-08)

- **Shipped commit:** `f18c8973` (atomic, +277 / -140 across 8 files; sacred SHA `f3538e1d…` UNTOUCHED).
- **Deployed:** `bash /opt/livos/update.sh` 2026-05-08 19:41 PT — all 4 services `active`; deployed SHA `f18c897309299f44698f9a8aa79ab5836091d720`; sacred SHA `f3538e1d…` on Mini PC verified.
- **What landed (4 user-requested UI corrections):**
  1. Bottom action bar moved OUTSIDE the WebApp window (NEW `webapp-floating-action-bar.tsx` — fixed-positioned `motion.div` mirroring `window-chrome.tsx` close button; rendered in `windows-container.tsx` for any `WEBAPP_` window). 16px below the window's bottom edge, centered, with `<Magnetic>` wrapper.
  2. Round buttons (`rounded-full bg-white/90 backdrop-blur-xl border + soft shadow` — close-button parity).
  3. Watch mode dropped entirely (`webapp-watch-drawer.tsx` deleted; `WebAppMode` collapsed `chat | teach | watch | auto` → `chat | teach | auto`).
  4. WebApp windows ship at fixed `1280×720` base size (`window-manager.tsx openWindow` checks `WEBAPP_` prefix; falls through `getResponsiveSize()` for viewport clamping).
- **State coupling:** new `webapp-drawer-store.ts` (Zustand keyed by webappId). The floating action bar (outside the window) and the Sheet drawer host (inside webapp-stream-window.tsx) both subscribe.
- **Tests:** 21/21 stream-window invariants PASS (4 flipped + 5 new for `WebAppFloatingActionBar`); build clean (`vite build` 35.92s).
- **SUMMARY:** `.planning/phases/100-multi-stream-window-redesign/100-06-SUMMARY.md`.

## Plan 100-07 — Routing Fix (PARTIAL-SHIPPED, residual bugs)

**Hot-fixes shipped 2026-05-08** (deployed Mini PC `2f973413`):

- **100-07.1/.2** (`dbb48d32` / `1487bba4`): user canvas click bypass — RFB viewOnly + tRPC `webapp.input.{click, keypress, type}` + xdotool windowactivate-first pattern
- **100-07.3** (`6540c55b`): bytebot `tryXdotoolClick` activate-first pattern + chat UI object render fix
- **100-07.4** (`73739355`): bytebot host MCP auto-scope to single active WebApp via `/tmp/livos-active-webapp-wid` shared-file IPC
- **100-06.1/.2** (`5ed4b39f` / `2f973413`): Chrome `--window-size=1280,720 --window-position=0,0` + getResponsiveSize aspect-preserve

**RESIDUAL BUGS (user-reported persist):**

1. Stream still opens vertical despite 100-06.2 — likely cache OR Chrome IPC merge with --start-maximized host inheritance
2. Multi-stream control: when WebApp B opens, WebApp A bytebot stops working (single-active-wid file empty for 2 active webapps → host-display fallback)

**Detailed handoff:** `.planning/phases/100-multi-stream-window-redesign/CONTINUE.md`

**User reference (hackathon project that solves same use case):** https://github.com/utopusc/selfclaude

## Plan 100-08 — SelfClaude study + proper per-WebApp MCP wiring (QUEUED)

- Study https://github.com/utopusc/selfclaude — patterns user shipped today that work
- Bring patterns back into LivOS: per-WebApp MCP child spawn lifecycle, proper chat-surface tool-routing, kill-host-Chrome-before-spawn for window-size honor
- Likely path:
  ```
  /gsd-discuss-phase 100-08    # spec selfclaude study + adoption
  /gsd-plan-phase 100-08
  /gsd-execute-phase 100-08
  ```

**v33 milestone status:** Phases 92-100 CODE-COMPLETE; Phase 99 + Phase 100 PARTIAL-PASS. v33 does NOT flip to ✅ Shipped until 100-08 ships AND Phase 100 UAT re-walks all 11 rows PASS.
