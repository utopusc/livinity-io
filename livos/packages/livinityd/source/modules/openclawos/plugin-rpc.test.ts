/**
 * Phase 203-06 Task 1 — plugin-rpc tests.
 *
 * Covers ≥5 cases per Plan Task 1 done-criteria:
 *   1. Missing X-Internal-Plugin-Token → 403 FORBIDDEN
 *   2. Wrong token → 403 FORBIDDEN
 *   3. Missing LIV_PLUGIN_TOKEN env → 503 PLUGIN_TOKEN_UNCONFIGURED
 *   4. Unknown method → 404 METHOD_NOT_FOUND
 *   5. luse.invoke happy path → 200 {ok:true, result}
 *
 * Plus:
 *   6. luse.invoke missing toolName → 400 BAD_REQUEST
 *   7. builtin.invoke unknown tool → 404 TOOL_NOT_FOUND
 *   8. builtin.invoke happy path (weather mock) → 200 {ok:true, result}
 *   9. builtin.list → returns BUILT_IN_TOOL_CATALOG
 *  10. luse.list → returns tools with destructive flag
 *  11. approval.request approved → 200 {ok:true, result:{decision:'approved'}}
 *  12. approval.request rejected → 200 {ok:true, result:{decision:'rejected'}}
 */

import express from 'express'
import type {AddressInfo} from 'node:net'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ApprovalManager} from '../agent-runtime/approval-manager.js'
import {
	createPluginRpcHandler,
	type LusePluginRpcMcp,
	type BuiltInToolExecutable,
	type BuiltInToolEntry,
} from './plugin-rpc.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let server: any = null
let baseUrl = ''

afterEach(async () => {
	if (server) {
		await new Promise<void>((resolve) => server!.close(() => resolve()))
		server = null
	}
})

async function mountApp(opts: Parameters<typeof createPluginRpcHandler>[0]) {
	const app = express()
	app.use(express.json())
	app.post('/openclawos/plugin-rpc', createPluginRpcHandler(opts))
	await new Promise<void>((resolve) => {
		server = app.listen(0, '127.0.0.1', () => resolve())
	})
	const addr = server!.address() as AddressInfo
	baseUrl = `http://127.0.0.1:${addr.port}`
}

const CATALOG: readonly BuiltInToolEntry[] = [
	{id: 'weather', name: 'Weather', description: 'wx', destructive: false, category: 'data'},
	{
		id: 'luse_computer_click_mouse',
		name: 'Click',
		description: 'click',
		destructive: true,
		category: 'computer-use',
	},
]

function makeWeatherTool(): BuiltInToolExecutable {
	return {
		execute: async ({context}) => ({echo: context, temperature: 21}),
	}
}

function makeMcp(): LusePluginRpcMcp {
	return {
		callTool: vi.fn(async ({name}) => ({
			content: [{type: 'text', text: `ok:${name}`}],
			isError: false,
		})),
		getServerTools: vi.fn(async () => ({
			luse_computer_screenshot: {
				description: 'capture screen',
				parameters: {type: 'object'},
			},
			luse_computer_click_mouse: {
				description: 'click',
				parameters: {type: 'object'},
				meta: {requireApproval: true},
			},
		})),
	}
}

