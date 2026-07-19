/**
 * Phase 346-03 Task 2 — server.ts tests (offline; no live MCP client).
 *
 * Proves the transport hardening invariants:
 *   - MCP_CONTROL_DEFAULT_HOST === '127.0.0.1'; path is neither '/api/mcp' nor '/mcp'
 *   - start() binds 127.0.0.1 (ephemeral port-0 real bind → address().address)
 *   - WARN-1: a non-loopback host throws at construction
 *   - isEnabled()=false → 404, and the tool registrar is NEVER exercised (inert)
 *   - the auth gate runs BEFORE the transport (no liv_mcp_ key → 401 from the gate)
 *   - server name is 'liv-control'; stop() is idempotent
 */

import {afterEach, describe, expect, test, vi} from 'vitest'

import {
	MCP_CONTROL_DEFAULT_HOST,
	MCP_CONTROL_ROUTE_PATH,
	MCP_CONTROL_SERVER_NAME,
	createMcpControlServer,
	type CreateMcpControlServerOptions,
	type McpControlServerHandle,
} from './server.js'

const silentLogger = {
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
}

function baseOpts(
	overrides: Partial<CreateMcpControlServerOptions> = {},
): CreateMcpControlServerOptions {
	return {
		isEnabled: () => true,
		apiUrl: 'http://127.0.0.1:8080',
		apiKey: 'LIV_API_KEY',
		logger: silentLogger,
		port: 0, // ephemeral — never collide with a real port in CI
		...overrides,
	}
}

const handles: McpControlServerHandle[] = []
function track(h: McpControlServerHandle): McpControlServerHandle {
	handles.push(h)
	return h
}

afterEach(async () => {
	while (handles.length) {
		await handles.pop()!.stop()
	}
})

// ─── constants ───────────────────────────────────────────────────────────────

describe('server constants (D-346-5 / D-346-9)', () => {
	test('MCP_CONTROL_DEFAULT_HOST is the loopback literal, never 0.0.0.0', () => {
		expect(MCP_CONTROL_DEFAULT_HOST).toBe('127.0.0.1')
		expect(MCP_CONTROL_DEFAULT_HOST as string).not.toBe('0.0.0.0')
	})

	test('route path is distinct — not /api/mcp, not /mcp', () => {
		expect(MCP_CONTROL_ROUTE_PATH).not.toBe('/api/mcp')
		expect(MCP_CONTROL_ROUTE_PATH).not.toBe('/mcp')
		expect(MCP_CONTROL_ROUTE_PATH.startsWith('/')).toBe(true)
	})

	test('server name is liv-control (not nexus, not a SYSTEM_MCP_NAME)', () => {
		expect(MCP_CONTROL_SERVER_NAME).toBe('liv-control')
	})
})

// ─── WARN-1 loopback hard-assert ─────────────────────────────────────────────

describe('WARN-1 — non-loopback host throws at construction', () => {
	test('host 0.0.0.0 throws', () => {
		expect(() => createMcpControlServer(baseOpts({host: '0.0.0.0'}))).toThrow(
			/loopback/i,
		)
	})

	test('a public IP host throws', () => {
		expect(() => createMcpControlServer(baseOpts({host: '10.69.31.68'}))).toThrow(
			/loopback/i,
		)
	})

	test('loopback literals are accepted', () => {
		for (const host of ['127.0.0.1', 'localhost', '::1']) {
			expect(() => createMcpControlServer(baseOpts({host}))).not.toThrow()
		}
	})
})

// ─── loopback bind proof ─────────────────────────────────────────────────────

describe('start() binds 127.0.0.1 only', () => {
	test('the bound address is 127.0.0.1', async () => {
		const handle = track(createMcpControlServer(baseOpts()))
		await handle.start()
		expect(handle.isListening()).toBe(true)
		const addr = handle.address()
		expect(addr).not.toBeNull()
		expect(addr!.address).toBe('127.0.0.1')
		expect(addr!.address).not.toBe('0.0.0.0')
	})

	test('stop() is idempotent and leaves the listener closed', async () => {
		const handle = track(createMcpControlServer(baseOpts()))
		await handle.start()
		await handle.stop()
		expect(handle.isListening()).toBe(false)
		await expect(handle.stop()).resolves.toBeUndefined() // second stop → no throw
	})
})

// ─── default-off inertness ───────────────────────────────────────────────────

describe('isEnabled()=false → inert (404, registrar never runs)', () => {
	test('a POST to the route → 404 and registerTools is NEVER called', async () => {
		const registerTools = vi.fn()
		const handle = track(
			createMcpControlServer(
				baseOpts({isEnabled: () => false, registerTools}),
			),
		)
		await handle.start()
		const {port} = handle.address()!
		const res = await fetch(`http://127.0.0.1:${port}${MCP_CONTROL_ROUTE_PATH}`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json', 'x-api-key': 'liv_mcp_whatever'},
			body: JSON.stringify({jsonrpc: '2.0', method: 'initialize', id: 1}),
		})
		expect(res.status).toBe(404)
		expect(registerTools).not.toHaveBeenCalled()
	})
})

// ─── auth gate runs before transport ─────────────────────────────────────────

describe('auth gate mounted BEFORE the transport', () => {
	test('enabled + no liv_mcp_ key → 401 from the gate (not a transport error)', async () => {
		const registerTools = vi.fn()
		const handle = track(
			createMcpControlServer(
				baseOpts({
					isEnabled: () => true,
					registerTools,
					// findByHash never reached: T1 (no key) rejects before any lookup.
					findByHash: vi.fn(async () => null),
				}),
			),
		)
		await handle.start()
		const {port} = handle.address()!
		const res = await fetch(`http://127.0.0.1:${port}${MCP_CONTROL_ROUTE_PATH}`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({jsonrpc: '2.0', method: 'initialize', id: 1}),
		})
		expect(res.status).toBe(401)
		const body = (await res.json()) as {error?: string}
		expect(body.error).toBe('unauthorized')
		// The transport was never reached → the tool registrar never ran.
		expect(registerTools).not.toHaveBeenCalled()
	})

	test('a custom auth middleware is honored and runs after the enabled gate', async () => {
		const authMiddleware = vi.fn((_req, res, _next) => {
			res.status(418).json({gate: 'ran'})
		})
		const handle = track(
			createMcpControlServer(baseOpts({authMiddleware})),
		)
		await handle.start()
		const {port} = handle.address()!
		const res = await fetch(`http://127.0.0.1:${port}${MCP_CONTROL_ROUTE_PATH}`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({jsonrpc: '2.0', method: 'initialize', id: 1}),
		})
		expect(res.status).toBe(418)
		expect(authMiddleware).toHaveBeenCalledTimes(1)
	})

	test('disabled short-circuits BEFORE the auth middleware (404, gate never runs)', async () => {
		const authMiddleware = vi.fn((_req, _res, next) => next())
		const handle = track(
			createMcpControlServer(baseOpts({isEnabled: () => false, authMiddleware})),
		)
		await handle.start()
		const {port} = handle.address()!
		const res = await fetch(`http://127.0.0.1:${port}${MCP_CONTROL_ROUTE_PATH}`, {
			method: 'POST',
			headers: {'Content-Type': 'application/json', 'x-api-key': 'liv_mcp_x'},
			body: JSON.stringify({jsonrpc: '2.0', method: 'initialize', id: 1}),
		})
		expect(res.status).toBe(404)
		expect(authMiddleware).not.toHaveBeenCalled()
	})
})
