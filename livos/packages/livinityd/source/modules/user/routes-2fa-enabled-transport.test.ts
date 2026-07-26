/**
 * Phase 368.8-11 — user.is2faEnabled must answer for the CALLER, not the box.
 *
 * Field-measured on the operator's box 2026-07-26: Settings -> 2FA showed
 * "Disabled" while Postgres held totp_enabled=t / totp_secret_enc NOT NULL for
 * that user. Clicking Enable then failed with "2FA is already enabled", thrown
 * by the enable2fa alreadyEnabled guard BEFORE any code was verified. The code
 * was never wrong; the UI was asking a question the server could not answer.
 *
 * `is2faEnabled` branches on ctx.currentUser, but ctx.currentUser is populated
 * ONLY by the isAuthenticated middleware, which runs for privateProcedure and
 * never for a publicProcedure. createContextExpress leaves it undefined
 * (context.ts:95). So over HTTP the procedure ALWAYS fell through to the legacy
 * single-owner YAML branch — and `user.is2faEnabled` is in httpOnlyPaths
 * (server/trpc/common.ts:92), which forces every UI call onto HTTP.
 *
 * Test 1 reproduces that exact shape and is the RED one.
 * Test 2 pins the legacy no-DB YAML branch so the fix cannot silently drop it.
 */
import {describe, expect, test, vi, beforeEach} from 'vitest'

vi.mock('../security-audit/events.js', () => ({
	recordAuthLoginEvent: vi.fn(),
	recordStepUpEvent: vi.fn(),
}))

// Same seam as routes-2fa-enrol.test.ts: stub only the DAOs. is-authenticated.ts
// imports findUserById/getAdminUser/getPool from this SAME module id, so the
// middleware resolves the caller through these stubs exactly as in production.
vi.mock('../database/index.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../database/index.js')>()
	return {
		...actual,
		isUserTotpEnabled: vi.fn(),
		findUserById: vi.fn(),
		getAdminUser: vi.fn(),
		getPool: vi.fn(),
	}
})

import {isUserTotpEnabled, findUserById, getAdminUser, getPool} from '../database/index.js'
import {t} from '../server/trpc/trpc.js'
import userRouter from './routes.js'

const createCaller = t.createCallerFactory(userRouter)

const USER_ID = 'user-A'
const SESSION_TOKEN = 'header-less.session.jwt'

/**
 * A context shaped like createContextExpress: NO bypass, transport 'express',
 * currentUser UNSET, and the session riding the LIVINITY_SESSION cookie with
 * localStorage not yet hydrated (no Authorization header) — the state the
 * split-link comment at ui/src/trpc/trpc.ts:63-68 already documents.
 *
 * `user.is2faEnabled()` returns FALSE here on purpose: that is the legacy
 * single-owner YAML store, which knows nothing about this DB user's TOTP. It is
 * the wrong answer, and the whole point is that it must not be the one returned.
 */
function makeExpressCtx() {
	return {
		dangerouslyBypassAuthentication: false,
		transport: 'express',
		currentUser: undefined,
		legacySingleUser: undefined,
		request: {headers: {}, cookies: {LIVINITY_SESSION: SESSION_TOKEN}},
		server: {verifyToken: async () => ({userId: USER_ID})},
		user: {is2faEnabled: async () => false},
		logger: {log() {}, error() {}, verbose() {}},
	} as never
}

beforeEach(() => {
	vi.mocked(isUserTotpEnabled).mockReset()
	vi.mocked(findUserById).mockReset()
	vi.mocked(getAdminUser).mockReset()
	vi.mocked(getPool).mockReset()
})

describe('user.is2faEnabled — must resolve the calling user over HTTP', () => {
	test('a DB user with TOTP enabled is NOT reported as disabled', async () => {
		// The operator's real row: 2FA genuinely ON in Postgres.
		vi.mocked(isUserTotpEnabled).mockResolvedValue(true)
		vi.mocked(findUserById).mockResolvedValue({
			id: USER_ID,
			username: 'everything',
			role: 'admin',
			isActive: true,
		} as never)
		vi.mocked(getPool).mockReturnValue(undefined as never)

		const enabled = await createCaller(makeExpressCtx()).is2faEnabled()

		// Reported "Disabled" for a user whose TOTP is on. That answer is what
		// offered them an Enable button they could never complete.
		expect(enabled).toBe(true)
	})

	test('the legacy no-DB single-owner box still answers from the YAML store', async () => {
		// Genuine legacy box: a token with no userId, and no DB admin to map to.
		// isAuthenticated sets legacySingleUser and leaves currentUser undefined,
		// so the ctx.user.is2faEnabled() branch must still be the one that runs.
		vi.mocked(getAdminUser).mockResolvedValue(undefined as never)
		vi.mocked(getPool).mockReturnValue(undefined as never)

		const legacyCtx = {
			...(makeExpressCtx() as object),
			server: {verifyToken: async () => ({})},
			user: {is2faEnabled: async () => true},
		} as never

		expect(await createCaller(legacyCtx).is2faEnabled()).toBe(true)
		// The DB DAO must not be consulted at all on a box that has no DB.
		expect(vi.mocked(isUserTotpEnabled)).not.toHaveBeenCalled()
	})
})
