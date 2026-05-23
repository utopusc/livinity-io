/**
 * Phase 202-01 — AgentRepository unit tests.
 *
 * Covers ≥8 cases per the plan's Task 5 acceptance criteria:
 *   1. listAll returns every row in the table
 *   2. getById returns the matching row + null when absent
 *   3. getByName returns the matching row + null when absent
 *   4. create inserts + returns the persisted row
 *   5. create rejects on duplicate name (UNIQUE violation surfaced unchanged) — T-202-02
 *   6. update bumps updatedAt + returns the merged row
 *   7. update throws when the row id is absent
 *   8. delete refuses system=true rows (D-202-20)
 *   9. delete is idempotent for missing-row case
 *  10. listChildren returns rows matching parent_agent_id
 *  11. grandchild insert raises the trigger EXCEPTION (T-202-04 propagation)
 *  12. seedSystemAgents is idempotent (second call is a no-op)
 *
 * Strategy: hand-rolled mock NodePgDatabase that records every drizzle
 * builder-chain call into a captured-fixtures array. This sidesteps the
 * need for a live PG connection during unit tests; the SQL contract is
 * already covered by `0002_livos_agents.sql` being CREATE-IF-NOT-EXISTS
 * idempotent (boot smoke test in Phase 202-VERIFICATION.md).
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	AgentRepository,
	seedSystemAgents,
	LIV_AI_SYSTEM_PROMPT,
} from './agent-repository.js'
import type {LivosAgent, LivosAgentInsert} from '../../../db/schema.js'

// --- Mock fixture state -----------------------------------------------------

type Row = LivosAgent
let rows: Row[] = []
let throwOnInsert: Error | null = null
let throwOnUpdate: Error | null = null

const newRow = (over: Partial<Row> = {}): Row => ({
	id: over.id ?? 'agent-' + Math.random().toString(36).slice(2, 8),
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

/**
 * Hand-rolled drizzle-style builder. We only need to honour the four call
 * shapes AgentRepository uses:
 *
 *   db.select().from(t)                            → Promise<Row[]>
 *   db.select().from(t).where(eq(t.col,v)).limit(n) → Promise<Row[]>
 *   db.select().from(t).where(eq(t.col,v))         → Promise<Row[]>
 *   db.insert(t).values(input).returning()         → Promise<Row[]>
 *   db.update(t).set(patch).where(...).returning() → Promise<Row[]>
 *   db.delete(t).where(...)                        → Promise<void>
 *
 * The drizzle `eq()` helper returns a tagged object — we inspect it in the
 * mock's .where() handler to read off (col, value).
 */
type WherePred = {col: string; value: unknown}
const eqMockTag = Symbol('eq-mock')

vi.mock('drizzle-orm', () => ({
	eq: (col: {_column: string}, value: unknown) => ({
		[eqMockTag]: true,
		col: col._column,
		value,
	}),
}))

// Mock the schema export so the columns expose `_column: '<name>'` markers.
vi.mock('../../../db/schema.js', () => {
	const col = (name: string) => ({_column: name})
	return {
		livosAgents: {
			id: col('id'),
			name: col('name'),
			instructions: col('instructions'),
			modelName: col('modelName'),
			toolIds: col('toolIds'),
			scheduleCron: col('scheduleCron'),
			parentAgentId: col('parentAgentId'),
			enabled: col('enabled'),
			system: col('system'),
			createdAt: col('createdAt'),
			updatedAt: col('updatedAt'),
		},
	}
})

const enforceUnique = (input: LivosAgentInsert): void => {
	if (rows.some((r) => r.name === input.name)) {
		throw new Error(
			'duplicate key value violates unique constraint "livos_agents_name_key"',
		)
	}
}

const enforceDepthTrigger = (input: LivosAgentInsert): void => {
	// Mirror the SQL trigger: if parent already has a non-null parent, reject.
	if (input.parentAgentId) {
		const parent = rows.find((r) => r.id === input.parentAgentId)
		if (parent && parent.parentAgentId) {
			throw new Error('Sub-agent depth > 2 not allowed (D-202-13)')
		}
	}
}

