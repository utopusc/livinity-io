/**
 * Phase 72-native-02 — Native input primitives tests.
 *
 * Spec source: 72-native-02-PLAN.md `<task type="auto" tdd="true">` Task 1.
 *
 * Coverage (12+ cases per plan must-have list):
 *   T1:  All 11 named exports are functions with correct arities.
 *   T2:  moveMouse({x:100, y:200}) calls mouse.setPosition with a Point at (100, 200).
 *   T3:  clickMouse({coordinates:{x:50,y:60}, button:'left', clickCount:2}) → setPosition then click(LEFT) twice.
 *   T4:  clickMouse with holdKeys=['LeftShift'] → keyboard.pressKey(LeftShift) BEFORE click, releaseKey AFTER.
 *   T5:  dragMouse([{x:0,y:0},{x:100,y:100}], 'left') → setPosition→pressButton(LEFT)→setPosition path→releaseButton(LEFT).
 *   T6:  scroll({direction:'down', scrollCount:3}) → mouse.scrollDown(3) (NOT scrollUp/Left/Right).
 *   T7:  typeKeys(['LeftControl','C']) → keyboard.pressKey(LeftControl, C) then releaseKey in reverse.
 *   T8:  typeText('hi', 50) with delay > 0 → per-character keyboard.type with setTimeout between.
 *   T9:  pasteText('hi', isSensitive=true) logs a REDACTED message (no raw 'hi' in log).
 *   T10: pasteText('hello world') happy path: spawns xclip with stdin, then keyboard pressKey(LeftControl, V) + releaseKey.
 *   T11: pasteText('hello world') xclip-unavailable fallback: spawn ENOENT → falls back to keyboard.type(text).
 *   T12: getCursorPosition() returns {x:42, y:99} when mouse.getPosition resolves to a Point.
 *   T13 (defensive): Invalid holdKey name → throws clear error mentioning the key name.
 *   T14: traceMouse([points], holdKeys) presses keys, walks setPosition through each point, releases keys.
 *   T15: pressMouse({button:'right', press:'down'}) → calls mouse.pressButton(Button.RIGHT).
 *   T16: pressKeys(['LeftAlt'], 'up') → calls keyboard.releaseKey(LeftAlt).
 *
 * All nut-js + child_process calls are mocked. No real input dispatch occurs.
 */
import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {EventEmitter} from 'node:events'
import {Writable} from 'node:stream'

// ─────────────────────────────────────────────────────────────────────────────
// nut-js mock
// ─────────────────────────────────────────────────────────────────────────────
//
// We capture every method as a vi.fn() spy so tests can assert exact call
// sequences. Button + Key are reverse-mapped numeric enums in real nut-js;
// we simulate via plain string-keyed objects for grep-clarity in assertions.

const mouseMock = {
	setPosition: vi.fn(async (_pt: {x: number; y: number}) => undefined),
	getPosition: vi.fn(async () => ({x: 0, y: 0})),
	click: vi.fn(async (_btn: string) => undefined),
	doubleClick: vi.fn(async (_btn: string) => undefined),
	pressButton: vi.fn(async (_btn: string) => undefined),
	releaseButton: vi.fn(async (_btn: string) => undefined),
	scrollUp: vi.fn(async (_n: number) => undefined),
	scrollDown: vi.fn(async (_n: number) => undefined),
	scrollLeft: vi.fn(async (_n: number) => undefined),
	scrollRight: vi.fn(async (_n: number) => undefined),
}

const keyboardMock = {
	type: vi.fn(async (..._args: unknown[]) => undefined),
	pressKey: vi.fn(async (..._args: unknown[]) => undefined),
	releaseKey: vi.fn(async (..._args: unknown[]) => undefined),
	config: {autoDelayMs: 0},
}

// Point constructor spy — capture x/y for assertions.
const PointSpy = vi.fn(function PointCtor(x: number, y: number) {
	return {x, y, __isPoint: true}
})

// Reverse-mapped enums (mirror nut-js shape).
const ButtonEnum = {LEFT: 'LEFT', RIGHT: 'RIGHT', MIDDLE: 'MIDDLE'} as const

