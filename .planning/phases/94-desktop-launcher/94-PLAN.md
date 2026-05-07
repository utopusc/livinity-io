# Phase 94 — PLAN

**Phase**: 94 — Desktop "Add WebApp" Context Menu + Persistence
**Wave**: 2 (single)
**Size**: S (1-2 days)
**Source**: `.planning/v33-DRAFT.md` v2 §5

Tasks 94-01 through 94-06. Each task is single-commit-sized. All work runs on the host workspace (no Mini PC deploy in this phase). Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` must be intact at the end of every task.

---

## Task 94-01 — Extend `webapps` tRPC router with create/list/delete/update

**Description**
Build the four CRUD procedures on top of P92's stub router, backed by the existing Postgres `webapps` table. Procedures are scoped to `currentUser.id` via the `is-authenticated` middleware. `create` is idempotent on `(userId, url)` — if the URL already exists for the user, return the existing row instead of throwing. `update` accepts partial `{title, faviconUrl, description}` patch. `delete` cascades to nothing yet (skills/sessions tables don't exist until P96/P95). Register all four procedure paths on `httpOnlyPaths` in `common.ts` per the tRPC pitfall.

Inputs validated with zod: `create({url, title?, faviconUrl?, description?})`, `update({id, patch})`, `delete({id})`, `list()` no input. Outputs: `WebApp` row shape `{id, userId, url, title, faviconUrl, description, createdAt, updatedAt}`.

**Files**
- EDIT `livos/packages/livinityd/source/modules/webapps/trpc-router.ts`
- EDIT `livos/packages/livinityd/source/modules/webapps/database.ts` (add CRUD helpers if not already present from P92; otherwise inline drizzle/sql in router)
- EDIT `livos/packages/livinityd/source/trpc/common.ts` (extend `httpOnlyPaths` with `webapps.create`, `webapps.list`, `webapps.delete`, `webapps.update`)

**Acceptance**
1. tRPC tooling shows `webapps.create | list | delete | update` in the type tree.
2. `create` with duplicate URL returns the existing row (no 409, no duplicate insert).
3. `list` returns only rows where `userId = ctx.currentUser.id`.
4. Direct curl/tRPC test against livinityd succeeds for all four ops.
5. Grep confirms all four route names present in `httpOnlyPaths`.
6. `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

**Effort**: 2-3h
**Depends on**: P92 (router stub + table migration shipped)

---

## Task 94-02 — Create `AddWebAppDialog` component

**Description**
New dialog component that takes the user from "URL paste" to "row created in Postgres". Layout:
- shadcn `Dialog` shell with `DialogTitle = "Add WebApp"`.
- URL `Input` with autofocus + paste-friendly. Debounced 300ms.
- Below input: preview card region. Three states — empty (placeholder copy), loading (spinner + "Fetching site info…"), loaded (favicon thumbnail + title + truncated description), error (inline red text + retry).
- Manual title override input (optional) — visible after metadata loads, prefilled with extracted title.
- Footer: Cancel + Add buttons. Add disabled until URL is valid AND metadata loaded (or user has typed a manual title).

Logic uses tRPC `webapp.extractMetadata` query (from P92) keyed on the URL string, gated to enabled-only-when-URL-valid. On Add → calls `webapps.create` mutation → on success invalidates `webapps.list` and Apps-provider query → closes dialog → resets state.

URL validation: must begin with `http://` or `https://`, must parse via `new URL()`. Friendly inline error otherwise.

No emoji. No raw API key paths. Uses `t()` from `@/utils/i18n` for user-facing strings; new keys introduced as needed (English fallback values inline).

**Files**
- CREATE `livos/packages/ui/src/modules/desktop/add-webapp-dialog.tsx`

**Acceptance**
1. Dialog opens and closes via standard `open` / `onOpenChange` props.
2. Pasting a valid URL triggers `extractMetadata` after 300ms debounce, never on every keystroke.
3. Loading and error states render distinct UI.
4. Add button is disabled until URL valid + (metadata loaded OR manual title typed).
5. Successful create invalidates `webapps.list` (verified by `useUtils().webapps.list.invalidate()` call).
6. Component file ≤ 250 lines, no inline emojis, no `any` types except where unavoidable.
7. Sacred SHA unchanged.

**Effort**: 3-4h
**Depends on**: 94-01 (mutation), P92 (extractMetadata query)

---

## Task 94-03 — Wire context menu item into `desktop-context-menu.tsx`

**Description**
Single-item edit to the existing context menu component. Add a `useState` hook `[showWebAppDialog, setShowWebAppDialog]` next to the existing widget/folder/wallpaper state. Add one new `<ContextMenuItem onSelect={() => setShowWebAppDialog(true)}>Add WebApp</ContextMenuItem>` immediately after the existing `Add Widget` item (so visual ordering becomes: Add Widget → Add WebApp → New Folder → separator → Change Wallpaper). Mount `<AddWebAppDialog open={showWebAppDialog} onOpenChange={setShowWebAppDialog} />` next to the existing dialogs at the bottom of the JSX.

No other rearrangement. No copy changes to existing items. Use `t()` for the new label with English fallback `"Add WebApp"`.

**Files**
- EDIT `livos/packages/ui/src/modules/desktop/desktop-context-menu.tsx`

**Acceptance**
1. Right-click empty desktop shows the four items in the documented order.
2. Clicking `Add WebApp` opens the dialog from 94-02.
3. Other context menu items (Add Widget, New Folder, Change Wallpaper) remain functional — manually verified.
4. Diff is additive only — existing items untouched.
5. Sacred SHA unchanged.

**Effort**: 30min
**Depends on**: 94-02

---

## Task 94-04 — Create `WebAppIcon` component + launch-intent hook

