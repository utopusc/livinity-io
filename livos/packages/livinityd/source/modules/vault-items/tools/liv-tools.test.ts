// Phase 176-02 — liv-tools.ts behavioral tests (12 assertions).
//
// Tests Liv's 6 MCP tools registered via registerLivTools():
// create_item, list_items, move_item, archive_item, open_item, run_agent.
//
// Pattern: vi.hoisted for module-level state, MockServer captures server.tool calls,
// each handler extracted from the 4th arg of the matching server.tool call.

import {describe, it, expect, beforeEach, vi} from 'vitest'

import {registerLivTools, LIV_TOOL_NAMES} from './liv-tools.js'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
	serverTool: vi.fn(),
	trpcCreate: vi.fn(),
	trpcList: vi.fn(),
	trpcMove: vi.fn(),
	trpcArchive: vi.fn(),
	redisPublish: vi.fn().mockResolvedValue(1),
	redisRpush: vi.fn().mockResolvedValue(1),
	redisLtrim: vi.fn().mockResolvedValue('OK'),
}))

// ── Test fixtures ──────────────────────────────────────────────────────────────

const VALID_ID = 'aaaabbbbccccddddeeee1234' // 24 chars, alphanumeric (matches /^[0-9A-Za-z_-]{20,}$/)

function makeMocks() {
	mocks.serverTool.mockReset()
	mocks.trpcCreate.mockReset()
	mocks.trpcList.mockReset()
	mocks.trpcMove.mockReset()
	mocks.trpcArchive.mockReset()
	mocks.redisPublish.mockReset()
	mocks.redisRpush.mockReset()
	mocks.redisLtrim.mockReset()

	mocks.trpcCreate.mockResolvedValue({id: VALID_ID, name: 'test', type: 'project'})
	mocks.trpcList.mockResolvedValue({items: []})
	mocks.trpcMove.mockResolvedValue({item: {id: VALID_ID}, warn: null})
	mocks.trpcArchive.mockResolvedValue({item: {id: VALID_ID}})
	mocks.redisPublish.mockResolvedValue(1)
	mocks.redisRpush.mockResolvedValue(1)
	mocks.redisLtrim.mockResolvedValue('OK')

	const mockServer = {tool: mocks.serverTool} as any
	const mockTrpcCaller = {
		vault: {
			items: {
				create: mocks.trpcCreate,
				list: mocks.trpcList,
				move: mocks.trpcMove,
				archive: mocks.trpcArchive,
			},
		},
	} as any
	const mockRedis = {
		publish: mocks.redisPublish,
		rpush: mocks.redisRpush,
		ltrim: mocks.redisLtrim,
	} as any

	return {mockServer, mockTrpcCaller, mockRedis}
}

function handlerFor(name: string) {
	const calls = mocks.serverTool.mock.calls
	const call = calls.find((c) => c[0] === name)
	if (!call) throw new Error(`No server.tool call found for '${name}'`)
	return call[3] as (args: unknown) => Promise<{content: Array<{type: string; text: string}>; isError: boolean}>
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('liv-tools — Phase 176-02', () => {
	beforeEach(() => {
		mocks.serverTool.mockReset()
	})

	it('T1: registerLivTools registers exactly 6 tool handlers', () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})
		expect(mocks.serverTool).toHaveBeenCalledTimes(6)
	})

	it('T2: LIV_TOOL_NAMES contains all 6 names', () => {
		expect(LIV_TOOL_NAMES).toContain('create_item')
		expect(LIV_TOOL_NAMES).toContain('list_items')
		expect(LIV_TOOL_NAMES).toContain('move_item')
		expect(LIV_TOOL_NAMES).toContain('archive_item')
		expect(LIV_TOOL_NAMES).toContain('open_item')
		expect(LIV_TOOL_NAMES).toContain('run_agent')
		expect(LIV_TOOL_NAMES.length).toBe(6)
	})

	it('T3: create_item handler calls trpcCaller.vault.items.create with valid input; returns isError:false', async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const handler = handlerFor('create_item')
		const result = await handler({type: 'project', name: 'My Project'})

		expect(mocks.trpcCreate).toHaveBeenCalledOnce()
		expect(mocks.trpcCreate).toHaveBeenCalledWith(expect.objectContaining({type: 'project', name: 'My Project'}))
		expect(result.isError).toBe(false)
		expect(result.content[0].type).toBe('text')
	})

	it('T4: create_item with invalid type returns isError:true without calling trpcCaller', async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const handler = handlerFor('create_item')
		const result = await handler({type: 'unknown', name: 'test'})

		expect(mocks.trpcCreate).not.toHaveBeenCalled()
		expect(result.isError).toBe(true)
	})

	it('T5: list_items handler calls trpcCaller.vault.items.list; returns JSON text content', async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const handler = handlerFor('list_items')
		const result = await handler({})

		expect(mocks.trpcList).toHaveBeenCalledOnce()
		expect(result.content[0].type).toBe('text')
		expect(() => JSON.parse(result.content[0].text)).not.toThrow()
	})

	it('T6: move_item handler calls trpcCaller.vault.items.move with {id, newParentId}', async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const handler = handlerFor('move_item')
		await handler({id: VALID_ID, newParentId: null})

		expect(mocks.trpcMove).toHaveBeenCalledWith({id: VALID_ID, newParentId: null})
	})

	it('T7: archive_item handler calls trpcCaller.vault.items.archive with {id}', async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const handler = handlerFor('archive_item')
		await handler({id: VALID_ID})

		expect(mocks.trpcArchive).toHaveBeenCalledWith({id: VALID_ID})
	})

	it("T8: open_item handler calls redis.publish('liv:open:item', JSON.stringify({itemId}))", async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const handler = handlerFor('open_item')
		await handler({itemId: VALID_ID})

		expect(mocks.redisPublish).toHaveBeenCalledWith('liv:open:item', JSON.stringify({itemId: VALID_ID}))
	})

	it('T9: run_agent handler returns stub text without calling trpcCaller', async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const handler = handlerFor('run_agent')
		const result = await handler({agentId: VALID_ID})

		expect(mocks.trpcCreate).not.toHaveBeenCalled()
		expect(mocks.trpcList).not.toHaveBeenCalled()
		expect(result.content[0].text).toContain('run_agent: scheduled (Phase 177)')
	})

	it('T10: every successful handler invocation calls redis.rpush to liv:audit:liv-tools', async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const createHandler = handlerFor('create_item')
		await createHandler({type: 'project', name: 'test'})

		expect(mocks.redisRpush).toHaveBeenCalledWith(
			'liv:audit:liv-tools',
			expect.stringContaining('create_item'),
		)
	})

	it('T11: trpcCaller.vault.items.create throws TRPCError → handler returns isError:true with error message', async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		mocks.trpcCreate.mockRejectedValue(new Error('INTERNAL_SERVER_ERROR'))
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const handler = handlerFor('create_item')
		const result = await handler({type: 'project', name: 'test'})

		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('INTERNAL_SERVER_ERROR')
	})

	it('T12: create_item input missing required name field → isError:true (Zod validation failure)', async () => {
		const {mockServer, mockTrpcCaller, mockRedis} = makeMocks()
		registerLivTools(mockServer, {trpcCaller: mockTrpcCaller, redis: mockRedis})

		const handler = handlerFor('create_item')
		// Missing 'name' — required field.
		const result = await handler({type: 'project'})

		expect(result.isError).toBe(true)
		expect(mocks.trpcCreate).not.toHaveBeenCalled()
	})
})
