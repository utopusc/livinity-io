/**
 * Phase 346-04 Task 2 — mcpControl.* admin router unit tests.
 *
 * Coverage (every <behavior> bullet):
 *   1.  empty-injection stub → PRECONDITION_FAILED before boot wires deps
 *   2.  getStatus reflects the store enable flag + server.isListening() + host/path
 *   3.  setEnabled(true)  persists mcpServer.enabled=true + calls onEnabledChanged(true)
 *   4.  setEnabled(false) persists mcpServer.enabled=false + calls onEnabledChanged(false)
 *   5.  mintKey returns the plaintext EXACTLY once (+ id/keyPrefix/name)
 *   6.  mintKey passes createdBy = ctx.currentUser.id to the DAO
 *   7.  listKeys returns metadata WITHOUT key_hash / plaintext (contrast vs mint)
 *   8.  revokeKey rowCount>0 → {ok,id}
 *   9.  revokeKey rowCount 0 → NOT_FOUND; a second (idempotent) call → NOT_FOUND
 *   10. a non-admin caller fails the adminProcedure role gate on every route
 */

import {describe, expect, test, vi, beforeEach} from 'vitest'

// Mock the liv_mcp_* DAO — the router is unit-tested in isolation from PG.
vi.mock('./keys-database.js', () => ({
	createMcpControlKey: vi.fn(),
	listMcpControlKeys: vi.fn(),
	revokeMcpControlKey: vi.fn(),
}))

import {
	createMcpControlKey,
	listMcpControlKeys,
	revokeMcpControlKey,
} from './keys-database.js'
import {
	createMcpControlRouter,
	mcpControlRouter,
	MCP_CONTROL_STATUS_HOST,
	MCP_CONTROL_STATUS_PATH,
	type McpControlRouterDeps,
} from './routes.js'

function makeAdminCtx() {
	return {
		livinityd: {} as never,
		logger: {
			info: () => undefined,
			warn: () => undefined,
			error: () => undefined,
			verbose: () => undefined,
			log: () => undefined,
			debug: () => undefined,
		},
		server: {} as never,
		user: {} as never,
		appStore: {} as never,
		apps: {} as never,
		dangerouslyBypassAuthentication: true,
		currentUser: {id: 'admin-uuid', username: 'admin', role: 'admin' as const},
		transport: 'express' as const,
	}
}

function makeNonAdminCtx() {
	return {
		...makeAdminCtx(),
		currentUser: {id: 'member-uuid', username: 'member', role: 'member' as const},
	}
}

/** In-memory FileStore fake — only the `mcpServer` key matters. */
function makeFakeStore(initial: {enabled: boolean} | undefined = undefined) {
	const state: {value: {enabled: boolean} | undefined} = {value: initial}
	return {
		state,
		get: vi.fn(async (_property: 'mcpServer') => state.value),
		getWriteLock: vi.fn(
			async (
				job: (methods: {
					set(property: 'mcpServer', value: {enabled: boolean}): Promise<boolean>
				}) => Promise<void>,
			) => {
				await job({
					set: vi.fn(async (_property: 'mcpServer', value: {enabled: boolean}) => {
						state.value = value
						return true
					}),
				})
			},
		),
	}
}

function makeDeps(overrides: Partial<McpControlRouterDeps> = {}) {
	const store = makeFakeStore(overrides.store as never)
	const server = {isListening: vi.fn(() => false)}
	const onEnabledChanged = vi.fn()
	const logger = {info: vi.fn(), warn: vi.fn()}
	const deps: McpControlRouterDeps = {
		store: (overrides.store as never) ?? store,
		server: overrides.server ?? server,
		onEnabledChanged: overrides.onEnabledChanged ?? onEnabledChanged,
		logger: overrides.logger ?? logger,
	}
	return {deps, store, server, onEnabledChanged, logger}
}

const mockedCreate = vi.mocked(createMcpControlKey)
const mockedList = vi.mocked(listMcpControlKeys)
const mockedRevoke = vi.mocked(revokeMcpControlKey)

beforeEach(() => {
	vi.clearAllMocks()
})

