/**
 * Phase 346-01 (MCP-01, D-346-4) — mcp-control/keys-database.ts unit tests.
 *
 * Mirrors api-keys/database.test.ts's pg-mock style, but pins the DISTINCT
 * `liv_mcp_*` contract that makes the MCP control-plane key a bounded, broker-
 * unreachable credential:
 *   - createMcpControlKey: mints `liv_mcp_<base64url-32>` plaintext, persists
 *     ONLY the SHA-256 hash (+ 8-char prefix `liv_mcp_`), never the plaintext.
 *   - findMcpControlKeyByHash: SELECT scoped by `key_hash = $1 AND revoked_at
 *     IS NULL`; unknown + revoked both collapse to null; null when pool absent.
 *   - revokeMcpControlKey: idempotent UPDATE (revoked_at IS NULL guard); second
 *     revoke → rowCount 0.
 *   - listMcpControlKeys: SELECT excludes key_hash, ORDER BY created_at DESC,
 *     INCLUDES revoked rows (admin history).
 *   - MCP_KEY_PLAINTEXT_PREFIX is 'liv_mcp_' — a DISTINCT prefix from the
 *     broker's `liv_sk_`, so a liv_mcp_ value can never collide with a liv_sk_.
 *
 * Strategy: mock getPool() to return a stub Pool recording query calls. No real
 * PostgreSQL — assertions verify SQL string + params shape. The pool can also be
 * toggled absent to prove the fail-open (null → skip PG) contract.
 */

import {createHash} from 'node:crypto'

import {beforeEach, describe, expect, test, vi} from 'vitest'

const {queryMock, poolState} = vi.hoisted(() => ({
	queryMock: vi.fn(),
	poolState: {absent: false},
}))

vi.mock('../database/index.js', () => ({
	getPool: () => (poolState.absent ? null : {query: queryMock}),
}))

// Import AFTER mock setup.
import {
	MCP_KEY_PLAINTEXT_PREFIX,
	hashMcpControlKey,
	createMcpControlKey,
	findMcpControlKeyByHash,
	listMcpControlKeys,
	revokeMcpControlKey,
} from './keys-database.js'

const KEY_REGEX = /^liv_mcp_[A-Za-z0-9_-]{32}$/
const HEX_64_REGEX = /^[a-f0-9]{64}$/

function fakeRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'uuid-1',
		key_prefix: 'liv_mcp_',
		name: 'agent-key',
		created_by: 'admin-A',
		created_at: new Date(),
		last_used_at: null,
		revoked_at: null,
		...overrides,
	}
}