// Proxy so any Key.<Name> lookup returns the string name itself.
// Important: also lookup miss returns undefined for invalid names so our
// resolveKey runtime guard fires.
const KeyEnum: Record<string, string | undefined> = new Proxy({} as Record<string, string | undefined>, {
	get(_, prop) {
		if (typeof prop !== 'string') return undefined
		// Accept the same key names the upstream Bytebot system prompt advertises.
		// Reject obvious invalid ones to exercise the guard branch (T13).
		const VALID = new Set([
			'LeftShift',
			'RightShift',
			'LeftControl',
			'RightControl',
			'LeftAlt',
			'RightAlt',
			'LeftSuper',
			'RightSuper',
			'LeftMeta',
			'RightMeta',
			'Space',
			'Tab',
			'Enter',
			'Return',
			'Escape',
			'Backspace',
			'Delete',
			'Up',
			'Down',
			'Left',
			'Right',
			'Home',
			'End',
			'PageUp',
			'PageDown',
			'A',
			'B',
			'C',
			'D',
			'E',
			'F',
			'G',
			'H',
			'I',
			'J',
			'K',
			'L',
			'M',
			'N',
			'O',
			'P',
			'Q',
			'R',
			'S',
			'T',
			'U',
			'V',
			'W',
			'X',
			'Y',
			'Z',
			'F1',
			'F2',
			'F3',
			'F4',
			'F5',
			'F6',
			'F7',
			'F8',
			'F9',
			'F10',
			'F11',
			'F12',
		])
		if (!VALID.has(prop)) return undefined
		return prop
	},
})

vi.mock('@nut-tree-fork/nut-js', () => ({
	mouse: mouseMock,
	keyboard: keyboardMock,
	Point: PointSpy,
	Button: ButtonEnum,
	Key: KeyEnum,
}))

// ─────────────────────────────────────────────────────────────────────────────
// child_process mock — spawn returns an EventEmitter with a writable stdin.
// ─────────────────────────────────────────────────────────────────────────────

interface FakeChild extends EventEmitter {
	stdin: Writable
	exitCode: number | null
}

let spawnResult: 'success' | 'enoent' | 'nonzero' = 'success'
const spawnMock = vi.fn((..._args: unknown[]): FakeChild => {
	const child = new EventEmitter() as FakeChild
	const stdin = new Writable({
		write(_chunk, _enc, cb) {
			cb()
		},
	})
	child.stdin = stdin
	child.exitCode = null
	// Schedule async dispatch so callers can attach 'error' / 'close' listeners.
	setImmediate(() => {
		if (spawnResult === 'enoent') {
			const err = new Error('spawn xclip ENOENT') as Error & {code: string}
			err.code = 'ENOENT'
			child.emit('error', err)
		} else if (spawnResult === 'nonzero') {
			child.exitCode = 1
			child.emit('close', 1)
		} else {
			child.exitCode = 0
			child.emit('close', 0)
		}
	})
	return child
})