**Description**
New `WebAppIcon` component that visually mirrors the existing `AppIcon` but knows the icon represents a WebApp row, not a Docker app. Internally it can either (a) render `AppIcon` with `iconUrl={faviconUrl}` plus a `kind="webapp"` prop or (b) render a thin local copy of the layout — pick (a) if `AppIcon` already accepts custom iconUrl + custom click handler; otherwise (b) with shared visual primitives. Plan favors (a) and falls back to (b) only if `AppIcon`'s props don't allow override.

Click handler calls a new `useLaunchWebApp()` hook. The hook's body is a STUB in this phase: logs `[P94] launch intent` and emits a `console.warn("P95 not yet shipped — full launch dispatch lands in Phase 95.")`. Hook signature is locked: `(webappId: string) => () => void`. P95 will fill the body without touching the icon component.

Right-click on the icon shows a minimal `ContextMenu` with one item: `Remove WebApp` → calls `webapps.delete` mutation + invalidates list. Confirmation via shadcn `AlertDialog` (destructive style).

Tooltip / label on the icon = `webapp.title || webapp.url hostname`.

**Files**
- CREATE `livos/packages/ui/src/modules/desktop/webapp-icon.tsx`
- CREATE `livos/packages/ui/src/hooks/use-launch-webapp.ts`

**Acceptance**
1. `WebAppIcon` renders favicon, title, click target.
2. Click invokes the stub launch hook without throwing; console shows expected warn.
3. Right-click → Remove WebApp → confirm → icon disappears (provider refetches).
4. Hook signature `(webappId: string) => () => void` exported and used by the icon.
5. Component reuses `AppIcon` styling primitives — no parallel CSS.
6. Sacred SHA unchanged.

**Effort**: 2-3h
**Depends on**: 94-01 (`webapps.delete` mutation)

---

## Task 94-05 — Extend apps provider + render WebApps in `app-grid`

**Description**
Extend `providers/apps.tsx` so that the unified apps query includes WebApps. Add a parallel `trpcReact.webapps.list.useQuery()` call. Map results to a discriminated union element shape `{kind: 'app', ...} | {kind: 'webapp', ...}`. Concatenate Docker apps first, then WebApps (by `createdAt` ASC). Provider exports a single ordered list. Loading state combines both queries (loading if either loading on first fetch).

Update `app-grid.tsx` to switch on `kind` when rendering each cell:
- `'app'` → existing `AppIcon` (no behavior change).
- `'webapp'` → new `WebAppIcon` from 94-04.

No reordering of existing Docker apps. No drag-arrange logic added (deferred to v34).

**Files**
- EDIT `livos/packages/ui/src/providers/apps.tsx`
- EDIT `livos/packages/ui/src/modules/desktop/app-grid/app-grid.tsx`

**Acceptance**
1. With zero WebApps in DB, desktop renders identically to pre-phase (visual diff = nil).
2. With one WebApp added via dialog, the icon appears immediately after the last Docker app.
3. Removing a WebApp via right-click removes it from the grid on next render.
4. Page reload preserves WebApps (sourced from Postgres).
5. Provider's loading state behaves correctly — initial load shows existing skeleton/null behavior, doesn't flicker WebApps in late.
6. No regression in click behavior of existing Docker apps.
7. Sacred SHA unchanged.

**Effort**: 2h
**Depends on**: 94-04 (icon), 94-01 (list query)

---

## Task 94-06 — End-to-end verification + cleanup

**Description**
Manual + scripted verification of the full flow plus housekeeping. Run the dev UI locally, walk through:
1. Right-click → Add WebApp → paste `https://facebook.com` → preview loads → confirm → icon appears.
2. Reload page → icon persists.
3. Add `https://gmail.com` → second icon appears after Facebook.
4. Add `https://facebook.com` again → idempotent: no duplicate icon, dialog closes cleanly (or shows "already added").
5. Right-click Facebook icon → Remove WebApp → confirm → disappears.
6. Verify Add Widget / New Folder / Change Wallpaper still work.
7. Click any remaining WebApp icon → console shows P94 stub warn → no error.

Scripted checks (recorded in this task's commit):
- `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → expected SHA.
- Grep `httpOnlyPaths` confirms 4 webapps routes.
- Grep `livos/packages/ui/src` for new emoji introductions returns nothing.
- `pnpm --filter ui typecheck` passes.
- `pnpm --filter @livos/livinityd typecheck` passes.

Append a `94-SUMMARY.md` with findings, gotchas, and any deferred items handed off to P95/P98. Update `.planning/STATE.md` if the GSD workflow expects it for phase completion.

**Files**
- CREATE `.planning/phases/94-desktop-launcher/94-SUMMARY.md`
- EDIT `.planning/STATE.md` (if convention requires phase-completion update)

**Acceptance**
1. All 7 manual steps above pass without console errors (other than the intentional P94 stub warn).
2. All 5 scripted checks pass.
3. `94-SUMMARY.md` written with: what shipped, what's stubbed, P95 handoff notes (the `useLaunchWebApp` hook contract).
4. Final commit's `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.

**Effort**: 1-2h
**Depends on**: 94-01, 94-02, 94-03, 94-04, 94-05

---

## Wave + commit plan

```
94-01 ─┐
       ├─→ 94-02 ─→ 94-03 ─┐
       │                   ├─→ 94-06
94-04 ─┴─→ 94-05 ──────────┘
```

94-01 and 94-04 are independent at the file level (different layers); 94-04 still depends on 94-01's mutation type signatures, so realistically run sequentially: 01 → 02 → 03 → 04 → 05 → 06. Six commits, one per task.

**Total estimated effort**: 10-14h (1-2 days, matches DRAFT S sizing).