describe('mcp-control keys-database DAO (346-01 MCP-01)', () => {
	beforeEach(() => {
		queryMock.mockReset()
		poolState.absent = false
	})

	// ── DISTINCT prefix — the structural separation from the broker liv_sk_ ────
	test('MCP_KEY_PLAINTEXT_PREFIX is the DISTINCT liv_mcp_ prefix (never liv_sk_)', () => {
		expect(MCP_KEY_PLAINTEXT_PREFIX).toBe('liv_mcp_')
		// A minted plaintext can never be mistaken for a broker liv_sk_ token.
		expect(MCP_KEY_PLAINTEXT_PREFIX.startsWith('liv_sk_')).toBe(false)
	})

	test('hashMcpControlKey is sha256 hex of the FULL plaintext (64 hex chars)', () => {
		const plaintext = MCP_KEY_PLAINTEXT_PREFIX + 'X'.repeat(32)
		const h = hashMcpControlKey(plaintext)
		expect(h).toMatch(HEX_64_REGEX)
		expect(h).toBe(createHash('sha256').update(plaintext, 'utf-8').digest('hex'))
	})

	// ── createMcpControlKey — mints token, persists ONLY the hash + prefix ─────
	test('createMcpControlKey issues single INSERT into mcp_control_keys; plaintext matches liv_mcp_ regex; key_hash is SHA-256(plaintext)', async () => {
		queryMock.mockResolvedValue({rows: [fakeRow()], rowCount: 1})

		const result = await createMcpControlKey({name: 'agent-key', createdBy: 'admin-A'})

		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]]

		// SQL shape — INSERT INTO mcp_control_keys (key_hash, key_prefix, name, created_by)
		expect(sql).toMatch(/INSERT INTO mcp_control_keys/)
		expect(sql).toMatch(/key_hash, key_prefix, name, created_by/)
		expect(sql).toMatch(/VALUES \(\$1, \$2, \$3, \$4\)/)
		expect(sql).toMatch(/RETURNING/)

		// Params position-correct: $1=key_hash, $2=key_prefix, $3=name, $4=created_by
		expect(params).toHaveLength(4)
		expect(params[0]).toMatch(HEX_64_REGEX) // SHA-256 hex digest
		expect(params[1]).toBe('liv_mcp_') // 8-char prefix == the full constant
		expect(params[2]).toBe('agent-key')
		expect(params[3]).toBe('admin-A')

		// Plaintext returned matches the liv_mcp_<32> regex; length = prefix + 32.
		expect(result.plaintext).toMatch(KEY_REGEX)
		expect(result.plaintext.length).toBe(MCP_KEY_PLAINTEXT_PREFIX.length + 32)
		expect(result.plaintext.slice(0, 8)).toBe('liv_mcp_')

		// key_hash IS the SHA-256 of the returned plaintext.
		const expectedHash = createHash('sha256').update(result.plaintext, 'utf-8').digest('hex')
		expect(params[0]).toBe(expectedHash)

		// Row is mapped and NEVER carries key_hash.
		expect(result.row.id).toBe('uuid-1')
		expect((result.row as unknown as Record<string, unknown>).keyHash).toBeUndefined()
	})

	test('createMcpControlKey accepts a null minter (legacy single-user has no admin userId)', async () => {
		queryMock.mockResolvedValue({rows: [fakeRow({created_by: null})], rowCount: 1})
		const result = await createMcpControlKey({name: 'legacy', createdBy: null})
		const [, params] = queryMock.mock.calls[0] as [string, unknown[]]
		expect(params[3]).toBeNull()
		expect(result.row.createdBy).toBeNull()
	})

	// ── plaintext is NEVER a query param (only its SHA-256 digest) ─────────────
	test('plaintext is NEVER stored as a query param (only its SHA-256 digest)', async () => {
		queryMock.mockResolvedValue({rows: [fakeRow()], rowCount: 1})
		const {plaintext} = await createMcpControlKey({name: 'k', createdBy: 'admin-A'})

		for (const call of queryMock.mock.calls) {
			const params = (call[1] ?? []) as unknown[]
			for (const p of params) {
				expect(p).not.toBe(plaintext)
				if (typeof p === 'string') expect(p).not.toContain(plaintext)
			}
		}
		const expectedHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')
		const allParams = queryMock.mock.calls.flatMap((c) => (c[1] ?? []) as unknown[])
		expect(allParams).toContain(expectedHash)
	})

	// ── findMcpControlKeyByHash — active-only; unknown == revoked → null ───────
	test('findMcpControlKeyByHash SELECTs (incl. key_hash) with revoked_at IS NULL filter; carries keyHash INTERNALLY; null on miss', async () => {
		queryMock.mockResolvedValueOnce({rows: [fakeRow({key_hash: 'a'.repeat(64)})]})
		const hit = await findMcpControlKeyByHash('a'.repeat(64))
		// The SELECT is the FIRST query; a fire-and-forget last_used_at UPDATE
		// (INFO-03) may follow, so assert on calls[0] rather than an exact count.
		const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]]
		expect(sql).toMatch(/SELECT/)
		expect(sql).toMatch(/FROM mcp_control_keys/)
		expect(sql).toMatch(/WHERE key_hash = \$1/)
		expect(sql).toMatch(/revoked_at IS NULL/)
		// WARN-01 — the by-hash lookup MUST project key_hash so the gate can run a
		// REAL fail-closed compare.
		expect(sql).toMatch(/key_hash/)
		expect(params).toEqual(['a'.repeat(64)])
		expect(hit).not.toBeNull()
		expect(hit?.id).toBe('uuid-1')
		// The row carries keyHash for the auth gate's constant-time compare.
		expect(hit?.keyHash).toBe('a'.repeat(64))

		queryMock.mockResolvedValueOnce({rows: []})
		const miss = await findMcpControlKeyByHash('b'.repeat(64))
		expect(miss).toBeNull()
	})

	// ── INFO-03 — last_used_at operational visibility ─────────────────────────
	test('INFO-03 — findMcpControlKeyByHash bumps last_used_at (fire-and-forget UPDATE) after a successful lookup', async () => {
		queryMock.mockResolvedValueOnce({rows: [fakeRow({key_hash: 'd'.repeat(64)})]})
		queryMock.mockResolvedValueOnce({rowCount: 1}) // the non-blocking UPDATE
		await findMcpControlKeyByHash('d'.repeat(64))
		const updateCall = queryMock.mock.calls.find(([sql]) =>
			/UPDATE mcp_control_keys/.test(sql as string),
		)
		expect(updateCall).toBeDefined()
		const [updSql, updParams] = updateCall as [string, unknown[]]
		expect(updSql).toMatch(/SET last_used_at = NOW\(\)/)
		expect(updSql).toMatch(/WHERE id = \$1/)
		expect(updParams).toEqual(['uuid-1'])
	})

	test('INFO-03 — a last_used_at write failure NEVER blocks/rejects auth (best-effort, swallowed)', async () => {
		queryMock.mockResolvedValueOnce({rows: [fakeRow({key_hash: 'e'.repeat(64)})]})
		queryMock.mockRejectedValueOnce(new Error('write failed')) // UPDATE rejects
		const hit = await findMcpControlKeyByHash('e'.repeat(64))
		// The lookup still resolves to the row — the rejection is swallowed.
		expect(hit?.id).toBe('uuid-1')
	})

	test('findMcpControlKeyByHash returns null when the pool is absent (fail-open, no PG query)', async () => {
		poolState.absent = true
		const res = await findMcpControlKeyByHash('c'.repeat(64))
		expect(res).toBeNull()
		expect(queryMock).not.toHaveBeenCalled()
	})

	// ── listMcpControlKeys — excludes key_hash, includes revoked, DESC ─────────
	test('listMcpControlKeys SELECT excludes key_hash; ORDER BY created_at DESC; INCLUDES revoked', async () => {
		queryMock.mockResolvedValue({
			rows: [fakeRow(), fakeRow({id: 'uuid-2', revoked_at: new Date()})],
		})
		const rows = await listMcpControlKeys()
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql] = queryMock.mock.calls[0] as [string]
		expect(sql).toMatch(/SELECT/)
		expect(sql).toMatch(/FROM mcp_control_keys/)
		// key_hash MUST NOT appear in the SELECT (never exposed to callers).
		expect(sql).not.toMatch(/key_hash/)
		expect(sql).toMatch(/ORDER BY created_at DESC/)
		// History: the query MUST NOT filter revoked rows out.
		expect(sql).not.toMatch(/revoked_at\s+IS\s+NULL/i)
		expect(rows).toHaveLength(2)
		expect(rows[1].revokedAt).not.toBeNull()
	})

	test('listMcpControlKeys returns [] when the pool is absent (fail-open)', async () => {
		poolState.absent = true
		expect(await listMcpControlKeys()).toEqual([])
		expect(queryMock).not.toHaveBeenCalled()
	})

	// ── revokeMcpControlKey — idempotent soft-revoke ──────────────────────────
	test('revokeMcpControlKey issues idempotent UPDATE (id, revoked_at IS NULL) RETURNING key_hash', async () => {
		queryMock.mockResolvedValue({rows: [{key_hash: 'h'.repeat(64)}], rowCount: 1})
		const res = await revokeMcpControlKey({id: 'uuid-1'})
		expect(queryMock).toHaveBeenCalledTimes(1)
		const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]]
		expect(sql).toMatch(/UPDATE mcp_control_keys/)
		expect(sql).toMatch(/SET revoked_at = NOW\(\)/)
		expect(sql).toMatch(/WHERE id = \$1/)
		expect(sql).toMatch(/AND revoked_at IS NULL/)
		expect(sql).toMatch(/RETURNING key_hash/)
		expect(params).toEqual(['uuid-1'])
		expect(res.rowCount).toBe(1)
		expect(res.keyHash).toBe('h'.repeat(64))
	})

	test('revokeMcpControlKey is idempotent: second call → rowCount 0, no keyHash', async () => {
		queryMock.mockResolvedValue({rows: [], rowCount: 0})
		const res = await revokeMcpControlKey({id: 'uuid-1'})
		expect(res.rowCount).toBe(0)
		expect(res.keyHash).toBeUndefined()
	})

	test('revokeMcpControlKey returns {rowCount:0} when the pool is absent (fail-open)', async () => {
		poolState.absent = true
		const res = await revokeMcpControlKey({id: 'uuid-1'})
		expect(res.rowCount).toBe(0)
		expect(queryMock).not.toHaveBeenCalled()
	})
})
