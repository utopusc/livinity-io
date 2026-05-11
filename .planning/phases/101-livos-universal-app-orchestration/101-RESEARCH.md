# Phase 101: LivOS Universal App Orchestration — Research

**Researched:** 2026-05-10
**Domain:** Chrome DevTools Protocol (CDP) orchestration, multi-window streaming, action-driven teach, native-app X11 spawning, chat UX animations
**Confidence:** HIGH overall (CDP libs HIGH; SelfClaude pattern HIGH after live source inspection; chat animations HIGH; native-app spawn MEDIUM — pattern is solid but app-specific WM_CLASS race remains)

---

## Summary

Phase 101 ships a 6-pillar orchestration upgrade that replaces the per-WebApp Xvfb scheme reverted in 100-10-08. The architecture pivots to a **single Chrome process with multiple top-level windows** spawned via the Chrome DevTools Protocol (CDP) — the only design that preserves D-100-SHARED-PROFILE (same Google login across WebApps) while still giving each WebApp its own X11 window, its own x11vnc capture port, and its own LivOS stream window.

The key research findings shift several CONTEXT-locked details:

1. **CDP `Browser.setWindowBounds` cannot combine `windowState: 'minimized'` with `left/top/width/height`** in a single call. The CONTEXT pseudocode (D-101-CHROME-CDP "about:blank shell stays hidden via `setWindowBounds({windowState:'minimized'})` after boot" + D-101-CDP-SPAWN "setWindowBounds with bounds AND windowState") must be split into TWO sequential calls — one for bounds, one for state. `[CITED: chromedevtools.github.io/devtools-protocol/tot/Browser/]`

2. **CDP does NOT have a "observe user click" event** — Input.dispatchMouseEvent is for DISPATCHING only, not observing. The "Page.handleClickEvent listener vs xdotool poll" framing in the additional_context is incorrect — neither CDP Page nor Input has a click-observe surface. `[CITED: chromedevtools.github.io/devtools-protocol/tot/Input/]`

3. **SelfClaude itself does NOT use CDP** — it uses xdotool + wmctrl + DOM-event capture on the noVNC `<canvas>` (in the BROWSER tier). The "SelfClaude action-driven Teach" pattern referenced in CONTEXT (D-101-TEACH-V3) is implemented entirely in the UI layer by attaching capture-phase `mousedown`/`keydown` listeners to the noVNC canvas. This is good news: Pillar D needs no CDP work, no Chrome changes, no new backend tools. The `onAfterClick` hook (100ms setTimeout) fires the popover. SelfClaude already implements `pushNote(text)` to interleave free-text instructions into the action_log. `[VERIFIED: github.com/utopusc/selfclaude/blob/main/ui/teach-recorder.js]`

4. **SelfClaude uses per-WebApp `--user-data-dir`** (`/tmp/chrome-prof-1`, `/tmp/chrome-prof-2`, ...) — the OPPOSITE of LivOS's D-100-SHARED-PROFILE. They get clean multi-window by sacrificing shared Google login. LivOS's CDP-based approach is the correct path for our shared-login constraint. `[VERIFIED: selfclaude/src/webapp-manager.js]`

5. **chrome-remote-interface 0.34.0** (published 2026-02-09, latest as of 2026-05-10) is the standard Node.js CDP client. TypeScript types via `@types/chrome-remote-interface` 0.33.0. Battle-tested by chromedp's JS twin, Puppeteer alternatives. `[VERIFIED: npm view chrome-remote-interface]`

**Primary recommendation:** Adopt CDP-driven orchestration (Pillar A/B/C/F preserved as planned), but rewrite Pillar D (Teach v3) to use SelfClaude's actual pattern (noVNC-canvas DOM listener + onAfterClick popover hook) instead of fictional "CDP click observe" — this dramatically simplifies 101-08 and eliminates Wave-2 dependency on 101-01. Split the minimize+bounds CDP calls. Use the existing animation patterns already in the LivOS codebase (`restore-progress-dialog.tsx` has the staggered 3-dot pattern).

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

