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
import {describe, it, expect, vi, beforeEach} from 'vitest'

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
import {registerLuseTools, HANDLERS} from './tools.js'

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

	it('T1: registers LUSE_TOOLS.length handlers (17 upstream + 3 P100-10-03 window-aware = 20)', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		// LUSE_TOOLS has 20 entries post-P100-10-03 (17 upstream + 3 window-aware).
		// The dispatcher registers all 20, but the 3 window-aware tools are
		// registered under their `mcp__luse__*` prefixed names while the 17
		// upstream tools register under their bare `tool.name` literals.
		expect(LUSE_TOOLS).toHaveLength(20)
		expect(stub.registered).toHaveLength(20)
	})

	it('T2: every LUSE_TOOL_NAMES entry has a registered handler (window-aware via mcp__luse__ prefix)', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const registeredNames = new Set(stub.registered.map((r) => r.name))
		const windowAware = new Set(['list_windows', 'screenshot_window', 'focus_window'])
		for (const name of LUSE_TOOL_NAMES) {
			if (windowAware.has(name)) {
				// P100-10-03 — registered under `mcp__luse__<name>` instead of bare name.
				expect(registeredNames.has(`mcp__luse__${name}`)).toBe(true)
			} else {
				expect(registeredNames.has(name)).toBe(true)
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
		const stub = new StubMcpServer()
		registerLuseTools(stub as never)
		const handler = stub.getHandler('computer_read_file')!
		const result = (await handler({path: '/tmp/foo.txt'})) as {
			content: Array<{type: string; text?: string; data?: string; mimeType?: string}>
			isError: boolean
		}

		expect(mocks.readFileBase64).toHaveBeenCalledWith('/tmp/foo.txt')
		expect(result.isError).toBe(false)
		// Some content surface — text describing the read OR an attached document.
		expect(result.content.length).toBeGreaterThanOrEqual(1)
		const concat = JSON.stringify(result.content)
		expect(concat).toMatch(/foo\.txt|ZmlsZQ==/)
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
		const registered = stub.registered.find((r) => r.name === 'mcp__luse__list_windows')
		expect(registered).toBeDefined()
	})

	it('T-10-03-HANDLER-02: registerLuseTools registers mcp__luse__screenshot_window', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const registered = stub.registered.find((r) => r.name === 'mcp__luse__screenshot_window')
		expect(registered).toBeDefined()
	})

	it('T-10-03-HANDLER-03: registerLuseTools registers mcp__luse__focus_window', () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const registered = stub.registered.find((r) => r.name === 'mcp__luse__focus_window')
		expect(registered).toBeDefined()
	})

	it('T-10-03-HANDLER-04: mcp__luse__list_windows defaults to opts.defaultDisplay (:10)', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const handler = stub.getHandler('mcp__luse__list_windows')!
		await handler({})
		expect(mocks.listWindows).toHaveBeenCalledTimes(1)
		const callArg = (mocks.listWindows.mock.calls as unknown as Array<Array<{display?: string} | undefined>>)[0]?.[0]
		expect(callArg).toBeDefined()
		expect(callArg!.display).toBe(':10')
	})

	it('T-10-03-HANDLER-05: mcp__luse__screenshot_window with {wid} calls captureScreenshot({wid}) and returns image content', async () => {
		const stub = new StubMcpServer()
		registerLuseTools(stub as never, {defaultDisplay: ':10'} as never)
		const handler = stub.getHandler('mcp__luse__screenshot_window')!
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
		const handler = stub.getHandler('mcp__luse__focus_window')!
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
			(r) => r.name === 'mcp__luse__create_stream',
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
			(r) => r.name === 'mcp__luse__list_streams',
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
		const handler = stub.getHandler('mcp__luse__create_stream')!
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
		const handler = stub.getHandler('mcp__luse__create_stream')!
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
		const handler = stub.getHandler('mcp__luse__list_streams')!
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
		const handler = stub.getHandler('mcp__luse__create_stream')!
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
