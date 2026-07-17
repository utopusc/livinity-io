/**
 * Phase 334 (STEPUP-01, D-334-3) — stepUp.* verify router tests.
 *
 * Proves the mint gate OFFLINE (no PG / Redis / authenticator):
 *   - each factor mints the LIVINITY_STEPUP cookie ONLY on a fresh successful
 *     verification (correct password / valid TOTP or recovery code / passing
 *     assertion) — every failure is the opaque UNAUTHORIZED and NO cookie.
 *   - the per-user rate limiter denies password/TOTP attempts over the cap,
 *     byte-identical to a wrong factor (no throttle oracle).
 *   - the passkey ceremony is bound to the CURRENT user (allowCredentials from
 *     the user's own rows; a credential enrolled by another user fails closed
 *     BEFORE any crypto) and the challenge is single-use (deleted before verify).
 *   - a WS call (no HTTP response object) can never mint a grant.
 *
 * Strategy mirrors apps/routes-waf.test.ts: createCallerFactory + stubbed ctx;
 * DB DAOs + @simplewebauthn verify are vi.mock'd, bcrypt is REAL (cost-4 hash).
 */
import {describe, expect, test, vi, beforeEach} from 'vitest'
import {TRPCError} from '@trpc/server'
import bcrypt from 'bcryptjs'

vi.mock('../database/index.js', () => ({
	findUserById: vi.fn(),
	isUserTotpEnabled: vi.fn(),
	validateUserTotpToken: vi.fn(),
	consumeUserRecoveryCode: vi.fn(),
}))
vi.mock('../database/webauthn.js', () => ({
	listCredentialsForUser: vi.fn(),
	getCredentialById: vi.fn(),
	updateCounter: vi.fn(),
}))
// Audit writer is fire-and-forget PG+FS — stub it out entirely.
vi.mock('../security-audit/events.js', () => ({recordStepUpEvent: vi.fn()}))
vi.mock('@simplewebauthn/server', () => ({
	generateAuthenticationOptions: vi.fn(),
	verifyAuthenticationResponse: vi.fn(),
}))

import {
	findUserById,
	isUserTotpEnabled,
	validateUserTotpToken,
	consumeUserRecoveryCode,
} from '../database/index.js'
import {listCredentialsForUser, getCredentialById, updateCounter} from '../database/webauthn.js'
import {generateAuthenticationOptions, verifyAuthenticationResponse} from '@simplewebauthn/server'

import stepUpRouter from './routes.js'
import {t} from '../server/trpc/trpc.js'
import {STEPUP_COOKIE_NAME, STEPUP_GRANT_MAX_AGE_MS} from './constants.js'

const createCaller = t.createCallerFactory(stepUpRouter)

const USER_ID = 'user-A'
const PASSWORD = 'correct horse battery'
// Cost-4 keeps the suite fast; bcrypt.compare semantics are identical.
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4)
const DOMAIN_CONFIG = JSON.stringify({domain: 'bruce.livinity.io', active: true})

// In-memory ioredis stand-in covering exactly the calls routes.ts makes.
function makeRedis(withDomain = true) {
	const store = new Map<string, string>()
	const counters = new Map<string, number>()
	if (withDomain) store.set('livos:domain:config', DOMAIN_CONFIG)
	return {
		store,
		counters,
		async incr(key: string) {
			const n = (counters.get(key) ?? 0) + 1
			counters.set(key, n)
			return n
		},
		async expire() {
			return 1
		},
		async get(key: string) {
			return store.get(key) ?? null
		},
		async del(key: string) {
			store.delete(key)
			return 1
		},
		async set(key: string, value: string) {
			store.set(key, value)
			return 'OK'
		},
	}
}

function makeCtx(opts: {user?: null; redis?: ReturnType<typeof makeRedis>; response?: null} = {}) {
	const redis = opts.redis ?? makeRedis()
	const response = opts.response === null ? undefined : {cookie: vi.fn()}
	const server = {signStepUpGrant: vi.fn().mockResolvedValue({token: 'grant.jwt', jti: 'jti-1'})}
	const ctx = {
		dangerouslyBypassAuthentication: true,
		transport: 'http',
		currentUser: opts.user === null ? undefined : {id: USER_ID, username: 'alice', role: 'admin'},
		livinityd: {ai: {redis}},
		logger: {log() {}, error() {}, verbose() {}},
		server,
		response,
	} as never
	return {ctx, redis, response, server}
}

const expectCookieMinted = (response: {cookie: ReturnType<typeof vi.fn>} | undefined) => {
	expect(response!.cookie).toHaveBeenCalledWith(STEPUP_COOKIE_NAME, 'grant.jwt', {
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		path: '/',
		maxAge: STEPUP_GRANT_MAX_AGE_MS,
	})
}