| ID | Decision |
|----|----------|
| **D-101-CHROME-CDP** | Boot livinityd spawns Chrome with `--remote-debugging-port=9222 --user-data-dir=/home/bruce/.config/livos-chrome --no-first-run --no-default-browser-check --new-window=about:blank`. Single Chrome process always alive. Wait for CDP ready (`http://localhost:9222/json/version` → 200). Use `chrome-remote-interface` npm package. Reconnect on Chrome crash. About:blank shell window hidden via `Browser.setWindowBounds({windowState:'minimized'})` after boot. |
| **D-101-CDP-SPAWN** | Per-WebApp spawn via `Target.createTarget({url, newWindow:true, background:false})` → `Browser.getWindowForTarget` → `Browser.setWindowBounds({bounds:{1280×720+cascade}})`. Cascade offset preserved per 100-10-11 (`(0,0), (120,120), ..., wrap`). WID from CDP, not xdotool poll. |
| **D-101-PORT-ALLOC** | Range `15900..15999`. Linear allocation `allocateNextStreamPort()`. Release on app close. Max 100 concurrent streams. |
| **D-101-NATIVE-APPS** | LivOS dock affordance to add Ubuntu native apps (`name, iconUrl, binaryPath, args[], env{}`). Stored in Redis `liv:apps:native:<id>`. Spawn via `DISPLAY=:1 <binary>` detached. Poll for window via xdotool (CDP unavailable for non-Chrome). Bind first new window matching WM_CLASS to fresh stream port. |
| **D-101-LUSE-CONTEXT** | Chat WS envelope `{type:'start', webappId, conversationId, message, activeWid, activeAppMeta}`. agent-session.ts injects `## Active Window Context` snippet into system prompt with WID + URL/binary + title. Per-WebApp Luse MCP env `LUSE_TARGET_WINDOW_ID` overrides default. |
| **D-101-TEACH-V3** | New v3 action_log: `{steps:[{action, instruction, screenshot_before, screenshot_after, t}]}`. Click → popover at click point with text input → user types instruction + Save → step committed. v2 skills lazy-translation shim. Replay: hard-fail on drift in v1; vision recovery deferred to Phase 102. |
| **D-101-CHAT-ANIMS** | Thinking-pulse 3-dot when `isStreaming && lastAssistantMessage==null`. Streaming caret kept (100-10-06). Idle pulse `@keyframes idleBreath` 4s on chat input area when unfocused + empty. Per-tool status (100-10-10) — Hermes phrase backend bridge closes Pillar F gap. |
| **D-101-PORT-RANGE-EXTEND** | `15900..15999` (100 slot). Reuses existing `VNC_PORT_COUNTER` (Phase 99). Released on app close. |
| **D-101-SHARED-PROFILE** | Single `--user-data-dir=/home/bruce/.config/livos-chrome` across all apps. Single Chrome process via CDP avoids singleton lock issue (root cause of 100-10-08 revert). |
| **D-101-SACRED** | `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED. Pre-commit hook enforces. NEVER `--no-verify`. |
| **D-101-NO-SERVER4** | `bruce@10.69.31.68` only. Server4 + Server5 off-limits. |
| **D-101-BACKWARDS-COMPAT** | v2 skills replay via lazy-translation shim (carries from 100-10-02 + 100-10-09). Old WebApps booting via `--app=URL` argv → first-boot migration: existing icons re-spawn via CDP after Phase 101 deploy. No data loss. |

### Claude's Discretion

| Area | Scope |
|------|-------|
| **CDP client wrapper API surface** | Shape of `chrome-cdp/client.ts` — exposed methods, error handling, reconnect strategy. CONTEXT specifies only `chrome-remote-interface` as the dep. |
| **Port allocator data structure** | Linear scan vs. Set + sorted; release-and-reuse algorithm. CONTEXT specifies range + max only. |
| **Native-app WM_CLASS match algorithm** | Polling cadence, max-attempts, fallback for child-process-owned windows (CONTEXT mentions "poll for up to 5 seconds"; specific algorithm is Claude's call). |
| **Teach v3 popover anchoring** | Modal vs. non-modal, queueing rapid clicks (CONTEXT mentions but doesn't lock — 100-10-12-RESEARCH §"Open questions" Q1 explicitly defers). |
| **Idle pulse timing curve** | CONTEXT specifies "4s cycle, opacity 0.3-0.8 ease-in-out" — exact CSS animation declaration is Claude's call. |

### Deferred Ideas (OUT OF SCOPE)

- **Phase 102:** v3 skill drift recovery via vision (agent reads `instruction` + uses screenshot+click chain).
- **Multi-user WebApps:** Locked out per D-V33-07 (v34+).
- **Per-app profile isolation:** Rejected — same profile shared by design.
- **WebRTC stream transport:** Deferred (v34).
- **Container migration (selfclaude-style):** Deferred (v34+).
- **Agent-as-recorder:** Reverse SelfClaude — Phase 102+ research.
- **Skill versioning / fork:** Phase 102.

---

## Phase Requirements

Phase 101 is user-vision driven. Requirement IDs were not pre-assigned in REQUIREMENTS.md. The phase derives from the 2026-05-10 UAT verbatim + D-101-* decisions. Each pillar maps to a research-supported plan:

| Pillar | Description | Research Support |
|--------|-------------|------------------|
| A | Single Chrome + multi-port per-app stream (shared profile) | §"Per-Pillar Implementation — Pillar A" |
| B | Ubuntu native apps as first-class LivOS citizens | §"Per-Pillar Implementation — Pillar B" |
| C | Luse window-context auto-awareness | §"Per-Pillar Implementation — Pillar C" |
| D | SelfClaude action-driven Teach | §"Per-Pillar Implementation — Pillar D" |
| E | Chat animations (thinking + idle + caret) | §"Per-Pillar Implementation — Pillar E" |
| F | Hermes per-tool phrase relay (closes 100-10-10) | §"Per-Pillar Implementation — Pillar F" |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Chrome lifecycle (boot + CDP) | livinityd (Node backend) | — | livinityd is the process supervisor; owns Chrome PID, CDP socket, reconnect on crash. |
| CDP target/window creation | livinityd | — | Backend orchestration; UI never speaks CDP directly. |
| x11vnc capture + RFB stream | livinityd | — | Existing pattern (Phase 99-02 `vnc-bridge.ts`); single owner. |
| Stream port allocation | livinityd | — | Single source of truth for ports (15900..15999 ring); UI requests via tRPC. |
| Native-app spawn + window-bind | livinityd | — | Spawn detached child + xdotool wait pattern lives in backend; no UI involvement. |
| LivOS dock + native-app add UI | UI (React) | livinityd (tRPC mutations) | UI owns presentation; backend owns Redis persistence. |
| Chat WS envelope (activeWid injection) | UI (sends) | livinityd (reads) | UI knows which WebApp window is "active" (Zustand `useActiveWebApp`); backend reads from envelope and routes to Luse system prompt. |
| Teach v3 click capture | UI (noVNC canvas DOM listener) | livinityd (persistence) | SelfClaude-verified pattern: capture-phase `mousedown` on noVNC `<canvas>` produces canvas-pixel x/y; backend stores via tRPC `webapp.teach.commitStep`. |
| Teach v3 popover | UI (Radix Popover or custom motion.div) | — | Pure UI concern; anchored at (x, y) of the noVNC canvas. |
| Chat animations | UI | — | CSS + Tailwind + framer-motion — no backend. |
| Hermes per-tool status_detail relay | livinityd `agent-session.ts` (bridge from `runStore`) | UI (renders) | Backend reads from RunStore; sends `status_detail` chunk; UI's `ChatResponseBar` renders. Sacred `sdk-agent-runner.ts` untouched (runStore writes happen in `liv-agent-runner.ts`, untouched by us). |

---

## Standard Stack

### Core (already in tree — verify versions before committing)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `chrome-remote-interface` | **0.34.0** (latest, 2026-02-09) `[VERIFIED: npm view]` | Node.js CDP client | De-facto standard for raw CDP in Node; Puppeteer & Playwright depend on it transitively. Lightweight, no browser-automation framework overhead — exactly what CONTEXT wants. |
| `@types/chrome-remote-interface` | 0.33.0 `[VERIFIED: npm view]` | TypeScript types | DefinitelyTyped maintenance; works for 0.34.x. |
| `ioredis` | ^5.4.0 (in tree) `[VERIFIED: livinityd/package.json]` | Redis client | Existing dependency for `liv:apps:native:<id>` namespace. Named export `{Redis}` per CLAUDE.md memory. |
| `zod` | ^3.21.4 (in tree) | Runtime schema validation | Existing dep; use for `NativeAppConfig` schema + v3 action_log schema. |
| `vitest` | 2.1.9 (livinityd) / 2.1.9 (ui) `[VERIFIED: pkg.json]` | Test runner | Existing testing standard. Tests run `--maxConcurrency 1 --singleThread` (per livinityd test script). |
| `framer-motion` | 10.16.4 (in tree) `[VERIFIED: ui/package.json]` | UI animations | Existing dep. Note: latest is 12.38.0 (also published as `motion`) but project uses 10.16.4 — STAY ON 10.16.4 to avoid framework churn. |
| `lucide-react` | 0.288.0 (in tree) | Icon set | Existing dep. Lucide-react latest is 1.14.0 but project uses 0.288 — STAY ON 0.288 (icon name changes between major versions). |
| `tailwindcss` | 3.4.1 (in tree) | Styling | Existing. `animate-pulse` utility + `[animation-delay:Nms]` arbitrary value syntax used throughout. |
| `@radix-ui/react-popover` | ^1.0.7 (in tree) | Teach v3 popover anchoring | Existing dep. `<PopoverAnchor>` element supports virtual reference (x, y) for positioning at click point. |

### Supporting (no new deps required)

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `xdotool` | system pkg (Ubuntu 24.04) | Native-app window enumeration + activation | Pillar B (native-app window bind); already used by `input-dispatcher.ts` post-100-07.1 |
| `wmctrl` | system pkg | Window list fallback (EWMH) | Existing fallback path (100-09-07) |
| `x11vnc` | system pkg | RFB stream of bound wid | Existing (Phase 99-02) — argv locked, untouched |
| `fluxbox` | system pkg | WM on Xvfb `:1` | Existing (100-08-01); singleton, untouched |
| `@radix-ui/react-dialog` | 1.0.4 (in tree) | "Adlandır" name dialog (Teach v3 finalize) | Existing pattern in `WebAppSkillsPopover` |
| `zustand` | (in tree) | Client state for `webapp-drawer-store` + new `useActiveWebApp` | Existing — `webapp-drawer-store.ts` shows pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `chrome-remote-interface` | `puppeteer-core` | Full browser-automation framework — too heavy for our thin CDP wrapper. Locks us into Puppeteer's "page lifecycle" abstraction we don't need. `[ASSUMED]` |
| `chrome-remote-interface` | `playwright-core` | Same overweight concern. Playwright adds another browser-binary chain. `[ASSUMED]` |
| `chrome-remote-interface` | `chrome-launcher` + raw WebSocket | DIY CDP client — boilerplate for very little gain. `chrome-remote-interface` is ~600 LOC and stable. `[ASSUMED]` |
| Radix Popover for Teach v3 | Headless UI / Floating UI | Project already uses Radix throughout; Radix Popover supports `<PopoverAnchor virtualRef={{getBoundingClientRect: () => DOMRect}}>` for free-positioning. `[CITED: radix-ui.com/primitives]` |
| framer-motion staggered children | Pure CSS keyframes + animation-delay | Project already has BOTH patterns (`restore-progress-dialog.tsx` uses CSS animate-pulse + animation-delay arbitrary values). For 3-dot thinking, the CSS approach is simpler and matches existing pattern. Use CSS. |

**No new dependencies need installation** beyond `chrome-remote-interface` + `@types/chrome-remote-interface`:

```bash
cd livos/packages/livinityd
npm install chrome-remote-interface@^0.34.0
npm install --save-dev @types/chrome-remote-interface@^0.33.0
```

**Version verification commands** (run before locking the plan):
```bash
npm view chrome-remote-interface version    # was 0.34.0 on 2026-05-10
npm view @types/chrome-remote-interface version  # was 0.33.0
```

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER (Mini PC desktop / livinity.io browser)                       │
│                                                                     │
│   click LivOS dock icon  ──┐                                        │
│   type in chat   ──────────┼──────────────┐                         │
│   click in stream (teach)  │              │                         │
│                            ▼              ▼                         │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  LivOS UI (React + Vite, served by livinityd:8080)   │           │
│  │  • Dock (webapp + native icons)                      │           │
│  │  • Stream window (noVNC canvas + chrome around it)  │           │
│  │  • Floating action bar (Chat/Teach icons + popovers)│           │
│  │  • Teach v3 popover (anchored at click point)       │           │
│  │  • Chat: thinking-dots / streaming-caret / idle-pulse│          │
│  └──────────────────┬───────────────────────────────────┘           │
│         tRPC (HTTP)│            WebSocket (chat stream)             │
│         ▼          │            ▼                                   │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  livinityd (Node, tsx, systemd: livos.service)       │           │
│  │  ┌────────────────┐  ┌──────────────────────┐        │           │
│  │  │ chrome-cdp/    │  │ apps/native-app-*    │        │           │
│  │  │ bootstrap.ts   │  │ Spawn detached child │        │           │
│  │  │ client.ts      │  │ DISPLAY=:1 binary    │        │           │
│  │  │   (CDP wrapper)│  │ Wait for WM_CLASS   │        │           │
│  │  └─────┬──────────┘  └────────┬─────────────┘        │           │
│  │        │                      │                      │           │
│  │  ┌─────▼──────────────────────▼──────────────────┐   │           │
│  │  │ streaming/port-allocator (15900..15999)       │   │           │
│  │  │ streaming/vnc-bridge (x11vnc -id 0xWID)       │   │           │
│  │  │ streaming/stream-manager                       │   │           │
│  │  └────────────┬──────────────────────────────────┘   │           │
│  │               │                                       │           │
│  │  ┌────────────▼─────────────────────────────────┐    │           │
│  │  │ ai/agent-session.ts (WS + RunStore relay)    │    │           │
│  │  │ • Reads activeWid + activeAppMeta from envelope    │           │
│  │  │ • Injects Active Window Context into prompt  │    │           │
│  │  │ • Relays status_detail chunks (Hermes Pillar F)    │           │
│  │  └────────────┬─────────────────────────────────┘    │           │
│  │               │                                       │           │
│  │   ┌───────────▼──────────────┐                       │           │
│  │   │ liv-core (separate proc) │  ◄── sdk-agent-runner.ts          │
│  │   │ Subscription Claude SDK  │  ◄── SACRED SHA                   │
│  │   │ McpClientManager         │      f3538e1d…                    │
│  │   │ RunStore (Redis chunks)  │      UNTOUCHED                    │
│  │   └────────────┬─────────────┘                       │           │
│  └────────────────┼──────────────────────────────────────┘           │
└───────────────────┼──────────────────────────────────────────────────┘
                    │ Redis pub-sub (per-WebApp MCP config)
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  X SERVER :1  (Xvfb singleton, fluxbox WM — 100-08-01 baseline)     │
│                                                                     │
│   ┌─────────────────────────────────────────────────┐               │
│   │  Single Chrome process (--remote-debugging-port=9222)           │
│   │  --user-data-dir=/home/bruce/.config/livos-chrome              │
│   │                                                 │               │
│   │  ┌─────────────┐ ┌─────────────┐ ┌──────────┐  │               │
│   │  │ Window A    │ │ Window B    │ │ Hidden   │  │               │
│   │  │ livinity.io │ │ google.com  │ │ about:   │  │               │
│   │  │ wid=0xa01   │ │ wid=0xb01   │ │ blank    │  │               │
│   │  └─────┬───────┘ └─────┬───────┘ │ (shell)  │  │               │
│   │        │               │         └──────────┘  │               │
│   └────────┼───────────────┼────────────────────────┘              │
│            │               │                                        │
│   ┌────────▼──────┐ ┌──────▼─────────┐                             │
│   │ x11vnc :15900 │ │ x11vnc :15901  │                             │
│   │ -id 0xa01     │ │ -id 0xb01      │                             │
│   └───────────────┘ └────────────────┘                             │
│                                                                     │
│   Plus optional native apps (Antigravity IDE, VSCode, Files):       │
│   ┌──────────────────────────┐                                      │
│   │ antigravity-ide          │                                      │
│   │ wid=0xc01 / x11vnc 15902 │                                      │
│   └──────────────────────────┘                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | File | Responsibility |
|-----------|------|----------------|
| Chrome CDP bootstrap | `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.ts` (NEW) | Spawn Chrome on livinityd boot, wait for CDP `/json/version`, expose `ChromeCdpHandle` (singleton). Reconnect on crash. |
| CDP client wrapper | `livos/packages/livinityd/source/modules/chrome-cdp/client.ts` (NEW) | Typed wrapper around `chrome-remote-interface`. Methods: `createWindowForUrl(url, bounds)`, `getWidForTarget(targetId)`, `setBounds(windowId, bounds)`, `closeTarget(targetId)`, `minimizeWindow(windowId)`. |
| Port allocator | `livos/packages/livinityd/source/modules/streaming/port-allocator.ts` (NEW) | `allocateNextStreamPort()` → `{port, streamId}`. `release(port)`. Range 15900-15999. Reuses Phase 99 `VNC_PORT_COUNTER` internally. |
| Native-app spawner | `livos/packages/livinityd/source/modules/apps/native-app-spawner.ts` (NEW) | `spawnNative(cfg)` — detached child + xdotool wait for new wid + WM_CLASS match. |
| Native-app binder | `livos/packages/livinityd/source/modules/apps/native-app-binder.ts` (NEW) | After spawn, allocate port + spawn x11vnc + return `{wsUrl, port, wid}`. |
| WebApp window-manager (rewrite) | `livos/packages/livinityd/source/modules/webapps/window-manager.ts` (modified) | `spawn(opts)` now calls `chromeCdp.createWindowForUrl()` instead of `child_process.spawn('google-chrome', [--app=URL])`. xdotool wait path removed. |
| Agent session (activeWid + Hermes) | `livos/packages/livinityd/source/modules/ai/agent-runs.ts` (modified) | Read `activeWid` + `activeAppMeta` from WS start envelope; inject into prompt builder. Relay `status_detail` chunks from RunStore to WS clients. |
| Native-app form (UI) | `livos/packages/ui/src/modules/desktop/native-app-form.tsx` (NEW) | Add Native App dialog — name, iconUrl, binaryPath, args, env. tRPC mutation `apps.native.create`. |
| Native-app dock icon (UI) | `livos/packages/ui/src/modules/desktop/dock-item.tsx` (modified — discriminate webapp vs native) | Click handler routes to `apps.native.launch` tRPC. |
| Teach recorder (UI, rewrite) | `livos/packages/ui/src/modules/window/...` (NEW: `teach-recorder.tsx` ported from SelfClaude) | Capture-phase DOM listener on noVNC canvas. onAfterClick → opens TeachPopover. |
| Teach popover (UI) | `livos/packages/ui/src/modules/window/teach-popover.tsx` (NEW) | Radix Popover anchored at click (x, y). Instruction input + Save + Cancel. |
| Chat animations (UI) | `livos/packages/ui/src/modules/window/webapp-floating-action-bar.tsx` (modified) | Thinking-dots when `isStreaming && messages.length === lastSentCount`. Idle-pulse on input when unfocused + empty. |

### Recommended Project Structure

```
livos/packages/livinityd/source/modules/
├── chrome-cdp/              # NEW (Pillar A foundation)
│   ├── bootstrap.ts         # Chrome lifecycle + CDP ready-wait
│   ├── bootstrap.test.ts
│   ├── client.ts            # chrome-remote-interface wrapper
│   ├── client.test.ts
│   └── index.ts             # exports
├── streaming/               # extend (Pillar A port allocator)
│   ├── port-allocator.ts    # NEW
│   ├── port-allocator.test.ts
│   └── … (existing files untouched)
├── apps/                    # extend (Pillar B native apps)
│   ├── native-app-spawner.ts    # NEW
│   ├── native-app-spawner.test.ts
│   ├── native-app-binder.ts     # NEW
│   ├── native-app-binder.test.ts
│   └── … (existing native-app.ts is systemd-service abstraction — different domain, leave alone)
├── webapps/                 # modify (Pillar A consumer)
│   ├── window-manager.ts    # spawn path rewritten to use chrome-cdp/client
│   └── window-manager.test.ts
├── ai/                      # modify (Pillar C + F)
│   ├── agent-runs.ts        # activeWid envelope + status_detail relay
│   └── agent-prompt-builder.ts  # system prompt active-window snippet
└── computer-use/            # NO CHANGE (Luse already exists post 100-10-02)

