# Phase 101: LivOS Universal App Orchestration — CONTEXT

**Gathered:** 2026-05-10 (autonomous UAT round 2 — user formalized Phase 101 vision after 100-10-14 ship)
**Status:** Ready for planning (`/gsd-plan-phase 101` or `/gsd-autonomous --only 101`)
**Parent:** `100-CONTEXT.md` (foundational), `100-10-CONTEXT.md` (immediate predecessor)
**Trigger:** User UAT 2026-05-10 verbatim:

> "Soyle yapsak ben uygulamaya tikladigimda Bir portda screen acilsa 1280x720p olsa ve bana sadece buranin yayimi yapilsa ama chrome gozuksun pencereleri ile beraber Ben Chrome u goreyim ayrica ben farkli bir uygulama actigimda yine ayni profiul ama farkli portda farkli yayim ama tikladigim uygulamanin sayfasi acilsa mesela livinity.io gibi. Ayrica uygulamanin penceresindeykem chat ile konustugumda luse anlasin hangi pencerede oldugunu otomatik olarak ve ona gore kontrol etsin. Ayrica sadece webapp ler icin degil Ubuntu icerisindeki app leri de ekleyebileyim mesela Ubuntuya Antigravity kurdum ide. Bu uygulamaya tikladigimda livinity de Yeni screen otomatik eklensin ardindan 1280x720p de yayim baslasin taki ben kapatana kadar. Simdi yeniden gsd olustur ayrica teaching mod hala yarraq gibi mk ... Ben tikladim ya teaching mod a Video kaydedermis gibi second uzerinden kaydetmesin Steplerimi kaydetsin tiklamalarimi kaydetsin ve her tiklamada bir pop up acip bana sorsun! Ayrica Pencerenin altindaki chat ekraninda Soru sordugumda Animasyon gostersin dusunurken veya bostayken. Simdi gsd plani hazirla paralel calistirilabilinsin bazi seyler birde supercharge olsun token kullanimi yukjsek ve hizli olsun"

---

## Six Pillars of Phase 101

### Pillar A — One Chrome, multiple per-app streams (same profile)
- Tek Chrome instance, `--user-data-dir=/home/bruce/.config/livos-chrome`, `Default` profile (memory: `lucyfeilu123@gmail.com` Google login)
- Chrome `--remote-debugging-port=9222` ile başlatılır boot-time'da
- Her LivOS app icon tıklaması → CDP `Target.createTarget({url, newWindow: true})` ile yeni Chrome window
- Her yeni window kendi WID'i, kendi x11vnc port'u (15900+ range), kendi LivOS stream window'u
- User Chrome'u görsün — `--app=URL` args ile chromeless mod (mevcut davranış korunur)

