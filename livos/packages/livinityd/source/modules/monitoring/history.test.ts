// Phase 320 Plan 01 Task 3 — history.ts PG-CRUD unit tests.
//
// Strategy (cloned from smart-alerts.test.ts): mock getPool() (from
// ../database/index.js). Per case, point the mock at either `null` (fail-open
// safety) or a fake pool whose .query is a vi.fn() returning {rows}. No real
// PostgreSQL needed — assertions verify the SQL target table, the range->table
// routing, the bound params, the snake_case -> camelCase mapping, and that the
// null-pool branch issues NO query for every function.

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {getPool} from '../database/index.js'

vi.mock('../database/index.js', () => ({getPool: vi.fn()}))

// Import AFTER the mock declaration (vi.mock is hoisted).
import {
	aggregateRollups,
	getResourceHistory,
	insertResourceSample,
	pruneOldRows,
} from './history.js'

// A fake Pool whose query is a vi.fn we can point per-case.
function fakePool(result: {rows: unknown[]; rowCount?: number} = {rows: []}) {
	const query = vi.fn().mockResolvedValue(result)
	return {pool: {query} as unknown as ReturnType<typeof getPool>, query}
}

beforeEach(() => {
	vi.mocked(getPool).mockReset()
})

// A representative raw-tier row (snake_case; pg returns BIGINT as string).
const RAW_ROW = {
	time: new Date('2026-07-14T00:00:00Z'),
	cpu_pct: 12.5,
	mem_used_bytes: '2000000000',
	mem_total_bytes: '8000000000',
	disk_read_bps: '1000',
	disk_write_bps: '2000',
	net_rx_bps: '3000',
	net_tx_bps: '4000',
}

// ─────────────────────────────────────────────────────────────────────────
// insertResourceSample
// ─────────────────────────────────────────────────────────────────────────
describe('insertResourceSample', () => {
	test('inserts one wide row into resource_samples_raw with the 7 metrics as $1..$7', async () => {
		const {pool, query} = fakePool({rows: [], rowCount: 1})
		vi.mocked(getPool).mockReturnValue(pool)

		const result = await insertResourceSample({
			cpuPct: 12.5,
			memUsedBytes: 2000000000,
			memTotalBytes: 8000000000,
			diskReadBps: 1000,
			diskWriteBps: 2000,
			netRxBps: 3000,
			netTxBps: 4000,
		})

		expect(result).toBeNull() // fire-and-forget, no RETURNING
		expect(query).toHaveBeenCalledTimes(1)
		const [sql, params] = query.mock.calls[0]
		expect(sql).toMatch(/INSERT INTO resource_samples_raw/)
		expect(sql).toMatch(/VALUES \(NOW\(\), \$1, \$2, \$3, \$4, \$5, \$6, \$7\)/)
		expect(sql).toMatch(/ON CONFLICT \(ts\) DO NOTHING/)
		// bound params order: cpuPct, memUsed, memTotal, diskRead, diskWrite, netRx, netTx
		expect(params).toEqual([12.5, 2000000000, 8000000000, 1000, 2000, 3000, 4000])
	})

	test('null pool -> returns null, issues no query (fail-open, fire-and-forget safe)', async () => {
		const {query} = fakePool()
		vi.mocked(getPool).mockReturnValue(null)

		await expect(
			insertResourceSample({
				cpuPct: 1,
				memUsedBytes: 1,
				memTotalBytes: 1,
				diskReadBps: null,
				diskWriteBps: null,
				netRxBps: 1,
				netTxBps: 1,
			}),
		).resolves.toBeNull()
		expect(query).not.toHaveBeenCalled()
	})
})

// ─────────────────────────────────────────────────────────────────────────
// getResourceHistory — range -> table routing (the Plan 04 contract)
// ─────────────────────────────────────────────────────────────────────────
describe('getResourceHistory', () => {
	test("'1h' reads resource_samples_raw (raw tier)", async () => {
		const {pool, query} = fakePool({rows: []})
		vi.mocked(getPool).mockReturnValue(pool)

		await getResourceHistory('1h')
		expect(query.mock.calls[0][0]).toMatch(/FROM resource_samples_raw/)
		expect(query.mock.calls[0][0]).toMatch(/INTERVAL '1 hour'/)
		expect(query.mock.calls[0][0]).toMatch(/ORDER BY ts ASC/)
	})

	test("'24h' reads resource_samples_raw (raw tier)", async () => {
		const {pool, query} = fakePool({rows: []})
		vi.mocked(getPool).mockReturnValue(pool)

		await getResourceHistory('24h')
		expect(query.mock.calls[0][0]).toMatch(/FROM resource_samples_raw/)
		expect(query.mock.calls[0][0]).toMatch(/INTERVAL '24 hours'/)
	})

	test("'7d' reads resource_rollups_5m (5-minute rollup tier)", async () => {
		const {pool, query} = fakePool({rows: []})
		vi.mocked(getPool).mockReturnValue(pool)

		await getResourceHistory('7d')
		expect(query.mock.calls[0][0]).toMatch(/FROM resource_rollups_5m/)
		expect(query.mock.calls[0][0]).toMatch(/INTERVAL '7 days'/)
		expect(query.mock.calls[0][0]).toMatch(/ORDER BY bucket_start ASC/)
	})

	test("'30d' reads resource_rollups_1h (hourly rollup tier)", async () => {
		const {pool, query} = fakePool({rows: []})
		vi.mocked(getPool).mockReturnValue(pool)

		await getResourceHistory('30d')
		expect(query.mock.calls[0][0]).toMatch(/FROM resource_rollups_1h/)
		expect(query.mock.calls[0][0]).toMatch(/INTERVAL '30 days'/)
	})

	test('maps rows snake_case -> camelCase; BIGINT string -> number; time -> ISO string', async () => {
		const {pool} = fakePool({rows: [RAW_ROW]})
		vi.mocked(getPool).mockReturnValue(pool)

		const points = await getResourceHistory('1h')
		expect(points).toHaveLength(1)
		expect(points[0]).toEqual({
			time: '2026-07-14T00:00:00.000Z',
			cpuPct: 12.5,
			memUsedBytes: 2000000000,
			memTotalBytes: 8000000000,
			diskReadBps: 1000,
			diskWriteBps: 2000,
			netRxBps: 3000,
			netTxBps: 4000,
		})
	})

	test('null pool -> returns [], issues no query (fail-open)', async () => {
		const {query} = fakePool()
		vi.mocked(getPool).mockReturnValue(null)

		await expect(getResourceHistory('7d')).resolves.toEqual([])
		expect(query).not.toHaveBeenCalled()
	})
})