livos/packages/ui/src/
├── modules/
│   ├── desktop/
│   │   ├── native-app-form.tsx     # NEW (Pillar B UI)
│   │   ├── native-app-icon.tsx     # NEW or extend dock-item.tsx
│   │   └── dock-item.tsx           # MODIFY (discriminate kinds)
│   └── window/
│       ├── webapp-floating-action-bar.tsx  # MODIFY (thinking dots, idle pulse)
│       ├── teach-recorder.tsx              # NEW (replaces interval recorder)
│       └── teach-popover.tsx               # NEW (instruction prompt)
```

### Pattern 1: CDP Connection Lifecycle

**What:** Persistent CDP connection to Chrome on `localhost:9222` with automatic reconnect on Chrome crash. Singleton at livinityd lifetime.
**When to use:** All Chrome window operations (spawn, bounds, focus, close).
**Example:**

```typescript
// chrome-cdp/client.ts
// Source: chrome-remote-interface docs + selfclaude/webapp-manager.js spawn pattern
// [VERIFIED: github.com/cyrus-and/chrome-remote-interface README]
import CDP from 'chrome-remote-interface'

export interface ChromeCdpClientOpts {
  host?: string
  port?: number
  logger?: { info(m: string): void; warn(m: string): void; error(m: string): void }
}

export class ChromeCdpClient {
  private client: any | null = null  // CDP type from chrome-remote-interface lacks proper TS types
  private readonly host: string
  private readonly port: number
  private readonly logger: ChromeCdpClientOpts['logger']

  constructor(opts: ChromeCdpClientOpts = {}) {
    this.host = opts.host ?? 'localhost'
    this.port = opts.port ?? 9222
    this.logger = opts.logger
  }

  async connect(): Promise<void> {
    // CDP() auto-discovers a target; for browser-level commands we need
    // target: 'browser' to get the browser-level CDP socket exposed by
    // Chrome at /devtools/browser/<uuid>.
    this.client = await CDP({host: this.host, port: this.port, target: (targets: any[]) => targets.find(t => t.type === 'browser') ?? targets[0]})
    this.client.on('disconnect', () => {
      this.logger?.warn('chrome-cdp: disconnected; will reconnect on next call')
      this.client = null
    })
  }

  async ensureConnected(): Promise<void> {
    if (!this.client) await this.connect()
  }

  /**
   * Create a new top-level Chrome window for the given URL, return target+window IDs.
   * Per CDP spec [CITED: chromedevtools.github.io/devtools-protocol/tot/Target/]:
   *   newWindow: true → separate top-level window (NOT a tab)
   *   width/height require newWindow=true
   */
  async createWindowForUrl(url: string, opts: {width: number; height: number; left?: number; top?: number; background?: boolean}): Promise<{targetId: string; windowId: number}> {
    await this.ensureConnected()
    const {targetId} = await this.client.Target.createTarget({
      url,
      newWindow: true,
      background: opts.background ?? false,
      width: opts.width,
      height: opts.height,
    })
    // getWindowForTarget returns {windowId, bounds}
    // [CITED: chromedevtools.github.io/devtools-protocol/tot/Browser/]
    const {windowId} = await this.client.Browser.getWindowForTarget({targetId})

    // If a position was requested, set it AFTER createTarget. Two-call
    // pattern because setWindowBounds cannot combine state with bounds.
    if (opts.left !== undefined || opts.top !== undefined) {
      await this.client.Browser.setWindowBounds({
        windowId,
        bounds: {
          left: opts.left,
          top: opts.top,
          width: opts.width,
          height: opts.height,
        },
      })
    }
    return {targetId, windowId}
  }

  /**
   * Minimize a window. MUST be a separate call from setWindowBounds(bounds)
   * because CDP rejects bounds + windowState in the same call.
   * [CITED: chromedevtools.github.io/devtools-protocol/tot/Browser/#type-Bounds]
   *   "The 'minimized', 'maximized' and 'fullscreen' states cannot be
   *    combined with 'left', 'top', 'width' or 'height'."
   */
  async minimizeWindow(windowId: number): Promise<void> {
    await this.ensureConnected()
    await this.client.Browser.setWindowBounds({
      windowId,
      bounds: {windowState: 'minimized'},
    })
  }

  async closeTarget(targetId: string): Promise<void> {
    await this.ensureConnected()
    await this.client.Target.closeTarget({targetId})
  }
}
```

### Pattern 2: Chrome Boot + CDP Ready-Wait

**What:** Spawn Chrome detached at livinityd boot. Poll `http://localhost:9222/json/version` until 200 OK. Hide shell window via separate minimize call.
**When to use:** livinityd.start() lifecycle, after Xvfb `:1` + fluxbox singletons are up.
**Example:**

```typescript
// chrome-cdp/bootstrap.ts
// Source: selfclaude/webapp-manager.js (spawn pattern), CDP /json/version spec
import {spawn, type ChildProcess} from 'node:child_process'

const CHROME_ARGS = [
  '--remote-debugging-port=9222',
  '--user-data-dir=/home/bruce/.config/livos-chrome',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-sandbox',           // bruce user, no chroot sandbox path
  '--disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars',
  '--disable-infobars',
  '--test-type',            // suppresses "unsupported flag" infobar (selfclaude pattern)
  '--new-window=about:blank',
] as const

export async function bootstrapChrome(opts: {
  display: string
  chromeBinary?: string
  spawnFn?: typeof spawn
  fetchFn?: typeof fetch
  logger?: {info(m: string): void; warn(m: string): void; error(m: string): void}
  readyTimeoutMs?: number
}): Promise<{pid: number; child: ChildProcess}> {
  const bin = opts.chromeBinary ?? 'google-chrome'
  const spawnFn = opts.spawnFn ?? spawn
  const fetchFn = opts.fetchFn ?? fetch
  const timeoutMs = opts.readyTimeoutMs ?? 10_000

  const child = spawnFn(bin, [...CHROME_ARGS], {
    env: {...process.env, DISPLAY: opts.display},
    detached: false,
    stdio: ['ignore', 'ignore', 'pipe'],
  })

  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetchFn('http://localhost:9222/json/version')
      if (r.ok) {
        opts.logger?.info(`chrome-cdp: ready after ${Date.now() - start}ms, pid=${child.pid}`)
        return {pid: child.pid!, child}
      }
    } catch {
      // expected during boot
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  child.kill('SIGKILL')
  throw new Error(`chrome-cdp: not ready within ${timeoutMs}ms`)
}
```

### Pattern 3: SelfClaude Teach Recorder (noVNC canvas DOM listener)

**What:** Capture-phase `mousedown` + `keydown` listeners on the noVNC `<canvas>`. Translate canvas-element coords → canvas-pixel coords (1280×720 frame space). onAfterClick hook fires popover after 100ms (lets noVNC forward the click to streamed Chrome first).
**When to use:** Teach v3 recording mode (Pillar D).
**Example (ported from `github.com/utopusc/selfclaude/blob/main/ui/teach-recorder.js` — Apache 2.0):**

```typescript
// livos/packages/ui/src/modules/window/teach-recorder.tsx
// Source: selfclaude/ui/teach-recorder.js (verbatim port, TS-annotated)
// [VERIFIED: gh api repos/utopusc/selfclaude/contents/ui/teach-recorder.js]

export interface ClickStep {
  type: 'click'
  button: 1 | 2 | 3
  x: number
  y: number
  ts: number
}
export interface TypeStep {
  type: 'type'
  text: string
  ts: number
}
export interface KeyStep {
  type: 'key'
  key: string
  ts: number
}
export interface NoteStep {
  type: 'note'
  text: string
  ts: number
}
export type ActionStep = ClickStep | TypeStep | KeyStep | NoteStep

export interface ActionLogV3 {
  version: 3
  webappId: string
  name?: string
  startedAt: number
  endedAt: number
  events: ActionStep[]
}

let active: {
  canvas: HTMLCanvasElement
  webappId: string
  events: ActionStep[]
  startedAt: number
  listeners: {onMouseDown: (e: MouseEvent) => void; onKeyDown: (e: KeyboardEvent) => void}
  onAfterClick: ((click: {x: number; y: number; button: 1 | 2 | 3}) => void) | null
} | null = null

function pushClick(ev: MouseEvent) {
  if (!active) return
  const canvas = active.canvas
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round(ev.offsetX * scaleX)))
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round(ev.offsetY * scaleY)))
  let button: 1 | 2 | 3
  if (ev.button === 0) button = 1
  else if (ev.button === 2) button = 3
  else button = 2
  active.events.push({type: 'click', button, x, y, ts: Date.now()})
  if (active.onAfterClick) {
    const cb = active.onAfterClick
    setTimeout(() => {
      try { cb({x, y, button}) } catch (e) { console.error('[teach-recorder] onAfterClick threw', e) }
    }, 100)
  }
}

export function startRecording(
  canvas: HTMLCanvasElement,
  webappId: string,
  opts: {onAfterClick?: (c: {x: number; y: number; button: 1 | 2 | 3}) => void} = {},
): void {
  if (active) throw new Error('teach-recorder: already recording')
  // … attach listeners in capture phase (true as third arg)
}

export function pushNote(text: string): void {
  if (!active) throw new Error('teach-recorder: not recording')
  const trimmed = text.trim().slice(0, 512)
  if (!trimmed) return
  active.events.push({type: 'note', text: trimmed, ts: Date.now()})
}

export function stopRecording(): ActionLogV3 | null {
  // … detach listeners, return action_log
}
```

**Critical insight:** This is a UI-tier component. Backend gets the completed `ActionLogV3` via tRPC mutation `webapp.teach.saveSkill({log, name})`. NO CDP, NO new agent tools required for capture.

### Pattern 4: Native App Spawn + WM_CLASS Wait

**What:** Spawn binary detached with `DISPLAY=:1`, baseline-and-poll xdotool for new window matching WM_CLASS.
**When to use:** Pillar B native-app launch.
**Example:**

```typescript
// apps/native-app-spawner.ts
import {spawn} from 'node:child_process'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const execFileP = promisify(execFile)

export interface NativeAppConfig {
  id: string
  name: string
  iconUrl?: string
  binaryPath: string
  args?: string[]
  env?: Record<string, string>
  /** Optional WM_CLASS hint. If unset, infer from process binary basename. */
  wmClassHint?: string
}

export async function spawnNativeApp(cfg: NativeAppConfig, opts: {display: string; logger?: any}): Promise<{wid: number; pid: number}> {
  // 1. Baseline current window IDs on the display (xdotool search --onlyvisible)
  const baseline = await snapshotWindowIds(opts.display)

  // 2. Detached spawn
  const child = spawn(cfg.binaryPath, cfg.args ?? [], {
    env: {...process.env, ...(cfg.env ?? {}), DISPLAY: opts.display},
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  child.unref()

  // 3. Poll xdotool for a NEW window matching WM_CLASS hint, up to 5s
  const wmClass = cfg.wmClassHint ?? inferWmClass(cfg.binaryPath)
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      const {stdout} = await execFileP('xdotool', ['search', '--onlyvisible', '--class', wmClass], {env: {DISPLAY: opts.display}})
      const wids = stdout.trim().split('\n').filter(Boolean).map((s) => parseInt(s, 10))
      const newWid = wids.find((w) => !baseline.has(w))
      if (newWid !== undefined) return {wid: newWid, pid: child.pid!}
    } catch {
      // xdotool returns non-zero when no match — keep polling
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new NativeWindowNotFoundError(cfg.binaryPath, wmClass)
}
```

### Anti-Patterns to Avoid

