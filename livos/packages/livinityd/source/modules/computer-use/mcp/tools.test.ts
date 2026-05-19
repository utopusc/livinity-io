/**
 * Phase 72-native-05 — MCP tools dispatcher tests.
 *
 * Spec source: 72-native-05-PLAN.md `<task type="auto" tdd="true">` Task 1.
 *
 * Coverage (12 cases per plan must-have list):
 *   T1:  registerLuseTools registers exactly LUSE_TOOLS.length handlers (17).
 *   T2:  Each tool name from LUSE_TOOL_NAMES has a registered handler.
 *   T3:  computer_screenshot returns image content + isError:false; captureScreenshot called once.
 *   T4:  computer_click_mouse calls clickMouse(args), waits 750ms, takes post-action screenshot.
 *   T5:  computer_wait with duration=500 awaits 500ms timer, returns text-only content.
 *   T6:  computer_cursor_position calls getCursorPosition, returns text-only content.
 *   T7:  set_task_status status='needs_help' returns _liv_meta = { kind:'needs-help', ...}.
 *   T8:  set_task_status status='completed' returns _liv_meta = { kind:'completed', message }.
 *   T9:  create_task returns _liv_meta = { kind:'task-created', ...args }.
 *   T10: Handler that throws (mock clickMouse to throw) returns isError:true with error msg.
 *   T11: computer_application valid name calls openOrFocus; invalid → isError:true.
 *   T12: computer_read_file calls readFileBase64 and wraps result as MCP content.
 *
 * Mocks:
 *   - `../native/index.js` — vi.mock returns spy fns for all native exports.
 *   - `node:timers/promises` — fake setTimeout that resolves immediately so we
 *     can assert it was called with the right delay without real wall time.
 */
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

// Hoisted mock state so vi.mock factories below can close over them safely.
const mocks = vi.hoisted(() => ({
	captureScreenshot: vi.fn<() => Promise<{base64: string; width: number; height: number; mimeType: 'image/png'}>>(),
	moveMouse: vi.fn<(c: {x: number; y: number}) => Promise<void>>(),
	traceMouse: vi.fn<(p: ReadonlyArray<{x: number; y: number}>, h?: ReadonlyArray<string>) => Promise<void>>(),
	clickMouse: vi.fn<(opts: unknown) => Promise<void>>(),
	pressMouse: vi.fn<(opts: unknown) => Promise<void>>(),
	dragMouse: vi.fn<(p: unknown, b: unknown, h?: unknown) => Promise<void>>(),
	scroll: vi.fn<(opts: unknown) => Promise<void>>(),
	typeKeys: vi.fn<(keys: ReadonlyArray<string>, delay?: number) => Promise<void>>(),
	pressKeys: vi.fn<(keys: ReadonlyArray<string>, press: 'up' | 'down') => Promise<void>>(),
	typeText: vi.fn<(text: string, delay?: number, isSensitive?: boolean) => Promise<void>>(),
	pasteText: vi.fn<(text: string, isSensitive?: boolean) => Promise<void>>(),
	getCursorPosition: vi.fn<() => Promise<{x: number; y: number}>>(),
	openOrFocus: vi.fn<(name: string) => Promise<{isError: boolean; message?: string}>>(),
	listWindows: vi.fn<() => Promise<Array<{id: string; class: string; title: string}>>>(),
	readFileBase64: vi.fn<(p: string) => Promise<{base64: string; filename: string; size: number; mimeType: string}>>(),
	setTimeoutMock: vi.fn<(ms: number) => Promise<void>>(),
}))

vi.mock('../native/index.js', () => ({
	captureScreenshot: mocks.captureScreenshot,
	moveMouse: mocks.moveMouse,
	traceMouse: mocks.traceMouse,
	clickMouse: mocks.clickMouse,
	pressMouse: mocks.pressMouse,
	dragMouse: mocks.dragMouse,
	scroll: mocks.scroll,
	typeKeys: mocks.typeKeys,
	pressKeys: mocks.pressKeys,
	typeText: mocks.typeText,
	pasteText: mocks.pasteText,
	getCursorPosition: mocks.getCursorPosition,
	openOrFocus: mocks.openOrFocus,
	listWindows: mocks.listWindows,
	readFileBase64: mocks.readFileBase64,
}))

vi.mock('node:timers/promises', () => ({
	setTimeout: mocks.setTimeoutMock,
}))

// SUT — imported AFTER vi.mock above (top-of-file vi.mock is hoisted by vitest).
import {LUSE_TOOLS, LUSE_TOOL_NAMES} from '../luse-tools.js'
import {registerLuseTools, HANDLERS, __setReaddirForTest, __setRealpathForTest} from './tools.js'

// Minimal stub of the McpServer surface registerLuseTools touches.
class StubMcpServer {
	registered: Array<{name: string; description: string; inputSchema: unknown; handler: (args: Record<string, unknown>) => Promise<unknown>}> = []

	registerTool(
		name: string,
		schemaConfig: {description: string; inputSchema: unknown},
		handler: (args: Record<string, unknown>) => Promise<unknown>,
	): void {
		this.registered.push({name, description: schemaConfig.description, inputSchema: schemaConfig.inputSchema, handler})
	}

	getHandler(name: string): ((args: Record<string, unknown>) => Promise<unknown>) | undefined {
		return this.registered.find((r) => r.name === name)?.handler
	}
}

const SCREENSHOT_RESULT = {
	base64: 'AAAA',
	width: 1280,
	height: 960,
	mimeType: 'image/png' as const,
}

