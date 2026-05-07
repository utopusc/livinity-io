# v33.0 — WebApp Launcher + Teach/Auto Modes (DRAFT v2)

**Status**: PROPOSAL (2026-05-07, v2 after user pivot away from per-WebApp containers).
**Inspired by**: Warmwind teaching-mode pattern. See `.planning/research/warmwind/SUMMARY.md`.

---

## 1. Vision

> User right-clicks empty desktop → "Add WebApp" → pastes URL (e.g. `https://facebook.com`) → LivOS auto-extracts title + favicon → desktop icon appears.
>
> User clicks the icon → a new Chrome **window** opens on the host Mini PC at that URL, **using the user's existing Chrome profile** (already-logged-in Google/Facebook session is preserved). LivOS captures that one window and streams it back to the browser as a live VNC feed.
>
> Below the streamed window, the v32 AI chat panel with mode selector:
> - **Watch** (default): silent observer
> - **Teach**: records every action (clicks, keys, screenshots) as a reusable skill keyed on the URL
> - **Auto**: runs a goal ("post a tweet saying X") via skill-guided bytebot loop, scoped to that one Chrome window
> - **Chat**: side-by-side conversation about what's on screen

---

## 2. What changed from v33-DRAFT v1

| v1 (containerized) | v2 (host-direct) |
|---|---|
| One Docker container per (user, webapp) running Chromium + Xvfb + x11vnc + websockify | One Chrome **window** per WebApp, all sharing the host's existing Chrome profile and process |
| Per-WebApp port allocation 14200-14999 | Per-window VNC port allocation, x11vnc `-id <window_id>` |
| 1.5 GB RAM per container, idle reaper, max 2 concurrent | Effectively free — windows already exist; only x11vnc daemons add ~10 MB each |
| Per-WebApp Xvfb display (clean from Mutter quirks) | Host GNOME / Mutter (existing P79 environment, with the maim/xdotool input fixes already shipped) |
| Login state isolated per WebApp | **Login state SHARED** — same Google profile across all WebApps (user's explicit requirement) |

---

## 3. Why this is the right move

| Reason | Detail |
|---|---|
| **User explicit constraint** | "Container spawner olmasın, her şey local PC'de olsun, aynı Google profili profil değişmesin." |
| **Profile sharing UX** | Logging into Google/Facebook once works across every WebApp. Containerized isolation would force re-login per WebApp. |
| **Bytebot already lives on host GNOME** | P79 (just shipped) makes screenshot + xdotool work against host display. Reusing that for WebApp windows is one extra arg (`--window <wid>`), not a new architecture. |
| **Resource economy** | Mini PC has 32 GB RAM; running 5 Docker containers eats it for marginal gain. A user's existing Chrome process already serves all WebApps — windows are nearly free. |
| **Faster shipping** | Eliminates the hardest phase (P93 container spawner) of v1 — drops total milestone effort by ~30%. |

---

## 4. Architectural decisions (LOCKED)

### D-V33-01 — Host Chrome with `--new-window` per WebApp
- A single Chrome process on the Mini PC. WebApp click runs `google-chrome --new-window <url>` (or attaches to existing process via that same flag — Chrome handles both).
- The user's existing Chrome profile (`~/.config/google-chrome/Default`) is used as-is. Cookies, sessions, extensions, bookmarks all persist.
- **Rejected**: separate `--user-data-dir` per WebApp (would force per-WebApp re-login — user explicitly does not want this).

### D-V33-02 — Window discovery via title-poll after spawn
- After `chrome --new-window <url>`, poll xdotool for a new window whose title matches the URL hostname or the page `<title>`. Timeout 5s.
- Returns X window ID (`wid`) used everywhere downstream.
- **Rejected**: Chrome DevTools Protocol (CDP) approach. Requires user to start Chrome with `--remote-debugging-port` (manual config). Defer to v34 as a "power-user" upgrade.

### D-V33-03 — Per-window streaming via `x11vnc -id <wid>`
- One `x11vnc` daemon per active WebApp window. `-id <wid>` scopes the VNC feed to just that window.
- `-rfbport <ephemeral>` — port allocator in Redis `liv:webapp:ports`.
- `websockify` bridges to browser. Existing app gateway middleware proxies `/webapp-vnc/<webappId>` → websockify.
- **Risk**: x11vnc on Mutter — needs verification spike. Mutter composited windows may not expose pixmap to XGetImage. **Phase 93 includes a 30-min spike to verify and pick fallback if needed** (alternatives: `ffmpeg -f x11grab` cropped to window region; or maim-loop streamed as MJPEG).

### D-V33-04 — Window close = stream stop
- WebApp window closed by user (Chrome ✕) → x11vnc daemon dies via parent-window-gone signal → websockify exits → frontend reconnect fails → window UI shows "Stream ended" with reopen button.
- No 15-minute idle reaper needed — Chrome windows belong to the user and live as long as the user wants.
- WebApp icon click while window already exists → focus existing window via `wmctrl -ia <wid>` instead of opening a duplicate.

### D-V33-05 — Per-WebApp Postgres `webapp_skills` table, JSONB action log
- Same as v1 D-V33-03. Skill = ordered list of `{type, coords, key, ts, screenshotRef}` events keyed on `(user_id, webapp_id, name)`.
- Screenshots stored under `/data/webapp-skills/<userId>/<sessionId>/<ts>.png` (90% JPEG, 1280×800 max).

### D-V33-06 — Auto mode = bytebot loop with `--window <wid>` scoping
- Standard bytebot computer-use tools (`computer_screenshot`, `computer_click_mouse`, etc.) gain an optional `targetWindowId?: number` parameter.
- When set: `xdotool --window <wid> mousemove 100 200 click 1` instead of global mousemove. Ditto for screenshots: `maim -i <wid> /tmp/shot.png`.
- Skill log injected into agent system prompt as guidance, not deterministic playback. Vision validates each step.
- **Sacred constraint**: `liv/packages/core/src/sdk-agent-runner.ts` (SHA `f3538e1d…`) UNTOUCHED. All extensions through `LivAgentRunner` wrapper or new modules.

### D-V33-07 — Shared Chrome profile, single user only (Mini PC scope)
- v33 ships for the single Mini PC user (`bruce`). No multi-user isolation in this milestone.
- Multi-user mode (per-user Chrome profile under `/home/<u>/.config/google-chrome`) deferred to v34.

### D-V33-08 — No new AI chat UI
- Existing v32 chat components (`MessageThread`, `ChatComposer`, `ToolCallPanel`) mounted as the AI panel inside the WebApp window. No second chat surface.

---

## 5. Phase breakdown (7 phases, 4 waves — down from 8/5 in v1)

### Phase 92 — Metadata extractor (S, 1-2 days) — Wave 1
**Same as v1.** URL → `{title, faviconUrl, description, ogImage}` via livinityd tRPC `webapp.extractMetadata`. Redis cache 24h. Validate URL.

**Files**: `livos/packages/livinityd/source/modules/webapps/{metadata-extractor,trpc-router}.ts`. Postgres migration: `webapps` table.

**Deps**: none.

---

### Phase 93 — Host Chrome window manager + per-window x11vnc (M, 3-4 days) — Wave 1

**Goal**: Given `(userId, webappId, url)`, spawn a Chrome window on the host, attach x11vnc to that window, return a websocket URL the browser can connect to.

**Scope**:
- **0.5-day spike first**: verify `x11vnc -id <wid>` works on host Mutter. If it returns black like scrot did pre-P79, fall back to `ffmpeg -f x11grab` cropped via `-video_size WxH -i :0+X,Y` from window geometry.
- `WebAppWindowManager` class in livinityd:
  - `spawn({userId, webappId, url}) → {vncWsUrl, windowId, port}` — runs `google-chrome --new-window <url>`, polls xdotool for new window matching title, allocates port from `liv:webapp:ports` Redis pool, spawns `x11vnc -id <wid> -rfbport <port> -localhost -shared -forever`, then `websockify <wsPort> localhost:<port>`.
  - `focus({webappId})` — finds existing window via `wmctrl`, calls `xdotool windowactivate --sync <wid>`.
  - `close({webappId})` — kills x11vnc + websockify; Chrome window stays (user closes via Chrome UI when ready). Or kill via `xdotool windowkill <wid>` if user explicitly clicks "X" in WebApp shell.
  - `list({userId})` — active webapps + window IDs + ports.
- App gateway middleware: `/webapp-vnc/<webappId>` → websockify proxy.
- Idle x11vnc cleanup: when underlying Chrome window closes (detected via `xprop -id <wid>` polling), tear down x11vnc + websockify automatically.

**Files**:
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts`
- `livos/packages/livinityd/source/modules/webapps/x11vnc-spawn.ts`
- `livos/packages/livinityd/source/modules/webapps/window-discovery.ts` (xdotool/wmctrl wrappers)
- `livos/packages/livinityd/source/server/webapp-gateway-middleware.ts`

**Deps**: P92 (URL → title for window-discovery title match).

---

### Phase 94 — Desktop "Add WebApp" context menu + persistence (S, 1-2 days) — Wave 2

**Same scope as v1.** Right-click → "Add WebApp" item → dialog with URL input + metadata preview → save → desktop icon. Postgres `webapps` table. tRPC `webapps.{create,list,delete,update}`. New `WebAppIcon` component renders alongside Docker apps via existing `app-grid.tsx`.

**Files**:
- `livos/packages/ui/src/modules/desktop/{add-webapp-dialog,webapp-icon}.tsx` (new)
- `livos/packages/ui/src/modules/desktop/desktop-context-menu.tsx` (1 new ContextMenuItem)
- Postgres migration: `webapps` table.

**Deps**: P92 (metadata API).

---

### Phase 95 — WebApp Stream Window with VNC + AI panel (M, 3-5 days) — Wave 3

**Goal**: Click WebApp icon → window opens with live Chrome stream on top + v32 AI chat panel below + 4-mode selector. (Combined v1's P95+P96 — they're inseparable in this design.)

**Scope**:
- New window content type `webapp-stream`.
- `WebAppStreamWindow.tsx` — vertical split: top 70% react-vnc (or @novnc/novnc) connected to wsUrl, bottom 30% v32 chat panel + mode selector.
- On window open: tRPC `webapps.spawn({webappId})` → returns `{wsUrl, windowId}`. On window close: `webapps.close({webappId})`.
- Toolbar above stream: ←/→/refresh/copy URL/fullscreen-on-host/popout.
- Resize handler: VNC autoresize when LivOS window resizes.
- Mode selector pill: `Watch ⏺ Teach 🎙 Auto 🤖 Chat 💬`. Mode is panel state, controls what the agent listens to / records.
- Per-WebApp agent session: row in `webapp_agent_sessions` keyed on `(userId, webappId)`. Reuses `LivAgentRunner` SSE infra.
- Resizable split via shadcn `<ResizablePanelGroup>`.

**Files**:
- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx`
- `livos/packages/ui/src/modules/window/webapp-toolbar.tsx`
- `livos/packages/ui/src/modules/window/webapp-mode-selector.tsx`
- `livos/packages/ui/src/hooks/use-webapp-vnc.ts`
- `livos/packages/ui/src/hooks/use-webapp-agent.ts`
- Postgres migration: `webapp_agent_sessions` table.

**Deps**: P93 (window manager), P94 (icon → spawn dispatch).

---

### Phase 96 — Teach mode: action recording (M, 4-5 days) — Wave 4

**Goal**: User clicks "Teach" in mode selector → AI starts recording every input event + screenshot. User saves recording with a name.

**Scope**:
- Hook into VNC client mouse/keyboard events (react-vnc emits these).
- Each event: `{type, coords, key, button, ts, screenshotRef}`.
- Screenshot every input event + heartbeat every 1s during recording, stored under `/data/webapp-skills/<userId>/<sessionId>/<ts>.jpg` (JPEG q=80, max 1280×800).
- Recording UI: red pulsing dot in mode selector while recording, Stop button → name dialog → POST `webapps.skills.create({webappId, name, actionLog})`.
- Postgres `webapp_skills` table per D-V33-05.
- Skills sidebar in WebApp window — lists named skills for current WebApp.
- Replay scrubber UI (linear timeline of recorded actions with screenshot thumbnails) — read-only inspector.

**Files**:
- `livos/packages/ui/src/hooks/use-teach-recorder.ts`
- `livos/packages/ui/src/modules/window/webapp-skills-sidebar.tsx`
- `livos/packages/ui/src/modules/window/skill-replay-scrubber.tsx`
- `livos/packages/livinityd/source/modules/webapps/skills-router.ts`
- `livos/packages/livinityd/source/modules/webapps/skills-storage.ts`
- Postgres migration.

**Deps**: P95 (mode selector + agent panel).

---

### Phase 97 — Auto mode: skill-guided bytebot loop, window-scoped (L, 5-7 days) — Wave 4

**Goal**: User selects a saved skill OR types a free-form goal in Auto mode → bytebot loop runs against the WebApp's Chrome window, using skill log as guidance and the bytebot tool with `--window <wid>` scoping.

**Scope**:
- Extend bytebot native primitives in `livos/packages/livinityd/source/modules/computer-use/native/`:
  - `screenshot.ts`: add optional `windowId?: number`. When set: `maim -i <wid> /tmp/shot.png`. Existing maim path verified working post-P79.
  - `input.ts`: add optional `windowId?: number` to clickMouse/typeKeys/etc. When set: `xdotool --window <wid> mousemove --sync X Y click 1` and `xdotool key --window <wid> Escape`.
- New AgentPress tool: `webapp_replay_skill({skillId, freeFormGoal?})`.
- Skill context builder: loads `webapp_skills` row → renders a `<previously-learned-skill>` block in the agent system prompt. "Adapt these to current screen state. Validate each step with computer_screenshot before clicking."
- Per-WebApp scoped bytebot MCP server config: spawn an additional MCP server instance per-WebApp with `BYTEBOT_TARGET_WINDOW_ID=<wid>` env. Existing `bytebot-mcp-config.ts` accepts the env at spawn time.
- Failure recovery: if 3 consecutive vision-validations fail (LLM disagrees with skill's expected next state), agent emits "needs help" + pauses.
- Reuses tool guardrail loop detection from hermes-agent findings (Rank 1) if shipped before this phase.

**Files**:
- `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts` (extend)
- `livos/packages/livinityd/source/modules/computer-use/native/input.ts` (extend)
- `livos/packages/livinityd/source/modules/computer-use/skill-replay-tool.ts` (new)
- `livos/packages/livinityd/source/modules/webapps/skill-context-builder.ts` (new)
- `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts` (multi-instance support)

**Sacred constraint check**: must NOT touch `sdk-agent-runner.ts`. All extensions through `LivAgentRunner`/`LivMcpClientManager`.

**Deps**: P95 (window infra), P96 (skills exist), P79 (bytebot host port + maim/xdotool fixes).

---

### Phase 98 — UAT, polish, docs (S, 1-2 days) — Wave 5

**Goal**: Ship-quality polish on the full flow.

**Scope**:
- UAT script: add 3 WebApps (`facebook.com`, `gmail.com`, `x.com`) → confirm same Google profile login persists across all → teach a simple skill in Facebook ("post a status") → run Auto mode with a goal → verify autonomy.
- Confirm window focus / re-launch behavior (clicking icon when already-running window opens).
- Verify x11vnc / ffmpeg fallback on Mutter (depending on P93 spike outcome).
- WebApp deletion = also delete its skills + sessions.
- User-facing docs: `docs/webapp-launcher.md` (how to add WebApp, how to teach a skill).
- v33 Roadmap close + memory updates.

**Files**: docs, UAT checklist, ROADMAP.md edit, memory.

**Deps**: P92-P97 all shipped.

---

## 6. Wave plan

```
Wave 1 (paralel — backend foundation):
    P92 (metadata extractor) ─┐
    P93 (window manager)     ─┴─→ Wave 2

Wave 2 (single — UI gateway):
    P94 (desktop context menu) ───→ Wave 3

Wave 3 (single — heaviest UI phase):
    P95 (stream window + AI panel + mode selector) ───→ Wave 4

Wave 4 (paralel — agent capabilities):
    P96 (teach recording) ─┐
    P97 (auto mode loop)   ─┴─→ Wave 5

Wave 5: P98 (UAT/polish)
```

**Total estimated effort**: 17-26 days solo (4-6h/day) — 3-5 weeks. **~30% smaller than v1.**

**Critical path**: P93 → P95 → P97.

---

## 7. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `x11vnc -id <wid>` returns black on Mutter (same root-cause as scrot) | M | H | P93 starts with 0.5-day spike. Fallback: `ffmpeg -f x11grab` cropped to window geometry, OR maim-loop MJPEG stream. |
| Window discovery race (chrome new-window not visible to xdotool fast enough) | M | M | 5s timeout + fallback: ask Chrome via CDP if `--remote-debugging-port` flag set; otherwise show "could not start" + retry button. |
| User has Chrome already running with their own work — our `--new-window` opens in their session | — | — | This is intended behavior. Same profile = same session. User explicit requirement. |
| Same-profile cookies cross-contamination (e.g. Facebook scripts read X's cookies) | L | L | Browsers enforce same-origin policy regardless. No mitigation needed. |
| Bytebot multi-instance MCP isn't currently supported | H | M | P97 includes the per-WebApp MCP spawn with windowId env scoping — biggest design unknown. |
| Teach mode action coords drift if user resizes window during teach | L | M | Lock window resize during recording; warn user. |
| Mutter input event quirks (recently mitigated via xdotool sync in P79) | L | L | Per-window xdotool calls inherit P79's fix. Verified end-to-end during P95 UAT. |
| Resource creep: 5-10 x11vnc daemons + Chrome with 5+ windows | L | L | Each x11vnc is ~10 MB; Chrome already manages many tabs/windows fine. |

---

## 8. Open questions for user (LOCK before P92 starts)

1. **Auto mode safety**: should auto mode ask for user confirmation before destructive actions (post, delete, send)? Default ON or OFF?
2. **Skill privacy**: skills are private to the single Mini PC user in v33. OK?
3. **Teach mode privacy**: screenshots may contain credentials/PII typed during recording. Auto-redact attempt, or warn user "do not enter passwords during teach"? Recommendation: warn-only for v33, auto-redact in v34.
4. **WebApp icon position**: drag-to-arrange (like Docker apps today) or auto-grid?
5. **Click on already-open WebApp**: focus existing window vs open another? Recommendation: focus existing.

---

## 9. Out-of-scope for v33 (defer to v34+)

- **Per-user Chrome profiles** (multi-user) — single Mini PC user only in v33.
- **CDP-based window control** (more reliable than xdotool poll) — requires user to launch Chrome with `--remote-debugging-port` flag. Power-user upgrade.
- **WebRTC streaming** (lower latency) — VNC sufficient for v33.
- **Cross-WebApp shared skills marketplace** — design space; defer.
- **Mobile WebApp support** — desktop-first scope.
- **Agent watching multiple WebApps simultaneously** — single-WebApp focus per session.
- **PWA-style standalone app install** (manifest, offline) — not the same product space.
- **Voice control** — chat-only inputs.

---

## 10. Sacred constraints recap

- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED — verify before AND after every commit.
- Subscription-only: no raw API key paths introduced.
- No backwards-compat hacks in new code.
- No emoji unless explicitly authored.
- Per-WebApp MCP scoping (P97) MUST go through `LivMcpClientManager`, not `sdk-agent-runner`.

---

## 11. Decision needed from user

To open v33 as an active milestone, please respond:

1. **Approve overall vision?** (yes / refine / reject)
2. **Lock the 5 open questions in §8** — or batch with Phase 92/93 discuss-phase
3. **Start point**: Wave 1 immediately, or wait for v32 UAT signoff first?

Once locked: `/gsd-discuss-phase 92` (and 93 in parallel) → `/gsd-plan-phase` → execute.
