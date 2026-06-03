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

import {sign, signUserToken, verify, signProxyToken, verifyProxyToken} from './jwt.js'

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
