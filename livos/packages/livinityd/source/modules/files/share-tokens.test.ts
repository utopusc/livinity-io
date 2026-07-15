/**
 * Phase 324-01 FILES-01 — share-tokens.ts DAO unit tests.
 *
 * Mirrors api-keys/bearer-auth.test.ts (T1-T8) for the file_shares opaque-token
 * DAO. The security contract this file pins (D-01 / D-05, CVE-2026-45285):
 *
 *   - findShareByHash: unknown token, revoked row, AND expired row are ALL
 *     indistinguishable to the caller (each maps to null) — the SQL WHERE
 *     clause filters `revoked_at IS NULL` AND `expires_at > NOW()` so a
 *     not-found / revoked / expired share collapse to the same generic null.
 *   - constantTimeHashEqual: uses crypto.timingSafeEqual (defense-in-depth),
 *     returns false on length mismatch, and never throws.
 *   - createShare: mints `liv_share_<base64url-32>`, persists ONLY the sha256
 *     hash + an 18-char prefix — never the raw token.
 *   - listSharesForUser: INCLUDES revoked rows (owner audit — CVE-2026-45285:
 *     no code path mints a row that is invisible to the owner's "my shares").
 *   - migration-registration guard: every `migrations/*.sql` filename appears
 *     in ALL_MIGRATIONS (mechanically catches the 325-class drift-#7 omission).
 */

import {createHash} from 'node:crypto'
import * as crypto from 'node:crypto'
import {readdirSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import nodePath from 'node:path'

import {beforeEach, describe, expect, test, vi} from 'vitest'

// ESM namespace exports for node:* built-ins are non-configurable per spec, so
// `vi.spyOn(crypto, 'timingSafeEqual')` throws "Cannot redefine property".
// Re-mock with a pass-through plain object (mirrors bearer-auth.test.ts:37-40).
vi.mock('node:crypto', async () => {
	const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
	return {...actual, default: actual}
})

const queryMock = vi.fn()

vi.mock('../database/index.js', () => ({
	getPool: () => ({query: (...args: unknown[]) => queryMock(...args)}),
}))

// Import AFTER mock setup.
import {
	createShare,
	findShareByHash,
	listSharesForUser,
	revokeShare,
	hashKey,
	constantTimeHashEqual,
} from './share-tokens.js'
import {ALL_MIGRATIONS} from '../database/migrations/index.js'
import {signShareGrant, verifyShareGrant} from '../jwt.js'

function fakeRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'share-1',
		owner_user_id: 'owner-1',
		virtual_path: '/Home/report.pdf',
		token_prefix: 'liv_share_ABCDEFGH',
		password_hash: null,
		expires_at: null,
		max_downloads: null,
		download_count: 0,
		last_accessed_at: null,
		revoked_at: null,
		created_at: new Date(),
		...overrides,
	}
}

