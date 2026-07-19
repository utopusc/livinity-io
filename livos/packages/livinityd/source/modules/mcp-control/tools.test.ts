/**
 * Phase 346-03 Task 1 — tools.ts tests (offline; no network).
 *
 * Proves the security-load-bearing behaviors of the 10 /trpc-client tools:
 *   - the allowlist chokepoint refuses a non-listed procedure BEFORE any fetch
 *   - every fetch carries X-Api-Key (auth) AND X-Mcp-Key-Id (attribution)
 *   - query vs mutation URL/method shape (no-input query, input query, POST)
 *   - non-2xx → the tool returns {isError:true}, never throws out
 *   - EXACTLY 10 tools registered, names === Object.keys(TOOL_PROCEDURE_MAP)
 *   - env-incomplete → every tool fails closed with an operator-readable error
 */

import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
import {describe, expect, test, vi} from 'vitest'

import {TOOL_PROCEDURE_MAP} from './allowlist.js'
import {
	MCP_ACT_TIMEOUT_MS,
	MCP_QUERY_TIMEOUT_MS,
	callTrpcProcedure,
	registerMcpControlTools,
	type McpToolDeps,
} from './tools.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

function okResponse(data: unknown): Response {
	return {
		ok: true,
		status: 200,
		json: async () => ({result: {data}}),
	} as unknown as Response
}

function errResponse(status: number): Response {
	return {
		ok: false,
		status,
		json: async () => ({}),
	} as unknown as Response
}

const silentLogger = {debug: vi.fn(), error: vi.fn()}

/** Typed fetch mock so `.mock.calls[0]` destructures as [url, init]. */
function fetchMock(
	impl: (url: string, init?: RequestInit) => Promise<Response>,
) {
	return vi.fn(impl)
}

function baseDeps(overrides: Partial<McpToolDeps> = {}): McpToolDeps {
	return {
		apiUrl: 'http://127.0.0.1:8080',
		apiKey: 'LIV_API_KEY_SECRET',
		logger: silentLogger,
		mcpKeyId: 'mcpkey-123',
		fetchImpl: fetchMock(async () => okResponse({ok: true})) as unknown as typeof fetch,
		...overrides,
	}
}

/** Fake McpServer capturing every registered tool + its handler. */
interface Captured {
	name: string
	description: string
	shape: Record<string, unknown>
	cb: (args: Record<string, unknown>) => Promise<{content: unknown[]; isError?: boolean}>
}
function makeFakeServer(): {server: McpServer; registered: Captured[]} {
	const registered: Captured[] = []
	const server = {
		tool: (
			name: string,
			description: string,
			shape: Record<string, unknown>,
			cb: Captured['cb'],
		) => {
			registered.push({name, description, shape, cb})
			return {}
		},
	} as unknown as McpServer
	return {server, registered}
}

// ─── callTrpcProcedure — the chokepoint ──────────────────────────────────────

describe('callTrpcProcedure — allowlist chokepoint (D-346-4)', () => {
	test('refuses a NON-allowlisted procedure BEFORE any fetch', async () => {
		const fetchImpl = vi.fn()
		const deps = baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch})
		await expect(
			callTrpcProcedure(deps, {procedure: 'apps.uninstall', method: 'mutation'}),
		).rejects.toThrow(/MCP_PROCEDURE_NOT_ALLOWLISTED/)
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	test('an agent-supplied arbitrary string never reaches fetch', async () => {
		const fetchImpl = vi.fn()
		const deps = baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch})
		await expect(
			callTrpcProcedure(deps, {procedure: 'user.deleteUser', method: 'mutation'}),
		).rejects.toThrow(/MCP_PROCEDURE_NOT_ALLOWLISTED/)
		expect(fetchImpl).not.toHaveBeenCalled()
	})
})

