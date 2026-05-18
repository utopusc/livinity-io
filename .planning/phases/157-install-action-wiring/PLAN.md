# Phase 157 — Install Action Wiring — PLAN

**Wave structure:** 3 waves (Vercel / LivOS UI / livinityd). Vercel ships first (immediate), LivOS UI + livinityd ship via operator deploy.

## Wave V — Vercel (this commit, immediate)

| # | Task | File | Type |
|---|---|---|---|
| V-01 | Extend `StoreToLivOSMessage.install` with `section: Section` field. | `platform/web/src/app/store/types.ts` | edit |
| V-02 | Update `sendInstall` signature: `sendInstall(appId: string, section: Section)`. Forwards section into postMessage. | `platform/web/src/app/store/hooks/use-post-message.ts` | edit |
| V-03 | Same in `StoreContextValue` interface — update both the type and the provider. | `platform/web/src/app/store/types.ts` + `store-provider.tsx` | edit |
| V-04 | AppCard: add inline Install button with section-aware copy. Renders only when embedded; shows "Get" link to detail otherwise. State machine: not_installed → Install, installing → progress chip, running/stopped → Open + small uninstall icon. | `platform/web/src/app/store/components/app-card.tsx` | edit |
| V-05 | Detail page InstallStateButton: pass `app.section` to `sendInstall(app.id, app.section)`. | `platform/web/src/app/store/[id]/app-detail-client.tsx` | edit |
| V-06 | CustomUrlForm: no change — already calls `sendInstallCustomWebapp` directly. | — | — |
| V-07 | tsc check + commit + push (Vercel auto-deploys). | — | run |

**Wave V deliverable:** AppCard has inline install button. postMessage carries section. Vercel deploys cleanly. Old LivOS UI (pre-Wave-U) still works for section='app' (compatible — section field is ignored by legacy bridge).

## Wave U — LivOS UI (operator-walk on Mini PC)

| # | Task | File | Type |
|---|---|---|---|
| U-01 | Mirror the Vercel `StoreToLivOSMessage` types verbatim into the bridge — including `installCustomWebapp` and section on install. | `livos/packages/ui/src/hooks/use-app-store-bridge.ts` | edit |
| U-02 | `handleInstall` becomes a switch on `data.section`. Default branch (= 'app' or undefined) keeps the legacy Docker install path. New branches call new trpc procedures (added in Wave L). | same | edit |
| U-03 | New `handleInstallCustomWebapp(url, title, faviconUrl)` calls `trpcClient.webapp.create.mutate(...)`. Send `installed` back to iframe on success. | same | edit |
| U-04 | Progress polling: each new dispatch returns an outcome with a tracking ID; bridge polls `trpcClient.apps.installProgress.query({appId})` (new procedure, see Wave L). | same | edit |
| U-05 | Rebuild UI: `pnpm --filter ui build`. Deploy via `bash /opt/livos/update.sh` on Mini PC. | — | run |

**Wave U deliverable:** Bridge dispatches by section. Custom URL form actually pins to dock. tsc + lint clean.

## Wave L — livinityd (operator-walk on Mini PC)

