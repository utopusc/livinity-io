# Phase 157 — Install Action Wiring — CONTEXT

**Milestone:** v37.0 Store Reimagining + Plugin Platform (last v37 phase before lifecycle audit)
**Status:** PLANNED 2026-05-18 — operator reported "install çalışmıyor"
**Depends on:** Phase 148-156 ✅ (catalog + UI + DS port + admin + Wave B handlers exist)
**Trigger:** Operator click on Install (in /store and /store/[id]) fires postMessage but LivOS host bridge silently ignores new section types.

## The bug, in one paragraph

`useAppStoreBridge` in `livos/packages/ui/src/hooks/use-app-store-bridge.ts` carries its own copy of the postMessage protocol (duplicated from `platform/web/src/app/store/types.ts`). When v37 added (a) the `installCustomWebapp` message type and (b) new sections (webapp/native/ai/plugin) with non-Docker manifests, the LivOS UI bridge was not updated. So:

- **section='app' install (legacy Docker apps):** still works — bridge calls `trpcClient.apps.install.mutate({appId})` which dispatches Docker compose.
- **section='webapp' Custom URL "Add to dock":** fires `installCustomWebapp` → bridge ignores unknown type → nothing happens. Operator sees the button "Added" optimistic UI but the webapp never appears on the dock.
- **section='webapp' curated entries (Notion etc.):** fires `install` with composeUrl pointing at `/api/apps/notion/compose` → returns stub `# webapp — opens in dock window` text → `trpcClient.apps.install` tries to docker-compose garbage → install fails server-side.
- **section='native'/'ai'/'plugin':** same failure path as curated webapps — wrong dispatch.

Plus a UX gap: AppCard has no inline Install button. Operator must click card → detail page → Install. Single-click install was in the original Claude Design but my P149.1 port dropped it.

## Scope of this phase

Three layers must all change together. Vercel-side changes are immediate (one push, one Vercel build). LivOS UI + livinityd changes need an operator deploy cycle on Mini PC.

### Vercel side (immediate)

1. **AppCard inline Install button.** Single-click install when embedded; "Get" badge link to detail when not embedded.
2. **Section-aware postMessage payload.** Extend `StoreToLivOSMessage.install` with `section: Section` so the bridge can dispatch without re-querying.
3. **Per-section "Install" copy.** Card button says "Install" for app/native, "Add to dock" for webapp, "Add" for ai, "Add plugin" for plugin.
4. **Detail page InstallStateButton already correct** — it just needs the `section` plumbed into sendInstall.

### LivOS UI side (operator deploys)

1. **Bridge protocol sync.** Update the bridge's local `StoreToLivOSMessage` to match `platform/web/src/app/store/types.ts` exactly. Add `installCustomWebapp` + `section` field on `install`.
2. **Section dispatch in `handleInstall`.** Switch on `data.section`:
   - `'app'` → existing `trpcClient.apps.install.mutate({appId})` path (unchanged)
   - `'webapp'` → new `trpcClient.webapps.installFromCatalog.mutate({appId})` (or use existing `webapp.create` if the catalog row carries a `url` in manifest)
   - `'native'` → new `trpcClient.apps.installNative.mutate({appId})` calling the `NativeInstaller` from Phase 150-B
   - `'ai'` → new `trpcClient.apps.installAi.mutate({appId})` calling the `AiInstaller` from Phase 152-B
   - `'plugin'` → new `trpcClient.apps.installPlugin.mutate({appId})` calling the `PluginInstaller` from Phase 153
3. **`installCustomWebapp` handler.** Calls `trpcClient.webapp.create.mutate({url, title, faviconUrl})` (already exists from Phase 94).
4. **Progress polling adapts.** Each handler emits via the existing `InstallProgressEvent` shape per SPEC §4 — the bridge polls and forwards as `progress`/`installed`/`uninstalled` events back to the iframe.

### livinityd side (operator deploys)

1. **Wire the install handlers into the service container.** A boot-time `livinityd/source/main.ts` change that:
   ```ts
   const dispatcher = new InstallDispatcher()
   dispatcher.register(new NativeInstaller(nativeAppConfigStore))
   dispatcher.register(new AiInstaller(mcpConfigManager))
   const pluginLoader = new PluginLoader({pluginsDir: '/opt/livos/plugins', ...})
   dispatcher.register(new PluginInstaller({loader: pluginLoader, ...}))
   await pluginLoader.scan()  // boot-time mount of any already-installed plugins
   ```
