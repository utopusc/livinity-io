/**
 * Phase 202-02 Task 5 — AgentRegistry unit tests.
 *
 * Coverage (≥6 PASS):
 *   1. init() populates the live map from the repository (3 rows)
 *   2. refresh() is idempotent (size stable across two consecutive calls)
 *   3. Supervisor wiring — parent with 2 children → parent's Agent ctor
 *      receives an `agents: {…}` map with both child names as keys
 *   4. Leaf agents (no children) constructed WITHOUT `agents:` key
 *   5. Disabled rows skipped — not in registry.listAll(), not in the
 *      parent's Supervisor map even when listed as a child
 *   6. T-202-04 depth > 2 — 3-level chain triggers logger.warn + deeper
 *      level not wired into the immediate parent's Supervisor map
 *   7. T-202-05 single-flight — two concurrent refresh() calls share the
 *      same in-flight Promise and result in one repo.listAll() call
 *   8. getByName + get accessor coverage + rowsAll includes disabled
 *
 * Strategy: vi.mock @mastra/core/agent so `new Agent(args)` captures args
 * into a side-channel array. The factory body in agent-factory.ts is
 * exercised directly (no per-factory mock) so the Supervisor `agents:`
 * propagation is observable through the captured args.
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import type {LivosAgent} from '../../../db/schema.js'

// Phase 203-08 — agent-factory no longer constructs `new Agent({...})` from
// `@mastra/core/agent` (Mastra purge). Tests that previously inspected the
// Agent ctor args now inspect the LocalAgent objects returned by
// `registry.get()` / `registry.listAll()` directly. The `agentCtorArgs`
// shim is kept as a structural mirror so test names continue to read
// naturally — each entry is captured by the registry-level
// `__captureFactoryArgs` hook fired post-`createAgentFromRow`.

import {AgentRegistry} from './agent-registry.js'
import type {ApprovalGate} from './wrap-tool-with-approval.js'

// --- Fixtures + mock repo ---------------------------------------------------

const newRow = (over: Partial<LivosAgent> = {}): LivosAgent => ({
	id: over.id ?? 'r-' + Math.random().toString(36).slice(2, 6),
	name: over.name ?? 'unnamed',
	instructions: over.instructions ?? '',
	modelName: over.modelName ?? 'grok-4.3',
	toolIds: over.toolIds ?? [],
	scheduleCron: over.scheduleCron ?? null,
	parentAgentId: over.parentAgentId ?? null,
	enabled: over.enabled ?? true,
	system: over.system ?? false,
	createdAt: over.createdAt ?? new Date(),
	updatedAt: over.updatedAt ?? new Date(),
})

function makeRegistry(rows: LivosAgent[]): {
	registry: AgentRegistry
	listAllSpy: ReturnType<typeof vi.fn>
	warnSpy: ReturnType<typeof vi.fn>
	infoSpy: ReturnType<typeof vi.fn>
} {
	const listAllSpy = vi.fn().mockResolvedValue(rows)
	const warnSpy = vi.fn()
	const infoSpy = vi.fn()
	const registry = new AgentRegistry({
		repo: {listAll: listAllSpy} as never,
		providerRouter: {
			resolveAgentModel: vi.fn().mockResolvedValue({modelId: 'grok-4.20'}),
		} as never,
		memory: {kind: 'mem'},
		mcpBridge: {
			listTools: vi.fn().mockResolvedValue({}),
			destroy: vi.fn(),
		} as never,
		approvalManager: {
			registerPending: vi.fn().mockResolvedValue(true),
		} as unknown as ApprovalGate,
		logger: {info: infoSpy, warn: warnSpy},
	})
	return {registry, listAllSpy, warnSpy, infoSpy}
}

describe('AgentRegistry', () => {
	beforeEach(() => {
		// No-op post-203-08 — agentCtorArgs deleted; tests inspect LocalAgent
		// objects via registry.get() directly.
	})

	test('Test 1: init() populates the live map from the repo (3 rows)', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha'}),
			newRow({id: 'b', name: 'Beta'}),
			newRow({id: 'c', name: 'Gamma'}),
		]
		const {registry, listAllSpy} = makeRegistry(rows)
		await registry.init()
		expect(listAllSpy).toHaveBeenCalledTimes(1)
		expect(registry.listAll().length).toBe(3)
		expect(registry.getByName('Alpha')).toBeDefined()
		expect(registry.getByName('Beta')).toBeDefined()
		expect(registry.getByName('Gamma')).toBeDefined()
	})

	test('Test 2: refresh() is idempotent across two sequential calls', async () => {
		const rows = [newRow({id: 'a', name: 'A'}), newRow({id: 'b', name: 'B'})]
		const {registry} = makeRegistry(rows)
		await registry.init()
		const size1 = registry.listAll().length
		await registry.refresh()
		const size2 = registry.listAll().length
		expect(size1).toBe(size2)
		expect(size2).toBe(2)
	})

	test('Test 3: Supervisor — parent with 2 children → handle.subAgentNames carries both', async () => {
		const rows = [
			newRow({id: 'p', name: 'Parent'}),
			newRow({id: 'c1', name: 'Child1', parentAgentId: 'p'}),
			newRow({id: 'c2', name: 'Child2', parentAgentId: 'p'}),
		]
		const {registry} = makeRegistry(rows)
		await registry.init()
		// Phase 203-08 — factory returns LocalAgent; the supervisor projection
		// is `subAgentNames` (string[]) rather than Mastra's `agents` map.
		const parent = registry.get('p') as {subAgentNames?: readonly string[]} | undefined
		expect(parent).toBeDefined()
		expect(parent?.subAgentNames?.slice().sort()).toEqual(['Child1', 'Child2'])
	})

	test('Test 4: Leaf agents constructed without subAgentNames key', async () => {
		const rows = [
			newRow({id: 'leaf1', name: 'Leaf1'}),
			newRow({id: 'leaf2', name: 'Leaf2'}),
		]
		const {registry} = makeRegistry(rows)
		await registry.init()
		for (const {agent} of registry.listAll()) {
			expect(
				(agent as {subAgentNames?: readonly string[]}).subAgentNames,
			).toBeUndefined()
		}
	})

	test('Test 5: Disabled rows skipped from listAll + Supervisor map', async () => {
		const rows = [
			newRow({id: 'p', name: 'Parent'}),
			newRow({id: 'c1', name: 'Child1', parentAgentId: 'p'}),
			newRow({
				id: 'c2',
				name: 'Child2',
				parentAgentId: 'p',
				enabled: false,
			}),
			newRow({id: 'dis', name: 'Disabled', enabled: false}),
		]
		const {registry} = makeRegistry(rows)
		await registry.init()
		expect(registry.listAll().map((a) => a.name).sort()).toEqual([
			'Child1',
			'Parent',
		])
		expect(registry.getByName('Disabled')).toBeUndefined()
		expect(registry.getByName('Child2')).toBeUndefined()
		// Parent's subAgentNames must NOT include the disabled child.
		const parent = registry.get('p') as {subAgentNames?: readonly string[]} | undefined
		expect(parent).toBeDefined()
		expect(parent?.subAgentNames?.slice().sort()).toEqual(['Child1'])
	})

	test('Test 6: T-202-04 depth > 2 — 3-level chain triggers logger.warn', async () => {
		const rows = [
			newRow({id: 'g', name: 'Grandparent'}),
			newRow({id: 'p', name: 'Parent', parentAgentId: 'g'}),
			newRow({id: 'c', name: 'Child', parentAgentId: 'p'}),
		]
		const {registry, warnSpy} = makeRegistry(rows)
		await registry.init()
		// Grandparent's Supervisor wiring detects that its child (Parent) is
		// itself a parent — warn fired.
		expect(warnSpy).toHaveBeenCalled()
		const calls = warnSpy.mock.calls.map((c) => c[0]).join('\n')
		expect(calls).toMatch(/depth > 2/)
		// The grandparent's subAgentNames still contains the immediate child
		// (Parent) — defense-in-depth doesn't strip the depth-2 level, only
		// warns about the depth-3 level beyond it.
		const grandparent = registry.get('g') as {subAgentNames?: readonly string[]} | undefined
		expect(grandparent).toBeDefined()
		expect(grandparent?.subAgentNames).toContain('Parent')
	})

	test('Test 7: T-202-05 single-flight — concurrent refresh calls coalesce', async () => {
		const rows = [newRow({id: 'a', name: 'A'})]
		const {registry, listAllSpy} = makeRegistry(rows)
		// Slow the repo response so two refresh() calls overlap.
		let resolveListAll: (v: LivosAgent[]) => void = () => {}
		listAllSpy.mockReturnValue(
			new Promise<LivosAgent[]>((r) => {
				resolveListAll = r
			}),
		)
		const p1 = registry.refresh()
		const p2 = registry.refresh()
		// Both calls share one in-flight Promise — listAll only fired once.
		expect(listAllSpy).toHaveBeenCalledTimes(1)
		resolveListAll(rows)
		await Promise.all([p1, p2])
		expect(registry.listAll().length).toBe(1)
	})

	test('Test 8: getByName + get + rowsAll accessor coverage', async () => {
		const rows = [
			newRow({id: 'a', name: 'Alpha'}),
			newRow({id: 'd', name: 'Disabled', enabled: false}),
		]
		const {registry} = makeRegistry(rows)
		await registry.init()
		expect(registry.get('a')).toBeDefined()
		expect(registry.get('missing')).toBeUndefined()
		expect(registry.getByName('Alpha')).toBeDefined()
		expect(registry.getByName('NotThere')).toBeUndefined()
		// rowsAll includes disabled rows (so chat-route can still 404
		// against a disabled-name lookup without round-tripping the repo).
		expect(registry.rowsAll().map((r) => r.name).sort()).toEqual([
			'Alpha',
			'Disabled',
		])
	})
})
