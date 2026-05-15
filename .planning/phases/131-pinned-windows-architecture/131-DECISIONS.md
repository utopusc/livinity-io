# Phase 131 — Architectural Decisions (LOCKED)

> Locked 2026-05-15 via `/gsd-autonomous` flow. User accepted the
> proposed defaults from the master plan en bloc. These values bind
> Plans 131-02 through 131-06 and any follow-up v37 work that touches
> the pinned-window surface.
>
> Sacred SHA invariant: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
> `liv/packages/core/src/sdk-agent-runner.ts`. Verify before/after
> every commit that touches Phase 131 code paths.

## D-131-A — Storage backend = **Postgres** `pinned_windows` table

**Why Postgres over Redis hash:** the v7 multi-user system uses Postgres
for all user-scoped persistence (`users`, `sessions`,
`user_preferences`, `user_app_access`, etc.). Same DB → trivial JOIN
on `users.id` for RBAC / cascade-delete. Survives a Redis flush. The
upsert pattern (`ON CONFLICT (user_id, window_id) DO UPDATE`) is
cleaner than Redis hash merge semantics. Redis would have given us
slightly faster reads but the cost is dwarfed by tRPC round-trip.

**Schema** (referenced from 131-02-PLAN.md task 02-01):

```sql
CREATE TABLE pinned_windows (
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  window_id    TEXT         NOT NULL,
  app_id       TEXT         NOT NULL,
  route        TEXT         NOT NULL,
  title        TEXT         NOT NULL,
  icon         TEXT         NOT NULL,
  position_x   INTEGER      NOT NULL,
  position_y   INTEGER      NOT NULL,
  size_w       INTEGER      NOT NULL,
  size_h       INTEGER      NOT NULL,
  payload_json JSONB,                 -- reserved for D-131-C per-app freeze state
  pinned_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, window_id)
);
```

## D-131-B — Background runtime host = **`livinityd`** (server process)

**Why livinityd over Service Worker over hybrid:** a Service Worker
dies when the user closes the browser; tier (b) of D-131-E
*requires* survival past browser close. livinityd already runs the
hermes runtime that owns long-lived AI sessions, the Chrome handle
manager for WebApps, and the filesystem watcher for Files — every
per-app session host we need to write in 131-03 already has a
livinityd-side cousin. SW is the wrong place architecturally.

**Implementation pattern:** new module
`livos/packages/livinityd/source/modules/pinned-sessions/` with one
file per session contract (per D-131-C): `host-webapp.ts`,
`host-ai-chat.ts`, `host-files.ts`. Each exports
`{freeze, thaw, tick, gc}` matching the per-app contract.

## D-131-C — Session contract granularity = **per-app**

**Why per-app over generic JSON blob:** a Files watcher and an
AI-Chat conversation thread freeze to completely different shapes.
A generic blob forces each app to write its own serializer anyway
(at runtime, untyped) — formalizing the contract per-app gives us
TypeScript type-safety and keeps the freeze/thaw logic where the
app code already lives. The cost is N session-host files instead of
one — acceptable for ~3 currently-pinnable app types.

**Per-app contracts:**

| App        | Frozen state                                    | Resumed how                                            |
|------------|-------------------------------------------------|--------------------------------------------------------|
| WebApp     | `{chromeHandleId, url, scrollY, history[]}`     | re-attach to existing Chrome handle by id              |
| AI Chat    | `{conversationId, hermesRunId, lastMessageId}`  | hermes already supports re-attach via runId            |
| Files      | `{currentPath, search, sortOrder, selection[]}` | no live session needed — pure DOM state                |

## D-131-D — AI-control API surface = **MCP tools**

**Why MCP over tRPC:** agents wired in `sdk-agent-runner.ts` already
discover MCP tools at startup (Phase 77 closed this gap). Registering
`livos.pinned-windows.list / read / send-input / wait-for` as MCP
tools costs ~30 lines per tool and gets:

- Automatic agent-loop discovery.
- Per-tool allowlist via MCP config.
- Built-in audit log (livinityd MCP middleware logs every call).

A tRPC surface would require teaching every agent integration where
to look. MCP is the right primitive.

**Sacred SHA preservation:** the new MCP server is registered via the
existing `additionalMcpServers` config path (Phase 77 mechanism). No
changes to `liv/packages/core/src/sdk-agent-runner.ts`. The sacred
SHA `f3538e1d…` must be preserved across every Plan 131-04 commit.

## D-131-E — Pin durability tiers = **(a) in 131-02, (b) in 131-03, (c) deferred to v37**

**Tier ladder:**

1. **(a) Refresh-only** — Plan 131-02 — page reload re-renders the
   chips and re-hydrates window state from Postgres. The underlying
   app session is a fresh start. Safe, scoped, low-risk.
2. **(b) Tab-close-survives** — Plan 131-03 — the WebApp Chrome
   handle / hermes AI session / Files watcher keep running in
   livinityd past the WebSocket disconnect. UI re-attaches on
   reconnect.
3. **(c) Truly persistent (days, sign-out + return)** — deferred to
   a future v37 phase. Requires a freezer that can serialize and
   resume a Chrome handle days later, which is non-trivial (chrome-
   side state can't be persisted across a browser restart without
   the Profile dir survival pattern). Out of scope for v36.

## D-131-F — Pin limit per user = **soft 8, hard 16**

**Why soft cap:** unlimited risks runaway livinityd memory (each pin
holds a Chrome handle / hermes run in tier (b)). 8 is the visible
shelf capacity at a comfortable 820px width. 16 is a hard upper
bound that protects livinityd RAM.

**UX:** soft-cap warning toast at 8 pins ("8 pins is the
recommended shelf capacity — pinning more may slow your dashboard");
hard-cap rejection toast at 16 ("Maximum pin count reached — unpin
something first"). Enforced in `pinnedWindows.upsert` (server-side
bound is authoritative).

## D-131-G — Unpin behavior = **restore-to-previous-position**

**Why restore over fresh-open over choice:** matches the OS-shaped
expectation. The window's `position` and `size` are already
persisted in `pinned_windows` — `unpinWindowFromTopBar` dispatches
`UNPIN_FROM_TOPBAR` which keeps the existing WindowState (now with
`isPinnedToTopBar: false`), so the framer-motion reverse spring
runs from the chip back to the previous (x, y, w, h). User-choice
right-click menu in Plan 131-05 adds optional "open fresh" as an
alternative path; the default click-restore stays "restore to
previous."

---

## Carry-forward to v37

When Phase 131 closes:

- **Plan 131-03 tier (c) deferred** — record in v37-DRAFT.md.
- **Soft-cap UI** — Plan 131-05 should include the toast; if the
  shelf-polish plan doesn't have time for it, carry forward.
- **WebApp profile-dir persistence** — needed if we ever want tier
  (c) for WebApps; depends on the master Chrome profile work
  ([feedback_master_chrome_dir_perms](feedback_master_chrome_dir_perms)).

## How to reference these decisions

In a SUMMARY.md or commit message, cite as
`D-131-{A..G}` with the locked value, e.g.:
`Per D-131-A: Postgres pinned_windows table (NOT Redis).`
