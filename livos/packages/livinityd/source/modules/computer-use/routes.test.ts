/**
 * computerUse tRPC router unit tests — Phase 71-05.
 *
 * Test pattern: createCallerFactory + stubbed Context (mirrors
 * api-keys/routes.test.ts and 76-03 ai/routes.test.ts). NO supertest, no
 * app.listen(0) — the must-have behaviors all live at the tRPC layer
 * (manager-mock assertions + URL-shape assertions on returned websockifyUrl).
 *
 * Coverage matrix (>= 6 cases):
 *   getStatus               — running -> websockifyUrl present
 *   getStatus               — absent  -> {status:absent, websockifyUrl:null}
 *   getStatus               — manager undefined -> {status:absent}
 *   startStandaloneSession  — calls manager.ensureContainer + returns wssUrl
 *   stopSession             — calls manager.stopContainer + returns {ok:true}
 *   stopSession             — manager undefined -> {ok:true} (graceful no-op)
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'

// Mock the database barrel BEFORE importing routes (which imports from
// '../database/index.js'). Same pattern as api-keys/routes.test.ts.
vi.mock('../database/index.js', () => ({
	getUserAppInstance: vi.fn(async (_userId: string, _appId: string) => ({
		userId: 'user-1',
		appId: 'bytebot-desktop',
		subdomain: 'desktop',
		containerName: 'docker-abc',
		port: 14101,
		volumePath: '/tmp/livos-test',
		status: 'running',
		createdAt: new Date(),
	})),
}))

// Mock per-user-claude (touches node-pty + filesystem at module-load — see
// 76-03 D-test-pattern). Not strictly needed here since routes.ts doesn't
// import it, but defensive parity with neighbour test files.
vi.mock('../ai/per-user-claude.js', () => ({}))

import {computerUseRouter} from './routes.js'

// ─────────────────────────────────────────────────────────────────────
// Context factory — mirrors the createCallerFactory pattern. Only the
// fields the procedures touch are stubbed. `as any` cast at the call
// site avoids re-declaring the entire Context union.
// ─────────────────────────────────────────────────────────────────────

function makeManager(over: any = {}) {
	return {
		getStatus: vi.fn(async () => 'running' as const),
		ensureContainer: vi.fn(async () => ({
			taskId: 't1',
			containerId: 'docker-abc',
			port: 14101,
			subdomain: 'desktop',
		})),
		stopContainer: vi.fn(async () => {}),
		bumpActivity: vi.fn(async () => {}),
		...over,
	}
}

function makeCtx(over: any = {}) {
	const manager = over.manager ?? makeManager()
	const redisGet = vi.fn(async (key: string) => {
		if (key === 'livos:domain:config') return JSON.stringify({active: true, domain: 'livinity.io'})
		return null
	})
	return {
		currentUser: {id: 'user-1', username: 'bruce', role: 'admin' as const},
		livinityd: {
			computerUseManager: manager,
			ai: {redis: {get: redisGet}},
			logger: {log: vi.fn(), error: vi.fn(), verbose: vi.fn()},
		},
		server: {
			signUserToken: vi.fn(async (_userId: string, _role: string) => 'fake.jwt.token'),
			verifyToken: vi.fn(async () => ({userId: 'user-1'})),
		},
		logger: {log: vi.fn(), error: vi.fn(), verbose: vi.fn()},
		dangerouslyBypassAuthentication: false,
		...over,
		// preserve manager reference on returned ctx for assertions
		_manager: manager,
	}
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('computerUseRouter.getStatus', () => {
	it('returns websockifyUrl + port when manager reports running', async () => {
		const ctx = makeCtx()
		const caller = computerUseRouter.createCaller(ctx as any)
		const result = await caller.getStatus()
		expect(result.status).toBe('running')
		expect(result.websockifyUrl).toMatch(/^wss:\/\/desktop\.bruce\.livinity\.io\/websockify\?token=/)
		expect(result.port).toBe(14101)
		expect(ctx._manager.getStatus).toHaveBeenCalledWith('user-1')
	})

	it('returns null websockifyUrl when manager reports absent', async () => {
		const manager = makeManager({getStatus: vi.fn(async () => 'absent' as const)})
		const ctx = makeCtx({manager})
		const caller = computerUseRouter.createCaller(ctx as any)
		const result = await caller.getStatus()
		expect(result.status).toBe('absent')
		expect(result.websockifyUrl).toBeNull()
		expect(result.port).toBeNull()
	})

	it('returns {status:absent} when manager is undefined (PG unavailable)', async () => {
		const ctx = makeCtx({manager: undefined})
		ctx.livinityd.computerUseManager = undefined
		const caller = computerUseRouter.createCaller(ctx as any)
		const result = await caller.getStatus()
		expect(result.status).toBe('absent')
		expect(result.websockifyUrl).toBeNull()
		expect(result.port).toBeNull()
	})
})

describe('computerUseRouter.startStandaloneSession', () => {
	it('calls manager.ensureContainer and returns websockifyUrl', async () => {
		const ctx = makeCtx()
		const caller = computerUseRouter.createCaller(ctx as any)
		const result = await caller.startStandaloneSession()
		expect(ctx._manager.ensureContainer).toHaveBeenCalledWith('user-1')
		expect(result.websockifyUrl).toMatch(/^wss:\/\/desktop\.bruce\.livinity\.io\/websockify\?token=/)
	})

	it('throws when manager is undefined', async () => {
		const ctx = makeCtx()
		ctx.livinityd.computerUseManager = undefined
		const caller = computerUseRouter.createCaller(ctx as any)
		await expect(caller.startStandaloneSession()).rejects.toThrow(/manager not initialized/)
	})

	it('throws when main domain is not configured', async () => {
		const redisGet = vi.fn(async () => null) // no domain config
		const manager = makeManager()
		const ctx: any = {
			currentUser: {id: 'user-1', username: 'bruce', role: 'admin' as const},
			livinityd: {
				computerUseManager: manager,
				ai: {redis: {get: redisGet}},
				logger: {log: vi.fn(), error: vi.fn(), verbose: vi.fn()},
			},
			server: {signUserToken: vi.fn(async () => 'fake.jwt.token')},
			logger: {log: vi.fn(), error: vi.fn(), verbose: vi.fn()},
			dangerouslyBypassAuthentication: false,
		}
		const caller = computerUseRouter.createCaller(ctx)
		await expect(caller.startStandaloneSession()).rejects.toThrow(/main domain/i)
	})
})

describe('computerUseRouter.stopSession', () => {
	it('calls manager.stopContainer and returns {ok:true}', async () => {
		const ctx = makeCtx()
		const caller = computerUseRouter.createCaller(ctx as any)
		const result = await caller.stopSession()
		expect(ctx._manager.stopContainer).toHaveBeenCalledWith('user-1')
		expect(result.ok).toBe(true)
	})

	it('returns {ok:true} gracefully when manager is undefined', async () => {
		const ctx = makeCtx()
		ctx.livinityd.computerUseManager = undefined
		const caller = computerUseRouter.createCaller(ctx as any)
		const result = await caller.stopSession()
		expect(result.ok).toBe(true)
	})
})
