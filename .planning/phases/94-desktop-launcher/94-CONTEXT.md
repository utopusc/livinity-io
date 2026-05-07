# Phase 94 — Desktop "Add WebApp" Context Menu + Persistence

**Milestone**: v33.0 — WebApp Launcher + Teach/Auto Modes
**Wave**: 2 (single)
**Size**: S (1-2 days)
**Source of truth**: `.planning/v33-DRAFT.md` v2 §5

---

## Goal

Give the user a single right-click path on the empty desktop to add an arbitrary URL as a first-class WebApp, then render the resulting WebApp icon alongside Docker apps in the existing desktop grid. Persist the WebApp to Postgres so it survives reload, and expose `webapps.{create,list,delete,update}` over tRPC for downstream phases.

This phase is the UI gateway between P92 (metadata extractor) and P95 (stream window). It does NOT spawn a Chrome window — that's P93/P95. Click-to-launch wiring lands a placeholder dispatcher; full launch dispatch is P95.

---

## Why

- v33 vision starts with "user right-clicks empty desktop → Add WebApp". Until this phase, the metadata extractor (P92) has no entry point and the window manager (P93) has no caller.
- Persistence layer must exist before any teach/auto/skill-related phases (P96/P97) can reference a stable `webappId`.
- A `WebAppIcon` wrapper centralizes the click-to-launch dispatch so downstream phases (P95) only need to fill in the dispatcher body, not retrofit every desktop touchpoint.
- Desktop context menu has `Add Widget` and `New Folder` already — adding `Add WebApp` is a one-item insert that matches existing UX patterns.

---

## In-scope

1. **Context menu item** — single new `<ContextMenuItem>` in `desktop-context-menu.tsx`, sibling to `Add Widget`. Opens the `AddWebAppDialog`.
2. **AddWebAppDialog component** — URL input → debounced tRPC `webapp.extractMetadata` (from P92) → preview card with title + favicon + description → confirm button calls `webapps.create` mutation → closes dialog and triggers grid refresh. Validation: trim, require `http(s)://`, friendly errors for invalid/unreachable URLs.
3. **WebAppIcon component** — wraps existing `AppIcon` visual (favicon as src instead of Docker app icon). Exposes a `kind="webapp"` discriminator so the click handler knows to invoke the WebApp launch dispatcher rather than starting a Docker container.
4. **App grid integration** — `app-grid.tsx` renders WebApps inline with Docker apps. Source of truth for "what goes on the grid" is the unified apps provider (extended in this phase).
5. **Apps provider extension** — `providers/apps.tsx` queries `webapps.list` alongside Docker apps and merges results into a single ordered list with a `kind` discriminator.
6. **tRPC `webapps` router** — extends P92's stub with `create`, `list`, `delete`, `update` procedures backed by the Postgres `webapps` table (already migrated in P92). Auth via existing `is-authenticated` middleware. Routes registered on `httpOnlyPaths` in `common.ts`.
7. **Click dispatcher placeholder** — when a `WebAppIcon` is clicked, log + call a stub `webapps.spawn` (or simply emit a window-manager intent). P95 fills in the actual spawn flow. This phase only ensures the wiring point exists and is reachable.
8. **Delete affordance** — right-click on a WebApp icon offers `Remove WebApp` calling `webapps.delete`. Reuses existing app-icon context menu pattern if present; otherwise a minimal addition.

---

## Out-of-scope

- Spawning Chrome windows / x11vnc / websockify — P93/P95.
- Stream window UI (`webapp-stream-window.tsx`), VNC client, mode selector — P95.
- Postgres `webapps` table migration — already shipped in P92.
- Multi-user per-user WebApp lists — D-V33-07: single Mini PC user only in v33.
- Drag-to-arrange ordering of WebApp icons — open question §8 in DRAFT; default to grid auto-order, defer custom ordering to v34 if needed.
- Skills, recordings, agent sessions — P96/P97.
- WebApp icon edit dialog beyond `update` (rename/replace icon) — backend `update` ships, full UI for rename can be a P98 polish item.
- Bulk import / browser-bookmarks importer — out of v33 entirely.
- PWA manifest detection — out of v33 (per §9).

---

## Dependencies

