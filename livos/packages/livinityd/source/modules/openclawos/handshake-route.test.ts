/**
 * Phase 203-05 — POST /openclawos/handshake route tests.
 *
 * Covers ≥5 cases per Plan Task 2 done-criteria:
 *   1.  No cookie + no Authorization → 401 {error:"unauthorized"}
 *   2.  Invalid JWT → 401 {error:"unauthorized"}
 *   3.  Valid JWT (Bearer header) → 200 {token, expiresAt, sessionId}
 *   4.  Token verifies against the same gateway keypair
 *   5.  Token has 5-min TTL (exp - now ≈ 300s ± slack)
 *
 * Plus additional coverage:
 *   6.  Cookie-based auth path works
 *   7.  Legacy single-user JWT payload {loggedIn:true} resolves to userId='admin'
 *   8.  Multi-user payload {userId:'bruce', role:'admin'} resolves to userId='bruce'
 *   9.  Bearer header takes priority over cookie when both present
 *  10.  resolveUserId override is honored
 *  11.  Mint failure surfaces as 500 {error:"mint_failed"}
 */

import {generateKeyPairSync, type KeyObject} from 'node:crypto'
import express from 'express'
import cookieParser from 'cookie-parser'
import type {AddressInfo} from 'node:net'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {createHandshakeRouteHandler} from './handshake-route.js'
import {_resetKeypairCacheForTests, verifyToken} from './device-token.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let server: any = null
let baseUrl = ''
let keypair: {privateKey: KeyObject; publicKey: KeyObject}

beforeEach(async () => {
	_resetKeypairCacheForTests()
	keypair = generateKeyPairSync('ed25519')
})

afterEach(async () => {
	if (server) {
		await new Promise<void>((resolve) => server!.close(() => resolve()))
		server = null
	}
})

async function mountApp(opts: Parameters<typeof createHandshakeRouteHandler>[0]) {
	const app = express()
	app.use(cookieParser())
	app.use(express.json())
	// Hot-fix F2 — force the legacy Ed25519 mint path in tests by pointing
	// openclawConfigPath at a guaranteed-nonexistent file. Production code
	// uses /opt/livos/data/openclaw/openclaw.json which may accidentally
	// exist on a developer's Mini PC.
	app.post(
		'/openclawos/handshake',
		createHandshakeRouteHandler({...opts, openclawConfigPath: '/__nonexistent_openclaw_test_path__.json'}),
	)

	await new Promise<void>((resolve) => {
		server = app.listen(0, '127.0.0.1', () => resolve())
	})
	const addr = server!.address() as AddressInfo
	baseUrl = `http://127.0.0.1:${addr.port}`
}

// Inject our test keypair into mintToken via the module's loadOrCreateKeypair
// path by overriding OPENCLAW_KEYPAIR_PATH to a known temp file. Simpler: have
// the route handler write our test keypair to a fixture path via OPENCLAW_KEYPAIR_PATH,
// but easier still: pass keypair through resolveUserId? No — mintToken loads from disk.
//
// We instead let mintToken generate its own keypair (default path) and read it
// back via verifyToken's default loader for verification. _resetKeypairCacheForTests()
// + OPENCLAW_KEYPAIR_PATH pointing at a tmp file gives us a clean per-test keypair.
import os from 'node:os'
import path from 'node:path'
import {mkdtempSync, rmSync} from 'node:fs'

let tmpDir: string
beforeEach(() => {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'openclaw-handshake-test-'))
	process.env['OPENCLAW_KEYPAIR_PATH'] = path.join(tmpDir, 'keypair.json')
})

afterEach(() => {
	delete process.env['OPENCLAW_KEYPAIR_PATH']
	try {
		rmSync(tmpDir, {recursive: true, force: true})
	} catch {
		// ignore
	}
})

