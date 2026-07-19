/**
 * Phase 346-02 (MCP-01) — liv_mcp_* auth gate tests (T1-T8-style, fail-closed).
 *
 * Mirrors bearer-auth.test.ts's mock style (vi.mock('node:crypto') pass-through
 * so timingSafeEqual is spyable; vi.mock('./keys-database.js') so the PG lookup
 * is a fake). This is a DEDICATED gate: T1/T2 REJECT (401), they do NOT fall
 * through. The gate NEVER touches getAdminUser/LIV_API_KEY — it authenticates
 * against mcp_control_keys only (T-346-07).
 */

import {createHash} from 'node:crypto'
import * as crypto from 'node:crypto'

import {beforeEach, describe, expect, test, vi} from 'vitest'
import type {NextFunction, Request, Response} from 'express'

// ESM namespace exports for node:* built-ins are non-configurable, so
// vi.spyOn(crypto, 'timingSafeEqual') (T8) would throw "Cannot redefine
// property". Re-mock with a pass-through plain object (redefinable) that still
// delegates to the real implementation. Same pattern as bearer-auth.test.ts.
vi.mock('node:crypto', async () => {
	const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
	return {...actual, default: actual}
})

const findMcpControlKeyByHashMock = vi.fn()

vi.mock('./keys-database.js', () => ({
	MCP_KEY_PLAINTEXT_PREFIX: 'liv_mcp_',
	hashMcpControlKey: (plaintext: string) =>
		createHash('sha256').update(plaintext, 'utf-8').digest('hex'),
	findMcpControlKeyByHash: (...args: unknown[]) =>
		findMcpControlKeyByHashMock(...args),
}))

// Import AFTER mock setup.
import {createMcpControlAuthMiddleware} from './auth-gate.js'

const logger = {
	debug: vi.fn(),
	error: vi.fn(),
}

function makeReq(authHeader?: string, apiKeyHeader?: string): Request {
	const headers: Record<string, string> = {}
	if (authHeader) headers.authorization = authHeader
	if (apiKeyHeader) headers['x-api-key'] = apiKeyHeader
	return {headers, params: {}} as unknown as Request
}

function makeRes() {
	const res = {
		statusCode: 200,
		_jsonBody: undefined as unknown,
		status(code: number) {
			res.statusCode = code
			return res
		},
		json(body: unknown) {
			res._jsonBody = body
			return res
		},
	}
	return res
}

const VALID_ROW = {
	id: 'mcp-key-1',
	keyPrefix: 'liv_mcp_',
	name: 'agent-a',
	createdBy: 'admin-1',
	createdAt: new Date(),
	lastUsedAt: null,
	revokedAt: null,
}

