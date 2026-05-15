# Phase 131 — UAT Checklist (Operator Walk)

**UAT TARGET: Mini PC** (`bruce@10.69.31.68`).

> Run `bash /opt/livos/update.sh` on Mini PC first to pull the three
> commits from this phase. Verify `systemctl status livos` is
> `active (running)` after, then hard-refresh `https://bruce.livinity.io`
> (or your tunnel domain) in the browser before starting the walk.
>
> Sacred SHA check before each flow:
>
> ```
> git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts
> # Expect: 100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f
> ```

## Flow A — Drag-to-pin gesture (131-01)

| Step | Action                                                                 | Expected                                                              | PASS / FAIL |
|------|------------------------------------------------------------------------|-----------------------------------------------------------------------|-------------|
| A1   | Open any window (Files / Settings / AI Chat) via the dock.             | Window appears at the center of the screen.                           | ☐ ☐ |
| A2   | Pick up the floating title pill (the rounded capsule above the window) and drag toward the top of the screen. | TopBar expands from 580px → 1180px over ~1400ms with the dashed drop-zone visible in the center. | ☐ ☐ |
| A3   | Hover the cursor over the dashed drop-zone.                            | Drop-zone border highlights (changes from `border-line` to `border-fg`). | ☐ ☐ |
| A4   | Release the mouse INSIDE the drop-zone.                                | Source window shrinks (scale 1→0.1, opacity 1→0) toward the shelf and pointer-events go off. A chip with the window's title + icon appears in the shelf. The bar STAYS expanded. | ☐ ☐ |
| A5   | Drag a second window onto the shelf, release.                          | Second chip appears next to the first; bar still expanded.            | ☐ ☐ |
| A6   | Pick up a third window's title pill, drag, release OUTSIDE the drop-zone (e.g., on the desktop). | Window moves to the release position; NO chip created; bar collapses back to compact (no pinned windows for THIS test case — but Note A5 means the bar might still be expanded due to existing pins; if so, just verify no third chip was added). | ☐ ☐ |
| A7   | Click the first chip in the shelf.                                     | Window springs back to its previous position + size with the reverse animation; chip disappears. | ☐ ☐ |

## Flow B — Refresh-survive persistence (131-02)

| Step | Action                                                                 | Expected                                                              | PASS / FAIL |
|------|------------------------------------------------------------------------|-----------------------------------------------------------------------|-------------|
| B1   | Pin two different windows (Files + AI Chat).                           | Two chips in the shelf.                                               | ☐ ☐ |
| B2   | On Mini PC: `psql $DATABASE_URL -c "SELECT window_id, title FROM pinned_windows"`. | Returns 2 rows with matching window IDs + titles.                     | ☐ ☐ |
| B3   | Hard-refresh the browser tab (Ctrl-Shift-R).                           | Page reloads. Within ~1s of mount, both chips reappear in the TopBar shelf with the same titles and icons. Full-window views do NOT flash. | ☐ ☐ |
| B4   | Click the "Files" chip.                                                | Files window restores via reverse spring; the route is the same as before refresh (e.g., still in the same folder if the path is encoded in route). | ☐ ☐ |
| B5   | Click the "AI Chat" chip.                                              | AI Chat window restores; conversation list / current thread shown.   | ☐ ☐ |
| B6   | Pin 17 windows in total.                                               | Server rejects the 17th with an error toast — "Pin limit reached (16). Unpin a window before pinning another." Postgres still has 16 rows. | ☐ ☐ |

## Flow C — Right-click context menu (131-05 partial)

| Step | Action                                                                 | Expected                                                              | PASS / FAIL |
|------|------------------------------------------------------------------------|-----------------------------------------------------------------------|-------------|
| C1   | Pin a window.                                                          | Chip appears.                                                         | ☐ ☐ |
| C2   | Right-click on the chip.                                               | Radix `ContextMenu` opens with "Restore window" + "Close window" items. Close is styled red. | ☐ ☐ |
| C3   | Click "Restore window".                                                | Window restores via reverse spring (same as left-click).              | ☐ ☐ |
| C4   | Re-pin the same window.                                                | Chip reappears.                                                       | ☐ ☐ |
| C5   | Right-click → "Close window".                                          | Window vanishes entirely (NOT just unpinned — the WindowState is gone). Chip vanishes. | ☐ ☐ |
| C6   | `psql $DATABASE_URL -c "SELECT * FROM pinned_windows"`.                | The Closed window's row is gone. Other pins (if any) are still there. | ☐ ☐ |

## Flow D — Empty-state polish (131-05)

| Step | Action                                                                 | Expected                                                              | PASS / FAIL |
|------|------------------------------------------------------------------------|-----------------------------------------------------------------------|-------------|
| D1   | Unpin all chips so `pinnedWindows.length === 0`.                       | Bar collapses to compact (580px) — brand donut visible.               | ☐ ☐ |
| D2   | Hover the brand donut.                                                 | Bar expands; drop-zone shows the new empty-state: a small pin SVG + "Drag a window here to pin it." | ☐ ☐ |
| D3   | Move cursor off the bar.                                               | Bar collapses again.                                                  | ☐ ☐ |

## Server-side sanity

| Check                                                                  | PASS / FAIL |
|------------------------------------------------------------------------|-------------|
| `journalctl -u livos -n 200` shows no errors related to `pinned_windows`, `pinnedWindows.*`, or `WindowManagerProvider`. | ☐ ☐ |
| `psql $DATABASE_URL -c "\d pinned_windows"` shows the table with all 14 columns + the user_id FK. | ☐ ☐ |
| `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d…`. | ☐ ☐ |
| `journalctl -u livos -n 500 \| grep -i "claude\|broker\|sdk"` shows no broker regression. | ☐ ☐ |

## Known-issue / out-of-scope

- **Tab close survival is "by accident" right now.** When the user
  closes the browser tab, the underlying app sessions stay alive
  because of pre-existing v32/v33 architecture (host Chrome handles,
  hermes runtime). Phase 131-03 will formalize this as a
  PinnedSession registry with explicit GC. Today: if you close the
  tab and re-open in a NEW browser session, the chips reappear (via
  131-02 hydration) and clicking them re-attaches to the live
  session — but if livinityd is restarted between close + re-open,
  the underlying session is gone and the chip restores to a fresh
  state.
- **Hover thumbnail preview** is not yet shipped — chip hover shows
  only the existing `title` tooltip. Coming in 131-05.1 once 131-03's
  snapshot endpoint is ready.
- **Drag-off-unpin** gesture (drag a chip onto the desktop to unpin
  + restore at drop coords) is not yet shipped — use the right-click
  "Restore window" or the whole-chip left-click instead.
- **MCP AI control** of pinned windows is not yet shipped — agents
  cannot list / read / drive pinned windows. Coming in 131-04.

## Verdict

After all PASS / FAIL boxes are filled:

- If **all PASS:** flip `phase_131_status` in STATE.md to `SHIPPED`,
  add the three commit hashes to PROJECT.md's pinned-windows chapter,
  and add `project_phase_131_complete.md` to auto-memory.
- If **any FAIL:** copy the failing row(s) into a new
  `131-UAT-FAILURES.md` and call `/gsd-debug` or open a 131.x hotfix
  plan.

OPERATOR NAME: ________________
OPERATOR DATE: ________________
