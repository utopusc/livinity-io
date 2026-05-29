# Phase 250 Research — Professional Terminal UI (xterm.js)

**Produced:** 2026-05-29 by `terminal-ux-research` workflow (7 agents: Warp/Wave/Tabby · VS Code + Windows Terminal · iTerm2/Kitty/Ghostty · xterm.js addon ecosystem · ttyd/Wetty/code-server/Coder · UX & a11y → synthesis).

## UX Direction

Make the existing dark panel read as a deliberately-crafted, IDE-grade terminal rather than a raw xterm embed, keeping the shipped Phase 243 identity (`#0b0b0c` bg, `#e7e7e8` fg, `#7dd3fc` accent). Establish a clear three-tier hierarchy — **tab strip (top) / terminal surface (middle, padded) / thin status bar (bottom)** — and surface every capability through visible affordances with shortcut hints (operator goals: "more professional" + "easier to use / discoverability"). Lean almost entirely on first-party xterm.js options + addons + light React overlays so everything stays client-side and snappy over the relay tunnel. Restraint over decoration: a tuned WCAG-aware palette, a tasteful cursor, smooth scroll, an obvious focus state, honest connection feedback — no flashy animation on the terminal surface, `prefers-reduced-motion` respected on new chrome.

## Recommended Features (with concrete xterm.js / React approach)

### MUST

**1. Find-in-terminal (Ctrl+Shift+F) — `@xterm/addon-search`** · effort M
The single biggest professional-baseline gap; every analog ships it, and the Redis scrollback ring makes searching long output genuinely useful. ~90% official addon, only the find-box chrome is custom.
*Approach:* Add `@xterm/addon-search`; ONE `SearchAddon` per Terminal (per-pane, never module singleton). Set `allowProposedApi:true` (currently missing) + `overviewRulerWidth` so the ruler paints. React overlay (input + prev/next + "N of M" + case/word/regex toggles) anchored top-right of the active pane; Ctrl+Shift+F opens (intercept in `attachCustomKeyEventHandler`, return false), Esc closes + `clearDecorations()`. Drive count off `onDidChangeResults` (handle `resultIndex===-1` as "many matches", `highlightLimit` 1000). Pass `ISearchDecorationOptions` with REQUIRED `matchOverviewRuler` + `activeMatchColorOverviewRuler` strings themed to dark. Debounce incremental search (relay latency). Verify decorations render under the shipped WebGL renderer.

**2. Tuned dark ITheme: full 16-color ANSI + minimumContrastRatio + selection/scrollbar/overview colors** · effort S
Cheapest, most-visible polish lever. Live panel sets only bg/fg/cursor/selectionBackground; the full 16-color ANSI palette only exists in legacy `_shared.tsx` and is NOT applied, so colored output falls back to xterm defaults.
*Approach:* Promote the 16-color ANSI palette from `routes/settings/terminal/_shared.tsx` into the shared `TERMINAL_THEME` (keep brand identity). Add `minimumContrastRatio` (~1.1–4.5), `selectionInactiveBackground`, `scrollbarSliderBackground/Hover/Active`, overviewRuler colors. Pure `ITheme` object, zero deps; set at construction + re-applied live by the settings drawer.

**3. Cursor + scroll + selection ergonomics (options)** · effort S
*Approach:* On the Terminal constructor add `cursorInactiveStyle:'outline'`, `smoothScrollDuration` ~100–125ms, `lineHeight` ~1.1, raise `scrollback` above default 1000 to match the Redis ring, `scrollOnUserInput:true`, `wordSeparator` tuned to include `/` and `.` (double-click selects paths/URLs). Keep `cursorBlink`. No deps.

**4. Font-size zoom (Ctrl/Cmd +/-/0 and Ctrl+wheel) with persistence** · effort S
*Approach:* Bind in `attachCustomKeyEventHandler` (return false to swallow); set `term.options.fontSize` then `fitAddon.fit()` and let the existing ResizeObserver propagate `{type:'resize'}` to the PTY — **CRITICAL: must re-fit or the grid desyncs**. Persist to localStorage (panel already uses a localStorage tab map). Show size in status bar / settings.

**5. Per-tab status DOT + activity glyph + smooth open/close transition** · effort S
Highest polish-per-effort: `ParentTabState.status` ALREADY tracks all four states but `TerminalTabBar` renders them only as a text suffix.
*Approach:* Replace text suffix with a colored dot (amber pulse=connecting, green=live, gray=exited, red=expired). Activity glyph on inactive tabs via `term.onData`/write counter (activity only, NOT exit-code). Subtle active-tab elevation + 120–150ms CSS transition (honor `prefers-reduced-motion`). Do NOT show success/fail (needs shell integration).

**6. Connection status + reconnect-with-scrollback** · effort M
`use-terminal-ws.ts` currently has NO reconnect — `onclose` writes `[disconnected]` and the terminal is dead. #1 amateur tell across ttyd/Wetty/GoTTY.
*Approach:* Extend `useTerminalWs` with bounded exponential backoff (1s→2s→4s→8s cap, ~3 tries then manual Retry), REUSING the session id so the existing `?attach=<id>` reattach + Redis scrollback replay fires (reuse the same Terminal instance — never a second div). Distinguish: 4404 (24h-TTL GC) → "Session expired – start a new one" (existing `onExpired`); transient drop → dim pane + centered "Reconnecting… (n)" chip, flash "Reconnected" on success. Drive status pill off WS `readyState`.

### SHOULD

