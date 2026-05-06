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
import ai from '../../ai/routes.js'
import usage from '../../usage-tracking/routes.js'
import domain from '../../domain/routes.js'
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
// v31.0 Phase 71-05 — Computer Use desktop session control (CU-FOUND-04).
// Top-level `computerUse` namespace exposes getStatus / startStandaloneSession
// / stopSession. All three are added to httpOnlyPaths in ./common.ts because
// the mutations may take 1-15s (Bytebot spawn budget) and must survive WS
// reconnect.
import {computerUseRouter} from '../../computer-use/routes.js'
// v32 Phase 85 (UI slice) — agents tRPC router (Wave 2). Consumes the Wave 1
// agents-repo from database/index.ts. Eight procedures (list/get/create/
// update/delete/publish/unpublish/clone) — all added to httpOnlyPaths in
// ./common.ts so autosave mutations don't hang on a half-broken WS after
// `systemctl restart livos` (memory pitfall B-12 / X-04).
import agentsRouter from './agents-router.js'
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
// v32-redo Stage 2b — conversations namespace. Six procedures
// (list/get/create/delete/listMessages/appendMessage) wrapping the existing
// ConversationsRepository + MessagesRepository (Phase 75-01). Powers the
// ai-chat-suna sidebar feed + thread view + composer persistence path. All
// 6 paths added to httpOnlyPaths in ./common.ts (mutations must survive
// `systemctl restart livos` mid-restart per pitfall B-12 / X-04).
import conversationsRouter from './conversations-router.js'

import {type WebSocketServer} from 'ws'
import type Livinityd from '../../../index.js'

// Merge Phase 47 healthProbe into the existing apps router (tRPC v11 mergeRouters).
const apps = t.mergeRouters(appsBase, diagnosticsRoutes.appsHealthRouter)

const appRouter = router({
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
	ai,
	usage,
	domain,
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
	// v31.0 Phase 71-05 — computerUse namespace (CU-FOUND-04).
	computerUse: computerUseRouter,
	// v32 Phase 85 (UI slice) — agents namespace (consumes Wave 1 agents-repo).
	agents: agentsRouter,
	// v32 Phase 86 — marketplace namespace (public browse + clone-to-library).
	marketplace: marketplaceRouter,
	// v32 Phase 84 — MCP single-source-of-truth namespace (Wave 3).
	mcp: mcpRouter,
	// v32-redo Stage 2b — conversations namespace (sidebar feed + thread view).
	conversations: conversationsRouter,
})

export type AppRouter = typeof appRouter

export const trpcExpressHandler = createExpressMiddleware({
	router: appRouter,
	createContext: createContextExpress,
	onError({error, ctx}) {
		ctx?.logger.error(`${ctx?.request?.method} ${ctx?.request?.path}`, error)
	},
})

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
		router: appRouter,
		createContext: ({req}) => createContextWss({livinityd, logger, req}),
		onError({error, ctx, path}) {
			logger.error(`WS ${path}`, error)
		},
	})
}