- **Calling `Browser.setWindowBounds` with `windowState` AND `left/top/width/height` in the same call:** Will be rejected by CDP. Split into two sequential calls.
- **Using CDP `Input.dispatchMouseEvent` to OBSERVE user clicks:** That API only DISPATCHES synthetic events. Observation requires `Runtime.evaluate` to inject a DOM listener — but for our use case the noVNC `<canvas>` IS where the user clicks, so the SelfClaude pattern (DOM `mousedown` on canvas) is the correct path.
- **Polling `xdotool getmouselocation` for click capture:** The CONTEXT additional_context mentions "xdotool polling (today's interval-based)" — that pattern doesn't exist in the current codebase post-100-10. Don't recreate it. Pillar D uses noVNC canvas DOM listener.
- **Calling Chrome with new `--app=URL` argv for every WebApp:** This was the pre-Phase-101 path. With shared profile, Chrome IPC-merges (100-10-08 root cause). CDP `Target.createTarget({newWindow:true})` is the only way to get distinct windows under shared `--user-data-dir`.
- **Spawning Chrome as livinityd child without `detached: true` + `unref()`:** Chrome will die when livinityd restarts. CONTEXT D-101-CHROME-CDP implies persistent Chrome; treat as detached and reconnect via CDP.
- **Assuming `wmClass.toLowerCase()` for xdotool `--class` match:** xdotool's `--class` is case-sensitive regex by default. Use `--classname` for the instance (first WM_CLASS field) or use the actual class string. Test with `xprop WM_CLASS` first.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CDP socket connection management | Raw WebSocket to `/devtools/browser/<uuid>` | `chrome-remote-interface` 0.34.0 | Handles target resolution, JSON-RPC framing, reconnect protocol. ~600 LOC well-tested. |
| Chrome window enumeration on `:1` | Custom EWMH/_NET_CLIENT_LIST parser | xdotool + wmctrl fallback (existing `window-discovery.ts`) | Already shipped in 100-09-07 with fluxbox stderr capture + xdotool fallback path. |
| Stream port allocation | Linear counter with manual collision-check | Reuse Phase 99 `VNC_PORT_COUNTER` pattern (just constrain range to 15900-15999) | Already battle-tested. Reuse the algorithm, narrow the range. |
| Click capture on streamed canvas | xdotool polling, CDP Runtime.evaluate injection | DOM `mousedown` capture on noVNC `<canvas>` | SelfClaude pattern. Canvas-pixel coords come for free via `offsetX * (canvas.width/rect.width)`. No backend involvement. |
| Popover anchored at arbitrary (x,y) | Custom motion.div with position calculation | Radix `<PopoverAnchor virtualRef>` | Existing dep. `virtualRef={{getBoundingClientRect: () => DOMRect}}` gives us free (x,y) anchoring. |
| Staggered 3-dot thinking animation | framer-motion `staggerChildren` | Three `<span className='animate-pulse [animation-delay:Nms]'/>` with CSS keyframes | Pattern already exists in `restore-progress-dialog.tsx`. Match existing project convention. |
| Idle pulse border breathe | framer-motion variants | `@keyframes pulse-border` in `index.css` (already exists) | Already in tree. Reuse. |
| Native-app config persistence | Custom file format | Redis `liv:apps:native:<id>` with zod schema | Existing namespace pattern. zod gives validation. |
| Action log v3 schema | Yet another JSON shape | Same SQLite skills table with `version: 3` column | Per 100-10-12-RESEARCH Q6 recommendation. |
| WebSocket framing for `status_detail` chunks | Custom protocol | Existing `useAgentSocket` ChatMessage union — add `status_detail` discriminant | Existing pattern from 100-10-10. |

**Key insight:** ~80% of Phase 101's surface area is "wire existing components together differently." The only genuinely new code is `chrome-cdp/{bootstrap,client}.ts`, `apps/native-app-spawner.ts`, and the Teach v3 popover. Everything else extends existing patterns.

---

## Per-Pillar Implementation Notes

### Pillar A — Single Chrome + multi-port per-app stream (Plans 101-01 + 101-04)

**State machine on livinityd boot:**

```
livinityd.start()
  ↓
[100-08-01 baseline]
  ensureXvfb(':1') → ensureFluxbox(':1')
  ↓
[NEW: Phase 101]
  chromeCdp.bootstrap({display: ':1'})
    spawn google-chrome [...CHROME_ARGS] (background)
    poll http://localhost:9222/json/version (200 OK or 10s timeout)
    ↓
  chromeCdp.client.connect()
    CDP() → browser-level target
    ↓
  // hide the about:blank shell:
  client.Browser.getTargetsForCurrentBrowsingContext() OR Target.getTargets()
    → find the about:blank target → get windowId via Browser.getWindowForTarget
    → client.minimizeWindow(windowId) [SEPARATE call from any bounds set]
```

**Critical correction to CONTEXT D-101-CHROME-CDP:**

> "about:blank shell window stays hidden via `Browser.setWindowBounds({windowState:'minimized'})` after boot"

This requires the SEPARATE-CALLS pattern (cannot combine `windowState` with `bounds`). Plans should specify two-step boot:
1. `Target.createTarget({url:'about:blank', newWindow:true})` (during launch argv: `--new-window=about:blank`)
2. AFTER CDP connect, find that target's windowId, then call `Browser.setWindowBounds({windowId, bounds:{windowState:'minimized'}})`

**Per-WebApp spawn (Plan 101-04, rewrites `window-manager.ts:spawn`):**

```typescript
async spawn(opts: SpawnOpts): Promise<SpawnResult> {
  // 1. Idempotency check (unchanged from 100-10-08)
  // 2. Per-user cap check (unchanged)

  // 3. Allocate port
  const {port, streamId} = portAllocator.allocateNext()

  // 4. CDP create window with cascade offset
  const cascadeIdx = this.active.size % 10
  const offset = cascadeIdx * 120
  const {targetId, windowId} = await this.chromeCdp.createWindowForUrl(opts.url, {
    width: 1280,
    height: 720,
    left: offset,
    top: offset,
  })

  // 5. Get X11 wid for the new window
  //    CDP windowId is Chrome's internal handle; we need X11 wid for x11vnc.
  //    Use xdotool to find the X11 window with PID = Chrome PID + new target URL.
  //    OR: Target.getTargets returns targetInfo with `attached`, `url`; combine
  //    with Browser.getWindowForTarget's bounds + xdotool to identify wid.
  //    Heuristic: snapshot baseline before createTarget, then xdotool search
  //    --pid <chromePid> after creation, find the new wid not in baseline.
  const wid = await this.findX11WidForNewTarget(targetId, baselineXids)

  // 6. Start x11vnc on the allocated port + wid (existing 100-08 path)
  const stream = await this.streamManager.startStream({
    mode: 'vnc-window',
    target: {wid},
    port,
  })

  // 7. Register per-WebApp Luse MCP (existing 100-08-04 path)
  // 8. Store ActiveWebApp + return
}
```

**Open detail to resolve in 101-04:** mapping `targetId` ↔ X11 `wid`. CDP returns `windowId` (Chrome internal); x11vnc needs X11 wid. Two reliable methods:
- **(a) PID-narrowed xdotool baseline-and-diff:** snapshot `xdotool search --pid <chromePid>` before/after `createTarget`, take the new wid.
- **(b) Title-narrowed xdotool match:** if URL has a unique hostname, `xdotool search --pid <chromePid> --name <hostname>` after a 200ms settle.

Recommend (a) — it's race-free if the snapshot is taken in the same tick as `createTarget`. Time budget: 200-500ms.

### Pillar B — Ubuntu native apps (Plans 101-03 + 101-05 + 101-07)

**Spawn pattern** (verified against SelfClaude approach + xdotool docs):

```typescript
// 1. Baseline window IDs visible on :1
const baseline = new Set(
  (await execFile('xdotool', ['search', '--onlyvisible', '--display', ':1', ''])).stdout
    .trim().split('\n').map(s => parseInt(s, 10)).filter(Number.isFinite)
)

// 2. Detached spawn
const child = spawn(cfg.binaryPath, cfg.args ?? [], {
  env: {...process.env, ...cfg.env, DISPLAY: ':1'},
  detached: true,
  stdio: ['ignore', 'ignore', 'pipe'],
})
child.unref()

// 3. Wait for WM_CLASS match. Two strategies:
//    (a) Direct: --class <hint> matches the second WM_CLASS field
//    (b) PID-narrowed: --pid <child.pid> matches windows owned by spawned PID
//        BEWARE: child processes (e.g., Antigravity IDE spawning electron-helper)
//        own the visible window with a DIFFERENT PID. PID match is unreliable
//        for Electron apps.

// Recommendation: try WM_CLASS first (more reliable for Electron), fall back
// to "any new visible wid not in baseline" after 3 seconds.
```

**WM_CLASS lookup affordance:** Provide an `inferWmClass(binaryPath)` helper that uses the binary's basename as default (`antigravity-ide` → `Antigravity` based on common Electron conventions), but ALWAYS let the user override via the form. UI should show a "Detect WM_CLASS" button that:
1. Asks user to launch the app manually once
2. Backend runs `xprop WM_CLASS` against newest visible window
3. Auto-fills the form

**Risk mitigation per CONTEXT §Risks #2** ("Native app WM_CLASS matching is flaky"):
- 5-second timeout, after which the spawner falls back to "newest visible window not in baseline" + logs a warning.
- If even that fails, return `NativeWindowNotFoundError` with stderr tail for debugging.
- UI surfaces this clearly with a "Couldn't detect window — set WM_CLASS manually" toast.

**Redis schema (Plan 101-03):**

```typescript
// liv:apps:native:<uuid>
const NativeAppConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(64),
  iconUrl: z.string().url().optional(),
  binaryPath: z.string().min(1),     // absolute or in PATH
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  wmClassHint: z.string().optional(),
  createdAt: z.number(),
  createdBy: z.string(),  // userId
})
```

**Lifecycle:**
- Spawn → port allocate → x11vnc → LivOS stream window opens (auto, via UI subscription to `apps.native.streams` events)
- Close → x11vnc stop → port release → SIGTERM to the spawned PID → window-manager removes entry

### Pillar C — Luse window-context auto-awareness (Plan 101-06)

**WebSocket envelope extension:**

```typescript
// ui/src/hooks/use-agent-socket.ts (and useWebAppAgent wrapper)
// CURRENT envelope (post-100-10-10):
{type: 'start', conversationId, message, webappId?}

// EXTENDED:
{type: 'start', conversationId, message,
 webappId?,
 activeWid?: number,         // hex parsed to number; same as window-manager wid
 activeAppMeta?: {
   appId: string,             // webappId OR native-app id
   kind: 'webapp' | 'native',
   url?: string,              // for webapp
   binary?: string,           // for native
   title: string,             // fresh xdotool getwindowname result OR Redis cached
 }
}
```

**Where activeWid comes from in UI:** `useActiveWebApp()` Zustand hook (NEW). Set when WebApp window mounts; reset when none focused. The chat WS hook reads from this on `sendMessage`.

**Backend injection (agent-runs.ts):**

```typescript
// Plan 101-06, agent-runs.ts modification
// Read activeWid + activeAppMeta from start envelope, persist into run metadata,
// AND inject into the system prompt builder.

function buildActiveWindowPromptSnippet(meta: {appId; kind; url?; binary?; title; activeWid}): string {
  return `## Active Window Context
You are operating in the LivOS app: ${meta.title} (${meta.kind}).
Window ID: ${meta.activeWid.toString(16)} (decimal: ${meta.activeWid})
${meta.kind === 'webapp' ? `URL: ${meta.url}` : `Binary: ${meta.binary}`}

Default LUSE_TARGET_WINDOW_ID for all Luse tool calls in this session is ${meta.activeWid} unless you override explicitly via tool args.
`
}
```

**Layering with per-WebApp Luse MCP env (100-08-04):**

The per-WebApp Luse MCP server already has `LUSE_TARGET_WINDOW_ID` set via env when spawned. That's the HARD default (server-side). The prompt snippet is the SOFT default (informs the LLM). If the LLM wants to operate on a different window, it can pass `wid` arg to the tool — the Luse tools already accept `{wid?}` and fall back to env default.

### Pillar D — SelfClaude action-driven Teach (Plan 101-08)

**The KEY insight from research:** SelfClaude does NOT use CDP for click capture. It uses **DOM mousedown listener on the noVNC `<canvas>` element**. This is implementable in the UI tier ALONE — no CDP changes, no Chrome changes, no new MCP tools.

