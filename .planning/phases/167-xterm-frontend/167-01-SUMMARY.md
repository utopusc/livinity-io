---
phase: 167
plan: 167-01
subsystem: ui/cc-terminal
status: code-complete
date-completed: 2026-05-19
files:
  created:
    - livos/packages/ui/src/features/cc-terminal/CcTerminal.tsx
    - livos/packages/ui/src/features/cc-terminal/CcTerminal.test.tsx
    - livos/packages/ui/src/features/cc-terminal/index.ts
  modified: []
acceptance:
  vitest: "11/11 passed (CcTerminal.test.tsx) — 8 behavior + 3 source-text invariants"
  tsc: "no errors in CcTerminal.tsx"
  grep-invariants:
    - "term.dispose() in cleanup — present"
    - "ws.detach() in cleanup — present"
    - "ro.disconnect() in cleanup — present"
    - "@xterm/xterm + @xterm/addon-fit + xterm.css imports — present"
    - "/ws/cc-pty path — present"
sacred-guards-verified:
  - "liv/packages/core/src/sdk-agent-runner.ts — NOT touched"
  - "D-09 luse-system-prompt.ts — NOT touched"
  - "Phase 161-02 agent-prompt-builder.ts — NOT touched"
  - "Phase 162-01 vault-scaffolder.ts — NOT touched"
  - "Phase 162-02 agent-session.ts — NOT touched"
  - "Phase 163 ws-agent.ts — NOT touched (CLIENT side of /ws/cc-pty only)"
  - "Phase 164 autonomous-scheduler — NOT touched"
  - "Phase 165-01 claude-runner/idle-reaper.ts — NOT touched"
  - "Phase 166 server-side cc-pty/* — NOT touched"
  - "D-NEW-DEPS-v35: package.json unchanged — no new deps"
---

# Phase 167 Plan 167-01: CcTerminal Component Summary

`<CcTerminal sessionId={id} />` ships — xterm.js terminal mounted in a DOM container, FitAddon wired for fit-on-resize, ResizeObserver propagating dimensions to the server PTY via Plan 167-02's CcPtyWsClient, theme-reactive without remount, and clean lifecycle teardown.

## Summary

Built the React component that the AI Chat dock window will render. The component:

