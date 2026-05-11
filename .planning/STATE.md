---
gsd_state_version: 1.0
milestone: v31.0
milestone_name: Liv Agent Reborn
status: unknown
last_updated: "2026-05-11T22:00:00.000Z"
progress:
  total_phases: 52
  completed_phases: 25
  total_plans: 204
  completed_plans: 196
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v32.0 AI Chat Ground-up Rewrite + Hermes Background Runtime — CODE-COMPLETE 2026-05-06; pending Mini PC UAT signoff
**Last shipped milestone:** v31.0 Liv Agent Reborn — closed 2026-05-05 (P64-P79 all complete)
**Next action:** USER WALK — Mini PC deploy + UAT-CHECKLIST.md (`.planning/phases/91-uat-polish/UAT-CHECKLIST.md`, 10 sections A-J). After UAT signoff: `/gsd-cleanup` to archive phase artifacts; then `/gsd-new-milestone` for v33.

## Current Position

Phase: 103.1 (Master Chrome Hot-Fix + Luse Cross-Display Aggregation) — DEPLOY+VERIFY
Phase: 103 (Master Chrome Streaming + Single-MCP Display-Aware) — DEPLOYED but UAT FAILED on two issues, addressed in 103.1
Milestone: v33.0 (active)

## 103.1 Status (2026-05-11) — SHIPPED + LIVE-VERIFIED on Mini PC

Three-layer bug fix shipped and live-verified end-to-end via tRPC curl on
Mini PC at SHA `f3d471ac`:

- `startLogin` returned `{pid:1151469, display:":10", streamId:"bb999df0..."}`
- 10s post-spawn: `status.running:true` (daemonization filter survived
  the sudo wrapper code=0 exit)
- `hasCookies:true` (Chrome wrote to bruce-owned dir — chown succeeded)
- `ps -ef | grep google-chrome` → 2 processes alive
- Log shows `stream bb999df0 started` with NO subsequent `(stop requested)`
- `stopLogin` returns `{ok:true}` (clean shutdown)

Stale singleton locks were also verified cleaned (3 fake files I injected
earlier are gone after restartLogin).

---

## 103.1 Status (2026-05-11) — Hot-fix: stale singleton lock + chrome daemonization filter + list_windows cross-display aggregation

User-walked Phase 103 UAT on Mini PC (deployed SHA `c89f7139`) surfaced bugs not catchable by unit tests:

- **Bug 1A (stale singleton lock):** `clearStaleSingletonLocks()` removes `SingletonLock`/`SingletonCookie`/`SingletonSocket` before `chromeSpawnFn`. Commit `37f0bfb4`. Necessary but NOT sufficient.
- **Bug 1B (REAL WS 1006 cause — chrome daemonization):** `chromeMaster.startLogin` watched `chrome.child` (the `sudo google-chrome` wrapper). Chrome forks to background on startup; launcher exits with code=0. Pre-fix the exit handler treated ANY exit as a crash → `cleanupMaster` → `stopStream` → client WS 404 → browser code=1006. Fix: filter exit — `code=0+signal=null` → no-op (daemonization), only real crashes (`code!=0` or signal) trigger cleanup. Commit `e531b3c4`. Live-verified on Mini PC via tRPC curl: stream `e2462d48` got `(stop requested)` ms after start pre-1B-fix despite locks cleared. Bug 1 is a 2-cause stack (lock cleanup needed for refusal-to-start; daemonization filter needed for clean-spawn-survival).
- **Bug 2 (list_windows blind to other displays):** When neither display arg NOR defaultDisplay is set (global luse MCP, post-103-05 default-off model), aggregate across `/tmp/.X11-unix/X<N>` socket-scanned displays. Each result row carries its own `display` field. Commit `d634ffe4`.

Tests: 24/24 master-login (5 new including 15b daemonization + 15c signal-cleanup + 3 lock-cleanup) + 44/44 mcp tools (5 new). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 4 commits (`37f0bfb4`, `d634ffe4`, `f8957fc0` docs, `e531b3c4`).

Pushed `c89f7139..e531b3c4` 2026-05-11. Mini PC re-deploy in flight.

Out of scope for 103.1 (deferred to a follow-on patch): duplicate x11vnc spawn cleanup in chromeMaster.startLogin (`vncSpawnFn` orphan, harmless but wasteful); active-WebApp roster prompt snippet (agent can discover via aggregation now); post-daemonization Chrome crash auto-detection via /proc PID polling (user recovers via "Close Master Chrome" button).

In parallel: research agent drafting `.planning/research/local-livinity-setup.md` for `<username>.livinity.local` domain-free local setup (next-phase 104+ scope).

