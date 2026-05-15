# Phase 131-02 — Pinned-Windows Persistence (tier-a)

> Delivers D-131-E tier (a) per [131-DECISIONS.md](131-DECISIONS.md):
> page reload re-renders the chips and re-hydrates window state from
> Postgres. The underlying app session is a fresh start; tier (b)
> (tab-close-survives via livinityd background runtime) is Plan
> 131-03.
>
> PIN_PERSISTENCE_VERIFIED (static + tsc; live UAT pending operator
> walk — autonomous mode can't drive a browser).

## Schema

`pinned_windows` table added to
`livos/packages/livinityd/source/modules/database/schema.sql` (idempotent
`CREATE TABLE IF NOT EXISTS` so boot's `initDatabase()` materializes
it on every startup). Also mirrored as
`migrations/2026-05-15-p131-pinned-windows.sql` and registered in
`migrations/index.ts::V36_P131_PINNED_WINDOWS_MIGRATIONS` for the
future migration-runner.

```sql
CREATE TABLE IF NOT EXISTS pinned_windows (
  user_id           UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_id         TEXT         NOT NULL,
  app_id            TEXT         NOT NULL,
  route             TEXT         NOT NULL,
  title             TEXT         NOT NULL,
  icon              TEXT         NOT NULL,
  position_x        INTEGER      NOT NULL,
  position_y        INTEGER      NOT NULL,
  size_w            INTEGER      NOT NULL,
  size_h            INTEGER      NOT NULL,
  position_in_shelf INTEGER      NOT NULL DEFAULT 0,
  payload_json      JSONB,                                       -- reserved for 131-03 D-131-C freeze state
  pinned_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, window_id)
);
CREATE INDEX IF NOT EXISTS pinned_windows_user_idx
  ON pinned_windows (user_id, position_in_shelf ASC, pinned_at ASC);
```

Foreign key to `users(id)` with `ON DELETE CASCADE` so a user-delete
drops their pins automatically. Primary key `(user_id, window_id)` so
re-pinning the same window upserts in place.

## API

New tRPC router
`livos/packages/livinityd/source/modules/pinned-windows/routes.ts`,
mounted as `pinnedWindows.*` in
`server/trpc/index.ts::createAppRouter()`. Three procedures, all
`privateProcedure` (auth-gated via `isAuthenticated` middleware):

| Procedure | Shape | Behavior |
|-----------|-------|----------|
| `pinnedWindows.list`   | query, no input                    | Returns `PinnedWindowRow[]` for `ctx.currentUser.id`, ordered by `position_in_shelf ASC, pinned_at ASC`. Returns `[]` if Postgres unavailable. |
| `pinnedWindows.upsert` | mutation, `{windowId, appId, route, title, icon, position, size, positionInShelf?}` | Inserts a new pin or refreshes an existing one (snapshot + `last_seen_at = NOW`). Enforces D-131-F **hard cap of 16** server-side — throws if the user is already at the cap and this is a NEW pin. Soft cap (8) warning is UI-only (Plan 131-05). |
| `pinnedWindows.delete` | mutation, `{windowId}`             | Drops the row. Idempotent — deleting a non-existent pin is a no-op. |

All three paths added to `httpOnlyPaths` in
`server/trpc/common.ts` (same WS-reconnect-survival rationale as the
preferences / agents / webapp clusters — pitfall B-12 / X-04). DB
helpers live in
`livos/packages/livinityd/source/modules/database/index.ts`
(`listPinnedWindows`, `upsertPinnedWindow`, `deletePinnedWindow`).

## UI hydration flow

`WindowManagerProvider` (`livos/packages/ui/src/providers/window-manager.tsx`)
now hydrates on mount via `trpcReact.pinnedWindows.list.useQuery()`.
For each returned row, a single `OPEN_WINDOW` action is dispatched
with `isPinnedToTopBar: true` so the window mounts directly in the
collapsed-chip state — it never flashes as a full window.

```ts
useEffect(() => {
  if (hydratedRef.current) return
  const rows = pinnedListQuery.data
  if (!rows?.length) return
  hydratedRef.current = true
  for (const row of rows) {
    if (windowsRef.current.some((w) => w.id === row.windowId)) continue
    dispatch({type: 'OPEN_WINDOW', payload: {...row, isMinimized: false, isPinnedToTopBar: true}})
  }
}, [pinnedListQuery.data])
```

The one-shot `hydratedRef` guard makes the dispatch idempotent under
React 18 StrictMode's double-mount. The `windowsRef` mirror keeps the
mutation callbacks dep-array-stable so the drag-state external store
subscribers (from 131-01) don't re-bind on every reducer dispatch.

Pin / unpin actions now mirror to Postgres:

- `pinWindowToTopBar(id)` → `dispatch(PIN_TO_TOPBAR)` then
  `pinnedUpsertMutation.mutate({...currentWindowState})`.
- `unpinWindowFromTopBar(id)` → `dispatch(UNPIN_FROM_TOPBAR)` then
  `pinnedDeleteMutation.mutate({windowId})`.

Both mutations fire-and-forget — local state already changed, the
backend is just the durable mirror. A mutation failure surfaces in
the tRPC error toast handler (project-wide) but does not roll back
the optimistic local update (consistent with the existing pattern in
`agents.update`, `webapp.create`, etc.).

## What's NOT persisted yet (Plan 131-03 scope)

- The underlying app session — a Files watcher, an AI-Chat
  WebSocket connection, a WebApp Chrome handle — is killed when the
  user closes the tab. The chip reappears after refresh but clicking
  it opens a *fresh* session of the same app.
- `payload_json` is reserved for the per-app freeze state defined in
  D-131-C and stays NULL in 131-02.

Tier-(b) work (livinityd PinnedSession hosts, WS reconnect protocol,
24h GC) is Plan 131-03 scope — that plan exists at
`.planning/phases/131-pinned-windows-architecture/131-03-PLAN.md`.

## Verification

- `git ls-tree HEAD liv/packages/core/src/sdk-agent-runner.ts` →
  `100644 blob f3538e1d811992b782a9bb057d1b7f0a0189f95f` ✓ (preserved
  pre- and post-commit).
- UI `npx tsc --noEmit -p .` → **586 errors** ✓ (matches the 130-09 +
  131-01 baseline; no new errors from this plan).
- Livinityd `npx tsc --noEmit -p .` → no new errors from
  `pinned-windows` files (the existing baseline of unrelated errors
  in `ai/routes.ts`, `skills/*` etc. is unchanged).
- Schema apply path: livinityd boot's `initDatabase()` runs
  `schema.sql` as one statement; the new `CREATE TABLE IF NOT EXISTS
  pinned_windows ...` block runs on next restart.
- tRPC reachability: `pinnedWindowsRouter` is imported into
  `server/trpc/index.ts` and merged via `createAppRouter` so
  `trpcReact.pinnedWindows.list/.upsert/.delete` resolves on the UI
  side after a livinityd build.

Live operator UAT remains (canonical script):

1. Open Files + AI Chat → pin both via the 131-01 drag gesture.
2. Hard-refresh the browser tab (Ctrl-Shift-R).
3. Confirm both chips reappear in the shelf with their titles.
4. Click each chip → window restores via the reverse spring.
5. `psql $DATABASE_URL -c "SELECT window_id, title FROM pinned_windows"`
   confirms two rows for the current user.
6. Click the chip's close button (when 131-05 ships) or call
   `unpinWindowFromTopBar` → row count drops by one.

## Mini PC deployment note

On `bash /opt/livos/update.sh`:

1. `update.sh` rsyncs the new source tree and rebuilds the UI + core
   packages. **`@livos/livinityd` is `tsx`-loaded — no build step
   needed** (memory pitfall: livinityd runs TypeScript directly).
2. `systemctl restart livos` → `initDatabase()` runs `schema.sql`
   which idempotently creates `pinned_windows` (no separate
   migration step needed).
3. Verify: `psql $DATABASE_URL -c "\d pinned_windows"` shows the
   columns.
4. UI is rebuilt by `update.sh`; hard-refresh the browser tab to
   pick up the new `WindowManagerProvider` hydration logic.

If the schema apply fails (e.g. `users` table missing), check
livinityd boot logs — the error surfaces via
`logger.error('Failed to apply schema', ...)` and prevents the
provider from initializing. The fix is the standard
`SELECT * FROM users LIMIT 1` smoke test in the boot path.
