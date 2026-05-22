import {createExpressMiddleware} from '@trpc/server/adapters/express'
import {applyWSSHandler} from '@trpc/server/adapters/ws'

import {router, t} from './trpc.js'
import {createContextExpress, createContextWss} from './context.js'
import migration from '../../migration/routes.js'
import system from '../../system/routes.js'
import wifi from '../../system/wifi-routes.js'
import user from '../../user/routes.js'
import preferences from '../../user/preferences-routes.js'
import {appStore, apps as appsBase} from '../../apps/routes.js'
import widget from '../../widgets/routes.js'
import files from '../../files/routes.js'
import notifications from '../../notifications/routes.js'
import eventBus from '../../event-bus/routes.js'
import backups from '../../backups/routes.js'
import usage from '../../usage-tracking/routes.js'
import domain from '../../domain/routes.js'
// Phase 104 plan 104-03 — local-lan mode tRPC routes (local.{getStatus,activate,getCaCert}).
// All 3 paths route via HTTP per common.ts httpOnlyPaths — local.activate does
// systemctl reload + file I/O (1-5s) that must survive `systemctl restart livos`.
import localDns from '../../local-dns/routes.js'
import docker from '../../docker/routes.js'
import scheduler from '../../scheduler/routes.js'
import monitoring from '../../monitoring/routes.js'
import pm2 from '../../pm2/routes.js'
import devices from '../../devices/routes.js'
import audit from '../../devices/audit-routes.js'
import devicesAdmin from '../../devices/admin-routes.js'
import fail2ban from '../../fail2ban-admin/routes.js'
// v29.4 Phase 47 Plan 05 — AI Diagnostics. Per G-07 namespacing Option B:
// `capabilitiesRouter` mounts as a fresh top-level `capabilities` namespace,
// while `appsHealthRouter` merges into the existing `apps` namespace so
// `apps.healthProbe` is reachable alongside `apps.list`/`apps.myApps`/etc.
import diagnosticsRoutes from '../../diagnostics/routes.js'
// v30.0 Phase 59 Plan 04 — Bearer token API keys (FR-BROKER-B1-04).
// Top-level `apiKeys` namespace exposes create / list / revoke /
// listAll. All four mutations/queries are also added to httpOnlyPaths
// in ./common.ts so the React client routes them through HTTP (cookie
// + header semantics survive WS reconnect after `systemctl restart livos`).
import apiKeys from '../../api-keys/routes.js'
// v32 Phase 86 — Public marketplace router (V32-MKT-01..06). File-disjoint
// from P85-UI's agents-router (same directory, separate router). Three
// procedures: list (publicProcedure query — no auth, browseable pre-login),
// tags (publicProcedure query — distinct public tag strings),
// cloneToLibrary (privateProcedure mutation — wraps cloneAgentToLibrary).
// All three procedure paths added to httpOnlyPaths in ./common.ts.
import marketplaceRouter from './marketplace-router.js'
// v32 Phase 84 — MCP single-source-of-truth router (Wave 3). Six procedures
// (search/getServer/installToAgent/removeFromAgent/smitheryConfigured/
// setSmitheryKey). Dispatches to either the Official MCP Registry
// (registry.modelcontextprotocol.io) or Smithery (server.smithery.ai;
// gated by the liv:config:smithery_api_key Redis key). Consumes
// agents-repo via database/index.ts barrel — does NOT touch agents-repo
// or agents-router. All 6 procedure paths added to httpOnlyPaths in
// ./common.ts (same WS-reconnect-survival rationale as P85-UI / P86).
import mcpRouter from './mcp-router.js'
// v33 Phase 92 — webapp metadata extractor (V33-WEBAPP-01). Single procedure
// `webapp.extractMetadata({url})` returning `{title, faviconUrl, description,
// ogImage}`. The path is added to httpOnlyPaths in ./common.ts because clean
// cache misses can take up to 8s (fetch + parse) and we don't want a
// half-broken WS dropping the response after `systemctl restart livos`.
// CRUD procedures (create/list/delete/update) are deferred to P94.
import {webappRouter} from '../../webapps/index.js'
import streamsRouter from '../../streaming/trpc-router.js'
// Phase 101-03 — Native-app CRUD router (apps.native.{list,get,create,delete}).
// Merged into the existing `apps` namespace below alongside Phase 47
// healthProbe. All 4 paths are added to httpOnlyPaths in ./common.ts.
import {nativeAppsRouter} from '../../apps/native-routes.js'
// Phase 102-07 - Chrome Master Login tRPC routes (D-102-MASTER-LOGIN-UI).
// Top-level `chromeMaster` namespace exposes status / startLogin / reset /
// restoreBackup. The three mutations are adminProcedure-gated (T-102-07).
// All 4 procedure paths are added to httpOnlyPaths in ./common.ts so
// long-running spawn mutations don't hang on a half-broken WS after
// `systemctl restart livos` (memory pitfall B-12 / X-04).
//
// Phase 103-01 — `chromeMasterRouter` here is the empty-injection
// back-compat default; startLogin / stopLogin / input.* throw
// INTERNAL_SERVER_ERROR until the production wire-up at
// livinityd/source/index.ts calls `setProductionAppRouter(...)` with a
// router built via `createAppRouter({chromeMaster: createChromeMasterRouter
// ({displayAllocator, streamManager, profileSeeder})})`. The middleware
// proxies (trpcExpressHandler / trpcWssHandler) re-resolve to the swapped
// router on every request.
import {
	chromeMasterRouter,
	createChromeMasterRouter,
} from '../../chrome-master/index.js'
// Phase 131-02 V36-PIN-02 — pinned-windows namespace. Three procedures
// (list / upsert / delete) backed by the `pinned_windows` Postgres
// table (D-131-A). All three are added to httpOnlyPaths in
// ./common.ts so mutations survive WS reconnect after `systemctl
// restart livos` (precedent: webapp.create line 360, conversations.
// appendMessage line 312, agents.create line 256).
import pinnedWindowsRouter from '../../pinned-windows/routes.js'