### Pillar B — Ubuntu native apps in the same orchestration
- LivOS dock'a Ubuntu native binary'ler eklenebilir (örn. Antigravity IDE, VSCode, Files, vs.)
- Native app icon tıklaması → `DISPLAY=:1 <binary>` spawn → fluxbox window tree'e girer → x11vnc capture eder
- WebApp ile aynı stream lifecycle (port + LivOS stream window + close-on-kill)
- Native app config Redis'te `liv:apps:native:<id>` namespace'i (WebApp config'le simetrik)

### Pillar C — Luse window-context auto-awareness
- User chat panel'i WebApp window'unda açtığında → chat session başlangıcında aktif window'un WID + URL + app metadata Luse agent'a OTOMATIK enjekte
- Agent her tool çağrısında "hangi pencere" sormak zorunda kalmaz — context'te zaten var
- Implementation: chat WebSocket start envelope'a `activeWid + activeAppId` ekle; agent system prompt'a "Active window context" snippet enjekte et

### Pillar D — SelfClaude action-driven Teach (sub-goal B from 100-10-12 RESEARCH)
- Interval-based capture DELETED
- Click → stream brief pause → instruction prompt popover ("Bu adımı ne için yapıyorsun?") → user yazar + Save → step recorded
- v3 action_log format: `{steps: [{action, instruction, screenshot_before, screenshot_after, t}]}`
- v2 skills (today's recorded ones) replay via lazy-translation shim (100-10-02 D-100-10-I pattern)
- Save dialog Mini PC live UAT örneği: "10 actions captured over 9.5s. Give the skill a name to save it" — bu YANLIŞ flow, v3 her step için per-step save

### Pillar E — Chat thinking + idle animations
- **Streaming animation:** "düşünüyor" 3 nokta pulsing — `isStreaming && !lastAssistantMessage` durumunda
- **Idle pulse:** chat input boş + idle → subtle breathing (4s cycle, opacity 0.3-0.8 ease-in-out)
- **Streaming caret:** mevcut (100-10-06) — improved
- **Per-tool status line:** mevcut (100-10-10) — Hermes phrase backend gap kapanır (Phase 101 sub-goal C)

### Pillar F — Phase 101 sub-goal C (carried forward from 100-10-10)
- `agent-session.ts` → runStore status_detail relay
- Hermes `{phase, phrase, elapsed}` chunks Claude SDK direct relay'inden ChatResponseBar'a ulaşır
- "Calling list_windows..." gibi gerçek phrase'ler stream edilir

---

## Locked Decisions (D-101-*)

### D-101-CHROME-CDP — Chrome CDP bootstrap
- Boot livinityd: spawn Chrome with `--remote-debugging-port=9222 --user-data-dir=/home/bruce/.config/livos-chrome --no-first-run --no-default-browser-check --new-window=about:blank`
- Single Chrome process always alive (independent of any specific WebApp)
- Wait for CDP ready (`http://localhost:9222/json/version` returns 200)
- Use `chrome-remote-interface` npm package for CDP client
- Reconnect on Chrome crash (poll, restart Chrome if dead)
- about:blank "shell" window stays hidden via `Browser.setWindowBounds({windowState: 'minimized'})` after boot

### D-101-CDP-SPAWN — Per-WebApp CDP-driven spawn
- Replace today's `--app=URL` argv path (window-manager.ts) with CDP call:
  ```ts
  const target = await cdp.Target.createTarget({url, newWindow: true, background: false});
  const {windowId} = await cdp.Browser.getWindowForTarget({targetId: target.targetId});
  await cdp.Browser.setWindowBounds({windowId, bounds: {width: 1280, height: 720, left: offsetX, top: offsetY}});
  ```
- Cascade offset preserved per 100-10-11 (`(0,0), (120,120), (240,240), ...` with 10-slot wrap)
- WID extraction from `Browser.getWindowForTarget` → no more xdotool poll race

### D-101-PORT-ALLOC — Per-app port allocator
- Range `15900..15999` (after Phase 99 `VNC_PORT_COUNTER 15900..16099` — yeniden kullan)
- Linear allocation: `allocateNextStreamPort(): {port, streamId}`
- Release on app close
- Max 100 concurrent app streams (Mini PC RAM budget ~ 100MB per Chrome window + 50MB per x11vnc = ~150MB × 100 = 15GB max; pragmatic cap)

### D-101-NATIVE-APPS — Ubuntu native app integration
- LivOS dock'a "Add Native App" affordance (Settings veya right-click empty dock area)
- Form fields: `name, iconUrl, binaryPath, args[], env{}`
- Saved to Redis `liv:apps:native:<id>` (UUID-keyed, like `liv:apps:webapp:<id>`)
- Icon click triggers `nativeAppSpawn(id)`:
  ```ts
  const cfg = await redis.get(`liv:apps:native:${id}`);
  const proc = spawn(cfg.binaryPath, cfg.args, {
    env: {...process.env, DISPLAY: ':1', LUSE_TARGET_WINDOW_ID: ''},
    detached: true,
  });
  ```
- After spawn, poll for matching window via `cdp.dom` OR xdotool (CDP not available for non-Chrome apps; xdotool needed here)
- Bind first new window appearing on `:1` matching the binary's WM_CLASS to a fresh stream port
- LivOS stream window auto-opens with the streamId

### D-101-LUSE-CONTEXT — Automatic window context
- Chat WebSocket envelope `{type: 'start', webappId, conversationId, message, activeWid, activeAppMeta}`
- `activeWid` (X11 window id hex) + `activeAppMeta` (`{appId, kind: 'webapp'|'native', url?, binary?, title}`) sent every time chat opens within an app window
- Backend (agent-session.ts) reads these → injects into agent system prompt:
  ```
  ## Active Window Context
  You are operating in the context of the LivOS app: {title} ({kind}).
  Window ID: {activeWid}
  URL/Binary: {url ?? binary}
  Default LUSE_TARGET_WINDOW_ID for all your tool calls is {activeWid} unless you override explicitly.
  ```
- Per-WebApp Luse MCP instance already carries `LUSE_TARGET_WINDOW_ID` env (100-08-04) — this overrides default via env; chat injection is the SOFT default for ambiguous calls

### D-101-TEACH-V3 — SelfClaude action-driven Teach
- New `action_log v3` schema in same table as v2 (`version` column distinguishes)
- Recording flow:
  1. User clicks Teach button → mode armed
  2. xdotool poll OR CDP Input event listener fires on click
  3. livinityd captures: `{action: 'click', x, y, wid, button, modifiers, t}`
  4. WebSocket emit `{type: 'teach_step_pending', stepDraft}`
  5. UI overlays popover anchored at (x, y) with text input "Bu adımı ne için yapıyorsun?"
  6. User types instruction + Save → WebSocket emit `{type: 'teach_step_commit', instruction}`
  7. Backend records full step `{action, instruction, screenshot_before, screenshot_after, t}` to v3 skill draft
  8. Mode returns to armed
- Skill finalize: user clicks Stop → name dialog → `INSERT INTO skills (version: 3, steps: [...], name)` (rename "Save skill" dialog to "Adlandır")
- Replay v3: for each step, executor runs `action`. If pixel drift detected (screenshot_before doesn't match), agent reads `instruction` and recovers via vision (defer to Phase 102 — v3 v1 hard-fail on drift, log instruction context to logs)

### D-101-CHAT-ANIMS — Chat animations
- **Thinking pulse (NEW):** when `isStreaming && messages.length === lastSentCount` (i.e., user sent but no response token yet) → render 3 dots with staggered pulse:
  ```tsx
  <span className='inline-flex gap-1'>
    <span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:0ms]' />
    <span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:150ms]' />
    <span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:300ms]' />
  </span>
  ```
- **Streaming caret (KEPT):** mevcut (100-10-06)
- **Idle pulse (NEW):** chat input area not focused + no value → subtle border breathe via `@keyframes idleBreath` 4s cycle
- **Per-tool status (KEPT):** mevcut (100-10-10) — currentTool render; Hermes phrase'i Pillar F backend bridge ile gerçek değer alacak

### D-101-PORT-RANGE-EXTEND — Stream port range
- `15900..15999` (100 slot) per D-101-PORT-ALLOC
- Existing `VNC_PORT_COUNTER` (Phase 99) reused as allocator — no new global state
- Per-app port released on app close (`releasePort()`)

### D-101-SHARED-PROFILE — Same profile across all apps
- Carries forward from D-100-SHARED-PROFILE (100-10-08 revert decision)
- Same `--user-data-dir=/home/bruce/.config/livos-chrome` for ALL apps
- Same `Default` profile → same Google login (`lucyfeilu123@gmail.com`)
- Single Chrome process via CDP avoids the singleton lock issue entirely

### D-101-SACRED — Sacred SHA preserved
- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED
- Pre-commit hook enforces
- NEVER `--no-verify`

### D-101-NO-SERVER4 — Mini PC only
- `bruce@10.69.31.68` only deploy target
- Server4 + Server5 off-limits

### D-101-BACKWARDS-COMPAT — v2 skills + legacy WebApps
- v2 action_log skills replay via lazy-translation shim (100-10-02 + 100-10-09 pattern)
- Old WebApps that boot directly via `--app=URL` argv (pre-CDP) → first-boot migration: existing icons get re-spawned via CDP after Phase 101 deploy
- No data loss during migration

---

## Sub-Plan Decomposition (10 plans, 4 waves, parallel-friendly)

### Wave 1 — Foundation (3 plans, **PARALLEL** — file-disjoint)

| Plan | Title | Files | Tasks | Autonomous |
|------|-------|-------|-------|-----------|
| **101-01** | Chrome CDP bootstrap | `chrome-cdp/bootstrap.ts`, `chrome-cdp/client.ts`, tests, `livinityd/source/index.ts` (boot wire) | 5 | yes |
| **101-02** | Per-app port allocator (15900..15999) | `streaming/port-allocator.ts`, tests, `streaming/stream-manager.ts` (consumer wire) | 4 | yes |
| **101-03** | Native app spawn helper | `apps/native-app-spawner.ts`, tests, Redis schema `liv:apps:native:<id>`, tRPC `apps.native.{list,create,delete}` | 5 | yes |

### Wave 2 — Wire-up (3 plans, **PARALLEL** — file-disjoint)

| Plan | Title | Files | Tasks | Autonomous | Deps |
|------|-------|-------|-------|-----------|------|
| **101-04** | CDP-driven WebApp spawn | `webapps/window-manager.ts` (rewrite spawn path), tests | 6 | yes | 101-01 |
| **101-05** | Native app stream binding | `apps/native-app-binder.ts` (xdotool WM_CLASS match + port bind), tests | 5 | yes | 101-02, 101-03 |
| **101-06** | Luse auto-context injection | `ai/agent-session.ts` (start envelope), `ai/agent-prompt-builder.ts` (system prompt snippet), tests | 4 | yes | none (independent of Wave 1) |

### Wave 3 — UI + Backend bridge (3 plans, **PARALLEL** — file-disjoint)

| Plan | Title | Files | Tasks | Autonomous | Deps |
|------|-------|-------|-------|-----------|------|
| **101-07** | LivOS dock native app integration UI | `ui/.../dock/native-app-form.tsx`, `ui/.../dock/native-app-icon.tsx`, tRPC client wire | 5 | yes | 101-03 |
| **101-08** | SelfClaude Teach v3 refactor | `webapps/teach-recorder.ts` (rewrite), `ui/.../teach-popover.tsx` (new), v3 action_log schema migration, tests | 8 | yes | 101-01 (CDP click events) |
| **101-09** | Chat animations + Hermes phrase relay | `ai/agent-session.ts` (relay status_detail from runStore), `ui/.../webapp-floating-action-bar.tsx` (thinking dots), `ui/.../chat-bar.tsx` (idle pulse), tests | 6 | yes | none |

### Wave 4 — Deploy + UAT (1 plan, user-walked)

| Plan | Title | Files | Tasks | Autonomous |
|------|-------|-------|-------|-----------|
| **101-10** | Mini PC deploy + 20-row UAT walk | ROADMAP.md, STATE.md, UAT-CHECKLIST.md | 6 | **no** |

**Dependency graph:**

```
Wave 1 (parallel):
  101-01 (CDP bootstrap) ──┐
  101-02 (port alloc) ─────┼──→ Wave 2 (parallel):
  101-03 (native spawn) ───┘    101-04 (CDP WebApp spawn) ──┐
                                101-05 (native binder) ─────┤
                                101-06 (luse auto-ctx) ─────┤
                                                            ├──→ Wave 3 (parallel):
                                                            │    101-07 (dock UI) ──┐
                                                            │    101-08 (teach v3) ─┤
                                                            │    101-09 (anims) ────┤
                                                            │                       ├──→ Wave 4:
                                                            └───────────────────────┴──→ 101-10 (deploy + UAT)
```

**Estimated:** 10 plans × ~3 tasks each ≈ 30-35 atomic commits. With Wave 1+2+3 parallel execution via worktrees: ~3-4 hours autonomous execution (vs. ~10 hours sequential). User-walked Wave 4 in ~30 min after auto waves.

---

## Supercharge Configuration (for executor agents)

To honor user's "supercharge olsun token kullanimi yukjsek ve hizli olsun":

- **Executor model:** `opus` (already set in init via .planning/config.json — verify per phase)
- **Parallelization:** `true` (.planning/config.json `workflow.parallelization: true` — verify)
- **Worktrees:** `true` (`workflow.use_worktrees: true`) for file-disjoint parallel execution
- **Context window:** 1M model — full plan + research + sibling SUMMARYs in single agent context
- **Plan generation:** `gsd-planner` should produce TDD-pattern plans (RED → GREEN → REFACTOR? → SUMMARY) with `type: tdd` heuristic where applicable
- **Skip-checks:** `--no-transition` flag on execute-phase chain (no auto-advance to next phase after each plan)

---

## Canonical References

### Parent context
- `.planning/phases/100-multi-stream-window-redesign/100-CONTEXT.md`
- `.planning/phases/100-multi-stream-window-redesign/100-10-CONTEXT.md`
- `.planning/phases/100-multi-stream-window-redesign/100-10-12-RESEARCH.md` (SelfClaude pattern design — 101-08 dependency)
- `.planning/ROADMAP.md` (Phase 101 entry + 3 sub-goals already planted by 100-10-08 + 100-10-12)

### External research (planner + researcher agents must consult)
- https://github.com/utopusc/selfclaude — SelfClaude Teach pattern reference (101-08)
- https://chromedevtools.github.io/devtools-protocol/tot/Target/ — CDP Target domain (101-01, 101-04, 101-08)
- https://chromedevtools.github.io/devtools-protocol/tot/Browser/ — CDP Browser domain (101-01, 101-04)
- https://chromedevtools.github.io/devtools-protocol/tot/Input/ — CDP Input.dispatchMouseEvent (101-08 SelfClaude clicks)
- https://github.com/cyrus-and/chrome-remote-interface — recommended Node.js CDP client lib (101-01)

### Code paths to modify

**Wave 1:**
- NEW: `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts` (Chrome process lifecycle + CDP ready-wait)
- NEW: `livos/packages/livinityd/source/modules/chrome-cdp/client.ts` (`chrome-remote-interface` wrapper)
- NEW: `livos/packages/livinityd/source/modules/streaming/port-allocator.ts` (15900-15999 linear allocator)
- NEW: `livos/packages/livinityd/source/modules/apps/native-app-spawner.ts` (Ubuntu native binary spawn + lifecycle)
- MODIFIED: `livos/packages/livinityd/source/index.ts` (boot wire all three)

**Wave 2:**
- REWRITE: `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (spawn() now uses CDP, not `--app=URL` argv)
- NEW: `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` (xdotool WM_CLASS watch → fresh stream port bind)
- MODIFIED: `livos/packages/livinityd/source/modules/ai/agent-session.ts` (WebSocket start envelope reads activeWid+activeAppMeta)
- MODIFIED: `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (system prompt active-window snippet)

**Wave 3:**
- NEW: `livos/packages/ui/src/modules/dock/native-app-form.tsx`
- NEW: `livos/packages/ui/src/modules/dock/native-app-icon.tsx`
- REWRITE: `livos/packages/livinityd/source/modules/webapps/teach-recorder.ts` (event-driven, not interval)
- NEW: `livos/packages/ui/src/modules/window/teach-popover.tsx` (instruction prompt at click point)
- MODIFIED: `livos/packages/livinityd/source/modules/skills/skill-replay-tool.ts` (v3 replay path)
- MODIFIED: `livos/packages/livinityd/source/modules/ai/agent-session.ts` (Hermes status_detail relay from runStore)
- MODIFIED: `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` (thinking dots)
- MODIFIED: `livos/packages/ui/src/modules/window/webapp-chat-bottom-bar.tsx` (idle pulse) — or wherever chat input lives

**Wave 4:**
- MODIFIED: `.planning/ROADMAP.md` (Phase 101 entry flipped from `[ ]` to `[x]`, sub-goals A/B/C verified shipped)
- MODIFIED: `.planning/STATE.md` (current position post-101)
- NEW: `.planning/phases/101-livos-universal-app-orchestration/UAT-CHECKLIST.md` (20-row walk)

### Locked constraint (NEVER touch)
- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

---

## Success Criteria (UAT walk, 20 rows)

After 101-10 deploy:

| # | Test | Pass Criteria |
|---|------|---------------|
| 1 | `curl -s http://localhost:9222/json/version` on Mini PC | Returns Chrome version JSON (CDP up) |
| 2 | `pgrep -af 'google-chrome.*--remote-debugging-port=9222'` | Single Chrome process running |
| 3 | Click WebApp icon `livinity.io` in LivOS dock | New stream window opens, port from 15900+ range, Chrome window visible inside |
| 4 | Click 2nd WebApp icon `google.com` | Different port, different stream window, SAME profile (top-right shows same Google account) |
| 5 | Both windows visible in fluxbox on `:1` | `DISPLAY=:1 wmctrl -l` shows 2 distinct windows |
| 6 | Add Ubuntu native app config: Antigravity IDE | tRPC `apps.native.create` succeeds; icon appears in dock |
| 7 | Click Antigravity icon | Native binary spawns with `DISPLAY=:1`; new stream window auto-opens 1280x720 |
| 8 | Chat session in WebApp window has activeWid context | Test prompt: "What window am I in?" — agent answers with the WebApp's title/URL without explicit list_windows call |
| 9 | Teach mode v3: click stream → popover appears | Instruction input shown at click point |
| 10 | Type instruction "Click search box" + Save | Step recorded; mode returns to armed |
| 11 | Save skill with name "Search Test" | v3 record persisted (version=3 in DB) |
| 12 | Replay "Search Test" skill | Each step replays with screenshot validation; if drift detected, instruction text logged |
| 13 | v2 (existing) skills still replay | Backwards-compat shim works |
| 14 | Chat thinking dots animation | While streaming + no response yet, 3 staggered-pulse dots visible |
| 15 | Chat idle pulse animation | Empty input, no focus → subtle border breathe |
| 16 | Per-tool streaming line (Hermes phrase) | While agent runs `list_windows`, status line shows "Listing windows..." (Hermes phrase, not just `currentTool`) |
| 17 | Close WebApp window | Stream port released; CDP target destroyed; LivOS stream window closes |
| 18 | Close native app window | Same lifecycle as WebApp |
| 19 | Sacred SHA preserved | `git hash-object liv/packages/core/src/sdk-agent-runner.ts` equals `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on Mini PC |
| 20 | Concurrent 5 WebApps + 2 native apps | All 7 streams active, no overlap, no crash, ~1.5GB RAM total |

---

## Deferred (out of Phase 101 scope)

- **Phase 102:** v3 skill drift recovery via vision (agent reads `instruction` + uses screenshot+click chain to recover from coord drift). Requires Phase 101's CDP foundation + Luse vision tools.
- **Multi-user WebApps:** Locked out per D-V33-07 (v34+).
- **Per-app profile isolation:** Rejected — same profile shared by design (D-101-SHARED-PROFILE).
- **WebRTC stream transport:** Deferred (v34).
- **Container migration (selfclaude-style):** Deferred (v34+).
- **Agent-as-recorder:** Reverse SelfClaude (agent watches user, auto-annotates) — Phase 102+ research item.
- **Skill versioning / fork:** Allow user to fork+modify a skill. Phase 102.

---

## Risks

1. **CDP-driven spawn breaks existing WebApps.** Mitigation: Wave 1 ships CDP infra without changing window-manager; Wave 2 rewrites window-manager.spawn to use CDP. UAT row 3 catches regressions early.
2. **Native app WM_CLASS matching is flaky** (some apps spawn child processes that own the visible window). Mitigation: poll for up to 5 seconds; if no match, mark spawn as failed + offer manual port-bind UI.
3. **Teach v3 popover race conditions** (rapid clicks while previous popover open). Mitigation: queue clicks; show "step N pending — waiting for instruction" indicator; user can cancel queued step.
4. **Chrome CDP connection drops** (Chrome crash, OOM). Mitigation: bootstrap monitors Chrome PID; on death, respawn + reconnect; in-flight WebApp windows lost (acceptable degenerate case — user reopens via dock).
5. **CPU/memory overhead of 1 Chrome + N x11vnc + M native apps** on Mini PC (32GB RAM). Mitigation: per-app port allocator caps at 100; LivOS dock shows resource indicators; idle-window auto-suspend (Phase 102).
6. **SelfClaude click capture latency** if using xdotool poll vs CDP. Mitigation: CDP click event listener via `Page.handleClickEvent` callback (CDP gives frame-perfect timing); xdotool only as fallback for non-Chrome apps.

---

## Sacred SHA Constraint (carries forward unchanged)

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every 101 commit. Pre-commit hook at `.husky/pre-commit` enforces. NEVER use `--no-verify`. NEVER edit the sacred file.

---

## Phase 101 Pre-Plan Checklist (for the planner agent)

When `gsd-planner` agent reads this CONTEXT, it must:

1. ✓ Produce 10 PLAN.md files (`101-01-PLAN.md` through `101-10-PLAN.md`) per the decomposition above
2. ✓ Wave assignment per the dependency graph (1, 2, 3, or 4 — within each wave plans are file-disjoint and parallelizable)
3. ✓ Every task has `<read_first>`, `<acceptance_criteria>` (grep-verifiable), concrete `<action>`
4. ✓ Sacred SHA pre/post verify embedded in plans touching the `liv/` tree (101-09 may touch agent-session.ts)
5. ✓ Wave 1+2+3 plans marked `autonomous: true` (10 plans total, 9 autonomous + 101-10 user-walked)
6. ✓ Backwards-compat shim for v2 skills captured as task in 101-08
7. ✓ Test files use the existing patterns from 100-10 (spawn-spy for window-manager, vitest standard for ts)
8. ✓ Plan-checker run AFTER planner; iterate up to 3 revisions if BLOCKERs found

---

## Next Step

`/clear` then:

```
/gsd-plan-phase 101 --chain
```

Or for full autonomous (10 plans + 10 deploys, no user pauses except 101-10 UAT):

```
/gsd-autonomous --only 101
```

The planner will read this CONTEXT and produce the 10 PLAN.md files per the decomposition + parallelism graph. Plan-checker verifies. Execute-phase runs Wave 1+2+3 in parallel waves (file-disjoint), then Wave 4 is user-walked.

**Estimated total:** ~30-35 atomic commits across 4 waves. Sacred SHA `f3538e1d…` stays throughout. Mini PC deploy + UAT closes 101.

After 101 ships, the user has:
- One Chrome, multiple per-app streams (same Google login across all)
- Ubuntu native apps as first-class LivOS citizens
- Luse window-context awareness (no more "hangi pencerede?" questions)
- SelfClaude action-driven Teach (click → instruction → step)
- Chat animations (thinking + idle + per-tool phrase)
- v2 skills replay backwards-compatible
