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
