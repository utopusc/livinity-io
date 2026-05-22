/**
 * Phase 195 Plan 02 Task 2 — credentials-service.test.ts (RED → GREEN).
 *
 * Vitest suite for XaiCredentialsService.
 *
 * Coverage:
 *   - getStatus() on missing xai entry → {connected: false}
 *   - getStatus() on valid xai entry decodes JWT + returns connected/tier/scopes/expiresAt
 *   - getToken() does NOT refresh when token expires in 1h
 *   - getToken() when token expires in 2min → triggers refresh exactly once
 *     across 10 concurrent calls (SINGLE-FLIGHT ASSERTION)
 *   - getToken() when refresh 401 → throws RefreshFailedError + emits
 *     'token-expired' + 'disconnected' + subsequent getStatus() ... still works
 *   - clear() removes only `xai`, sibling `anthropic` entry preserved
 *   - Atomic write uses PID-suffixed temp file (evidence)
 */

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {NotConnectedError, XaiCredentialsService} from './credentials-service.js'
import {RefreshFailedError} from './token-refresher.js'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function b64url(buf: Buffer | string): string {
	return Buffer.from(buf)
		.toString('base64')
		.replace(/=+$/, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
}

interface BuildJwtOpts {
	exp?: number // ms epoch
	tier?: number
	scope?: string
	aud?: string
	iss?: string
	principal_id?: string
	team_id?: string
}

function buildJwt(opts: BuildJwtOpts = {}): string {
	const header = b64url(JSON.stringify({alg: 'RS256', typ: 'JWT'}))
	const payload = b64url(
		JSON.stringify({
			iss: opts.iss ?? 'https://auth.x.ai',
			aud: opts.aud ?? 'opencode-client-id',
			exp: opts.exp ?? Date.now() + 60 * 60_000, // ms by default
			scope: opts.scope ?? 'openid profile email offline_access grok-cli:access api:access',
			tier: opts.tier,
			principal_id: opts.principal_id,
			team_id: opts.team_id,
		}),
	)
	return `${header}.${payload}.fake-sig`
}

async function makeTmpAuthJsonPath(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xai-credentials-test-'))
	return path.join(dir, 'auth.json')
}

async function writeAuthJson(p: string, contents: unknown): Promise<void> {
	await fs.mkdir(path.dirname(p), {recursive: true})
	await fs.writeFile(p, JSON.stringify(contents, null, 2))
}

afterEach(() => {
	vi.useRealTimers()
})

describe('XaiCredentialsService.getStatus()', () => {
	test('returns connected:false when auth.json is missing', async () => {
		const p = path.join(
			await fs.mkdtemp(path.join(os.tmpdir(), 'xai-creds-missing-')),
			'no-such-auth.json',
		)
		const svc = new XaiCredentialsService({authJsonPath: p})
		expect(await svc.getStatus()).toEqual({connected: false})
	})

	test('returns connected:false when auth.json has no xai entry', async () => {
		const p = await makeTmpAuthJsonPath()
		await writeAuthJson(p, {anthropic: {type: 'oauth', access: 'a'}})
		const svc = new XaiCredentialsService({authJsonPath: p})
		expect(await svc.getStatus()).toEqual({connected: false})
	})

	test('decodes JWT and returns tier/scopes/expiresAt on a valid xai entry', async () => {
		const p = await makeTmpAuthJsonPath()
		const expMs = Date.now() + 60 * 60_000
		const jwt = buildJwt({
			exp: expMs,
			tier: 1,
			scope: 'openid offline_access grok-cli:access api:access',
			principal_id: '11111111-2222-3333-4444-555555555555',
			team_id: '99999999-8888-7777-6666-555555555555',
		})
		await writeAuthJson(p, {
			xai: {type: 'oauth', access: jwt, refresh: 'old-refresh', expires: expMs},
		})
		const svc = new XaiCredentialsService({authJsonPath: p})
		const status = await svc.getStatus()
		expect(status.connected).toBe(true)
		expect(status.tier).toBe(1)
		expect(status.scopes).toContain('grok-cli:access')
		expect(status.expiresAt).toBe(expMs)
		expect(status.principalId).toBe('11111111-2222-3333-4444-555555555555')
		expect(status.teamId).toBe('99999999-8888-7777-6666-555555555555')
	})
})

describe('XaiCredentialsService.getToken()', () => {
	test('throws NotConnectedError when no xai entry exists', async () => {
		const p = await makeTmpAuthJsonPath()
		await writeAuthJson(p, {anthropic: {access: 'x'}})
		const svc = new XaiCredentialsService({authJsonPath: p})
		await expect(svc.getToken()).rejects.toBeInstanceOf(NotConnectedError)
	})

	test('returns current access verbatim when token has > 5min until expiry', async () => {
		const p = await makeTmpAuthJsonPath()
		const expMs = Date.now() + 60 * 60_000 // 1h ahead
		const jwt = buildJwt({exp: expMs, tier: 1})
		await writeAuthJson(p, {
			xai: {type: 'oauth', access: jwt, refresh: 'r', expires: expMs},
		})

		const refreshFn = vi.fn()
		const svc = new XaiCredentialsService({
			authJsonPath: p,
			refreshFn: refreshFn as never,
		})
		const tok = await svc.getToken()
		expect(tok).toBe(jwt)
		expect(refreshFn).not.toHaveBeenCalled()
	})

	test('SINGLE-FLIGHT: 10 concurrent getToken() calls during expiry window trigger refreshFn exactly once', async () => {
		const p = await makeTmpAuthJsonPath()
		const expMs = Date.now() + 2 * 60_000 // 2 min — below 5min threshold
		const jwt = buildJwt({exp: expMs, tier: 1, aud: 'client-uuid'})
		await writeAuthJson(p, {
			xai: {type: 'oauth', access: jwt, refresh: 'old-refresh', expires: expMs},
			anthropic: {type: 'oauth', access: 'sibling-token'},
		})

		const newExpMs = Date.now() + 6 * 60 * 60_000 // 6h future
		const newJwt = buildJwt({exp: newExpMs, tier: 1, aud: 'client-uuid'})

		// Refresh delays 50ms so all 10 concurrent calls land while in-flight.
		const refreshFn = vi.fn(async () => {
			await new Promise((r) => setTimeout(r, 50))
			return {access: newJwt, refresh: 'new-refresh', expiresAt: newExpMs}
		})

		const svc = new XaiCredentialsService({
			authJsonPath: p,
			refreshFn: refreshFn as never,
		})

		const refreshedEvents: number[] = []
		svc.on('token-refreshed', () => refreshedEvents.push(Date.now()))

		// Launch 10 concurrent getToken() calls.
		const results = await Promise.all(
			Array.from({length: 10}, () => svc.getToken()),
		)

		// All 10 callers get the SAME new access token.
		for (const tok of results) expect(tok).toBe(newJwt)
		// refreshFn called exactly ONCE.
		expect(refreshFn).toHaveBeenCalledTimes(1)
		// 'token-refreshed' emitted at least once.
		expect(refreshedEvents.length).toBeGreaterThanOrEqual(1)

		// auth.json on disk now has the new tokens AND the sibling anthropic
		// entry preserved.
		const updated = JSON.parse(await fs.readFile(p, 'utf8'))
		expect(updated.xai.access).toBe(newJwt)
		expect(updated.xai.refresh).toBe('new-refresh')
		expect(updated.anthropic.access).toBe('sibling-token')
	})

	test('on RefreshFailedError(401) emits token-expired + disconnected and rethrows', async () => {
		const p = await makeTmpAuthJsonPath()
		const expMs = Date.now() + 2 * 60_000 // inside refresh window
		const jwt = buildJwt({exp: expMs, tier: 1, aud: 'client-uuid'})
		await writeAuthJson(p, {
			xai: {type: 'oauth', access: jwt, refresh: 'revoked', expires: expMs},
		})

		const refreshFn = vi.fn(async () => {
			throw new RefreshFailedError('401', 401)
		})

		const svc = new XaiCredentialsService({
			authJsonPath: p,
			refreshFn: refreshFn as never,
		})
		const tokenExpired: number[] = []
		const disconnected: number[] = []
		svc.on('token-expired', () => tokenExpired.push(1))
		svc.on('disconnected', () => disconnected.push(1))

		await expect(svc.getToken()).rejects.toBeInstanceOf(RefreshFailedError)
		expect(tokenExpired.length).toBe(1)
		expect(disconnected.length).toBe(1)
	})
})

describe('XaiCredentialsService.clear()', () => {
	test('removes only xai entry; sibling anthropic entry preserved', async () => {
		const p = await makeTmpAuthJsonPath()
		const jwt = buildJwt()
		await writeAuthJson(p, {
			xai: {type: 'oauth', access: jwt, refresh: 'r'},
			anthropic: {type: 'oauth', access: 'sibling-token', refresh: 'sibling-refresh'},
		})

		const svc = new XaiCredentialsService({authJsonPath: p})
		const disconnected: number[] = []
		svc.on('disconnected', () => disconnected.push(1))

		await svc.clear()

		const after = JSON.parse(await fs.readFile(p, 'utf8'))
		expect(after.xai).toBeUndefined()
		expect(after.anthropic).toBeDefined()
		expect(after.anthropic.access).toBe('sibling-token')
		expect(disconnected.length).toBe(1)
	})

	test('is a no-op when auth.json is missing (emits disconnected)', async () => {
		const p = path.join(
			await fs.mkdtemp(path.join(os.tmpdir(), 'xai-creds-clear-')),
			'no-such-auth.json',
		)
		const svc = new XaiCredentialsService({authJsonPath: p})
		const disconnected: number[] = []
		svc.on('disconnected', () => disconnected.push(1))
		await svc.clear()
		expect(disconnected.length).toBe(1)
	})
})

describe('XaiCredentialsService atomic write', () => {
	test('after refresh, no PID-suffixed temp file lingers and auth.json contents are the new tokens', async () => {
		const p = await makeTmpAuthJsonPath()
		const expMs = Date.now() + 2 * 60_000
		const jwt = buildJwt({exp: expMs, tier: 1, aud: 'client-uuid'})
		await writeAuthJson(p, {
			xai: {type: 'oauth', access: jwt, refresh: 'r', expires: expMs},
		})

		const newExpMs = Date.now() + 6 * 60 * 60_000
		const newJwt = buildJwt({exp: newExpMs, tier: 1})

		const refreshFn = vi.fn(async () => ({
			access: newJwt,
			refresh: 'new-r',
			expiresAt: newExpMs,
		}))

		const svc = new XaiCredentialsService({
			authJsonPath: p,
			refreshFn: refreshFn as never,
		})
		await svc.getToken()

		// After atomic rename, the temp file must NOT linger.
		const expectedTmp = p + '.tmp.' + process.pid
		await expect(fs.access(expectedTmp)).rejects.toThrow()

		// And auth.json now contains the new access token.
		const after = JSON.parse(await fs.readFile(p, 'utf8'))
		expect(after.xai.access).toBe(newJwt)
		expect(after.xai.refresh).toBe('new-r')
		expect(after.xai.expires).toBe(newExpMs)
	})
})