describe('mcpControlRouter — empty-injection stub', () => {
	test('1. every route throws PRECONDITION_FAILED before boot wires deps', async () => {
		const caller = mcpControlRouter.createCaller(makeAdminCtx() as never)
		await expect(caller.getStatus()).rejects.toMatchObject({code: 'PRECONDITION_FAILED'})
		await expect(caller.setEnabled({enabled: true})).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
		})
		await expect(caller.mintKey({name: 'x'})).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
		})
		await expect(caller.listKeys()).rejects.toMatchObject({code: 'PRECONDITION_FAILED'})
		await expect(caller.revokeKey({id: 'abc'})).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
		})
	})
})

describe('createMcpControlRouter — getStatus', () => {
	test('2a. disabled + not listening → enabled:false, listening:false, host/path', async () => {
		const store = makeFakeStore(undefined)
		const server = {isListening: vi.fn(() => false)}
		const deps: McpControlRouterDeps = {
			store: store as never,
			server,
			onEnabledChanged: vi.fn(),
			logger: {info: vi.fn(), warn: vi.fn()},
		}
		const caller = createMcpControlRouter(deps).createCaller(makeAdminCtx() as never)
		const status = await caller.getStatus()
		expect(status).toEqual({
			enabled: false,
			listening: false,
			host: MCP_CONTROL_STATUS_HOST,
			path: MCP_CONTROL_STATUS_PATH,
		})
	})

	test('2b. enabled store flag + live listener → enabled:true, listening:true', async () => {
		const store = makeFakeStore({enabled: true})
		const server = {isListening: vi.fn(() => true)}
		const deps: McpControlRouterDeps = {
			store: store as never,
			server,
			onEnabledChanged: vi.fn(),
			logger: {info: vi.fn(), warn: vi.fn()},
		}
		const caller = createMcpControlRouter(deps).createCaller(makeAdminCtx() as never)
		const status = await caller.getStatus()
		expect(status.enabled).toBe(true)
		expect(status.listening).toBe(true)
		expect(status.host).toBe('127.0.0.1')
		expect(status.path).toBe('/mcp-control')
	})
})

describe('createMcpControlRouter — setEnabled drives the listener', () => {
	test('3. setEnabled(true) persists enabled=true and calls onEnabledChanged(true)', async () => {
		const store = makeFakeStore(undefined)
		const onEnabledChanged = vi.fn()
		const deps: McpControlRouterDeps = {
			store: store as never,
			server: {isListening: vi.fn(() => false)},
			onEnabledChanged,
			logger: {info: vi.fn(), warn: vi.fn()},
		}
		const caller = createMcpControlRouter(deps).createCaller(makeAdminCtx() as never)
		const res = await caller.setEnabled({enabled: true})
		expect(res).toEqual({ok: true, enabled: true})
		expect(store.state.value).toEqual({enabled: true})
		expect(onEnabledChanged).toHaveBeenCalledTimes(1)
		expect(onEnabledChanged).toHaveBeenCalledWith(true)
	})

	test('4. setEnabled(false) persists enabled=false and calls onEnabledChanged(false)', async () => {
		const store = makeFakeStore({enabled: true})
		const onEnabledChanged = vi.fn()
		const deps: McpControlRouterDeps = {
			store: store as never,
			server: {isListening: vi.fn(() => true)},
			onEnabledChanged,
			logger: {info: vi.fn(), warn: vi.fn()},
		}
		const caller = createMcpControlRouter(deps).createCaller(makeAdminCtx() as never)
		const res = await caller.setEnabled({enabled: false})
		expect(res).toEqual({ok: true, enabled: false})
		expect(store.state.value).toEqual({enabled: false})
		expect(onEnabledChanged).toHaveBeenCalledWith(false)
	})
})

describe('createMcpControlRouter — mintKey (plaintext ONCE)', () => {
	test('5. mintKey returns the plaintext exactly once (+ id/keyPrefix/name)', async () => {
		mockedCreate.mockResolvedValueOnce({
			row: {
				id: 'key-1',
				keyPrefix: 'liv_mcp_',
				name: 'ci-agent',
				createdBy: 'admin-uuid',
				createdAt: new Date('2026-07-19T00:00:00Z'),
				lastUsedAt: null,
				revokedAt: null,
			},
			plaintext: 'liv_mcp_abcdefghijklmnopqrstuvwxyz012345',
		})
		const {deps} = makeDeps()
		const caller = createMcpControlRouter(deps).createCaller(makeAdminCtx() as never)
		const res = await caller.mintKey({name: 'ci-agent'})
		expect(res.plaintext).toBe('liv_mcp_abcdefghijklmnopqrstuvwxyz012345')
		expect(res.id).toBe('key-1')
		expect(res.keyPrefix).toBe('liv_mcp_')
		expect(res.name).toBe('ci-agent')
	})

	test('6. mintKey passes createdBy = ctx.currentUser.id to the DAO', async () => {
		mockedCreate.mockResolvedValueOnce({
			row: {
				id: 'key-2',
				keyPrefix: 'liv_mcp_',
				name: 'agent',
				createdBy: 'admin-uuid',
				createdAt: new Date(),
				lastUsedAt: null,
				revokedAt: null,
			},
			plaintext: 'liv_mcp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
		})
		const {deps} = makeDeps()
		const caller = createMcpControlRouter(deps).createCaller(makeAdminCtx() as never)
		await caller.mintKey({name: 'agent'})
		expect(mockedCreate).toHaveBeenCalledWith({name: 'agent', createdBy: 'admin-uuid'})
	})
})

