/**
 * Phase 257-04 WS-A (LIVOS-028) — jwt aud/iss binding + warm-migrated dual
 * proxy secret.
 *
 * Offline unit test (no DB / no redis). Verifies:
 *   - session + proxy tokens carry aud/iss and verification rejects the wrong
 *     audience/issuer;
 *   - proxy tokens use a SEPARATE (derived-independent) secret + proxy audience;
 *   - cross-type rejection is preserved (proxy↛session, session↛proxy);
 *   - WARM MIGRATION: a LEGACY proxy token (session secret, no proxy aud) still
 *     verifies via the fallback so outstanding ~week-long cookies don't 4403.
 *
 * Coverage:
 *   T1  — signUserToken embeds aud=livinityd + iss=livinityd; verify accepts it
 *         and REJECTS a token carrying a different aud/iss.
 *   T2  — signProxyToken uses the proxy secret + aud=livinityd-proxy;
 *         verifyProxyToken accepts it; a session-secret-signed token fails.
 *   T3  — cross-type: a proxy token → verify() fails; a session token →
 *         verifyProxyToken() fails.
 *   T4  — warm migration: a LEGACY proxy token (signed with the session secret,
 *         no proxy aud, the pre-257-04 shape) STILL verifies via the fallback.
 */

import crypto from 'node:crypto'

import jwt from 'jsonwebtoken'
import {describe, expect, test} from 'vitest'

import {sign, signUserToken, verify, signProxyToken, verifyProxyToken, signSsoToken, verifySsoToken, signShareGrant, verifyShareGrant} from './jwt.js'

// Two valid 64-hex (256-bit) secrets.
const SESSION_SECRET = 'a'.repeat(64)
const OTHER_SECRET = 'b'.repeat(64)

// Mirror jwt.ts's internal proxy-secret derivation so we can hand-craft tokens.
function deriveProxySecret(s: string): string {
	return crypto.createHash('sha256').update(`${s}:livinity-proxy-v1`).digest('hex')
}