describe('Phase 203-05 — POST /openclawos/handshake', () => {
	test('1. No cookie + no Authorization → 401', async () => {
		await mountApp({verifyToken: vi.fn().mockResolvedValue({loggedIn: true})})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {method: 'POST'})
		expect(res.status).toBe(401)
		expect(await res.json()).toEqual({error: 'unauthorized'})
	})

	test('2. Invalid JWT → 401', async () => {
		await mountApp({
			verifyToken: vi.fn().mockRejectedValue(new Error('Invalid JWT')),
		})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer not-a-real-jwt'},
		})
		expect(res.status).toBe(401)
		expect(await res.json()).toEqual({error: 'unauthorized'})
	})

	test('3. Valid JWT (Bearer header) → 200 {token, expiresAt, sessionId}', async () => {
		await mountApp({
			verifyToken: vi.fn().mockResolvedValue({loggedIn: true, userId: 'admin'}),
		})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer valid-jwt'},
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {token: string; expiresAt: number; sessionId: string}
		expect(typeof body.token).toBe('string')
		expect(body.token.split('.').length).toBe(2)
		expect(typeof body.expiresAt).toBe('number')
		expect(typeof body.sessionId).toBe('string')
		expect(body.sessionId.length).toBeGreaterThan(8)
	})

	test('4. Returned token verifies against the gateway keypair', async () => {
		await mountApp({
			verifyToken: vi.fn().mockResolvedValue({loggedIn: true, userId: 'admin'}),
		})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer valid-jwt'},
		})
		const {token} = (await res.json()) as {token: string}
		// verifyToken uses the same keypair (loaded from OPENCLAW_KEYPAIR_PATH set above)
		const verified = await verifyToken(token)
		expect(verified).not.toBeNull()
		expect(verified?.userId).toBe('admin')
	})

	test('5. Returned token TTL is 5 minutes (300s) per T-203-02', async () => {
		await mountApp({
			verifyToken: vi.fn().mockResolvedValue({loggedIn: true, userId: 'admin'}),
		})
		const before = Date.now()
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer valid-jwt'},
		})
		const after = Date.now()
		const {expiresAt} = (await res.json()) as {expiresAt: number}
		const ttlMsLow = 300_000 - (after - before) - 1000
		const ttlMsHigh = 300_000 + 1000
		const observed = expiresAt - before
		expect(observed).toBeGreaterThanOrEqual(ttlMsLow)
		expect(observed).toBeLessThanOrEqual(ttlMsHigh)
	})

	test('6. Cookie-based LIVINITY_SESSION auth path works', async () => {
		await mountApp({
			verifyToken: vi.fn().mockResolvedValue({loggedIn: true, userId: 'bruce'}),
		})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Cookie: 'LIVINITY_SESSION=valid-cookie-jwt'},
		})
		expect(res.status).toBe(200)
		const {token} = (await res.json()) as {token: string}
		const verified = await verifyToken(token)
		expect(verified?.userId).toBe('bruce')
	})

	test('7. Legacy single-user payload {loggedIn:true} → userId="admin"', async () => {
		await mountApp({
			verifyToken: vi.fn().mockResolvedValue({loggedIn: true}),
		})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer legacy-jwt'},
		})
		expect(res.status).toBe(200)
		const {token} = (await res.json()) as {token: string}
		const verified = await verifyToken(token)
		expect(verified?.userId).toBe('admin')
	})

	test('8. Multi-user payload → userId from claim', async () => {
		await mountApp({
			verifyToken: vi.fn().mockResolvedValue({loggedIn: true, userId: 'guest-7', role: 'guest'}),
		})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer multi-user-jwt'},
		})
		expect(res.status).toBe(200)
		const {token} = (await res.json()) as {token: string}
		const verified = await verifyToken(token)
		expect(verified?.userId).toBe('guest-7')
	})

	test('9. Bearer header takes priority over cookie when both present', async () => {
		const verifyFn = vi.fn()
		verifyFn.mockImplementation(async (token: string) => {
			if (token === 'header-token') return {loggedIn: true, userId: 'from-header'}
			if (token === 'cookie-token') return {loggedIn: true, userId: 'from-cookie'}
			throw new Error('unknown token')
		})
		await mountApp({verifyToken: verifyFn})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {
				Authorization: 'Bearer header-token',
				Cookie: 'LIVINITY_SESSION=cookie-token',
			},
		})
		const {token} = (await res.json()) as {token: string}
		const verified = await verifyToken(token)
		expect(verified?.userId).toBe('from-header')
		expect(verifyFn).toHaveBeenCalledWith('header-token')
	})

	test('10. resolveUserId override is honored', async () => {
		await mountApp({
			verifyToken: vi.fn().mockResolvedValue({loggedIn: true, userId: 'ignored'}),
			resolveUserId: () => 'forced-by-override',
		})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer any-jwt'},
		})
		const {token} = (await res.json()) as {token: string}
		const verified = await verifyToken(token)
		expect(verified?.userId).toBe('forced-by-override')
	})

	test('11. resolveUserId returning empty string → 401', async () => {
		await mountApp({
			verifyToken: vi.fn().mockResolvedValue({loggedIn: true}),
			resolveUserId: () => '',
		})
		const res = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer any-jwt'},
		})
		expect(res.status).toBe(401)
		expect(await res.json()).toEqual({error: 'unauthorized'})
	})

	test('12. Replay (same JWT, two handshake calls) returns DIFFERENT tokens per T-203-02', async () => {
		await mountApp({
			verifyToken: vi.fn().mockResolvedValue({loggedIn: true, userId: 'admin'}),
		})
		const res1 = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer same-jwt'},
		})
		const res2 = await fetch(`${baseUrl}/openclawos/handshake`, {
			method: 'POST',
			headers: {Authorization: 'Bearer same-jwt'},
		})
		const b1 = (await res1.json()) as {token: string; sessionId: string}
		const b2 = (await res2.json()) as {token: string; sessionId: string}
		expect(b1.sessionId).not.toBe(b2.sessionId)
		expect(b1.token).not.toBe(b2.token)
	})

	test('13. Hot-fix F2 — master-token path returns gateway.auth.token from openclaw.json', async () => {
		// Write a fixture openclaw.json with gateway.auth.token
		const {writeFileSync} = await import('node:fs')
		const cfgPath = path.join(tmpDir, 'openclaw.json')
		const MASTER = 'master-secret-deadbeefcafebabe1234567890abcdef'
		writeFileSync(cfgPath, JSON.stringify({gateway: {auth: {token: MASTER}}}))

		// Mount the handler WITH openclawConfigPath pointing at the fixture
		const app = express()
		app.use(cookieParser())
		app.use(express.json())
		app.post(
			'/openclawos/handshake',
			createHandshakeRouteHandler({
				verifyToken: vi.fn().mockResolvedValue({loggedIn: true, userId: 'bruce'}),
				openclawConfigPath: cfgPath,
			}),
		)
		await new Promise<void>((resolve) => {
			server = app.listen(0, '127.0.0.1', () => resolve())
		})
		const addr = server!.address() as AddressInfo
		const url = `http://127.0.0.1:${addr.port}/openclawos/handshake`

		const res = await fetch(url, {method: 'POST', headers: {Authorization: 'Bearer x'}})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {token: string; expiresAt: number; sessionId: string}
		expect(body.token).toBe(MASTER) // returned verbatim, not a custom Ed25519 envelope
		expect(body.sessionId).toBe('master:bruce')
		expect(body.expiresAt).toBeGreaterThan(Date.now())
	})
})
