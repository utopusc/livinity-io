/**
 * Phase 195 Plan 03 — xAI OAuth auth router.
 *
 * Four `auth.xai.*` procedures, ALL adminProcedure-gated (T-195-03-01):
 *
 *   - auth.xai.start              (mutation) → XaiAuthFlowService.start(flowId)
 *                                  → {flowId, url, startedAt}
 *   - auth.xai.status             (query)    → XaiCredentialsService.getStatus()
 *                                  → XaiCredentialsStatus
 *   - auth.xai.waitForCompletion  (mutation) → XaiAuthFlowService.waitForCompletion(flowId, 600_000)
 *                                  → {success: true, completedAt}
 *   - auth.xai.disconnect         (mutation) → XaiCredentialsService.clear()
 *                                  → {ok: true}
 *
 * D-195-03-DI (CONTEXT): the router is built via `createXaiAuthRouter(deps)`.
 *   Production livinityd boot constructs the two services and injects them.
 *   The default export `xaiAuthRouter` uses empty Proxy stubs that throw on
 *   any service access — same back-compat pattern chromeMaster uses in
 *   ../../chrome-master/index.ts (its bare `chromeMasterRouter` throws
 *   PRECONDITION_FAILED until `setProductionAppRouter(...)` is called).
 *
 * D-195-03-FLOWID (T-195-03-02): flowId is generated SERVER-SIDE via
 *   `crypto.randomUUID()` so the caller can never enumerate / guess
 *   another operator's pending flow. The same flowId is then validated
 *   on waitForCompletion via a regex that mirrors the FlowService's own
 *   defense-in-depth check (`^[a-zA-Z0-9-]{8,64}$`).
 *
 * D-195-03-HTTP-ONLY (CONTEXT): all four procedure paths are added to
 *   `httpOnlyPaths` in ./common.ts. waitForCompletion is a 10-minute
 *   long-poll mutation that MUST survive WS reconnect after `systemctl
 *   restart livos`; start spawns an `opencode auth login` child (5-30s);
 *   status is a page-render dependency for the onboarding step; disconnect
 *   is autosave-adjacent. Memory pitfall B-12 / X-04 cluster.
 */

import {z} from 'zod'
import {randomUUID} from 'node:crypto'

import {adminProcedure, router} from './trpc.js'
import type {XaiAuthFlowService} from '../../xai-auth/index.js'
import type {XaiCredentialsService} from '../../xai-credentials/index.js'

// ─── Input schemas ───────────────────────────────────────────────────────

/**
 * Mirrors the FLOW_ID_REGEX in xai-auth/flow-service.ts. Defense-in-depth
 * against T-195-03-04 path-traversal attempts via flowId — the service
 * NEVER uses flowId in filesystem path construction, but rejecting
 * malformed input at the tRPC seam keeps stack traces shallow and
 * surface error messages user-friendly.
 */
const flowIdSchema = z.string().regex(/^[a-zA-Z0-9-]{8,64}$/)

const waitForCompletionInput = z.object({
	flowId: flowIdSchema,
})

// ─── Service DI shape ────────────────────────────────────────────────────

export interface XaiAuthRouterDeps {
	flowService: XaiAuthFlowService
	credsService: XaiCredentialsService
}

// ─── Factory ─────────────────────────────────────────────────────────────

/**
 * Production wire-up — invoked from livinityd start() after both services
 * are constructed:
 *
 *   const xaiAuth = createXaiAuthRouter({flowService, credsService})
 *   const appRouter = createAppRouter({chromeMaster, xaiAuth})
 *   setProductionAppRouter(appRouter)
 *
 * The empty-injection default below is preserved for back-compat with the
 * type-inference path (createAppRouter consumers don't have to construct
 * stubs in tests; the default throws on access if anyone accidentally
 * routes a request through it before the production swap lands).
 */
export function createXaiAuthRouter(deps: XaiAuthRouterDeps) {
	return router({
		/**
		 * Begin a new xAI OAuth device-code flow.
		 *
		 * Server generates the flowId (T-195-03-02 non-enumerable IDs); caller
		 * receives it back so subsequent waitForCompletion calls can target
		 * the same flow.
		 */
		start: adminProcedure.mutation(async () => {
			const flowId = randomUUID()
			const {url, startedAt} = await deps.flowService.start(flowId)
			return {flowId, url, startedAt}
		}),

		/**
		 * Read current xAI credentials status. Never throws —
		 * XaiCredentialsService.getStatus() catches all underlying I/O and
		 * decode errors and returns {connected: false} so the UI's
		 * Tier-display polling stays smooth.
		 */
		status: adminProcedure.query(async () => {
			return deps.credsService.getStatus()
		}),

		/**
		 * Long-poll: resolves when the OpenCode child exits 0 (device-code
		 * auth completed). 10-minute hard timeout matches the FlowService's
		 * default. HTTP transport required — see D-195-03-HTTP-ONLY above.
		 */
		waitForCompletion: adminProcedure
			.input(waitForCompletionInput)
			.mutation(async ({input}) => {
				const {completedAt} = await deps.flowService.waitForCompletion(
					input.flowId,
					600_000,
				)
				return {success: true as const, completedAt}
			}),

		/**
		 * Clear xAI entry from OpenCode auth.json. Idempotent —
		 * XaiCredentialsService.clear() emits a 'disconnected' event even
		 * if no xai entry was present.
		 */
		disconnect: adminProcedure.mutation(async () => {
			await deps.credsService.clear()
			return {ok: true as const}
		}),
	})
}

// ─── Empty-injection default for back-compat ─────────────────────────────

/**
 * Default export that throws on any service access. Used by `createAppRouter`
 * when no `xaiAuth` is supplied so the type-inference path in common.ts /
 * `AppRouter` still works. Production livinityd boot replaces this via the
 * factory call above.
 *
 * Mirrors the chromeMasterRouter empty-injection pattern in
 * ../../chrome-master/index.ts (its bare router throws on startLogin etc.
 * until setProductionAppRouter swaps it).
 */
function emptyInjectionStub(serviceName: string): never {
	throw new Error(
		`xai-auth-router: ${serviceName} not injected — call createXaiAuthRouter({flowService, credsService}) in livinityd boot, then setProductionAppRouter(createAppRouter({chromeMaster, xaiAuth}))`,
	)
}

export const xaiAuthRouter = createXaiAuthRouter({
	flowService: new Proxy({} as XaiAuthFlowService, {
		get() {
			return emptyInjectionStub('flowService')
		},
	}),
	credsService: new Proxy({} as XaiCredentialsService, {
		get() {
			return emptyInjectionStub('credsService')
		},
	}),
})