| Dep | Source | Reason |
|---|---|---|
| `webapp.extractMetadata` tRPC | P92 | Dialog preview card needs `{title, faviconUrl, description, ogImage}`. |
| `webapps` Postgres table | P92 migration | `create/list/delete/update` write here. |
| Existing `AppIcon` | `livos/packages/ui/src/modules/desktop/app-icon.tsx` | `WebAppIcon` wraps and reuses its layout. |
| Existing `app-grid` | `livos/packages/ui/src/modules/desktop/app-grid/app-grid.tsx` | Render target. |
| Existing `apps` provider | `livos/packages/ui/src/providers/apps.tsx` | Unified source of icons. |
| Existing context-menu primitive | `livos/packages/ui/src/shadcn-components/ui/context-menu.tsx` | New ContextMenuItem follows pattern. |
| `is-authenticated` middleware | livinityd | All `webapps.*` procedures behind auth. |
| `httpOnlyPaths` | `common.ts` | `webapps.*` routes must use HTTP, not WS — per CLAUDE.md pitfall. |

No external dependency on P93/P95 — this phase ships standalone with click-launch as a stub.

---

## Sacred constraints

- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNTOUCHED (verify before AND after every commit). Phase 94 is pure UI + livinityd tRPC; no path through this file.
- Subscription-only — no raw API key paths introduced.
- No emoji authored in code or copy.
- No backwards-compat shims in new code.
- New tRPC routes registered on `httpOnlyPaths` — never mounted on the WebSocket transport.

---

## Gray areas → planner decisions

| Gray area | Decision |
|---|---|
| Where does the `kind` discriminator live (DB column vs. derived)? | DB column `kind` on `webapps` is N/A — table is webapps-only. The unified provider tags rows with `kind: 'webapp'` at the merge layer; Docker apps get `kind: 'app'`. No DB changes. |
| Click handler on `WebAppIcon` — call tRPC immediately or emit intent? | Emit intent through a `useLaunchWebApp(webappId)` hook. P95 fills in the body; P94 ships a stub that logs + console-warn "P95 not yet shipped". Hook signature locked here so P95 doesn't reshape the icon. |
| Dialog behavior when `extractMetadata` fails | Show inline error under URL input, disable Confirm. Allow user to override title manually if metadata returns partial (e.g. title fallback to hostname). |
| Favicon caching | Server-side caching is P92's job; UI uses returned URL as-is with `<img>` `loading="lazy"` and a fallback glyph on error. |
| Deletion confirmation | Native confirm dialog (shadcn `AlertDialog`) — destructive, mirrors existing app uninstall pattern if present; otherwise minimal AlertDialog wrap. |
| Order of WebApps in grid | Append after Docker apps in `apps.list` order (createdAt ASC) — drag-arrange deferred. |
| Adding a duplicate URL | Backend `webapps.create` returns existing row idempotently OR rejects with 409 — pick **idempotent return of existing row** so user doesn't get blocked; UI shows "already added, opening dialog with existing entry". |
| Auth scope | All `webapps.*` filtered by `userId = currentUser.id`. v33 single-user means this is effectively the bruce admin row; future-proofing free. |

---

## Success criteria

1. Right-click empty desktop → `Add WebApp` item appears between `Add Widget` and `New Folder` (or sibling pair — verified during plan).
2. Clicking it opens dialog. Pasting `https://facebook.com` → preview card populates with Facebook title + favicon within ~1s of debounced fetch.
3. Confirm → dialog closes → Facebook icon appears on desktop within one render cycle (provider invalidates and refetches).
4. Refresh page → Facebook icon still present (Postgres-backed).
5. Right-click WebApp icon → `Remove WebApp` deletes row + icon disappears.
6. tRPC `webapps.list` returns expected shape; `create/delete/update` all unit-testable via direct tRPC call.
7. New routes appear in `httpOnlyPaths` — verified by grep.
8. Sacred SHA unchanged: `git hash-object liv/packages/core/src/sdk-agent-runner.ts == f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
9. Click on WebApp icon emits the launch-intent stub without throwing — handoff to P95 verified by interface test.
10. No new emoji, no API key paths, no WebSocket-mounted procedure.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Apps provider refactor breaks Docker app rendering | M | H | Provider extension is additive — Docker app branch unchanged; merge happens at end. Snapshot test before/after. |
| Context menu z-index conflict with new dialog | L | L | Reuse existing dialog primitive (already z-stacked correctly for New Folder). |
| `extractMetadata` slow on first call → bad UX in dialog | L | M | Debounce 300ms + visible spinner + "still fetching…" copy after 1.5s. P92 caches for 24h. |
| `webapps.list` polling blasts livinityd | L | M | Use tRPC `useQuery` with default cache + invalidate on create/delete. No interval polling. |
| New routes accidentally on WS transport (tRPC pitfall) | M | H | Plan task 94-04 explicitly adds to `httpOnlyPaths` and ships a grep-verifiable assertion. |
| Sacred SHA drift via stray import | L | C | Pre-commit + post-commit hash check in plan task acceptance. |