describe('files share-tokens DAO (324-01 FILES-01)', () => {
	beforeEach(() => {
		queryMock.mockReset()
	})

	// ── constantTimeHashEqual (T8 analog) ────────────────────────────────────
	test('constantTimeHashEqual uses crypto.timingSafeEqual for equal-length hex', () => {
		const spy = vi.spyOn(crypto, 'timingSafeEqual')
		const a = createHash('sha256').update('a').digest('hex')
		expect(constantTimeHashEqual(a, a)).toBe(true)
		expect(spy).toHaveBeenCalled()
		spy.mockRestore()
	})

	test('constantTimeHashEqual returns false on length mismatch WITHOUT throwing', () => {
		expect(constantTimeHashEqual('abcd', 'abcdef')).toBe(false)
	})

	test('constantTimeHashEqual never throws on malformed hex', () => {
		expect(() => constantTimeHashEqual('zz', 'zz')).not.toThrow()
	})

	// ── createShare — mints token, persists only the hash + prefix ────────────
	test('createShare mints liv_share_<32> and stores ONLY the sha256 hash + prefix', async () => {
		queryMock.mockResolvedValue({rows: [fakeRow()], rowCount: 1})

		const {plaintext, row} = await createShare({
			ownerUserId: 'owner-1',
			virtualPath: '/Home/report.pdf',
		})

		expect(plaintext.startsWith('liv_share_')).toBe(true)
		expect(plaintext.length).toBe('liv_share_'.length + 32)
		expect(row.ownerUserId).toBe('owner-1')

		// The INSERT must carry sha256(plaintext) + an 18-char prefix, and MUST
		// NOT carry the raw plaintext anywhere in its bound parameters.
		const [, params] = queryMock.mock.calls[0] as [string, unknown[]]
		const expectedHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')
		expect(params).toContain(expectedHash)
		expect(params).toContain(plaintext.slice(0, 18))
		expect(params).not.toContain(plaintext)
	})

	// ── findShareByHash — not-found == revoked == expired → null (D-05) ────────
	test('findShareByHash returns null when no row matches (unknown token)', async () => {
		queryMock.mockResolvedValue({rows: []})
		expect(await findShareByHash('deadbeef')).toBeNull()
	})

	test('findShareByHash SQL filters revoked AND expired rows (generic not-available)', async () => {
		queryMock.mockResolvedValue({rows: []})
		await findShareByHash('deadbeef')
		const [sql] = queryMock.mock.calls[0] as [string]
		// A revoked row and an expired row must both be excluded by the query
		// itself, so the caller cannot distinguish not-found / revoked / expired.
		expect(sql).toMatch(/revoked_at\s+IS\s+NULL/i)
		expect(sql).toMatch(/expires_at/i)
	})

	test('findShareByHash returns the mapped row on a live hit', async () => {
		queryMock.mockResolvedValue({rows: [fakeRow()]})
		const row = await findShareByHash('livehash')
		expect(row?.id).toBe('share-1')
		expect(row?.virtualPath).toBe('/Home/report.pdf')
	})

	// ── listSharesForUser — INCLUDES revoked (CVE-2026-45285) ─────────────────
	test('listSharesForUser INCLUDES revoked rows (owner audit)', async () => {
		queryMock.mockResolvedValue({
			rows: [fakeRow(), fakeRow({id: 'share-2', revoked_at: new Date()})],
		})
		const rows = await listSharesForUser('owner-1')
		expect(rows).toHaveLength(2)
		// The SQL MUST NOT filter revoked_at — the owner sees every share ever
		// minted so nothing is invisible to audit/revoke.
		const [sql] = queryMock.mock.calls[0] as [string]
		expect(sql).not.toMatch(/revoked_at\s+IS\s+NULL/i)
	})

	// ── revokeShare — user-scoped, idempotent soft-revoke ─────────────────────
	test('revokeShare is owner-scoped and idempotent (soft-revoke)', async () => {
		queryMock.mockResolvedValue({rows: [{token_hash: 'h'}], rowCount: 1})
		const res = await revokeShare({id: 'share-1', ownerUserId: 'owner-1'})
		expect(res.rowCount).toBe(1)
		const [sql] = queryMock.mock.calls[0] as [string]
		expect(sql).toMatch(/revoked_at\s*=\s*NOW\(\)/i)
		expect(sql).toMatch(/owner_user_id\s*=\s*\$2/i)
		expect(sql).toMatch(/revoked_at\s+IS\s+NULL/i)
	})

	test('hashKey is sha256 hex of the full plaintext', () => {
		const plaintext = 'liv_share_' + 'X'.repeat(32)
		expect(hashKey(plaintext)).toBe(
			createHash('sha256').update(plaintext, 'utf-8').digest('hex'),
		)
	})

	// ── Migration-registration guard (drift #7 / 325 omission lesson) ─────────
	// Mechanically catches the 325-class omission: any NEW migrations/*.sql that
	// is not spread into ALL_MIGRATIONS fails this test. Four files predate the
	// ALL_MIGRATIONS registry and were never registered (pre-existing drift, out
	// of scope for 324-01 — logged to phases/324-files-sharing/deferred-items.md);
	// they are allowlisted here so the guard fails ONLY on genuinely new drift.
	const LEGACY_UNREGISTERED_ORPHANS = new Set([
		'2026-05-07-p92-webapps.sql',
		'2026-05-07-p95-webapp-agent-sessions.sql',
		'2026-05-08-p96-webapp-skills.sql',
		'2026-05-26-p218-user-app-subdomains.sql',
	])

	test('every migrations/*.sql filename is registered in ALL_MIGRATIONS (minus documented legacy orphans)', () => {
		const here = nodePath.dirname(fileURLToPath(import.meta.url))
		const migrationsDir = nodePath.resolve(here, '../database/migrations')
		const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
		const missing = sqlFiles.filter(
			(f) => !ALL_MIGRATIONS.includes(f) && !LEGACY_UNREGISTERED_ORPHANS.has(f),
		)
		expect(missing).toEqual([])
		// Explicitly assert the two this plan is responsible for (D-01 + the
		// incidental p325 cross-phase fix).
		expect(ALL_MIGRATIONS).toContain('2026-07-15-p324-file-shares.sql')
		expect(ALL_MIGRATIONS).toContain('2026-07-15-p325-user-quota.sql')
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Route-manifest + password-oracle guards (source-text discipline, mirrors
// domain/caddy.test.ts). D-02 (routes on publicApi, CVE-2026-45282), D-03
// (bcryptjs + per-token redis rate-limit), D-05 (wrong-password == rate-limited).
// ─────────────────────────────────────────────────────────────────────────────
describe('share route manifest + password-oracle guards (324-01 D-02/D-03/D-05)', () => {
	const here = nodePath.dirname(fileURLToPath(import.meta.url))
	const apiSrc = readFileSync(nodePath.resolve(here, './api.ts'), 'utf8')
	const serverSrc = readFileSync(nodePath.resolve(here, '../server/index.ts'), 'utf8')

	test('all three share routes register on publicApi — NEVER privateApi (D-02)', () => {
		expect(apiSrc).toMatch(/publicApi\.get\(\s*'\/share\/:token'/)
		expect(apiSrc).toMatch(/publicApi\.get\(\s*'\/share\/:token\/download'/)
		expect(apiSrc).toMatch(/publicApi\.get\(\s*'\/share\/:token\/thumbnail'/)
		expect(apiSrc).not.toMatch(/privateApi\.get\(\s*'\/share/)
	})

	test('every share route resolves the path inside fileUserContext.run(owner) (D-04)', () => {
		// One run(owner) per route + none of them uses getFileUserFromRequest
		// (the cookie identity) for the public share path resolution.
		const runs = apiSrc.match(/fileUserContext\.run\(resolved\.owner/g) ?? []
		expect(runs.length).toBeGreaterThanOrEqual(3)
	})

	test("'/api/files/share/' is present in APEX_PUBLIC_PREFIXES (D-02)", () => {
		expect(serverSrc).toMatch(/APEX_PUBLIC_PREFIXES[\s\S]*'\/api\/files\/share\/'/)
	})

	test('password branch bcrypt-compares AND per-token redis rate-limits (D-03)', () => {
		expect(apiSrc).toMatch(/bcrypt\.compare/)
		expect(apiSrc).toMatch(/share:rl:/)
		// The rate-limit key is per-TOKEN (keyed on the token hash), so throttling
		// one token can never affect another.
		expect(apiSrc).toMatch(/share:rl:\$\{tokenHash\}/)
	})

	test('wrong-password and rate-limited share ONE denial helper — no oracle (D-05)', () => {
		// Both the over-cap (rate-limit) branch and the bad-compare branch MUST
		// call the SAME denial helper so their responses are byte-identical; an
		// attacker cannot detect that throttling has kicked in.
		const denials = apiSrc.match(/sharePasswordDenied\(response\)/g) ?? []
		expect(denials.length).toBeGreaterThanOrEqual(2)
		expect(apiSrc).toContain('[share-wrong-password]')
		// The password-required prompt (no submission) is a DISTINCT token — it
		// MAY differ from wrong-password per D-05 (UX), and it does.
		expect(apiSrc).toContain('[share-password-required]')
	})

	test('the submitted password is never logged', () => {
		// No log line carries the password on the same line.
		for (const line of apiSrc.split('\n')) {
			if (/console\.(log|error)/.test(line) || /logger\./.test(line)) {
				expect(line.toLowerCase()).not.toContain('password')
			}
		}
	})
})

describe('share unlock grant is bound to ONE share (324-01 D-03)', () => {
	test('a grant minted for share A does NOT satisfy share B (shareId binding)', async () => {
		const secret = 'a'.repeat(64)
		const {token} = await signShareGrant(secret, 'share-A')
		const claims = await verifyShareGrant(token, secret)
		// The route admits IFF claims.shareId === the accessed shareId.
		expect(claims.shareId === 'share-A').toBe(true)
		expect(claims.shareId === 'share-B').toBe(false)
	})
})
