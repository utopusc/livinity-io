# Plan 100-10: Per-WebApp X Display + Bytebot→Luse Rename + Luse Tools + UI Polish

**Gathered:** 2026-05-10
**Status:** Ready for planning (`/gsd-plan-phase 100-10`)
**Parent:** `100-CONTEXT.md` (phase-level), `100-08-CONTEXT.md`, `100-09-CONTEXT.md`
**Trigger:** User feedback after 100-09-07/08/09 hot-fix deploy. UI hot-fixes (chat transform + Teach red button) accepted. 8 new concerns identified — 4 architectural backend + 4 frontend UX.

---

## Eight Issues Reported by User (verbatim quotes + interpretation)

### Backend / Architectural

**ISSUE 1 — Yayın Chrome'u capture etsin, pencereyi değil**

> "Yayini yaparken Direkt Chrome penceresini degilde direkt chrome u yayin alsin."

User wants the stream to capture **Chrome (the application)**, not a specific window. Today x11vnc binds to a single wid (`-id 0x<hex>`) which captures only that one Chrome window's pixels.

**ISSUE 2 — Multi-stream pencere örtüşmesi siyah alan yaratıyor**

> "1. yayini aciyorum 2. yayini actigimda 1. yayinin belli bir kismi ustune geldigi icin belli bir kismi gozukmuyor siyah kaliyor."

When 1st stream is open, opening the 2nd stream causes the 2nd Chrome window on `:1` to overlap the 1st. Obscured pixels of the 1st window appear black in its stream. **Root cause:** both Chromes share Xvfb `:1`; X11 windows on the same display can stack/overlap, and x11vnc `-id <wid>` captures the framebuffer region of that wid, which doesn't see pixels under occlusion.

**ISSUE 3 — Bytebot → Luse rename (project-wide)**

> "ByteBot un ismini Luse olarak degistir"

Rename Bytebot to **Luse** everywhere LivOS owns the surface. Like Phase 65 (Nexus→Liv). DOES NOT rename the upstream `bytebot` npm package — only LivOS code that references it.

**ISSUE 4 — Luse yeni feature'lar**

> "Luse a yeni futurelar ekle lutfen istedigi pencerenin ss ini alabilsin vs yayimi gorebilsin ve tiklamalari ona gore yapsin veya istedigi gibi bir portda yayim olusturabilsin pencereler arasinda gezebilsin Teaching mod uyumlu olsun."

Luse new tools:
- Can take screenshot of **any window it wants** (window enumeration + per-window screenshot)
- Can **see the stream** (vision input)
- **Clicks based on what it sees** (already partly works via 09-01 + 09-03)
- Can **create a stream on any port** dynamically
- Can **navigate between windows** (focus / activate any wid)
- **Teaching mode compatible** (replay works after rename + with new tools)

### Frontend / UX

**ISSUE 5 — Skill butonu pencerenin dışına sağ üste**

> "Teaching mod u guncelle Skill kismini pencerenin sag ust kismindan kaldir. Onun yerine pencerenin disinda sag ust de skill butonu olsun."

Today: `WebAppSkillsPopover` (from 09-06) is at top-right INSIDE the WebApp window. Move it OUTSIDE the window, at top-right (like the 100-06.1 action bar moved outside at the bottom).

**ISSUE 6 — Chat: yanıt aynı yerde + sağda stop**

> "Chat i acioyurm ama bir sey yazip gonderdigimde enter a tikladigimda Yazi yazdigim yerde bana cevbap versin ve sagda durdurma olsun."

Current (post 09-08): Click Chat icon → action bar transforms to input + Send + Close. Type + Enter → message sent → bar returns to icons. User wants:
- Click Chat icon → input area visible
- Type + Enter → input area **transforms into response area** (response streams IN THE SAME PLACE)
- During streaming, the right-side button is **Stop** (not Send)
- After streaming complete, response stays visible OR returns to input — user didn't specify; reasonable default: response stays until user clicks somewhere or hits Esc, then returns to icons.

**ISSUE 7 — Stream altındaki siyah alan kaldırılsın, tam ekran**

> "yayim yapilan yer var ya oranin hemen altinda siyah yer var orayi kaldir pencereden ve full ekran olsun yayim pencerede. tam sigsin yani."

Black area below stream area. User wants stream to **fully fit** the WebApp window. Root cause: Chrome window is 1280x720 but LivOS WebApp window may be larger; noVNC canvas renders at native resolution with empty space below.

