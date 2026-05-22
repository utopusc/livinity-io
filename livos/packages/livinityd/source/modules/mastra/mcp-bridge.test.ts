/**
 * Phase 197-02 Plan 02 Task 1 — mcp-bridge.test.ts.
 *
 * Coverage (≥11 PASS):
 *   1. Both enabled + Luse executable + selfclaude responds → luse_* + selfclaude_* tools
 *   2. Luse disabled in Redis → only selfclaude_* tools
 *   3. selfclaude disabled → only luse_* tools
 *   4. Both disabled → empty tool map (no throw)
 *   5. Luse enabled + LUSE_MCP_PATH unset → warn + skip Luse
 *   6. Luse enabled + LUSE_MCP_PATH points to non-existent → warn + skip
 *   7. selfclaude hostname=evil.example.com → InvalidMcpUrlError
 *   8. selfclaude HEAD probe never resolves → skip selfclaude within ≤2.5s
 *   9. Destructive tool flag — luse_computer_click_mouse meta.requireApproval=true
 *   10. MCPClient constructed with MANDATORY id (T-197-02-02)
 *   11. N-01 lock — destructiveToolNames Set exports 6 namespaced ids
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMcpBridge, destructiveToolNames} from './mcp-bridge.js'
import {InvalidMcpUrlError} from './mcp-errors.js'

function makeLogger() {
	return {warn: vi.fn(), info: vi.fn()}
}

function makeRedis(flags: Record<string, string | null>) {
	return {
		get: vi.fn().mockImplementation(async (k: string) =>
			Object.prototype.hasOwnProperty.call(flags, k) ? flags[k] : null,
		),
	}
}

const fakeTools = {
	luse_computer_screenshot: {description: 'screenshot', meta: {}},
	luse_computer_click_mouse: {description: 'click', meta: {}},
	luse_list_windows: {description: 'list'},
	selfclaude_list_skills: {description: 'skills', meta: {}},
}

function makeMcpFactory(callRecorder: {ctorArgs?: unknown}) {
	return (opts: unknown) => {
		callRecorder.ctorArgs = opts
		return {
			async getTools() {
				const o = opts as {servers?: Record<string, unknown>}
				const out: Record<string, unknown> = {}
				if (o.servers && 'luse' in o.servers) {
					out.luse_computer_screenshot = fakeTools.luse_computer_screenshot
					out.luse_computer_click_mouse = fakeTools.luse_computer_click_mouse
					out.luse_list_windows = fakeTools.luse_list_windows
				}
				if (o.servers && 'selfclaude' in o.servers) {
					out.selfclaude_list_skills = fakeTools.selfclaude_list_skills
				}
				return out
			},
			async disconnect() {
				/* no-op */
			},
		} as never
	}
}

function makeFetch(ok: boolean): typeof globalThis.fetch {
	return vi.fn().mockResolvedValue({ok, status: ok ? 200 : 503} as Response) as never
}

const ORIG_ENV = {...process.env}

afterEach(() => {
	process.env = {...ORIG_ENV}
	vi.useRealTimers()
})

