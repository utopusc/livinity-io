# Phase 250: Terminal Professional UI — Context

**Gathered:** 2026-05-29
**Status:** Ready for planning
**Mode:** Research-backed (terminal-ux-research workflow, 7 agents, 6 reference surveys + synthesis)

<domain>
## Phase Boundary

Turn the v44 Phase 246 multi-tab terminal from a raw xterm embed into a deliberately-crafted, IDE-grade terminal. Operator goals (verbatim): **"more professional"** + **"easier to use"**.

Five client-side waves:
1. **250-01** Surface/theme polish + ergonomics (no new deps)
2. **250-02** Find-in-terminal (`@xterm/addon-search`)
3. **250-03** Resilient reconnect + bottom status bar
4. **250-04** Discoverability layer (toolbar, font zoom, cheat-sheet, empty-state, tab status dots)
5. **250-05** Live settings drawer + Clear-wipes-Redis-ring + optional command palette

**UX direction:** Three-tier hierarchy — tab strip (top) / terminal surface (middle, padded) / thin status bar (bottom). First-party xterm.js options + addons + light React overlays only; everything client-side, snappy over the relay tunnel. Restraint over decoration; respect `prefers-reduced-motion`. Preserve Phase 243 identity (`#0b0b0c` bg / `#e7e7e8` fg / `#7dd3fc` accent).
</domain>

<decisions>
## Implementation Decisions (LOCKED)

### Build ON, never rebuild
Phase 246 + the 2026-05-29 hot-fixes already shipped these — do NOT re-implement:
multi-session tab bar, WebGL renderer, native font stack, right-click copy/paste menu, Ctrl+Shift+C/V + Cmd+C/V clipboard, cookie-auth WebSocket PTY (runs as `bruce`, non-root), Redis scrollback ring + reload-survive reattach, 24h TTL GC, admin "Active terminals" panel.

### New dependency (only one)
`@xterm/addon-search` — pin the **0.1x line** (v5.4-compatible), NOT the v6 `@xterm/addon-search` (typings for `onDidChangeResults`/`ISearchDecorationOptions` mismatch). Already installed: addon-fit `^0.9.0`, addon-web-links `^0.11.0`, addon-webgl `0.18.0`, xterm `^5.4.0`.

### Prerequisite (250-01 gates 250-02)
Set `allowProposedApi: true` on the Terminal constructor (currently missing in `PersistentTerminalPanel.tsx`) + `overviewRulerWidth` — required before search decorations / overview-ruler markers can paint.

### Per-pane, never module-singleton
SearchAddon (and every addon) is instantiated **per Terminal instance / per tab pane**, matching how the panel already creates fit/webgl per tab.

### Critical correctness rule
After ANY `fontSize` / `fontFamily` / `lineHeight` / `theme` change (zoom, settings drawer), call `fitAddon.fit()` and let the existing ResizeObserver propagate the new cols×rows `{type:'resize'}` to the PTY — otherwise the grid desyncs from the PTY (silent corruption).

### Locked invariants
- **D-V44-SACRED** — `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. All work under `livos/`; `liv/` untouched.
- **D-V44-MINI-PC-ONLY** — deploy target `bruce@10.69.31.68` only; never Server4.

### Claude's discretion
Exact spacing, icon set, tooltip copy, theme-preset selection (Livinity default + ~4 popular dark schemes), animation timings (within `prefers-reduced-motion`).
</decisions>

<code_context>
## Existing Code Insights

- `livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.tsx` — multi-tab host; per-pane xterm (`TerminalTabPane`); `TERMINAL_THEME` currently sets only bg/fg/cursor/selectionBackground (line ~39); Terminal constructor lacks `allowProposedApi`; WebGL + fit + web-links loaded after `term.open()`; right-click ctx menu (Copy/Paste/Select All/Clear — Clear calls only `term.clear()`); `attachCustomKeyEventHandler` already used for clipboard combos (extend here for find/zoom).
- `livos/packages/ui/src/features/v43-terminal/TerminalTabBar.tsx` — renders status as a tiny text suffix; `ParentTabState.status` ALREADY tracks `connecting|live|exited|expired` (just needs a colored dot).
- `livos/packages/ui/src/features/v43-terminal/use-terminal-ws.ts` — NO reconnect today; `onclose` writes `[disconnected]` and the pane is dead. The `?attach=<id>` reattach + Redis scrollback replay path exists (250-03 reuses it).
- `livos/packages/ui/src/routes/settings/terminal/_shared.tsx` — has a full 16-color ANSI palette authored but NOT applied to the live panel (promote it into `TERMINAL_THEME`).
- Server: `livos/packages/livinityd/source/modules/pty-sessions/` (ws-handler, scrollback, session-manager) — 250-05 Clear-ring needs a small WS message + server handler to wipe `livos:pty:session:<id>:scrollback`.
</code_context>

<specifics>
## Recommended Feature Set (from research synthesis — priority order)

**MUST:**
1. Find-in-terminal (Ctrl+Shift+F) — addon-search, highlight-all, "N of M", overview-ruler markers [250-02]
2. Tuned dark ITheme — full 16-color ANSI + minimumContrastRatio + selectionInactiveBackground + scrollbar/overview colors [250-01]
3. Cursor/scroll/selection ergonomics — cursorInactiveStyle, smoothScroll, lineHeight, wordSeparator [250-01]
4. Font-size zoom — Ctrl/Cmd +/-/0 + Ctrl+wheel, re-fit, persist [250-04]
5. Per-tab status dots + activity glyph + transitions [250-04]
6. Reconnect-with-scrollback — bounded backoff, reuse session id, dim + "Reconnecting…" [250-03]

**SHOULD:**
7. Thin bottom status bar — connection pill + cols×rows + user@host/session [250-03]
8. Compact icon toolbar — New/Search/Clear/Zoom±/Fullscreen/Help + shortcut tooltips [250-04]
9. Settings drawer — theme presets + font/cursor/scrollback, applied live [250-05]
10. WebLinks polish — hover-underline + Ctrl/Cmd-click + noopener [250-01]
11. Keyboard cheat-sheet (?/F1) [250-04]
12. Empty-state / first-run hint [250-04]
13. Clear also wipes Redis ring (fixes reload-resurrect) [250-05]

**NICE:**
14. Maximize/zen mode + cols×rows overlay [250-04 if room]
15. Command palette (Ctrl+Shift+P) of UI actions [250-05 stretch]
16. Scroll-to-bottom affordance + "new output below" indicator [optional]
</specifics>

<deferred>
## Deferred Ideas (out of scope — see 250-RESEARCH.md)

Split panes (L effort, regression-prone — dedicated future phase); Warp/Wave command blocks + OSC-133 shell-integration decorations (need shell rc injection); ligatures (WebGL conflict, forces canvas downgrade); inline images / Sixel; OSC-52 clipboard; serialize/export; screen-reader mode (conflicts with right-click menu); first-class mobile/touch; multi-user + named profiles; OS-global drop-down quick terminal (impossible in a browser tab).
</deferred>