describe('createMcpControlRouter — listKeys never leaks secrets', () => {
	test('7. listKeys returns metadata WITHOUT key_hash / plaintext', async () => {
		mockedList.mockResolvedValueOnce([
			{
				id: 'key-1',
				keyPrefix: 'liv_mcp_',
				name: 'ci-agent',
				createdBy: 'admin-uuid',
				createdAt: new Date('2026-07-19T00:00:00Z'),
				lastUsedAt: null,
				revokedAt: null,
			},
			{
				id: 'key-2',
				keyPrefix: 'liv_mcp_',
				name: 'revoked-one',
				createdBy: null,
				createdAt: new Date('2026-07-18T00:00:00Z'),
				lastUsedAt: new Date('2026-07-18T01:00:00Z'),
				revokedAt: new Date('2026-07-18T02:00:00Z'),
			},
		])
		const {deps} = makeDeps()
		const caller = createMcpControlRouter(deps).createCaller(makeAdminCtx() as never)
		const rows = await caller.listKeys()
		expect(rows).toHaveLength(2)
		// History (revoked) is included.
		expect(rows[1]!.revokedAt).not.toBeNull()
		for (const r of rows) {
			expect(r).not.toHaveProperty('plaintext')
			expect(r).not.toHaveProperty('keyHash')
			expect(r).not.toHaveProperty('key_hash')
			expect(r.keyPrefix).toBe('liv_mcp_')
		}
	})
})

describe('createMcpControlRouter — revokeKey idempotency', () => {
	test('8. revokeKey rowCount>0 → {ok,id}', async () => {
		mockedRevoke.mockResolvedValueOnce({rowCount: 1, keyHash: 'deadbeef'})
		const {deps} = makeDeps()
		const caller = createMcpControlRouter(deps).createCaller(makeAdminCtx() as never)
		const res = await caller.revokeKey({id: 'key-1'})
		expect(res).toEqual({ok: true, id: 'key-1'})
		expect(mockedRevoke).toHaveBeenCalledWith({id: 'key-1'})
	})

	test('9. revokeKey rowCount 0 → NOT_FOUND, and a second idempotent call → NOT_FOUND', async () => {
		mockedRevoke.mockResolvedValue({rowCount: 0})
		const {deps} = makeDeps()
		const caller = createMcpControlRouter(deps).createCaller(makeAdminCtx() as never)
		await expect(caller.revokeKey({id: 'missing'})).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})
		// Idempotent: a second revoke of an already-revoked id also collapses to NOT_FOUND.
		await expect(caller.revokeKey({id: 'missing'})).rejects.toMatchObject({
			code: 'NOT_FOUND',
		})
	})
})

describe('mcpControl.* — adminProcedure role gate', () => {
	test('10. a non-admin (member) caller fails every route with FORBIDDEN', async () => {
		const {deps} = makeDeps()
		const caller = createMcpControlRouter(deps).createCaller(makeNonAdminCtx() as never)
		await expect(caller.getStatus()).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(caller.setEnabled({enabled: true})).rejects.toMatchObject({
			code: 'FORBIDDEN',
		})
		await expect(caller.mintKey({name: 'x'})).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(caller.listKeys()).rejects.toMatchObject({code: 'FORBIDDEN'})
		await expect(caller.revokeKey({id: 'x'})).rejects.toMatchObject({code: 'FORBIDDEN'})
		// The role gate short-circuits BEFORE any DAO / store call.
		expect(mockedCreate).not.toHaveBeenCalled()
		expect(mockedRevoke).not.toHaveBeenCalled()
	})
})