## 103-05 Status (2026-05-11) — Sub-goal B closure: LIVOS_PER_APP_LUSE default-off + orphan sweep

- Wave 2 (103-05): ✅ COMPLETE — `f2e7f2a2..ca1b1f79` (4 commits, TDD RED+GREEN × 2 tasks) — `LIVOS_PER_APP_LUSE` gate in `WebAppWindowManager.spawn()` flipped from `!== '0'` (default ON) to `=== '1'` (default OFF, only literal '1' opts in). New `cleanupOrphanedPerWebAppLuseEntries({mcpConfigManager, logger?})` exported from `legacy-bytebot-cleanup.ts` and wired into `agent-runs.ts` boot block between `cleanupLegacyBytebotState` (line 203) and `registerLuseMcpServer` (line 238) at line 227. Idempotent + non-fatal at three levels (internal listServers catch, internal per-entry removeServer catch, outer `.catch()` in agent-runs.ts).
- Tests: window-manager.test.ts 40/40 pass (35 prior + 5 new under "Phase 103-05 — LIVOS_PER_APP_LUSE default-off env coverage"). legacy-bytebot-cleanup.test.ts 11/11 pass (5 existing + 6 new orphan-sweep tests under "Phase 103-05"). Broader webapps/ suite 232/254 + computer-use/ 227/244 (17 pre-existing platform-specific failures unchanged from baseline).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 4 commits (verified pre + post each commit).
- Decisions: (1) strict-string opt-in (`=== '1'`) over loose match — mirrors Bytebot opt-in pattern; (2) defensive non-string-name filter added beyond plan spec (T-103-05-SWEEP-06) — Redis JSON blobs survive pathological entries silently rather than crashing boot; (3) removeServer-not-implemented guard mirrors `cleanupLegacyBytebotState` pattern (interface declares the method optional).

**Carry-forward to 103-06:** Sub-goal B code is complete. 103-06 is the user-walked Mini PC deploy + UAT — `bash /opt/livos/update.sh` then verify `journalctl -u livos --since today | grep "Phase 103-05 default-off\|orphan-sweep"` shows the SKIPPED logs + clean-state / removing-N log on first post-deploy boot. Token budget should reduce from ~85 → ~17 MCP tools with 5 WebApps open. Operator escape hatch: `LIVOS_PER_APP_LUSE=1` in `/opt/livos/.env` re-enables legacy per-app MCP registration for debug.

## 103-02 Status (2026-05-11) — Sub-goal A UI: Embedded noVNC viewer + input dispatch

- Wave 2 (103-02): ✅ COMPLETE — `c5eb9360` (1 commit, TDD RED+GREEN) — `MasterChromeLogin` Settings panel now renders inline noVNC viewer when `chromeMaster.status` returns `{running:true, wsUrl}`. DOM mouse/keyboard/wheel events on the viewer container forward via `chromeMaster.input.{click,key,type,scroll}` mutations. Close Master Chrome destructive button wires `chromeMaster.stopLogin`. Modifier chords (Ctrl+L) route via key not type (mirrors `webapp-stream-window.tsx`). Printable-char keydowns batched into 250ms debounced `inputTypeMut` flush.
- httpOnlyPaths: +5 entries (stopLogin + 4 input.*) — admin-mid-`systemctl restart livos` resilience parity with 102-07 cluster.
- Tests: master-chrome-login.test.tsx 41/41 pass (16 original + 25 new = 6 viewer-mount + 16 input-dispatch + 3 theme preservation under r14a). chrome-master suite 29/29 still pass (no router regression). Source-text-grep invariants pattern preserved (D-NO-NEW-DEPS — `@testing-library/react` not added).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED.
- Decision: behavioral Tests 1-8 from plan encoded as wiring-pattern grep over handler body source (not @testing-library/react render-and-fire) — same convention as existing 102-07-04 test file (`683c9912`).

**Carry-forward to 103-05:** Sub-goal A UI complete. Settings → Chrome Profile panel is now functional on headless Mini PC (Open → embedded viewer renders → click/type Google login → Close). 103-05 can proceed with `LIVOS_PER_APP_LUSE='0'` flip (Sub-goal B closure) independent of Master Chrome UI.

## 103-04 Status (2026-05-11) — Sub-goal B prompt update: Prescriptive display-arg instruction