describe('jwt — LIVOS-028 aud/iss + dual proxy secret', () => {
	test('T1 — session token carries aud/iss; verify rejects wrong aud/iss', async () => {
		const token = await signUserToken(SESSION_SECRET, 'u1', 'member')
		const decoded = jwt.decode(token) as any
		expect(decoded.aud).toBe('livinityd')
		expect(decoded.iss).toBe('livinityd')

		const v = await verify(token, SESSION_SECRET)
		expect(v.loggedIn).toBe(true)
		expect(v.userId).toBe('u1')
		expect(v.jti).toBeTruthy()

		// A token signed with the session secret but a WRONG audience is rejected.
		const wrongAud = jwt.sign(
			{loggedIn: true, userId: 'u1', role: 'member', jti: 'x'},
			SESSION_SECRET,
			{algorithm: 'HS256', audience: 'someone-else', issuer: 'livinityd'},
		)
		await expect(verify(wrongAud, SESSION_SECRET)).rejects.toThrow(/audience/i)

		const wrongIss = jwt.sign(
			{loggedIn: true, userId: 'u1', role: 'member', jti: 'x'},
			SESSION_SECRET,
			{algorithm: 'HS256', audience: 'livinityd', issuer: 'evil'},
		)
		await expect(verify(wrongIss, SESSION_SECRET)).rejects.toThrow(/issuer/i)
	})

	test('T1b — legacy session token (no aud/iss) still verifies (warm migration)', async () => {
		// Pre-257-04 shape: no audience/issuer claims.
		const legacy = jwt.sign({loggedIn: true, userId: 'u1', role: 'member'}, SESSION_SECRET, {
			algorithm: 'HS256',
		})
		const v = await verify(legacy, SESSION_SECRET)
		expect(v.loggedIn).toBe(true)
		expect(v.userId).toBe('u1')
	})

	test('T2 — proxy token uses the proxy secret + proxy audience', async () => {
		const proxy = await signProxyToken(SESSION_SECRET)
		const decoded = jwt.decode(proxy) as any
		expect(decoded.proxyToken).toBe(true)
		expect(decoded.aud).toBe('livinityd-proxy')

		// Verifies via verifyProxyToken (new primary path).
		await expect(verifyProxyToken(proxy, SESSION_SECRET)).resolves.toBe(true)

		// The proxy token is NOT signed with the session secret — verifying it as
		// a plain session-secret HS256 token (no aud) fails the signature.
		expect(() => jwt.verify(proxy, SESSION_SECRET, {algorithms: ['HS256']})).toThrow()
		// But it IS signed with the derived proxy secret.
		expect(() =>
			jwt.verify(proxy, deriveProxySecret(SESSION_SECRET), {algorithms: ['HS256']}),
		).not.toThrow()
	})

	test('T3 — cross-type rejection preserved', async () => {
		const proxy = await signProxyToken(SESSION_SECRET)
		const session = await signUserToken(SESSION_SECRET, 'u1', 'member')

		// A proxy token presented to the session verifier fails.
		await expect(verify(proxy, SESSION_SECRET)).rejects.toThrow()
		// A session token presented to the proxy verifier fails (no proxyToken=true,
		// and even via the legacy fallback the proxyToken discriminator rejects it).
		await expect(verifyProxyToken(session, SESSION_SECRET)).rejects.toThrow()
	})

	test('T4 — WARM MIGRATION: legacy proxy token (session secret, no aud) still verifies', async () => {
		// The exact pre-257-04 proxy token shape: {proxyToken:true} signed with the
		// SESSION secret, no audience/issuer. Outstanding ~week-long cookies on the
		// live box look like this — they MUST keep working (no forced re-login, no
		// 4403 on live PTY sessions).
		const legacyProxy = jwt.sign({proxyToken: true}, SESSION_SECRET, {
			algorithm: 'HS256',
			expiresIn: 7 * 24 * 60 * 60,
		})
		await expect(verifyProxyToken(legacyProxy, SESSION_SECRET)).resolves.toBe(true)

		// A garbage token (wrong secret entirely) still fails both paths.
		const garbage = jwt.sign({proxyToken: true}, OTHER_SECRET, {algorithm: 'HS256'})
		await expect(verifyProxyToken(garbage, SESSION_SECRET)).rejects.toThrow()
	})

	test('T5 — legacy sign() session token carries aud/iss and round-trips', async () => {
		const token = await sign(SESSION_SECRET)
		const decoded = jwt.decode(token) as any
		expect(decoded.aud).toBe('livinityd')
		expect(decoded.iss).toBe('livinityd')
		const v = await verify(token, SESSION_SECRET)
		expect(v.loggedIn).toBe(true)
		expect(v.userId).toBeUndefined()
	})
})