describe('mcp-control auth-gate (Phase 346-02)', () => {
	beforeEach(() => {
		findMcpControlKeyByHashMock.mockReset()
		logger.debug.mockReset()
		logger.error.mockReset()
	})

	test('T1 — no Authorization AND no x-api-key header → 401 (dedicated gate: reject, no fall-through)', async () => {
		const mw = createMcpControlAuthMiddleware({logger})
		const req = makeReq()
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
		expect(findMcpControlKeyByHashMock).not.toHaveBeenCalled()
	})

	test('T2 — header present but NOT liv_mcp_ prefix → 401', async () => {
		const mw = createMcpControlAuthMiddleware({logger})
		const req = makeReq('Bearer liv_sk_' + 'X'.repeat(32))
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
		expect(findMcpControlKeyByHashMock).not.toHaveBeenCalled()
	})

	test('T5 — PG lookup returns null (unknown) → 401', async () => {
		findMcpControlKeyByHashMock.mockResolvedValue(null)
		const mw = createMcpControlAuthMiddleware({logger})
		const plaintext = 'liv_mcp_' + 'Y'.repeat(32)
		const expectedHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(findMcpControlKeyByHashMock).toHaveBeenCalledWith(expectedHash)
		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
	})

	test('T7 — revoked key (findMcpControlKeyByHash null via revoked filter) → 401, indistinguishable from unknown', async () => {
		findMcpControlKeyByHashMock.mockResolvedValue(null)
		const mw = createMcpControlAuthMiddleware({logger})
		const plaintext = 'liv_mcp_' + 'R'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
		expect(res._jsonBody).toEqual({error: 'unauthorized', message: 'MCP control key invalid'})
	})

	test('valid active key (Bearer) → sets req.mcpKeyId/mcpKeyPrefix, calls next()', async () => {
		// The real DAO by-hash lookup carries key_hash internally (WARN-01); the row
		// found by `key_hash = $1` always has keyHash == the hash we searched by, so
		// mirror that here → the fail-closed constant-time compare passes.
		findMcpControlKeyByHashMock.mockImplementation((hash: string) =>
			Promise.resolve({...VALID_ROW, keyHash: hash}),
		)
		const mw = createMcpControlAuthMiddleware({logger})
		const plaintext = 'liv_mcp_' + 'Z'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(next).toHaveBeenCalledTimes(1)
		const r = req as Request & {mcpKeyId?: string; mcpKeyPrefix?: string}
		expect(r.mcpKeyId).toBe('mcp-key-1')
		expect(r.mcpKeyPrefix).toBe('liv_mcp_')
		expect(res.statusCode).toBe(200)
	})

	test('valid active key via x-api-key header (no Authorization) → next()', async () => {
		// The real DAO by-hash lookup carries key_hash internally (WARN-01); the row
		// found by `key_hash = $1` always has keyHash == the hash we searched by, so
		// mirror that here → the fail-closed constant-time compare passes.
		findMcpControlKeyByHashMock.mockImplementation((hash: string) =>
			Promise.resolve({...VALID_ROW, keyHash: hash}),
		)
		const mw = createMcpControlAuthMiddleware({logger})
		const plaintext = 'liv_mcp_' + 'A'.repeat(32)
		const expectedHash = createHash('sha256').update(plaintext, 'utf-8').digest('hex')
		const req = makeReq(undefined, plaintext)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(findMcpControlKeyByHashMock).toHaveBeenCalledWith(expectedHash)
		expect(next).toHaveBeenCalledTimes(1)
		expect((req as Request & {mcpKeyId?: string}).mcpKeyId).toBe('mcp-key-1')
	})

	test('T8 — constant-time compare via crypto.timingSafeEqual on a valid key', async () => {
		const spy = vi.spyOn(crypto, 'timingSafeEqual')
		// The real DAO by-hash lookup carries key_hash internally (WARN-01); the row
		// found by `key_hash = $1` always has keyHash == the hash we searched by, so
		// mirror that here → the fail-closed constant-time compare passes.
		findMcpControlKeyByHashMock.mockImplementation((hash: string) =>
			Promise.resolve({...VALID_ROW, keyHash: hash}),
		)
		const mw = createMcpControlAuthMiddleware({logger})
		const plaintext = 'liv_mcp_' + 'S'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(spy).toHaveBeenCalled()
		expect(next).toHaveBeenCalledTimes(1)
		spy.mockRestore()
	})

	test('PG throw → fail-closed 401 (never a 500 stack to the caller)', async () => {
		findMcpControlKeyByHashMock.mockRejectedValue(new Error('connection refused'))
		const mw = createMcpControlAuthMiddleware({logger})
		const plaintext = 'liv_mcp_' + 'P'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
		expect(logger.error).toHaveBeenCalled()
	})

	test('never logs the plaintext token (only keyPrefix at debug)', async () => {
		// The real DAO by-hash lookup carries key_hash internally (WARN-01); the row
		// found by `key_hash = $1` always has keyHash == the hash we searched by, so
		// mirror that here → the fail-closed constant-time compare passes.
		findMcpControlKeyByHashMock.mockImplementation((hash: string) =>
			Promise.resolve({...VALID_ROW, keyHash: hash}),
		)
		const mw = createMcpControlAuthMiddleware({logger})
		const plaintext = 'liv_mcp_' + 'T'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		const allLogged = [
			...logger.debug.mock.calls,
			...logger.error.mock.calls,
		]
			.flat()
			.map((a) => String(a))
			.join(' ')
		expect(allLogged).not.toContain(plaintext)
		expect(allLogged).not.toContain('T'.repeat(32))
	})

	test('WARN-01 — row whose keyHash != presentedHash is REJECTED (real fail-closed compare, not a self-compare)', async () => {
		// A row surfaced with a NON-matching hash (e.g. a future refactor fetching
		// by a non-hash column) must NOT authenticate — the constant-time compare is
		// a genuine gate, not a tautology.
		findMcpControlKeyByHashMock.mockResolvedValue({
			...VALID_ROW,
			keyHash: 'f'.repeat(64), // deliberately != sha256(presented)
		})
		const mw = createMcpControlAuthMiddleware({logger})
		const plaintext = 'liv_mcp_' + 'M'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
	})

	test('WARN-01 — row with NO keyHash fails CLOSED (missing hash → 401, never authenticates)', async () => {
		// Guards the future-refactor footgun: a row that carries no key_hash must be
		// rejected, not fall back to comparing the presented hash against itself.
		findMcpControlKeyByHashMock.mockResolvedValue({...VALID_ROW}) // no keyHash field
		const mw = createMcpControlAuthMiddleware({logger})
		const plaintext = 'liv_mcp_' + 'N'.repeat(32)
		const req = makeReq(`Bearer ${plaintext}`)
		const res = makeRes()
		const next = vi.fn() as unknown as NextFunction

		await mw(req, res as unknown as Response, next)

		expect(next).not.toHaveBeenCalled()
		expect(res.statusCode).toBe(401)
	})
})