describe('createPluginRpcHandler', () => {
	test('missing X-Internal-Plugin-Token → 403 FORBIDDEN', async () => {
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp: makeMcp(),
			builtInTools: {weather: makeWeatherTool()},
			builtInCatalog: CATALOG,
			expectedToken: () => 'secret',
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {'content-type': 'application/json'},
			body: JSON.stringify({method: 'builtin.list', args: {}}),
		})
		expect(res.status).toBe(403)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('FORBIDDEN')
	})

	test('wrong X-Internal-Plugin-Token → 403 FORBIDDEN', async () => {
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp: makeMcp(),
			builtInTools: {},
			builtInCatalog: CATALOG,
			expectedToken: () => 'secret',
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'WRONG',
			},
			body: JSON.stringify({method: 'builtin.list', args: {}}),
		})
		expect(res.status).toBe(403)
	})

	test('missing expected token env → 503 PLUGIN_TOKEN_UNCONFIGURED', async () => {
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp: makeMcp(),
			builtInTools: {},
			builtInCatalog: CATALOG,
			expectedToken: () => undefined,
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'whatever',
			},
			body: JSON.stringify({method: 'builtin.list', args: {}}),
		})
		expect(res.status).toBe(503)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('PLUGIN_TOKEN_UNCONFIGURED')
	})

	test('unknown method → 404 METHOD_NOT_FOUND', async () => {
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp: makeMcp(),
			builtInTools: {},
			builtInCatalog: CATALOG,
			expectedToken: () => 'tk',
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'tk',
			},
			body: JSON.stringify({method: 'does.not.exist', args: {}}),
		})
		expect(res.status).toBe(404)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('METHOD_NOT_FOUND')
	})

	test('luse.invoke happy path → 200 {ok:true, result}', async () => {
		const mcp = makeMcp()
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp,
			builtInTools: {},
			builtInCatalog: CATALOG,
			expectedToken: () => 'tk',
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'tk',
			},
			body: JSON.stringify({
				method: 'luse.invoke',
				args: {toolName: 'luse_computer_screenshot', args: {}},
			}),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {ok: boolean; result?: unknown}
		expect(body.ok).toBe(true)
		expect(body.result).toMatchObject({
			content: [{type: 'text', text: 'ok:luse_computer_screenshot'}],
		})
		expect(mcp.callTool).toHaveBeenCalledWith({
			serverName: 'luse',
			name: 'luse_computer_screenshot',
			args: {},
		})
	})

	test('luse.invoke missing toolName → 400 BAD_REQUEST', async () => {
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp: makeMcp(),
			builtInTools: {},
			builtInCatalog: CATALOG,
			expectedToken: () => 'tk',
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'tk',
			},
			body: JSON.stringify({method: 'luse.invoke', args: {}}),
		})
		expect(res.status).toBe(400)
	})

	test('builtin.invoke unknown tool → 404 TOOL_NOT_FOUND', async () => {
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp: makeMcp(),
			builtInTools: {weather: makeWeatherTool()},
			builtInCatalog: CATALOG,
			expectedToken: () => 'tk',
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'tk',
			},
			body: JSON.stringify({
				method: 'builtin.invoke',
				args: {toolName: 'nonexistent', args: {}},
			}),
		})
		expect(res.status).toBe(404)
		const body = (await res.json()) as {error: string}
		expect(body.error).toBe('TOOL_NOT_FOUND')
	})

	test('builtin.invoke happy path forwards args via context', async () => {
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp: makeMcp(),
			builtInTools: {weather: makeWeatherTool()},
			builtInCatalog: CATALOG,
			expectedToken: () => 'tk',
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'tk',
			},
			body: JSON.stringify({
				method: 'builtin.invoke',
				args: {toolName: 'weather', args: {location: 'Istanbul'}},
			}),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {ok: boolean; result: {echo: {location: string}}}
		expect(body.ok).toBe(true)
		expect(body.result.echo.location).toBe('Istanbul')
	})

	test('builtin.list returns the catalog', async () => {
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp: makeMcp(),
			builtInTools: {},
			builtInCatalog: CATALOG,
			expectedToken: () => 'tk',
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'tk',
			},
			body: JSON.stringify({method: 'builtin.list', args: {}}),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {ok: boolean; result: {tools: BuiltInToolEntry[]}}
		expect(body.ok).toBe(true)
		expect(body.result.tools).toHaveLength(2)
		expect(body.result.tools[0]).toMatchObject({id: 'weather', destructive: false})
	})

	test('luse.list surfaces destructive flag', async () => {
		await mountApp({
			approvalManager: new ApprovalManager(),
			mcp: makeMcp(),
			builtInTools: {},
			builtInCatalog: CATALOG,
			expectedToken: () => 'tk',
		})
		const res = await fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'tk',
			},
			body: JSON.stringify({method: 'luse.list', args: {}}),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			ok: boolean
			result: {tools: Array<{name: string; destructive: boolean}>}
		}
		expect(body.ok).toBe(true)
		const click = body.result.tools.find((t) => t.name === 'luse_computer_click_mouse')
		expect(click?.destructive).toBe(true)
		const shot = body.result.tools.find((t) => t.name === 'luse_computer_screenshot')
		expect(shot?.destructive).toBe(false)
	})

	test('approval.request approved → decision:approved', async () => {
		const am = new ApprovalManager()
		await mountApp({
			approvalManager: am,
			mcp: makeMcp(),
			builtInTools: {},
			builtInCatalog: CATALOG,
			expectedToken: () => 'tk',
		})
		const reqP = fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'tk',
			},
			body: JSON.stringify({
				method: 'approval.request',
				args: {toolName: 'luse_computer_click_mouse', toolCallId: 'tc-1', agentId: 'a-1'},
			}),
		})
		// Resolve the pending approval after a tick so the route is awaiting.
		await new Promise((r) => setTimeout(r, 50))
		am.resolve('tc-1', true)
		const res = await reqP
		expect(res.status).toBe(200)
		const body = (await res.json()) as {
			ok: boolean
			result: {decision: string; toolCallId: string}
		}
		expect(body.ok).toBe(true)
		expect(body.result.decision).toBe('approved')
		expect(body.result.toolCallId).toBe('tc-1')
	})

	test('approval.request rejected → decision:rejected', async () => {
		const am = new ApprovalManager()
		await mountApp({
			approvalManager: am,
			mcp: makeMcp(),
			builtInTools: {},
			builtInCatalog: CATALOG,
			expectedToken: () => 'tk',
		})
		const reqP = fetch(`${baseUrl}/openclawos/plugin-rpc`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-internal-plugin-token': 'tk',
			},
			body: JSON.stringify({
				method: 'approval.request',
				args: {toolName: 'luse_computer_click_mouse', toolCallId: 'tc-2'},
			}),
		})
		await new Promise((r) => setTimeout(r, 50))
		am.resolve('tc-2', false)
		const res = await reqP
		expect(res.status).toBe(200)
		const body = (await res.json()) as {ok: boolean; result: {decision: string}}
		expect(body.ok).toBe(true)
		expect(body.result.decision).toBe('rejected')
	})
})