import {type WebSocketServer} from 'ws'
import type Livinityd from '../../../index.js'

// Merge Phase 47 healthProbe + Phase 101-03 native-app sub-router into the
// existing apps router (tRPC v11 mergeRouters). The wrapper `router({native:
// nativeAppsRouter})` creates the `apps.native.*` sub-namespace path shape;
// merging it with the base preserves all pre-existing `apps.*` procedures.
const apps = t.mergeRouters(
	appsBase,
	diagnosticsRoutes.appsHealthRouter,
	router({native: nativeAppsRouter}),
)

/**
 * Phase 103-01 — factory form of the appRouter. Production wire-up
 * (livinityd/source/index.ts after streamManager + profileSeeder + display
 * allocator exist) calls this with a chromeMaster router built via
 * createChromeMasterRouter({...real deps...}). The empty-default
 * `chromeMasterRouter` still works for back-compat with status / reset /
 * restoreBackup; startLogin / stopLogin / input.* throw INTERNAL_SERVER_ERROR
 * until the production swap lands.
 */
export function createAppRouter(opts: {
	chromeMaster: ReturnType<typeof createChromeMasterRouter>
}) {
	return router({
		migration,
		system,
		wifi,
		user,
		preferences,
		appStore,
		apps,
		widget,
		files,
		notifications,
		eventBus,
		backups,
		usage,
		domain,
		// Phase 104 plan 104-03 — local-lan mode namespace.
		local: localDns,
		docker,
		scheduler,
		monitoring,
		pm2,
		devices,
		audit,
		devicesAdmin,
		fail2ban,
		// v29.4 Phase 47 Plan 05 — AI Diagnostics admin namespace (FR-TOOL-01/02 + FR-MODEL-01).
		capabilities: diagnosticsRoutes.capabilitiesRouter,
		// v30.0 Phase 59 Plan 04 — apiKeys namespace (FR-BROKER-B1-04).
		apiKeys,
		// v32 Phase 86 — marketplace namespace (public browse + clone-to-library).
		marketplace: marketplaceRouter,
		// v32 Phase 84 — MCP single-source-of-truth namespace (Wave 3).
		mcp: mcpRouter,
		// v33 Phase 92 — webapp metadata extractor (V33-WEBAPP-01).
		// Phase 93-11 — webapp.window.* sub-router added in webappRouter.
		webapp: webappRouter,
		// v33 Phase 93 — streams.* (start/stop/list) namespace.
		streams: streamsRouter,
		// Phase 102-07 / Phase 103-01 — chromeMaster.* injected via factory.
		// Default appRouter passes the bare chromeMasterRouter (back-compat);
		// production livinityd boot replaces it via setProductionAppRouter().
		chromeMaster: opts.chromeMaster,
		// Phase 131-02 — pinnedWindows.* namespace (D-131-A persistence).
		pinnedWindows: pinnedWindowsRouter,
	})
}

