/**
 * Phase 195 Plan 03 Task 1 — xai-auth-router.ts unit tests.
 *
 * Verifies the four `auth.xai.*` procedures wire through to mocked
 * XaiAuthFlowService + XaiCredentialsService without re-implementing
 * service business logic. The router is the seam between the typed
 * backend services (195-01 + 195-02) and the React onboarding UI (195-04).
 *
 * Coverage:
 *   T1 — start: returns {flowId, url, startedAt}; flowId is a UUID (crypto.randomUUID
 *        per T-195-03-02 non-enumerable IDs); flowService.start invoked with that UUID
 *   T2 — status: delegates to credsService.getStatus and returns its result verbatim
 *   T3 — waitForCompletion: delegates to flowService.waitForCompletion(flowId, 600_000);
 *        valid UUID input passes the zod schema
 *   T4 — waitForCompletion: rejects when flowId fails the regex (T-195-03-04 path-traversal
 *        defense-in-depth — schema enforced before reaching the service)
 *   T5 — disconnect: delegates to credsService.clear and returns {ok: true}
 *
 * Builds caller via `router.createCaller(ctx)` with
 * `dangerouslyBypassAuthentication: true` so adminProcedure passes through
 * (same pattern as webapps/skills-router.test.ts).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, test, vi} from 'vitest'
import {createXaiAuthRouter} from './xai-auth-router.js'

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

// Minimal mock service interface — the router only touches a subset.
type MockFlowService = {
	start: ReturnType<typeof vi.fn>
	waitForCompletion: ReturnType<typeof vi.fn>
	abort: ReturnType<typeof vi.fn>
	hasActiveFlow: ReturnType<typeof vi.fn>
}

type MockCredsService = {
	getStatus: ReturnType<typeof vi.fn>
	clear: ReturnType<typeof vi.fn>
	getToken: ReturnType<typeof vi.fn>
}

let flowService: MockFlowService
let credsService: MockCredsService

beforeEach(() => {
	flowService = {
		start: vi.fn(),
		waitForCompletion: vi.fn(),
		abort: vi.fn(),
		hasActiveFlow: vi.fn(),
	}
	credsService = {
		getStatus: vi.fn(),
		clear: vi.fn(),
		getToken: vi.fn(),
	}
})

describe('xai-auth-router — auth.xai.* tRPC procedures', () => {
	test('T1 — start: returns {flowId, url, startedAt}; flowId is a UUID; flowService.start invoked with that UUID', async () => {
		flowService.start.mockResolvedValueOnce({
			url: 'https://x.ai/oauth/device?code=ABC',
			startedAt: 123,
		})
		const r = createXaiAuthRouter({
			flowService: flowService as any,
			credsService: credsService as any,
		})
		const caller = r.createCaller(makeCtx() as any)

		const result = await caller.start()

		expect(result.url).toBe('https://x.ai/oauth/device?code=ABC')
		expect(result.startedAt).toBe(123)
		// crypto.randomUUID() shape: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (T-195-03-02)
		expect(result.flowId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
		)
		// flowService.start invoked with the UUID we returned
		expect(flowService.start).toHaveBeenCalledTimes(1)
		expect(flowService.start).toHaveBeenCalledWith(result.flowId)
	})

	test('T2 — status: delegates to credsService.getStatus and returns result verbatim', async () => {
		const status = {
			connected: true,
			tier: 1,
			scopes: ['openid', 'profile', 'email', 'grok-cli:access', 'api:access'],
			expiresAt: 1_700_000_000_000,
			principalId: '11111111-1111-4111-8111-111111111111',
			teamId: '22222222-2222-4222-8222-222222222222',
		}
		credsService.getStatus.mockResolvedValueOnce(status)
		const r = createXaiAuthRouter({
			flowService: flowService as any,
			credsService: credsService as any,
		})
		const caller = r.createCaller(makeCtx() as any)

		const result = await caller.status()

		expect(result).toEqual(status)
		expect(credsService.getStatus).toHaveBeenCalledTimes(1)
	})

	test('T3 — waitForCompletion: delegates to flowService.waitForCompletion with 10-min timeout', async () => {
		const flowId = '11111111-1111-4111-8111-111111111111'
		flowService.waitForCompletion.mockResolvedValueOnce({
			success: true,
			completedAt: 1_700_000_000_000,
		})
		const r = createXaiAuthRouter({
			flowService: flowService as any,
			credsService: credsService as any,
		})
		const caller = r.createCaller(makeCtx() as any)

		const result = await caller.waitForCompletion({flowId})

		expect(result).toEqual({success: true, completedAt: 1_700_000_000_000})
		expect(flowService.waitForCompletion).toHaveBeenCalledWith(flowId, 600_000)
	})

	test('T4 — waitForCompletion: rejects when flowId fails the regex (T-195-03-04)', async () => {
		const r = createXaiAuthRouter({
			flowService: flowService as any,
			credsService: credsService as any,
		})
		const caller = r.createCaller(makeCtx() as any)

		// Too short — under 8 chars
		await expect(caller.waitForCompletion({flowId: 'abc'})).rejects.toThrow()

		// Contains forbidden chars (path traversal attempt)
		await expect(
			caller.waitForCompletion({flowId: '../../etc/passwd'}),
		).rejects.toThrow()

		// flowService never invoked when schema fails
		expect(flowService.waitForCompletion).not.toHaveBeenCalled()
	})

	test('T5 — disconnect: delegates to credsService.clear and returns {ok:true}', async () => {
		credsService.clear.mockResolvedValueOnce(undefined)
		const r = createXaiAuthRouter({
			flowService: flowService as any,
			credsService: credsService as any,
		})
		const caller = r.createCaller(makeCtx() as any)

		const result = await caller.disconnect()

		expect(result).toEqual({ok: true})
		expect(credsService.clear).toHaveBeenCalledTimes(1)
	})
})