describe('registerLuseTools', () => {
	beforeEach(() => {
		// Reset all spies between cases.
		for (const fn of Object.values(mocks)) {
			fn.mockReset()
		}
		// Sensible defaults so handlers don't blow up unless a test overrides.
		mocks.captureScreenshot.mockResolvedValue(SCREENSHOT_RESULT)
		mocks.moveMouse.mockResolvedValue(undefined)
		mocks.traceMouse.mockResolvedValue(undefined)
		mocks.clickMouse.mockResolvedValue(undefined)
		mocks.pressMouse.mockResolvedValue(undefined)
		mocks.dragMouse.mockResolvedValue(undefined)
		mocks.scroll.mockResolvedValue(undefined)
		mocks.typeKeys.mockResolvedValue(undefined)
		mocks.pressKeys.mockResolvedValue(undefined)
		mocks.typeText.mockResolvedValue(undefined)
		mocks.pasteText.mockResolvedValue(undefined)
		mocks.getCursorPosition.mockResolvedValue({x: 100, y: 200})
		mocks.openOrFocus.mockResolvedValue({isError: false})
		mocks.listWindows.mockResolvedValue([])
		mocks.readFileBase64.mockResolvedValue({
			base64: 'ZmlsZQ==',
			filename: 'foo.txt',
			size: 4,
			mimeType: 'text/plain',
		})
		mocks.setTimeoutMock.mockResolvedValue(undefined)
	})

	it('T1: registers expected handler count (17 upstream + 3 P100-10-03 window-aware = 20 without streamManager; +2 P100-10-04 stream tools when streamManager opt-in)', () => {
		// LUSE_TOOLS has 22 entries post-P100-10-04 (17 upstream + 3 window-aware
		// + 2 stream-management). The standard loop registers 17 upstream tools
		// under bare names; the 3 window-aware tools register under
		// `mcp__luse__*` prefixed names; the 2 stream-management tools register
		// under `mcp__luse__*` prefixed names ONLY when `streamManager` is
		// wired into options (opt-in pattern mirrors skillReplayDeps from
		// P97-07). Without options, stream tools are skipped → 20 total.
		expect(LUSE_TOOLS).toHaveLength(22)
		const stubBare = new StubMcpServer()
		registerLuseTools(stubBare as never)
		expect(stubBare.registered).toHaveLength(20)

		// With streamManager opt-in, the 2 stream tools register too → 22 total.
		const stubFull = new StubMcpServer()
		registerLuseTools(stubFull as never, {
			streamManager: {
				startStream: () => ({streamId: 's', wsUrl: '/ws/s'}),
				listStreams: () => [],
			},
			redis: {get: async () => null},
			userId: 'admin',
		} as never)
		expect(stubFull.registered).toHaveLength(22)
	})

	it('T2: every LUSE_TOOL_NAMES entry has a registered handler (window-aware + stream tools via mcp__luse__ prefix)', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {
			streamManager: {
				startStream: () => ({streamId: 's', wsUrl: '/ws/s'}),
				listStreams: () => [],
			},
			redis: {get: async () => null},
			userId: 'admin',
		} as never)
		const registeredNames = new Set(stub.registered.map((r) => r.name))
		const prefixed = new Set([
			// P100-10-03
			'list_windows',
			'screenshot_window',
			'focus_window',
			// P100-10-04
			'create_stream',
			'list_streams',
		])
		for (const name of LUSE_TOOL_NAMES) {
			// Phase 100-10-14: all Luse tools (including window-aware + stream-mgmt)
			// register as BARE name so UI displays them consistently with the
			// other Luse tools (computer_*, set_task_status, etc.). The MCP
			// runtime handles any per-server prefix display; the server itself
			// uses unprefixed names.
			expect(registeredNames.has(name)).toBe(true)
			if (!prefixed.has(name)) {
				expect(typeof HANDLERS[name]).toBe('function')
			}
		}
	})

	it('T3: computer_screenshot returns image content + isError:false; captureScreenshot called once', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_screenshot')!
		const result = (await handler({})) as {
			content: Array<{type: string; data?: string; mimeType?: string; text?: string}>
			isError: boolean
		}
		expect(mocks.captureScreenshot).toHaveBeenCalledTimes(1)
		expect(result.isError).toBe(false)
		const imageBlock = result.content.find((c) => c.type === 'image')
		expect(imageBlock).toBeDefined()
		expect(imageBlock?.data).toBe('AAAA')
		expect(imageBlock?.mimeType).toBe('image/png')
	})

	it('T4: computer_click_mouse calls clickMouse(args), waits 750ms, takes post-action screenshot', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_click_mouse')!
		const args = {coordinates: {x: 50, y: 60}, button: 'left' as const, clickCount: 1}
		const result = (await handler(args)) as {
			content: Array<{type: string; data?: string; text?: string}>
			isError: boolean
		}

		expect(mocks.clickMouse).toHaveBeenCalledTimes(1)
		expect(mocks.clickMouse).toHaveBeenCalledWith(args)
		// 750ms post-action settle delay.
		expect(mocks.setTimeoutMock).toHaveBeenCalledWith(750)
		// Post-action screenshot.
		expect(mocks.captureScreenshot).toHaveBeenCalledTimes(1)
		expect(result.isError).toBe(false)
		// Two content blocks: post-action image + summary text.
		expect(result.content.length).toBe(2)
		expect(result.content.some((c) => c.type === 'image')).toBe(true)
		expect(result.content.some((c) => c.type === 'text')).toBe(true)
	})

	it('T5: computer_wait with duration=500 awaits 500ms timer, returns text-only content', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_wait')!
		const result = (await handler({duration: 500})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}

		expect(mocks.setTimeoutMock).toHaveBeenCalledWith(500)
		// No screenshot for wait.
		expect(mocks.captureScreenshot).not.toHaveBeenCalled()
		expect(result.isError).toBe(false)
		expect(result.content.length).toBe(1)
		expect(result.content[0].type).toBe('text')
		expect(result.content[0].text).toMatch(/Waited 500ms/i)
	})

	it('T6: computer_cursor_position calls getCursorPosition, returns text-only (no screenshot)', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_cursor_position')!
		const result = (await handler({})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}

		expect(mocks.getCursorPosition).toHaveBeenCalledTimes(1)
		expect(mocks.captureScreenshot).not.toHaveBeenCalled()
		expect(result.isError).toBe(false)
		expect(result.content.length).toBe(1)
		expect(result.content[0].type).toBe('text')
		expect(result.content[0].text).toMatch(/100/)
		expect(result.content[0].text).toMatch(/200/)
	})

	it('T7: set_task_status status=needs_help returns _liv_meta with kind:needs-help', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('set_task_status')!
		const result = (await handler({status: 'needs_help', description: 'cannot find login form'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
			_liv_meta?: {kind: string; message?: string; tool?: string}
		}

		expect(result.isError).toBe(false)
		expect(result._liv_meta).toBeDefined()
		expect(result._liv_meta?.kind).toBe('needs-help')
		expect(result._liv_meta?.message).toBe('cannot find login form')
		expect(result._liv_meta?.tool).toBe('mcp_luse_set_task_status')
		// content text starts with NEEDS_HELP literal per D-NATIVE-08.
		expect(result.content[0].text).toMatch(/^NEEDS_HELP:/)
	})

	it('T8: set_task_status status=completed returns _liv_meta kind:completed', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('set_task_status')!
		const result = (await handler({status: 'completed', description: 'all done'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
			_liv_meta?: {kind: string; message?: string}
		}

		expect(result.isError).toBe(false)
		expect(result._liv_meta?.kind).toBe('completed')
		expect(result._liv_meta?.message).toBe('all done')
		expect(result.content[0].text).toMatch(/^COMPLETED:/)
	})

	it('T9: create_task returns _liv_meta kind:task-created with args', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('create_task')!
		const args = {description: 'do thing', type: 'IMMEDIATE', priority: 'HIGH'}
		const result = (await handler(args)) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
			_liv_meta?: {kind: string; description?: string; type?: string; priority?: string}
		}

		expect(result.isError).toBe(false)
		expect(result._liv_meta?.kind).toBe('task-created')
		expect(result._liv_meta?.description).toBe('do thing')
		expect(result._liv_meta?.type).toBe('IMMEDIATE')
		expect(result._liv_meta?.priority).toBe('HIGH')
	})

	it('T10: handler that throws (mocked clickMouse) returns isError:true with error message', async () => {
		mocks.clickMouse.mockRejectedValueOnce(new Error('nut-js exploded'))
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_click_mouse')!
		const result = (await handler({
			coordinates: {x: 1, y: 2},
			button: 'left' as const,
			clickCount: 1,
		})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}

		expect(result.isError).toBe(true)
		expect(result.content[0].type).toBe('text')
		expect(result.content[0].text).toMatch(/Error/i)
		expect(result.content[0].text).toMatch(/nut-js exploded/)
	})

	it('T11: computer_application valid name calls openOrFocus; invalid name → isError:true', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_application')!

		// Valid: openOrFocus mock returns success.
		const okResult = (await handler({application: 'firefox'})) as {isError: boolean}
		expect(mocks.openOrFocus).toHaveBeenCalledWith('firefox')
		expect(okResult.isError).toBe(false)

		// Invalid: openOrFocus mock returns isError:true
		mocks.openOrFocus.mockResolvedValueOnce({isError: true, message: 'unknown application: bogus'})
		const badResult = (await handler({application: 'bogus'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(badResult.isError).toBe(true)
		expect(badResult.content[0].text).toMatch(/unknown application/)
	})

	it('T12: computer_read_file calls readFileBase64 and wraps result as MCP content', async () => {
		// Phase 160-05 — sandbox-guarded path. Use an allowlist-passing path
		// (/home/<user>/) and stub realpath to echo it back so the guard
		// passes and the original readFileBase64 wrapping is exercised.
		__setRealpathForTest(async (p: string) => String(p))
		try {
			const stub = new StubMcpServer()
			registerLuseTools(stub as never)
			const handler = stub.getHandler('computer_read_file')!
			const result = (await handler({path: '/home/bruce/foo.txt'})) as {
				content: Array<{type: string; text?: string; data?: string; mimeType?: string}>
				isError: boolean
			}

			expect(mocks.readFileBase64).toHaveBeenCalledWith('/home/bruce/foo.txt')
			expect(result.isError).toBe(false)
			// Some content surface — text describing the read OR an attached document.
			expect(result.content.length).toBeGreaterThanOrEqual(1)
			const concat = JSON.stringify(result.content)
			expect(concat).toMatch(/foo\.txt|ZmlsZQ==/)
		} finally {
			__setRealpathForTest(undefined)
		}
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 100-10-03 — luse window-aware tool handlers (D-100-10-C)
// ─────────────────────────────────────────────────────────────────────────────

// Mock node:child_process so focus_window's xdotool spawn doesn't actually
// fork an OS process. Hoisted alongside the existing native/index.js mock.
const procMocks = vi.hoisted(() => ({
	spawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
	spawn: procMocks.spawn,
}))

describe('Phase 100-10-03 luse window-aware tool handlers', () => {
	beforeEach(() => {
		for (const fn of Object.values(mocks)) {
			fn.mockReset()
		}
		mocks.captureScreenshot.mockResolvedValue(SCREENSHOT_RESULT)
		mocks.listWindows.mockResolvedValue([
			{id: '0xabc', class: 'chrome.Chrome', title: 'Test Window'},
		])
		mocks.setTimeoutMock.mockResolvedValue(undefined)
		procMocks.spawn.mockReset()
		// xdotool spawn returns a stub child with a 'close' event firing exit code 0
		// and unref / on / once methods. focus_window awaits exit.
		procMocks.spawn.mockImplementation(() => {
			const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
			const child: {
				on: (e: string, cb: (...args: unknown[]) => void) => unknown
				once: (e: string, cb: (...args: unknown[]) => void) => unknown
				unref: () => void
				stderr: {on: (e: string, cb: (chunk: Buffer) => void) => unknown}
				stdout: {on: (e: string, cb: (chunk: Buffer) => void) => unknown}
			} = {
				on(e, cb) {
					listeners[e] ??= []
					listeners[e].push(cb)
					// schedule a synthetic clean exit
					if (e === 'close' || e === 'exit') {
						setImmediate(() => cb(0))
					}
					return child
				},
				once(e, cb) {
					return child.on(e, cb)
				},
				unref() {},
				stderr: {on: () => undefined},
				stdout: {on: () => undefined},
			}
			return child
		})
	})

	it('T-10-03-HANDLER-01: registerLuseTools registers mcp__luse__list_windows', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const registered = stub.registered.find((r) => r.name === 'list_windows')
		expect(registered).toBeDefined()
	})

	it('T-10-03-HANDLER-02: registerLuseTools registers mcp__luse__screenshot_window', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const registered = stub.registered.find((r) => r.name === 'screenshot_window')
		expect(registered).toBeDefined()
	})

	it('T-10-03-HANDLER-03: registerLuseTools registers mcp__luse__focus_window', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const registered = stub.registered.find((r) => r.name === 'focus_window')
		expect(registered).toBeDefined()
	})

	it('T-10-03-HANDLER-04 (103.1-4): mcp__luse__list_windows with no arg aggregates across active displays even when defaultDisplay is set', async () => {
		// Phase 103.1-4 behavior change: defaultDisplay no longer gates
		// aggregation. The right answer to "what windows are open?" is
		// EVERY display, regardless of which one is the env fallback for
		// other tools (click/type/etc.). Per-WebApp Luse MCP still works
		// because its agent prompt prescribes explicit display arg on every
		// call (see T103B-10 and 103-04 plan).
		__setReaddirForTest(
			(async (_p: string) => ['X1', 'X10']) as never,
		)
		try {
			mocks.listWindows.mockImplementation(
				async (opts: unknown): Promise<unknown> => {
					const display = (opts as {display?: string})?.display ?? '???'
					return [
						{
							id: '0x1',
							class: 'X.X',
							title: `on ${display}`,
							geometry: {x: 0, y: 0, w: 1, h: 1},
							display,
						},
					]
				},
			)
			const stub = new StubMcpServer()
			registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
			const handler = stub.getHandler('list_windows')!
			const result = (await handler({})) as {
				content: Array<{type: string; text: string}>
				isError: boolean
			}
			const parsed = JSON.parse(result.content[0].text) as Array<{display: string}>
			expect(parsed.map((w) => w.display)).toEqual(
				expect.arrayContaining([':1', ':10']),
			)
			expect(mocks.listWindows).toHaveBeenCalledTimes(2)
		} finally {
			__setReaddirForTest(undefined)
		}
	})

	it('T-10-03-HANDLER-05: mcp__luse__screenshot_window with {wid} calls captureScreenshot({wid}) and returns image content', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const handler = stub.getHandler('screenshot_window')!
		const result = (await handler({wid: 0xabc})) as {
			content: Array<{type: string; data?: string; mimeType?: string}>
			isError: boolean
		}
		expect(mocks.captureScreenshot).toHaveBeenCalledTimes(1)
		const arg = (mocks.captureScreenshot.mock.calls as unknown as Array<Array<{wid?: number; windowId?: number}>>)[0]?.[0]
		// Accept either {wid} (new API) or {windowId} (back-compat with screenshot.ts P97-01)
		expect(arg).toBeDefined()
		expect(arg!.wid ?? arg!.windowId).toBe(0xabc)
		expect(result.isError).toBe(false)
		const imageBlock = result.content.find((c) => c.type === 'image')
		expect(imageBlock).toBeDefined()
		expect(imageBlock!.mimeType).toBe('image/png')
	})

	it('T-10-03-HANDLER-06: mcp__luse__focus_window with {wid} spawns xdotool windowactivate --sync <hex>', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const handler = stub.getHandler('focus_window')!
		const result = (await handler({wid: 0xabc})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(result.isError).toBe(false)
		// xdotool was spawned with argv containing 'windowactivate', '--sync', and '0xabc'.
		const xdotoolCall = procMocks.spawn.mock.calls.find((call) => {
			const [cmd, args] = call as [string, string[]]
			if (cmd !== 'xdotool' || !Array.isArray(args)) return false
			return args.includes('windowactivate') && args.includes('--sync') && args.includes('0xabc')
		})
		expect(xdotoolCall).toBeDefined()
		// And the spawn env carried DISPLAY=:10 (the defaultDisplay).
		const opts = xdotoolCall![2] as {env?: Record<string, string>}
		expect(opts.env).toBeDefined()
		expect(opts.env!.DISPLAY).toBe(':10')
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 100-10-04 — luse stream-management tool handlers (D-100-10-C + G-100-10-E)
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 100-10-04 luse stream-management tool handlers', () => {
	type RedisLike = {
		get: ReturnType<typeof vi.fn>
	}
	type StreamManagerLike = {
		startStream: ReturnType<typeof vi.fn>
		listStreams: ReturnType<typeof vi.fn>
	}

	function makeMockRedis(getValue: string | null | Error = 'true'): RedisLike {
		return {
			get: vi.fn().mockImplementation(async () => {
				if (getValue instanceof Error) throw getValue
				return getValue
			}),
		}
	}

	function makeMockStreamManager(): StreamManagerLike {
		return {
			startStream: vi.fn().mockReturnValue({
				streamId: 'stream-uuid-abc',
				wsUrl: '/ws/stream/stream-uuid-abc',
			}),
			listStreams: vi.fn().mockReturnValue([
				{
					streamId: 'stream-uuid-abc',
					mode: 'vnc-window',
					wsUrl: '/ws/stream/stream-uuid-abc',
					kind: 'vnc',
				},
			]),
		}
	}

	it('T-10-04-HANDLER-01: registerLuseTools registers mcp__luse__create_stream when streamManager + redis provided', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {
			streamManager: makeMockStreamManager(),
			redis: makeMockRedis(),
			userId: 'u1',
			defaultDisplay: ':10',
		} as never)
		const registered = stub.registered.find(
			(r) => r.name === 'create_stream',
		)
		expect(registered).toBeDefined()
	})

	it('T-10-04-HANDLER-02: registerLuseTools registers mcp__luse__list_streams when streamManager provided', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {
			streamManager: makeMockStreamManager(),
			redis: makeMockRedis(),
			userId: 'u1',
			defaultDisplay: ':10',
		} as never)
		const registered = stub.registered.find(
			(r) => r.name === 'list_streams',
		)
		expect(registered).toBeDefined()
	})

	it('T-10-04-HANDLER-03: create_stream — flag=true → calls startStream({mode, target:{display}, userId})', async () => {
		const stub = new StubMcpServer()
		const sm = makeMockStreamManager()
		const redis = makeMockRedis('true')
		registerLuseTools(stub as never, {
			streamManager: sm,
			redis,
			userId: 'u1',
			defaultDisplay: ':10',
		} as never)
		const handler = stub.getHandler('create_stream')!
		const result = (await handler({display: ':10'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(redis.get).toHaveBeenCalledWith('liv:config:luse_can_create_streams')
		expect(sm.startStream).toHaveBeenCalledTimes(1)
		const callArg = sm.startStream.mock.calls[0][0]
		expect(callArg.mode).toBe('vnc-window')
		expect(callArg.target).toEqual({display: ':10'})
		expect(callArg.userId).toBe('u1')
		expect(result.isError).toBe(false)
		// Result content should contain JSON with streamId + wsUrl.
		const concat = JSON.stringify(result.content)
		expect(concat).toMatch(/stream-uuid-abc/)
		expect(concat).toMatch(/\/ws\/stream\/stream-uuid-abc/)
	})

	it('T-10-04-HANDLER-04: create_stream — flag=null (default disabled) → isError:true with message', async () => {
		const stub = new StubMcpServer()
		const sm = makeMockStreamManager()
		const redis = makeMockRedis(null)
		registerLuseTools(stub as never, {
			streamManager: sm,
			redis,
			userId: 'u1',
			defaultDisplay: ':10',
		} as never)
		const handler = stub.getHandler('create_stream')!
		const result = (await handler({display: ':10'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(redis.get).toHaveBeenCalledWith('liv:config:luse_can_create_streams')
		// streamManager.startStream must NOT have been called (fail-closed).
		expect(sm.startStream).not.toHaveBeenCalled()
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toMatch(/luse_can_create_streams disabled/)
	})

	it('T-10-04-HANDLER-05: list_streams — calls streamManager.listStreams({userId}) and returns JSON array', async () => {
		const stub = new StubMcpServer()
		const sm = makeMockStreamManager()
		const redis = makeMockRedis()
		registerLuseTools(stub as never, {
			streamManager: sm,
			redis,
			userId: 'u1',
			defaultDisplay: ':10',
		} as never)
		const handler = stub.getHandler('list_streams')!
		const result = (await handler({})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(sm.listStreams).toHaveBeenCalledTimes(1)
		expect(sm.listStreams.mock.calls[0][0]).toEqual({userId: 'u1'})
		expect(result.isError).toBe(false)
		expect(result.content).toHaveLength(1)
		expect(result.content[0].type).toBe('text')
		const parsed = JSON.parse(result.content[0].text!)
		expect(Array.isArray(parsed)).toBe(true)
		expect(parsed[0].streamId).toBe('stream-uuid-abc')
	})

	it('T-10-04-HANDLER-06: create_stream — redis.get throws → isError:true (graceful degradation)', async () => {
		const stub = new StubMcpServer()
		const sm = makeMockStreamManager()
		const redis = makeMockRedis(new Error('Redis connection refused'))
		registerLuseTools(stub as never, {
			streamManager: sm,
			redis,
			userId: 'u1',
			defaultDisplay: ':10',
		} as never)
		const handler = stub.getHandler('create_stream')!
		const result = (await handler({display: ':10'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		// Fail-closed: must not throw, must return isError:true.
		expect(result.isError).toBe(true)
		// Must NOT have invoked startStream.
		expect(sm.startStream).not.toHaveBeenCalled()
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 103-B — withScopedDisplay + display arg threading (REQ-103-B2 / B3)
//
// Verifies the per-call DISPLAY scoping introduced by 103-03:
//   - withScopedDisplay sets process.env.DISPLAY for the duration of the
//     wrapped async fn, then restores in finally
//   - parseDisplayArg validates the arg against /^:[1-9][0-9]?$/, treating
//     anything else as undefined (T-103-03-01 trust boundary)
//   - X11-touching handlers (computer_click_mouse, computer_screenshot,
//     list_windows) thread the per-call display through to the native
//     primitive via process.env.DISPLAY mutation
// ─────────────────────────────────────────────────────────────────────────────

import {withScopedDisplay, parseDisplayArg, buildHandlers} from './tools.js'

describe('Phase 103-B — withScopedDisplay + display arg threading', () => {
	let originalDisplay: string | undefined

	beforeEach(() => {
		originalDisplay = process.env.DISPLAY
		// Reset mock spies between cases.
		for (const fn of Object.values(mocks)) {
			fn.mockReset()
		}
		mocks.captureScreenshot.mockResolvedValue(SCREENSHOT_RESULT)
		mocks.clickMouse.mockResolvedValue(undefined)
		mocks.listWindows.mockResolvedValue([
			{id: '0x123', class: 'chrome.Chrome', title: 'Window'},
		])
		mocks.setTimeoutMock.mockResolvedValue(undefined)
	})

	afterEach(() => {
		if (originalDisplay === undefined) delete process.env.DISPLAY
		else process.env.DISPLAY = originalDisplay
	})

	// ── Test 1: withScopedDisplay sets target, restores in finally ─────────
	it('T103B-01: withScopedDisplay(":11", ":1") sets DISPLAY=":11" inside fn, restores afterwards', async () => {
		process.env.DISPLAY = ':orig'
		let observed: string | undefined
		const result = await withScopedDisplay(':11', ':1', async () => {
			observed = process.env.DISPLAY
			return 'ok'
		})
		expect(observed).toBe(':11')
		expect(result).toBe('ok')
		// Restored.
		expect(process.env.DISPLAY).toBe(':orig')
	})

	// ── Test 2: fallback to defaultDisplay ─────────────────────────────────
	it('T103B-02: withScopedDisplay(undefined, ":1") sets DISPLAY=":1" (default fallback)', async () => {
		process.env.DISPLAY = ':orig'
		let observed: string | undefined
		await withScopedDisplay(undefined, ':1', async () => {
			observed = process.env.DISPLAY
		})
		expect(observed).toBe(':1')
		expect(process.env.DISPLAY).toBe(':orig')
	})

	// ── Test 3: both undefined → no mutation ───────────────────────────────
	it('T103B-03: withScopedDisplay(undefined, undefined) does NOT mutate process.env.DISPLAY', async () => {
		process.env.DISPLAY = ':orig'
		let observed: string | undefined
		await withScopedDisplay(undefined, undefined, async () => {
			observed = process.env.DISPLAY
		})
		expect(observed).toBe(':orig')
		expect(process.env.DISPLAY).toBe(':orig')
	})

	// ── Test 3b: prev unset, target set → cleanup deletes after ────────────
	it('T103B-03b: when prev DISPLAY is unset, withScopedDisplay deletes DISPLAY in finally', async () => {
		delete process.env.DISPLAY
		await withScopedDisplay(':11', undefined, async () => {
			expect(process.env.DISPLAY).toBe(':11')
		})
		expect(process.env.DISPLAY).toBeUndefined()
	})

	// ── Test 4: restoration on throw ────────────────────────────────────────
	it('T103B-04: withScopedDisplay restores DISPLAY even when fn throws', async () => {
		process.env.DISPLAY = ':orig'
		await expect(
			withScopedDisplay(':11', ':1', async () => {
				expect(process.env.DISPLAY).toBe(':11')
				throw new Error('boom')
			}),
		).rejects.toThrow('boom')
		// Even after the throw, prev is restored.
		expect(process.env.DISPLAY).toBe(':orig')
	})

	// ── Test 5: handler with display=":11" mutates DISPLAY for clickMouse ──
	it('T103B-05: computer_click_mouse handler with display=":11" runs clickMouse while DISPLAY=":11"', async () => {
		process.env.DISPLAY = ':orig'
		// Snapshot DISPLAY at call time inside the clickMouse mock.
		let displayAtCall: string | undefined
		mocks.clickMouse.mockImplementation(async () => {
			displayAtCall = process.env.DISPLAY
		})
		const handlers = buildHandlers({defaultDisplay: ':1'})
		await handlers.computer_click_mouse({
			coordinates: {x: 5, y: 6},
			button: 'left',
			clickCount: 1,
			display: ':11',
		})
		expect(displayAtCall).toBe(':11')
		// Restored after handler returns.
		expect(process.env.DISPLAY).toBe(':orig')
	})

	// ── Test 6: no display arg → falls back to options.defaultDisplay ──────
	it('T103B-06: computer_click_mouse handler with NO display arg uses options.defaultDisplay=":10"', async () => {
		process.env.DISPLAY = ':orig'
		let displayAtCall: string | undefined
		mocks.clickMouse.mockImplementation(async () => {
			displayAtCall = process.env.DISPLAY
		})
		const handlers = buildHandlers({defaultDisplay: ':10'})
		await handlers.computer_click_mouse({
			coordinates: {x: 5, y: 6},
			button: 'left',
			clickCount: 1,
		})
		expect(displayAtCall).toBe(':10')
		expect(process.env.DISPLAY).toBe(':orig')
	})

	// ── Test 7: no display arg, no defaultDisplay → no override ────────────
	it('T103B-07: computer_click_mouse with NO display and NO defaultDisplay preserves caller DISPLAY', async () => {
		process.env.DISPLAY = ':orig'
		let displayAtCall: string | undefined
		mocks.clickMouse.mockImplementation(async () => {
			displayAtCall = process.env.DISPLAY
		})
		const handlers = buildHandlers({})
		await handlers.computer_click_mouse({
			coordinates: {x: 5, y: 6},
			button: 'left',
			clickCount: 1,
		})
		expect(displayAtCall).toBe(':orig')
		expect(process.env.DISPLAY).toBe(':orig')
	})

	// ── Test 8: invalid display string ("foo") → fallback to default ───────
	it('T103B-08: computer_click_mouse with invalid display="foo" falls back to options.defaultDisplay', async () => {
		process.env.DISPLAY = ':orig'
		let displayAtCall: string | undefined
		mocks.clickMouse.mockImplementation(async () => {
			displayAtCall = process.env.DISPLAY
		})
		const handlers = buildHandlers({defaultDisplay: ':10'})
		await handlers.computer_click_mouse({
			coordinates: {x: 1, y: 2},
			button: 'left',
			clickCount: 1,
			display: 'foo',
		})
		expect(displayAtCall).toBe(':10')
	})

	// ── Test 9: forbidden display=":0" → fallback to default ───────────────
	it('T103B-09: computer_click_mouse with display=":0" (forbidden) falls back to defaultDisplay', async () => {
		process.env.DISPLAY = ':orig'
		let displayAtCall: string | undefined
		mocks.clickMouse.mockImplementation(async () => {
			displayAtCall = process.env.DISPLAY
		})
		const handlers = buildHandlers({defaultDisplay: ':10'})
		await handlers.computer_click_mouse({
			coordinates: {x: 1, y: 2},
			button: 'left',
			clickCount: 1,
			display: ':0',
		})
		// :0 is rejected (regex: :1..:99 only) → fall back to default
		expect(displayAtCall).toBe(':10')
	})

	// ── Test 9b: display=":100" (out of range) → fallback ──────────────────
	it('T103B-09b: computer_click_mouse with display=":100" (3-digit, out of range) falls back to defaultDisplay', async () => {
		process.env.DISPLAY = ':orig'
		let displayAtCall: string | undefined
		mocks.clickMouse.mockImplementation(async () => {
			displayAtCall = process.env.DISPLAY
		})
		const handlers = buildHandlers({defaultDisplay: ':10'})
		await handlers.computer_click_mouse({
			coordinates: {x: 1, y: 2},
			button: 'left',
			clickCount: 1,
			display: ':100',
		})
		expect(displayAtCall).toBe(':10')
	})

	// ── Test 9c: empty string display → fallback ───────────────────────────
	it('T103B-09c: computer_click_mouse with display="" (empty) falls back to defaultDisplay', async () => {
		process.env.DISPLAY = ':orig'
		let displayAtCall: string | undefined
		mocks.clickMouse.mockImplementation(async () => {
			displayAtCall = process.env.DISPLAY
		})
		const handlers = buildHandlers({defaultDisplay: ':10'})
		await handlers.computer_click_mouse({
			coordinates: {x: 1, y: 2},
			button: 'left',
			clickCount: 1,
			display: '',
		})
		expect(displayAtCall).toBe(':10')
	})

	// ── Test 10: list_windows handler threads display ──────────────────────
	it('T103B-10: list_windows handler with args.display=":12" runs listWindows while DISPLAY=":12"', async () => {
		process.env.DISPLAY = ':orig'
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const handler = stub.getHandler('list_windows')!
		await handler({display: ':12'})
		// listWindows mock was called once
		expect(mocks.listWindows).toHaveBeenCalledTimes(1)
		// The handler should have called listWindows with the display arg
		// passed through OR mutated process.env.DISPLAY to :12 for the call.
		// (Existing list_windows handler passes display down via {display:...}
		// to the native primitive; the threaded value should still be :12.)
		const callArg = (mocks.listWindows.mock.calls as unknown as Array<Array<{display?: string}>>)[0]?.[0]
		expect(callArg?.display).toBe(':12')
	})

	// ── Test 11: computer_screenshot threads display ───────────────────────
	it('T103B-11: computer_screenshot handler with display=":11" runs captureScreenshot while DISPLAY=":11"', async () => {
		process.env.DISPLAY = ':orig'
		let displayAtCall: string | undefined
		mocks.captureScreenshot.mockImplementation(async () => {
			displayAtCall = process.env.DISPLAY
			return SCREENSHOT_RESULT
		})
		const handlers = buildHandlers({defaultDisplay: ':1'})
		await handlers.computer_screenshot({display: ':11'})
		expect(displayAtCall).toBe(':11')
		expect(process.env.DISPLAY).toBe(':orig')
	})

	// ── Phase 103.1: list_windows aggregation across active X11 displays ──
	//
	// User-walked Phase 103 UAT (2026-05-11) showed: agent in a global chat
	// asked "find Dinkytown open"; agent called list_windows; response was 1
	// window from the host display (:1) and missed the Dinkytown WebApp on
	// its own per-app Xvfb (:11). Fix: when called without a display arg AND
	// no per-WebApp defaultDisplay scope is set, list_windows aggregates
	// across every active X display by scanning /tmp/.X11-unix/X<N> sockets.

	it('T103.1-01: list_windows with NO display arg AND NO defaultDisplay aggregates across all active displays', async () => {
		__setReaddirForTest(
			(async (_p: string) => ['X1', 'X10', 'X11']) as never,
		)
		try {
			// listWindows returns a different window per display so we can verify aggregation
			let nextWid = 1
			mocks.listWindows.mockImplementation(
				async (opts: unknown): Promise<unknown> => {
					const display = (opts as {display?: string})?.display ?? '???'
					return [
						{
							id: `0x${(nextWid++).toString(16).padStart(8, '0')}`,
							class: 'Test.Test',
							title: `window on ${display}`,
							geometry: {x: 0, y: 0, w: 1280, h: 720},
							display,
						},
					]
				},
			)

			const stub = new StubMcpServer()
			registerLuseTools(stub as never)
			const handler = stub.getHandler('list_windows')!
			const result = (await handler({})) as {
				content: Array<{type: string; text: string}>
				isError: boolean
			}
			expect(result.isError).toBe(false)
			const parsed = JSON.parse(result.content[0].text) as Array<{display: string}>
			// Aggregation produces one window per active display.
			const displays = parsed.map((w) => w.display)
			expect(displays).toEqual(expect.arrayContaining([':1', ':10', ':11']))
			expect(parsed.length).toBe(3)
			// Three listWindows calls, one per discovered display.
			expect(mocks.listWindows).toHaveBeenCalledTimes(3)
		} finally {
			__setReaddirForTest(undefined)
		}
	})

	it('T103.1-02: list_windows with explicit display arg stays scoped (no aggregation)', async () => {
		__setReaddirForTest(
			(async (_p: string) => ['X1', 'X10', 'X11']) as never,
		)
		try {
			mocks.listWindows.mockResolvedValue([
				{
					id: '0x1',
					class: 'X.X',
					title: 'on 12',
					geometry: {x: 0, y: 0, w: 1, h: 1},
					display: ':12',
				},
			] as never)

			const stub = new StubMcpServer()
			registerLuseTools(stub as never)
			const handler = stub.getHandler('list_windows')!
			const result = (await handler({display: ':12'})) as {
				content: Array<{type: string; text: string}>
				isError: boolean
			}
			expect(result.isError).toBe(false)
			expect(mocks.listWindows).toHaveBeenCalledTimes(1)
			const callArg = (mocks.listWindows.mock.calls as unknown as Array<Array<{display?: string}>>)[0]?.[0]
			expect(callArg?.display).toBe(':12')
		} finally {
			__setReaddirForTest(undefined)
		}
	})

	it('T103.1-03 (103.1-4 revision): list_windows with explicit display arg ALWAYS scopes (even when defaultDisplay differs)', async () => {
		// 103.1-4 changed the semantics: defaultDisplay no longer gates
		// aggregation. The remaining "stay scoped" path is the explicit
		// per-call display arg — that path must still scope to the arg's
		// display regardless of defaultDisplay value.
		__setReaddirForTest(
			(async (_p: string) => ['X1', 'X10', 'X11']) as never,
		)
		try {
			mocks.listWindows.mockResolvedValue([
				{
					id: '0x1',
					class: 'X.X',
					title: 'on 11',
					geometry: {x: 0, y: 0, w: 1, h: 1},
					display: ':11',
				},
			] as never)

			const stub = new StubMcpServer()
			registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
			const handler = stub.getHandler('list_windows')!
			await handler({display: ':11'})
			expect(mocks.listWindows).toHaveBeenCalledTimes(1)
			const callArg = (mocks.listWindows.mock.calls as unknown as Array<Array<{display?: string}>>)[0]?.[0]
			expect(callArg?.display).toBe(':11')
		} finally {
			__setReaddirForTest(undefined)
		}
	})

	it('T103.1-04: list_windows ignores X0 (physical screen, headless on Mini PC) during aggregation', async () => {
		__setReaddirForTest(
			(async (_p: string) => ['X0', 'X1', 'X11']) as never,
		)
		try {
			mocks.listWindows.mockImplementation(
				async (opts: unknown): Promise<unknown> => {
					const display = (opts as {display?: string})?.display ?? '???'
					return [
						{
							id: '0x1',
							class: 'X.X',
							title: `on ${display}`,
							geometry: {x: 0, y: 0, w: 1, h: 1},
							display,
						},
					]
				},
			)

			const stub = new StubMcpServer()
			registerLuseTools(stub as never)
			const handler = stub.getHandler('list_windows')!
			const result = (await handler({})) as {
				content: Array<{type: string; text: string}>
				isError: boolean
			}
			const parsed = JSON.parse(result.content[0].text) as Array<{display: string}>
			const displays = parsed.map((w) => w.display)
			// :0 (physical screen, Phase 103.1 exclusion) absent; :1 and :11 present.
			expect(displays).not.toContain(':0')
			expect(displays).toEqual(expect.arrayContaining([':1', ':11']))
			expect(mocks.listWindows).toHaveBeenCalledTimes(2)
		} finally {
			__setReaddirForTest(undefined)
		}
	})

	it('T103.1-05: list_windows tolerates mid-scan listWindows failures (e.g. Xvfb went away)', async () => {
		__setReaddirForTest(
			(async (_p: string) => ['X1', 'X10', 'X11']) as never,
		)
		try {
			mocks.listWindows.mockImplementation(
				async (opts: unknown): Promise<unknown> => {
					const display = (opts as {display?: string})?.display ?? '???'
					if (display === ':10') {
						throw new Error('Xvfb gone away')
					}
					return [
						{
							id: '0x1',
							class: 'X.X',
							title: `on ${display}`,
							geometry: {x: 0, y: 0, w: 1, h: 1},
							display,
						},
					]
				},
			)

			const stub = new StubMcpServer()
			registerLuseTools(stub as never)
			const handler = stub.getHandler('list_windows')!
			const result = (await handler({})) as {
				content: Array<{type: string; text: string}>
				isError: boolean
			}
			// Failures skipped silently — :1 and :11 results included; :10 absent.
			const parsed = JSON.parse(result.content[0].text) as Array<{display: string}>
			const displays = parsed.map((w) => w.display)
			expect(displays).toEqual(expect.arrayContaining([':1', ':11']))
			expect(displays).not.toContain(':10')
			expect(result.isError).toBe(false)
		} finally {
			__setReaddirForTest(undefined)
		}
	})

	// ── parseDisplayArg unit tests (T-103-03-01 boundary guard) ───────────
	it('T103B-12: parseDisplayArg accepts valid ":1".. ":99", rejects everything else', () => {
		// Valid
		expect(parseDisplayArg({display: ':1'})).toBe(':1')
		expect(parseDisplayArg({display: ':10'})).toBe(':10')
		expect(parseDisplayArg({display: ':99'})).toBe(':99')
		// Invalid — fall back to undefined
		expect(parseDisplayArg({display: ':0'})).toBeUndefined()
		expect(parseDisplayArg({display: ':100'})).toBeUndefined()
		expect(parseDisplayArg({display: 'foo'})).toBeUndefined()
		expect(parseDisplayArg({display: ''})).toBeUndefined()
		expect(parseDisplayArg({display: ':'})).toBeUndefined()
		expect(parseDisplayArg({display: ':-1'})).toBeUndefined()
		expect(parseDisplayArg({display: 11})).toBeUndefined() // non-string
		expect(parseDisplayArg({})).toBeUndefined() // missing
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 160-03 — computer_application LivOS resolver dispatch (source-text invariants)
// ─────────────────────────────────────────────────────────────────────────────
//
// Locks the LivOS resolver path's shape: resolver runs BEFORE APP_MAP, dash-
// pattern URL is the only domain literal, IPC stderr line uses the
// `open_livos_app kind=…` shape, and Promise.all parallel query of
// listWebApps + listNativeApps is preserved. These are static-text checks
// (no runtime spawn) — they catch refactors that drift the dispatch shape
// or the URL pattern by mistake.

describe('Phase 160-03 — computer_application LivOS resolver dispatch', () => {
	const SRC = readFileSync(join(__dirname, 'tools.ts'), 'utf8')
	const WIN_SRC = readFileSync(join(__dirname, '..', 'native', 'window.ts'), 'utf8')

	it('handler calls livosAppResolver before APP_MAP fallback', () => {
		expect(SRC).toMatch(/livosAppResolver/)
	})

	it('handler emits open_livos_app IPC line on stderr when LivOS match', () => {
		expect(SRC).toMatch(/open_livos_app kind=/)
	})

	it('defaultLivosAppResolver exists in window.ts', () => {
		expect(WIN_SRC).toMatch(/export async function defaultLivosAppResolver/)
	})

	it('domain pattern is DASH separator (n8n-user.root) NOT dot', () => {
		// The literal we emit must use ${sub}-${deps.userSlug}.${deps.domainRoot}
		// — the dash between sub and userSlug is mandatory.
		expect(WIN_SRC).toMatch(/\$\{sub\}-\$\{deps\.userSlug\}\.\$\{deps\.domainRoot\}/)
		// Must NOT contain the wrong dot-pattern n8n.user.root anywhere
		expect(WIN_SRC).not.toMatch(/\$\{sub\}\.\$\{deps\.userSlug\}\.\$\{deps\.domainRoot\}/)
	})

	it('resolver queries WebApps AND Native apps in parallel', () => {
		expect(WIN_SRC).toMatch(/Promise\.all\(\[/)
		expect(WIN_SRC).toMatch(/listWebApps/)
		expect(WIN_SRC).toMatch(/listNativeApps/)
	})

	it('Phase 160-03 marker present in both files', () => {
		expect(SRC).toMatch(/Phase 160-03/)
		expect(WIN_SRC).toMatch(/Phase 160-03/)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 160-05 — computer_read_file path sandbox
// ─────────────────────────────────────────────────────────────────────────────
//
// Source-text invariants locking the sandbox literal. These guard against
// drift in (a) the allowlist composition, (b) the realpath-BEFORE-allowlist
// resolution order, (c) the rejection error shape (resolved path leaked
// but never content), and (d) the LUSE_USER_ID env wire-through. They are
// static-text checks (no runtime fs) — they catch a refactor that loses the
// guard or weakens the allowlist by mistake.

describe('Phase 160-05 — computer_read_file sandbox', () => {
	const SRC = readFileSync(join(__dirname, 'tools.ts'), 'utf8')

	it('isPathAllowed helper exists', () => {
		expect(SRC).toMatch(/function isPathAllowed/)
	})

	it('allowlist includes /home/<user>/', () => {
		expect(SRC).toMatch(/\/home\/\$\{userSlug\}\//)
	})

	it('allowlist includes /tmp/luse-* prefix', () => {
		expect(SRC).toMatch(/'\/tmp\/luse-'/)
	})

	it('allowlist includes /opt/livos/data/uploads/<userId>/', () => {
		expect(SRC).toMatch(/\/opt\/livos\/data\/uploads\/\$\{userId\}\//)
	})

	it('handler resolves symlinks via realpath BEFORE allowlist check', () => {
		// realpathFn(requestedPath) must appear before isPathAllowed(resolved
		// in source order — the whole point of resolving symlinks first is
		// so an allowlisted symlink that targets a non-allowlisted file is
		// still rejected by the allowlist check on the resolved target.
		const realpathIdx = SRC.indexOf('realpathFn(requestedPath)')
		const allowCheckIdx = SRC.indexOf('isPathAllowed(resolved')
		expect(realpathIdx).toBeGreaterThan(-1)
		expect(allowCheckIdx).toBeGreaterThan(-1)
		expect(realpathIdx).toBeLessThan(allowCheckIdx)
	})

	it('rejection includes resolved path (not content) — no info leakage', () => {
		expect(SRC).toMatch(/path outside sandbox: requested=/)
		expect(SRC).toMatch(/resolved=\$\{resolved\}/)
	})

	it('LUSE_USER_ID env drives userSlug + userId', () => {
		expect(SRC).toMatch(/process\.env\.LUSE_USER_ID/)
	})
})

// Functional rejection tests — drive the handler with hostile inputs and
// assert the sandbox blocks the read BEFORE readFileBase64 fires. Uses the
// __setRealpathForTest seam to simulate the kernel's symlink resolution
// without needing real files on disk (the test runs on Windows too).

describe('Phase 160-05 — computer_read_file sandbox runtime rejection', () => {
	beforeEach(() => {
		// Reset mocks so we can assert readFileBase64 was NOT called on reject.
		for (const fn of Object.values(mocks)) {
			fn.mockReset()
		}
		mocks.captureScreenshot.mockResolvedValue(SCREENSHOT_RESULT)
		mocks.setTimeoutMock.mockResolvedValue(undefined)
		mocks.readFileBase64.mockResolvedValue({
			base64: 'WlpaWg==',
			filename: 'should-not-be-called.txt',
			size: 4,
			mimeType: 'text/plain',
		})
	})

	afterEach(() => {
		__setRealpathForTest(undefined)
	})

	it('rejects /etc/passwd (absolute path outside sandbox)', async () => {
		__setRealpathForTest(async (p: string) => String(p))
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_read_file')!
		const result = (await handler({path: '/etc/passwd'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toMatch(/path outside sandbox/)
		expect(result.content[0].text).toMatch(/\/etc\/passwd/)
		expect(mocks.readFileBase64).not.toHaveBeenCalled()
	})

	it('rejects ../../etc/shadow traversal via resolved-path check', async () => {
		// Simulate the kernel resolving the relative traversal to /etc/shadow.
		// This is the realistic case: even if the agent passes a "../../" path
		// inside a bind-mounted user dir, realpath collapses it and the
		// allowlist check sees the post-traversal absolute path.
		__setRealpathForTest(async () => '/etc/shadow')
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_read_file')!
		const result = (await handler({path: '../../etc/shadow'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toMatch(/path outside sandbox/)
		expect(result.content[0].text).toMatch(/resolved=\/etc\/shadow/)
		expect(mocks.readFileBase64).not.toHaveBeenCalled()
	})

	it('rejects NUL-byte path before realpath even fires', async () => {
		const realpathSpy = vi.fn(async (p: string) => String(p))
		__setRealpathForTest(realpathSpy)
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_read_file')!
		const result = (await handler({path: '/home/bruce/foo\x00.txt'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toMatch(/NUL byte/)
		expect(realpathSpy).not.toHaveBeenCalled()
		expect(mocks.readFileBase64).not.toHaveBeenCalled()
	})

	it('rejects symlink-out-of-jail (allowed entry path, evil resolved target)', async () => {
		// Realistic attack: the agent points at /home/bruce/escape (an
		// allowlisted entry path) but the file is a symlink to /etc/passwd.
		// realpath collapses the symlink → allowlist check on the resolved
		// target rejects the read.
		__setRealpathForTest(async () => '/etc/passwd')
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_read_file')!
		const result = (await handler({path: '/home/bruce/escape'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toMatch(/path outside sandbox/)
		// Both requested AND resolved appear in the error (info for the LLM,
		// but the file content never leaks).
		expect(result.content[0].text).toMatch(/requested=\/home\/bruce\/escape/)
		expect(result.content[0].text).toMatch(/resolved=\/etc\/passwd/)
		expect(mocks.readFileBase64).not.toHaveBeenCalled()
	})

	it('accepts /tmp/luse-<anything>/ path (any luse-prefixed temp dir)', async () => {
		__setRealpathForTest(async (p: string) => String(p))
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_read_file')!
		const result = (await handler({path: '/tmp/luse-abc123/log.txt'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(result.isError).toBe(false)
		expect(mocks.readFileBase64).toHaveBeenCalledWith('/tmp/luse-abc123/log.txt')
	})

	it('accepts /opt/livos/data/uploads/<userId>/ path', async () => {
		// The default LUSE_USER_ID fallback inside the handler is 'bruce' so
		// the uploads branch is /opt/livos/data/uploads/bruce/.
		__setRealpathForTest(async (p: string) => String(p))
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_read_file')!
		const result = (await handler({path: '/opt/livos/data/uploads/bruce/photo.png'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(result.isError).toBe(false)
		expect(mocks.readFileBase64).toHaveBeenCalledWith('/opt/livos/data/uploads/bruce/photo.png')
	})

	it('rejects empty path (handler pre-flight before realpath)', async () => {
		const realpathSpy = vi.fn(async (p: string) => String(p))
		__setRealpathForTest(realpathSpy)
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_read_file')!
		const result = (await handler({path: ''})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toMatch(/path is required/)
		expect(realpathSpy).not.toHaveBeenCalled()
		expect(mocks.readFileBase64).not.toHaveBeenCalled()
	})

	it('returns realpath-error (no info leak) when path does not exist', async () => {
		// realpath throws on ENOENT — sandbox returns a "not found" message
		// that includes the requested path but not the file content (there
		// is no file content, so this is mostly a noise-suppression test).
		__setRealpathForTest(async () => {
			throw new Error('ENOENT')
		})
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_read_file')!
		const result = (await handler({path: '/home/bruce/does-not-exist.txt'})) as {
			content: Array<{type: string; text?: string}>
			isError: boolean
		}
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toMatch(/path not found or unreadable/)
		expect(mocks.readFileBase64).not.toHaveBeenCalled()
	})
})