// ─────────────────────────────────────────────────────────────────────────
// aggregateRollups — raw->5m then 5m->1h, idempotent
// ─────────────────────────────────────────────────────────────────────────
describe('aggregateRollups', () => {
	test('issues two idempotent INSERT ... ON CONFLICT statements (raw->5m, 5m->1h)', async () => {
		const {pool, query} = fakePool({rows: []})
		vi.mocked(getPool).mockReturnValue(pool)

		await aggregateRollups()
		expect(query).toHaveBeenCalledTimes(2)

		const sql5m = query.mock.calls[0][0]
		expect(sql5m).toMatch(/INSERT INTO resource_rollups_5m/)
		expect(sql5m).toMatch(/FROM resource_samples_raw/)
		expect(sql5m).toMatch(/ON CONFLICT \(bucket_start\) DO UPDATE/)
		// 5m buckets are floored on the absolute epoch (timezone-agnostic).
		expect(sql5m).toMatch(/floor\(extract\(epoch from ts\) \/ 300\) \* 300/)

		const sql1h = query.mock.calls[1][0]
		expect(sql1h).toMatch(/INSERT INTO resource_rollups_1h/)
		expect(sql1h).toMatch(/FROM resource_rollups_5m/)
		expect(sql1h).toMatch(/ON CONFLICT \(bucket_start\) DO UPDATE/)
	})

	// WR-320-01: the hourly bucket must be floored on the absolute epoch (UTC),
	// NOT date_trunc('hour', ...) which truncates in the session TimeZone and
	// collapses/skips an hour across a DST transition. This locks both rollup
	// tiers to the same timezone-invariant bucketing.
	test('1h rollup buckets by timezone-agnostic epoch-floor, never date_trunc', async () => {
		const {pool, query} = fakePool({rows: []})
		vi.mocked(getPool).mockReturnValue(pool)

		await aggregateRollups()
		const sql1h = query.mock.calls[1][0]
		expect(sql1h).toMatch(/floor\(extract\(epoch from bucket_start\) \/ 3600\) \* 3600/)
		expect(sql1h).not.toMatch(/date_trunc/)
	})

	test('null pool -> resolves without calling query (fail-open)', async () => {
		const {query} = fakePool()
		vi.mocked(getPool).mockReturnValue(null)

		await expect(aggregateRollups()).resolves.toBeUndefined()
		expect(query).not.toHaveBeenCalled()
	})
})

// ─────────────────────────────────────────────────────────────────────────
// pruneOldRows — three fixed-window DELETEs (48h / 30d / 365d)
// ─────────────────────────────────────────────────────────────────────────
describe('pruneOldRows', () => {
	test('issues three DELETE statements bounding each tier (48h / 30d / 365d)', async () => {
		const {pool, query} = fakePool({rows: []})
		vi.mocked(getPool).mockReturnValue(pool)

		await pruneOldRows()
		expect(query).toHaveBeenCalledTimes(3)

		const rawDelete = query.mock.calls[0][0]
		expect(rawDelete).toMatch(/DELETE FROM resource_samples_raw/)
		expect(rawDelete).toMatch(/INTERVAL '48 hours'/)

		const fiveMinDelete = query.mock.calls[1][0]
		expect(fiveMinDelete).toMatch(/DELETE FROM resource_rollups_5m/)
		expect(fiveMinDelete).toMatch(/INTERVAL '30 days'/)

		const hourDelete = query.mock.calls[2][0]
		expect(hourDelete).toMatch(/DELETE FROM resource_rollups_1h/)
		expect(hourDelete).toMatch(/INTERVAL '365 days'/)
	})

	test('null pool -> resolves without calling query (fail-open)', async () => {
		const {query} = fakePool()
		vi.mocked(getPool).mockReturnValue(null)

		await expect(pruneOldRows()).resolves.toBeUndefined()
		expect(query).not.toHaveBeenCalled()
	})
})