2. **New trpc procedures.**
   - `apps.installNative({appId})` — fetches catalog row from Supabase via existing app-store client, calls `dispatcher.install(row, ctx, emit)`
   - `apps.installAi({appId})` — same
   - `apps.installPlugin({appId})` — same
   - `webapps.installFromCatalog({appId})` — reads catalog row, calls `webapp.create` with `manifest.url + manifest.defaultTitle + manifest.iconOverride`
3. **Express middleware for `/p/:id/*` route.** Mount once at server boot. The middleware delegates to `pluginLoader.dispatchRequest(req.params.id, req.method, req.path.replace('/p/<id>', ''), req, res)`.
4. **Slash-command bridge to AI Chat.** AI Chat's command bar already routes `/foo` strings — add a fallthrough to `pluginLoader.dispatchCommand(slash, args, ctx)` when no built-in handler matches.
5. **WebSocket broadcast hookup.** The `PluginLoader` constructor accepts `onBroadcast` callback — wire it to whatever WS channel the UI listens on (existing presence channel from Phase 146 works).

## Deferred (out of P157)

- Per-plugin Postgres role with `GRANT` on declared tables — currently `runtime-api.ts` exposes the full pgPool. Tightening is v38.
- Network outbound DNS filtering for plugin capability.network — runtime check, v38.
- v38 community/verified signing tiers in `signature-verify.ts`.
- Plugin marketplace submission portal beyond `/developers` docs.

## Implementation Decisions

- **`Section` field on postMessage.** Required field, not optional — every install message after this phase carries it, even for `'app'`. The bridge errors loudly on missing section instead of falling through to the wrong handler.
- **Backward compat.** The bridge's existing logic for `section='app'` (or missing section, treated as 'app') stays. Old livinity.io builds embedded inside LivOS keep working.
- **Failure UX.** When dispatcher returns `{ok: false, code, message}`, bridge forwards a `installed` message with `success: false, error: message` to the iframe. AppCard + detail page surface this as an error toast.
- **No "demo mode" install in browser.** Browser preview still shows disabled "Browser preview" button on detail page. Card "Get" badge becomes a link to detail page when not embedded.

## Files to touch

**Vercel (this commit):**
- `platform/web/src/app/store/types.ts` — `StoreToLivOSMessage.install` gains `section: Section`
- `platform/web/src/app/store/hooks/use-post-message.ts` — `sendInstall` accepts + forwards section
- `platform/web/src/app/store/components/app-card.tsx` — inline Install button per section
- `platform/web/src/app/store/[id]/app-detail-client.tsx` — pass `app.section` to sendInstall

**LivOS UI (operator deploys):**
- `livos/packages/ui/src/hooks/use-app-store-bridge.ts` — protocol sync + section dispatch + installCustomWebapp handler

**livinityd (operator deploys):**
- `livos/packages/livinityd/source/main.ts` (or wherever the service container is wired) — register dispatcher + loader at boot
- `livos/packages/livinityd/source/modules/server/trpc/apps.ts` (or split into new file) — 4 new install procedures
- `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` — `installFromCatalog` procedure
- `livos/packages/livinityd/source/modules/server/index.ts` — Express `/p/:id/*` middleware

## Acceptance

- [ ] AppCard renders inline Install button with section-appropriate copy
- [ ] Clicking Install on a section='app' card → existing Docker install flow works end-to-end
- [ ] Clicking "Add to dock" in Custom URL form → webapp appears on dock within 5s
- [ ] Clicking Install on a section='webapp' curated card → same as Custom URL outcome
- [ ] Clicking Install on a section='native' card (VSCode) → apt path runs → .desktop file appears → dock item created
- [ ] Clicking Install on a section='ai' card (github MCP) → server registered in mcpConfigManager → AI Chat lists github tools
- [ ] Clicking Install on the livinity-broker plugin → routes mount under /p/livinity-broker/ within 5s
- [ ] Failure UX: install error from any handler surfaces as a toast on the card/detail
- [ ] tsc clean (Vercel + LivOS UI + livinityd)
- [ ] Operator UAT: install VS Code from store → window opens with VS Code

## What unblocks v37 milestone close

This is the last v37 phase. After P157 ships + UAT passes:

```
/gsd-audit-milestone v37
/gsd-complete-milestone v37
/gsd-cleanup
```

closes v37 and archives the planning artifacts.

See also: [[148-SPEC]] §4 (install handler interface), [[149-store-ui-redesign]], [[150-native-apps-section]], [[151-webapp-section]], [[152-ai-section]], [[153-plugin-runtime]], [[154-broker-plugin]].