describe('callTrpcProcedure — headers + request shape', () => {
	test('query with NO input builds ?input= and carries both headers', async () => {
		const fetchImpl = fetchMock(async () => okResponse([]))
		const deps = baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch})
		await callTrpcProcedure(deps, {procedure: 'apps.list', method: 'query'})
		expect(fetchImpl).toHaveBeenCalledTimes(1)
		const [url, init] = fetchImpl.mock.calls[0]
		expect(url).toBe('http://127.0.0.1:8080/trpc/apps.list?input=')
		expect(init?.method).toBeUndefined() // GET
		expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('LIV_API_KEY_SECRET')
		expect((init?.headers as Record<string, string>)['X-Mcp-Key-Id']).toBe('mcpkey-123')
		expect(init?.signal).toBeInstanceOf(AbortSignal)
	})

	test('query WITH input urlencodes the JSON into ?input=', async () => {
		const fetchImpl = fetchMock(async () => okResponse({state: 'running'}))
		const deps = baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch})
		await callTrpcProcedure(deps, {
			procedure: 'apps.state',
			method: 'query',
			input: {appId: 'n8n'},
		})
		const [url] = fetchImpl.mock.calls[0]
		expect(url).toBe(
			`http://127.0.0.1:8080/trpc/apps.state?input=${encodeURIComponent(
				JSON.stringify({appId: 'n8n'}),
			)}`,
		)
	})

	test('mutation POSTs a JSON body with Content-Type + both headers', async () => {
		const fetchImpl = fetchMock(async () => okResponse({ok: true}))
		const deps = baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch})
		await callTrpcProcedure(deps, {
			procedure: 'apps.restart',
			method: 'mutation',
			input: {appId: 'n8n'},
			timeoutMs: MCP_ACT_TIMEOUT_MS,
		})
		const [url, init] = fetchImpl.mock.calls[0]
		expect(url).toBe('http://127.0.0.1:8080/trpc/apps.restart')
		expect(init?.method).toBe('POST')
		expect(init?.body).toBe(JSON.stringify({appId: 'n8n'}))
		const headers = init?.headers as Record<string, string>
		expect(headers['X-Api-Key']).toBe('LIV_API_KEY_SECRET')
		expect(headers['X-Mcp-Key-Id']).toBe('mcpkey-123')
		expect(headers['Content-Type']).toBe('application/json')
	})

	test('omits X-Mcp-Key-Id when no mcpKeyId is available', async () => {
		const fetchImpl = fetchMock(async () => okResponse([]))
		const deps = baseDeps({
			mcpKeyId: undefined,
			fetchImpl: fetchImpl as unknown as typeof fetch,
		})
		await callTrpcProcedure(deps, {procedure: 'apps.list', method: 'query'})
		const [, init] = fetchImpl.mock.calls[0]
		expect((init?.headers as Record<string, string>)['X-Mcp-Key-Id']).toBeUndefined()
	})

	test('unwraps result.data on success', async () => {
		const fetchImpl = fetchMock(async () => okResponse({cpu: 12}))
		const deps = baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch})
		const out = await callTrpcProcedure(deps, {
			procedure: 'system.cpuUsage',
			method: 'query',
		})
		expect(out).toEqual({cpu: 12})
	})

	test('non-2xx throws (handler converts to isError)', async () => {
		const fetchImpl = fetchMock(async () => errResponse(500))
		const deps = baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch})
		await expect(
			callTrpcProcedure(deps, {procedure: 'apps.list', method: 'query'}),
		).rejects.toThrow(/HTTP 500 from apps.list/)
	})
})

// ─── registerMcpControlTools ─────────────────────────────────────────────────

