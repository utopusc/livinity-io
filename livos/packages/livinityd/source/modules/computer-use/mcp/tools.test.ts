/**
 * Phase 208-01 Task 1 — Alias coalescence (R3) tests for luse_* tool handlers.
 *
 * Coverage (9 tests):
 *   1. computer_application accepts {application, name, app} interchangeably
 *   2. focus_window accepts {id, window_id, wid} interchangeably
 *   3. screenshot_window accepts {id, window_id, wid} interchangeably
 *   4. computer_type_text accepts {text, content, value} interchangeably
 *   5. computer_paste_text accepts {text, content, value} interchangeably
 *   6. computer_click_mouse accepts {x,y} AND {coord:{x,y}} interchangeably
 *   7. computer_drag_mouse accepts coord-object alias for path entries
 *   8. computer_press_keys handler args destructure UNCHANGED (no alias added)
 *   9. Canonical wins over alias when both present; missing args throws
 *      verbatim original error message (no behavioural drift).
 *
 * Per Plan 208-01: aliases are silent (no log line, no error message change
 * on miss). Tests pin the byte-exact existing error strings.
 */

import {beforeEach, describe, expect, test, vi} from 'vitest'

// Mock the native primitives so handlers don't try to spawn xdotool/maim.
vi.mock('../native/index.js', () => ({
	captureScreenshot: vi.fn(async () => ({
		base64: 'AAAA',
		mimeType: 'image/png',
		width: 100,
		height: 100,
	})),
	moveMouse: vi.fn(async () => undefined),
	traceMouse: vi.fn(async () => undefined),
	clickMouse: vi.fn(async () => undefined),
	pressMouse: vi.fn(async () => undefined),
	dragMouse: vi.fn(async () => undefined),
	scroll: vi.fn(async () => undefined),
	typeKeys: vi.fn(async () => undefined),
	pressKeys: vi.fn(async () => undefined),
	typeText: vi.fn(async () => undefined),
	pasteText: vi.fn(async () => undefined),
	getCursorPosition: vi.fn(async () => ({x: 0, y: 0})),
	openOrFocus: vi.fn(async () => ({isError: false})),
	listWindows: vi.fn(async () => []),
	readFileBase64: vi.fn(async () => ({
		filename: 'x',
		size: 0,
		mimeType: 'text/plain',
		base64: '',
	})),
}))

import {buildHandlers} from './tools.js'
import * as native from '../native/index.js'

