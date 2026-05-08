# Phase 95 — UAT Checklist (P95 surface)

**Status:** PENDING — live verification requires Mini PC deploy AND P98
(WebApp window lifecycle hookup) shipping. Until P98 lands, the spawn
mutation returns SERVICE_UNAVAILABLE; the agent panel below remains
functional and the spawn-error banner is exercised end-to-end.

Sections K (window open), L (toolbar), M (mode selector), N (split
persistence) — PASS / FAIL / NOTES per row. Run on the Mini PC after
`bash /opt/livos/update.sh` ships P95.

---

## K. WebApp window open

| # | Item | Result | Notes |
|---|---|---|---|
| K-1 | Click a WebApp icon on the desktop → window opens with `WEBAPP_<id>` appId | | |
| K-2 | Top pane shows "Connecting to stream…" overlay during spawn | | |
| K-3 | After spawn success, VNC canvas renders the host Chrome window | | |
| K-4 | After spawn failure (SERVICE_UNAVAILABLE pre-P98), banner reads "WebApp stream is not yet available on this server. The agent panel below still works." | | EXPECTED until P98 |
| K-5 | "Retry" button on the banner re-fires `webapp.window.spawn` | | |
| K-6 | Resizing the LivOS window auto-fits the VNC canvas (no scrollbars) | | scaleViewport=true |
| K-7 | Closing the window fires `webapp.window.close({webappId})` | | check livinityd log |

## L. Toolbar functions

| # | Item | Result | Notes |
|---|---|---|---|
| L-1 | Back button injects Alt+ArrowLeft to the host Chrome | | D-95-14 |
| L-2 | Forward button injects Alt+ArrowRight | | |
| L-3 | Refresh button injects F5 | | |
| L-4 | Copy URL writes `webapp.url` to clipboard + sonner toast "URL copied" | | D-95-15 |
| L-5 | Fullscreen button calls `requestFullscreen()` on the canvas wrapper | | D-95-05 |
| L-6 | Popout button is rendered DISABLED with "Popout — coming soon" tooltip | | D-95-06 |
| L-7 | URL pill displays the WebApp URL truncated, full string in `title` attribute | | |

## M. Mode selector

| # | Item | Result | Notes |
|---|---|---|---|
| M-1 | Default mode is "Chat" on window open | | D-95-10 |
| M-2 | Clicking Watch / Teach / Auto / Chat changes active highlight | | |
| M-3 | Active button shows surface-base bg + shadow + emoji + label | | |
| M-4 | Teach mode adds `animate-pulse` ring on the active pill | | visual only in P95 |
| M-5 | ArrowLeft/ArrowRight cycle through modes when selector is focused | | |
| M-6 | A `liv-webapp-mode-change` CustomEvent fires with `{webappId, mode}` detail | | DevTools listener |
| M-7 | Composer is DISABLED in watch/teach/auto, ENABLED in chat | | |
| M-8 | Composer placeholder text reflects the mode (P96/P97 stub copy) | | |

## N. Split persistence

| # | Item | Result | Notes |
|---|---|---|---|
| N-1 | Default split is 70/30 (top/bottom) on first open | | D-95-04 fallback |
| N-2 | Drag the handle to ~50/50, close the window, reopen → 50/50 restored | | |
| N-3 | localStorage key shape: `liv:webapp-stream:split:<webappId>` | | DevTools Application tab |
| N-4 | Out-of-range stored value (e.g. `[5, 95]`) → resets to 70/30 on next open | | guard in readPersistedLayout |
| N-5 | Different WebApps have INDEPENDENT split percentages | | per-webapp key |
| N-6 | Handle keyboard-resizable (Tab to focus, ArrowUp/Down) | | a11y from react-resizable-panels |

---

## Carryovers / known gaps for live UAT

- **Live verify blocked on P98** — `webapp.window.spawn` returns
  `SERVICE_UNAVAILABLE` until P98 wires the lifecycle. UAT row K-4 is
  the EXPECTED state until then. Sections K-1..K-3, K-5..K-7, L, M, N
  are all exercisable today against the agent panel + error banner +
  toolbar (toolbar buttons fire even though no host Chrome receives the
  injected keys yet).
- **G-7 deviation** — `useLivAgentStream` source file is missing in tree,
  so this phase wires the agent panel to the legacy `useAgentSocket`
  singleton hook instead. Functional parity for P95 (the panel can
  send/receive on the same WS as the desktop chat surface). When the
  v32 stream surface is restored upstream, swap the inner hook in
  `use-webapp-agent.ts` — no callers need to change.
- **Mode-driven recording / agent control** — out of scope for P95 by
  design (P96/P97 own those). Mode selector is in-memory only; closing
  and reopening the window resets to `chat` per D-95-MODE-LOCAL.
