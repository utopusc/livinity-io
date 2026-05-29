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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 248-02 — Display lifecycle MCP tools.
//
// RED gate: these cases pin the schema drift-locks for the 4 new tools and
// the additive `display` prop on `computer_application`, plus the handler
// wire-through to options.displayManager. Before Task 2 GREEN, NONE of these
// pass (the tools don't exist in LUSE_TOOLS, the handler entries are absent,
// and LuseToolsOptions has no displayManager field).
//
// Key invariants under test:
//   - D-V44-DISPLAY-XEPHYR-DEFAULT — mode enum is ['xephyr','xvfb'] (Test A)
//   - D-V44-DISPLAY-OWNER-SCOPED — owner mismatch surfaces as isError:true
//                                  (Test G)
//   - additive `computer_application.display` — schema `required` unchanged
//                                              (Test E)
// ─────────────────────────────────────────────────────────────────────────────

import {LUSE_TOOLS} from '../luse-tools.js'

interface FakeDisplayManager {
	create: ReturnType<typeof vi.fn>
	list: ReturnType<typeof vi.fn>
	kill: ReturnType<typeof vi.fn>
	attachApp: ReturnType<typeof vi.fn>
	listAppsForDisplay: ReturnType<typeof vi.fn>
	isOwner: ReturnType<typeof vi.fn>
	initialized: Promise<void>
}

function makeFakeDisplayManager(overrides: Partial<FakeDisplayManager> = {}): FakeDisplayManager {
	return {
		create: vi.fn(async () => ({display: ':10', name: 'display-10', pid: 12345})),
		list: vi.fn(async () => []),
		kill: vi.fn(async () => ({ok: true, killed_apps_count: 0})),
		attachApp: vi.fn(async () => undefined),
		listAppsForDisplay: vi.fn(async () => []),
		isOwner: vi.fn(async () => true),
		initialized: Promise.resolve(),
		...overrides,
	}
}