describe('jwt — Phase 259 SSO bounce token', () => {
	test('signSsoToken round-trips targetHost + identity + jti', async () => {
		const {token, jti} = await signSsoToken(SESSION_SECRET, {
			targetHost: 'n8n-bruce.livinity.io',
			userId: 'u1',
			role: 'admin',
		})
		const claims = await verifySsoToken(token, SESSION_SECRET)
		expect(claims.targetHost).toBe('n8n-bruce.livinity.io')
		expect(claims.userId).toBe('u1')
		expect(claims.role).toBe('admin')
		expect(claims.legacy).toBe(false)
		expect(claims.jti).toBe(jti)
	})

	test('legacy (no userId) SSO token carries legacy=true', async () => {
		const {token} = await signSsoToken(SESSION_SECRET, {targetHost: 'immich-bruce.livinity.io', legacy: true})
		const claims = await verifySsoToken(token, SESSION_SECRET)
		expect(claims.legacy).toBe(true)
		expect(claims.userId).toBeUndefined()
	})

	test('an SSO token is NOT accepted by the session verifier (audience binding)', async () => {
		const {token} = await signSsoToken(SESSION_SECRET, {targetHost: 'x-bruce.livinity.io', userId: 'u1', role: 'member'})
		await expect(verify(token, SESSION_SECRET)).rejects.toThrow()
	})

	test('a session token is NOT accepted by the SSO verifier', async () => {
		const sess = await signUserToken(SESSION_SECRET, 'u1', 'member')
		await expect(verifySsoToken(sess, SESSION_SECRET)).rejects.toThrow()
	})

	test('a wrong-secret SSO token fails verification', async () => {
		const {token} = await signSsoToken(SESSION_SECRET, {targetHost: 'x-bruce.livinity.io', userId: 'u1', role: 'member'})
		await expect(verifySsoToken(token, OTHER_SECRET)).rejects.toThrow()
	})

	test('an expired SSO token fails verification', async () => {
		// Hand-craft a token already past its exp using the same secret + claims.
		const expired = jwt.sign(
			{sso: true, targetHost: 'x-bruce.livinity.io', userId: 'u1', role: 'member', jti: 'j1'},
			SESSION_SECRET,
			{algorithm: 'HS256', audience: 'livinityd-sso', issuer: 'livinityd', expiresIn: -10},
		)
		await expect(verifySsoToken(expired, SESSION_SECRET)).rejects.toThrow()
	})
})

describe('jwt — Phase 324-01 FILES-01 share unlock grant (D-03)', () => {
	test('signShareGrant round-trips shareId + jti', async () => {
		const {token, jti} = await signShareGrant(SESSION_SECRET, 'share-A')
		const claims = await verifyShareGrant(token, SESSION_SECRET)
		expect(claims.shareId).toBe('share-A')
		expect(claims.jti).toBe(jti)
	})

	test('a grant minted for share A carries share A (route can reject B) — shareId binding', async () => {
		// The grant is BOUND to one share via shareId (mirrors the SSO targetHost
		// binding). Replay to another share is rejected by the ROUTE comparing
		// claims.shareId to the current row.id — the verifier surfaces the bound id.
		const {token} = await signShareGrant(SESSION_SECRET, 'share-A')
		const claims = await verifyShareGrant(token, SESSION_SECRET)
		expect(claims.shareId).toBe('share-A')
		expect(claims.shareId).not.toBe('share-B')
	})

	test('a share grant is NOT accepted by the session verifier (audience binding)', async () => {
		const {token} = await signShareGrant(SESSION_SECRET, 'share-A')
		await expect(verify(token, SESSION_SECRET)).rejects.toThrow()
	})

	test('a session token is NOT accepted by the share-grant verifier', async () => {
		const sess = await signUserToken(SESSION_SECRET, 'u1', 'member')
		await expect(verifyShareGrant(sess, SESSION_SECRET)).rejects.toThrow()
	})

	test('an SSO token is NOT accepted by the share-grant verifier (distinct audience)', async () => {
		const {token} = await signSsoToken(SESSION_SECRET, {targetHost: 'x-bruce.livinity.io', userId: 'u1', role: 'member'})
		await expect(verifyShareGrant(token, SESSION_SECRET)).rejects.toThrow()
	})

	test('a wrong-secret share grant fails verification', async () => {
		const {token} = await signShareGrant(SESSION_SECRET, 'share-A')
		await expect(verifyShareGrant(token, OTHER_SECRET)).rejects.toThrow()
	})

	test('an expired share grant fails verification', async () => {
		const expired = jwt.sign(
			{share: true, shareId: 'share-A', jti: 'j1'},
			SESSION_SECRET,
			{algorithm: 'HS256', audience: 'livinityd-share', issuer: 'livinityd', expiresIn: -10},
		)
		await expect(verifyShareGrant(expired, SESSION_SECRET)).rejects.toThrow()
	})
})
