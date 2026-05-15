# Phase 131 — Pinned-Windows Architecture (Master)

> Status: PLANNED 2026-05-15 — manual write (GSD subagents not installed in
> this project; planner orchestrator skipped per `agents_installed: false`).
> Sacred SHA invariant: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
> `liv/packages/core/src/sdk-agent-runner.ts`. Verify before/after every
> commit.

## Goal

Make pinned windows a first-class OS-shaped concept across the whole project:

1. **Drag-to-pin works end-to-end** (currently broken in 130-09 — UAT report).
2. **Pinned-window state persists** across page refresh, navigation, browser
   restart, and (eventually) user sign-out + return.
3. **Pinned windows keep running in the background** even when the user has
   the site closed — their underlying app session (WebApp Chrome handle,
   AI-Chat conversation, Files watcher, stream socket, etc.) stays live
   on the server.
4. **AI agents can read + control pinned windows** while the user is away,
   so a pinned WebApp browsing window can be driven by an agent
   asynchronously.
5. **TopBar shelf UX is polished** — chip thumbnails, hover preview,
   drag-off-to-unpin, right-click menu.

User direction 2026-05-15:
> "Ben çalıştırıdığım pencereler buraya koyduğumda ben bir yere gittikten
>  sonra bilene çalışsın istiyorum"
= when I put my running windows there, they should keep running even
after I leave (the page / the site).

## Architecture-level decisions to lock (resolve via `/gsd-discuss-phase 131`)

These are decisions Plan 131-03+ depend on. Cannot plan in detail until
they're locked.

| # | Decision | Candidates | Default proposal |
|---|---------|------------|------------------|
| D-131-A | Storage backend for pinned-window registry | (a) Postgres `pinned_windows` table, (b) Redis hash `livos:pinned:{user_id}` | **(a) Postgres** — same DB as multi-user system, joins on user_id, survives Redis flush |
| D-131-B | Background runtime host | (a) Browser Service Worker, (b) `livinityd` hermes process on the server, (c) hybrid (SW for lightweight + livinityd for heavy) | **(b) livinityd** — survives tab close + browser close; matches existing hermes runtime pattern from v32 |
| D-131-C | Session contract granularity | (a) Per-app contract (each app type defines its own freeze/thaw), (b) Generic JSON blob + app self-rehydrates | **(a) per-app** — WebApp / AI-Chat / Files all have very different session shapes; generic blob would be huge |
| D-131-D | AI-control API surface | (a) tRPC procedures on livinityd, (b) MCP tools registered with the agent SDK | **(b) MCP** — agents already wired to MCP tools; trivially scoped |
| D-131-E | Pin durability tiers | (a) Refresh-only (page reload), (b) Session-only (tab close survives, browser close kills), (c) Persistent (user sign-out + days later, still alive) | **Ship (a) in Plan 131-02, (b) in 131-03, (c) in a future v37 phase** — staged delivery |
| D-131-F | Pin limit per user | (a) Unlimited, (b) Soft cap (e.g., 8), (c) Hard cap | **(b) soft cap 8** — UI warning at 8, hard cap 16. Storage cost on livinityd. |
| D-131-G | Unpin behavior | (a) Restore to previous position, (b) Open fresh as new window, (c) User choice via right-click | **(a) restore-to-previous** — matches OS-shaped expectation |

Run `/gsd-discuss-phase 131` to lock these formally before executing 131-03+.

## Sub-plans

This phase ships in six plans:

### 131-01 — Drag-to-pin bug fix (`autonomous: true`)

> Tightly scoped — bug fix only, no architecture changes.

Root-cause + fix the drag-drop-pin gesture that Phase 130-09 wired but
shipped broken (user UAT 2026-05-15). Falsifiable: a real window dragged
by its title pill onto the shelf gets pinned (chip appears, window
animates to chip position).

See: `131-01-PLAN.md`.

### 131-02 — Refresh-survives persistence (`autonomous: true`)

> Delivers D-131-E tier (a): page reload re-renders pinned windows
> with their previous position / size / route.

Add `pinned_windows` Postgres table (D-131-A). tRPC procedures
`pinnedWindows.list / .upsert / .delete`. `WindowManagerProvider` calls
`.list` on mount and dispatches `OPEN_WINDOW` + `PIN_TO_TOPBAR` for each
row. `pinWindowToTopBar` action mirrors to backend via `.upsert`;
`unpinWindowFromTopBar` mirrors via `.delete`.

See: `131-02-PLAN.md`.

### 131-03 — Background session runtime (`autonomous: false`)

> Delivers D-131-E tier (b): tab close survives. The hardest plan in the
> phase. Requires D-131-B and D-131-C locked.

Build the livinityd-side session host. Per-app session contracts
(WebApp Chrome handle, AI-Chat conversation, Files watcher) with
freeze/thaw lifecycle. WebSocket reconnect protocol so the React UI
re-attaches to the live session when the user comes back. Heartbeat +
GC for orphaned sessions.

See: `131-03-PLAN.md` (skeleton until D-131-B/C lock).

### 131-04 — AI-control hooks (`autonomous: false`)

> Depends on 131-03. Delivers D-131-D.

Register MCP tools `livos.pinned-windows.list / read / send-input /
wait-for`. Per-window allowlist + rate-limit. Wire into
`sdk-agent-runner` so the broker subscription path can call them.
Sacred SHA invariant preserved (broker path stays the only AI entry
point).

See: `131-04-PLAN.md` (skeleton until 131-03 ships).

### 131-05 — TopBar shelf polish (`autonomous: true`)

Chip improvements:
- Live thumbnail preview on chip hover (screenshot of the pinned
  window, cached + refreshed every N seconds).
- Drag a chip OFF the shelf onto the desktop → unpin + restore.
- Right-click chip → context menu (Restore, Close, Pin-anew).
- Empty-state hint inside the dashed area.
- Chip ordering: drag to reorder.

See: `131-05-PLAN.md`.

### 131-06 — UAT walk + docs (`autonomous: false`)

Mini PC live walk of every flow above. Update `.planning/PROJECT.md`
with the new pinned-windows architecture chapter. Memory snapshot of
the decisions actually made (D-131-A through G actual values, any
deviations from this master plan).

See: `131-06-PLAN.md`.

## Order of execution

1. **131-01 first** — bug must be fixed before any further architectural
   work on the same code path.
2. **`/gsd-discuss-phase 131`** — lock D-131-B/C/D before 131-03.
3. **131-02** — persistence is independent of background runtime, can ship
   in parallel with the discussion above.
4. **131-03** — biggest plan, depends on D-131-B/C.
5. **131-04** — depends on 131-03.
6. **131-05** — can interleave with 03/04 once chip data is real.
7. **131-06** — close-out.

## Verification protocol (each plan)

1. Before edit: `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts`
   prints `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
2. Type-check: `npx tsc --noEmit -p .` in `livos/packages/ui/` — no NEW
   errors vs baseline (586 as of 130-09).
3. Sacred SHA after commit: same check.
4. Visual / live verification per plan.
5. Commit message follows `feat(v36/topbar): ...` or
   `feat(131/persistence): ...` style with the standard trailing
   `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

## Resume command after `/clear`

> "phase 131 başla — pinned-windows architecture. CONTEXT at
>  .planning/phases/131-pinned-windows-architecture/131-CONTEXT.md,
>  master plan at 131-PLAN.md. Start with 131-01 (drag-fix), then
>  run /gsd-discuss-phase 131 to lock D-131-B/C/D before 131-03."
