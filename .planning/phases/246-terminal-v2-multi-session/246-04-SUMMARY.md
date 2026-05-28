---
phase: 246
plan: 04
subsystem: livos/packages/ui/src/features/v43-terminal
tags: [terminal, multi-session, ui, xterm, tab-bar, reattach, localstorage, wave-3]
provides:
  - TerminalTabBar component (controlled, rename/close context menu, "+ New")
  - PersistentTerminalPanel multi-tab host (mount-time reattach from localStorage)
  - terminal-session-storage helpers (readAllTabSessions / writeTabSession / removeTabSession)
  - TERMINAL_SESSION_STORAGE_PREFIX = 'livos.v44.terminal.session.' drift-locked constant
  - useNewTabKey() hook — stable per-tab uuidv7
  - buildTerminalWsUrl(mode, sessionId) — exported URL builder
  - 'reattached' variant on ServerToClient union
  - mode + sessionId opts on useTerminalWs (default mode='create' = no query)
requires:
  - WS protocol routes /livos/terminal/ws?create / ?attach=<id> (Phase 246-03)
  - {type:'reattached', sessionId, scrollback} server-side frame (Phase 246-03)
  - 4404 close code for unknown attach id (Phase 246-03)
  - xterm.js + addon-fit + addon-web-links (Phase 243)
  - useTerminalPanelEnabled feature flag gate (Phase 243-02)
  - TerminalRouteShell window-content route swap (Phase 243-03 — UNCHANGED)
  - Dock entry (Phase 243-03 — UNCHANGED)
affects:
  - livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.tsx (major refactor)
  - livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.test.tsx (rewritten for tabs)
  - livos/packages/ui/src/features/v43-terminal/use-terminal-ws.ts (added mode + buildTerminalWsUrl)
  - livos/packages/ui/package.json (added uuidv7 dep)
  - livos/pnpm-lock.yaml (regenerated for new dep)
tech-stack:
  added:
    - uuidv7 (UI side — was previously only in livinityd; version pinned to ^1.2.1 matching livinityd)
  patterns:
    - Display:none tab switching (CSS class toggle, NOT unmount — xterm state preserved)
    - Storage-injection helper signatures (test-time fake Storage, runtime default = window.localStorage)
    - Map<tabKey, sender-fn> Ref for parent→pane close dispatch (avoids per-tab ref prop-drilling)
    - mode-derived URL builder with WHATWG URLSearchParams encoding for sessionId
    - Replay-then-live: scrollback.forEach(term.write) BEFORE the live data forwarder wires up
key-files:
  created:
    - livos/packages/ui/src/features/v43-terminal/terminal-session-storage.ts
    - livos/packages/ui/src/features/v43-terminal/terminal-session-storage.test.ts
    - livos/packages/ui/src/features/v43-terminal/use-terminal-session-id.ts
    - livos/packages/ui/src/features/v43-terminal/TerminalTabBar.tsx
    - livos/packages/ui/src/features/v43-terminal/TerminalTabBar.test.tsx
  modified:
    - livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.tsx
    - livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.test.tsx
    - livos/packages/ui/src/features/v43-terminal/use-terminal-ws.ts
    - livos/packages/ui/package.json
    - livos/pnpm-lock.yaml
