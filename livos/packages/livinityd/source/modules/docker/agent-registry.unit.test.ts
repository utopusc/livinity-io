// Phase 22 MH-04 — AgentRegistry unit tests.
//
// Uses a fake WebSocket-shaped object — we don't open real sockets, just
// verify the registry's request/response demux and lifecycle handling.

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {AgentRegistry} from './agent-registry.js'

interface FakeWs {
	readyState: number
	OPEN: number
	send: ReturnType<typeof vi.fn>
	close: ReturnType<typeof vi.fn>
}

function makeFakeWs(): FakeWs {
	return {
		readyState: 1,
		OPEN: 1,
		send: vi.fn(),
		close: vi.fn(),
	}
}

const AGENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('AgentRegistry', () => {
	let registry: AgentRegistry

	beforeEach(() => {
		registry = new AgentRegistry()
	})

	test('isAgentOnline returns false for unknown agent', () => {
		expect(registry.isAgentOnline(AGENT_ID)).toBe(false)
	})

	test('registerAgent + isAgentOnline', () => {
		const ws = makeFakeWs() as unknown as any
		registry.registerAgent(AGENT_ID, ws)
		expect(registry.isAgentOnline(AGENT_ID)).toBe(true)
	})

	test('unregisterAgent removes it', () => {
		const ws = makeFakeWs() as unknown as any
		registry.registerAgent(AGENT_ID, ws)
		registry.unregisterAgent(AGENT_ID)
		expect(registry.isAgentOnline(AGENT_ID)).toBe(false)
	})

	test('sendRequest to a non-connected agent rejects with [agent-offline]', async () => {
		await expect(registry.sendRequest('not-here', 'listContainers', [])).rejects.toThrow(
			/\[agent-offline\]/,
		)
	})

	test('sendRequest sends JSON and resolves on matching response', async () => {
		const ws = makeFakeWs() as unknown as any
		registry.registerAgent(AGENT_ID, ws)

		const promise = registry.sendRequest(AGENT_ID, 'listContainers', [{all: true}])

		expect(ws.send).toHaveBeenCalledTimes(1)
		const sentRaw = (ws.send as any).mock.calls[0][0]
		const sent = JSON.parse(sentRaw)
		expect(sent.type).toBe('request')
		expect(sent.method).toBe('listContainers')
		expect(sent.args).toEqual([{all: true}])
		expect(typeof sent.requestId).toBe('string')

		// Simulate the agent responding
		registry.handleResponse(AGENT_ID, {
			type: 'response',
			requestId: sent.requestId,
			result: [{Id: 'c1'}],
		})

		const result = await promise
		expect(result).toEqual([{Id: 'c1'}])
	})

	test('sendRequest rejects with the agent-side error when response.error is set', async () => {
		const ws = makeFakeWs() as unknown as any
		registry.registerAgent(AGENT_ID, ws)

		const promise = registry.sendRequest(AGENT_ID, 'container.start', ['c1'])
		const sent = JSON.parse((ws.send as any).mock.calls[0][0])

		registry.handleResponse(AGENT_ID, {
			type: 'response',
			requestId: sent.requestId,
			error: {message: 'container not found', statusCode: 404, code: 'CONTAINER_NOT_FOUND'},
		})

		await expect(promise).rejects.toThrow(/container not found/)
		try {
			await promise
		} catch (err: any) {
			expect(err.statusCode).toBe(404)
			expect(err.code).toBe('CONTAINER_NOT_FOUND')
		}
	})

	test('sendRequest times out after 30s with [agent-timeout]', async () => {
		vi.useFakeTimers()
		try {
			const ws = makeFakeWs() as unknown as any
			registry.registerAgent(AGENT_ID, ws)
			const promise = registry.sendRequest(AGENT_ID, 'info', [])

			// Catch the rejection BEFORE advancing timers so vitest doesn't see an unhandled rejection
			const caught = promise.catch((err) => err)
			vi.advanceTimersByTime(30_001)
			const err = await caught
			expect(err).toBeInstanceOf(Error)
			expect((err as Error).message).toMatch(/\[agent-timeout\]/)
		} finally {
			vi.useRealTimers()
		}
	})

	test('registerAgent over an existing connection drops the old WS and rejects pending requests with [agent-replaced]', async () => {
		const oldWs = makeFakeWs() as unknown as any
		registry.registerAgent(AGENT_ID, oldWs)

		const promise = registry.sendRequest(AGENT_ID, 'info', [])
		const caught = promise.catch((err) => err)

		const newWs = makeFakeWs() as unknown as any
		registry.registerAgent(AGENT_ID, newWs)

		// Old WS was closed with 4409
		expect(oldWs.close).toHaveBeenCalledWith(4409, 'replaced-by-new-connection')

		const err = await caught
		expect((err as Error).message).toMatch(/\[agent-replaced\]/)
		// Newer connection now wins
		expect(registry.isAgentOnline(AGENT_ID)).toBe(true)
	})

	test('unregisterAgent rejects pending requests with [agent-disconnected]', async () => {
		const ws = makeFakeWs() as unknown as any
		registry.registerAgent(AGENT_ID, ws)
		const promise = registry.sendRequest(AGENT_ID, 'info', [])
		const caught = promise.catch((err) => err)

		registry.unregisterAgent(AGENT_ID)

		const err = await caught
		expect((err as Error).message).toMatch(/\[agent-disconnected\]/)
	})

	test('forceDisconnect closes the WS with 4403', () => {
		const ws = makeFakeWs() as unknown as any
		registry.registerAgent(AGENT_ID, ws)

		registry.forceDisconnect(AGENT_ID, 'token-revoked')

		expect(ws.close).toHaveBeenCalledWith(4403, 'token-revoked')
	})

	test('forceDisconnect on unknown agent is a no-op', () => {
		// no throw
		expect(() => registry.forceDisconnect('not-here', 'whatever')).not.toThrow()
	})

	test('handleResponse for unknown agentId is silently ignored', () => {
		expect(() =>
			registry.handleResponse('not-here', {
				type: 'response',
				requestId: 'whatever',
				result: 1,
			}),
		).not.toThrow()
	})

	test('handleResponse for unknown requestId is silently ignored', () => {
		const ws = makeFakeWs() as unknown as any
		registry.registerAgent(AGENT_ID, ws)
		expect(() =>
			registry.handleResponse(AGENT_ID, {
				type: 'response',
				requestId: 'unknown-req',
				result: 1,
			}),
		).not.toThrow()
	})
})
