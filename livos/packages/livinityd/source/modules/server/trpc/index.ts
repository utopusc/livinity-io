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
// Phase 202-07 — MCP external server config sub-router. Merged into the
// existing `mcp.*` namespace as `mcp.config.*` (list/add/update/delete/toggle).
// Backed by Redis hash `liv:mcp:config` (D-202-12). Mutations do NOT hot-reload
// the running McpBridge — UI surfaces a "Changes take effect on next service
// restart." banner. All five paths added to httpOnlyPaths in ./common.ts
// (WS-reconnect-survival after `systemctl restart livos`).
//
// Factory-DI pattern: production livinityd boot supplies a real
// createMcpConfigRouter({redis: this.ai.redis, logger}) build via
// setProductionAppRouter. The default mcpConfigRouter throws
// PRECONDITION_FAILED on every call (mirrors xaiAuth + mastra +
// agents pattern).
import {mcpConfigRouter, createMcpConfigRouter} from './mcp-config-router.js'
import {skillsRouter, createSkillsRouter} from './skills-router.js'
import {skillsMarketRouter, createSkillsMarketRouter} from './skills-market-router.js'
import {claudeAuthRouter} from './claude-auth-router.js'
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
// Phase 195 — xAI OAuth auth router. Four adminProcedure procedures
// (start/status/waitForCompletion/disconnect) mount under the new
// top-level `auth.xai.*` namespace. Production wire-up at
// livinityd/source/index.ts builds via createXaiAuthRouter({flowService,
// credsService}) then injects the result via setProductionAppRouter — same
// factory-DI pattern as chromeMaster (line 89-94 / setProductionAppRouter
// line 192). The default xaiAuthRouter throws on any service access until
// real injection lands.
import {xaiAuthRouter, createXaiAuthRouter} from './xai-auth-router.js'
// Phase 196-04 — `setup.*` onboarding namespace. Single procedure today
// (`setup.setRegion`); future plans (196-05 locale+timezone) extend the
// same router. Production wire-up at livinityd/source/index.ts builds
// via createSetupRouter({redis}) then injects via setProductionAppRouter
// — same factory-DI pattern as chromeMaster (line 89-94) + xaiAuth
// (line 104). The default setupRouter Proxy throws on any service access
// until real injection lands (Plan 196-05).
import {setupRouter, createSetupRouter} from './setup-router.js'
// Phase 224 — `config.*` namespace (feature-flag accessors). Default empty-
// injection stub throws PRECONDITION_FAILED until production boot wires the
// real router via createConfigRouter({redis}). UI consumes this via the
// useV42MigrationActive() hook in Phase 224-02 + 224-03.
import {configRouter, createConfigRouter} from './config-router.js'
// Phase 197-05 — Liv AI Mastra tRPC namespace. Plan 197-01 pre-declared the
// `mastra?: unknown` opts slot; this import narrows it to the real router
// type. Production livinityd boot supplies the createMastraRouter({...}) build
// via the chromeMaster try/catch (same DI pattern as 196-01).
import {mastraRouter, createMastraRouter} from './mastra-router.js'
// Phase 202-03 — Agents Platform CRUD + task lifecycle routers. Two
// factory-DI routers (createAgentRouter + createAgentTaskRouter) consumed by
// the boot wire-up the same way chromeMaster / xaiAuth / mastra are wired.
// Both factories require `livOSMastra` + a logger; createAgentRouter ALSO
// needs the `AgentRepository` instance so CRUD mutations can call
// repo.create/update/delete directly without going through the registry.
//
// The default exports are empty-injection stubs that throw on first call —
// boot wire-up replaces them via setProductionAppRouter().
import {createAgentRouter} from './agent-router.js'
import {createAgentTaskRouter} from './agent-task-router.js'
// Phase 203-04 — `openclawos.apps.*` namespace. Factory-DI: production
// livinityd boot supplies a real `createOpenclawosAppsRouter({repo, logger})`
// built against an OpenUIAppsRepository instance. The default exported
// router is an empty-injection stub that throws PRECONDITION_FAILED on
// every call until boot wires the real repo. All 6 procedure paths are
// added to `httpOnlyPaths` in ./common.ts so the plugin's loopback fetch
// from `liv-claw-gateway.service` can never accidentally route via WS.
import {
	createOpenclawosAppsRouter,
	openclawosAppsRouter,
} from './openclawos-router.js'
// Phase 205-04 — `openclawos.gateway.*` namespace. Factory-DI: production
// livinityd boot supplies a real `createOpenclawosGatewayRouter({configStore,
// devicesDir, redis, logger})` build. The default exported router is an
// empty-injection stub that throws PRECONDITION_FAILED + OPENCLAW_GATEWAY_UNAVAILABLE
// on every call until production boot wires the real deps. All 8 procedure
// paths are added to httpOnlyPaths in ./common.ts so the Gateway tab
// mutations (revoke / setMode / rotateToken) survive `systemctl restart
// livos` mid-call (pitfall B-12 / X-04).
import {
	createOpenclawosGatewayRouter,
	openclawosGatewayRouter,
} from './openclawos-gateway-router.js'
// Phase 204-01 — `provider.config.*` namespace. Factory-DI: production
// livinityd boot supplies a real `createProviderConfigRouter({keyStore,
// envFileWriter, restartHook, logger})` build. The default exported
// router is an empty-injection stub that throws PRECONDITION_FAILED +
// PROVIDER_CONFIG_UNAVAILABLE on every call until boot wires the real
// deps. All 3 procedure paths are added to `httpOnlyPaths` in ./common.ts
// so the settings UI mutations survive `systemctl restart livos` mid-call.
import {
	createProviderConfigRouter,
	providerConfigRouter,
} from './provider-config-router.js'
// Phase 206 — `openclaw.*` namespace. Factory-DI: production livinityd boot
// supplies a real `createOpenclawCliRouter({stateDir, onProvidersChanged,
// logger})` build. The default exported router throws PRECONDITION_FAILED +
// OPENCLAW_CLI_UNAVAILABLE on every call until boot wires the real deps.
// All paths added to httpOnlyPaths in ./common.ts so settings + composer
// mutations survive `systemctl restart livos` mid-call.
import {
	createOpenclawCliRouter,
	openclawCliRouter,
} from './openclaw-router.js'

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
	// Phase 195 — xAI OAuth auth router. Optional with empty-injection
	// fallback so back-compat callers (and the default appRouter below)
	// keep type-checking. Production livinityd boot supplies a real
	// `createXaiAuthRouter({flowService, credsService})` build.
	xaiAuth?: ReturnType<typeof createXaiAuthRouter>
	// Phase 196-04 — `setup.*` onboarding namespace. Optional with
	// empty-injection fallback. Plan 196-05 supplies the production
	// `createSetupRouter({redis})` build alongside the locale step
	// wire-up.
	setup?: ReturnType<typeof createSetupRouter>
	// Phase 197-05 — Liv AI / Mastra tRPC namespace slot. Narrowed from
	// Plan 197-01's `unknown` placeholder to the real router type at this
	// plan. Production swap in livinityd boot via createMastraRouter({...}).
	mastra?: ReturnType<typeof createMastraRouter>
	// Phase 202-03 — Agents Platform CRUD + task router slots. Both default
	// to undefined; when boot wires them, they mount as `agents.*` and
	// `agents.tasks.*`. When undefined, the legacy fall-through behaviour
	// (no `agents` key) preserves type inference for back-compat callers.
	agents?: ReturnType<typeof createAgentRouter>
	agentTasks?: ReturnType<typeof createAgentTaskRouter>
	// Phase 202-07 — MCP config sub-router slot. Merged into the existing
	// `mcp` namespace below as `mcp.config.*`. Optional with empty-injection
	// fallback so the default appRouter still type-checks.
	mcpConfig?: ReturnType<typeof createMcpConfigRouter>
	// Phase 224 — config.* namespace slot. Default empty-injection stub
	// throws PRECONDITION_FAILED until production boot wires the real router
	// built against a Redis client.
	config?: ReturnType<typeof createConfigRouter>
	// Phase 203-04 — `openclawos.apps.*` namespace slot. Default empty-
	// injection stub keeps the appRouter type-stable; production boot
	// supplies the real router built against `OpenUIAppsRepository` (Plan
	// 203-04). Mounted under `openclawos` as a NEW top-level namespace —
	// INV-203-09 untouched (mcp.* + agents.* contracts unchanged).
	openclawosApps?: ReturnType<typeof createOpenclawosAppsRouter>
	// Phase 205-04 — `openclawos.gateway.*` namespace slot. Default empty-
	// injection stub keeps the appRouter type-stable; production boot supplies
	// the real router built against OpenclawConfigStore (+ devicesDir + redis).
	// Mounted as a sibling of openclawosApps under the existing `openclawos`
	// namespace.
	openclawosGateway?: ReturnType<typeof createOpenclawosGatewayRouter>
	// Phase 204-01 — `provider.config.*` namespace slot. Default empty-
	// injection stub keeps the appRouter type-stable; production boot
	// supplies the real router built against ProviderKeyStore + EnvFileWriter
	// + RestartHook. Mounted under a NEW top-level `provider` namespace —
	// INV-204-08 satisfied (no other routing surface mutations beyond the 3
	// httpOnlyPaths additions).
	providerConfig?: ReturnType<typeof createProviderConfigRouter>
	// Phase 206 — `openclaw.*` namespace slot. Default empty-injection stub
	// keeps the appRouter type-stable; production boot supplies the real
	// router built against the openclaw CLI binary path + state dir +
	// onProvidersChanged hook.
	openclawCli?: ReturnType<typeof createOpenclawCliRouter>
	// Phase 219 T6 — `skills.*` namespace slot. Default empty-injection stub
	// throws PRECONDITION_FAILED until production boot wires the real router
	// built against a SkillsLoader instance.
	skills?: ReturnType<typeof createSkillsRouter>
	// Phase 219 T7 — `skills.market.*` sub-router (curated registry +
	// install). The stub `skillsMarketRouter` has a working `list` (catalog
	// is a TS const, no IO needed) but `install` throws PRECONDITION_FAILED
	// until production boot wires a real createSkillsMarketRouter({...}).
	skillsMarket?: ReturnType<typeof createSkillsMarketRouter>
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
		// Phase 202-07 — `mcp.config.*` sub-router merged in. Default empty-
		// injection stub keeps `mcp.config.list` reachable from typed clients
		// even when production boot hasn't yet swapped the real router in.
		mcp: t.mergeRouters(
			mcpRouter,
			router({config: opts.mcpConfig ?? mcpConfigRouter}),
		),
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
		// Phase 195 — xAI OAuth auth namespace (`auth.xai.*`). Four
		// adminProcedure procedures wire XaiAuthFlowService (195-01) +
		// XaiCredentialsService (195-02) into the onboarding UI seam (195-04).
		// All four paths are added to httpOnlyPaths in ./common.ts because
		// waitForCompletion is a 10-min long-poll mutation that must survive
		// WS reconnect after `systemctl restart livos` (memory pitfall
		// B-12 / X-04). Default `xaiAuthRouter` throws on access until
		// production swap (mirrors chromeMaster factory pattern above).
		// Phase 221 — `auth.claude.*` HTTP proxy to liv-core /api/claude/* so
		// claw-client ProvidersTab can run the Claude OAuth PKCE flow with
		// the same callMutation/callQuery plumbing every other admin action
		// uses. Stateless — no factory needed.
		auth: router({xai: opts.xaiAuth ?? xaiAuthRouter, claude: claudeAuthRouter}),
		// Phase 196-04 — setup.setRegion onboarding-only mutation namespace.
		// The empty-injection default setupRouter throws on any procedure call
		// until Plan 196-05's production swap injects a real
		// createSetupRouter({redis}) build.
		setup: opts.setup ?? setupRouter,
		// Phase 224 — config.* namespace (Redis-backed feature flags). Mounts
		// `config.getV42MigrationActive` for the v42 migration UI hides.
		config: opts.config ?? configRouter,
		// Phase 197-05 — Liv AI Mastra namespace. Empty-injection default
		// `mastraRouter` throws PRECONDITION_FAILED until production swap
		// injects a real createMastraRouter({livOSMastra, approvalManager})
		// build via the chromeMaster try/catch in livinityd start().
		mastra: opts.mastra ?? mastraRouter,
		// Phase 202-03 — Agents Platform namespace. Combines the CRUD router
		// (agents.list/get/create/update/delete/runOnce/cronPreview) with the
		// task lifecycle sub-router (agents.tasks.{create,list,get,cancel}).
		// When the boot wire-up has not yet supplied both factories, fall back
		// to an empty stub router so type inference still works.
		agents: (() => {
			if (opts.agents && opts.agentTasks) {
				return t.mergeRouters(
					opts.agents,
					router({tasks: opts.agentTasks}),
				)
			}
			if (opts.agents) {
				return opts.agents
			}
			// Empty stub — every procedure call throws PRECONDITION_FAILED via
			// adminProcedure auth + the bare router has no procedures at all.
			// Production boot is expected to inject both routers; the stub is
			// only here to keep `createAppRouter()` shape stable for tests.
			return router({})
		})(),
		// Phase 203-04 — `openclawos.apps.*` namespace (slug-keyed Postgres
		// app registry consumed by the rebranded liv-claw plugin). The
		// default `openclawosAppsRouter` stub throws PRECONDITION_FAILED +
		// OPENUI_REPO_UNAVAILABLE on every call until production boot swaps
		// in a real `createOpenclawosAppsRouter({repo})` build.
		openclawos: router({
			apps: opts.openclawosApps ?? openclawosAppsRouter,
			// Phase 205-04 — `openclawos.gateway.*` admin namespace for the
			// in-chat Gateway tab. Default empty-injection stub throws
			// PRECONDITION_FAILED + OPENCLAW_GATEWAY_UNAVAILABLE until
			// production boot wires the real router.
			gateway: opts.openclawosGateway ?? openclawosGatewayRouter,
		}),
		// Phase 204-01 — `provider.config.*` namespace (LLM provider API
		// key entry for liv-claw-gateway). Default empty-injection stub
		// throws PRECONDITION_FAILED + PROVIDER_CONFIG_UNAVAILABLE until
		// production boot swaps in a real
		// `createProviderConfigRouter({keyStore, envFileWriter, restartHook,
		// logger})` build.
		provider: router({
			config: opts.providerConfig ?? providerConfigRouter,
		}),
		// Phase 206 — `openclaw.*` namespace (CLI-wrapped provider+model
		// config). Default empty-injection stub throws PRECONDITION_FAILED +
		// OPENCLAW_CLI_UNAVAILABLE until production boot swaps in a real
		// `createOpenclawCliRouter({...})` build.
		openclaw: opts.openclawCli ?? openclawCliRouter,
		// Phase 219 T6+T7 — `skills.*` namespace combines:
		//   - skills.{list,get,delete} (T6, per-agent CRUD over SkillsLoader)
		//   - skills.market.{list,install} (T7, curated registry → write to disk)
		// Both default to empty-injection stubs; production boot supplies the
		// real instances.
		skills: t.mergeRouters(
			opts.skills ?? skillsRouter,
			router({market: opts.skillsMarket ?? skillsMarketRouter}),
		),
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