vi.mock('node:child_process', () => ({
	spawn: (...args: unknown[]) => spawnMock(...args),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

const SUT = await import('./input.js')

beforeEach(() => {
	mouseMock.setPosition.mockClear()
	mouseMock.getPosition.mockClear()
	mouseMock.click.mockClear()
	mouseMock.doubleClick.mockClear()
	mouseMock.pressButton.mockClear()
	mouseMock.releaseButton.mockClear()
	mouseMock.scrollUp.mockClear()
	mouseMock.scrollDown.mockClear()
	mouseMock.scrollLeft.mockClear()
	mouseMock.scrollRight.mockClear()
	keyboardMock.type.mockClear()
	keyboardMock.pressKey.mockClear()
	keyboardMock.releaseKey.mockClear()
	PointSpy.mockClear()
	spawnMock.mockClear()
	spawnResult = 'success'
})

afterEach(() => {
	vi.useRealTimers()
})

describe('input — exports', () => {
	it('T1: all 11 named exports are async functions', () => {
		const expected = [
			'moveMouse',
			'traceMouse',
			'clickMouse',
			'pressMouse',
			'dragMouse',
			'scroll',
			'typeKeys',
			'pressKeys',
			'typeText',
			'pasteText',
			'getCursorPosition',
		] as const
		for (const name of expected) {
			expect(typeof (SUT as Record<string, unknown>)[name]).toBe('function')
		}
	})
})

describe('input — moveMouse', () => {
	it('T2: setPosition is called with a Point at (100, 200)', async () => {
		await SUT.moveMouse({x: 100, y: 200})
		expect(PointSpy).toHaveBeenCalledWith(100, 200)
		expect(mouseMock.setPosition).toHaveBeenCalledTimes(1)
		const arg = mouseMock.setPosition.mock.calls[0]![0]
		expect(arg.x).toBe(100)
		expect(arg.y).toBe(200)
	})
})

describe('input — clickMouse', () => {
	it('T3: setPosition then click(LEFT) twice for clickCount=2', async () => {
		await SUT.clickMouse({coordinates: {x: 50, y: 60}, button: 'left', clickCount: 2})
		expect(mouseMock.setPosition).toHaveBeenCalledTimes(1)
		expect(mouseMock.click).toHaveBeenCalledTimes(2)
		expect(mouseMock.click).toHaveBeenCalledWith(ButtonEnum.LEFT)
	})

	it('T4: holdKeys press BEFORE click, release AFTER (correct ordering)', async () => {
		await SUT.clickMouse({
			coordinates: {x: 0, y: 0},
			button: 'left',
			clickCount: 1,
			holdKeys: ['LeftShift'],
		})
		// Determine call ordering via mock invocation timestamps (vitest gives
		// `mock.invocationCallOrder` per spy).
		const pressOrder = keyboardMock.pressKey.mock.invocationCallOrder[0]!
		const clickOrder = mouseMock.click.mock.invocationCallOrder[0]!
		const releaseOrder = keyboardMock.releaseKey.mock.invocationCallOrder[0]!
		expect(pressOrder).toBeLessThan(clickOrder)
		expect(clickOrder).toBeLessThan(releaseOrder)
		expect(keyboardMock.pressKey).toHaveBeenCalledWith('LeftShift')
		expect(keyboardMock.releaseKey).toHaveBeenCalledWith('LeftShift')
	})

	it('T4b: clickMouse with no coordinates skips setPosition (current cursor)', async () => {
		await SUT.clickMouse({button: 'right', clickCount: 1})
		expect(mouseMock.setPosition).not.toHaveBeenCalled()
		expect(mouseMock.click).toHaveBeenCalledWith(ButtonEnum.RIGHT)
	})
})

describe('input — dragMouse', () => {
	it('T5: pressButton(LEFT) → setPosition through path → releaseButton(LEFT)', async () => {
		await SUT.dragMouse([{x: 0, y: 0}, {x: 100, y: 100}], 'left')
		expect(mouseMock.pressButton).toHaveBeenCalledWith(ButtonEnum.LEFT)
		expect(mouseMock.releaseButton).toHaveBeenCalledWith(ButtonEnum.LEFT)
		expect(mouseMock.setPosition).toHaveBeenCalledTimes(2)
		const pressOrder = mouseMock.pressButton.mock.invocationCallOrder[0]!
		const firstSetPos = mouseMock.setPosition.mock.invocationCallOrder[0]!
		const lastSetPos = mouseMock.setPosition.mock.invocationCallOrder[1]!
		const releaseOrder = mouseMock.releaseButton.mock.invocationCallOrder[0]!
		expect(pressOrder).toBeLessThan(firstSetPos)
		expect(firstSetPos).toBeLessThan(lastSetPos)
		expect(lastSetPos).toBeLessThan(releaseOrder)
	})
})

describe('input — scroll', () => {
	it('T6: direction=down → scrollDown(3); other directions untouched', async () => {
		await SUT.scroll({coordinates: {x: 0, y: 0}, direction: 'down', scrollCount: 3})
		expect(mouseMock.scrollDown).toHaveBeenCalledWith(3)
		expect(mouseMock.scrollUp).not.toHaveBeenCalled()
		expect(mouseMock.scrollLeft).not.toHaveBeenCalled()
		expect(mouseMock.scrollRight).not.toHaveBeenCalled()
	})
})

describe('input — typeKeys', () => {
	it('T7: pressKey then releaseKey in reverse order for combo', async () => {
		await SUT.typeKeys(['LeftControl', 'C'])
		expect(keyboardMock.pressKey).toHaveBeenCalledTimes(1)
		// pressed in given order
		expect(keyboardMock.pressKey).toHaveBeenCalledWith('LeftControl', 'C')
		// released in REVERSE order (modifier last release per upstream)
		expect(keyboardMock.releaseKey).toHaveBeenCalledWith('C', 'LeftControl')
		const pressOrder = keyboardMock.pressKey.mock.invocationCallOrder[0]!
		const releaseOrder = keyboardMock.releaseKey.mock.invocationCallOrder[0]!
		expect(pressOrder).toBeLessThan(releaseOrder)
	})
})

describe('input — typeText', () => {
	it('T8: typeText with delay>0 calls keyboard.type per character with delay between', async () => {
		vi.useFakeTimers({toFake: ['setTimeout']})
		const promise = SUT.typeText('hi', 50)
		// Drain microtasks; first char should fire before any timer.
		await vi.advanceTimersByTimeAsync(0)
		expect(keyboardMock.type).toHaveBeenCalledTimes(1)
		expect(keyboardMock.type).toHaveBeenLastCalledWith('h')
		// Advance past the inter-character delay; second char fires.
		await vi.advanceTimersByTimeAsync(60)
		expect(keyboardMock.type).toHaveBeenCalledTimes(2)
		expect(keyboardMock.type).toHaveBeenLastCalledWith('i')
		await promise
		expect(keyboardMock.type).toHaveBeenCalledTimes(2)
	})

	it('T8b: typeText without delay does a single keyboard.type call', async () => {
		await SUT.typeText('hello world')
		expect(keyboardMock.type).toHaveBeenCalledTimes(1)
		expect(keyboardMock.type).toHaveBeenCalledWith('hello world')
	})
})

describe('input — pasteText', () => {
	it('T9: isSensitive=true logs a REDACTED message (no raw text)', async () => {
		const logs: string[] = []
		const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
			logs.push(args.map(String).join(' '))
		})
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
			logs.push(args.map(String).join(' '))
		})
		const infoSpy = vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
			logs.push(args.map(String).join(' '))
		})
		try {
			await SUT.pasteText('SECRET-PAYLOAD', true)
			const joined = logs.join('\n')
			expect(joined).toMatch(/REDACTED/)
			expect(joined).not.toMatch(/SECRET-PAYLOAD/)
		} finally {
			spy.mockRestore()
			warnSpy.mockRestore()
			infoSpy.mockRestore()
		}
	})

	it('T10: happy path spawns xclip then sends Ctrl+V via keyboard', async () => {
		spawnResult = 'success'
		await SUT.pasteText('hello world')
		expect(spawnMock).toHaveBeenCalledTimes(1)
		const [cmd, args] = spawnMock.mock.calls[0]! as [string, string[]]
		expect(cmd).toBe('xclip')
		expect(args).toEqual(['-selection', 'clipboard'])
		// Ctrl+V issued
		expect(keyboardMock.pressKey).toHaveBeenCalledWith('LeftControl', 'V')
		expect(keyboardMock.releaseKey).toHaveBeenCalledWith('V', 'LeftControl')
	})

	it('T11: ENOENT (xclip missing) falls back to keyboard.type(text)', async () => {
		spawnResult = 'enoent'
		await SUT.pasteText('hello world')
		// Fallback path: keyboard.type called with the raw text
		expect(keyboardMock.type).toHaveBeenCalledWith('hello world')
		// And NO Ctrl+V Combo issued (paste path skipped entirely)
		expect(keyboardMock.pressKey).not.toHaveBeenCalled()
	})

	it('T11b: xclip non-zero exit → falls back to keyboard.type', async () => {
		spawnResult = 'nonzero'
		await SUT.pasteText('hello world')
		expect(keyboardMock.type).toHaveBeenCalledWith('hello world')
		expect(keyboardMock.pressKey).not.toHaveBeenCalled()
	})
})

