/**
 * Phase 241-02 — aionui-client.test.ts
 *
 * Unit tests for AionUiMcpClient — typed HTTP wrapper around the 5 probe-verified
 * AionUi MCP endpoints. Every test mocks globalThis.fetch via vi.stubGlobal +
 * vi.fn() so no real network I/O happens. The abort/timeout test uses fake
 * timers to deterministically trip the AbortController.
 *
 * Reference contracts:
 *   - .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §1 Endpoints A-G
 *     (every endpoint payload + response shape probe-verified 2026-05-27)
 *   - .planning/phases/241-mcp-auto-add-liv-tools/241-RESEARCH.md §Pitfalls 3 + 4
 *     (must NOT use /api/extensions/mcp-servers; must NOT pass enabled in create)
 */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {AionUiMcpClient} from '../aionui-client.js'
import type {AionUiCreateMcpServerRequest, AionUiServerRecord} from '../types.js'

const BASE_URL = 'http://127.0.0.1:3020'

/** Build a fake `Response` with a JSON body. */
function jsonResponse(body: unknown, init: {status?: number} = {}): Response {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: {'Content-Type': 'application/json'},
	})
}

describe('AionUiMcpClient', () => {
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	test('Test 1 — listServers happy path returns server array', async () => {
		const record: AionUiServerRecord = {
			id: 'mcp_x',
			name: 'luse',
			enabled: true,
			transport: {type: 'stdio', command: 'node'},
			status: 'connected',
			builtin: false,
			created_at: 1,
			updated_at: 2,
		}
		fetchMock.mockResolvedValueOnce(jsonResponse({success: true, data: [record]}))

		const client = new AionUiMcpClient(BASE_URL)
		const out = await client.listServers()
		expect(out).toEqual([record])
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(`${BASE_URL}/api/mcp/servers`)
		// listServers makes a GET — no method specified is fine, but if specified must be GET
		if (init && 'method' in init) {
			expect(init.method).toBeUndefined()
		}
	})

	test('Test 2 — listServers throws on success:false envelope', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({success: false, error: 'boom'}))
		const client = new AionUiMcpClient(BASE_URL)
		await expect(client.listServers()).rejects.toThrow(/listServers: boom/)
	})

	test('Test 3 — createServer happy path sends correct POST body + URL', async () => {
		const payload: AionUiCreateMcpServerRequest = {
			name: 'luse',
			transport: {type: 'stdio', command: 'node'},
			builtin: false,
		}
		const created: AionUiServerRecord = {
			id: 'mcp_a',
			name: 'luse',
			enabled: false,
			transport: {type: 'stdio', command: 'node'},
			status: 'disconnected',
			builtin: false,
			created_at: 1,
			updated_at: 1,
		}
		fetchMock.mockResolvedValueOnce(jsonResponse({success: true, data: created}, {status: 201}))

		const client = new AionUiMcpClient(BASE_URL)
		const out = await client.createServer(payload)
		expect(out).toEqual(created)
		expect(out.id).toBe('mcp_a')

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(`${BASE_URL}/api/mcp/servers`)
		expect(init.method).toBe('POST')
		expect(init.headers).toEqual({'Content-Type': 'application/json'})
		expect(init.body).toBe(JSON.stringify(payload))
	})

	test('Test 4 — createServer throws on non-2xx envelope with named context', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({success: false, error: 'name conflict'}, {status: 400}),
		)
		const client = new AionUiMcpClient(BASE_URL)
		await expect(
			client.createServer({
				name: 'luse',
				transport: {type: 'stdio', command: 'node'},
				builtin: false,
			}),
		).rejects.toThrow(/createServer\(luse\): name conflict/)
	})

	test('Test 5 — toggleServer hits /toggle URL with {enabled} body', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({success: true}))

		const client = new AionUiMcpClient(BASE_URL)
		await client.toggleServer('mcp_a', true)

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(`${BASE_URL}/api/mcp/servers/mcp_a/toggle`)
		expect(init.method).toBe('POST')
		expect(init.headers).toEqual({'Content-Type': 'application/json'})
		expect(init.body).toBe(JSON.stringify({enabled: true}))
	})

	test('Test 6 — syncToAgents posts {servers: string[]} to correct URL', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: {
					success: true,
					results: [
						{agent: 'claude', success: true},
						{agent: 'gemini', success: true},
					],
				},
			}),
		)
		const client = new AionUiMcpClient(BASE_URL)
		const result = await client.syncToAgents(['luse', 'liv-docker'])

		expect(result.success).toBe(true)
		expect(result.results).toHaveLength(2)

		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(`${BASE_URL}/api/mcp/sync-to-agents`)
		expect(init.method).toBe('POST')
		expect(init.body).toBe(JSON.stringify({servers: ['luse', 'liv-docker']}))
	})

	test('Test 7 — syncToAgents exposes partial agent failure (does NOT throw)', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				success: true,
				data: {
					success: true,
					results: [
						{agent: 'claude', success: true},
						{agent: 'codex', success: false, error: 'EACCES'},
					],
				},
			}),
		)
		const client = new AionUiMcpClient(BASE_URL)
		const result = await client.syncToAgents(['luse'])

		expect(result.results).toHaveLength(2)
		const codex = result.results.find((r) => r.agent === 'codex')
		expect(codex).toBeDefined()
		expect(codex?.success).toBe(false)
		expect(codex?.error).toBe('EACCES')
	})

	test('Test 8 — findByName returns the matching record or null', async () => {
		const record: AionUiServerRecord = {
			id: 'mcp_y',
			name: 'luse',
			enabled: false,
			transport: {type: 'stdio', command: 'node'},
			status: 'disconnected',
			builtin: false,
			created_at: 1,
			updated_at: 1,
		}
		// First call — name present
		fetchMock.mockResolvedValueOnce(jsonResponse({success: true, data: [record]}))
		const client = new AionUiMcpClient(BASE_URL)
		const hit = await client.findByName('luse')
		expect(hit).toEqual(record)

		// Second call — name absent
		fetchMock.mockResolvedValueOnce(jsonResponse({success: true, data: [record]}))
		const miss = await client.findByName('does-not-exist')
		expect(miss).toBeNull()
	})

	test('Test 9 — per-call AbortController fires when fetch hangs past timeout', async () => {
		// fetch never resolves on its own, but reads ctrl.signal — we reject on abort.
		fetchMock.mockImplementationOnce((_url, init: RequestInit) => {
			return new Promise((_resolve, reject) => {
				const signal = init.signal
				if (signal) {
					signal.addEventListener('abort', () => {
						const err = new Error('aborted')
						;(err as Error & {name: string}).name = 'AbortError'
						reject(err)
					})
				}
			})
		})

		const client = new AionUiMcpClient(BASE_URL, 50)
		const promise = client.listServers()

		// Use real timers — keep the AbortController setTimeout natural.
		await expect(promise).rejects.toThrow(/abort/i)
	})
})
