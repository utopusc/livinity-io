/**
 * Phase 203-07 — LivOSAgent + agent-factory unit tests.
 *
 * Covers ≥6 cases per Plan Task 2/3 done-criteria:
 *   1. construction wires providerRouter + default no-op logger
 *   2. attach* method round-trips for all 7 slots
 *   3. providerRouter is read-only (not replaceable post-construction)
 *   4. createAgentFromRow projects row → OpenclawAgentHandle with kind=openclaw
 *   5. row.modelName empty → factory resolves default via providerRouter
 *   6. subAgents map → handle.subAgentNames carries the keys (D-202-03)
 *   7. createAgentFromRow ignores memory/mcpBridge/approvalManager deps
 *      (Branch A — those are gateway concerns)
 *   8. in-memory adapter saveThread round-trip
 */

import {describe, expect, test} from 'vitest'

import {LivOSAgent, createAgentFromRow} from './index.js'
import {OpenclawClient} from './openclaw-client.js'
import {createInMemoryAdapter} from './memory.js'
import type {LivosAgent} from '../../db/schema.js'
import type {ProviderRouter} from './types.js'

function makeProviderRouter(): ProviderRouter {
	// Minimal structural router — only `resolveAgentModel` is called by the
	// factory's default-model path.
	return {
		resolveAgentModel: (name?: string) =>
			name && name.length > 0 ? name : 'grok-4.3',
	} as unknown as ProviderRouter
}

function makeRow(overrides: Partial<LivosAgent> = {}): LivosAgent {
	const now = new Date()
	return {
		id: 'a-1',
		name: 'livAi',
		instructions: 'You are a helpful agent.',
		modelName: 'grok-4.3',
		toolIds: [],
		scheduleCron: null,
		parentAgentId: null,
		enabled: true,
		system: true,
		createdAt: now,
		updatedAt: now,
		...overrides,
	} as LivosAgent
}

describe('LivOSAgent', () => {
	test('constructor wires providerRouter and noop logger by default', () => {
		const router = makeProviderRouter()
		const agent = new LivOSAgent({providerRouter: router})
		expect(agent.providerRouter).toBe(router)
		expect(typeof agent.logger.info).toBe('function')
		expect(typeof agent.logger.warn).toBe('function')
		// Default slots null until attach
		expect(agent.agentClient).toBeNull()
		expect(agent.memory).toBeNull()
		expect(agent.mcpBridge).toBeNull()
		expect(agent.registry).toBeNull()
		expect(agent.scheduler).toBeNull()
		expect(agent.approvalManager).toBeNull()
		expect(agent.agentInstance).toBeNull()
		expect(agent.agents.livAi).toBeUndefined()
	})

	test('attach* round-trips populate every slot', () => {
		const agent = new LivOSAgent({providerRouter: makeProviderRouter()})
		const client = new OpenclawClient()
		const memory = {saveThread: async () => undefined}
		const mcpBridge = {listTools: async () => ({})}
		const registry = {refresh: async () => undefined}
		const scheduler = {refresh: async () => undefined}
		const approvalManager = {requestSync: async () => 'approved' as const}
		const agentInstance = {kind: 'placeholder'}

		agent.attachAgentClient(client)
		agent.attachMemory(memory)
		agent.attachMcpBridge(mcpBridge)
		agent.attachRegistry(registry)
		agent.attachScheduler(scheduler)
		agent.attachApprovalManager(approvalManager)
		agent.attachAgentInstance(agentInstance)
		agent.attachLivAi({
			id: 'a-1',
			name: 'livAi',
			instructions: '',
			modelName: 'grok-4.3',
			toolIds: [],
			kind: 'openclaw',
		})

		expect(agent.agentClient).toBe(client)
		expect(agent.memory).toBe(memory)
		expect(agent.mcpBridge).toBe(mcpBridge)
		expect(agent.registry).toBe(registry)
		expect(agent.scheduler).toBe(scheduler)
		expect(agent.approvalManager).toBe(approvalManager)
		expect(agent.agentInstance).toBe(agentInstance)
		expect(agent.agents.livAi?.id).toBe('a-1')
		expect(agent.agents.livAi?.kind).toBe('openclaw')
	})

	test('providerRouter identity preserved across attach* calls', () => {
		// `readonly` is a TypeScript-level guarantee — at runtime the slot is
		// a plain property. Regression-lock that attach* calls do NOT
		// inadvertently replace the providerRouter reference.
		const router = makeProviderRouter()
		const agent = new LivOSAgent({providerRouter: router})
		agent.attachMemory({})
		agent.attachMcpBridge({})
		agent.attachRegistry({})
		agent.attachScheduler({})
		agent.attachApprovalManager({})
		agent.attachAgentInstance({})
		expect(agent.providerRouter).toBe(router)
	})
})

