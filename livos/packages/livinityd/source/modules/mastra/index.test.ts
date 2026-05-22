/**
 * Phase 197-01 Plan 01 Task 2 — index.test.ts (B-02 lock).
 *
 * Coverage (≥4 PASS):
 *   9. LivOSMastra construction shape — providerRouter + agents{} + memory=null + mcpBridge=null
 *   10. attach helpers contract — attachLivAiAgent / attachMemory / attachMcpBridge
 *   11. Construction is a no-op (no Redis read, no fetch)
 *   12. Default state — agents.livAi undefined, memory null, mcpBridge null
 */

import {describe, expect, test, vi} from 'vitest'

import {LivOSMastra} from './index.js'

describe('LivOSMastra (B-02 lock — FINAL contract in Wave 1)', () => {
	test('Test 9: construction shape exposes providerRouter + typed slots', () => {
		const providerRouter = {resolveAgentModel: vi.fn()}
		const m = new LivOSMastra({providerRouter})
		expect(m.providerRouter).toBe(providerRouter)
		expect(m.agents).toEqual({})
		expect(m.memory).toBeNull()
		expect(m.mcpBridge).toBeNull()
	})

	test('Test 10: attach helpers — attachLivAiAgent / attachMemory / attachMcpBridge', () => {
		const m = new LivOSMastra({providerRouter: {resolveAgentModel: vi.fn()}})
		const agentStub = {id: 'liv-ai'} as never
		const memStub = {kind: 'memory'} as never
		const bridgeStub = {kind: 'bridge'} as never

		m.attachLivAiAgent(agentStub)
		m.attachMemory(memStub)
		m.attachMcpBridge(bridgeStub)

		expect(m.agents.livAi).toBe(agentStub)
		expect(m.memory).toBe(memStub)
		expect(m.mcpBridge).toBe(bridgeStub)

		// Idempotent replace
		const agent2 = {id: 'liv-ai-v2'} as never
		m.attachLivAiAgent(agent2)
		expect(m.agents.livAi).toBe(agent2)
	})

	test('Test 11: construction is a no-op (no spies fire)', () => {
		const getSpy = vi.fn()
		const tokSpy = vi.fn()
		const providerRouter = {resolveAgentModel: vi.fn()}
		// Construction should NOT touch redis or xaiCreds — providerRouter is opaque
		new LivOSMastra({providerRouter})
		expect(getSpy).not.toHaveBeenCalled()
		expect(tokSpy).not.toHaveBeenCalled()
		expect(providerRouter.resolveAgentModel).not.toHaveBeenCalled()
	})

	test('Test 12: default state after construction', () => {
		const m = new LivOSMastra({providerRouter: {resolveAgentModel: vi.fn()}})
		expect(m.agents.livAi).toBeUndefined()
		expect(m.memory).toBeNull()
		expect(m.mcpBridge).toBeNull()
	})
})
