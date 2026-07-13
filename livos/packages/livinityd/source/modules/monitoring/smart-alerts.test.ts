// Phase 313 Plan 02 Task 1 — smart-alerts.ts CRUD/dedupe unit tests.
//
// Strategy: mock getPool() (from ../database/index.js). Per case, point the
// mock at either `null` (null-pool safety) or a fake pool whose .query is a
// vi.fn() returning {rows, rowCount}. No real PostgreSQL needed — assertions
// verify the SQL target table, the WHERE/limit shape, the bound params, and
// the snake_case -> camelCase row mapping.

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {getPool} from '../database/index.js'

vi.mock('../database/index.js', () => ({getPool: vi.fn()}))

// Import AFTER the mock declaration (vi.mock is hoisted).
import {
	dismissSmartAlert,
	findRecentSmartAlert,
	insertSmartAlert,
	listSmartAlerts,
} from './smart-alerts.js'

// A fake Pool whose query is a vi.fn we can point per-case.
function fakePool(result: {rows: unknown[]; rowCount?: number}) {
	const query = vi.fn().mockResolvedValue(result)
	return {pool: {query} as unknown as ReturnType<typeof getPool>, query}
}

beforeEach(() => {
	vi.mocked(getPool).mockReset()
})

// A representative DB row (snake_case, Date objects as pg returns them).
const ROW = {
	id: 'alert-1',
	device_id: 'sda',
	severity: 'critical',
	kind: 'sata-attribute',
	message: 'Reallocated_Sector_Ct raw > 0',
	payload_json: {reasons: ['Reallocated_Sector_Ct raw 3']},
	created_at: new Date('2026-07-13T00:00:00Z'),
	dismissed_at: null,
}

// ─────────────────────────────────────────────────────────────────────────
// insertSmartAlert
// ─────────────────────────────────────────────────────────────────────────
describe('insertSmartAlert', () => {
	test('inserts into smart_alerts and maps the returned row (snake -> camel)', async () => {
		const {pool, query} = fakePool({rows: [ROW], rowCount: 1})
		vi.mocked(getPool).mockReturnValue(pool)

		const alert = await insertSmartAlert({
			deviceId: 'sda',
			severity: 'critical',
			kind: 'sata-attribute',
			message: 'Reallocated_Sector_Ct raw > 0',
			payload: {reasons: ['Reallocated_Sector_Ct raw 3']},
		})

		expect(query).toHaveBeenCalledTimes(1)
		const [sql, params] = query.mock.calls[0]
		expect(sql).toMatch(/INSERT INTO smart_alerts/)
		expect(sql).toMatch(/device_id, severity, kind, message, payload_json/)
		// device_id -> $1, severity -> $2, kind -> $3, message -> $4, payload -> $5
		expect(params[0]).toBe('sda')
		expect(params[1]).toBe('critical')
		expect(params[2]).toBe('sata-attribute')
		expect(params[3]).toBe('Reallocated_Sector_Ct raw > 0')
		expect(params[4]).toBe(JSON.stringify({reasons: ['Reallocated_Sector_Ct raw 3']}))
		// mapped result: device_id -> deviceId, created_at -> ISO string
		expect(alert).not.toBeNull()
		expect(alert!.deviceId).toBe('sda')
		expect(alert!.createdAt).toBe('2026-07-13T00:00:00.000Z')
		expect(alert!.dismissedAt).toBeNull()
	})

	test('null pool -> returns null, never throws (fire-and-forget safe)', async () => {
		vi.mocked(getPool).mockReturnValue(null as unknown as ReturnType<typeof getPool>)
		await expect(insertSmartAlert({deviceId: 'sda', severity: 'warning', kind: 'other', message: 'x'})).resolves.toBeNull()
	})
})