describe('createAgentFromRow (Branch A)', () => {
	test('projects livos_agents row → OpenclawAgentHandle with kind=openclaw', () => {
		const handle = createAgentFromRow(
			makeRow({
				id: 'a-42',
				name: 'researcher',
				instructions: 'Research things.',
				modelName: 'anthropic/claude-sonnet-4-6',
				toolIds: ['weather', 'luse_screenshot'],
			}),
			{providerRouter: makeProviderRouter()},
		)
		expect(handle.id).toBe('a-42')
		expect(handle.name).toBe('researcher')
		expect(handle.instructions).toBe('Research things.')
		expect(handle.modelName).toBe('anthropic/claude-sonnet-4-6')
		expect(handle.toolIds).toEqual(['weather', 'luse_screenshot'])
		expect(handle.kind).toBe('openclaw')
	})

	test('empty modelName → factory falls back to providerRouter default', () => {
		const router = {
			resolveAgentModel: (name?: string) =>
				name && name.length > 0 ? name : 'xai/grok-4.3',
		} as unknown as ProviderRouter
		const handle = createAgentFromRow(
			makeRow({modelName: ''}),
			{providerRouter: router},
		)
		expect(handle.modelName).toBe('xai/grok-4.3')
	})

	test('subAgents map → handle.subAgentNames carries the keys (D-202-03)', () => {
		const childA: ReturnType<typeof createAgentFromRow> = createAgentFromRow(
			makeRow({id: 'c-1', name: 'researcher'}),
			{providerRouter: makeProviderRouter()},
		)
		const childB: ReturnType<typeof createAgentFromRow> = createAgentFromRow(
			makeRow({id: 'c-2', name: 'writer'}),
			{providerRouter: makeProviderRouter()},
		)
		const parent = createAgentFromRow(
			makeRow({id: 'p-1', name: 'supervisor'}),
			{
				providerRouter: makeProviderRouter(),
				subAgents: {researcher: childA, writer: childB},
			},
		) as ReturnType<typeof createAgentFromRow> & {
			subAgentNames?: readonly string[]
		}
		expect(parent.subAgentNames).toBeDefined()
		expect(parent.subAgentNames?.slice().sort()).toEqual([
			'researcher',
			'writer',
		])
	})

	test('memory/mcpBridge/approvalManager are accepted but ignored (Branch A)', () => {
		// Pass non-null values; they must NOT appear on the handle. The
		// factory's gateway-owns-everything posture means these fields are
		// accepted for SIGNATURE compatibility only.
		const handle = createAgentFromRow(makeRow(), {
			providerRouter: makeProviderRouter(),
			memory: {fake: 'memory'},
			mcpBridge: {fake: 'bridge'},
			approvalManager: {fake: 'manager'},
		}) as unknown as Record<string, unknown>
		expect('memory' in handle).toBe(false)
		expect('mcpBridge' in handle).toBe(false)
		expect('approvalManager' in handle).toBe(false)
	})
})

describe('ConversationMemoryAdapter (in-memory)', () => {
	test('saveThread persists into the backing Map', async () => {
		const adapter = createInMemoryAdapter()
		await adapter.saveThread({
			thread: {
				id: 't-1',
				resourceId: 'r-1',
				title: 'first',
				metadata: {foo: 'bar'},
			},
		})
		expect(adapter.threads.size).toBe(1)
		expect((adapter.threads.get('t-1') as {id: string}).id).toBe('t-1')
	})
})