// Phase 103-01 — default appRouter for type inference + back-compat with the
// tRPC client (createTRPCClient<AppRouter>). Production livinityd boot
// rebuilds an injected router and calls setProductionAppRouter(r) so the
// express + WSS handlers serve the chromeMaster routes with real deps.
const appRouter = createAppRouter({chromeMaster: chromeMasterRouter})

export type AppRouter = typeof appRouter

// Mutable late-binding slot. Defaults to the bare appRouter so tests + any
// caller that imports trpcExpressHandler BEFORE livinityd start() runs (the
// Server class does exactly that) keep working. Once livinityd start() builds
// the injected router, it calls setProductionAppRouter(r) and every
// subsequent middleware invocation routes through the injected router.
let activeAppRouter: ReturnType<typeof createAppRouter> = appRouter

/**
 * Phase 103-01 — production wire-up swap. Called from livinityd/source/index.ts
 * after StreamManager + ProfileSeeder + DisplayAllocator are constructed so
 * the chromeMaster routes can spawn Xvfb + Chrome + x11vnc + stream sessions.
 *
 * Safe to call multiple times — every swap re-creates the cached
 * createExpressMiddleware closure so the route table picks up the new router.
 */
export function setProductionAppRouter(r: ReturnType<typeof createAppRouter>): void {
	activeAppRouter = r
	cachedExpressInner = createExpressMiddleware({
		router: activeAppRouter,
		createContext: createContextExpress,
		onError({error, ctx}) {
			ctx?.logger?.error(`${ctx?.request?.method} ${ctx?.request?.path}`, error)
		},
	})
}

// Cached express middleware closure. Re-created on every setProductionAppRouter
// call so the new router is the one serving /trpc requests.
let cachedExpressInner = createExpressMiddleware({
	router: activeAppRouter,
	createContext: createContextExpress,
	onError({error, ctx}) {
		ctx?.logger?.error(`${ctx?.request?.method} ${ctx?.request?.path}`, error)
	},
})

/**
 * Express-middleware proxy. Delegates each request to the currently-cached
 * inner handler — which the production swap rebuilds against the injected
 * appRouter. Type matches the express RequestHandler signature.
 */
export const trpcExpressHandler: ReturnType<typeof createExpressMiddleware> = ((
	req,
	res,
	next,
) => cachedExpressInner(req, res, next)) as ReturnType<typeof createExpressMiddleware>

/**
 * WSS handler factory — invoked once per WebSocketServer mount. Uses the
 * current activeAppRouter so production swap is picked up at WSS install time
 * (livinityd starts the WS upgrade pipeline AFTER streaming subsystem comes
 * up — empirically the swap fires first).
 */
export const trpcWssHandler = ({
	wss,
	livinityd,
	logger,
}: {
	wss: WebSocketServer
	livinityd: Livinityd
	logger: Livinityd['logger']
}) => {
	return applyWSSHandler({
		wss,
		router: activeAppRouter,
		createContext: ({req}) => createContextWss({livinityd, logger, req}),
		onError({error, ctx, path}) {
			logger.error(`WS ${path}`, error)
		},
	})
}
