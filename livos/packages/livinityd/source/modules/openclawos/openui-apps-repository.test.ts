/**
 * Phase 203-04 — OpenUIAppsRepository unit tests.
 *
 * Covers ≥8 cases per the plan's Task 6 acceptance criteria:
 *
 *   1.  upsert (create-path) inserts row + returns it with version=1
 *   2.  upsert (update-path) bumps version + snapshots old content
 *   3.  upsert is idempotent on rapid re-issue (version increments correctly)
 *   4.  upsert respects the 25-version cap (oldest snapshot deleted on overflow)
 *   5.  getBySlug hit + miss (returns null when absent)
 *   6.  listAll returns rows in updated_at DESC order
 *   7.  listAll respects optional limit
 *   8.  delete clears row + cascades version history
 *   9.  delete is idempotent for missing slug
 *  10.  versions returns history rows newest-first
 *  11.  currentVersion returns the int or null
 *  12.  incrementVersion bumps + snapshots without changing content
 *
 * Strategy: hand-rolled drizzle mock mirroring the pattern from
 * `agent-repository.test.ts`. The mock implements just the call shapes the
 * repository actually uses (select/insert/update/delete builders + a
 * transaction wrapper that re-issues the same chain methods on a `tx` proxy).
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {
	MAX_VERSIONS_PER_SLUG,
	OpenUIAppsRepository,
} from './openui-apps-repository.js'
import type {
	LivosOpenuiApp,
	LivosOpenuiAppInsert,
	LivosOpenuiAppVersion,
} from '../../db/schema.js'

// --- Mock fixture state -----------------------------------------------------

let apps: LivosOpenuiApp[] = []
let versions: LivosOpenuiAppVersion[] = []

const newApp = (over: Partial<LivosOpenuiApp> = {}): LivosOpenuiApp => ({
	slug: over.slug ?? 'slug-' + Math.random().toString(36).slice(2, 8),
	name: over.name ?? 'app',
	content: over.content ?? 'root = Card("hi")',
	version: over.version ?? 1,
	userId: over.userId ?? null,
	createdAt: over.createdAt ?? new Date(),
	updatedAt: over.updatedAt ?? new Date(),
})

const eqMockTag = Symbol('eq-mock')

type Pred = {kind: 'eq' | 'lt' | 'and'; col?: string; value?: unknown; preds?: Pred[]}

vi.mock('drizzle-orm', () => ({
	eq: (col: {_column?: string; _table?: string}, value: unknown) => ({
		[eqMockTag]: true,
		kind: 'eq',
		col: col._column,
		table: col._table,
		value,
	}),
	lt: (col: {_column?: string; _table?: string}, value: unknown) => ({
		[eqMockTag]: true,
		kind: 'lt',
		col: col._column,
		table: col._table,
		value,
	}),
	and: (...preds: Pred[]) => ({[eqMockTag]: true, kind: 'and', preds}),
	desc: (col: unknown) => ({_desc: col}),
	sql: () => 'now()',
}))

vi.mock('../../db/schema.js', () => {
	const appsCol = (name: string) => ({_column: name, _table: 'apps'})
	const versCol = (name: string) => ({_column: name, _table: 'versions'})
	return {
		livosOpenuiApps: {
			slug: appsCol('slug'),
			name: appsCol('name'),
			content: appsCol('content'),
			version: appsCol('version'),
			userId: appsCol('userId'),
			createdAt: appsCol('createdAt'),
			updatedAt: appsCol('updatedAt'),
		},
		livosOpenuiAppVersions: {
			slug: versCol('slug'),
			version: versCol('version'),
			content: versCol('content'),
			snapshotAt: versCol('snapshotAt'),
		},
	}
})

// --- Predicate evaluation helpers ------------------------------------------

function evalPred<T extends Record<string, unknown>>(row: T, pred: Pred): boolean {
	if (pred.kind === 'eq') {
		return row[pred.col as string] === pred.value
	}
	if (pred.kind === 'lt') {
		const v = row[pred.col as string]
		return typeof v === 'number' && typeof pred.value === 'number' && v < pred.value
	}
	if (pred.kind === 'and') {
		return (pred.preds ?? []).every((p) => evalPred(row, p))
	}
	return false
}

function tableForPred(pred: Pred): 'apps' | 'versions' {
	if (pred.kind === 'and') {
		const inner = pred.preds?.[0]
		return inner ? tableForPred(inner) : 'apps'
	}
	const t = (pred as {table?: string}).table
	return (t as 'apps' | 'versions') ?? 'apps'
}

// --- Builder factory mirroring drizzle's chain shape -----------------------

const makeDb = () => {
	const selectChain = (sel?: Record<string, {_column: string; _table: string}>) => {
		const state: {
			fromTable?: 'apps' | 'versions'
			preds: Pred[]
			limit?: number
			orderBy?: unknown
		} = {preds: []}
		const chain: Record<string, unknown> & PromiseLike<unknown[]> = {
			from: (t: unknown) => {
				// Recognize the table by shape: we passed in livosOpenuiApps / Versions.
				// The mocked tables have _table tag on their columns; sample one to tell.
				const sample = Object.values(t as Record<string, unknown>)[0] as {
					_table?: string
				}
				state.fromTable = sample?._table === 'versions' ? 'versions' : 'apps'
				return chain
			},
			where: (pred: Pred) => {
				state.preds.push(pred)
				return chain
			},
			orderBy: (ord: unknown) => {
				state.orderBy = ord
				return chain
			},
			limit: (n: number) => {
				state.limit = n
				return chain
			},
			then: (resolve: (rows: unknown[]) => unknown) => {
				const rows = (state.fromTable === 'versions' ? versions : apps) as Array<
					Record<string, unknown>
				>
				let out = rows.filter((r) => state.preds.every((p) => evalPred(r, p)))
				if (state.orderBy) {
					// We only use `desc(updatedAt)` or `desc(version)` — sort accordingly.
					const desc = state.orderBy as {_desc?: {_column?: string}}
					const col = desc?._desc?._column
					if (col === 'updatedAt') {
						out = [...out].sort(
							(a, b) =>
								(b.updatedAt as Date).getTime() -
								(a.updatedAt as Date).getTime(),
						)
					} else if (col === 'version') {
						out = [...out].sort(
							(a, b) => (b.version as number) - (a.version as number),
						)
					}
				}
				if (state.limit !== undefined) out = out.slice(0, state.limit)
				// Map selected columns when `sel` was passed (versions/currentVersion).
				let projected: unknown[] = out
				if (sel) {
					projected = out.map((r) => {
						const obj: Record<string, unknown> = {}
						for (const key of Object.keys(sel)) {
							const colDef = (sel as Record<string, {_column: string}>)[key]
							obj[key] = (r as Record<string, unknown>)[colDef._column]
						}
						return obj
					})
				}
				return Promise.resolve(projected).then(resolve)
			},
		} as unknown as Record<string, unknown> & PromiseLike<unknown[]>
		return chain
	}

	const insertChain = (table: unknown) => {
		const sample = Object.values(table as Record<string, unknown>)[0] as {
			_table?: string
		}
		const target = sample?._table === 'versions' ? 'versions' : 'apps'
		const state: {input?: Record<string, unknown>} = {}
		const chain: Record<string, unknown> = {
			values: (input: Record<string, unknown>) => {
				state.input = input
				return chain
			},
			returning: async (): Promise<unknown[]> => {
				if (!state.input) throw new Error('insert called without values()')
				if (target === 'apps') {
					const row = newApp({
						slug: state.input.slug as string,
						name: state.input.name as string,
						content: state.input.content as string,
						version: (state.input.version as number) ?? 1,
						userId: (state.input.userId as string | null) ?? null,
					})
					apps.push(row)
					return [row]
				}
				const row: LivosOpenuiAppVersion = {
					slug: state.input.slug as string,
					version: state.input.version as number,
					content: state.input.content as string,
					snapshotAt: new Date(),
				}
				versions.push(row)
				return [row]
			},
		}
		// `await tx.insert(...).values(...)` (without .returning) is also used —
		// implement Promise interop so the bare call resolves.
		;(chain as {then?: unknown}).then = undefined
		const valuesFn = chain.values as (i: Record<string, unknown>) => unknown
		chain.values = (input: Record<string, unknown>) => {
			valuesFn(input)
			const result = {
				returning: chain.returning,
				then: (resolve: (v: unknown) => unknown) =>
					(chain.returning as () => Promise<unknown>)().then(resolve),
			}
			return result
		}
		return chain
	}

	const updateChain = (table: unknown) => {
		const sample = Object.values(table as Record<string, unknown>)[0] as {
			_table?: string
		}
		const target = sample?._table === 'versions' ? 'versions' : 'apps'
		const state: {patch?: Record<string, unknown>; preds: Pred[]} = {preds: []}
		const chain: Record<string, unknown> = {
			set: (patch: Record<string, unknown>) => {
				state.patch = patch
				return chain
			},
			where: (pred: Pred) => {
				state.preds.push(pred)
				return chain
			},
			returning: async (): Promise<unknown[]> => {
				const rows = (target === 'versions' ? versions : apps) as Array<
					Record<string, unknown>
				>
				const target1 = rows.find((r) => state.preds.every((p) => evalPred(r, p)))
				if (!target1) return []
				Object.assign(target1, state.patch ?? {})
				// Mirror updated_at = now() behaviour for downstream tests.
				if ('updatedAt' in (state.patch ?? {})) {
					target1.updatedAt = new Date()
				}
				return [target1]
			},
		}
		return chain
	}

	const deleteChain = (table: unknown) => {
		const sample = Object.values(table as Record<string, unknown>)[0] as {
			_table?: string
		}
		const target = sample?._table === 'versions' ? 'versions' : 'apps'
		const state: {preds: Pred[]} = {preds: []}
		const chain = {
			where: async (pred: Pred): Promise<void> => {
				state.preds.push(pred)
				if (target === 'versions') {
					versions = versions.filter(
						(r) =>
							!state.preds.every((p) =>
								evalPred(r as unknown as Record<string, unknown>, p),
							),
					)
				} else {
					apps = apps.filter(
						(r) =>
							!state.preds.every((p) =>
								evalPred(r as unknown as Record<string, unknown>, p),
							),
					)
				}
			},
		}
		return chain
	}

	const dbApi: Record<string, unknown> = {
		select: (sel?: Record<string, {_column: string; _table: string}>) =>
			selectChain(sel),
		insert: (t: unknown) => insertChain(t),
		update: (t: unknown) => updateChain(t),
		delete: (t: unknown) => deleteChain(t),
	}
	;(dbApi as {transaction: (fn: (tx: unknown) => unknown) => unknown}).transaction =
		async (fn: (tx: unknown) => unknown) => fn(dbApi)

	return dbApi as never
}

// --- Tests ------------------------------------------------------------------

beforeEach(() => {
	apps = []
	versions = []
	// Silence the predicate-table router (we use _table on the mocked schema)
})

describe('OpenUIAppsRepository', () => {
	test('Test 1: upsert create-path inserts row with version=1', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		const row = await repo.upsert({slug: 'calc', name: 'Calculator', content: 'root = Card("hi")'})
		expect(row.slug).toBe('calc')
		expect(row.version).toBe(1)
		expect(apps).toHaveLength(1)
		expect(versions).toHaveLength(0)
	})

	test('Test 2: upsert update-path bumps version + snapshots old content', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		await repo.upsert({slug: 'calc', name: 'Calculator', content: 'v1'})
		const updated = await repo.upsert({slug: 'calc', name: 'Calculator', content: 'v2'})
		expect(updated.version).toBe(2)
		expect(updated.content).toBe('v2')
		expect(versions).toHaveLength(1)
		expect(versions[0]?.version).toBe(1)
		expect(versions[0]?.content).toBe('v1')
	})

	test('Test 3: rapid re-issue increments version correctly', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		await repo.upsert({slug: 's', name: 'S', content: 'a'})
		await repo.upsert({slug: 's', name: 'S', content: 'b'})
		await repo.upsert({slug: 's', name: 'S', content: 'c'})
		const row = await repo.getBySlug('s')
		expect(row?.version).toBe(3)
		expect(row?.content).toBe('c')
		expect(versions.map((v) => v.content).sort()).toEqual(['a', 'b'])
	})

	test('Test 4: 25-version cap deletes oldest snapshot on overflow', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		await repo.upsert({slug: 'cap', name: 'Cap', content: 'v0'})
		// Push 30 updates → snapshots v0..v29. Cap MAX_VERSIONS_PER_SLUG=25
		// keeps versions whose `version >= (currentVersion - MAX)`.
		for (let i = 1; i <= 30; i++) {
			await repo.upsert({slug: 'cap', name: 'Cap', content: `v${i}`})
		}
		expect(MAX_VERSIONS_PER_SLUG).toBe(25)
		// 30 update calls → 30 snapshot rows in versions table, capped to last 25.
		expect(versions.length).toBeLessThanOrEqual(MAX_VERSIONS_PER_SLUG)
		// The oldest surviving snapshot should be version ≥ 6 (parent at v31 →
		// keep versions ≥ 31 - 25 = 6). v0..v5 should be gone.
		const versionNums = versions.map((v) => v.version).sort((a, b) => a - b)
		expect(versionNums[0]).toBeGreaterThanOrEqual(6)
	})

	test('Test 5: getBySlug hit + miss', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		await repo.upsert({slug: 'a', name: 'A', content: ''})
		expect((await repo.getBySlug('a'))?.slug).toBe('a')
		expect(await repo.getBySlug('zzz')).toBeNull()
	})

	test('Test 6: listAll returns rows in updated_at DESC order', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		await repo.upsert({slug: 'a', name: 'A', content: ''})
		await new Promise((r) => setTimeout(r, 4))
		await repo.upsert({slug: 'b', name: 'B', content: ''})
		await new Promise((r) => setTimeout(r, 4))
		await repo.upsert({slug: 'c', name: 'C', content: ''})
		const all = await repo.listAll()
		expect(all.map((r) => r.slug)).toEqual(['c', 'b', 'a'])
	})

	test('Test 7: listAll respects optional limit', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		for (const s of ['a', 'b', 'c', 'd']) {
			await repo.upsert({slug: s, name: s, content: ''})
		}
		const subset = await repo.listAll({limit: 2})
		expect(subset).toHaveLength(2)
	})

	test('Test 8: delete clears row + cascades version history (manual cascade)', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		await repo.upsert({slug: 'x', name: 'X', content: 'a'})
		await repo.upsert({slug: 'x', name: 'X', content: 'b'})
		expect(apps).toHaveLength(1)
		expect(versions).toHaveLength(1)
		await repo.delete('x')
		expect(apps).toHaveLength(0)
		expect(versions).toHaveLength(0)
	})

	test('Test 9: delete is idempotent for missing slug', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		await expect(repo.delete('nope')).resolves.toBeUndefined()
	})

	test('Test 10: versions returns history rows newest first', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		await repo.upsert({slug: 'v', name: 'V', content: 'one'})
		await repo.upsert({slug: 'v', name: 'V', content: 'two'})
		await repo.upsert({slug: 'v', name: 'V', content: 'three'})
		const list = await repo.versions('v')
		// 3 upserts → 2 snapshots (only the pre-update rows get snapshotted).
		expect(list).toHaveLength(2)
		// Newest first
		expect(list[0]?.version).toBeGreaterThan(list[1]?.version ?? 0)
	})

	test('Test 11: currentVersion returns int or null', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		expect(await repo.currentVersion('missing')).toBeNull()
		await repo.upsert({slug: 'p', name: 'P', content: 'one'})
		await repo.upsert({slug: 'p', name: 'P', content: 'two'})
		expect(await repo.currentVersion('p')).toBe(2)
	})

	test('Test 12: incrementVersion bumps + snapshots without changing content', async () => {
		const repo = new OpenUIAppsRepository(makeDb())
		await repo.upsert({slug: 'i', name: 'I', content: 'frozen'})
		const before = await repo.getBySlug('i')
		expect(before?.version).toBe(1)
		const bumped = await repo.incrementVersion('i')
		expect(bumped?.version).toBe(2)
		expect(bumped?.content).toBe('frozen')
		expect(versions).toHaveLength(1)
		expect(versions[0]?.content).toBe('frozen')
	})
})
