# Phase 102 — Continue Handoff

**Last commit:** `9de807e0` (deployed to Mini PC)
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ preserved across all 80+ commits
**Date:** 2026-05-11
**Status:** Wave 0-3 SHIPPED + 11 hotfix rounds deployed. Wave 4 (UAT) BLOCKED on bug fixes.

---

## Phase 102 architecture (DELIVERED)

Per-app dedicated Xvfb + Chrome subprocess + master profile seed + display-mode xdotool + fluxbox per-app + slug-based MCP names. See `102-CONTEXT.md` for full design contract.

All 9 plans (102-01..102-09) committed + merged via worktree pipeline:
- Wave 1 (16 commits): DisplayAllocator, XvfbSpawner, ChromeProcessSpawner, MasterProfileSeeder
- Wave 2 (18 commits): window-manager rewrite, native-app-binder display swap, Luse env switch
- Wave 3 (16 commits): Master Chrome Login UI + tRPC routes, close lifecycle 8-step, x11vnc -display canonical

247/247 Phase 102 unit tests pass.

---

## Hotfix chain (11 rounds, 2026-05-11)

| SHA | Round | Fix |
|-----|-------|-----|
| `db5b8b12` | r1 | chown bruce:bruce app profile dir (SingletonLock Permission denied) + ESM fix for broadcastActiveWid (require → fsSync import) |
| `d12cca8e` | r2 | A2 fluxbox default true + display-mode xdotool dispatch (wid:0 → display) |
| `3e800baa` | r3 | LIVOS_WEBAPP_USE_WM !== '0' at ctor caller (env override bug) |
| `f388c386` | r4 | xdotool scope via DISPLAY env, NOT --display CLI flag (xdotool has no --display flag) |
| `5657e2aa` | r5 | Chrome tabs visible: URL positional instead of --app=URL (chromeless) |
| `e5d55410` | r6 | --start-maximized instead of --start-fullscreen (F11 mode broke layout) |
| `3477e162` | r7 | REVERT per-WebApp Luse MCP default → ON (global :1 luse can't see :N) |
| `e7be6021` | r8 | MCP names slug-based: `luse:webapp:yandex-91c9` (UUID → readable) |
| `9de807e0` | r9 | fluxbox no decorations + fullMaximization (click coord offset from titlebar) |

---

## OUTSTANDING BUGS (next session priority)

### Bug A — Click coord mirror (HIGH)

**User report:** "en saga gidiyorum sol a tikliyor solda ise saga" — clicking far right → cursor goes to far left, and vice versa. Middle is correct. Horizontal flip.

**Diagnosis needed:**
- Frontend `eventToFbCoords` (`webapp-stream-window.tsx:253-262`) math LOOKS correct: `(ev.clientX - rect.left) * (fbW / rect.width)`
- No CSS transform/scaleX(-1) found
- Possibilities:
  - noVNC canvas viewport doesn't match rect (letterbox inside container)
  - Chrome on :N is rendered mirrored (unlikely)
  - getBoundingClientRect returns wrong dimensions
  - Server-side xdotool gets coords but :N display has some RandR reflection

**Next action:** Ask user to open browser dev console, click far right, read the `[100-07.2] click → tRPC ... x=???` log. If x ≈ 1280 → frontend OK, server-side issue. If x ≈ 0 → frontend mirror.

### Bug B — Single-MCP architecture (USER WANTS PERMISSION-FREE)

**User report:** "permissionu vermek istemiyorum bunu tek mcp den coz" — don't want to grant Claude Code wildcard permission for per-WebApp MCPs. Solve via single MCP.

**Phase 103 redesign required:**
1. Default `LIVOS_PER_APP_LUSE=0` (skip per-app MCP registration entirely)
2. Modify global `luse` MCP server (`livos/packages/livinityd/source/modules/computer-use/mcp/server.ts`):
   - Add optional `display: ":N"` param to relevant tools (list_windows, computer_screenshot, computer_click_mouse, computer_type, computer_press_keys, computer_drag_mouse, etc.)
   - Tool handler reads param, sets `DISPLAY=:N` env when executing X11 ops via execFile
   - Default fallback: LUSE_TARGET_DISPLAY env (=:1)
3. Modify `buildActiveDisplaySnippet` (102-06): instruct agent in system prompt to ALWAYS pass `display: ":N"` arg when scoping to active WebApp

Trade-off: 1 MCP, ~20 tools total (instead of 5×20=100). Agent gets cleaner tool surface. Click/screenshot/list across all displays via param.

**Files involved (~5-8):**
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` (tool schema + handler updates)
- `livos/packages/livinityd/source/modules/computer-use/mcp/*.ts` (individual tool files if split)
- `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` (snippet update)
- `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (flip LIVOS_PER_APP_LUSE default to '0')
- Tests for above

### Bug C — Wave 4 UAT walk + close-out (LOW priority, do AFTER A+B)

- 25-row UAT-CHECKLIST.md (`102-CONTEXT.md` Success Criteria)
- 102-VERIFICATION.md
- PHASE-SUMMARY.md
- ROADMAP.md flip Phase 102 → Shipped
- STATE.md update

---

## Production deploy state (Mini PC `bruce@10.69.31.68`)

- Deployed SHA: `9de807e0`
- Services active: livos, liv-core, liv-worker, liv-memory
- Sacred SHA verified on disk: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- Per-app Xvfb: 4 displays alive (`:10`, `:11`, `:12`, `:13`) on last check
- Per-app fluxbox: spawning correctly post-r9
- Per-app Chrome: spawning with `--start-maximized --window-size=1280,720`
- MCP names: `luse:webapp:<slug>-<4charuuid>` format (yandex, google, etc.)

---

## Next session resume command

```
/gsd-resume-work
```

Then point gsd-resume to this CONTINUE.md. OR manually:

```
1. Read .planning/phases/102-per-app-display-pivot/CONTINUE.md
2. Ask user for the `[100-07.2] click → tRPC ... x=N` value from browser console (Bug A diagnosis)
3. Apply Bug A fix based on whether x is ~0 or ~1280
4. Start Phase 103 redesign: single-MCP display-aware tools
5. Phase 102 Wave 4 UAT walk after Bug A + B closed
```

---

## Key files modified this session (Phase 102 wave 0-3 + hotfix chain)

```
livos/packages/livinityd/source/modules/streaming/display-allocator.ts (new)
livos/packages/livinityd/source/modules/streaming/xvfb-spawner.ts (new)
livos/packages/livinityd/source/modules/streaming/vnc-bridge.ts (modified — -display canonical)
livos/packages/livinityd/source/modules/streaming/stream-manager.ts (modified — VncStreamTarget alias)
livos/packages/livinityd/source/modules/webapps/chrome-process-spawner.ts (new — per-app Chrome)
livos/packages/livinityd/source/modules/webapps/window-manager.ts (rewrite — per-app Xvfb orchestrator)
livos/packages/livinityd/source/modules/webapps/input-dispatcher.ts (modified — DISPLAY env)
livos/packages/livinityd/source/modules/webapps/trpc-router.ts (modified — pass display to dispatch)
livos/packages/livinityd/source/modules/webapps/fluxbox-wm.ts (modified — no decorations)
livos/packages/livinityd/source/modules/apps/native-app-binder.ts (modified — display swap)
livos/packages/livinityd/source/modules/chrome-master/profile-seeder.ts (new + r1 chown fix)
livos/packages/livinityd/source/modules/chrome-master/master-login-routes.ts (new — tRPC)
livos/packages/livinityd/source/modules/computer-use/mcp/server.ts (modified — LUSE_TARGET_DISPLAY)
livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts (modified — Active Display Context)
livos/packages/livinityd/source/modules/livinity-broker/agent-runner-factory.ts (modified — activeDisplay)
livos/packages/livinityd/source/modules/webapps/luse-mcp-config.ts (modified — LUSE_TARGET_DISPLAY)
livos/packages/livinityd/source/index.ts (modified — wire DisplayAllocator + profileSeeder)
livos/packages/ui/src/modules/settings/master-chrome-login.tsx (new — UI)
livos/packages/ui/src/modules/dock/native-app-* (existing — 101-07 + 102-05 wiring)
livos/packages/ui/src/hooks/use-agent-socket.ts (modified — activeDisplay in WS envelope)
```
