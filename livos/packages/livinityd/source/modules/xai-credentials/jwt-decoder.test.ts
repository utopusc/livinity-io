/**
 * Phase 195 Plan 02 Task 1 — jwt-decoder.test.ts (RED → GREEN).
 *
 * Vitest suite for decodeXaiJwt().
 *
 * Coverage:
 *   - decodes a real-shape JWT and returns expected tier/scopes/iss
 *   - exp normalization (seconds vs milliseconds)
 *   - throws on malformed token (1-segment, garbage b64, non-JSON payload)
 */

import {describe, expect, test} from 'vitest'

import {AuthJsonCorruptError, decodeXaiJwt} from './jwt-decoder.js'

/**
 * Helper — build a JWT with a chosen payload (no signature; we put an empty
 * segment for the signature so segment count is exactly 3).
 *
 * NOT a real JWT — only the payload is decoded by our pure function.
 */
function makeJwt(payload: Record<string, unknown>): string {
	const header = Buffer.from(JSON.stringify({alg: 'RS256', typ: 'JWT'}), 'utf8')
		.toString('base64')
		.replace(/=+$/, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
	const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8')
		.toString('base64')
		.replace(/=+$/, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
	return `${header}.${payloadB64}.fake-signature`
}

describe('decodeXaiJwt', () => {
	test('decodes a real-shape xAI JWT and returns tier/scopes/iss/aud', () => {
		const token = makeJwt({
			iss: 'https://auth.x.ai',
			aud: '00000000-0000-0000-0000-aaaaaaaaaaaa',
			sub: 'user-xyz',
			exp: 1746000000,
			scope: 'openid profile email offline_access grok-cli:access api:access',
			tier: 1,
			principal_id: '11111111-2222-3333-4444-555555555555',
			team_id: '99999999-8888-7777-6666-555555555555',
		})

		const claims = decodeXaiJwt(token)

		expect(claims.iss).toBe('https://auth.x.ai')
		expect(claims.aud).toBe('00000000-0000-0000-0000-aaaaaaaaaaaa')
		expect(claims.tier).toBe(1)
		expect(claims.scope).toEqual([
			'openid',
			'profile',
			'email',
			'offline_access',
			'grok-cli:access',
			'api:access',
		])
		expect(claims.principal_id).toBe('11111111-2222-3333-4444-555555555555')
		expect(claims.team_id).toBe('99999999-8888-7777-6666-555555555555')
		expect(claims.sub).toBe('user-xyz')
	})

	test('exp in seconds is normalized to milliseconds', () => {
		const token = makeJwt({
			iss: 'https://auth.x.ai',
			aud: 'client-id',
			exp: 1746000000, // seconds form
			scope: 'openid',
		})
		const claims = decodeXaiJwt(token)
		expect(claims.exp).toBe(1746000000 * 1000)
	})

	test('exp already in milliseconds passes through unchanged', () => {
		const token = makeJwt({
			iss: 'https://auth.x.ai',
			aud: 'client-id',
			exp: 1746000000000, // already ms (> 10_000_000_000)
			scope: 'openid',
		})
		const claims = decodeXaiJwt(token)
		expect(claims.exp).toBe(1746000000000)
	})

	test('empty scope produces empty array (not undefined)', () => {
		const token = makeJwt({
			iss: 'https://auth.x.ai',
			aud: 'client-id',
			exp: 1746000000,
			// no scope claim
		})
		const claims = decodeXaiJwt(token)
		expect(claims.scope).toEqual([])
	})

	test('throws AuthJsonCorruptError on 1-segment input', () => {
		expect(() => decodeXaiJwt('not-a-jwt')).toThrow(AuthJsonCorruptError)
	})

	test('throws AuthJsonCorruptError on garbage non-JSON payload segment', () => {
		// 3 segments but payload is not valid JSON when base64-decoded
		const garbage = 'aaa.!!!!.zzz'
		expect(() => decodeXaiJwt(garbage)).toThrow(AuthJsonCorruptError)
	})

	test('throws AuthJsonCorruptError when iss claim is missing', () => {
		const token = makeJwt({
			aud: 'client-id',
			exp: 1746000000,
			scope: 'openid',
		})
		expect(() => decodeXaiJwt(token)).toThrow(AuthJsonCorruptError)
	})

	test('throws AuthJsonCorruptError when iss is not an https URL', () => {
		const token = makeJwt({
			iss: 'http://attacker.example',
			aud: 'client-id',
			exp: 1746000000,
			scope: 'openid',
		})
		expect(() => decodeXaiJwt(token)).toThrow(AuthJsonCorruptError)
	})

	test('throws AuthJsonCorruptError when exp is missing', () => {
		const token = makeJwt({
			iss: 'https://auth.x.ai',
			aud: 'client-id',
			scope: 'openid',
		})
		expect(() => decodeXaiJwt(token)).toThrow(AuthJsonCorruptError)
	})
})