**7. Thin bottom status bar** (connection pill + cols×rows on resize + user@host/session) · M — React strip below the terminal; fed by WS readyState + resize handler (show "cols × rows" ~300ms then fade) + session id/name; optionally OSC 0/2 title via `onTitleChange`. No CPU/mem/git widgets (need backend feed).

**8. Compact icon toolbar** (New/Search/Clear/Zoom±/Fullscreen/Help + shortcut tooltips) · M — slim icon-only dark toolbar merged with/under `TerminalTabBar`; buttons dispatch existing + new handlers; tooltips include the binding (teaches shortcuts). The "+ New" button folds in.

**9. Settings drawer** (theme/scheme + fontSize/family + cursorStyle/blink + scrollback, applied live) · M — slide-in panel from a gear; ~4–6 curated dark `ITheme` presets (Livinity default + Dracula/Nord/Tokyo Night/Gruvbox as JSON, live preview); apply via `term.options.*`; **after any font/theme change call `fitAddon.fit()`**; persist to localStorage. No multi-profile tree.

**10. WebLinks polish** (hover-underline + Ctrl/Cmd-click + noopener) · S — re-construct `WebLinksAddon` with a handler that opens only on modifier-click via `window.open(uri,'_blank','noopener')`. Already loaded; no new dep.

**11. Keyboard cheat-sheet / help overlay (? or F1)** · S — React modal grouping clipboard (shipped), find, font zoom, tabs, fullscreen, reconnect. Note these are LivOS-terminal bindings, not shell.

**12. Empty-state / first-run hint** · S — dismissible overlay on a fresh session ("running as bruce on <host>" + 2–3 hints); clears on first `onData`; localStorage "seen" flag.

**13. Clear that also wipes the Redis scrollback ring** · S — context-menu Clear currently calls only `term.clear()`, so the reload-surviving ring resurrects "cleared" output. Send a clear-scrollback WS message (small server endpoint to wipe `livos:pty:session:<id>:scrollback`) alongside `term.clear()`. If server change is non-trivial, ship `term.clear()` + a tooltip clarifying scrollback persists, and defer the ring-wipe.

### NICE
- **14. Maximize/zen mode + cols×rows overlay** · S (React/desktop-shell)
- **15. Command palette (Ctrl+Shift+P) of UI actions** · M (hand-rolled, NO cmdk/kbar/fuse — small action set)
- **16. Scroll-to-bottom affordance + "new output below" indicator** · S (`onScroll`/buffer events; only auto-scroll when pinned to bottom)

## Proposed Plan Breakdown

- **250-01** Surface polish: tuned ITheme + ergonomics + WebLinks + cursor/scroll + `allowProposedApi` + window padding/focus ring. *(no new deps; lands first, de-risks renderer/decorations)*
- **250-02** Find-in-terminal: `@xterm/addon-search` + React find box + overview-ruler markers. *(depends on 250-01's `allowProposedApi`)*
- **250-03** Resilience: reconnect-with-scrollback + thin bottom status bar.
- **250-04** Discoverability: icon toolbar + font zoom + cheat-sheet + empty-state + tab status dots (+ zen/maximize if room).
- **250-05** Settings drawer + Clear-wipes-Redis-ring (+ optional command palette stretch). *(depends on 250-04 toolbar gear entry)*

## New Dependencies
- `@xterm/addon-search` (0.1x line, v5.4-compatible — NOT v6). Powers find box AND overview-ruler markers. Requires `allowProposedApi:true` on the Terminal (one-line, no package).
- NO command-palette/fuzzy lib (cmdk/kbar/fuse.js) — hand-roll the small action set.
- `@xterm/addon-unicode11` — OPTIONAL one-line add inside 250-01 only if wide-char (emoji/CJK) smearing is observed in test (`Unicode11Addon` + `unicode.activeVersion='11'`).
- Deferred addons: serialize, clipboard (OSC52), ligatures, image, web-fonts, progress.

## Out of Scope (deferred, with reasons)
- **Split panes** — L effort, most regression-prone (each pane = full extra Terminal + PTY WS + Redis session + TTL GC + fit/focus routing). Dedicated future phase.
- **Warp/Wave command BLOCKS** — need OSC 133/633 shell-integration; xterm.js can't infer command boundaries client-side.
- **Shell-integration decorations** (success/fail gutter dots, prompt jump Ctrl+Up/Down, sticky scroll, exit-code badges, cwd-title, notify-when-done) — need OSC 133 injected into bruce's rc + parsing.
- **Inline autosuggest / ghost text** — fragile vs shell-owned line buffer; deliver via `zsh-autosuggestions` in bruce's rc instead (shell-config task, not UI).
- **Ligatures** (`addon-ligatures`) — documented WebGL rendering artifacts; would force canvas downgrade (lose ~9x perf over relay).
- **Inline images** (`addon-image`, Sixel) — heavyweight, niche for an admin shell.
- **OSC 52 clipboard / serialize-export / progress / web-fonts** — clipboard already works; native font stack makes web-fonts unnecessary.
- **iTerm2-style system widgets** (CPU/mem/git/host) — not derivable from PTY stream; need a metrics backend.
- **Screen-reader mode toggle** — conflicts with the shipped right-click copy/paste menu + per-frame DOM cost on WebGL; later opt-in.
- **First-class mobile/touch** — hard xterm.js ceilings; at most a responsive toolbar collapse later.
- **Multi-user / named launch profiles / Warp Workflows-sharing** — v44 is single-operator.
- **OS-global drop-down quick terminal** — impossible in a browser app (key handlers fire only while the LivOS tab is focused).