// ─────────────────────────────────────────────────────────────────────────
// findRecentSmartAlert — THE DEDUPE (load-bearing for no-alert-fatigue)
// ─────────────────────────────────────────────────────────────────────────
describe('findRecentSmartAlert', () => {
	test('no recent row -> returns null (a first insert is allowed)', async () => {
		const {pool, query} = fakePool({rows: []})
		vi.mocked(getPool).mockReturnValue(pool)

		const hit = await findRecentSmartAlert('sda', 'sata-attribute', 360)
		expect(hit).toBeNull()

		const [sql, params] = query.mock.calls[0]
		expect(sql).toMatch(/FROM smart_alerts/)
		expect(sql).toMatch(/device_id = \$1/)
		expect(sql).toMatch(/kind = \$2/)
		expect(sql).toMatch(/dismissed_at IS NULL/)
		expect(sql).toMatch(/created_at >= NOW\(\) - \(\$3::int \* INTERVAL '1 minute'\)/)
		expect(params).toEqual(['sda', 'sata-attribute', 360])
	})

	test('a recent row exists -> returns the mapped alert so the handler suppresses the re-insert', async () => {
		const {pool} = fakePool({rows: [ROW]})
		vi.mocked(getPool).mockReturnValue(pool)

		const hit = await findRecentSmartAlert('sda', 'sata-attribute', 360)
		expect(hit).not.toBeNull()
		expect(hit!.deviceId).toBe('sda')
		expect(hit!.kind).toBe('sata-attribute')
	})

	test('null pool -> returns null (never throws)', async () => {
		vi.mocked(getPool).mockReturnValue(null as unknown as ReturnType<typeof getPool>)
		await expect(findRecentSmartAlert('sda', 'unavailable', 360)).resolves.toBeNull()
	})
})

// ─────────────────────────────────────────────────────────────────────────
// listSmartAlerts
// ─────────────────────────────────────────────────────────────────────────
describe('listSmartAlerts', () => {
	test('null pool -> returns [] (never throws)', async () => {
		vi.mocked(getPool).mockReturnValue(null as unknown as ReturnType<typeof getPool>)
		await expect(listSmartAlerts()).resolves.toEqual([])
	})

	test('maps rows, defaults to un-dismissed-only + default limit 50', async () => {
		const {pool, query} = fakePool({rows: [ROW]})
		vi.mocked(getPool).mockReturnValue(pool)

		const list = await listSmartAlerts()
		expect(list).toHaveLength(1)
		expect(list[0].deviceId).toBe('sda')

		const [sql, params] = query.mock.calls[0]
		expect(sql).toMatch(/WHERE dismissed_at IS NULL/)
		expect(params).toEqual([50])
	})

	test('includeDismissed drops the WHERE clause; limit clamps to 1..200', async () => {
		const {pool, query} = fakePool({rows: []})
		vi.mocked(getPool).mockReturnValue(pool)

		await listSmartAlerts({includeDismissed: true, limit: 9999})
		const [sql, params] = query.mock.calls[0]
		expect(sql).not.toMatch(/WHERE dismissed_at IS NULL/)
		expect(params).toEqual([200]) // clamped
	})
})

// ─────────────────────────────────────────────────────────────────────────
// dismissSmartAlert
// ─────────────────────────────────────────────────────────────────────────
describe('dismissSmartAlert', () => {
	test('rowCount 1 -> true', async () => {
		const {pool, query} = fakePool({rows: [], rowCount: 1})
		vi.mocked(getPool).mockReturnValue(pool)

		await expect(dismissSmartAlert('alert-1')).resolves.toBe(true)
		const [sql, params] = query.mock.calls[0]
		expect(sql).toMatch(/UPDATE smart_alerts SET dismissed_at = NOW\(\)/)
		expect(params).toEqual(['alert-1'])
	})

	test('rowCount 0 -> false', async () => {
		const {pool} = fakePool({rows: [], rowCount: 0})
		vi.mocked(getPool).mockReturnValue(pool)
		await expect(dismissSmartAlert('missing')).resolves.toBe(false)
	})

	test('null pool -> false (never throws)', async () => {
		vi.mocked(getPool).mockReturnValue(null as unknown as ReturnType<typeof getPool>)
		await expect(dismissSmartAlert('x')).resolves.toBe(false)
	})
})
