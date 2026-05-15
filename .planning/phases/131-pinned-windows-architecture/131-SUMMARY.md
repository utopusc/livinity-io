# Phase 131 — Pinned-Windows Architecture (Master Summary)

> **Status (2026-05-15):** PARTIAL-SHIPPED-PENDING-UAT.
> Core user-visible flow ships in three atomic commits; deeper
> background-runtime + MCP-control work is deferred for an
> operator-validated session.
>
> Sacred SHA invariant preserved across every commit:
> `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
> `liv/packages/core/src/sdk-agent-runner.ts`.
>
> PHASE_131_SHIPPED — for the three sub-plans below, code-complete
> with no new tsc errors against the 130-09 baseline (586). Full
> "shipped including UAT" status requires the operator walk in
> 131-06.

## What user can actually do today (post-ship)

1. Pick up any open window by its title pill.
2. Drag onto the TopBar shelf — bar expands, drop-zone highlights.
3. Release inside the drop-zone — window shrinks via the 130-09
   spring, a chip with the window's title appears in the shelf.
4. Bar stays expanded as long as there's at least one pin.
5. Hard-refresh the browser tab — pinned chips reappear with their
   titles + icons.
6. Click a chip to restore — window springs back to its previous
   position/size.
7. Right-click a chip → "Restore window" / "Close window" context
   menu.
8. "Close window" drops the window entirely AND removes the Postgres
   row (no orphan pins).
9. Drop limit enforced server-side at 16 pins per user (D-131-F hard cap).

## Locked architectural decisions

Per [131-DECISIONS.md](131-DECISIONS.md), user-accepted defaults
2026-05-15 via `/gsd-autonomous` flow:

| #       | Decision                              | Locked value |
|---------|---------------------------------------|--------------|
| D-131-A | Storage backend                       | Postgres `pinned_windows` table |
| D-131-B | Background runtime host               | livinityd (NOT Service Worker) |
| D-131-C | Session contract granularity          | per-app (NOT generic JSON blob) |
| D-131-D | AI-control API surface                | MCP tools (NOT tRPC) |
| D-131-E | Pin durability tiers                  | (a) Plan 131-02 ✓ / (b) Plan 131-03 / (c) future v37 |
| D-131-F | Pin limit per user                    | soft 8, hard 16 (server-enforced) |
| D-131-G | Unpin behavior                        | restore-to-previous-position |

## Sub-plan status

### 131-01 — Drag-to-pin bug fix ✅ SHIPPED

Commit `b3b049ad` — `fix(131/topbar): drag-to-pin gesture lands on shelf`.

- **Root cause:** TopBar was rendered outside `<WindowManagerProvider>`
  in `router.tsx`, so `useWindowManagerOptional()` returned `null` and
  every `windowManager?.pinWindowToTopBar(...)` call silently
  no-op'd. Sub-bug: drop-zone shelf collapsed instantly on drag-end,
  unmounting the AnimatePresence-wrapped chip before the user could
  see it.
- **Fix:** Move `<TopBar />` inside `<WindowManagerProvider>` +
  extend `isExpanded` to stay true when `pinnedWindows.length > 0`.
  See `131-01-SUMMARY.md`.

### 131-02 — Persistence tier-a ✅ SHIPPED

Commit `167b42ba` — `feat(131/persistence): pinned-windows survive page refresh (tier a)`.

- New `pinned_windows` Postgres table (D-131-A). FK to `users(id)`
  ON DELETE CASCADE. Primary key `(user_id, window_id)` for natural
  upsert.
- New tRPC namespace `pinnedWindows.{list, upsert, delete}` via
  `privateProcedure` (auth-gated). All three paths added to
  `httpOnlyPaths` so mutations survive `systemctl restart livos`.
- `WindowManagerProvider` hydrates on mount via `.list` query,
  dispatches `OPEN_WINDOW` with `isPinnedToTopBar: true` so windows
  mount directly as chips (no flash of full window).
- `pinWindowToTopBar` / `unpinWindowFromTopBar` mirror the local
  dispatch to the backend via `.upsert` / `.delete`.
- Server-side D-131-F hard cap (16) enforced in `upsertPinnedWindow`.

See `131-02-SUMMARY.md` for the full schema + API + UI hydration
flow + Mini PC deployment notes.

### 131-03 — Background session runtime ⏸ DEFERRED

Per-app session hosts (WebApp Chrome handle, AI Chat hermes
re-attach, Files watcher persistence) + WebSocket reconnect
protocol + 24h GC. The plan is explicitly `autonomous: false` per
its own frontmatter:

> "This plan is `autonomous: false` because the per-app session
> contracts need an operator's eye to verify they don't leak Chrome
> processes / hermes threads / file watchers on Mini PC."

Carries forward to the next operator-walked session. The plan at
`131-03-PLAN.md` (236 lines, 4 tasks) is ready to execute once an
operator can monitor Mini PC during the walk.

**Practical effect of deferring:** under the current ship, when the
user closes the browser tab, the underlying app sessions:
- **WebApp** keeps its Chrome handle alive (livinityd's host-Chrome
  already manages it as a persistent process — pre-existing v33
  architecture).
- **AI Chat** keeps its hermes session alive (pre-existing v32
  architecture).
- **Files** is mostly stateless (next mount re-syncs).

So the user-visible "tab close survives" promise IS effectively met
by pre-existing livinityd patterns, just not formalized into a
PinnedSession registry yet. 131-03 adds the registry + explicit GC
sweep + heartbeat so the system doesn't accumulate orphan state.

### 131-04 — MCP AI control ⏸ DEFERRED

Depends on 131-03. New `livos-pinned-windows` MCP server with
`list / read / send-input / wait-for` tools, per-window allowlist +
rate-limit + audit log. The plan at `131-04-PLAN.md` (123 lines) is
ready.

### 131-05 — Shelf UX polish ✅ PARTIAL SHIPPED

Commit `559ee89f` — `feat(131/shelf): right-click context menu + empty-state polish`.

Shipped:
- Right-click `ContextMenu` on each chip with Restore / Close items.
- "Close window" (red destructive variant) unpins then closes — the
  order matters so 131-02's Postgres mirror tears the row down
  before the WindowState evaporates.
- Empty-state copy upgrade: pin SVG + "Drag a window here to pin it."

Deferred to **131-05.1** (carry-forward):
- Hover thumbnail preview — blocked on 131-03's
  `pinnedSessions.snapshot` endpoint.
- Drag-off-unpin gesture — feasible standalone (~40 lines of
  framer-motion drag state); deferred for scope clarity.
- Drag-within-shelf reorder — needs `pinnedWindows.reorder`
  mutation (backend column exists but procedure not added).
- 30s thumbnail refresh polling — same blocker as hover preview.

See `131-05-SUMMARY.md`.

### 131-06 — UAT walk + docs ⏸ OPERATOR STEP

`131-UAT-CHECKLIST.md` shipped in this commit with PASS/FAIL boxes
for the three flows that ARE ready to walk. Operator runs
`bash /opt/livos/update.sh` on Mini PC, walks the checklist, then
flips Phase 131 to `SHIPPED` in STATE.md.

PROJECT.md chapter update + auto-memory snapshot follow operator
walk completion — drafted in `project_phase_131_partial_state.md`
auto-memory entry pre-commit.

## Files modified (cumulative across 131-01, 131-02, 131-05)

UI:
- `livos/packages/ui/src/router.tsx` — `<TopBar />` moved into provider.
- `livos/packages/ui/src/modules/desktop/top-bar.tsx` — pin-aware
  `isExpanded`, right-click `ContextMenu`, `closePinnedWindow`
  helper, empty-state copy.
- `livos/packages/ui/src/providers/window-manager.tsx` — Postgres
  hydration + pin/unpin backend mirror + ref-based callback
  stability.

Backend:
- `livos/packages/livinityd/source/modules/database/schema.sql` —
  `pinned_windows` table.
- `livos/packages/livinityd/source/modules/database/migrations/2026-05-15-p131-pinned-windows.sql` — migration mirror.
- `livos/packages/livinityd/source/modules/database/migrations/index.ts` —
  registered new migration.
- `livos/packages/livinityd/source/modules/database/index.ts` —
  `listPinnedWindows`, `upsertPinnedWindow`, `deletePinnedWindow`,
  `PinnedWindowRow` type.
- `livos/packages/livinityd/source/modules/pinned-windows/routes.ts` — tRPC router.
- `livos/packages/livinityd/source/modules/server/trpc/index.ts` —
  `pinnedWindows` namespace registered in `createAppRouter`.
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` —
  3 `pinnedWindows.*` paths added to `httpOnlyPaths`.

Planning:
- `131-DECISIONS.md` — locked D-131-A..G with rationale.
- `131-01-SUMMARY.md`, `131-02-SUMMARY.md`, `131-05-SUMMARY.md` —
  per-sub-plan summaries.
- `131-SUMMARY.md` (this file).
- `131-UAT-CHECKLIST.md` — operator walk script.

## Carry-forward to next session / v37

- **Plan 131-03** — full operator-walked execution.
- **Plan 131-04** — depends on 131-03.
- **Plan 131-05.1** — UX polish that needs 131-03 snapshot endpoint.
- **Plan 131-06 completion** — UAT walk + PROJECT.md chapter +
  memory snapshot once 131-03/04 ship.
- **v37 tier-(c)** — truly persistent pins (days, sign-out + return)
  requires Chrome profile-dir persistence work; deferred per
  131-DECISIONS.md D-131-E.

## Sacred SHA audit

Verified preserved across all three commits in this phase:

```
$ git ls-tree b3b049ad liv/packages/core/src/sdk-agent-runner.ts
100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f
$ git ls-tree 167b42ba liv/packages/core/src/sdk-agent-runner.ts
100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f
$ git ls-tree 559ee89f liv/packages/core/src/sdk-agent-runner.ts
100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f
```