describe('createMcpBridge', () => {
	test('Test 1: both enabled → luse_* + selfclaude_* tools', async () => {
		const tmpExec = path.join(os.tmpdir(), `luse-mock-${Date.now()}.sh`)
		await fs.writeFile(tmpExec, '#!/bin/sh\nexit 0\n', {mode: 0o755})
		try {
			process.env.LUSE_MCP_PATH = tmpExec
			const rec: {ctorArgs?: unknown} = {}
			const bridge = await createMcpBridge(
				{
					redis: makeRedis({}),
					logger: makeLogger(),
				},
				{mcpClientFactory: makeMcpFactory(rec), fetchImpl: makeFetch(true)},
			)
			const tools = await bridge.listTools()
			const luseKeys = Object.keys(tools).filter((k) => k.startsWith('luse_'))
			const selfclaudeKeys = Object.keys(tools).filter((k) => k.startsWith('selfclaude_'))
			expect(luseKeys.length).toBeGreaterThanOrEqual(3)
			expect(selfclaudeKeys.length).toBeGreaterThanOrEqual(1)
		} finally {
			await fs.unlink(tmpExec).catch(() => undefined)
		}
	})

	test('Test 2: Luse disabled → only selfclaude_* tools', async () => {
		const rec: {ctorArgs?: unknown} = {}
		const bridge = await createMcpBridge(
			{
				redis: makeRedis({'liv:mcp:luse:enabled': 'false'}),
				logger: makeLogger(),
			},
			{mcpClientFactory: makeMcpFactory(rec), fetchImpl: makeFetch(true)},
		)
		const tools = await bridge.listTools()
		expect(Object.keys(tools).every((k) => k.startsWith('selfclaude_'))).toBe(true)
	})

	test('Test 3: selfclaude disabled → only luse_* tools', async () => {
		const tmpExec = path.join(os.tmpdir(), `luse-mock-3-${Date.now()}.sh`)
		await fs.writeFile(tmpExec, '#!/bin/sh\nexit 0\n', {mode: 0o755})
		try {
			process.env.LUSE_MCP_PATH = tmpExec
			const rec: {ctorArgs?: unknown} = {}
			const bridge = await createMcpBridge(
				{
					redis: makeRedis({'liv:mcp:selfclaude:enabled': 'false'}),
					logger: makeLogger(),
				},
				{mcpClientFactory: makeMcpFactory(rec), fetchImpl: makeFetch(true)},
			)
			const tools = await bridge.listTools()
			expect(Object.keys(tools).every((k) => k.startsWith('luse_'))).toBe(true)
		} finally {
			await fs.unlink(tmpExec).catch(() => undefined)
		}
	})

	test('Test 4: both disabled → empty tool map', async () => {
		const rec: {ctorArgs?: unknown} = {}
		const bridge = await createMcpBridge(
			{
				redis: makeRedis({
					'liv:mcp:luse:enabled': 'false',
					'liv:mcp:selfclaude:enabled': 'false',
				}),
				logger: makeLogger(),
			},
			{mcpClientFactory: makeMcpFactory(rec), fetchImpl: makeFetch(true)},
		)
		const tools = await bridge.listTools()
		expect(tools).toEqual({})
	})

	test('Test 5: Luse enabled + LUSE_MCP_PATH unset → warn + skip', async () => {
		delete process.env.LUSE_MCP_PATH
		const logger = makeLogger()
		const rec: {ctorArgs?: unknown} = {}
		const bridge = await createMcpBridge(
			{
				redis: makeRedis({'liv:mcp:selfclaude:enabled': 'false'}),
				logger,
			},
			{mcpClientFactory: makeMcpFactory(rec), fetchImpl: makeFetch(true)},
		)
		const tools = await bridge.listTools()
		expect(tools).toEqual({})
		const warns = logger.warn.mock.calls.map(([m]) => String(m)).join('\n')
		expect(warns).toMatch(/LUSE_MCP_PATH/)
	})

	test('Test 6: Luse enabled + LUSE_MCP_PATH non-existent → warn + no spawn', async () => {
		process.env.LUSE_MCP_PATH = '/definitely/does/not/exist/luse-mcp'
		const logger = makeLogger()
		const rec: {ctorArgs?: unknown} = {}
		const bridge = await createMcpBridge(
			{
				redis: makeRedis({'liv:mcp:selfclaude:enabled': 'false'}),
				logger,
			},
			{mcpClientFactory: makeMcpFactory(rec), fetchImpl: makeFetch(true)},
		)
		await bridge.listTools()
		expect(logger.warn).toHaveBeenCalled()
		// MCPClient was never invoked with a luse server entry
		expect(rec.ctorArgs).toBeUndefined()
	})

	test('Test 7: selfclaude hostname not in allow-list → InvalidMcpUrlError', async () => {
		process.env.SELFCLAUDE_MCP_URL = 'http://evil.example.com/mcp'
		const rec: {ctorArgs?: unknown} = {}
		await expect(
			createMcpBridge(
				{
					redis: makeRedis({'liv:mcp:luse:enabled': 'false'}),
					logger: makeLogger(),
				},
				{mcpClientFactory: makeMcpFactory(rec), fetchImpl: makeFetch(true)},
			),
		).rejects.toBeInstanceOf(InvalidMcpUrlError)
	})

	test('Test 8: selfclaude HEAD never resolves → skip within ≤2.5s', async () => {
		const neverFetch: typeof globalThis.fetch = ((_url: unknown, init?: {signal?: AbortSignal}) =>
			new Promise((_resolve, reject) => {
				const sig = init?.signal
				if (sig) {
					sig.addEventListener('abort', () => reject(new Error('AbortError')))
				}
				/* otherwise never resolves */
			})) as never
		const logger = makeLogger()
		const rec: {ctorArgs?: unknown} = {}
		const startedAt = Date.now()
		const bridge = await createMcpBridge(
			{
				redis: makeRedis({'liv:mcp:luse:enabled': 'false'}),
				logger,
			},
			{mcpClientFactory: makeMcpFactory(rec), fetchImpl: neverFetch},
		)
		const elapsed = Date.now() - startedAt
		expect(elapsed).toBeLessThan(2_500)
		const tools = await bridge.listTools()
		expect(tools).toEqual({})
		expect(logger.warn).toHaveBeenCalled()
	}, 5_000)

	test('Test 9: destructive tool flag — luse_computer_click_mouse → meta.requireApproval=true', async () => {
		const tmpExec = path.join(os.tmpdir(), `luse-mock-9-${Date.now()}.sh`)
		await fs.writeFile(tmpExec, '#!/bin/sh\nexit 0\n', {mode: 0o755})
		try {
			process.env.LUSE_MCP_PATH = tmpExec
			const rec: {ctorArgs?: unknown} = {}
			const bridge = await createMcpBridge(
				{
					redis: makeRedis({'liv:mcp:selfclaude:enabled': 'false'}),
					logger: makeLogger(),
				},
				{mcpClientFactory: makeMcpFactory(rec), fetchImpl: makeFetch(true)},
			)
			const tools = await bridge.listTools()
			const click = tools.luse_computer_click_mouse as {meta?: {requireApproval?: boolean}}
			const screenshot = tools.luse_computer_screenshot as {meta?: {requireApproval?: boolean}}
			expect(click?.meta?.requireApproval).toBe(true)
			expect(screenshot?.meta?.requireApproval).toBeFalsy()
		} finally {
			await fs.unlink(tmpExec).catch(() => undefined)
		}
	})

	test('Test 10: MCPClient constructed with MANDATORY id (T-197-02-02)', async () => {
		const tmpExec = path.join(os.tmpdir(), `luse-mock-10-${Date.now()}.sh`)
		await fs.writeFile(tmpExec, '#!/bin/sh\nexit 0\n', {mode: 0o755})
		try {
			process.env.LUSE_MCP_PATH = tmpExec
			const rec: {ctorArgs?: unknown} = {}
			await createMcpBridge(
				{
					redis: makeRedis({'liv:mcp:selfclaude:enabled': 'false'}),
					logger: makeLogger(),
				},
				{mcpClientFactory: makeMcpFactory(rec), fetchImpl: makeFetch(true)},
			)
			const ctor = rec.ctorArgs as {id?: string}
			expect(typeof ctor?.id).toBe('string')
			expect(ctor.id).toBe('livos-mcp-bridge')
		} finally {
			await fs.unlink(tmpExec).catch(() => undefined)
		}
	})
})

describe('destructiveToolNames (N-01 lock)', () => {
	test('Test 11: exposes exactly 6 namespaced destructive luse_* ids', () => {
		expect(destructiveToolNames.size).toBe(6)
		expect(destructiveToolNames.has('luse_computer_click_mouse')).toBe(true)
		expect(destructiveToolNames.has('luse_computer_type_text')).toBe(true)
		expect(destructiveToolNames.has('luse_computer_press_keys')).toBe(true)
		expect(destructiveToolNames.has('luse_computer_application')).toBe(true)
		expect(destructiveToolNames.has('luse_computer_drag_mouse')).toBe(true)
		expect(destructiveToolNames.has('luse_computer_paste_text')).toBe(true)
		// negative
		expect(destructiveToolNames.has('luse_computer_screenshot')).toBe(false)
		expect(destructiveToolNames.has('luse_list_windows')).toBe(false)
	})
})