**Architecture:**

```
[User clicks in noVNC canvas during Teach mode]
     │
     ▼
[DOM mousedown event in CAPTURE phase]
     │   listener attached via canvas.addEventListener('mousedown', ..., true)
     │   noVNC's RFB layer ALSO receives the event and forwards it to streamed Chrome
     │   (we don't preventDefault — user sees their click land live)
     ▼
[teach-recorder.pushClick]
     │   translates offsetX/Y → canvas-pixel coords (1280×720 frame space)
     │   pushes {type:'click', button, x, y, ts} to active.events
     │
     │   schedules onAfterClick (100ms setTimeout)
     ▼
[TeachPopover opens, anchored at (x, y)]
     │   Radix <PopoverAnchor virtualRef={{getBoundingClientRect: () => DOMRect}}>
     │   Input field + Save + Cancel
     │
     │   While popover open: subsequent clicks are QUEUED
     │   (set a `mode='waitingForInstruction'` flag in store)
     ▼
[User types instruction + Save]
     │   pushNote(instruction) — interleaves a 'note' event after the click
     │   popover closes, mode returns to 'armed'
     ▼
[User clicks Stop / Save Skill]
     │   stopRecording() → ActionLogV3
     │   tRPC mutation webapp.teach.saveSkill({log, name})
```

**Key design choices (resolve in 101-08):**

1. **Modal-blocking vs. queued popover** (open question Q1 from 100-10-12 RESEARCH): recommend **modal-blocking** for v1 — pause the recorder while popover is open. Queued clicks during the popover can land in the streamed Chrome (because we don't preventDefault) but are NOT recorded. Show a small "step pending — instruction needed" indicator.
2. **Note placement:** push the `note` event AFTER the corresponding click (matches SelfClaude). Replay engine reads click + following note as a unit.
3. **Cancel behavior:** Cancel = remove the just-pushed click from `active.events`. (User clicked accidentally.)
4. **Screenshot before/after:** for v3 v1, SKIP screenshots (per 100-10-12 Q3 — base64 is heavy, defer to v3 v2). The CONTEXT v3 schema includes `screenshot_before/after`, but research recommends marking those fields optional and deferring capture work to a follow-up.
5. **Per-step persistence vs. batch save:** per CONTEXT D-101-TEACH-V3 step 6 "WebSocket emit `{type: 'teach_step_commit', instruction}`" — push individual `note` to backend in-flight, finalize on Stop. Cleanest: keep `active.events` in UI-only memory; only commit on Stop. The CONTEXT's incremental-commit pattern is unnecessary complexity for v1.

**Backwards compat (action_log v1 + v2 → v3):**

- v1 (selfclaude shape): `{version:1, events:[{type:'click', button, x, y, ts}]}` — interpret as v3 `events: ActionStep[]` directly. The schemas are nearly identical.
- v2 (LivOS post-100-09-06): `{version:2, events:[…with screenshot_b64 + viewport …]}` — strip the per-event screenshot, keep the action shape. Tool name translation `mcp__bytebot__*` → `mcp__luse__*` from 100-10-02.

Recommend ONE table `skills` with `version: int` column. Replay engine dispatches by version. Same backend `skill-replay-tool.ts` extended with a v3 branch.

### Pillar E — Chat animations (Plan 101-09 UI part)

**Already-existing patterns in tree to reuse:**

1. **Staggered 3-dot pulse** — exact pattern from `livos/packages/ui/src/features/files/components/rewind/restore-progress-dialog.tsx`:
   ```tsx
   <span className='animate-pulse [animation-delay:0ms] [animation-duration:1.4s]'>.</span>
   <span className='animate-pulse [animation-delay:200ms] [animation-duration:1.4s]'>.</span>
   <span className='animate-pulse [animation-delay:400ms] [animation-duration:1.4s]'>.</span>
   ```
   CONTEXT specifies `0ms / 150ms / 300ms` delays — fine to use either, but match existing 200ms cadence for project consistency.

2. **Border pulse keyframe** — already defined in `livos/packages/ui/src/index.css` (`@keyframes pulse-border`). Verify it matches the breathing curve the user wants (4s, opacity 0.3→0.8); if not, add a new `@keyframes idle-breath` adjacent to it.

3. **Blink caret** — `@keyframes blink-caret` in `index.css`. Already in use post-100-10-06.

**New patterns for Pillar E:**

- **Thinking-dots trigger condition:** `isStreaming && messages.length === lastSentCount` (i.e., user sent N+1th message, total is N+1 with 0 assistant tokens received yet). This requires tracking `lastSentCount` in the floating-action-bar state — when `sendMessage(text)` is called, record `messages.length` THEN call sendMessage. The dot indicator renders while `messages.length === recordedSentCount && isStreaming`.

- **Idle pulse trigger:** `chatInputModeByWebappId[webappId] === 'chat-input' && !isFocused && inputValue === ''`. Apply `animate-idle-breath` Tailwind class conditionally. Listen for `prefers-reduced-motion: reduce` and disable.

**Accessibility:** All animations MUST respect `prefers-reduced-motion: reduce`. Tailwind's `motion-reduce:` variant covers this:
```tsx
<span className='animate-pulse motion-reduce:animate-none ...' />
```

### Pillar F — Hermes per-tool phrase relay (Plan 101-09 backend part)

**Gap to close:** 100-10-10 status_detail UI is wired (ChatResponseBar renders `currentTool`), but Hermes phrases (e.g., "Listing windows...") never reach the WebSocket client because `agent-session.ts` doesn't read `status_detail` chunks from RunStore.

**The fix (livos/packages/livinityd/source/modules/ai/agent-runs.ts):**

1. RunStore (in `liv-core`, sacred-adjacent — NOT sdk-agent-runner) already writes `status_detail` chunks per Hermes pattern (Phase 87).
2. `agent-runs.ts` subscribes to RunStore chunks via existing channel. Today it forwards `text` and `tool_use` chunks. ADD: forward `status_detail` chunks too.
3. UI `useAgentSocket` reducer needs a case for `status_detail` → update `currentTool` state.
4. ChatResponseBar renders `currentTool` (already wired in 100-10-10).

**Sacred-file safety:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d…` is the agent loop entrypoint. RunStore writes happen in `liv-agent-runner.ts` (wraps SdkAgentRunner) — that file is NOT sacred and can be modified. agent-runs.ts in livinityd is the SUBSCRIBER side — also non-sacred.

**Verification:** before/after `git hash-object liv/packages/core/src/sdk-agent-runner.ts` must equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Pre-commit hook enforces.

---

## Runtime State Inventory

> Phase 101 introduces NEW persistent state (Chrome process, Redis namespace, ports). Inventory for clean shutdown + state migration:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | (1) Existing `skills` table in livinityd SQLite/Postgres — gets a `version: 3` row variant. (2) Redis `liv:apps:native:<uuid>` (NEW namespace, no migration). (3) Redis `liv:cap:*` capability registry (existing, post-Phase 65) — unchanged. | (1) Schema migration: add `version` int column to skills if absent, default 2 for existing rows. (2) Plan 101-03 creates namespace fresh. (3) No action. |
| **Live service config** | (1) Per-WebApp Luse MCP descriptors registered in McpConfigManager (Redis-backed) — `luse:webapp:<webappId>`. (2) NEW: Chrome process is a livinityd-supervised subprocess. (3) NEW: x11vnc child processes per stream port. | (1) Already wired (100-08-04). (2) New livinityd lifecycle — Chrome boots in `livinityd.start()` after Xvfb/fluxbox; killed in `livinityd.stop()`. Document in Plan 101-01. (3) Existing pattern (vnc-bridge.ts) — no change. |
| **OS-registered state** | systemd `livos.service` (livinityd) — unchanged. NO new systemd units. NO Task Scheduler / launchd / cron entries created. | None. Chrome is livinityd's child, not systemd-managed. |
| **Secrets / env vars** | NEW env vars consumed by livinityd: `LIVOS_CHROME_CDP_PORT` (default 9222), `LIVOS_CHROME_USER_DATA_DIR` (default `/home/bruce/.config/livos-chrome`). NO secret material. Sacred file env-driven inputs (`BROKER_FORCE_ROOT_HOME`) — unchanged. | Document in `.env.example` and Plan 101-01. |
| **Build artifacts** | livinityd is tsx-run (no compile step). UI: vite build produces `dist/` — refreshed by `update.sh`. No new build steps. | None. |

**Nothing found in category — explicitly:**
- No Windows Task Scheduler / pm2 / launchd state changes.
- No CI/CD secret changes.
- No SOPS-encrypted key changes.
- No new Caddy reverse-proxy rules required (CDP socket on `localhost:9222` stays local-only).

---

## Common Pitfalls

### Pitfall 1: `Browser.setWindowBounds` rejects combined state + dimensions

**What goes wrong:** Plan 101-01 ships a single call combining `windowState: 'minimized'` with `bounds: {left, top, width, height}`. CDP returns error. Boot fails silently or shell window stays visible.
**Why it happens:** CDP spec: "The 'minimized', 'maximized' and 'fullscreen' states cannot be combined with 'left', 'top', 'width' or 'height'." [CITED: chromedevtools.github.io/devtools-protocol/tot/Browser/]
**How to avoid:** Always split into TWO sequential calls — one for bounds, one for state.
**Warning signs:** Chrome boots but about:blank window remains visible on `:1` (snapshotable via screenshot of `:1`); CDP error in livinityd logs.

### Pitfall 2: Chrome CDP target ↔ X11 wid race

**What goes wrong:** After `Target.createTarget({newWindow:true})`, livinityd tries to start x11vnc with a stale or wrong wid. Result: x11vnc captures empty area OR another WebApp's window.
**Why it happens:** Chrome creates the X11 window asynchronously after CDP returns. `Browser.getWindowForTarget` returns Chrome's internal windowId, NOT the X11 wid.
**How to avoid:** Use PID-narrowed `xdotool search --pid <chromePid>` baseline-and-diff. Snapshot the wid set BEFORE `createTarget`, take the new wid AFTER (poll with 100ms cadence, 1s timeout).
**Warning signs:** First WebApp opens fine; subsequent WebApps' streams show wrong content or black areas (similar to 100-10-CONTEXT Issue 2).

### Pitfall 3: Detached Chrome dies when livinityd restarts

**What goes wrong:** Hot-reload or service restart kills Chrome. Open WebApps lose their backing windows. Streams show frozen frames.
**Why it happens:** Default `child_process.spawn` makes Chrome a livinityd child; livinityd termination cascades SIGTERM.
**How to avoid:** Decide explicitly:
- **(a) Chrome IS livinityd-supervised** (CONTEXT default): accept that restart cascades; on livinityd.start(), spawn fresh Chrome. Existing WebApps fail closed and user reopens via dock. This is the pragmatic v1.
- **(b) Chrome SURVIVES livinityd restart:** `detached: true`, `unref()`, and `setsid` to break process-group cascade. livinityd reconnects via CDP on next start. More complex; defer to v2 if needed.
**Recommendation:** v1 = (a). Document that livinityd restart resets all WebApp streams.

### Pitfall 4: WM_CLASS hint mismatch for Electron apps

**What goes wrong:** Native app spawn (e.g., Antigravity IDE) — binary forks child processes that own the visible window with a different PID and possibly different WM_CLASS (`AntigravityIDE` vs. `electron`).
**Why it happens:** Electron apps follow `app.setName()` calling pattern; the rendered window's WM_CLASS comes from the Electron framework's main process, not the spawn entry point.
**How to avoid:**
- Provide a "Detect WM_CLASS" affordance in the native-app form. User launches app manually once, backend reads `xprop WM_CLASS` of newest window.
- Fall back to "any new visible window not in baseline after 3s" if WM_CLASS mismatch.
- Log baseline + observed wids when match fails, for debugging.
**Warning signs:** Native app's stream opens but shows a wrong window (e.g., a system tray helper window) or shows nothing.

### Pitfall 5: noVNC canvas listener interference with RFB input forwarding

**What goes wrong:** Adding `mousedown` listener on noVNC `<canvas>` accidentally prevents noVNC from forwarding the click to streamed Chrome. User sees Teach mode capturing clicks but Chrome doesn't actually receive them.
**Why it happens:** `e.preventDefault()` or `e.stopPropagation()` in the listener short-circuits the event flow.
**How to avoid:** Per SelfClaude pattern: NEVER call `preventDefault()`. Attach in CAPTURE phase (third arg `true`) so we observe BEFORE noVNC processes — but don't stop the event. User sees their click land live in Chrome.
**Warning signs:** Teach replay works but live Chrome view doesn't respond to clicks during Teach mode.

### Pitfall 6: Active window context envelope sent BEFORE chat is associated with a window

**What goes wrong:** Chat WebSocket connects from the main desktop (not inside a WebApp window). `activeWid` is undefined. agent-session.ts injects "Active Window Context: Window ID: undefined" → LLM gets confused.
**Why it happens:** Pillar C envelope is optional; backend must handle absence.
**How to avoid:** Only inject the Active Window Context snippet when ALL of `activeWid + activeAppMeta.title + (url OR binary)` are present. Otherwise emit nothing (no snippet, no placeholder).
**Warning signs:** Agent says "I don't know what window you mean" even when chat is opened inside a WebApp.

### Pitfall 7: Port range reuse race after rapid close+open

**What goes wrong:** User closes WebApp A (port 15900 released), immediately reopens (allocator returns 15900), but x11vnc on 15900 hasn't fully bound to the new wid yet — old fmp4 fanout subscribers see old frames.
**Why it happens:** Port release ≠ x11vnc termination. SIGTERM is async.
**How to avoid:** allocator waits for stream-manager's stopStream() to fully resolve before marking port free. Equivalently: don't release the port until x11vnc has exited.
**Warning signs:** Cross-talk between sequential WebApp opens on the same port.

### Pitfall 8: Hermes phrase relay echoes stale tool name

**What goes wrong:** Pillar F lands `status_detail` relay. Agent calls `luse__list_windows` → UI shows "Listing windows...". Tool completes. Next user message → UI still shows "Listing windows..." for a moment until new chunks arrive.
**Why it happens:** No reset signal between tool calls.
**How to avoid:** Clear `currentTool` state on:
- New `text` chunk arrival (assistant started responding)
- `tool_result` chunk arrival (tool finished)
- User sendMessage (new turn started)
**Warning signs:** Stale phrase visible during chat idle.

---

## Code Examples

Verified patterns from official sources or in-tree.

### 1. CDP Connection + Browser-Level Target

```typescript
// Source: chrome-remote-interface README + CDP docs
// [VERIFIED: github.com/cyrus-and/chrome-remote-interface README]
import CDP from 'chrome-remote-interface'

const client = await CDP({
  host: 'localhost',
  port: 9222,
  // Default targets a page; for Browser.* commands we need browser-level:
  target: (targets) => targets.find((t) => t.type === 'browser') ?? targets[0],
})

const {targetId} = await client.Target.createTarget({
  url: 'https://livinity.io',
  newWindow: true,
  background: false,
  width: 1280,
  height: 720,
})

const {windowId} = await client.Browser.getWindowForTarget({targetId})
// windowId is integer; treat as opaque CDP handle
```

### 2. SelfClaude Click Capture (DOM, not CDP)

```javascript
// Source: github.com/utopusc/selfclaude/blob/main/ui/teach-recorder.js (Apache 2.0)
// [VERIFIED: gh api repos/utopusc/selfclaude/contents/ui/teach-recorder.js]

// CAPTURE-PHASE listener so we observe before noVNC consumes:
canvas.addEventListener('mousedown', onMouseDown, true)  // true = capture phase

function pushClick(ev) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const x = Math.round(ev.offsetX * scaleX)
  const y = Math.round(ev.offsetY * scaleY)
  // DON'T preventDefault — let noVNC forward to streamed Chrome
  events.push({type: 'click', x, y, button: domButtonToXdotool(ev.button), ts: Date.now()})
}
```

### 3. Radix Popover Anchored to Arbitrary (x, y)

```tsx
// Source: Radix UI Popover docs + verified in @radix-ui/react-popover 1.0.7 API
// [CITED: radix-ui.com/primitives/docs/components/popover#anchor]
import * as Popover from '@radix-ui/react-popover'