const makeDb = () => {
	const filterRows = (preds: WherePred[]): Row[] =>
		rows.filter((r) =>
			preds.every(
				(p) => (r as unknown as Record<string, unknown>)[p.col] === p.value,
			),
		)

	const selectChain = () => {
		const state: {preds: WherePred[]; limited?: number} = {preds: []}
		const chain: Record<string, unknown> & PromiseLike<Row[]> = {
			from: () => chain,
			where: (pred: WherePred) => {
				state.preds.push(pred)
				return chain
			},
			limit: (n: number) => {
				state.limited = n
				return chain
			},
			then: (resolve: (rows: Row[]) => unknown) => {
				let out = filterRows(state.preds)
				if (state.limited !== undefined) out = out.slice(0, state.limited)
				return Promise.resolve(out).then(resolve)
			},
		} as unknown as Record<string, unknown> & PromiseLike<Row[]>
		return chain
	}

	const insertChain = () => {
		const state: {input?: LivosAgentInsert} = {}
		const chain = {
			values: (input: LivosAgentInsert) => {
				state.input = input
				return chain
			},
			returning: async (): Promise<Row[]> => {
				if (throwOnInsert) throw throwOnInsert
				if (!state.input) throw new Error('insert called without values()')
				enforceUnique(state.input)
				enforceDepthTrigger(state.input)
				const row = newRow(state.input as Partial<Row>)
				rows.push(row)
				return [row]
			},
		}
		return chain
	}

	const updateChain = () => {
		const state: {patch?: Partial<Row>; preds: WherePred[]} = {preds: []}
		const chain = {
			set: (patch: Partial<Row>) => {
				state.patch = patch
				return chain
			},
			where: (pred: WherePred) => {
				state.preds.push(pred)
				return chain
			},
			returning: async (): Promise<Row[]> => {
				if (throwOnUpdate) throw throwOnUpdate
				const target = filterRows(state.preds)[0]
				if (!target) return []
				Object.assign(target, state.patch)
				return [target]
			},
		}
		return chain
	}

	const deleteChain = () => {
		const state: {preds: WherePred[]} = {preds: []}
		const chain = {
			where: async (pred: WherePred): Promise<void> => {
				state.preds.push(pred)
				rows = rows.filter(
					(r) =>
						!state.preds.every(
							(p) =>
								(r as unknown as Record<string, unknown>)[p.col] === p.value,
						),
				)
			},
		}
		return chain
	}

	return {
		select: () => selectChain(),
		insert: () => insertChain(),
		update: () => updateChain(),
		delete: () => deleteChain(),
	} as never
}

// --- Tests ------------------------------------------------------------------

beforeEach(() => {
	rows = []
	throwOnInsert = null
	throwOnUpdate = null
})

