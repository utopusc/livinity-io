/**
 * Phase 72-native-05 — MCP tools dispatcher tests.
 *
 * Spec source: 72-native-05-PLAN.md `<task type="auto" tdd="true">` Task 1.
 *
 * Coverage (12 cases per plan must-have list):
 *   T1:  registerBytebotTools registers exactly BYTEBOT_TOOLS.length handlers (17).
 *   T2:  Each tool name from BYTEBOT_TOOL_NAMES has a registered handler.
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
import {BYTEBOT_TOOLS, BYTEBOT_TOOL_NAMES} from '../bytebot-tools.js'
import {registerBytebotTools, HANDLERS} from './tools.js'

// Minimal stub of the McpServer surface registerBytebotTools touches.
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

describe('registerBytebotTools', () => {
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

	it('T1: registers exactly BYTEBOT_TOOLS.length handlers (17)', () => {
		const stub = new StubMcpServer()
		registerBytebotTools(stub as never)
		expect(stub.registered).toHaveLength(BYTEBOT_TOOLS.length)
		expect(stub.registered).toHaveLength(17)
	})

	it('T2: every BYTEBOT_TOOL_NAMES entry has a registered handler', () => {
		const stub = new StubMcpServer()
		registerBytebotTools(stub as never)
		const registeredNames = new Set(stub.registered.map((r) => r.name))
		for (const name of BYTEBOT_TOOL_NAMES) {
			expect(registeredNames.has(name)).toBe(true)
			expect(typeof HANDLERS[name]).toBe('function')
		}
	})

	it('T3: computer_screenshot returns image content + isError:false; captureScreenshot called once', async () => {
		const stub = new StubMcpServer()
		registerBytebotTools(stub as never)
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
		registerBytebotTools(stub as never)
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
		registerBytebotTools(stub as never)
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
		registerBytebotTools(stub as never)
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
		registerBytebotTools(stub as never)
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
		expect(result._liv_meta?.tool).toBe('mcp_bytebot_set_task_status')
		// content text starts with NEEDS_HELP literal per D-NATIVE-08.
		expect(result.content[0].text).toMatch(/^NEEDS_HELP:/)
	})

	it('T8: set_task_status status=completed returns _liv_meta kind:completed', async () => {
		const stub = new StubMcpServer()
		registerBytebotTools(stub as never)
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
		registerBytebotTools(stub as never)
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
		registerBytebotTools(stub as never)
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
		registerBytebotTools(stub as never)
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
		registerBytebotTools(stub as never)
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
