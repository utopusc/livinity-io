# Phase 246 — UAT Checklist

**Target:** `https://bruce.livinity.io/` on Mini PC (`bruce@10.69.31.68`)
**Prereq:** Phase 243 single-session terminal flag is ON
- Check: `redis-cli -a "<pw>" GET livos:v43:terminal_panel` → expected `"true"`
**Build expected on Mini PC:** deployed SHA `c72a87d4` (Phase 246-01 → 246-05 + 246-06 docs)
**Sacred SHA invariant:** disk SHA-256 must equal `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe`

---

## How to walk

Open `https://bruce.livinity.io/` in Chrome. Sign in if needed. Then walk each item below in order. Tick `[x]` only on full PASS. On partial / uncertain — leave `[ ]` with a note. On FAIL — leave `[ ]`, paste the diagnostic, and file an issue against Phase 246 (link the relevant `246-0X-SUMMARY.md` Source row).

---

## Steps

- [ ] **UAT-1 (single-tab default — backward compat):** Click the Terminal dock entry. Expected: exactly **1 tab** labeled `terminal-1`, prompt `bruce@bruce-EQ:~$` visible within ~2s. Verifies Plan 246-04 default-single-tab + Plan 243 backward-compat boot.

- [ ] **UAT-2 (multi-tab create):** Click the "+ New" button on the tab strip. Expected: a 2nd tab `terminal-2` opens with its own prompt. Type `whoami` in tab 1 (expect `bruce`); switch to tab 2; type `pwd` (expect `/home/bruce`). Tab outputs must be independent (two distinct PTYs — confirms Plan 246-01 SessionManager isolation).

- [ ] **UAT-3 (browser-local rename):** Right-click tab 2 → Rename → type `build-watch` → press Enter. Expected: tab label updates immediately; persists across tab switches inside the same browser session. (Rename is browser-local in v44 — does NOT survive reload; see "Known v44 Limitations" below.)

- [ ] **UAT-4 (reload survives — reattach):** Press F5 (browser hard reload). Expected: both tabs reappear with their previous scrollback replayed (the WS frame is `{type:"reattached", sessionId:"...", scrollback:[...]}` — verifies Plan 246-02 ring buffer + Plan 246-03 attach protocol + Plan 246-04 localStorage tab restore). Acceptable: tab 2 label reverts from `build-watch` to `terminal-2` (rename is browser-local in v44, documented below).

- [ ] **UAT-5 (admin panel — list):** Open Settings (dock entry → Settings) → System → "Active terminals" section. Expected: a card-like panel listing **2 rows**, one per session. Each row shows: short session-id, `createdAt` timestamp, `lastAttachAt` timestamp, Kill button. Verifies Plan 246-05 ActiveTerminalsPanel + Plan 246-03 `ptySessions.listSessions` adminProcedure. (Panel auto-refreshes every 5s while the v43 flag is ON; pauses when OFF.)

- [ ] **UAT-6 (admin kill — propagates):** Click Kill on the `terminal-1` row in the admin panel. Expected within ~1s:
  1. The row disappears from the admin panel (refetch fires post-mutation).
  2. The `terminal-1` tab in the terminal window shows `[session exited code=...]` or similar PTY-close indicator.
  3. F5 reload removes the expired tab from the strip — the localStorage entry for that tab is cleared on 4404 reattach attempt (verifies Plan 246-04 stale-entry cleanup).

- [ ] **UAT-7 (close button — local lifecycle):** Right-click the remaining tab (`terminal-2` or `build-watch`) → Close. Expected:
  1. Tab disappears from the strip.
  2. Settings → Active terminals refreshes to show 0 rows (or the panel-empty placeholder).
  3. DevTools → Application → Local Storage → `livos.v44.terminal.session.*` keys cleared. Verifies Plan 246-04 close → ws.close → server-side `ws.close → no-kill` semantic. Note: PTY itself remains alive on the server until 24h idle GC fires (this is the deliberate semantic break documented in Plan 246-03 — re-open should reattach).

  *(Cross-check, optional)* `redis-cli HGETALL livos:pty:session:<id>` still returns metadata; HGETALL after 24h or manual `lastAttachAt` rewind triggers the next sweep to kill it (verifies Plan 246-05 TTL GC).

---

## Optional probes (operator at-leisure)

