# Phase 181: Mobile CC PTY — tablet terminal + phone bubble

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Source:** Master plan § Phase 181 + Mobile research Topic 1, D-V38-J/L
**Wave:** 5 (parallel with 176 — depends 175)

<domain>
## Phase Boundary

Replace `/chat-mobile` legacy SDK fallback with Claude Code everywhere. Tablet → full `<CcTerminal>` + virtual key bar + touch gestures. Phone → CC-backed bubble UI streaming `/ws/cc-pty`.

**Phase 181 sonu:**
- `/chat-mobile` route detects device class:
  - **Tablet** (`viewport ≥ 640px` AND `pointer:coarse`) → `<CcTerminal>` + `<MobileTerminalKeyBar>` (2-row sticky-Ctrl)
  - **Phone** (`viewport < 640px`) → `<MobileBubbleChat>` streaming CC PTY output as bubbles
- Touch gestures: pinch-zoom font (10-22pt, persisted to localStorage), two-finger paste, three-finger swipe-down detach, long-press select
- WS resilience: `visibilitychange` reconnect bypass, heartbeat ping/pong (30s/10s), `tmux capture-pane -e -p -S -2000` replay on attach
- Legacy SDK chat panel + `legacy-ai-chat-panel.tsx` DELETED post-181 (no more SDK fallback anywhere)
- "Force terminal mode" Settings toggle (Phase 182 wires it) for power users on phones with Bluetooth keyboards
</domain>

<decisions>

### Plan 181-01: Device class detection + route branching
- MOD `routes/chat-mobile/index.tsx` — replace `<LegacyAiChatPanel>` mount with branching logic
- NEW `hooks/useDeviceClass.ts` — combines `useIsMobile()` + viewport + `pointer:coarse` matchMedia → `'phone'|'tablet'|'desktop'`
- Acceptance: 6 vitest assertions — correct device class per viewport+pointer combo

### Plan 181-02: MobileTerminalKeyBar (tablet)
- NEW `features/mobile-terminal/MobileTerminalKeyBar.tsx` — 2-row sticky bar above soft keyboard
- Row 1: ESC TAB CTRL / | " ' - ↑
- Row 2: ⌘ ← ↓ → PGUP PGDN HOME END ⏎
- Sticky-Ctrl modifier (tap latch, next key gets Ctrl+, auto-release; long-press = lock)
- Acceptance: 12 vitest assertions — each key sends correct escape sequence, sticky Ctrl behavior, lock-on long-press

### Plan 181-03: Touch gestures
- MOD `features/cc-terminal/CcTerminal.tsx` (additive) — gesture handlers (pinch-zoom, two-finger paste, three-finger detach, long-press select)
- localStorage persistence of fontSize
- `overscroll-behavior: contain; touch-action: pan-y` on container
- Acceptance: 10 vitest assertions

### Plan 181-04: WS resilience + buffer replay + phone bubble UI + cleanup
- MOD `terminal-ws-client.ts` — `visibilitychange` listener forces reconnect on unlock; heartbeat ping/pong (30s/10s); reconnect bypass
- MOD `livinityd/source/modules/cc-pty/ws-handler.ts` — heartbeat pong handler (additive)
- MOD `cc-pty/manager.ts` — on attach, send `tmux capture-pane -e -p -S -2000` snapshot to client first
- NEW `features/mobile-terminal/MobileBubbleChat.tsx` — single textarea + send; streams `/ws/cc-pty` stdout into chat bubbles
- DELETE `routes/ai-chat/legacy-ai-chat-panel.tsx` + tests
- Acceptance: 14 vitest assertions covering all four
</decisions>

<canonical_refs>
- Mobile research output § Topic 1 (Termux + Blink reference patterns)
- `features/cc-terminal/{CcTerminal, terminal-ws-client}.tsx` (substrate)
- `features/cc-terminal/MobileTerminalKeyBar` — NEW
- Phase 167-04 `legacy-ai-chat-panel.tsx` (being deleted)
- xterm.js mobile issues #1101, #1301, #3727, #5377 (known gaps we work around)
</canonical_refs>

<specifics>

| Plan | Files |
|------|-------|
| 181-01 | MOD routes/chat-mobile/index.tsx; NEW hooks/useDeviceClass.ts + test |
| 181-02 | NEW features/mobile-terminal/MobileTerminalKeyBar.tsx + test |
| 181-03 | MOD features/cc-terminal/CcTerminal.tsx (gesture hooks); test |
| 181-04 | MOD terminal-ws-client.ts (heartbeat); MOD ws-handler.ts (pong); MOD manager.ts (capture-pane); NEW MobileBubbleChat.tsx + test; DELETE legacy-ai-chat-panel.tsx |

**Sacred guards:** Phase 167 CcTerminal.tsx + terminal-ws-client.ts MODIFIED ADDITIVELY only — existing 31 vitest assertions stay green. New mobile features layered on top.

</specifics>

<deferred>
- Native mobile app (iOS/Android wrappers) → v40+
- Voice input on mobile → v38.1
- Push notifications for inbox → v39
</deferred>

---

*Phase: 181-mobile-cc-pty*
*Wave: 5 (parallel with 176 — depends 175)*
*Depends on: Phase 175*
*Estimated: ~3 days agent work*