describe('registerMcpControlTools — 10-tool registration', () => {
	test('registers EXACTLY 10 tools; names === Object.keys(TOOL_PROCEDURE_MAP)', () => {
		const {server, registered} = makeFakeServer()
		registerMcpControlTools(server, baseDeps())
		expect(registered).toHaveLength(10)
		expect(registered.map((r) => r.name).sort()).toEqual(
			Object.keys(TOOL_PROCEDURE_MAP).sort(),
		)
	})

	test('appId-taking tools declare an appId zod shape; others take {}', () => {
		const {server, registered} = makeFakeServer()
		registerMcpControlTools(server, baseDeps())
		const byName = new Map(registered.map((r) => [r.name, r]))
		for (const t of ['app_state', 'app_start', 'app_stop', 'app_restart', 'app_logs']) {
			expect(Object.keys(byName.get(t)!.shape)).toContain('appId')
		}
		for (const t of [
			'apps_list',
			'system_cpu',
			'system_memory',
			'system_disk',
			'scheduler_list',
		]) {
			expect(Object.keys(byName.get(t)!.shape)).toHaveLength(0)
		}
	})

	test('apps_list description flags the default-credential exposure (WARN-2)', () => {
		const {server, registered} = makeFakeServer()
		registerMcpControlTools(server, baseDeps())
		const appsList = registered.find((r) => r.name === 'apps_list')!
		expect(appsList.description.toLowerCase()).toMatch(/credential|password/)
	})

	test('app_logs description flags the secret exposure (T-346-15)', () => {
		const {server, registered} = makeFakeServer()
		registerMcpControlTools(server, baseDeps())
		const appLogs = registered.find((r) => r.name === 'app_logs')!
		expect(appLogs.description.toLowerCase()).toMatch(/secret/)
	})
})

describe('registerMcpControlTools — handler routing + fail-closed', () => {
	test('apps_list handler hits /trpc/apps.list with both headers', async () => {
		const fetchImpl = fetchMock(async () => okResponse({apps: []}))
		const {server, registered} = makeFakeServer()
		registerMcpControlTools(
			server,
			baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch}),
		)
		const appsList = registered.find((r) => r.name === 'apps_list')!
		const out = await appsList.cb({})
		expect(out.isError).toBeFalsy()
		const [url, init] = fetchImpl.mock.calls[0]
		expect(url).toBe('http://127.0.0.1:8080/trpc/apps.list?input=')
		expect((init?.headers as Record<string, string>)['X-Mcp-Key-Id']).toBe('mcpkey-123')
	})

	test('app_restart handler POSTs to /trpc/apps.restart with the 60s act timeout', async () => {
		let capturedSignal: AbortSignal | undefined
		const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
			capturedSignal = init.signal as AbortSignal
			return okResponse({ok: true})
		})
		const {server, registered} = makeFakeServer()
		registerMcpControlTools(
			server,
			baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch}),
		)
		const appRestart = registered.find((r) => r.name === 'app_restart')!
		await appRestart.cb({appId: 'n8n'})
		const [url, init] = fetchImpl.mock.calls[0]
		expect(url).toBe('http://127.0.0.1:8080/trpc/apps.restart')
		expect(init?.method).toBe('POST')
		expect(capturedSignal).toBeInstanceOf(AbortSignal)
	})

	test('a handler returns {isError:true} on a non-2xx (never throws out)', async () => {
		const fetchImpl = fetchMock(async () => errResponse(503))
		const {server, registered} = makeFakeServer()
		registerMcpControlTools(
			server,
			baseDeps({fetchImpl: fetchImpl as unknown as typeof fetch}),
		)
		const appsList = registered.find((r) => r.name === 'apps_list')!
		const out = await appsList.cb({})
		expect(out.isError).toBe(true)
		expect(JSON.stringify(out.content)).toMatch(/HTTP 503/)
	})

	test('env-incomplete (no apiKey) → every tool fails closed, no fetch', async () => {
		const fetchImpl = vi.fn()
		const {server, registered} = makeFakeServer()
		registerMcpControlTools(
			server,
			baseDeps({apiKey: '', fetchImpl: fetchImpl as unknown as typeof fetch}),
		)
		const appsList = registered.find((r) => r.name === 'apps_list')!
		const out = await appsList.cb({})
		expect(out.isError).toBe(true)
		expect(JSON.stringify(out.content)).toMatch(/env-thread incomplete/)
		expect(fetchImpl).not.toHaveBeenCalled()
	})
})

describe('constants', () => {
	test('query timeout 10s, act timeout 60s (WARN-3)', () => {
		expect(MCP_QUERY_TIMEOUT_MS).toBe(10_000)
		expect(MCP_ACT_TIMEOUT_MS).toBe(60_000)
	})
})