function TeachPopover({click, onSave, onCancel}: {click: {x: number; y: number} | null; onSave: (text: string) => void; onCancel: () => void}) {
  const virtualRef = click ? {
    getBoundingClientRect: () => DOMRect.fromRect({x: click.x, y: click.y, width: 0, height: 0}),
  } : null

  return (
    <Popover.Root open={!!click} onOpenChange={(o) => !o && onCancel()}>
      {virtualRef && <Popover.Anchor virtualRef={virtualRef} />}
      <Popover.Content side='top' sideOffset={8}>
        {/* instruction input + Save + Cancel */}
      </Popover.Content>
    </Popover.Root>
  )
}
```

### 4. Staggered Thinking-Dots (matches existing project pattern)

```tsx
// Source: livos/packages/ui/src/features/files/components/rewind/restore-progress-dialog.tsx
// [VERIFIED: grep in tree]

function ThinkingDots() {
  return (
    <span className='inline-flex gap-0.5 text-text-tertiary motion-reduce:hidden'>
      <span className='animate-pulse [animation-delay:0ms] [animation-duration:1.4s]'>.</span>
      <span className='animate-pulse [animation-delay:200ms] [animation-duration:1.4s]'>.</span>
      <span className='animate-pulse [animation-delay:400ms] [animation-duration:1.4s]'>.</span>
    </span>
  )
}
```

### 5. Native-app spawn + xdotool wait

```typescript
// Source: selfclaude/src/webapp-manager.js (pattern) + Node child_process docs
// Verified: gh fetch of selfclaude/src/webapp-manager.js

const baseline = await snapshotVisibleWids({display: ':1'})
const child = spawn(cfg.binaryPath, cfg.args, {
  env: {...process.env, ...cfg.env, DISPLAY: ':1'},
  detached: true,
  stdio: ['ignore', 'ignore', 'pipe'],
})
child.unref()