**ISSUE 8 — Auto butonu kaldır**

> "Auto butonu varya onu kaldir."

Remove the Auto icon button from the floating action bar entirely. The Auto drawer code path can be deleted too.

---

## Locked Decisions (D-100-10-*)

### D-100-10-A — Per-WebApp Xvfb display (solves ISSUE 1 + 2)

**Decision:** Each WebApp gets its OWN Xvfb display starting at `:10` + webappIndex (e.g., `:10`, `:11`, `:12`...). Selfclaude container model adapted to bare-metal per-WebApp.

**Why:**
- Eliminates window overlap on a shared display (Issue 2 — each Chrome owns its display).
- Chrome `--app=URL` on a dedicated display can be fullscreen-equivalent without affecting other WebApps (Issue 1 — stream captures the entire display = stream captures "Chrome itself" effectively).
- Stream becomes `x11vnc -display :N` (capture whole display) instead of `x11vnc -id <wid>` (capture one window).

**Architectural changes:**
- `xvfb-display.ts` (100-08-01): extend to support multiple display allocation. Helper `allocateNextXvfbDisplay()` returns next free display number.
- `window-manager.ts:spawn`: at WebApp spawn, allocate display; spawn Xvfb + fluxbox on that display; spawn Chrome with `DISPLAY=:N`.
- `vnc-bridge.ts`: change `x11vnc -id 0xHEX` to `x11vnc -display :N` (full display capture).
- `bytebot-mcp-config.ts`: descriptor.display = per-WebApp display number.
- Lifecycle: WebApp close → kill Chrome → kill fluxbox on display → kill Xvfb on display → release display number.

**NOT chosen:**
- Stream entire `:1` (one stream for all WebApps) — no per-WebApp isolation.
- Single Chrome multi-tab via DevTools Protocol — major rewrite, defer to v34.
- Override-redirect / virtual window stacks on `:1` — Chrome doesn't cooperate with that pattern.

### D-100-10-B — Bytebot → Luse rename scope

**Decision:** Rename ALL LivOS code that references Bytebot to Luse. Specifically:
- File names: `bytebot-mcp-config.ts` → `luse-mcp-config.ts`, etc.
- Type/interface names: `BytebotMcpConfig` → `LuseMcpConfig`, `PerWebAppMcpDescriptor` (already neutral, stays)
- Tool name prefix: `mcp__bytebot__*` → `mcp__luse__*` (registered tool names that the agent calls)
- Env vars: `BYTEBOT_TARGET_WINDOW_ID` → `LUSE_TARGET_WINDOW_ID`, `BYTEBOT_DISPLAY` → `LUSE_DISPLAY`
- Redis keys: `liv:config:mcp:bytebot:*` → `liv:config:mcp:luse:*` (migrate or fresh)
- Comments / log messages / docs strings referencing "bytebot" as a LIVOS LAYER → "Luse"