decisions:
  - Default WS mode is 'create' with no query — keeps Phase 243 callers byte-compatible AND matches 246-03 default branch (no-query → CREATE)
  - Storage key value is plain string sessionId (not JSON) per CONTEXT — easier to grep / DevTools-inspect
  - readAllTabSessions iterates via storage.key(i) not Object.keys(localStorage) — works correctly with the injected fake Storage stub (Object.keys would only see own-enumerable props)
  - Empty-storage mount → one default tab in CREATE mode (Phase 243 backward-compat — operator's first-ever click on the dock entry feels identical to v43)
  - Tab panes use CSS display:none to hide inactive tabs — preserves xterm scroll/state/WS, matches CONTEXT requirement that switching tabs does NOT tear down inactive WSs
  - On 4404 close BEFORE any ready/reattached AND mode==='attach' → 'expired' status + storage clear. Other close paths (mid-stream close, server-initiated, etc.) leave the entry alone — operator restarts via "+ New"
  - Rename is UI-only in v44 (no server round-trip) — CONTEXT defers named sessions to a future milestone
  - Test #5 measures pane count (DOM) not hook-call count — useTerminalWs is mocked per-render, so call count grows on every re-render; pane count is the stable invariant
metrics:
  duration: 9m
  tasks_completed: 3
  commits: 3
  tests_added: 13  # 3 storage + 5 tabbar + 5 panel (Phase 243's 4 panel tests rewritten — net +9 from Phase 243 baseline)
  files_created: 5
  files_modified: 5
  completed: 2026-05-28
---

# Phase 246 Plan 04: UI tab bar + localStorage reattach Summary

**One-liner:** Grew Phase 243's single-pane xterm panel into a multi-tab host — tab strip + "+ New" + right-click rename/close + localStorage `livos.v44.terminal.session.<tabKey>` map that auto-reattaches every saved tab on mount via `?attach=<sessionId>`, replays scrollback before live data resumes, and quietly drops stale entries on 4404. Empty-storage path opens 1 tab in `create` mode — Phase 243 backward-compat.

## Tasks Executed

| Task | Name                                                                                                | Commit     |
| ---- | --------------------------------------------------------------------------------------------------- | ---------- |
| 1    | terminal-session-storage + use-terminal-session-id + uuidv7 UI dep + 3 storage tests                | `7f59c733` |
| 2    | TerminalTabBar component (rename/close context menu + "+ New") + 5 component tests                  | `febb0e86` |
| 3    | PersistentTerminalPanel multi-tab refactor + use-terminal-ws attach mode + 5 rewritten panel tests  | `f469fa01` |

## Files Created (5)

- `livos/packages/ui/src/features/v43-terminal/terminal-session-storage.ts` — 50 lines (prefix constant + 3 helpers with injectable Storage)
- `livos/packages/ui/src/features/v43-terminal/terminal-session-storage.test.ts` — 60 lines (3 vitest cases + fake Storage factory)
- `livos/packages/ui/src/features/v43-terminal/use-terminal-session-id.ts` — 21 lines (`useNewTabKey()` wrapping uuidv7 in useMemo)
- `livos/packages/ui/src/features/v43-terminal/TerminalTabBar.tsx` — 152 lines (controlled tab strip + rename input + context menu)
- `livos/packages/ui/src/features/v43-terminal/TerminalTabBar.test.tsx` — 188 lines (5 vitest cases via raw createRoot + jsdom)

## Files Modified (5)

- `livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.tsx` — major refactor from single-pane to tab host with TerminalTabPane sub-component (+ 304 / − 130, net 209 lines)
- `livos/packages/ui/src/features/v43-terminal/PersistentTerminalPanel.test.tsx` — rewritten for multi-tab (5 cases, spirit-preserved from Phase 243's 4)
- `livos/packages/ui/src/features/v43-terminal/use-terminal-ws.ts` — added optional `mode` + `sessionId` opts, exported `buildTerminalWsUrl`, added `'reattached'` ServerToClient variant, onClose now receives CloseEvent (+ 33 / − 11)
- `livos/packages/ui/package.json` — added `"uuidv7": "^1.2.1"` in alphabetical position (matches livinityd version)
- `livos/pnpm-lock.yaml` — regenerated for new ui→uuidv7 link

## Drift-Locks

- **Storage prefix exact string:** `TERMINAL_SESSION_STORAGE_PREFIX === 'livos.v44.terminal.session.'` — `grep` returns exactly 1 match in `terminal-session-storage.ts`; test #1 in `terminal-session-storage.test.ts` asserts `toBe('livos.v44.terminal.session.')`. CONTEXT-locked.
- **WS URL builder shape:** `buildTerminalWsUrl('attach', 'sess-X')` returns `<proto>://<host>[:port]/livos/terminal/ws?attach=sess-X`; mode='create' (or default) emits no query. The plan example matches the implementation byte-for-byte.
- **Replay-then-live order:** in PersistentTerminalPanel's `case 'reattached':` branch, `msg.scrollback.forEach((line) => term.write(line))` runs BEFORE any subsequent `case 'data':` writes. Test #3 in `PersistentTerminalPanel.test.tsx` asserts `term.write('hello\\r\\n')` on a single inbound reattached frame — fires synchronously before any data frame.
- **4404 → expired + storage clear:** `onClose: (event) => { ... if (initialMode === 'attach' && !hasReadyArrivedRef.current && event?.code === 4404) onExpired(tabKey) }` — `onExpired` clears storage via `removeTabSession(tabKey)`. Other close paths leave the entry alone.
- **Theme tokens preserved verbatim:** `grep '#0b0b0c\\|#e7e7e8\\|#7dd3fc' TerminalTabBar.tsx` returns 6 matches; PersistentTerminalPanel.tsx uses the same `TERMINAL_THEME` object copied unchanged from Phase 243.
- **Phase 243 dock entry + window-content route UNCHANGED:** `git status --short livos/packages/ui/src/modules/` reports zero modified files; `livos/packages/ui/src/hooks/use-terminal-panel-enabled.ts` also unchanged. Drop-in upgrade — flag gate + route swap still control visibility.
- **D-V44-SACRED preserved:** `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on all 3 plan-04 commits; sacred-sha pre-commit hook fired `[sacred-sha] PASS: 20 files verified` on each.

## Sacred SHA Verify

```bash
$ git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

Preserved across all 3 commits (`7f59c733`, `febb0e86`, `f469fa01`).

## Test Counts

| Module file                              | Cases  | Status |
| ---------------------------------------- | ------ | ------ |
| terminal-session-storage.test.ts (new)   | 3      | GREEN  |
| TerminalTabBar.test.tsx (new)            | 5      | GREEN  |
| PersistentTerminalPanel.test.tsx (rewrite) | 5    | GREEN  |
| **v43-terminal total**                   | **13** | GREEN  |

Net delta vs Phase 243 baseline (4 panel cases): **+9 cases** (3 storage + 5 tabbar + 1 panel — the 4 original panel cases were rewritten for multi-tab; 4 of the 5 new cases preserve the original spirit).

Full vitest run (`pnpm vitest run src/features/v43-terminal/ --reporter verbose`) → 13/13 GREEN in 1.32s.

## Caddy Delta

**NONE.** The `/livos/terminal/ws` path matcher emitted by Phase 226-04 + Phase 237 covers `?attach=<id>` and `?create` query-string variants by RFC 3986 path semantics — same situation as Plan 246-03. UI changes are pure browser-side; no edge config required.

```bash
$ git diff HEAD~3 -- livos/packages/livinityd/source/modules/domain/caddy.ts | wc -l
0
```

## Build Smoke

```bash
$ pnpm --filter ui build
✓ built in 39.31s
```

Vite production build succeeds end-to-end. dist/assets/xterm-c8392d88.js bundles the new multi-tab code (289.69 kB / 72.15 kB gzip — same chunk that already contained xterm.js from Phase 243). Gates 246-06 Mini PC deploy.

## Deviations from Plan

None — plan executed exactly as written, with two small implementation refinements noted as observations (not deviations):

1. **Test #5 measures pane count, not hook-call count.** The plan's `[Rule 1 - Bug]` style fix during execution: an early version of test #5 asserted `capturedHookOpts.length` grew by exactly 1 after the "+ New" click, but `useTerminalWs` is mocked per-render and the existing pane re-renders when state changes (legitimate React behaviour). Switched the assertion to `[data-test-tab-pane]` count (the stable DOM invariant) + check that the LATEST captured opts is `mode:'create'`. Tracked as a test-design refinement — implementation unchanged.

2. **`readAllTabSessions` uses `storage.key(i)` not `Object.keys(localStorage)`.** Plan's `<interfaces>` block shows `Object.keys(localStorage).filter(...)`, but the injectable-Storage stub does not implement the own-property enumeration that `Object.keys` requires. Switched to the `for (i = 0; i < storage.length; i++) storage.key(i)` form that works for both `window.localStorage` AND the test stub. Functionally identical.

Neither affects acceptance — all drift-locks honored, all 13 tests GREEN.

## Success Criteria

- [x] **SC-01:** 13 v43-terminal vitest cases GREEN (3 storage + 5 tabbar + 5 panel)
- [x] **SC-02:** `pnpm tsc --noEmit` zero new errors in features/v43-terminal/
- [x] **SC-03:** `pnpm --filter ui build` succeeds (built in 39.31s, gates 246-06 deploy)
- [x] **SC-04:** localStorage prefix === `livos.v44.terminal.session.` (drift-lock test #1 asserts exact string)
- [x] **SC-05:** WS URL `?attach=<encoded id>` constructed exactly when `mode === 'attach'` AND `sessionId` provided; no query otherwise
- [x] **SC-06:** Phase 243 theme tokens (`#0b0b0c` / `#e7e7e8` / `#7dd3fc`) preserved verbatim
- [x] **SC-07:** Phase 243's dock entry + window-content route UNCHANGED (D-V44 backward compat — `git status` clean for those files)
- [x] **SC-08:** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across all 3 commits

## Threat Surface

The plan's `<threat_model>` covers all 5 v44 threat IDs. Mitigations / acceptances:

- **T-246-04-01 (Spoofing via localStorage tampering) — ACCEPT:** server-side cookie auth + feature flag gate prevent unauthorized attach regardless of sessionId origin. Single-user v44 — no cross-user surface.
- **T-246-04-02 (Tampering via scrollback bytes) — ACCEPT:** scrollback originates from the server-side ring buffer (Phase 246-02), same trust path as live `{type:'data'}`. Identical disposition to T-243-03-03.
- **T-246-04-03 (Elevation via cross-origin localStorage) — MITIGATED:** localStorage is same-origin-only by browser policy. Cross-origin read impossible without an XSS (Phase 243 disposition).
- **T-246-04-04 (DoS via stale entries) — MITIGATED:** 4404 path clears the entry; explicit close clears the entry. Phase 246-05's TTL GC will bound the worst case at 24h idle. Operator can DevTools-clear manually if needed.
- **T-246-04-05 (Info disclosure via session id list) — ACCEPT:** sessionIds are not capability tokens — they require cookie auth to use.

No new threat surface beyond the register — `threat_flag:` entries not needed.

## Self-Check: PASSED

- [x] FOUND: `livos/packages/ui/src/features/v43-terminal/terminal-session-storage.ts`
- [x] FOUND: `livos/packages/ui/src/features/v43-terminal/terminal-session-storage.test.ts`
- [x] FOUND: `livos/packages/ui/src/features/v43-terminal/use-terminal-session-id.ts`
- [x] FOUND: `livos/packages/ui/src/features/v43-terminal/TerminalTabBar.tsx`
- [x] FOUND: `livos/packages/ui/src/features/v43-terminal/TerminalTabBar.test.tsx`
- [x] `TERMINAL_SESSION_STORAGE_PREFIX = 'livos.v44.terminal.session.'` × 1 in storage.ts (exactly 1 — drift-lock)
- [x] `"uuidv7"` × 1 in `livos/packages/ui/package.json` (exactly 1)
- [x] `data-test='terminal-tab-bar'` × 1 in TerminalTabBar.tsx
- [x] `data-test-tab=` × 1 in TerminalTabBar.tsx
- [x] `data-test='terminal-tab-create'` × 1 in TerminalTabBar.tsx
- [x] `data-test-context-menu` × 1 in TerminalTabBar.tsx
- [x] Theme hex values (`#0b0b0c` / `#e7e7e8` / `#7dd3fc`) × 6 in TerminalTabBar.tsx
- [x] `<TerminalTabBar` × 1 in PersistentTerminalPanel.tsx
- [x] `useTerminalWs` × 3 in PersistentTerminalPanel.tsx (≥1 required)
- [x] `readAllTabSessions` × 2 in PersistentTerminalPanel.tsx (import + call — covers ≥1 mount-time read)
- [x] `writeTabSession` × 2 in PersistentTerminalPanel.tsx (import + call — covers ≥1 on ready)
- [x] `removeTabSession` × 4 in PersistentTerminalPanel.tsx (import + 3 callsites: exit / expired / onClose — covers ≥2)
- [x] `case 'reattached':` × 1 in PersistentTerminalPanel.tsx (handler branch — exact match)
- [x] `mode` × 10 in use-terminal-ws.ts (≥2 required: option + branch)
- [x] FOUND commit `7f59c733` (Task 1 storage)
- [x] FOUND commit `febb0e86` (Task 2 tabbar)
- [x] FOUND commit `f469fa01` (Task 3 panel refactor)
- [x] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on all 3 commits (`git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` confirmed)
- [x] `pnpm vitest run src/features/v43-terminal/` → 13/13 GREEN
- [x] `pnpm tsc --noEmit` → zero new errors in features/v43-terminal/ (pre-existing stories/* errors unchanged)
- [x] `pnpm --filter ui build` → ✓ built in 39.31s
- [x] Phase 243 dock entry + window-content route UNCHANGED (`git status --short livos/packages/ui/src/modules/` empty; `livos/packages/ui/src/hooks/use-terminal-panel-enabled.ts` empty)