beforeEach(() => {
	vi.mocked(findUserById).mockReset()
	vi.mocked(isUserTotpEnabled).mockReset()
	vi.mocked(validateUserTotpToken).mockReset()
	vi.mocked(consumeUserRecoveryCode).mockReset()
	vi.mocked(listCredentialsForUser).mockReset()
	vi.mocked(getCredentialById).mockReset()
	vi.mocked(updateCounter).mockReset()
	vi.mocked(generateAuthenticationOptions).mockReset()
	vi.mocked(verifyAuthenticationResponse).mockReset()
})

describe('stepUp.verifyPassword', () => {
	test('correct password mints the grant cookie', async () => {
		vi.mocked(findUserById).mockResolvedValue({id: USER_ID, hashedPassword: PASSWORD_HASH} as never)
		const {ctx, response} = makeCtx()
		await expect(createCaller(ctx).verifyPassword({password: PASSWORD})).resolves.toEqual({ok: true})
		expectCookieMinted(response)
	})

	test('wrong password → opaque UNAUTHORIZED, no cookie', async () => {
		vi.mocked(findUserById).mockResolvedValue({id: USER_ID, hashedPassword: PASSWORD_HASH} as never)
		const {ctx, response} = makeCtx()
		await expect(createCaller(ctx).verifyPassword({password: 'nope'})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
			message: 'Verification failed',
		})
		expect(response!.cookie).not.toHaveBeenCalled()
	})

	test('unknown user row fails closed with the SAME opaque denial', async () => {
		vi.mocked(findUserById).mockResolvedValue(null as never)
		const {ctx, response} = makeCtx()
		await expect(createCaller(ctx).verifyPassword({password: PASSWORD})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
			message: 'Verification failed',
		})
		expect(response!.cookie).not.toHaveBeenCalled()
	})

	test('over the rate cap even a CORRECT password is denied (no throttle oracle)', async () => {
		vi.mocked(findUserById).mockResolvedValue({id: USER_ID, hashedPassword: PASSWORD_HASH} as never)
		const {ctx, redis, response, server} = makeCtx()
		redis.counters.set(`stepup:rl:${USER_ID}`, 10) // next incr → 11 > cap
		await expect(createCaller(ctx).verifyPassword({password: PASSWORD})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
			message: 'Verification failed',
		})
		expect(server.signStepUpGrant).not.toHaveBeenCalled()
		expect(response!.cookie).not.toHaveBeenCalled()
	})

	test('no currentUser (legacy no-DB box) → step-up unavailable', async () => {
		const {ctx} = makeCtx({user: null})
		await expect(createCaller(ctx).verifyPassword({password: PASSWORD})).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
		})
	})

	test('a WS call (no HTTP response) can never mint a grant', async () => {
		vi.mocked(findUserById).mockResolvedValue({id: USER_ID, hashedPassword: PASSWORD_HASH} as never)
		const {ctx, server} = makeCtx({response: null})
		await expect(createCaller(ctx).verifyPassword({password: PASSWORD})).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
		})
		expect(server.signStepUpGrant).not.toHaveBeenCalled()
	})
})

describe('stepUp.verifyTotp', () => {
	test('TOTP not enrolled → PRECONDITION_FAILED (UI hides the branch)', async () => {
		vi.mocked(isUserTotpEnabled).mockResolvedValue(false)
		const {ctx} = makeCtx()
		await expect(createCaller(ctx).verifyTotp({token: '123456'})).rejects.toMatchObject({
			code: 'PRECONDITION_FAILED',
		})
	})

	test('valid TOTP mints the grant cookie', async () => {
		vi.mocked(isUserTotpEnabled).mockResolvedValue(true)
		vi.mocked(validateUserTotpToken).mockResolvedValue(true)
		const {ctx, response} = makeCtx()
		await expect(createCaller(ctx).verifyTotp({token: '123456'})).resolves.toEqual({ok: true})
		expectCookieMinted(response)
	})

	test('recovery code is the escape hatch when the TOTP is invalid', async () => {
		vi.mocked(isUserTotpEnabled).mockResolvedValue(true)
		vi.mocked(validateUserTotpToken).mockResolvedValue(false)
		vi.mocked(consumeUserRecoveryCode).mockResolvedValue(true)
		const {ctx, response} = makeCtx()
		await expect(createCaller(ctx).verifyTotp({token: 'RECOVERY-1'})).resolves.toEqual({ok: true})
		expectCookieMinted(response)
	})

	test('invalid TOTP + invalid recovery → opaque UNAUTHORIZED, no cookie', async () => {
		vi.mocked(isUserTotpEnabled).mockResolvedValue(true)
		vi.mocked(validateUserTotpToken).mockResolvedValue(false)
		vi.mocked(consumeUserRecoveryCode).mockResolvedValue(false)
		const {ctx, response} = makeCtx()
		await expect(createCaller(ctx).verifyTotp({token: '000000'})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
			message: 'Verification failed',
		})
		expect(response!.cookie).not.toHaveBeenCalled()
	})
})

