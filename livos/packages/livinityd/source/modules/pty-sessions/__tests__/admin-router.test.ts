/**
 * Phase 246-03 — admin-router.test.ts (RED → GREEN)
 *
 * 4 cases covering the tRPC admin sub-router for pty-sessions:
 *   1. listSessions returns whatever sessionManager.list() returns
 *   2. killSession with existing id → {killed:true} + manager.kill called
 *   3. killSession with unknown id → {killed:false}
 *   4. Input validation: killSession with non-string id → throws Zod BAD_REQUEST
 *
 * The router is built via createPtySessionsAdminRouter({sessionManager}) and
 * exercised via the tRPC `createCaller` pattern that sibling routers use
 * (see server/trpc/__tests__/config-router.test.ts).
 *
 * adminProcedure: the v7.0 RBAC primitive — `requireRole('admin')` short-
 * circuits to "treat as admin" when `ctx.currentUser` is null (legacy single-
 * user mode), so the tests can use a minimal context without a real JWT.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, expect, test, vi} from 'vitest'

import {createPtySessionsAdminRouter} from '../admin-router.js'

function makePublicCtx() {
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
		currentUser: null,
		transport: 'express' as const,
	}
}

function makeFakeManager(opts: {
	list?: Array<{id: string; name: string; createdAt: string; lastAttachAt: string}>
	killImpl?: (id: string) => boolean
} = {}) {
	const list = opts.list ?? [
		{id: 'a', name: 'foo', createdAt: 'T1', lastAttachAt: 'T1'},
		{id: 'b', name: 'bar', createdAt: 'T2', lastAttachAt: 'T2'},
	]
	return {
		list: vi.fn().mockReturnValue(list),
		kill: vi.fn().mockImplementation(opts.killImpl ?? ((id: string) => id === 'a')),
	}
}

describe('createPtySessionsAdminRouter — listSessions', () => {
	test('1. listSessions returns the array from sessionManager.list()', async () => {
		const sessionManager = makeFakeManager()
		const router = createPtySessionsAdminRouter({sessionManager: sessionManager as never})
		const caller = router.createCaller(makePublicCtx() as any)
		const result = await caller.listSessions()
		expect(result).toEqual([
			{id: 'a', name: 'foo', createdAt: 'T1', lastAttachAt: 'T1'},
			{id: 'b', name: 'bar', createdAt: 'T2', lastAttachAt: 'T2'},
		])
		expect(sessionManager.list).toHaveBeenCalledTimes(1)
	})
})

describe('createPtySessionsAdminRouter — killSession', () => {
	test('2. killSession with existing id → {killed:true} + manager.kill called with id', async () => {
		const sessionManager = makeFakeManager()
		const router = createPtySessionsAdminRouter({sessionManager: sessionManager as never})
		const caller = router.createCaller(makePublicCtx() as any)
		const result = await caller.killSession({id: 'a'})
		expect(result).toEqual({killed: true})
		expect(sessionManager.kill).toHaveBeenCalledWith('a')
	})

	test('3. killSession with unknown id → {killed:false}', async () => {
		const sessionManager = makeFakeManager()
		const router = createPtySessionsAdminRouter({sessionManager: sessionManager as never})
		const caller = router.createCaller(makePublicCtx() as any)
		const result = await caller.killSession({id: 'unknown'})
		expect(result).toEqual({killed: false})
		expect(sessionManager.kill).toHaveBeenCalledWith('unknown')
	})

	test('4. killSession with non-string id → throws Zod BAD_REQUEST', async () => {
		const sessionManager = makeFakeManager()
		const router = createPtySessionsAdminRouter({sessionManager: sessionManager as never})
		const caller = router.createCaller(makePublicCtx() as any)
		await expect(
			caller.killSession({id: 42 as never}),
		).rejects.toThrow()
		// manager.kill MUST NOT be invoked when input validation fails.
		expect(sessionManager.kill).not.toHaveBeenCalled()
	})
})