- [ ] **OPT-1 (24h GC manual fast-forward):** Rewind a session's `lastAttachAt` directly in Redis so the next sweep kills it:
  ```bash
  redis-cli -a "<pw>" HSET livos:pty:session:<id> lastAttachAt 2026-04-01T00:00:00Z
  # wait up to 1h for the next ttl-gc sweep (or restart livos to trigger immediate scan)
  journalctl -u livos.service --since "1 hour ago" | grep "ttl-gc: killed idle session"
  ```
  Expected: a `ttl-gc: killed idle session {id ...}` line appears; the metadata key is gone after. Verifies Plan 246-05 TTL GC sweepNow path end-to-end on real PTYs.

- [ ] **OPT-2 (rollback rehearsal):** Flip the v43 flag OFF for 30s:
  ```bash
  redis-cli -a "<pw>" SET livos:v43:terminal_panel false
  # confirm in the UI: dock entry hidden + admin "Active terminals" panel hidden
  redis-cli -a "<pw>" SET livos:v43:terminal_panel true
  ```
  Expected: both the Terminal dock entry AND the Settings → Active terminals panel vanish/return atomically. Verifies D-243-FLAG-ROLLBACK preserved through v44.

---

## Known v44 Limitations (documented for operator clarity)

- **Rename is browser-local.** Tab renames live in localStorage; server-side has no rename field. F5 reload → renamed label reverts to the auto-generated `terminal-N` name. Server-side rename is a v45+ enhancement.
- **PTY survives tab close.** Closing a tab calls `ws.close()` only — the server-side PTY keeps running and only dies on (a) explicit admin Kill, (b) 24h idle GC, or (c) livinityd restart. This is the deliberate semantic break introduced by Plan 246-03 to enable reattach; the trade-off is more PTYs alive at idle than the v43 single-session model. The 24h GC bounds the worst case.
- **Single user only.** Per-user session scoping deferred to v45 multi-user. v44 assumes single bruce-shell user. Admin panel surface lists all sessions regardless of which browser opened them.
- **Idle GC is timer-driven.** The 1h sweep / 24h idle threshold is implemented via `setInterval` in livinityd. To fast-forward in testing, OPT-1 above shows the Redis rewind trick.
- **rename label drift on multi-window.** Opening the same session in a second browser tab in the same browser will pick up the localStorage rename; opening it in a different browser will show the default `terminal-N` label.

---

## Source references per UAT item

| UAT # | Source plan | Drift-lock |
|---|---|---|
| UAT-1 | `246-04-SUMMARY.md` (PersistentTerminalPanel default-1-tab) + `243-SUMMARY.md` (dock entry gate) | tab strip rendered when sessions.length >= 1 |
| UAT-2 | `246-01-SUMMARY.md` (SessionManager) + `246-04-SUMMARY.md` (TerminalTabBar +New) | SessionManager.create() returns distinct PtySession instances |
| UAT-3 | `246-04-SUMMARY.md` (TerminalTabBar rename) | rename test in `TerminalTabBar.test.tsx` |
| UAT-4 | `246-02-SUMMARY.md` (scrollback ring) + `246-03-SUMMARY.md` (`?attach=` route) + `246-04-SUMMARY.md` (localStorage tab restore) | `SCROLLBACK_MAX_LINES = 10000`, `TERMINAL_SESSION_STORAGE_PREFIX` |
| UAT-5 | `246-05-SUMMARY.md` (ActiveTerminalsPanel) + `246-03-SUMMARY.md` (`listSessions` admin tRPC) | `[data-testid^="session-row-"]` rows for each entry |
| UAT-6 | `246-05-SUMMARY.md` (kill button) + `246-03-SUMMARY.md` (`killSession` admin tRPC) | `[data-testid="kill-button-<id>"]` invokes `mutate({id})` |
| UAT-7 | `246-04-SUMMARY.md` (close button + localStorage cleanup) + `246-03-SUMMARY.md` (ws.close → no-kill semantic) | localStorage prefix cleanup on 4404 attach reject |

---

## Progress tracking

- **Total items:** 7 mandatory + 2 optional = 9
- **Passed:** 0
- **Pending:** 7
- **Failed:** 0
- **Status:** `pending` → flips to `complete` once all mandatory `[x]` ticked.

When all mandatory items PASS, append a closing note like:

```
## Closed
- Date: <YYYY-MM-DD>
- Operator: <name>
- Notes: <any observations, especially around rename-revert (UAT-3 → UAT-4) or PTY-survives-close behavior (UAT-7)>
```