**NOT renamed (external dependency):**
- The upstream `bytebot` package (`npm` `@bytebot/desktop-mcp` or similar) — that's third-party, we keep the dep import path verbatim
- Service names `livos`, `liv-core`, `liv-worker`, `liv-memory` (those are LivOS, not Bytebot)
- `livos/packages/livinityd/source/modules/computer-use/` directory name (computer-use is generic; could be renamed `luse/` but it's a wider change — defer to D-100-10-B-cleanup if scope permits)

**Migration approach (per Phase 65 precedent):**
- `git mv` directory(ies) where applicable
- Sed/grep update imports + identifiers across the codebase
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST stay unchanged (sdk-agent-runner.ts has no bytebot references — verify)
- Add tool-name backwards-compat layer for in-flight teach skills (action_log records may have `mcp__bytebot__*` references — lazy-translate on read for skill versions <= 2)

### D-100-10-C — Luse capabilities (new tool surface)

**Decision:** Luse gets new MCP tools beyond the current bytebot tool set:

| Tool | Args | Returns | Notes |
|------|------|---------|-------|
| `luse__list_windows` | `{display?: string}` | `[{wid, title, geometry, display}]` | List windows on a specific display (defaults to caller's `LUSE_DISPLAY`) |
| `luse__screenshot_window` | `{wid: number}` OR `{display: string}` | `{b64, format, w, h}` | Window-bound OR full-display capture |
| `luse__focus_window` | `{wid: number}` | `{ok: true}` | xdotool `windowactivate --sync` |
| `luse__create_stream` | `{display: string, port?: number}` | `{streamId, wsUrl, port}` | Spawn a NEW x11vnc on a given display; for inter-WebApp visibility |
| `luse__list_streams` | `{}` | `[{streamId, display, port, wsUrl}]` | Active streams in the system |
| `luse__click_xy` | `{wid: number, x: number, y: number, button?: 1\|2\|3}` | `{ok: true}` | Already exists as 09-03 path; expose as Luse tool with clean name |
| `luse__type_text` | `{wid: number, text: string}` | `{ok: true}` | Existing, expose under Luse |
| `luse__scroll` | `{wid: number, dx: number, dy: number}` | `{ok: true}` | From 09-02, expose under Luse |
| `luse__replay_skill` | `{skillId: string}` | `{ok: true, events: number}` | Teach skill replay, scoped to Luse's window |

These are ADDITIONS to the existing Bytebot tool surface (post-rename to Luse). The agent loop should now have richer window-aware capabilities.

### D-100-10-D — Skill button outside window top-right

**Decision:** Move `WebAppSkillsPopover` (from 09-06) from inside the WebApp window → outside, at top-right. Mirror the 100-06.1 pattern (action bar moved outside at bottom).

**Position:** `fixed` positioning, 16px from window's top edge + 16px right inset, OR follow the window's top-right corner via geometry tracker.

**Same Magnetic + motion.div + rounded-full bg-white/90 pill aesthetic** as the floating action bar. Single icon button. Click → opens popover with skill list (Play/Delete).

### D-100-10-E — Chat in-place response + stop button (Issue 6)

**Decision:** Extend the 09-08 action bar state machine with a 3rd mode:
- `'icons'` — default 4 (now 3 after Issue 8 removes Auto) icons
- `'chat-input'` — input + Send + Close (current 09-08)
- `'chat-response'` — response text streaming + Stop + Close (NEW)

**Flow:**
1. Click Chat icon → `'chat-input'` mode (input area + Send + Close)
2. Type message + Enter (or click Send) → `'chat-response'` mode (input replaced by response area; right-side button = Stop; Close stays)
3. Response streams in via `useWebAppAgent.sendMessage` + `messages` array
4. Click Stop → abort the streaming (calls `useWebAppAgent.stopStreaming()` — verify this exists or add it)
5. Stream completes → response stays visible until user clicks Close (or types new prompt → goes back to `'chat-input'` mode with response cleared)
6. Click Close (X) → returns to `'icons'`

**Visual:** Response area is wider (~480px) than input area (~360px) — `motion.div` `layout` prop smoothly transitions. Streaming caret animation on the response text. Markdown rendering for response.

### D-100-10-F — Stream full-fit (Issue 7)

**Decision:** Stream area fills the WebApp window content area entirely. Two layers:

1. **CSS layer:** noVNC canvas `width: 100% height: 100% object-fit: cover` (or `contain` if aspect-mismatch is preferred; pick `cover` since user wants "tam sigsin" = "fully fit").

2. **Backend layer (proper fix):** When the LivOS WebApp window is resized, send xdotool `windowsize --display :N <wid> W H` to the Chrome process so Chrome itself resizes to match. This is more involved; could be deferred to a follow-up plan if CSS-cover ships first and looks acceptable.

**Recommended approach:** Ship CSS-cover first (cheap, immediate visual fix). Defer dynamic Chrome resize to a 100-10-RESIZE follow-up if CSS-only is insufficient.

### D-100-10-G — Remove Auto button + Auto drawer code path (Issue 8)

**Decision:** Delete the Auto icon button from the floating action bar. Delete the Auto branch from the Sheet drawer host. Delete `webapp-auto-drawer.tsx` entirely. Delete the `'auto'` mode from `WebAppMode` type. Update any callers (P97 auto-mode code path stays since the BACKEND auto mode still works for Luse-driven workflows, but the UI surface is removed).

**Backend impact:** P97's `useAutoMode` hook may still exist as an underlying capability for Luse skill replay. Don't delete the backend; just remove the user-facing UI.

### D-100-10-H — Sacred SHA preserved (carries forward)

`liv/packages/core/src/sdk-agent-runner.ts` SHA = `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. NEVER edited. Pre-commit hook enforces. Even during the Bytebot→Luse rename — verify sacred file has no bytebot references that would force a rename (it doesn't, but verify).

### D-100-10-I — Backwards-compat for in-flight skills

action_log records currently reference `mcp__bytebot__*` tool names. After Luse rename, replay code translates `mcp__bytebot__*` → `mcp__luse__*` on read. Same skill files still work.

### D-100-10-J — Server4 still off-limits

D-100-NO-SERVER4 carries forward. Mini PC `bruce@10.69.31.68` only.

---

## Gray Areas (need decision OR sensible default)

### G-100-10-A — Display number range

| Option | Pros | Cons |
|--------|------|------|
| `:10` + index (10, 11, 12...) | Avoids collision with `:0` (GNOME) and `:1` (current single-WebApp default from 100-08) | Need lifecycle to release numbers when WebApp closes |
| `:100` + index (100, 101...) | More headroom; clear "managed by LivOS" range | Visually noisy |
| `:1` for first, `:2` for second, etc. | Continuous from existing 100-08 default | Collides with potential bruce side use of `:2` |

**Default:** `:10` + webappIndex. Index starts at 0, increments per spawn; on close, mark display as free for reuse.

### G-100-10-B — Display lifecycle: per-spawn or pre-allocated pool?

| Option | Pros | Cons |
|--------|------|------|
| Per-spawn (Xvfb + fluxbox spawned on demand) | Resource-efficient; only running displays are alive | Spawn latency added to WebApp open time (~500ms) |
| Pre-allocated pool of 4-8 displays | Snappy WebApp open | Wastes resources when WebApps not in use |

**Default:** Per-spawn (resource-efficient). Lazy spawn at WebApp open. Cache the Xvfb/fluxbox handles for reuse if same display number is reclaimed quickly.

### G-100-10-C — Auto drawer code deletion: now or defer?

| Option | Pros | Cons |
|--------|------|------|
| Delete `webapp-auto-drawer.tsx` + `WebAppMode 'auto'` removed | Clean code; no orphan files | Slight risk if some test or P97 code path references `auto` mode |
| Hide UI only, keep code as orphan | Safe; reversible | Code clutter |

**Default:** Delete the file + mode entirely. Aggressive cleanup per user's explicit "kaldir" (remove) direction.

### G-100-10-D — Stream resize: CSS-cover only, or full backend resize?

| Option | Pros | Cons |
|--------|------|------|
| CSS `object-fit: cover` only | Cheap; works today | Visual stretch / minor blur when aspect mismatch |
| Backend `xdotool windowsize` on LivOS window resize | Pixel-perfect; no stretch | More code; resize events need debouncing |

**Default:** CSS-cover first (Wave 5 of this plan). Backend dynamic resize → follow-up plan 100-10-RESIZE if CSS proves insufficient.

### G-100-10-E — Luse `luse__create_stream` security

A tool that lets the agent create new streams on arbitrary ports is a privilege escalation surface. Should the tool be gated?

**Default:** Gate behind a Redis flag `liv:config:luse_can_create_streams` (default `false` for production, `true` for dev). User can flip in Settings. This is a hardening detail — document but don't gate the main shipping.

### G-100-10-F — Tool-name backwards-compat duration

Lazy-translate `mcp__bytebot__*` → `mcp__luse__*` on skill read. How long do we keep this shim?

**Default:** Until v34. Document a "remove backwards-compat" todo for v34 cleanup.

---

## Canonical References

### Parent context
- `.planning/phases/100-multi-stream-window-redesign/100-CONTEXT.md`
- `.planning/phases/100-multi-stream-window-redesign/100-08-CONTEXT.md`
- `.planning/phases/100-multi-stream-window-redesign/100-09-CONTEXT.md`

### Sibling SUMMARYs (what's been shipped)
- `100-08-01-SUMMARY.md` (Xvfb :1 + fluxbox lifecycle — extends for multi-display)
- `100-08-04-SUMMARY.md` (per-WebApp bytebot MCP via Redis pub-sub — extends for Luse)
- `100-09-07-SUMMARY.md` (fluxbox stderr capture + xdotool fallback — keep these)
- `100-09-08-SUMMARY.md` (action bar 2-mode chat — extends to 3-mode for Issue 6)
- `100-09-09-SUMMARY.md` (Teach button red + click count — extends for Issue 5 skill button placement)

### External reference
- https://github.com/utopusc/selfclaude — selfclaude README, per-window streaming pattern, agent tool surface

### Code paths to modify

**Backend / Per-WebApp Xvfb (D-100-10-A):**
- `livos/packages/livinityd/source/modules/webapps/xvfb-display.ts` — add multi-display allocator
- `livos/packages/livinityd/source/modules/webapps/fluxbox-wm.ts` — accept display arg (already does)
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` — per-spawn display allocation
- `livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts` — `x11vnc -display :N` mode
- `livos/packages/livinityd/source/index.ts` — wire allocator service into livinityd

**Backend / Bytebot→Luse rename (D-100-10-B):**
- `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts` → `luse-mcp-config.ts`
- All consumers of `BytebotMcpConfig`, `BYTEBOT_TARGET_WINDOW_ID`, `mcp__bytebot__*`
- Redis key migration script (or accept fresh keys, drop old on next restart)

**Backend / Luse new tools (D-100-10-C):**
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` (currently in `computer-use/mcp/`) — register new tool handlers
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` — implement new tool bodies
- `livos/packages/livinityd/source/modules/streaming/stream-manager.ts` — expose stream create/list to Luse via tool

**Frontend / Skill button outside (D-100-10-D):**
- `livos/packages/ui/src/modules/window/app-contents/webapp-skills-popover.tsx` — relocate
- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` — remove inside-window render
- New: `livos/packages/ui/src/modules/window/webapp-floating-skills-button.tsx` — outside-window pill at top-right

**Frontend / Chat in-place response (D-100-10-E):**
- `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` — add `'chat-response'` mode
- `livos/packages/ui/src/hooks/use-webapp-agent.ts` — verify `stopStreaming()` available; add if missing

**Frontend / Stream full-fit (D-100-10-F):**
- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` — noVNC canvas CSS
- Likely the existing noVNC wrapper component file

**Frontend / Remove Auto (D-100-10-G):**
- `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` — remove Auto icon
- `livos/packages/ui/src/modules/window/app-contents/webapp-stream-window.tsx` — remove Auto branch in Sheet
- DELETE: `livos/packages/ui/src/modules/window/app-contents/webapp-auto-drawer.tsx`
- `livos/packages/ui/src/modules/window/webapp-drawer-store.ts` — narrow `WebAppMode` type

### Locked constraint (NEVER touch)
- `liv/packages/core/src/sdk-agent-runner.ts` — D-100-SACRED, SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`

---

## Suggested Sub-Plan Decomposition (7 plans)

The planner agent can decompose differently. This is a starting point.

| Plan | Wave | Title | Autonomous | Est. Tasks |
|------|------|-------|-----------|------------|
| **100-10-01** | 1 | Per-WebApp Xvfb display allocator + lifecycle | yes | 5-6 |
| **100-10-02** | 2 | Bytebot → Luse rename (project-wide) | yes | 5-7 |
| **100-10-03** | 3 | Luse new tools — window enum + screenshot + focus + click/type/scroll wrappers | yes | 4-5 |
| **100-10-04** | 3 (parallel) | Luse stream management tools — create_stream + list_streams | yes | 3 |
| **100-10-05** | 4 | UI cleanup — Skill button outside + Stream full-fit + Remove Auto button (3-in-1) | yes | 4-5 |
| **100-10-06** | 5 | Chat in-place response — action bar 3rd mode (chat-response) | yes | 4-5 |
| **100-10-07** | 6 | Mini PC deploy + 15-step UAT walk + ROADMAP flip | **no** (user-walked) | 4-5 |

**Wave dependency graph:**
```
10-01 (Xvfb allocator) ──┐
                          ├─→ 10-03 (Luse window tools) ──┐
10-02 (Bytebot→Luse rename) ──┴─→ 10-04 (Luse stream tools)  ├─→ 10-07 (deploy + UAT)
                                                              │
10-05 (UI cleanup — independent) ─────────────────────────────┤
                                                              │
10-06 (Chat in-place response) ───────────────────────────────┘
```

10-05 and 10-06 are UI-only and can run in parallel with backend plans 10-03 + 10-04 if file overlap is zero (likely true).

**Wave plan:**
- Wave 1: 10-01 (foundation — per-WebApp Xvfb)
- Wave 2: 10-02 (rename foundation — must come before Luse feature work)
- Wave 3: 10-03 + 10-04 + 10-05 + 10-06 (parallel — all extend post-10-02 base; file-disjoint)
- Wave 4: 10-07 (user-walked deploy + UAT)

---

## Success Criteria (UAT-walkable, 15 rows)

After 100-10 deploy:

| # | Test | Pass Criteria |
|---|------|---------------|
| 1 | `xdpyinfo -display :10` returns valid info | Per-WebApp Xvfb spawned for WebApp A |
| 2 | Open WebApp A then WebApp B | Two Chromes on `:10` and `:11` respectively. NO overlap (different displays). NO black areas. |
| 3 | Chrome on `:10` is fullscreen-ish | `--app=URL` + window-size matches Xvfb display size (1920x1080 or whatever picked) |
| 4 | Stream area in LivOS WebApp window fills entire window | NO black border below (CSS-cover applied) |
| 5 | `pgrep -af luse` shows per-WebApp Luse MCP children | Naming reflects rename; not `bytebot` anymore |
| 6 | `mcp__luse__list_windows` callable from chat | Returns windows on caller's display |
| 7 | `mcp__luse__screenshot_window` callable | Returns base64 PNG of specified wid |
| 8 | `mcp__luse__create_stream` callable | Returns new wsUrl + port |
| 9 | Skill button visible OUTSIDE WebApp window at top-right | Click opens popover with skills |
| 10 | Auto button gone from floating action bar | Only Chat + Teach + Skills (3 icons) |
| 11 | Click Chat icon → input shows | 09-08 state machine intact |
| 12 | Type + Enter → response streams IN PLACE | Input area replaced by response area |
| 13 | Stop button visible during streaming | Click Stop → response halts |
| 14 | Old action_log v2 skills still replayable post-rename | Backwards-compat shim translates `mcp__bytebot__*` → `mcp__luse__*` |
| 15 | Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED | `git -C /opt/liv hash-object packages/core/src/sdk-agent-runner.ts` matches |

---

## Deferred Ideas (out of 100-10 scope)

- **100-09-04** still pending — mouse latency probe + patch (user-walked SSH). Independent of 100-10. Can be run any time.
- **100-08-06** still pending — formal Mini PC deploy + 11-step UAT for 100-08 (largely informally validated). Can be merged into 100-10-07's UAT walk.
- **WebRTC stream transport** — deferred to v34.
- **Full container migration** (selfclaude-style) — v34+.
- **Multi-user WebApps** — locked out per D-V33-07.
- **Per-WebApp Chrome profile isolation** — rejected per D-100-SHARED-PROFILE (loses shared Google login).
- **Backend dynamic Chrome resize on LivOS window resize** — defer if CSS-cover (Wave 3) ships acceptable.
- **`computer-use/` directory rename to `luse/`** — wider blast radius; defer to D-100-10-B-cleanup if scope permits at the end of 10-02.
- **Tool-name backwards-compat removal** — v34 cleanup.

---

## Risks

1. **Per-WebApp Xvfb resource overhead** — N WebApps = N Xvfb + N fluxbox + N x11vnc + N Chrome + N Luse MCP. Mini PC has 32GB RAM but per-display overhead is ~200MB. 5 WebApps = ~1GB. Watch during UAT.
2. **Display number reuse race** — if user opens/closes WebApps rapidly, allocator must release displays cleanly. Test with rapid spawn/close cycles.
3. **Bytebot→Luse rename breaks in-flight skills** — backwards-compat shim is critical. Test with existing v1 and v2 action_logs.
4. **Auto removal regresses P97 backend** — verify P97 backend `useAutoMode` capability still works for Luse-driven workflows (via `mcp__luse__replay_skill` from agent loop).
5. **CSS-cover stretches aspect** — if Chrome is 1920x1080 and LivOS window is 1280x720 portrait orientation, `object-fit: cover` will crop. Test multiple window sizes.
6. **`luse__create_stream` privilege** — agent creating new streams could be exploited. Gate behind config flag (G-100-10-E).

---

## Sacred SHA Constraint (carries forward unchanged)

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every 100-10 commit. Pre-commit hook at `.husky/pre-commit` enforces. NEVER use `--no-verify`. NEVER edit the sacred file. Verify pre-flight on EACH plan (and the rename plan 10-02 explicitly — sacred file should have ZERO bytebot references so the rename pass doesn't touch it).

---

**Next step:**

```
/clear
/gsd-plan-phase 100-10
```

The planner will read this CONTEXT and produce 7 PLAN.md files (or whatever decomposition it judges best) per the wave structure above. After plans verified by plan-checker, `/gsd-execute-phase 100-10` runs the chain.

Estimated total: ~30 atomic commits across 4 waves. Sacred SHA stays `f3538e1d…` throughout.