describe('input — getCursorPosition', () => {
	it('T12: returns plain {x, y} from mouse.getPosition Point', async () => {
		mouseMock.getPosition.mockResolvedValueOnce({x: 42, y: 99} as never)
		const result = await SUT.getCursorPosition()
		expect(result).toEqual({x: 42, y: 99})
	})
})

describe('input — defensive guards', () => {
	it('T13: invalid holdKey name → throws clear error mentioning the key', async () => {
		await expect(
			SUT.clickMouse({
				coordinates: {x: 0, y: 0},
				button: 'left',
				clickCount: 1,
				holdKeys: ['NotARealKey'],
			}),
		).rejects.toThrow(/NotARealKey/)
	})
})

describe('input — traceMouse', () => {
	it('T14: walks setPosition through each path point, holdKeys press/release', async () => {
		await SUT.traceMouse(
			[
				{x: 0, y: 0},
				{x: 50, y: 50},
				{x: 100, y: 100},
			],
			['LeftShift'],
		)
		expect(mouseMock.setPosition).toHaveBeenCalledTimes(3)
		expect(keyboardMock.pressKey).toHaveBeenCalledWith('LeftShift')
		expect(keyboardMock.releaseKey).toHaveBeenCalledWith('LeftShift')
	})
})

describe('input — pressMouse', () => {
	it('T15: press=down calls pressButton(RIGHT)', async () => {
		await SUT.pressMouse({coordinates: {x: 10, y: 20}, button: 'right', press: 'down'})
		expect(mouseMock.pressButton).toHaveBeenCalledWith(ButtonEnum.RIGHT)
		expect(mouseMock.releaseButton).not.toHaveBeenCalled()
	})

	it('T15b: press=up calls releaseButton(MIDDLE)', async () => {
		await SUT.pressMouse({button: 'middle', press: 'up'})
		expect(mouseMock.releaseButton).toHaveBeenCalledWith(ButtonEnum.MIDDLE)
		expect(mouseMock.pressButton).not.toHaveBeenCalled()
	})
})

describe('input — pressKeys', () => {
	it('T16: press=up → releaseKey(LeftAlt)', async () => {
		await SUT.pressKeys(['LeftAlt'], 'up')
		expect(keyboardMock.releaseKey).toHaveBeenCalledWith('LeftAlt')
		expect(keyboardMock.pressKey).not.toHaveBeenCalled()
	})

	it('T16b: press=down → pressKey(LeftControl, A)', async () => {
		await SUT.pressKeys(['LeftControl', 'A'], 'down')
		expect(keyboardMock.pressKey).toHaveBeenCalledWith('LeftControl', 'A')
		expect(keyboardMock.releaseKey).not.toHaveBeenCalled()
	})
})
