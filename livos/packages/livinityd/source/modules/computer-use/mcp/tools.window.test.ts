/**
 * Phase 97-05 — buildHandlers windowId-threading tests.
 *
 * Coverage:
 *   T1 — buildHandlers({}) returns the same handler shape as the legacy
 *        HANDLERS export; calling computer_screenshot does not pass a
 *        windowId.
 *   T2 — buildHandlers({defaultWindowId: 7}) threads 7 into captureScreenshot
 *        when computer_screenshot is invoked without an args.windowId.
 *   T3 — Tool input args.windowId WINS over the server-level default.
 *   T4 — clickMouse: defaultWindowId is forwarded to native clickMouse;
 *        post-action screenshot ALSO inherits the same windowId.
 *   T5 — typeKeys + typeText: defaultWindowId reaches the native primitive
 *        as the trailing windowId argument.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest'

const mocks = vi.hoisted(() => ({
	captureScreenshot: vi.fn(),
	moveMouse: vi.fn(),
	traceMouse: vi.fn(),
	clickMouse: vi.fn(),
	pressMouse: vi.fn(),
	dragMouse: vi.fn(),
	scroll: vi.fn(),
	typeKeys: vi.fn(),
	pressKeys: vi.fn(),
	typeText: vi.fn(),
	pasteText: vi.fn(),
	getCursorPosition: vi.fn(),
	openOrFocus: vi.fn(),
	listWindows: vi.fn(),
	readFileBase64: vi.fn(),
	setTimeoutMock: vi.fn(),
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
	setTimeout: (ms: number) => mocks.setTimeoutMock(ms),
}))

import {buildHandlers, HANDLERS} from './tools.js'

const FAKE_PNG = {
	base64: 'aGVsbG8=',
	width: 800,
	height: 600,
	mimeType: 'image/png' as const,
}

beforeEach(() => {
	for (const m of Object.values(mocks)) {
		;(m as ReturnType<typeof vi.fn>).mockReset()
	}
	mocks.captureScreenshot.mockResolvedValue(FAKE_PNG)
	mocks.clickMouse.mockResolvedValue(undefined)
	mocks.moveMouse.mockResolvedValue(undefined)
	mocks.typeKeys.mockResolvedValue(undefined)
	mocks.pressKeys.mockResolvedValue(undefined)
	mocks.typeText.mockResolvedValue(undefined)
	mocks.setTimeoutMock.mockResolvedValue(undefined)
})

describe('buildHandlers (P97-05)', () => {
	it('T1: HANDLERS is buildHandlers({}) — computer_screenshot called without options gets undefined windowId', async () => {
		await HANDLERS.computer_screenshot!({})
		expect(mocks.captureScreenshot).toHaveBeenCalledTimes(1)
		// First call arg should be undefined (host-display) — not an object
		// containing windowId.
		const arg = mocks.captureScreenshot.mock.calls[0]![0]
		expect(arg).toBeUndefined()
	})

	it('T2: defaultWindowId threads into captureScreenshot when args.windowId absent', async () => {
		const h = buildHandlers({defaultWindowId: 7})
		await h.computer_screenshot!({})
		const arg = mocks.captureScreenshot.mock.calls[0]![0]
		expect(arg).toEqual({windowId: 7})
	})

	it('T3: args.windowId wins over defaultWindowId', async () => {
		const h = buildHandlers({defaultWindowId: 7})
		await h.computer_screenshot!({windowId: 99})
		const arg = mocks.captureScreenshot.mock.calls[0]![0]
		expect(arg).toEqual({windowId: 99})
	})

	it('T4: computer_click_mouse forwards windowId to native clickMouse AND post-action screenshot', async () => {
		const h = buildHandlers({defaultWindowId: 42})
		await h.computer_click_mouse!({coordinates: {x: 1, y: 2}, button: 'left', clickCount: 1})

		expect(mocks.clickMouse).toHaveBeenCalledTimes(1)
		const clickArg = mocks.clickMouse.mock.calls[0]![0] as {windowId?: number}
		expect(clickArg.windowId).toBe(42)

		// Post-action screenshot also windowed.
		expect(mocks.captureScreenshot).toHaveBeenCalledTimes(1)
		expect(mocks.captureScreenshot.mock.calls[0]![0]).toEqual({windowId: 42})
	})

	it('T5: typeKeys + typeText receive defaultWindowId as their trailing arg', async () => {
		const h = buildHandlers({defaultWindowId: 13})
		await h.computer_type_keys!({keys: ['LeftControl', 'C']})
		expect(mocks.typeKeys).toHaveBeenCalledTimes(1)
		// signature: typeKeys(keys, delay, windowId)
		const tkArgs = mocks.typeKeys.mock.calls[0]!
		expect(tkArgs[2]).toBe(13)

		await h.computer_type_text!({text: 'hello'})
		expect(mocks.typeText).toHaveBeenCalledTimes(1)
		// signature: typeText(text, delay, isSensitive, windowId)
		const ttArgs = mocks.typeText.mock.calls[0]!
		expect(ttArgs[3]).toBe(13)
	})

	it('T5b: pressKeys passes windowId as 3rd arg', async () => {
		const h = buildHandlers({defaultWindowId: 13})
		await h.computer_press_keys!({keys: ['LeftAlt'], press: 'down'})
		expect(mocks.pressKeys).toHaveBeenCalledTimes(1)
		// signature: pressKeys(keys, press, windowId)
		const args = mocks.pressKeys.mock.calls[0]!
		expect(args[2]).toBe(13)
	})

	it('T6: with no defaultWindowId AND no args.windowId, native primitives get undefined', async () => {
		await HANDLERS.computer_type_keys!({keys: ['LeftControl', 'C']})
		const args = mocks.typeKeys.mock.calls[0]!
		expect(args[2]).toBeUndefined()
	})
})

describe('registerBytebotTools — Auto-mode tool gating (P97-07)', () => {
	it('without skillReplayDeps: webapp_replay_skill NOT registered', async () => {
		const {registerBytebotTools} = await import('./tools.js')
		const registered: string[] = []
		const fakeServer = {
			registerTool: (name: string) => {
				registered.push(name)
			},
		}
		registerBytebotTools(fakeServer as never)
		expect(registered.includes('webapp_replay_skill')).toBe(false)
		// Sanity: standard bytebot tools are present.
		expect(registered.includes('computer_screenshot')).toBe(true)
	})

	it('with skillReplayDeps: webapp_replay_skill IS registered', async () => {
		const {registerBytebotTools} = await import('./tools.js')
		const registered: string[] = []
		const fakeServer = {
			registerTool: (name: string) => {
				registered.push(name)
			},
		}
		registerBytebotTools(fakeServer as never, {
			defaultWindowId: 1,
			skillReplayDeps: {pool: {} as never, userId: '00000000-0000-0000-0000-000000000001'},
		})
		expect(registered.includes('webapp_replay_skill')).toBe(true)
	})
})
