/**
 * Phase 234-04 — liv-login-handler unit tests.
 *
 * Strategy: stand up a tiny `http.createServer` mock listening on 127.0.0.1
 * to impersonate the AionUi loopback at port 3020. Because the handler
 * source hard-codes `http://127.0.0.1:3020` as the AionUi loopback target,
 * we cannot rebind the port dynamically without leaking listeners — so we
 * spin a real listener on a random port AND patch global fetch to redirect
 * matching URLs to that mock port (cleanest single-test pattern that keeps
 * the handler source unchanged).
 *
 * Coverage (per Plan 234-04 LOCKED spec):
 *   1. Flag missing -> enabled (302 + Set-Cookie forwarded)
 *   2. Flag = 'true' -> enabled
 *   3. Flag = 'false' -> disabled (302 to /liv/, no qr-token fetch)
 *   4. Flag = 'TRUE' or other -> enabled (non-'false' = enabled)
 *   5. qr-token mint failure -> safety hatch redirect to /liv/ without throw
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import type {Redis} from 'ioredis'
import type {Request, Response} from 'express'
import {createServer, type Server} from 'node:http'
import {AddressInfo} from 'node:net'

import {makeLivLoginHandler} from './liv-login-handler.js'

interface MockResponse {
	statusCode?: number
	headers: Record<string, string | string[]>
	redirectArg?: [number, string]
}

function makeRes(): {res: Response; out: MockResponse} {
	const out: MockResponse = {headers: {}}
	const res = {
		setHeader: vi.fn((name: string, value: string | string[]) => {
			out.headers[name.toLowerCase()] = value
		}),
		redirect: vi.fn((status: number, location: string) => {
			out.redirectArg = [status, location]
			out.statusCode = status
		}),
	} as unknown as Response
	return {res, out}
}

function makeReq(): Request {
	return {} as Request
}

function makeRedis(flagValue: string | null): Redis {
	return {
		get: vi.fn(async (_key: string) => flagValue),
	} as unknown as Redis
}

interface MockAionUiState {
	qrTokenCalls: number
	qrLoginCalls: number
	qrTokenStatus: number
	qrLoginStatus: number
	qrTokenBody: unknown
	qrLoginSetCookie: string | null
}

function makeMockAionUi(state: MockAionUiState): Promise<{server: Server; port: number}> {
	return new Promise((resolve, reject) => {
		const server = createServer((req, res) => {
			if (req.url === '/api/webui/generate-qr-token' && req.method === 'POST') {
				state.qrTokenCalls++
				res.statusCode = state.qrTokenStatus
				res.setHeader('Content-Type', 'application/json')
				res.end(JSON.stringify(state.qrTokenBody))
				return
			}
			if (req.url === '/api/auth/qr-login' && req.method === 'POST') {
				state.qrLoginCalls++
				res.statusCode = state.qrLoginStatus
				if (state.qrLoginSetCookie) {
					res.setHeader('Set-Cookie', state.qrLoginSetCookie)
				}
				res.setHeader('Content-Type', 'application/json')
				res.end(JSON.stringify({success: true}))
				return
			}
			res.statusCode = 404
			res.end()
		})
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address() as AddressInfo
			resolve({server, port: addr.port})
		})
		server.on('error', reject)
	})
}

const ORIGINAL_FETCH = globalThis.fetch
let mockState: MockAionUiState
let mockServer: Server | undefined

beforeEach(async () => {
	mockState = {
		qrTokenCalls: 0,
		qrLoginCalls: 0,
		qrTokenStatus: 200,
		qrLoginStatus: 200,
		qrTokenBody: {success: true, data: {token: 'fake-qr-token-abc123', expires_at_ms: Date.now() + 60_000}},
		qrLoginSetCookie: 'aionui-session=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.fake.signature; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
	}
	const {server, port} = await makeMockAionUi(mockState)
	mockServer = server
	// Patch global fetch to redirect 127.0.0.1:3020 calls to our mock port
	globalThis.fetch = (async (input: string | URL | {url: string}, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
		const rewritten = url.replace('http://127.0.0.1:3020', `http://127.0.0.1:${port}`)
		return ORIGINAL_FETCH(rewritten, init)
	}) as typeof fetch
})

afterEach(async () => {
	globalThis.fetch = ORIGINAL_FETCH
	if (mockServer) {
		await new Promise<void>((resolve) => mockServer!.close(() => resolve()))
		mockServer = undefined
	}
})

describe('liv-login-handler', () => {
	it('Test 1: flag missing -> enabled (302 + Set-Cookie forwarded)', async () => {
		const handler = makeLivLoginHandler(makeRedis(null))
		const {res, out} = makeRes()
		await handler(makeReq(), res)
		expect(mockState.qrTokenCalls).toBe(1)
		expect(mockState.qrLoginCalls).toBe(1)
		expect(out.redirectArg).toEqual([302, '/liv/'])
		expect(out.headers['set-cookie']).toContain('aionui-session=')
		expect(out.headers['set-cookie']).toContain('HttpOnly')
		expect(out.headers['set-cookie']).toContain('Path=/')
	})

	it("Test 2: flag = 'true' -> enabled", async () => {
		const handler = makeLivLoginHandler(makeRedis('true'))
		const {res, out} = makeRes()
		await handler(makeReq(), res)
		expect(mockState.qrTokenCalls).toBe(1)
		expect(mockState.qrLoginCalls).toBe(1)
		expect(out.redirectArg).toEqual([302, '/liv/'])
		expect(out.headers['set-cookie']).toContain('aionui-session=')
	})

	it("Test 3: flag = 'false' -> disabled (302 to /liv/, no qr-token fetch)", async () => {
		const handler = makeLivLoginHandler(makeRedis('false'))
		const {res, out} = makeRes()
		await handler(makeReq(), res)
		expect(mockState.qrTokenCalls).toBe(0)
		expect(mockState.qrLoginCalls).toBe(0)
		expect(out.redirectArg).toEqual([302, '/liv/'])
		expect(out.headers['set-cookie']).toBeUndefined()
	})

	it("Test 4: flag = 'TRUE' or other value -> enabled (non-'false' = enabled)", async () => {
		// 'TRUE' (uppercase) is NOT 'false' -> should be enabled per the
		// "non-'false' = enabled" semantic. Same for arbitrary garbage.
		const handler = makeLivLoginHandler(makeRedis('TRUE'))
		const {res, out} = makeRes()
		await handler(makeReq(), res)
		expect(mockState.qrTokenCalls).toBe(1)
		expect(mockState.qrLoginCalls).toBe(1)
		expect(out.redirectArg).toEqual([302, '/liv/'])
		expect(out.headers['set-cookie']).toContain('aionui-session=')
	})

	it('Test 5: qr-token mint failure -> safety hatch redirect to /liv/ without throw', async () => {
		mockState.qrTokenStatus = 500
		mockState.qrTokenBody = {error: 'boom'}
		const handler = makeLivLoginHandler(makeRedis(null))
		const {res, out} = makeRes()
		// Must NOT throw — handler is supposed to swallow + redirect
		await expect(handler(makeReq(), res)).resolves.toBeUndefined()
		expect(mockState.qrTokenCalls).toBe(1)
		expect(mockState.qrLoginCalls).toBe(0)
		expect(out.redirectArg).toEqual([302, '/liv/'])
		// No Set-Cookie header on safety-hatch path
		expect(out.headers['set-cookie']).toBeUndefined()
	})

	it('Test 6: qr-login returns no Set-Cookie -> safety hatch redirect', async () => {
		mockState.qrLoginSetCookie = null
		const handler = makeLivLoginHandler(makeRedis(null))
		const {res, out} = makeRes()
		await expect(handler(makeReq(), res)).resolves.toBeUndefined()
		expect(mockState.qrTokenCalls).toBe(1)
		expect(mockState.qrLoginCalls).toBe(1)
		expect(out.redirectArg).toEqual([302, '/liv/'])
		expect(out.headers['set-cookie']).toBeUndefined()
	})
})