| # | Task | File | Type |
|---|---|---|---|
| L-01 | Service container wiring: instantiate `InstallDispatcher`, register `NativeInstaller`, `AiInstaller`, `PluginInstaller`. Boot `PluginLoader.scan()`. | `livos/packages/livinityd/source/main.ts` (or current bootstrap file) | edit |
| L-02 | New trpc procedures under `apps.*`: `installNative`, `installAi`, `installPlugin`. Each fetches the catalog row, builds InstallContext, calls dispatcher. | `livos/packages/livinityd/source/modules/server/trpc/apps.ts` | edit |
| L-03 | New trpc procedure `webapp.installFromCatalog({appId})` — reads catalog row, calls existing `webapp.create` with manifest.url / defaultTitle / iconOverride. | `livos/packages/livinityd/source/modules/webapps/trpc-router.ts` | edit |
| L-04 | New trpc procedure `apps.installProgress({appId})` — returns latest progress event for the appId (kept in-memory or Redis). | `livos/packages/livinityd/source/modules/server/trpc/apps.ts` | edit |
| L-05 | Express middleware `app.use('/p/:id/*', ...)` that delegates to `pluginLoader.dispatchRequest`. Static asset fallthrough for `/p/:id/_ui/*` via `express.static(pluginDir + '/ui')`. | `livos/packages/livinityd/source/modules/server/index.ts` | edit |
| L-06 | Slash-command fallthrough: when AI Chat receives `/foo` and no built-in handler matches, call `pluginLoader.dispatchCommand`. | `livos/packages/livinityd/source/modules/ai/agent-runs.ts` (where slash commands are routed) | edit |
| L-07 | WebSocket broadcast: wire `pluginLoader.onBroadcast` to the existing Supabase Realtime presence channel (Phase 146) or to the livinityd→UI WS already serving status messages. | `livos/packages/livinityd/source/main.ts` | edit |
| L-08 | Sudoers file deploy: `sudo install -m 0440 -o root -g root scripts/install/sudoers.d/livos-native /etc/sudoers.d/livos-native` (operator command in update.sh; add to `scripts/install/deploy-livinityd.sh` if not already there). | `scripts/install/deploy-livinityd.sh` | edit |
| L-09 | Rebuild livinityd: `pnpm --filter livinityd build` (or tsx directly — livinityd runs from source per project memory). Restart livinityd via `systemctl restart livos`. | — | run |

**Wave L deliverable:** Dispatcher live in livinityd. 4 new trpc routes + 1 webapp catalog route + 1 Express plugin middleware. Sudoers deployed. tsc clean against existing livinityd config.

## Wave UAT — Operator walks each section

| # | Section | Steps | Expected |
|---|---|---|---|
| UAT-01 | `app` | Install n8n from store | Existing Docker flow — running container, dock item, credentials dialog |
| UAT-02 | `webapp` Custom URL | Paste `https://anthropic.com`, click Add to dock | Window appears on dock pointing at anthropic.com |
| UAT-03 | `webapp` curated | Install Notion from store | Same outcome via curated catalog row |
| UAT-04 | `native` | Install VS Code from store | apt install runs; `.desktop` written; dock item appears; click opens VS Code window via x11vnc |
| UAT-05 | `ai` MCP | Install GitHub MCP (provide PAT via envSchema prompt) | `liv:cap:github` server registered; AI Chat lists github tools |
| UAT-06 | `ai` agent | Install Code Reviewer agent template | New row in `agent_templates`; AI Chat agent list shows it |
| UAT-07 | `ai` GSD | Install GSD Planning Skills | `liv:gsd:installed` flag set; AI Chat surfaces /gsd-* commands |
| UAT-08 | `plugin` | Install Livinity Broker plugin (after operator builds + signs .livpkg.tgz, updates Supabase sha256, pushes GitHub release) | Routes mount at `/p/livinity-broker/v1/*`; settings widget appears in /store settings panel; broker-managed api-key generation works |
| UAT-09 | failure case | Install a section='native' app with a deliberately-wrong apt package name in admin panel | Error toast surfaces on card; install state returns to not_installed |
| UAT-10 | uninstall | Uninstall n8n, Notion webapp, VS Code, github MCP, Livinity Broker | Each cleans up: Docker stops + removes; webapp row deleted; .desktop removed; mcp config entry removed; plugin unmounted from runtime |

## Wave order

1. Wave V ships now (~30 min — tight, well-scoped Vercel edits).
2. Operator wakes, reviews Vercel deploy.
3. Operator triggers Wave U + Wave L together (one Mini PC deploy cycle).
4. Operator walks UAT-01..10.
5. v37 milestone audit + complete + cleanup.

## Acceptance (whole phase)

- [ ] Wave V committed + Vercel build green + smoke passes on localhost:3001
- [ ] Wave U + L deployed to Mini PC, livinityd + UI restarted clean
- [ ] All 10 UAT steps PASS
- [ ] tsc clean across all 3 packages (platform/web, livinityd, ui)
- [ ] No regression in section='app' Docker install (the 27 existing apps still work)
- [ ] v37 milestone audit → SHIPPED

## Resume after /clear

Read `.planning/phases/157-install-action-wiring/CONTEXT.md` then this PLAN.md. Start at Wave V Task V-01 — Vercel commits are immediate and low-risk; ship Wave V, push, then schedule Wave U + L with operator.