- Mounts an xterm.js Terminal into a `<div ref={containerRef}>` on `sessionId`-keyed mount.
- Loads `FitAddon` only (see Deviation #1 below — `addon-web-links` and `addon-canvas` are not in lockfile, dropping them avoids a package.json change).
- Constructs the Plan 167-02 `CcPtyWsClient` with `url = ws[s]://host/ws/cc-pty`, the prop `sessionId`, and stdout/attached/error callbacks. Stdout writes through `term.write(data)`; errors render as a red `[error] msg` line in the terminal.
- Wires `term.onData` → `ws.sendStdin` so every user keystroke flows to the server PTY.
- Observes container size with a `ResizeObserver` whose callback calls `fit.fit()` then `ws.sendResize(term.cols, term.rows)`.
- Cleanup order on unmount or `sessionId` change: `ro.disconnect()` → `ws.detach()` → `term.dispose()`.
- Theme-reactive: a SEPARATE `useEffect` keyed on `resolvedTheme` reassigns `term.options.theme` (no remount of the Terminal instance). Plan 167-03 will replace the inline stub palette with the canonical 16-color palette.

`index.ts` barrel re-exports `CcTerminal`, `CcPtyWsClient`, and `AttachedEnvelope`.

## Acceptance Evidence

- **vitest**: `pnpm --filter ui exec vitest run src/features/cc-terminal/CcTerminal.test.tsx` → **11/11 passed** (8 behavior + 3 source-text invariants).
- **vitest (cumulative)**: `pnpm --filter ui exec vitest run src/features/cc-terminal/` → **24/24 passed** (11 CcTerminal + 13 ws-client).
- **tsc**: `pnpm --filter ui exec tsc --noEmit` → no errors for `CcTerminal.tsx`.
- **Source-text invariants** (in-test): term.dispose() + ws.detach() + ro.disconnect() in cleanup; xterm imports present; `/ws/cc-pty` literal present.
- **package.json**: unchanged (verified by absence from git status).

## Test Strategy Notes

Followed the codebase's **RTL-absent pattern (D-NO-NEW-DEPS)**. The 8 behavior tests use `react-dom/client`'s `createRoot` + `act()` directly. `@xterm/xterm`, `@xterm/addon-fit`, `./terminal-ws-client`, and `@/hooks/use-theme` are all `vi.mock`'d; `ResizeObserver` is replaced on `globalThis`. Source-text invariants lock the cleanup contract via `readFileSync` + regex.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@xterm/addon-web-links` + `@xterm/addon-canvas` not in lockfile — addons dropped**

- **Found during:** Task 1 (read of `livos/pnpm-lock.yaml`)
- **Issue:** Plan 167-CONTEXT.md and 167-01 PLAN.md claim "@xterm/* refs in pnpm-lock already present (pre-flight verified) — no new dep". Reality: `livos/pnpm-lock.yaml` only contains `@xterm/xterm@5.5.0` and `@xterm/addon-fit@0.9.0`. The `addon-web-links` and `addon-canvas` packages are NOT in the lockfile. Adding them would require `pnpm add` → `package.json` change → violation of D-NEW-DEPS-v35 ("package.json MUST NOT change in any Phase 167 commit").
- **Fix:** CcTerminal loads only `FitAddon`. The terminal still functions: links render as plain ANSI text (not clickable) and the default DOM renderer replaces the canvas renderer (slightly slower for high-throughput stdout but functionally identical). Phase 168+ can authorize the deps if needed.
- **Test impact:** Updated Test 4 to expect `loadAddon` called exactly 1 time (was: 3 in the original plan). Source-comment in CcTerminal.tsx documents the trim.
- **Files modified:** CcTerminal.tsx + CcTerminal.test.tsx only. No package.json change.

**2. [Rule 3 - Adaptation] `useTheme()` returns `{theme, resolvedTheme, setTheme}` — not a `LivosTheme` with `colorScheme`**

- **Found during:** Task 1 (read of `@/providers/theme-provider`)
- **Issue:** Plan 167-CONTEXT.md describes `useTheme(): LivosTheme` with a `colorScheme: 'dark' | 'light'` field. Reality: the existing hook (`livos/packages/ui/src/hooks/use-theme.ts`) returns `ThemeProviderState = {theme: Theme, resolvedTheme: ResolvedTheme, setTheme}` where `ResolvedTheme = 'light' | 'dark' | 'iridescent'` (Phase 120-01 adds iridescent).
- **Fix:** CcTerminal destructures `{resolvedTheme}` and passes it to the theme function. The stub treats both `'dark'` and `'iridescent'` as dark-palette inputs (white-on-black) so the iridescent theme doesn't visually break. Plan 167-03 will harden this in the canonical `terminal-theme.ts`.
- **Files modified:** CcTerminal.tsx only.

## Notes

- The plan's `(_env)` parameter naming convention is preserved to silence `no-unused-vars` until Phase 168 wires session metadata into the sidebar.
- `eslint-disable-next-line react-hooks/exhaustive-deps` is added on the `sessionId`-keyed effect to exclude `resolvedTheme` from the dep array — the theme-keyed effect updates `term.options.theme` separately, so including `resolvedTheme` would force a remount on every theme change.
- Self-Check passed: 3 files created, vitest green, tsc clean, no package.json delta.

## Self-Check: PASSED

- `CcTerminal.tsx` exists, exports `CcTerminal`
- `CcTerminal.test.tsx` exists, 11/11 tests pass
- `index.ts` re-exports CcTerminal, CcPtyWsClient, AttachedEnvelope
- No package.json change
- Previous commit (74b608ef Plan 167-02) preserved
