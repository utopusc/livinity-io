/**
 * Phase 335 (ROLE-01/02) — admin-grants DAO tests (OFFLINE, injected runner).
 *
 * Proves: parameterized SQL (no interpolation), idempotent grants (ON
 * CONFLICT), closed scope enum rejected BEFORE SQL, and the FAIL-CLOSED no-DB
 * contract (predicates false, lists empty, writes no-op).
 */
import {describe, expect, test, vi} from 'vitest'

// Force the no-runner fallback to a NULL pool so the fail-closed branch is
// deterministic offline (never a real PG connection attempt).
vi.mock('./index.js', () => ({getPool: () => null}))

import {
	ADMIN_SCOPES,
	isAdminScope,
	grantAdminScope,
	revokeAdminScope,
	hasAdminScope,
	listAdminScopesForUser,
	listAllAdminScopes,
	grantAppOperator,
	revokeAppOperator,
	isAppOperator,
	listAppOperators,
	listOperatedAppsForUser,
} from './admin-grants.js'

function makeRunner(result: {rows?: unknown[]; rowCount?: number} = {}) {
	const query = vi.fn(async () => ({rows: result.rows ?? [], rowCount: result.rowCount ?? 0}))
	return {query} as never as {query: ReturnType<typeof vi.fn>}
}

describe('admin-grants — scope enum', () => {
	test('the closed v1 enum is exactly read-only-admin + share-admin', () => {
		expect([...ADMIN_SCOPES]).toEqual(['read-only-admin', 'share-admin'])
		expect(isAdminScope('read-only-admin')).toBe(true)
		expect(isAdminScope('share-admin')).toBe(true)
		expect(isAdminScope('admin')).toBe(false)
		expect(isAdminScope('')).toBe(false)
	})

	test('grantAdminScope rejects an unknown scope BEFORE any SQL', async () => {
		const runner = makeRunner()
		await expect(grantAdminScope({userId: 'u1', scope: 'root' as never}, runner as never)).rejects.toThrow(
			/Unknown admin scope/,
		)
		expect(runner.query).not.toHaveBeenCalled()
	})
})

describe('admin-grants — parameterized SQL + idempotence', () => {
	test('grantAdminScope uses placeholders + ON CONFLICT DO NOTHING', async () => {
		const runner = makeRunner()
		await grantAdminScope({userId: 'u1', scope: 'share-admin', grantedBy: 'a1'}, runner as never)
		const [sql, values] = runner.query.mock.calls[0] as [string, unknown[]]
		expect(sql).toMatch(/ON CONFLICT \(user_id, scope\) DO NOTHING/)
		expect(sql).toMatch(/\$1.*\$2.*\$3/s)
		expect(values).toEqual(['u1', 'share-admin', 'a1'])
	})

	test('hasAdminScope queries by (user, scope) with placeholders', async () => {
		const runner = makeRunner({rows: [{'?column?': 1}]})
		await expect(hasAdminScope('u1', 'read-only-admin', runner as never)).resolves.toBe(true)
		const [sql, values] = runner.query.mock.calls[0] as [string, unknown[]]
		expect(sql).toMatch(/\$1 AND scope = \$2/)
		expect(values).toEqual(['u1', 'read-only-admin'])
	})

	test('revokeAdminScope true on rowCount>0, false on miss', async () => {
		await expect(revokeAdminScope('u1', 'share-admin', makeRunner({rowCount: 1}) as never)).resolves.toBe(true)
		await expect(revokeAdminScope('u1', 'share-admin', makeRunner({rowCount: 0}) as never)).resolves.toBe(false)
	})

	test('listAdminScopesForUser filters unknown scope strings out', async () => {
		const runner = makeRunner({rows: [{scope: 'share-admin'}, {scope: 'stale-legacy-scope'}]})
		await expect(listAdminScopesForUser('u1', runner as never)).resolves.toEqual(['share-admin'])
	})

	test('grantAppOperator/isAppOperator are (app,user)-keyed', async () => {
		const runner = makeRunner()
		await grantAppOperator({appId: 'n8n', userId: 'u1'}, runner as never)
		expect((runner.query.mock.calls[0] as [string, unknown[]])[1]).toEqual(['n8n', 'u1', null])
		const probe = makeRunner({rows: []})
		await expect(isAppOperator('other-app', 'u1', probe as never)).resolves.toBe(false)
	})
})

describe('admin-grants — FAIL-CLOSED no-DB contract', () => {
	test('predicates false, lists empty, writes no-op (getPool → null)', async () => {
		await expect(hasAdminScope('u1', 'share-admin')).resolves.toBe(false)
		await expect(isAppOperator('n8n', 'u1')).resolves.toBe(false)
		await expect(listAdminScopesForUser('u1')).resolves.toEqual([])
		await expect(listAllAdminScopes()).resolves.toEqual([])
		await expect(listAppOperators('n8n')).resolves.toEqual([])
		await expect(listOperatedAppsForUser('u1')).resolves.toEqual([])
		await expect(grantAdminScope({userId: 'u1', scope: 'share-admin'})).resolves.toBeUndefined()
		await expect(grantAppOperator({appId: 'n8n', userId: 'u1'})).resolves.toBeUndefined()
		await expect(revokeAdminScope('u1', 'share-admin')).resolves.toBe(false)
		await expect(revokeAppOperator('n8n', 'u1')).resolves.toBe(false)
	})
})