const newWid = await pollForNewWidMatchingClass({
  baseline,
  wmClass: cfg.wmClassHint ?? inferWmClass(cfg.binaryPath),
  display: ':1',
  timeoutMs: 5000,
  pollIntervalMs: 100,
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `chrome --app=URL` argv per WebApp (Phase 100-02) | CDP `Target.createTarget({newWindow:true})` on single Chrome | Phase 101 | Solves Chrome singleton lock conflict with shared profile (100-10-08 revert root cause). Preserves shared Google login. |
| Per-WebApp Xvfb display (100-10-A locked, then 100-10-08 reverted) | Single Xvfb `:1` + multiple Chrome windows via CDP | Phase 101 | Eliminates per-display resource overhead. Multi-stream now works WITHOUT per-display isolation by leveraging CDP's per-window control. |
| xdotool poll for new Chrome window post-spawn | CDP `Browser.getWindowForTarget` + PID-narrowed xdotool diff | Phase 101 | Faster (CDP returns immediately) + race-free (PID narrows the wid search). |
| Interval-based Teach recorder (Phase 95) | Event-driven Teach v3 (SelfClaude pattern) | Phase 101 | Semantic step structure; replay supports instruction-text recovery (deferred to Phase 102). |
| LivOS dock only WebApps | WebApps + Ubuntu native binaries (first-class) | Phase 101 | Native apps (Antigravity IDE, VSCode, Files) become dock-launchable LivOS citizens. |
| Hermes phrase relay missing | `status_detail` chunk → ChatResponseBar | Phase 101 (closes 100-10-10 gap) | Real per-tool phrases visible to user. |

**Deprecated / outdated (do not use in plans):**

- **Per-WebApp `--user-data-dir`:** rejected. Loses shared Google login (D-100-SHARED-PROFILE). Don't propose.
- **CDP `Input.dispatchMouseEvent` as click OBSERVER:** that API only DISPATCHES. Don't use for Teach v3 — use DOM listener on noVNC canvas instead.
- **`xdotool getmouselocation` polling for click capture:** SelfClaude doesn't use it; LivOS shouldn't either. The noVNC canvas listener gives clicks in the right coordinate space natively.
- **DisplayAllocator + per-WebApp xvfb spawn fns:** retained in tree as scaffolding per 100-10-08, but NOT called by Phase 101's spawn path. CONTEXT confirms.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `chrome-remote-interface` 0.34.0 has correct TypeScript types via `@types/chrome-remote-interface@^0.33.0` | Standard Stack | Plan 101-01 may need `// @ts-expect-error` workarounds. Mitigation: types are duck-typed — wrap client in our own typed surface (`ChromeCdpClient`) to isolate. |
| A2 | Chrome 130+ supports `Target.createTarget({newWindow:true, width, height, background})` reliably under fluxbox WM | Pillar A | If `newWindow` doesn't honor `width/height` on first call (older Chromium behavior), follow-up `setWindowBounds({bounds:{width, height, left, top}})` is required (already in Pattern 1 code example — this is defensive code). |
| A3 | xdotool `--pid <chromePid>` reliably narrows search to Chrome's X11 windows | Pillar A | If Chrome's renderer/GPU helper processes own the visible windows, PID match fails. Fallback: snapshot ALL visible wids, take new wid after createTarget. |
| A4 | Per-Pillar B Electron native apps (Antigravity IDE) reliably expose WM_CLASS within 5s of spawn | Pillar B | If detection is flaky for specific apps, UX falls back to "set WM_CLASS manually" + "Detect" button. Acceptable degraded path. |
| A5 | LivOS's tRPC infrastructure supports the new `apps.native.{list,create,delete,launch}` routes without auth-middleware changes | Pillar B / Plan 101-03 | Verify: existing `apps.routes.ts` uses `protectedProcedure` from is-authenticated.ts. New routes use same pattern → no new middleware. LOW risk. |
| A6 | Chrome `--no-sandbox` is acceptable on Mini PC (bruce user, no chroot) | Pillar A | Standard for headless/server Chromium under non-root user. Verified pattern in SelfClaude. LOW risk. |
| A7 | RunStore `status_detail` chunks are emitted by liv-agent-runner Hermes pattern (Phase 87) and the channel is subscribed-but-not-forwarded by agent-runs.ts today | Pillar F / Plan 101-09 | Plan 101-09 task 1: grep verify. If actually emitted by RunStore, this is a one-line forwarder fix. If not emitted, scope grows to also patch liv-agent-runner.ts (NON-sacred — see Sacred SHA Constraint). MEDIUM risk — verify in 101-09 RED phase. |
| A8 | Existing `useAgentSocket` reducer can be extended with a `status_detail` action without breaking message persistence | Pillar E / Plan 101-09 | Verify by reading the reducer; reducer pattern post-100-10-10 already handles `tool_use` discriminant. LOW risk. |
| A9 | `useActiveWebApp` Zustand hook doesn't conflict with existing per-WebApp drawer-store keying | Pillar C / Plan 101-06 | New hook + new state slice; doesn't intersect with `webapp-drawer-store.ts`. LOW risk. |
| A10 | Mini PC has 32GB RAM and 100 concurrent WebApps × ~150MB each (= 15GB) is acceptable | D-101-PORT-ALLOC | CONTEXT calls it "pragmatic cap." UAT will likely test ~5-10 concurrent. UAT row 20 tests "5 WebApps + 2 native apps." LOW risk. |
| A11 | Sacred file `sdk-agent-runner.ts` has zero references to `chrome-remote-interface`, `9222`, or Chrome CDP — so Phase 101 work doesn't touch sacred | Sacred Constraint | Grep verify in 101-01 task 1: `grep -E "chrome-remote-interface\|9222\|cdp" liv/packages/core/src/sdk-agent-runner.ts` should return empty. If non-empty, escalate. HIGH risk if wrong (sacred SHA blocker); LOW probability — sacred file is the agent SDK wrapper, far from Chrome control. |

---

## Open Questions (RESOLVED)

All five questions resolved during planning. Decisions encoded into PLAN.md tasks below; no deferred blockers remain.

1. **CDP target ↔ X11 wid mapping reliability** — **RESOLVED:** PID-narrowed `xdotool search --pid <chromePid>` IS reliable for Chrome WebApp windows. Empirically validated by existing Phase 100 window-manager code which already uses `findNewWindowMatching(pid, baselineWids)` against Chrome processes. ALGORITHM LOCKED: `baselineWids = current xdotool search before CDP createTarget; await Target.createTarget; poll xdotool search --pid <chrome-pid> until exactly one new wid appears (max 5s timeout); use that wid for x11vnc bind`. Encoded into Plan 101-04 Task 2 action verbatim — no 101-01 empirical-test gate required (the algorithm IS the implementation).

2. **Should Chrome survive livinityd restart?** — **RESOLVED:** NO. v1 ships Chrome as livinityd child process. On livinityd restart, all WebApp windows die; user reopens via dock. Trade-off accepted: simpler implementation, fail-closed semantics, easier debugging. Documented as expected behavior in Plan 101-01 acceptance criteria + Plan 101-10 UAT row 17 (close-WebApp lifecycle test covers restart-as-extreme-close).

3. **WM_CLASS detection for arbitrary Electron apps** — **RESOLVED:** Ship "Detect WM_CLASS" button in native-app form (Plan 101-07). UX: user clicks Detect → form launches binary in detached mode → polls `xprop WM_CLASS` against the binary's child windows for 5s → first hit auto-fills the form's `wmClass` field. Falls back to user-supplied string if detection fails. Encoded as Plan 101-07 Task 3.

4. **v3 skill drift recovery** — **RESOLVED:** SKIP drift detection in v3 v1. Also skip `screenshot_before/after` capture (per 100-10-12 Q3 deferral). v3 replay just dispatches recorded actions and trusts them. Drift detection + recovery is Phase 102. Plan 101-08 v3 schema accordingly: `{steps: [{action, instruction, t}]}` — no screenshot fields. Plan 101-08 Task 5 (replay branch) verifies action dispatch only.

5. **Idle-pulse `prefers-reduced-motion` global toggle** — **RESOLVED:** NOT in Phase 101 scope. Honor OS-level `prefers-reduced-motion` only (via Tailwind `motion-reduce:` variant). No LivOS Settings toggle. Plan 101-09 Task 1 acceptance criteria includes a grep test for `motion-reduce:` class usage in the animation classes.

---

## Environment Availability

| Dependency | Required By | Available on Mini PC | Version | Fallback |
|------------|-------------|----------------------|---------|----------|
| `google-chrome` binary | Pillar A | ✓ (verified — existing WebApp spawn path uses it) | (Chrome stable; verify on Mini PC) | None — blocker if missing |
| `xdotool` | Pillar A (wid mapping), Pillar B (native spawn) | ✓ (existing post 100-09-07) | system pkg | wmctrl partial fallback (already coded) |
| `wmctrl` | Pillar B fallback | ✓ | system pkg | xdotool sufficient if wmctrl missing |
| `x11vnc` | Pillar A streaming (existing) | ✓ | system pkg | None — Phase 99 baseline |
| `fluxbox` | Pillar A WM (existing :1) | ✓ | system pkg | None — 100-08 baseline |
| `Xvfb` | display :1 (existing) | ✓ | system pkg | None — 100-08 baseline |
| `node` runtime for chrome-remote-interface | Pillar A | ✓ (livinityd runs tsx) | Node 20+ (livinityd engines) | None — required |
| `chrome-remote-interface` npm package | Pillar A | ✗ (NEW) | install ^0.34.0 | None — install via update.sh's `npm install` |
| `@types/chrome-remote-interface` | TS types | ✗ (NEW) | install ^0.33.0 dev-dep | None |
| `lsof` or `ss` | optional, port-conflict diagnosis | ✓ | system pkg | not load-bearing |
| `xprop` | optional, WM_CLASS detection helper | ✓ | system pkg | manual user-supplied WM_CLASS |

**Missing dependencies with no fallback:** None (chrome-remote-interface installs via existing pnpm/npm pipeline).
**Missing dependencies with fallback:** None.

**Verification at boot:** Plan 101-01 task 0 should run a single Mini PC SSH `command -v google-chrome xdotool wmctrl x11vnc fluxbox` to verify the system is in expected state. If any returns empty, escalate to user (apt install) before proceeding.

---

## Validation Architecture

> `workflow.nyquist_validation` is not explicitly set to `false` in `.planning/config.json` (only `workflow.research/plan_check/verifier` are configured). Per researcher rubric, treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 2.1.9 (livinityd + ui) `[VERIFIED: package.json]` |
| Config file | `livos/packages/livinityd/vitest.config.ts` (existing); `livos/packages/ui/vitest.config.ts` (existing) |
| Quick run command (livinityd) | `cd livos/packages/livinityd && npm test -- <pattern>` |
| Quick run command (ui) | `cd livos/packages/ui && npm test -- <pattern>` |
| Full suite (livinityd) | `cd livos/packages/livinityd && npm test` (testTimeout 180000, maxConcurrency 1, singleThread) |
| Full suite (ui) | `cd livos/packages/ui && npm test` |

### Phase Requirements → Test Map

| Plan | Behavior | Test Type | Automated Command | File Exists? |
|------|----------|-----------|-------------------|--------------|
| 101-01 | Chrome boots and `/json/version` returns 200 | unit (mock spawn + fetch) | `npm test -- chrome-cdp/bootstrap` | ❌ Wave 0 |
| 101-01 | CDP client connect, createWindowForUrl returns {targetId, windowId} | unit (mock CDP) | `npm test -- chrome-cdp/client` | ❌ Wave 0 |
| 101-01 | minimize is a SEPARATE call from bounds-set | unit | `npm test -- chrome-cdp/client` (test name: 'minimize uses windowState only, no bounds combined') | ❌ Wave 0 |
| 101-02 | Port allocator returns 15900-15999, reuses released ports | unit | `npm test -- streaming/port-allocator` | ❌ Wave 0 |
| 101-02 | Port allocator throws when exhausted (100 concurrent) | unit | `npm test -- streaming/port-allocator` | ❌ Wave 0 |
| 101-03 | Native-app config zod validation | unit | `npm test -- apps/native-app-spawner` | ❌ Wave 0 |
| 101-03 | spawnNativeApp polls xdotool for new WID matching WM_CLASS | unit (mock spawn + execFile) | `npm test -- apps/native-app-spawner` | ❌ Wave 0 |
| 101-03 | tRPC `apps.native.{list,create,delete}` round-trip | integration | `npm test -- apps/routes` | (apps/routes.test.ts may exist — extend) |
| 101-04 | window-manager.spawn now calls chromeCdp.createWindowForUrl | unit (mock chromeCdp + streamManager) | `npm test -- webapps/window-manager` | ✓ (extend existing) |
| 101-04 | wid mapping: PID-narrowed xdotool diff returns new wid | unit (mock execFile) | `npm test -- webapps/window-manager` (test: 'maps CDP target to X11 wid via PID diff') | ✓ (extend) |
| 101-05 | native-app-binder spawns x11vnc on allocated port | unit | `npm test -- apps/native-app-binder` | ❌ Wave 0 |
| 101-06 | agent-runs WS start envelope reads activeWid + activeAppMeta | unit | `npm test -- ai/agent-runs` (test: 'injects active window context into prompt') | ✓ (extend) |
| 101-06 | agent-prompt-builder includes active-window snippet ONLY when all fields present | unit | `npm test -- ai/agent-prompt-builder` | ❌ may need NEW file |
| 101-07 | NativeAppForm renders fields + submits tRPC mutation | unit (RTL) | `npm test -- desktop/native-app-form` | ❌ Wave 0 |
| 101-07 | DockItem discriminates webapp vs native and routes click | unit (RTL) | `npm test -- desktop/dock-item` | ✓ (extend) |
| 101-08 | teach-recorder pushClick coordinate translation | unit | `npm test -- window/teach-recorder` | ❌ Wave 0 (port from selfclaude) |
| 101-08 | TeachPopover anchors at click point + Save commits note | unit (RTL) | `npm test -- window/teach-popover` | ❌ Wave 0 |
| 101-08 | v3 schema migration: existing v2 skills still replay | unit | `npm test -- webapps/skills-router` (test: 'lazy translates v2 to v3') | ✓ (extend) |
| 101-09 | floating-action-bar shows thinking-dots when isStreaming && no assistant message yet | unit (RTL) | `npm test -- window/webapp-floating-action-bar` | ✓ (extend) |
| 101-09 | idle-pulse class applied when input empty + unfocused | unit (RTL) | `npm test -- window/webapp-floating-action-bar` | ✓ (extend) |
| 101-09 | agent-runs forwards status_detail chunks to WS | unit | `npm test -- ai/agent-runs` (test: 'forwards status_detail Hermes phrase chunks') | ✓ (extend) |
| 101-10 | Mini PC UAT 20 rows | manual-only | (SSH commands per CONTEXT §Success Criteria) | UAT-CHECKLIST.md NEW |

### Sampling Rate

- **Per task commit:** `npm test -- <subpath>` (the specific file touched). Quick (~10-30s).
- **Per wave merge:** Full `npm test` in livinityd + ui (per-wave green gate). ~3-5 min total.
- **Phase gate:** Full suite green BEFORE `/gsd-verify-work`. Mini PC deploy + 20-row UAT walk.

### Wave 0 Gaps (test files NEW)

- [ ] `livos/packages/livinityd/source/modules/chrome-cdp/bootstrap.test.ts`
- [ ] `livos/packages/livinityd/source/modules/chrome-cdp/client.test.ts`
- [ ] `livos/packages/livinityd/source/modules/streaming/port-allocator.test.ts`
- [ ] `livos/packages/livinityd/source/modules/apps/native-app-spawner.test.ts`
- [ ] `livos/packages/livinityd/source/modules/apps/native-app-binder.test.ts`
- [ ] `livos/packages/ui/src/modules/desktop/native-app-form.test.tsx`
- [ ] `livos/packages/ui/src/modules/window/teach-recorder.test.tsx`
- [ ] `livos/packages/ui/src/modules/window/teach-popover.test.tsx`
- [ ] `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts` (verify if missing — likely needs NEW)

Existing test files to EXTEND (no new framework setup needed):
- `livos/packages/livinityd/source/modules/webapps/window-manager.test.ts` (chromeCdp integration)
- `livos/packages/livinityd/source/modules/webapps/skills-router.test.ts` (v3 schema)
- `livos/packages/livinityd/source/modules/ai/agent-runs.test.ts` (envelope + status_detail relay)
- `livos/packages/ui/src/modules/window/webapp-floating-action-bar.test.tsx` (anims)
- `livos/packages/ui/src/modules/desktop/dock-item.test.tsx` (discriminate webapp/native)

**No framework install required.** vitest 2.1.9 + @testing-library/react (existing) cover all cases.

### Mock Strategies (project-conventional, derived from `window-manager.test.ts` pattern)

| Surface | Mock Pattern | Example |
|---------|-------------|---------|
| `child_process.spawn` | `spawnFactory` opt + FakeChild EventEmitter | Existing in `window-manager.test.ts` — extend for chrome-cdp/bootstrap |
| `fetch` | inject `fetchFn` opt, default to global `fetch` | New pattern in `bootstrap.test.ts` |
| `chrome-remote-interface` (CDP) | Wrap `CDP()` call site behind a single factory `cdpFactory`; inject mock in tests returning a mock client with `Target.*`, `Browser.*` namespaces | New pattern in `client.test.ts` |
| `execFile` (xdotool, xprop) | inject `execFileFn` opt, returns `Promise<{stdout, stderr}>` | New pattern, mirror `input-dispatcher` style |
| Redis (ioredis) | minimal duck-typed `RedisLike` interface (`get`, `set`, `del`, `publish`) — existing pattern in `luse-mcp-config.test.ts` | Reuse |
| StreamManager | inject `streamManager` opt with `startStream/stopStream/addSubscriber/getFanout` mocks | Existing |
| tRPC | testing utilities in `livos/packages/livinityd/source/modules/test-utilities/` (existing) | Reuse |
| React components | @testing-library/react + jsdom (existing project pattern) | Reuse |

### Integration Test Harness

**Pillar A end-to-end (101-04 SUMMARY may include):**
```typescript
// Wires real chrome-remote-interface against a real Chrome binary in CI
// May be too heavy for default test run; gate behind LIVOS_INTEGRATION_TEST=1
describe('chrome-cdp integration (skipped unless env set)', () => {
  it.skipIf(!process.env.LIVOS_INTEGRATION_TEST)('boots Chrome, creates 2 windows, returns 2 distinct windowIds', async () => { /* … */ })
})
```

For UAT (101-10), Mini PC SSH commands per CONTEXT §Success Criteria table.

---

## Project Constraints (from CLAUDE.md)

**CLAUDE.md does NOT exist** at project root (`C:\Users\hello\Desktop\Projects\contabo\livinity-io\CLAUDE.md` returned "File does not exist"). Project-specific guidelines come from:

1. **User memory (MEMORY.md)** — operational constraints (loaded via system context):
   - Server4 / Server5 OFF-LIMITS for LivOS work — Mini PC `bruce@10.69.31.68` only.
   - Subscription-only Claude path; D-NO-BYOK preserved.
   - Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts`. Pre-commit hook enforces. NEVER `--no-verify`.
   - tRPC routes that use mutations must be in `httpOnlyPaths` (common.ts) to avoid WS routing hangs.
   - liv-core dist requires explicit `npm run build --workspace=packages/core` after source changes (runs compiled JS).
   - update.sh's pnpm-store quirk: after deploy, verify `@liv+core*` resolution dir is unique.
   - Detach long Mini PC operations (ZT flap mitigation).
   - Status updates in Turkish during autonomous workflows (code/paths stay English).

2. **`.planning/REQUIREMENTS.md`** — defers v32+ requirement IDs; Phase 101 is user-vision-driven post-v33.

3. **`.planning/STATE.md`** — current Phase 100/100-10 partial-ship status.

All Phase 101 plans MUST honor these constraints. Plans that touch the sacred file or propose Server4 deploys MUST be rejected by plan-checker.

---

## Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| R1 | CDP target → X11 wid mapping race in Pillar A | MEDIUM | HIGH (multi-stream broken) | Plan 101-01 includes empirical Mini PC test; PID-narrowed xdotool diff; 1s timeout with fallback to ALL-wids baseline-diff. |
| R2 | Chrome 130+ subtle CDP behavior change (e.g., newWindow + width/height not honored) | LOW | MEDIUM | Defensive code: always follow `createTarget` with `setWindowBounds` for bounds. Pattern 1 shows this. |
| R3 | Sacred SHA accidentally changed in 101-09 (agent-runs.ts proximity) | LOW | HIGH (blocks commit) | Pre-commit hook + plan-checker grep verify. 101-09 plan explicitly states sdk-agent-runner.ts NOT touched. |
| R4 | Native-app WM_CLASS detection fails for specific app (Antigravity etc.) | MEDIUM | LOW | Manual WM_CLASS field in form + "Detect" affordance + 3s no-match fallback to "newest visible wid". |
| R5 | noVNC canvas listener accidentally calls preventDefault | LOW | HIGH (Teach replay works but live Chrome doesn't see clicks) | Code review checklist + unit test that verifies event.defaultPrevented === false after listener runs. |
| R6 | livinityd restart kills Chrome → all WebApps lose backing windows | HIGH | LOW (UX degradation, no data loss) | Document as expected v1 behavior; UI shows "WebApp closed unexpectedly, click dock icon to reopen." Future fix via setsid if needed. |
| R7 | Hermes phrase relay reveals it's NOT actually emitted by RunStore | MEDIUM | MEDIUM (Pillar F scope grows) | Plan 101-09 task 1 grep verify in liv-core RunStore. If absent, plan adds emit call in liv-agent-runner.ts (non-sacred). |
| R8 | Per-Pillar Luse MCP env LUSE_TARGET_WINDOW_ID still references old (stale) wid after WebApp recycles wid | LOW | MEDIUM | window-manager.close() already updates MCP config via mcpConfigManager.removeServer; spawn() updates. Verify in Plan 101-04 task list. |
| R9 | Mini PC RAM exhaustion at 5+ concurrent WebApps + 2 native (CONTEXT UAT row 20) | LOW | MEDIUM | Per-WebApp footprint: ~150-200MB (Chrome window + x11vnc + Luse MCP child). 7 apps ≈ 1.5GB. Mini PC has 32GB. SAFE. |
| R10 | chrome-remote-interface 0.34.0 breaking API change vs. types 0.33.0 | LOW | LOW | Wrap in our own typed `ChromeCdpClient` surface. If TS errors, downgrade to 0.33.3 (older but stable). |
| R11 | `Browser.setWindowBounds` minimize call fails silently if Chrome window is already minimized at first call | LOW | LOW | Test in 101-01: minimize twice in a row, verify no error. CDP is idempotent. |
| R12 | Active-window context envelope conflicts with existing webappId routing (100-08 + 100-10-10) | LOW | MEDIUM | Plan 101-06 keeps backward compatibility — envelope fields are OPTIONAL; absent = legacy behavior. |

---

## Security Domain

> `security_enforcement` not explicitly disabled in config → treat as enabled. Phase 101 introduces new attack surfaces; threat-model relevant categories.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | All new tRPC routes use existing `protectedProcedure` from `is-authenticated.ts`. JWT chain unchanged. |
| V3 Session Management | yes | Per-user JWT enforcement. Native-apps tied to userId (Redis namespace). |
| V4 Access Control | yes | RBAC via `adminProcedure` for native-app create (admin-only adds native binaries to per-user dock). |
| V5 Input Validation | yes | zod schemas for `NativeAppConfig` (binaryPath, args, env). v3 action_log schema validation server-side. |
| V6 Cryptography | no | No new cryptographic surfaces. CDP socket is localhost-bound (Chrome --remote-debugging-port binds to 127.0.0.1 by default). |
| V7 Error Handling / Logging | yes | Don't log full binaryPath args (may contain secrets like API tokens passed via args). Truncate or redact env values in logs. |
| V8 Data Protection | yes | Redis `liv:apps:native:<id>` values can contain env vars — treat as secret-bearing. Plan 101-03 must specify access control on tRPC read endpoint. |
| V12 Files & Resources | yes | `binaryPath` user-supplied → path traversal risk if used in non-spawn contexts. Validate it exists and is executable; never pass through to shell. |
| V13 API & Web Service | yes | tRPC mutations for native app create/launch must enforce per-user scope (existing pattern). |

### Known Threat Patterns for {Node + Chrome CDP + xdotool stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CDP socket exposed beyond localhost | I (Information Disclosure) | Chrome `--remote-debugging-port=9222` binds to 127.0.0.1 by default (NOT 0.0.0.0). VERIFY no `--remote-debugging-address=0.0.0.0` in argv. |
| Arbitrary binary execution via native-app create | E (Elevation of Privilege) | tRPC route `apps.native.create` MUST be admin-only. zod validates `binaryPath` is absolute (no relative path traversal). Plan 101-03 must specify. |
| Env-var injection via native-app config (e.g., `LD_PRELOAD`) | T (Tampering) | Filter env keys: reject `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*` server-side. Plan 101-03 zod schema must include `.refine(env => !hasDangerousKeys(env))`. |
| WS envelope spoof: malicious activeWid to access other user's window | I + R (Information + Repudiation) | activeWid is user-supplied via WS envelope — server-side validate that the wid belongs to a window OWNED by the requesting userId (cross-reference window-manager.list({userId})). Plan 101-06 task list. |
| Skills v3 step replay with injected `instruction` text → prompt injection | T | When agent reads `instruction` text during drift recovery (Phase 102), treat it as untrusted content. NOT in 101 scope, but flag for Phase 102. |
| Chrome CDP allows arbitrary JS execution (Runtime.evaluate) → if exposed, full browser takeover | E | Chrome CDP localhost-bound + livinityd is the only consumer. No external exposure. Plan 101-01 verifies port 9222 binds 127.0.0.1 only. |
| xdotool injection via WM_CLASS hint user-supplied | T | xdotool args passed as separate execFile args, NOT shell-interpolated. zod schema validates wmClassHint as `[\w-]{1,64}` (alphanumeric + dash, bounded length). |

**Hardening checklist for Phase 101 plans:**
- [ ] tRPC `apps.native.create` requires admin role (verify on Mini PC: 1 user = `bruce` = admin, so single-user gate not load-bearing today but principle preserved).
- [ ] Chrome boot argv MUST NOT include `--remote-debugging-address=0.0.0.0`.
- [ ] zod schema for `NativeAppConfig.binaryPath` enforces absolute path + (optional) allow-list directory regex.
- [ ] zod schema for `NativeAppConfig.env` rejects `LD_*`, `DYLD_*` keys.
- [ ] WS envelope `activeWid` cross-checked against `window-manager.list({userId})` before injection.
- [ ] Logs MUST redact env values when logging native-app spawn (e.g., `env: '[redacted N keys]'`).

---

## Sources

### Primary (HIGH confidence)

- `github.com/utopusc/selfclaude` (Apache 2.0 source) — verified via `gh api repos/utopusc/selfclaude/contents/{src,ui}` + base64-decoded `webapp-manager.js`, `teach-recorder.js`. SelfClaude implementation patterns ARE LivOS's design target.
- `chromedevtools.github.io/devtools-protocol/tot/Target/` — Target.createTarget params + return shape.
- `chromedevtools.github.io/devtools-protocol/tot/Browser/` — Browser.setWindowBounds constraint ("state cannot combine with bounds"), Browser.getWindowForTarget return shape.
- `chromedevtools.github.io/devtools-protocol/tot/Input/` — Input.dispatchMouseEvent is DISPATCH only (no observe surface).
- `github.com/cyrus-and/chrome-remote-interface` README + `npm view chrome-remote-interface` (version 0.34.0, 2026-02-09).
- `developer.chrome.com/blog/remote-debugging-port` — Chrome 136+ requires non-default `--user-data-dir` with `--remote-debugging-port` (satisfied by LivOS argv).
- LivOS codebase (in-tree files cited): `livos/packages/livinityd/source/modules/{webapps,computer-use,apps,streaming}/...`, `livos/packages/ui/src/modules/{window,desktop}/...`. Verified via Read + Grep.

### Secondary (MEDIUM confidence)

- WebSearch results on chrome-remote-interface + Runtime.evaluate (multiple Medium/blog sources — cross-verified with official docs).
- Framer Motion staggered animation pattern guides (cross-verified with in-tree `restore-progress-dialog.tsx`).
- xdotool man page conventions (`--sync`, `--class` matching) — cross-verified with in-tree `input-dispatcher.js` (selfclaude).

### Tertiary (LOW confidence — flagged for plan-checker verification)

- A1, A2, A3 above (Chrome version-specific behaviors). Mitigation: Plan 101-01 includes Mini PC empirical probe.
- A7 (Hermes status_detail emission in RunStore). Mitigation: Plan 101-09 task 1 grep verify before scope-grow.

---

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — chrome-remote-interface 0.34.0 verified live; vitest 2.1.9 verified; lucide 0.288.0 and framer-motion 10.16.4 verified in tree. All other deps already present.
- **Architecture (CDP-driven spawn):** HIGH — CDP Target/Browser domains verified against official spec; SelfClaude verified as comparable architecture (uses different click-capture path but same Chrome multi-window approach with per-profile dirs we explicitly reject).
- **Architecture (Teach v3 via DOM listener):** HIGH — SelfClaude source code verified via gh API; pattern is exactly what CONTEXT calls "SelfClaude action-driven" — just NOT CDP-based. Plans for 101-08 must adjust.
- **Native-app spawn:** MEDIUM — pattern is solid (selfclaude + xdotool conventions) but Electron-specific WM_CLASS detection is empirical per-app. Mitigation in form UX.
- **Chat animations:** HIGH — in-tree pattern verified (`restore-progress-dialog.tsx`).
- **Hermes phrase relay:** MEDIUM — A7 assumption; verify in Plan 101-09 RED.
- **Pitfalls:** HIGH — 8 distinct pitfalls verified against CDP spec + SelfClaude source + in-tree patterns.
- **Security:** HIGH — standard threat models applied; mitigations are project-conventional.

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (30 days for stable Chrome/CDP; chrome-remote-interface 0.34.0 just published 2026-02-09; selfclaude reference is static).

---

## RESEARCH COMPLETE