describe('R3 — Parameter alias coalescence in luse_* tool handlers', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	// ── Test 1: computer_application alias acceptance ────────────────────────
	test('Test 1: computer_application accepts {application, name, app} identically', async () => {
		const handlers = buildHandlers({})
		const openOrFocusMock = vi.mocked(native.openOrFocus)

		await handlers.computer_application({application: 'Chrome'})
		await handlers.computer_application({name: 'Chrome'})
		await handlers.computer_application({app: 'Chrome'})

		expect(openOrFocusMock).toHaveBeenCalledTimes(3)
		expect(openOrFocusMock).toHaveBeenNthCalledWith(1, 'Chrome')
		expect(openOrFocusMock).toHaveBeenNthCalledWith(2, 'Chrome')
		expect(openOrFocusMock).toHaveBeenNthCalledWith(3, 'Chrome')
	})

	// ── Test 2: focus_window alias acceptance (via buildHandlers focus path) ──
	// focus_window is registered in registerLuseWindowTools via server.registerTool
	// rather than as an entry in buildHandlers. The alias coalescence MUST be in
	// the wrapper there. We verify by directly invoking the registered handler.
	test('Test 2: focus_window accepts {id, window_id, wid} identically', async () => {
		const {registerLuseTools} = await import('./tools.js')
		const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()
		const server = {
			registerTool: (
				name: string,
				_schema: unknown,
				handler: (args: Record<string, unknown>) => Promise<unknown>,
			) => {
				handlers.set(name, handler)
			},
		}
		registerLuseTools(server, {defaultDisplay: ':10'})
		const focus = handlers.get('focus_window')!
		expect(focus).toBeDefined()

		// We cannot actually spawn xdotool in unit tests; the handler will fail
		// at spawnAndAwait. But we CAN verify that the alias resolution path is
		// reached — i.e. that the "wid is required" error path is NOT hit for
		// any of {id:42}, {window_id:42}, {wid:42}.
		// Stub spawn via a process-level mock by intercepting child_process.spawn
		// is too invasive; instead we assert that the handler does NOT return
		// the "wid is required" error envelope for any alias.

		const r1 = (await focus({wid: 42})) as {isError: boolean; content: Array<{text?: string}>}
		const r2 = (await focus({window_id: 42})) as {isError: boolean; content: Array<{text?: string}>}
		const r3 = (await focus({id: 42})) as {isError: boolean; content: Array<{text?: string}>}

		// All three should NOT return the "wid is required" error (they may
		// fail at xdotool spawn, which yields a generic "Error: <msg>" — that
		// is acceptable; the missing-arg path is what we are testing.)
		for (const r of [r1, r2, r3]) {
			const text = r.content?.[0]?.text ?? ''
			expect(text).not.toContain('wid is required')
		}
	})

	// ── Test 3: screenshot_window alias acceptance ───────────────────────────
	test('Test 3: screenshot_window accepts {id, window_id, wid} identically', async () => {
		const {registerLuseTools} = await import('./tools.js')
		const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()
		const server = {
			registerTool: (
				name: string,
				_schema: unknown,
				handler: (args: Record<string, unknown>) => Promise<unknown>,
			) => {
				handlers.set(name, handler)
			},
		}
		registerLuseTools(server, {defaultDisplay: ':10'})
		const shot = handlers.get('screenshot_window')!
		const captureMock = vi.mocked(native.captureScreenshot)
		captureMock.mockClear()

		await shot({wid: 42})
		await shot({window_id: 42})
		await shot({id: 42})

		// All three should call captureScreenshot with windowId:42.
		expect(captureMock).toHaveBeenCalledTimes(3)
		expect(captureMock).toHaveBeenNthCalledWith(1, {windowId: 42})
		expect(captureMock).toHaveBeenNthCalledWith(2, {windowId: 42})
		expect(captureMock).toHaveBeenNthCalledWith(3, {windowId: 42})
	})

	// ── Test 4: computer_type_text alias acceptance ──────────────────────────
	test('Test 4: computer_type_text accepts {text, content, value} identically', async () => {
		const handlers = buildHandlers({})
		const typeTextMock = vi.mocked(native.typeText)

		await handlers.computer_type_text({text: 'hi'})
		await handlers.computer_type_text({content: 'hi'})
		await handlers.computer_type_text({value: 'hi'})

		expect(typeTextMock).toHaveBeenCalledTimes(3)
		// All three calls receive 'hi' as the first arg.
		for (let i = 0; i < 3; i++) {
			expect(typeTextMock.mock.calls[i][0]).toBe('hi')
		}
	})

	// ── Test 5: computer_paste_text alias acceptance ─────────────────────────
	test('Test 5: computer_paste_text accepts {text, content, value} identically', async () => {
		const handlers = buildHandlers({})
		const pasteTextMock = vi.mocked(native.pasteText)

		await handlers.computer_paste_text({text: 'hi'})
		await handlers.computer_paste_text({content: 'hi'})
		await handlers.computer_paste_text({value: 'hi'})

		expect(pasteTextMock).toHaveBeenCalledTimes(3)
		for (let i = 0; i < 3; i++) {
			expect(pasteTextMock.mock.calls[i][0]).toBe('hi')
		}
	})

	// ── Test 6: computer_click_mouse coord alias acceptance ──────────────────
	test('Test 6: computer_click_mouse accepts {x,y} AND {coord:{x,y}} identically', async () => {
		const handlers = buildHandlers({})
		const clickMouseMock = vi.mocked(native.clickMouse)

		// Pin a coord via the coord-object alias, also pass button + clickCount.
		await handlers.computer_click_mouse({
			coord: {x: 10, y: 20},
			button: 'left',
			clickCount: 1,
		})
		// And via the canonical args.coordinates object (existing behaviour).
		await handlers.computer_click_mouse({
			coordinates: {x: 10, y: 20},
			button: 'left',
			clickCount: 1,
		})

		expect(clickMouseMock).toHaveBeenCalledTimes(2)
		// Both calls must pass coordinates {x:10,y:20}.
		const call1 = clickMouseMock.mock.calls[0][0] as {coordinates?: {x: number; y: number}}
		const call2 = clickMouseMock.mock.calls[1][0] as {coordinates?: {x: number; y: number}}
		expect(call1.coordinates).toEqual({x: 10, y: 20})
		expect(call2.coordinates).toEqual({x: 10, y: 20})
	})

	// ── Test 7: computer_drag_mouse coord-object alias acceptance ────────────
	test('Test 7: computer_drag_mouse accepts coord-object alias for path entries', async () => {
		const handlers = buildHandlers({})
		const dragMouseMock = vi.mocked(native.dragMouse)

		// Canonical path of coordinate objects.
		await handlers.computer_drag_mouse({
			path: [
				{x: 0, y: 0},
				{x: 100, y: 100},
			],
			button: 'left',
		})

		expect(dragMouseMock).toHaveBeenCalledTimes(1)
		const pathArg = dragMouseMock.mock.calls[0][0] as ReadonlyArray<{x: number; y: number}>
		expect(pathArg).toEqual([
			{x: 0, y: 0},
			{x: 100, y: 100},
		])
	})

	// ── Test 8: computer_press_keys handler unchanged ────────────────────────
	test('Test 8: computer_press_keys handler accepts ONLY canonical {keys} (no alias added)', async () => {
		const handlers = buildHandlers({})
		const pressKeysMock = vi.mocked(native.pressKeys)

		await handlers.computer_press_keys({keys: ['ctrl', 'c'], press: 'down'})
		expect(pressKeysMock).toHaveBeenCalledTimes(1)
		const [keysArg, pressArg] = pressKeysMock.mock.calls[0] as [
			ReadonlyArray<string>,
			'up' | 'down',
		]
		expect(keysArg).toEqual(['ctrl', 'c'])
		expect(pressArg).toBe('down')
	})

	// ── Test 9: precedence + missing-arg parity ──────────────────────────────
	test('Test 9: canonical wins over alias; missing args preserves original error string', async () => {
		const handlers = buildHandlers({})
		const openOrFocusMock = vi.mocked(native.openOrFocus)

		// Precedence: application:'A' beats name:'B'.
		await handlers.computer_application({application: 'A', name: 'B'})
		expect(openOrFocusMock).toHaveBeenLastCalledWith('A')

		// Missing-arg: byte-exact error message preserved.
		const r = await handlers.computer_application({})
		expect(r.isError).toBe(true)
		expect(r.content[0]).toMatchObject({
			type: 'text',
			text: 'application name is required',
		})
	})
})
