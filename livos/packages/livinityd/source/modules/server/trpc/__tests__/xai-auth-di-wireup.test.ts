/**
 * Phase 196-01 — XAI auth DI wire-up regression lock.
 *
 * Proves the contract between livinityd/source/index.ts (where the two
 * service singletons are constructed and threaded through createXaiAuthRouter)
 * and modules/server/trpc/index.ts (which mounts the resulting router under
 * `auth.xai.*` via the `xaiAuth:` slot in createAppRouter).
 *
 * The tests below do NOT boot livinityd. They exercise createAppRouter +
 * createXaiAuthRouter in isolation with vi.fn() service mocks so the wire-up
 * contract is locked at the module-construction level.
 *
 * Coverage:
 *   T1 — createAppRouter mounts auth.xai.start as a callable procedure when
 *        xaiAuth is supplied (real opencode flow path).
 *   T2 — createAppRouter without xaiAuth slot still constructs (back-compat
 *        guard — Phase 195-03 empty-injection Proxy default is preserved).
 *   T3 — Task 1 graceful-degradation path: createXaiAuthRouter with a stub
 *        credsService that rejects from getStatus does NOT prevent
 *        flowService.start (auth.xai.start) from resolving — proves the
 *        flowService isolation that 196-CONTEXT.md "fail-open" decision
 *        requires for first-time auth on a clean Mini PC.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, expect, test, vi} from 'vitest'

// drivelist is a transitive native-binding dep pulled by ../index.js
// (createAppRouter → migration router → drivelist). The native .node binary
// is not built on Windows dev boxes; mock it before importing the router so
// the hermetic module-level test can load. This does NOT affect runtime
// behaviour — production livinityd boots on Linux where drivelist works.
vi.mock('drivelist', () => ({
	default: {
		list: async () => [],
	},
}))

const {createAppRouter} = await import('../index.js')
const {createXaiAuthRouter} = await import('../xai-auth-router.js')
const {chromeMasterRouter} = await import('../../../chrome-master/index.js')

function makeCtx() {
	return {
		livinityd: {} as any,
		logger: {
			info: () => {},
			warn: () => {},
			error: () => {},
			verbose: () => {},
			log: () => {},
			debug: () => {},
		},
		server: {} as any,
		user: {} as any,
		appStore: {} as any,
		apps: {} as any,
		dangerouslyBypassAuthentication: true,
		currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
		transport: 'express' as const,
	}
}

function makeFlowServiceMock() {
	return {
		start: vi.fn(async (_flowId: string) => ({
			url: 'https://x.ai/oauth/device?code=TEST',
			startedAt: 0,
		})),
		waitForCompletion: vi.fn(async () => ({
			success: true as const,
			completedAt: 0,
		})),
		abort: vi.fn(),
		hasActiveFlow: vi.fn(),
	}
}

function makeCredsServiceMock(overrides: {
	getStatus?: any
	clear?: any
} = {}) {
	return {
		getStatus:
			overrides.getStatus ??
			vi.fn(async () => ({connected: false as const})),
		clear: overrides.clear ?? vi.fn(async () => undefined),
		getToken: vi.fn(),
	}
}

describe('Phase 196-01 — XAI auth DI wire-up', () => {
	test('createAppRouter mounts auth.xai.start as a callable procedure when xaiAuth is supplied', async () => {
		const flowService = makeFlowServiceMock()
		const credsService = makeCredsServiceMock()
		const xaiAuthInjected = createXaiAuthRouter({
			flowService: flowService as any,
			credsService: credsService as any,
		})
		const app = createAppRouter({
			chromeMaster: chromeMasterRouter,
			xaiAuth: xaiAuthInjected,
		})
		const caller = app.createCaller(makeCtx() as any)

		// Calling through the FULL `auth.xai.start` path proves the createAppRouter
		// `xaiAuth:` slot is wired AND that the procedure is callable (not the
		// throwing Proxy emptyInjectionStub).
		const result = await caller.auth.xai.start()

		expect(result.url).toBe('https://x.ai/oauth/device?code=TEST')
		expect(result.startedAt).toBe(0)
		expect(result.flowId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		)
		expect(flowService.start).toHaveBeenCalledTimes(1)
		expect(flowService.start).toHaveBeenCalledWith(result.flowId)
	})

	test('createAppRouter without xaiAuth slot still type-checks (default Proxy stub remains)', () => {
		// Back-compat regression guard: the default-fallback to the bare
		// xaiAuthRouter (empty-injection Proxy) must keep constructing without
		// throwing — the Proxy only throws on actual service access.
		const app = createAppRouter({chromeMaster: chromeMasterRouter})
		expect(app).toBeTruthy()
		// Construction did not throw and the router object exposes a procedures map.
		expect(typeof app.createCaller).toBe('function')
	})

	test('credsService that throws from getStatus does NOT prevent flowService.start from resolving', async () => {
		// Mirrors the Task 1 graceful-degradation contract: even when the
		// credentials service is broken (auth.json directory inaccessible on a
		// fresh box, or other I/O failure), first-time auth.xai.start MUST
		// still be reachable so the operator can complete the OAuth flow.
		const flowService = makeFlowServiceMock()
		const credsService = makeCredsServiceMock({
			getStatus: vi.fn(async () => {
				throw new Error('auth.json inaccessible')
			}),
		})
		const xaiAuthInjected = createXaiAuthRouter({
			flowService: flowService as any,
			credsService: credsService as any,
		})
		const caller = xaiAuthInjected.createCaller(makeCtx() as any)

		// start procedure is wired to flowService — completes regardless of credsService state.
		const result = await caller.start()
		expect(result.url).toBe('https://x.ai/oauth/device?code=TEST')
		expect(flowService.start).toHaveBeenCalledTimes(1)

		// status procedure delegates to credsService.getStatus — it propagates
		// the rejection. This is by-design: T3 proves the isolation (start OK
		// even when status is broken), not that status pretends to work.
		await expect(caller.status()).rejects.toThrow(/auth\.json inaccessible/)
	})
})