describe('AgentRepository', () => {
	test('Test 1: listAll returns every row', async () => {
		rows = [newRow({id: 'a', name: 'A'}), newRow({id: 'b', name: 'B'})]
		const repo = new AgentRepository(makeDb())
		const all = await repo.listAll()
		expect(all).toHaveLength(2)
		expect(all.map((r) => r.name).sort()).toEqual(['A', 'B'])
	})

	test('Test 2: getById hits + miss', async () => {
		rows = [newRow({id: 'a', name: 'A'})]
		const repo = new AgentRepository(makeDb())
		expect((await repo.getById('a'))?.name).toBe('A')
		expect(await repo.getById('missing')).toBeNull()
	})

	test('Test 3: getByName hits + miss', async () => {
		rows = [newRow({id: 'a', name: 'A'})]
		const repo = new AgentRepository(makeDb())
		expect((await repo.getByName('A'))?.id).toBe('a')
		expect(await repo.getByName('Z')).toBeNull()
	})

	test('Test 4: create persists + returns the row', async () => {
		const repo = new AgentRepository(makeDb())
		const row = await repo.create({
			id: 'foo',
			name: 'Foo',
			instructions: 'hi',
			modelName: 'grok-4.3',
			toolIds: ['weather'],
		})
		expect(row.id).toBe('foo')
		expect(row.name).toBe('Foo')
		expect(rows).toHaveLength(1)
	})

	test('Test 5: create rejects duplicate name (T-202-02 unique violation)', async () => {
		const repo = new AgentRepository(makeDb())
		await repo.create({id: 'a', name: 'Dup'})
		await expect(repo.create({id: 'b', name: 'Dup'})).rejects.toThrow(
			/unique constraint/i,
		)
	})

	test('Test 6: update bumps updatedAt + merges patch', async () => {
		rows = [newRow({id: 'a', name: 'A', instructions: 'old'})]
		const before = rows[0].updatedAt.getTime()
		await new Promise((r) => setTimeout(r, 5))
		const repo = new AgentRepository(makeDb())
		const updated = await repo.update('a', {instructions: 'new'})
		expect(updated.instructions).toBe('new')
		expect(updated.updatedAt.getTime()).toBeGreaterThan(before)
	})

	test('Test 7: update throws when id absent', async () => {
		const repo = new AgentRepository(makeDb())
		await expect(repo.update('ghost', {enabled: false})).rejects.toThrow(
			/agent ghost not found/,
		)
	})

	test('Test 8: delete refuses system=true (D-202-20)', async () => {
		rows = [newRow({id: 'livai', name: 'livAi', system: true})]
		const repo = new AgentRepository(makeDb())
		await expect(repo.delete('livai')).rejects.toThrow(
			/system agent livAi cannot be deleted/,
		)
		expect(rows).toHaveLength(1)
	})

	test('Test 9: delete is idempotent for missing rows', async () => {
		const repo = new AgentRepository(makeDb())
		await expect(repo.delete('nope')).resolves.toBeUndefined()
	})

	test('Test 10: listChildren returns rows matching parent_agent_id', async () => {
		rows = [
			newRow({id: 'p', name: 'Parent'}),
			newRow({id: 'c1', name: 'Child1', parentAgentId: 'p'}),
			newRow({id: 'c2', name: 'Child2', parentAgentId: 'p'}),
			newRow({id: 'o', name: 'Orphan'}),
		]
		const repo = new AgentRepository(makeDb())
		const kids = await repo.listChildren('p')
		expect(kids).toHaveLength(2)
		expect(kids.map((r) => r.name).sort()).toEqual(['Child1', 'Child2'])
	})

	test('Test 11: grandchild insert raises trigger exception (T-202-04)', async () => {
		rows = [
			newRow({id: 'gp', name: 'GrandParent'}),
			newRow({id: 'p', name: 'Parent', parentAgentId: 'gp'}),
		]
		const repo = new AgentRepository(makeDb())
		await expect(
			repo.create({id: 'c', name: 'Grandchild', parentAgentId: 'p'}),
		).rejects.toThrow(/Sub-agent depth > 2 not allowed/)
	})
})

describe('seedSystemAgents', () => {
	test('Test 12a: first call inserts livAi with system=true', async () => {
		const db = makeDb()
		const repo = new AgentRepository(db)
		await seedSystemAgents(repo)
		expect(rows).toHaveLength(1)
		expect(rows[0].id).toBe('livai')
		expect(rows[0].name).toBe('livAi')
		expect(rows[0].system).toBe(true)
		expect(rows[0].modelName).toBe('grok-4.3')
		expect(rows[0].instructions).toBe(LIV_AI_SYSTEM_PROMPT)
	})

	test('Test 12b: second call is a no-op (idempotent)', async () => {
		const repo = new AgentRepository(makeDb())
		await seedSystemAgents(repo)
		await seedSystemAgents(repo)
		expect(rows).toHaveLength(1)
	})
})
