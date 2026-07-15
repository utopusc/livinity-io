/**
 * Phase 324-06 FILES-01 (D-01/D-04/D-05) — owner-side share management tRPC.
 *
 * Pins the security contract of the shareCreate / shareList / shareRevoke
 * procedures that wrap the 324-01 share-tokens.ts DAO:
 *
 *   - Owner-scoped: create/list/revoke ALWAYS pass the CALLER's own user id to
 *     the DAO (ctx.currentUser.id) — never a client-supplied owner. A caller can
 *     neither list nor revoke another user's shares (D-04/D-05).
 *   - shareCreate resolves the path INSIDE the caller's own tree first; an
 *     out-of-tree path throws before any row is minted (T-324-19).
 *   - shareCreate returns the raw `liv_share_` token EXACTLY ONCE (mint-time) and
 *     the metadata view NEVER carries the token hash or the bcrypt password hash.
 *   - An optional password is bcrypt-hashed before it reaches the DAO — the
 *     plaintext is never stored.
 *   - shareList returns ALL the caller's shares INCL. revoked (CVE-2026-45285
 *     always-available "my shares" audit — no share is invisible to its owner).
 *
 * The DAO + the files path resolver are mocked (Windows host, no live PG): this
 * file pins the OWNER-SCOPING + mint-once + no-leak wiring, not the DAO SQL
 * (covered by files/share-tokens.test.ts).
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import os from 'node:os'
import {describe, beforeEach, afterEach, expect, test, vi} from 'vitest'

const createShareMock = vi.fn()
const listSharesForUserMock = vi.fn()
const revokeShareMock = vi.fn()

vi.mock('../files/share-tokens.js', () => ({
	createShare: (...args: unknown[]) => createShareMock(...args),
	listSharesForUser: (...args: unknown[]) => listSharesForUserMock(...args),
	revokeShare: (...args: unknown[]) => revokeShareMock(...args),
}))

// Import AFTER the mock is registered.
import system from './routes.js'

function fakeRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'share-1',
		ownerUserId: 'owner-1',
		virtualPath: '/Home/report.pdf',
		tokenPrefix: 'liv_share_ABCDEFGH',
		passwordHash: null,
		expiresAt: null,
		maxDownloads: null,
		downloadCount: 0,
		lastAccessedAt: null,
		revokedAt: null,
		createdAt: new Date('2026-07-15T00:00:00Z'),
		...overrides,
	}
}

// A ctx whose files.virtualToSystemPath resolves to a REAL existing path
// (os.tmpdir) so the create happy-path's existence check passes; pass a thrower
// to simulate an out-of-tree path.
function makeCtx(virtualToSystemPath?: (p: string) => Promise<string>, currentUser?: unknown) {
	return {
		currentUser: currentUser === undefined ? {id: 'owner-1', username: 'alice', role: 'member'} : currentUser,
		dangerouslyBypassAuthentication: true,
		logger: {error() {}},
		livinityd: {
			files: {
				virtualToSystemPath: virtualToSystemPath ?? (async () => os.tmpdir()),
			},
		},
	}
}

describe('324-06 owner-side share management tRPC (FILES-01 D-01/D-04/D-05)', () => {
	beforeEach(() => {
		createShareMock.mockReset()
		listSharesForUserMock.mockReset()
		revokeShareMock.mockReset()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	// ── shareCreate ──────────────────────────────────────────────────────────
	test('shareCreate is owner-scoped (ownerUserId = caller) and returns the raw token exactly once', async () => {
		const plaintext = 'liv_share_' + 'X'.repeat(32)
		createShareMock.mockResolvedValue({row: fakeRow(), plaintext})
		const caller = system.createCaller(makeCtx())

		const res = await caller.shareCreate({virtualPath: '/Home/report.pdf'})

		// The owner is the CALLER (ctx.currentUser.id), never a client-supplied value.
		expect(createShareMock).toHaveBeenCalledWith(
			expect.objectContaining({ownerUserId: 'owner-1', virtualPath: '/Home/report.pdf'}),
		)
		// Raw token surfaced ONCE at mint time.
		expect(res.token).toBe(plaintext)
		// The metadata view carries the display prefix but NEVER a hash/password.
		expect(res.share.tokenPrefix).toBe('liv_share_ABCDEFGH')
		expect(JSON.stringify(res.share)).not.toMatch(/passwordHash|tokenHash|token_hash/)
	})

	test('shareCreate bcrypt-hashes the optional password before it reaches the DAO', async () => {
		createShareMock.mockResolvedValue({row: fakeRow({passwordHash: 'stored'}), plaintext: 'liv_share_tok'})
		const caller = system.createCaller(makeCtx())

		await caller.shareCreate({virtualPath: '/Home/report.pdf', password: 'hunter2'})

		const arg = createShareMock.mock.calls[0][0] as {passwordHash?: string}
		expect(arg.passwordHash).toBeTruthy()
		expect(arg.passwordHash).not.toBe('hunter2') // never store plaintext
		expect(arg.passwordHash!.startsWith('$2')).toBe(true) // a bcrypt hash
	})

	test('shareCreate rejects a path outside the caller tree — never mints', async () => {
		const caller = system.createCaller(
			makeCtx(async () => {
				throw new Error("[escapes-base] '/Home/../other' escapes '/home/alice'")
			}),
		)

		await expect(caller.shareCreate({virtualPath: '/Home/../other'})).rejects.toThrow()
		expect(createShareMock).not.toHaveBeenCalled()
	})

	// ── shareList ────────────────────────────────────────────────────────────
	test('shareList returns ALL the caller shares incl. revoked, scoped to the caller, hash/password stripped', async () => {
		listSharesForUserMock.mockResolvedValue([
			fakeRow(),
			fakeRow({id: 'share-2', revokedAt: new Date(), passwordHash: 'secret-bcrypt-hash'}),
		])
		const caller = system.createCaller(makeCtx())

		const res = await caller.shareList()

		expect(listSharesForUserMock).toHaveBeenCalledWith('owner-1') // owner-scoped
		expect(res).toHaveLength(2) // includes the revoked row (audit)
		expect(res.some((s: {revokedAt: unknown}) => s.revokedAt)).toBe(true)
		// Never leak the bcrypt password hash or the token hash to the client.
		expect(JSON.stringify(res)).not.toContain('secret-bcrypt-hash')
		expect(JSON.stringify(res)).not.toMatch(/passwordHash|tokenHash|token_hash/)
	})

	// ── shareRevoke ──────────────────────────────────────────────────────────
	test('shareRevoke is owner-scoped (passes the caller id, not a client value)', async () => {
		revokeShareMock.mockResolvedValue({rowCount: 1, tokenHash: 'h'})
		const caller = system.createCaller(makeCtx())

		const res = await caller.shareRevoke({id: 'share-1'})

		expect(revokeShareMock).toHaveBeenCalledWith({id: 'share-1', ownerUserId: 'owner-1'})
		expect(res.revoked).toBe(true)
	})

	test("shareRevoke on another user's share is a no-op (rowCount 0 → revoked:false)", async () => {
		revokeShareMock.mockResolvedValue({rowCount: 0})
		const caller = system.createCaller(makeCtx())

		const res = await caller.shareRevoke({id: 'not-mine'})

		expect(res.revoked).toBe(false)
	})

	// ── auth gate ────────────────────────────────────────────────────────────
	test('share procedures require a resolved caller (no currentUser.id → throws)', async () => {
		const caller = system.createCaller(makeCtx(undefined, null))
		await expect(caller.shareList()).rejects.toThrow()
	})
})