describe('stepUp.passkeyOptions', () => {
	test('bare-LAN-IP box (no mainDomain) → passkey unavailable', async () => {
		const {ctx} = makeCtx({redis: makeRedis(false)})
		await expect(createCaller(ctx).passkeyOptions()).rejects.toMatchObject({code: 'PRECONDITION_FAILED'})
	})

	test('no enrolled passkeys → PRECONDITION_FAILED', async () => {
		vi.mocked(listCredentialsForUser).mockResolvedValue([])
		const {ctx} = makeCtx()
		await expect(createCaller(ctx).passkeyOptions()).rejects.toMatchObject({code: 'PRECONDITION_FAILED'})
	})

	test('pins the ceremony to the current user credentials + stores a single-use challenge', async () => {
		vi.mocked(listCredentialsForUser).mockResolvedValue([{credential_id: 'cred-1'}, {credential_id: 'cred-2'}] as never)
		vi.mocked(generateAuthenticationOptions).mockResolvedValue({challenge: 'chal-1'} as never)
		const {ctx, redis} = makeCtx()
		await expect(createCaller(ctx).passkeyOptions()).resolves.toEqual({challenge: 'chal-1'})
		expect(generateAuthenticationOptions).toHaveBeenCalledWith({
			rpID: 'bruce.livinity.io',
			userVerification: 'preferred',
			allowCredentials: [{id: 'cred-1'}, {id: 'cred-2'}],
		})
		expect(redis.store.get(`webauthn:chal:stepup:${USER_ID}`)).toBe('chal-1')
	})
})

describe('stepUp.passkeyVerify', () => {
	const CRED = {credential_id: 'cred-1', user_id: USER_ID, public_key: Buffer.from('pk').toString('base64url'), counter: 2}

	function primeChallenge(redis: ReturnType<typeof makeRedis>) {
		redis.store.set(`webauthn:chal:stepup:${USER_ID}`, 'chal-1')
	}

	test('passing assertion updates the counter and mints the grant cookie', async () => {
		vi.mocked(getCredentialById).mockResolvedValue(CRED as never)
		vi.mocked(verifyAuthenticationResponse).mockResolvedValue({verified: true, authenticationInfo: {newCounter: 3}} as never)
		const {ctx, redis, response} = makeCtx()
		primeChallenge(redis)
		await expect(createCaller(ctx).passkeyVerify({response: {id: 'cred-1'}})).resolves.toEqual({ok: true})
		expect(updateCounter).toHaveBeenCalledWith('cred-1', 3)
		expectCookieMinted(response)
		// Single-use: the challenge was deleted before verify.
		expect(redis.store.has(`webauthn:chal:stepup:${USER_ID}`)).toBe(false)
	})

	test('unknown credential fails closed BEFORE any crypto', async () => {
		vi.mocked(getCredentialById).mockResolvedValue(null as never)
		const {ctx, redis} = makeCtx()
		primeChallenge(redis)
		await expect(createCaller(ctx).passkeyVerify({response: {id: 'ghost'}})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
			message: 'Verification failed',
		})
		expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
	})

	test("ANOTHER user's enrolled credential can never step-up this session", async () => {
		vi.mocked(getCredentialById).mockResolvedValue({...CRED, user_id: 'user-B'} as never)
		const {ctx, redis} = makeCtx()
		primeChallenge(redis)
		await expect(createCaller(ctx).passkeyVerify({response: {id: 'cred-1'}})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
			message: 'Verification failed',
		})
		expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
	})

	test('missing / expired challenge fails closed (single-use, no stale retry)', async () => {
		vi.mocked(getCredentialById).mockResolvedValue(CRED as never)
		const {ctx} = makeCtx() // no challenge primed
		await expect(createCaller(ctx).passkeyVerify({response: {id: 'cred-1'}})).rejects.toMatchObject({
			code: 'UNAUTHORIZED',
		})
		expect(verifyAuthenticationResponse).not.toHaveBeenCalled()
	})

	test('verified:false fails closed (never fail open), no cookie', async () => {
		vi.mocked(getCredentialById).mockResolvedValue(CRED as never)
		vi.mocked(verifyAuthenticationResponse).mockResolvedValue({verified: false} as never)
		const {ctx, redis, response} = makeCtx()
		primeChallenge(redis)
		await expect(createCaller(ctx).passkeyVerify({response: {id: 'cred-1'}})).rejects.toBeInstanceOf(TRPCError)
		expect(response!.cookie).not.toHaveBeenCalled()
	})

	test('cloned-authenticator counter regression is rejected before the mint', async () => {
		vi.mocked(getCredentialById).mockResolvedValue(CRED as never) // stored counter 2
		vi.mocked(verifyAuthenticationResponse).mockResolvedValue({verified: true, authenticationInfo: {newCounter: 2}} as never)
		const {ctx, redis, response} = makeCtx()
		primeChallenge(redis)
		await expect(createCaller(ctx).passkeyVerify({response: {id: 'cred-1'}})).rejects.toBeInstanceOf(TRPCError)
		expect(updateCounter).not.toHaveBeenCalled()
		expect(response!.cookie).not.toHaveBeenCalled()
	})
})