- Wave 1 (103-04): ✅ COMPLETE — `dc86a7c2..cab8b331` (2 commits, TDD RED+GREEN) — `buildActiveDisplaySnippet` flipped from descriptive "implicitly scoped via LUSE_TARGET_DISPLAY" to prescriptive "MUST pass display: \":N\" as a tool argument" form. Agent now has unambiguous instruction matching the 103-03 tool-schema contract. Failure-mode disclosure ("falls back to host display :1") added as self-correction signal.
- Tests: agent-prompt-builder.test.ts 26/26 pass (22 existing + 4 new under `Phase 102-06 Pillar C` — prescriptive form, env-name absence, "implicitly scoped" phrase absence, double-quoted interpolation).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across both commits.
- Decision: env name `LUSE_TARGET_DISPLAY` intentionally removed from snippet OUTPUT (agent does not need to know about runtime fallbacks; mentioning it invites "I don't need the arg because env is set" reasoning). Still referenced in JSDoc comments (informational, not prompt-emitted). Belt-and-suspenders runtime fallback preserved in `agent-runner-factory` + `parseDisplayArg → options.defaultDisplay`.

**Carry-forward to 103-05:** Agent instruction now closes the loop on Sub-goal B. 103-05 can flip `LIVOS_PER_APP_LUSE` default to `'0'` — per-WebApp MCP registration becomes redundant because the agent reliably scopes per-call to single global luse MCP via `display: ":N"` arg.

## 103-03 Status (2026-05-11) — Sub-goal B: Single-MCP display-aware tool schema

- Wave 1 (103-03): ✅ COMPLETE — `d38af35f..2bd32a25` (3 commits) — luse-tools.ts schema gains optional `display:":N"` on 13 X11-touching tools (additive, verbatim-contract-extended); tools.ts adds `withScopedDisplay()` + `parseDisplayArg()` helpers; 12 buildHandlers + 1 list_windows thread per-call display through to native primitives via try/finally process.env.DISPLAY scope
- Tests: tools.test.ts 39/39 pass (24 existing + 15 new under `Phase 103-B`); broader computer-use suite 221/238 pass (17 pre-existing platform failures unchanged from baseline)
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits
- Decision: process.env.DISPLAY mutation v1 (relies on MCP stdio JSON-RPC serialization invariant) chosen over execFile env arg v2; documented in withScopedDisplay JSDoc as Pitfall 2 mitigation

**Carry-forward to 103-04/05:** `display:":N"` is now a valid input_schema property on 13 luse tools — 103-04's buildActiveDisplaySnippet should instruct the agent to ALWAYS pass it when scoping to active WebApp; 103-05 can then flip `LIVOS_PER_APP_LUSE` default to `'0'` (skip per-WebApp MCP registration). Invalid display strings ('foo', ':0', ':100', '') fall back to `LUSE_TARGET_DISPLAY` env via the regex guard, so belt-and-suspenders agent compliance is built in.

## 103-01 Status (2026-05-11) — Sub-goal A backend: Master Chrome Xvfb pipeline

- Wave 1 (103-01): ✅ COMPLETE — `978f7bae..f0f09922` (3 commits) — chrome-process-spawner USER_DATA_DIR_RE widened + master-login-routes refactored to factory-injected router with startLogin/stopLogin/input.{click,key,type,scroll} + production wire-up via setProductionAppRouter swap pattern
- Tests: chrome-master (29 pass) + webapps (191/213) + streaming (92/93) suites green; +10 new master-login-routes tests + 4 new chrome-process-spawner tests
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits

**Carry-forward to 103-02:** `chromeMaster.status` returns `{display, wsUrl, streamId}` when running. UI must gate `useWebAppVnc(wsUrl)` on `wsUrl !== null` (Pitfall 4). `input.*` mutations are admin-gated and derive `display` from currentMaster — UI sends only `{x, y, button, kind}` etc.

## 101-00 Wave Status (2026-05-11) — Wave 0 Scaffolding

- Wave 0: ✅ COMPLETE — `1cfafcfe..39297f8c` (3 commits) — chrome-remote-interface install + 10 vitest stub test files + test:run scripts + VALIDATION.md wave_0_complete: true
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED across all 3 commits
- Wave 1 unblocked: 101-01 (CDP bootstrap) + 101-02 (port allocator) + 101-03 (native app spawner) ready for parallel dispatch (`workflow.use_worktrees: true`, file-disjoint)

**Key decision:** Stub-first TDD scaffold — each Wave 1+ TDD plan's RED-phase task opens a pre-existing stub file with `it.skip(...)` placeholders. Cheapest possible "file on disk" guarantee + describe-block names encode owning plan + task for executor agents.

**Out-of-scope deferred:** Pre-existing test infra failures (10 ui tests missing jsdom env, 3 livinityd integration tests requiring Linux dbus) logged to `.planning/phases/101-livos-universal-app-orchestration/deferred-items.md`. Not Wave 0 regressions.

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

**Planned Phase:** 103 (Master Chrome Streaming + Single-MCP Display-Aware) — 6 plans — 2026-05-11T20:08:40.551Z

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
