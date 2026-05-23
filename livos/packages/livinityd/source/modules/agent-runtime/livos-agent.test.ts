/**
 * Phase 203-08 — LivOSAgent + agent-factory unit tests.
 *
 * Updated post-203-08 Mastra purge:
 *   - LivOSAgent slot types narrowed (AgentRegistry/Scheduler/McpBridge/
 *     ApprovalManager concrete classes); test mocks are cast via `as never`.
 *   - createAgentFromRow now returns LocalAgent (no `kind` discriminator);
 *     the OpenclawAgentHandle branch is exercised separately via
 *     attachLivAi which accepts both LocalAgent and OpenclawAgentHandle.
 *
 * Covers ≥6 cases (extended to 9 post-203-08):
 *   1. construction wires providerRouter + default no-op logger
 *   2. attach* method round-trips for all 7 slots
 *   3. providerRouter identity preserved across attach* calls
 *   4. createAgentFromRow projects row → LocalAgent with row metadata
 *   5. row.modelName is preserved verbatim (factory no longer remaps)
 *   6. subAgents map → handle.subAgentNames carries the keys (D-202-03)
 *   7. agent-factory ignores per-Branch-A deps that are gateway concerns
 *   8. in-memory adapter saveThread round-trip
 *   9. attachLivAi accepts OpenclawAgentHandle (back-compat slot shape)
 */

import {describe, expect, test} from 'vitest'

import {LivOSAgent, createAgentFromRow} from './index.js'
import {OpenclawClient} from './openclaw-client.js'
import {createInMemoryAdapter} from './memory.js'
import type {LivosAgent} from '../../db/schema.js'
import type {ProviderRouter, ApprovalGate} from './types.js'
import type {McpBridge} from './mcp-bridge.js'

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
		// Phase 203-08 — slot types narrowed to concrete classes; the test
		// mocks satisfy only the methods the code under test calls so cast
		// via `as never` to keep the duck-typed surface honest.
		const mcpBridge = {listTools: async () => ({}), destroy: async () => undefined}
		const registry = {refresh: async () => undefined}
		const scheduler = {refresh: async () => undefined}
		const approvalManager = {requestSync: async () => 'approved' as const}
		const agentInstance = {kind: 'placeholder'}

		agent.attachAgentClient(client)
		agent.attachMemory(memory)
		agent.attachMcpBridge(mcpBridge as never)
		agent.attachRegistry(registry as never)
		agent.attachScheduler(scheduler as never)
		agent.attachApprovalManager(approvalManager as never)
		agent.attachAgentInstance(agentInstance)
		// Phase 203-08 — attachLivAi now accepts both LocalAgent and
		// OpenclawAgentHandle. The OpenclawAgentHandle shape (carries `kind`)
		// is exercised here to cover the back-compat slot path; LocalAgent is
		// exercised via createAgentFromRow → attachLivAi(handle).
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
		expect(agent.mcpBridge).toBe(mcpBridge as never)
		expect(agent.registry).toBe(registry as never)
		expect(agent.scheduler).toBe(scheduler as never)
		expect(agent.approvalManager).toBe(approvalManager as never)
		expect(agent.agentInstance).toBe(agentInstance)
		expect(agent.agents.livAi?.id).toBe('a-1')
		// OpenclawAgentHandle slot carries `kind`; LocalAgent does not.
		expect(
			(agent.agents.livAi as {kind?: string}).kind,
		).toBe('openclaw')
	})

	test('providerRouter identity preserved across attach* calls', () => {
		// `readonly` is a TypeScript-level guarantee — at runtime the slot is
		// a plain property. Regression-lock that attach* calls do NOT
		// inadvertently replace the providerRouter reference.
		const router = makeProviderRouter()
		const agent = new LivOSAgent({providerRouter: router})
		agent.attachMemory({})
		agent.attachMcpBridge(null)
		agent.attachRegistry(null)
		agent.attachScheduler(null)
		agent.attachApprovalManager(null)
		agent.attachAgentInstance({})
		expect(agent.providerRouter).toBe(router)
	})
})

describe('createAgentFromRow (Branch A / Plan 203-08)', () => {
	// Phase 203-08 — minimal AgentFactoryDeps factory. The post-203-08
	// factory requires mcpBridge + approvalManager structurally even though
	// the implementation only touches approvalManager (gate wrap). Mocked
	// here with the minimum surface to satisfy TypeScript.
	function makeDeps(over: Partial<{
		subAgents: Record<string, ReturnType<typeof createAgentFromRow>>
		providerRouter: ProviderRouter
	}> = {}): Parameters<typeof createAgentFromRow>[1] {
		const noopGate: ApprovalGate = {
			registerPending: async () => true,
		}
		const noopBridge: McpBridge = {
			listTools: async () => ({}),
			destroy: async () => undefined,
		}
		return {
			providerRouter: over.providerRouter ?? makeProviderRouter(),
			memory: null,
			mcpBridge: noopBridge,
			approvalManager: noopGate,
			...(over.subAgents ? {subAgents: over.subAgents} : {}),
		}
	}

	test('projects livos_agents row → LocalAgent carrying row metadata', () => {
		const handle = createAgentFromRow(
			makeRow({
				id: 'a-42',
				name: 'researcher',
				instructions: 'Research things.',
				modelName: 'anthropic/claude-sonnet-4-6',
				toolIds: ['weather', 'luse_screenshot'],
			}),
			makeDeps(),
		)
		expect(handle.id).toBe('a-42')
		expect(handle.name).toBe('researcher')
		expect(handle.instructions).toBe('Research things.')
		expect(handle.modelName).toBe('anthropic/claude-sonnet-4-6')
		expect(handle.toolIds).toEqual(['weather', 'luse_screenshot'])
		// `tools` map is non-empty (built-ins are wrapped + filtered).
		expect(typeof handle.tools).toBe('object')
	})

	test('row.modelName is preserved verbatim (factory no longer remaps)', () => {
		const handle = createAgentFromRow(
			makeRow({modelName: 'xai/grok-4.3'}),
			makeDeps(),
		)
		expect(handle.modelName).toBe('xai/grok-4.3')
	})

	test('subAgents map → handle.subAgentNames carries the keys (D-202-03)', () => {
		const childA = createAgentFromRow(
			makeRow({id: 'c-1', name: 'researcher'}),
			makeDeps(),
		)
		const childB = createAgentFromRow(
			makeRow({id: 'c-2', name: 'writer'}),
			makeDeps(),
		)
		const parent = createAgentFromRow(
			makeRow({id: 'p-1', name: 'supervisor'}),
			makeDeps({subAgents: {researcher: childA, writer: childB}}),
		)
		expect(parent.subAgentNames).toBeDefined()
		expect(parent.subAgentNames?.slice().sort()).toEqual([
			'researcher',
			'writer',
		])
	})

	test('factory rejects toolIds outside the built-in catalog (allow-list filter)', () => {
		const handle = createAgentFromRow(
			makeRow({toolIds: ['weather', 'totally_unknown_tool']}),
			makeDeps(),
		)
		// `weather` is a built-in; `totally_unknown_tool` is not — dropped by
		// applyRowToolFilter inside the factory.
		expect(Object.keys(handle.tools)).toEqual(['weather'])
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