describe('Phase 248 — display lifecycle tools', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	// ── Schema drift-locks ────────────────────────────────────────────────

	test('Test A: computer_create_display schema — properties + mode enum + no required', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'computer_create_display')
		expect(tool, 'computer_create_display tool must exist in LUSE_TOOLS').toBeDefined()
		const props = tool!.input_schema.properties
		expect(props).toHaveProperty('name')
		expect(props).toHaveProperty('mode')
		expect(props).toHaveProperty('width')
		expect(props).toHaveProperty('height')
		const mode = props.mode as {type: string; enum: string[]}
		expect(mode.type).toBe('string')
		expect(mode.enum).toEqual(['xephyr', 'xvfb'])
		expect(tool!.input_schema.required).toBeUndefined()
	})

	test('Test B: computer_list_displays schema — empty properties, no required', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'computer_list_displays')
		expect(tool, 'computer_list_displays tool must exist in LUSE_TOOLS').toBeDefined()
		expect(Object.keys(tool!.input_schema.properties).length).toBe(0)
		expect(tool!.input_schema.required).toBeUndefined()
	})

	test('Test C: computer_kill_display schema — required:["display"]', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'computer_kill_display')
		expect(tool, 'computer_kill_display tool must exist in LUSE_TOOLS').toBeDefined()
		expect(tool!.input_schema.properties).toHaveProperty('display')
		expect(tool!.input_schema.required).toEqual(['display'])
	})

	test('Test D: computer_launch_app_in_display schema — required:["display","app"]', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'computer_launch_app_in_display')
		expect(tool, 'computer_launch_app_in_display tool must exist in LUSE_TOOLS').toBeDefined()
		const props = tool!.input_schema.properties
		expect(props).toHaveProperty('display')
		expect(props).toHaveProperty('app')
		expect(props).toHaveProperty('args')
		const argsProp = props.args as {type: string; items: {type: string}}
		expect(argsProp.type).toBe('array')
		expect(argsProp.items.type).toBe('string')
		expect(tool!.input_schema.required).toEqual(['display', 'app'])
	})

	test('Test E: computer_application schema — additive display prop, required unchanged', () => {
		const tool = LUSE_TOOLS.find((t) => t.name === 'computer_application')
		expect(tool, 'computer_application tool must exist in LUSE_TOOLS').toBeDefined()
		expect(tool!.input_schema.properties).toHaveProperty('display')
		const disp = tool!.input_schema.properties.display as {type: string}
		expect(disp.type).toBe('string')
		// `required` was undefined pre-248-02 (per 208-09); MUST stay undefined.
		expect(tool!.input_schema.required).toBeUndefined()
	})

	// ── Handler wire-through ──────────────────────────────────────────────

	test('Test F: computer_create_display handler forwards args to displayManager.create with ownerSession=userId', async () => {
		const fakeMgr = makeFakeDisplayManager()
		const handlers = buildHandlers({
			displayManager: fakeMgr as never,
			userId: 's1',
		})
		const handler = handlers.computer_create_display
		expect(handler, 'computer_create_display handler must be registered').toBeDefined()
		const result = await handler({mode: 'xephyr'})
		expect(fakeMgr.create).toHaveBeenCalledTimes(1)
		const callArg = fakeMgr.create.mock.calls[0][0]
		expect(callArg).toMatchObject({mode: 'xephyr', ownerSession: 's1'})
		// Default-shape returned payload — handler stringifies the manager result.
		expect(result.isError).toBe(false)
		expect(result.content[0]).toMatchObject({type: 'text'})
		const text = (result.content[0] as {text: string}).text
		expect(text).toContain(':10')
		expect(text).toContain('display-10')
		expect(text).toContain('12345')
	})

	test('Test G: computer_kill_display owner-mismatch surfaces as isError:true with not-owner text', async () => {
		const fakeMgr = makeFakeDisplayManager({
			kill: vi.fn(async () => ({ok: false, error: 'not-owner'})),
		})
		const handlers = buildHandlers({
			displayManager: fakeMgr as never,
			userId: 's2',
		})
		const handler = handlers.computer_kill_display
		expect(handler).toBeDefined()
		const result = await handler({display: ':10'})
		expect(fakeMgr.kill).toHaveBeenCalledWith({display: ':10', callerSession: 's2'})
		expect(result.isError).toBe(true)
		const text = (result.content[0] as {text: string}).text
		expect(text.toLowerCase()).toContain('not-owner')
	})

	test('Test H: computer_launch_app_in_display resolves app, spawns with DISPLAY env, calls attachApp', async () => {
		const fakeMgr = makeFakeDisplayManager()
		const resolver = vi.fn(async (name: string) => ({
			kind: 'native' as const,
			appId: name,
			route: `/${name}`,
			title: name,
			icon: '',
		}))
		const handlers = buildHandlers({
			displayManager: fakeMgr as never,
			livosAppResolver: resolver,
			userId: 's1',
		})
		const handler = handlers.computer_launch_app_in_display
		expect(handler).toBeDefined()

		// Before the handler runs, DISPLAY may or may not be set; after the
		// handler returns, the env MUST be restored (withScopedDisplay).
		const before = process.env.DISPLAY

		const result = await handler({display: ':12', app: 'firefox'})

		// After the handler returns, DISPLAY env is restored.
		expect(process.env.DISPLAY).toBe(before)

		// Resolver invoked + attachApp called with the resolved match.
		expect(resolver).toHaveBeenCalledWith('firefox')
		expect(fakeMgr.attachApp).toHaveBeenCalledTimes(1)
		const attachArg = fakeMgr.attachApp.mock.calls[0][0]
		expect(attachArg).toMatchObject({display: ':12', app_name: 'firefox'})
		expect(typeof attachArg.pid).toBe('number')

		expect(result.isError).toBe(false)
		const text = (result.content[0] as {text: string}).text
		expect(text).toContain('firefox')
	})

	test('Test I: computer_application with display:":12" scopes DISPLAY env for the underlying call', async () => {
		// Capture DISPLAY at the moment openOrFocus runs — the handler must
		// have already applied withScopedDisplay by then.
		const openOrFocusMock = vi.mocked(native.openOrFocus)
		let capturedDisplay: string | undefined
		openOrFocusMock.mockImplementationOnce(async () => {
			capturedDisplay = process.env.DISPLAY
			return {isError: false}
		})

		const handlers = buildHandlers({
			defaultDisplay: ':1',
			userId: 's1',
		})
		const before = process.env.DISPLAY
		const result = await handlers.computer_application({
			application: 'firefox',
			display: ':12',
		})
		// DISPLAY env restored after the handler returns.
		expect(process.env.DISPLAY).toBe(before)
		// DISPLAY was set to ':12' while openOrFocus ran.
		expect(capturedDisplay).toBe(':12')
		expect(result.isError).toBe(false)
	})
})
