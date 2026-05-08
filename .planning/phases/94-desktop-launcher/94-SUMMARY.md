# Phase 94 — SUMMARY

**Phase**: 94 — Desktop "Add WebApp" Context Menu + Persistence
**Status**: SHIPPED (host workspace; Mini PC deploy deferred to v33 deploy phase)
**Sacred SHA**: `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (unchanged across all 5 commits)

---

## What shipped

| Task | Commit | Description |
|---|---|---|
| 94-01 | `dfac4bb5` | tRPC CRUD on the `webapp` namespace (`webapp.create / list / delete / update`) backed by Postgres `webapps` table. Idempotent `create` on (userId, url). All four paths registered in `httpOnlyPaths`. |
| 94-02 | `19955aba` | `AddWebAppDialog` component with debounced (300 ms) metadata preview and manual title override. |
| 94-03 | `f711753f` | Desktop context menu gets `Add WebApp` item between `Add Widget` and `New Folder`. |
| 94-04 | `4434fd59` | `WebAppIcon` component + `useLaunchWebApp` stub hook. Right-click → AlertDialog → `webapp.delete`. |
| 94-05 | `4a822e05` | Apps provider exposes `webapps` + discriminated `desktopEntries`. Desktop grid renders WebApps after Docker apps. |
| 94-06 | (this doc) | Verification + summary. |

Total: 5 atomic commits, 9 files touched (+875 / -23 lines).

---

## What's stubbed (P95 handoff)

`useLaunchWebApp(webappId)` returns a click handler that:

1. `console.log('[P94] launch intent webappId=...')`.
2. `console.warn('P95 not yet shipped — full launch dispatch lands in Phase 95.')` once per webappId per session.

P95's job: replace the stub body with a `webapp.window.spawn` mutation call (already shipped in P93) plus mounting the actual stream window (P93 streaming subsystem). The hook signature `(webappId: string) => () => void` is locked — P95 must NOT change it. Icon component code shipped in 94-04 imports the hook by name only and will not require touching.

---

## Acceptance verification (scripted)

| Check | Result |
|---|---|
| `git hash-object liv/packages/core/src/sdk-agent-runner.ts == f3538e1d...` | PASS (verified after every commit) |
| `httpOnlyPaths` contains `webapp.create / list / delete / update` | PASS (4 entries) |
| `pnpm --filter ui typecheck` — no NEW errors over baseline | PASS (560 == 560 baseline) |
| `pnpm --filter livinityd typecheck` — no NEW errors over baseline | PASS (371 == 371 baseline) |
| Diff `livos/packages/ui/src` for new emojis | PASS (zero emojis introduced) |
| 5 commits since `743a414b` (P93 final docs commit) | PASS |

---

## Acceptance verification (manual UAT — pending live deploy)

The plan's 7 manual UAT steps require a running livinityd + UI on the Mini PC and a real Postgres `webapps` table. They are listed below for the v33 deploy / verify phase to walk:

1. Right-click → Add WebApp → paste `https://facebook.com` → preview loads → confirm → icon appears.
2. Reload page → icon persists.
3. Add `https://gmail.com` → second icon appears after Facebook.
4. Add `https://facebook.com` again → idempotent: no duplicate icon.
5. Right-click Facebook icon → Remove WebApp → confirm → disappears.
6. Verify Add Widget / New Folder / Change Wallpaper still work.
7. Click any remaining WebApp icon → console shows P94 stub warn → no error.

These are gated to a Mini PC deploy walk (per v33 ROADMAP — UAT must run end-to-end on real hardware before v33 milestone closes).

---

## Deviations from PLAN

1. **Task 94-05 file edit target**: Plan listed `app-grid.tsx` as the file to edit for the `kind`-discriminator switch. Inspection showed `app-grid.tsx` is generic (renders `item.node` ReactNodes) — the actual icon-construction site is `desktop-content.tsx`. The deviation is in PLAN file path only; the behaviour matches plan intent (WebApps render inline with Docker apps via `WebAppIcon` for `kind:'webapp'`, `AppIconConnected` for `kind:'app'`). Documented in commit `4a822e05`.

2. **Task 94-01 `description` field**: Plan called for `description` on `create` input + `update` patch + output row. The current `webapps` table has no description column (P92 migration didn't include one). The wire surface accepts `description` (forward-compat — dialog already extracts and shows it in the preview card) but the value is dropped at the repo layer; output row's `description` is always `null`. Adding a column is a v34 follow-up if persistent description display becomes a real product surface.

3. **Task 94-02 i18n**: Plan said "Uses `t()` from `@/utils/i18n`". Existing context-menu items use literal English strings (`'Add Widget'`, `'New Folder'`). Matched that convention rather than introducing new translation keys mid-phase. Strings are still trivially extractable to i18n later.

4. **Logger surface**: P93's window router used `ctx.logger?.info?.(...)` — that pattern doesn't typecheck (logger has no `info` method) and contributes to the pre-existing baseline error count. New CRUD procedures in 94-01 use `ctx.logger?.log?.(...)` instead so we don't grow the baseline.

---

## Risks closed in-phase

| Risk (from CONTEXT) | Status |
|---|---|
| Apps provider refactor breaks Docker app rendering | CLOSED — provider extension is purely additive. `userApps` / `userAppsKeyed` / `allApps` shapes unchanged. |
| Context menu z-index conflict with new dialog | CLOSED — `AddWebAppDialog` reuses the same `Dialog` primitive as `NewFolderDialog`, no new z-stacking. |
| `extractMetadata` slow on first call → bad UX | MITIGATED — 300 ms debounce + spinner + retry button. |
| `webapps.list` polling blasts livinityd | CLOSED — `useQuery` with 30 s `staleTime`, no interval polling. Invalidations on create/delete are the only refresh signal. |
| New routes accidentally on WS transport | CLOSED — grep verifies all 4 routes in `httpOnlyPaths` (commit `dfac4bb5`). |
| Sacred SHA drift via stray import | CLOSED — verified after every commit. |

---

## Files changed

```
livos/packages/livinityd/source/modules/server/trpc/common.ts          | +18  (httpOnlyPaths)
livos/packages/livinityd/source/modules/webapps/trpc-router.ts          | +151 -5  (CRUD procedures)
livos/packages/livinityd/source/modules/webapps/webapps-repository.ts   | +160 -19 (CRUD repo helpers)
livos/packages/ui/src/hooks/use-launch-webapp.ts                        | +26  (stub hook)
livos/packages/ui/src/modules/desktop/add-webapp-dialog.tsx             | +308 (new dialog)
livos/packages/ui/src/modules/desktop/desktop-content.tsx               | +20 -2  (grid integration)
livos/packages/ui/src/modules/desktop/desktop-context-menu.tsx          | +12  (menu item + dialog mount)
livos/packages/ui/src/modules/desktop/webapp-icon.tsx                   | +112 (new icon component)
livos/packages/ui/src/providers/apps.tsx                                | +63 -2  (webapps + desktopEntries)
```
