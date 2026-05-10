/**
 * Phase 97-02 — `input.*` per-window argv tests.
 *
 * Spec source: .planning/phases/97-auto-mode/97-PLAN.md task 97-02.
 *
 * Coverage matrix (per primitive × {with windowId, without windowId}):
 *   - clickMouse: argv with `--window <wid>`; argv without; nut-js fallback
 *     receives no windowId (host-display) when xdotool absent.
 *   - moveMouse: xdotool mousemove --window when set; nut-js setPosition
 *     when not set.
 *   - typeKeys: xdotool key --window for combos; falls back to nut-js when
 *     xdotool fails.
 *   - pressKeys: xdotool keydown/keyup --window when set.
 *   - typeText: xdotool type --window when set, with --delay if given.
 *
 * The mouse.config / keyboard.config nut-js bindings are mocked so the
 * module top-level autoDelayMs assignments don't crash.
 */
import {describe, it, expect, beforeEach, vi} from 'vitest'
import {EventEmitter} from 'node:events'
import {Writable} from 'node:stream'

const mouseMock = {
	setPosition: vi.fn(async (_pt: {x: number; y: number}) => undefined),
	getPosition: vi.fn(async () => ({x: 0, y: 0})),
	click: vi.fn(async (_btn: string) => undefined),
	pressButton: vi.fn(async (_btn: string) => undefined),
	releaseButton: vi.fn(async (_btn: string) => undefined),
	scrollUp: vi.fn(async (_n: number) => undefined),
	scrollDown: vi.fn(async (_n: number) => undefined),
	scrollLeft: vi.fn(async (_n: number) => undefined),
	scrollRight: vi.fn(async (_n: number) => undefined),
	config: {autoDelayMs: 0},
}

const keyboardMock = {
	type: vi.fn(async (..._args: unknown[]) => undefined),
	pressKey: vi.fn(async (..._args: unknown[]) => undefined),
	releaseKey: vi.fn(async (..._args: unknown[]) => undefined),
	config: {autoDelayMs: 0},
}

const PointSpy = vi.fn(function PointCtor(x: number, y: number) {
	return {x, y, __isPoint: true}
})

const ButtonEnum = {LEFT: 'LEFT', RIGHT: 'RIGHT', MIDDLE: 'MIDDLE'} as const

const KeyEnum: Record<string, string | undefined> = new Proxy(
	{} as Record<string, string | undefined>,
	{
		get(_, prop) {
			if (typeof prop !== 'string') return undefined
			const VALID = new Set([
				'LeftShift',
				'RightShift',
				'LeftControl',
				'RightControl',
				'LeftAlt',
				'RightAlt',
				'LeftSuper',
				'RightSuper',
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
				'V',
				'F1',
				'F4',
			])
			if (!VALID.has(prop)) return undefined
			return prop
		},
	},
)

vi.mock('@nut-tree-fork/nut-js', () => ({
	mouse: mouseMock,
	keyboard: keyboardMock,
	Point: PointSpy,
	Button: ButtonEnum,
	Key: KeyEnum,
}))

interface FakeChild extends EventEmitter {
	stdin: Writable
	exitCode: number | null
}

let xdotoolResult: 'success' | 'enoent' | 'nonzero' = 'success'
/**
 * Phase 100-09-03 — Optional per-call override for spawn behaviour. When set,
 * the matcher decides per-call whether to succeed/fail. Used by smoothMove
 * "fail-first" test to assert the helper halts after the first failure.
 */
let spawnPerCallResult: ((args: readonly string[], callIndex: number) => 'success' | 'nonzero' | 'enoent') | null = null
/**
 * Phase 100-09-03 — Stdout supplier for the cursor-position query used by
 * `getCursorPositionViaXdotool` (which spawns `xdotool getmouselocation
 * --shell` and parses `X=...Y=...` from stdout). Tests that exercise the
 * smoothMove integration with `tryXdotoolClick` set this so the helper
 * resolves a real start point.
 */
let getMouseLocationStdout: string | null = null
const spawnCalls: Array<{cmd: string; args: string[]}> = []
const spawnMock = vi.fn((command: string, args?: readonly string[], _opts?: unknown): FakeChild => {
	const argv = [...(args ?? [])]
	const callIndex = spawnCalls.length
	spawnCalls.push({cmd: command, args: argv})
	const child = new EventEmitter() as FakeChild
	child.stdin = new Writable({
		write(_c, _e, cb) {
			cb()
		},
	})
	// Phase 100-09-03 — synthesize a stdout pipe so getCursorPositionViaXdotool
	// can read X=/Y= lines. EventEmitter cast with a `pipe`-shaped emitter.
	const stdoutEmitter = new EventEmitter() as EventEmitter & {readable?: boolean}
	;(child as unknown as {stdout: EventEmitter}).stdout = stdoutEmitter
	child.exitCode = null
	let result: 'success' | 'enoent' | 'nonzero' = 'success'
	if (command === 'xdotool') {
		if (spawnPerCallResult) {
			result = spawnPerCallResult(argv, callIndex)
		} else {
			result = xdotoolResult
		}
	}
	setImmediate(() => {
		if (result === 'enoent') {
			const err = new Error(`spawn ${command} ENOENT`) as Error & {code: string}
			err.code = 'ENOENT'
			child.emit('error', err)
			return
		}
		// Emit stdout for getmouselocation calls (success path) so the
		// cursor-position helper can parse X=/Y= lines.
		if (command === 'xdotool' && argv[0] === 'getmouselocation' && getMouseLocationStdout !== null) {
			stdoutEmitter.emit('data', Buffer.from(getMouseLocationStdout, 'utf-8'))
		}
		if (result === 'nonzero') {
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
	spawn: (...args: unknown[]) => spawnMock(...(args as Parameters<typeof spawnMock>)),
}))

const SUT = await import('./input.js')

beforeEach(() => {
	mouseMock.setPosition.mockClear()
	mouseMock.click.mockClear()
	keyboardMock.type.mockClear()
	keyboardMock.pressKey.mockClear()
	keyboardMock.releaseKey.mockClear()
	PointSpy.mockClear()
	spawnMock.mockClear()
	spawnCalls.length = 0
	xdotoolResult = 'success'
	spawnPerCallResult = null
	getMouseLocationStdout = null
})

const xdotoolCalls = () => spawnCalls.filter((c) => c.cmd === 'xdotool')

describe('clickMouse — windowId (P97-02)', () => {
	it('without windowId: xdotool argv has no --window', async () => {
		// Phase 100-09-03 — provide getmouselocation stdout so the smoothMove
		// path runs to completion. Then the click verb is dispatched in a
		// SEPARATE spawn (no mousemove sub-command — smoothMove handled
		// approach).
		getMouseLocationStdout = 'X=0\nY=0\nSCREEN=0\nWINDOW=0\n'
		await SUT.clickMouse({coordinates: {x: 10, y: 20}, button: 'left', clickCount: 1})
		const calls = xdotoolCalls()
		expect(calls.length).toBeGreaterThan(0)
		// The click-chain spawn is the one containing 'click' verb.
		const clickChain = calls.find((c) => c.args.includes('click'))
		expect(clickChain).toBeDefined()
		expect(clickChain!.args.includes('--window')).toBe(false)
		// smoothMove ran ≥1 mousemove spawn — assert at least one happened.
		const moveCalls = calls.filter((c) => c.args[0] === 'mousemove')
		expect(moveCalls.length).toBeGreaterThan(0)
	})

	it('with windowId: xdotool argv includes --window <wid> on both mousemove and click', async () => {
		await SUT.clickMouse({
			coordinates: {x: 10, y: 20},
			button: 'left',
			clickCount: 1,
			windowId: 0x2800002,
		})
		const args = xdotoolCalls()[0]!.args
		const wid = String(0x2800002)
		// mousemove --window <wid> --sync 10 20
		const moveIdx = args.indexOf('mousemove')
		expect(moveIdx).toBe(0)
		expect(args[1]).toBe('--window')
		expect(args[2]).toBe(wid)
		expect(args[3]).toBe('--sync')
		expect(args[4]).toBe('10')
		expect(args[5]).toBe('20')
		// click --window <wid> --clearmodifiers 1
		const clickIdx = args.indexOf('click')
		expect(clickIdx).toBeGreaterThan(0)
		expect(args[clickIdx + 1]).toBe('--window')
		expect(args[clickIdx + 2]).toBe(wid)
	})

	it('with windowId + count > 1: --repeat is preserved alongside --window', async () => {
		await SUT.clickMouse({
			coordinates: {x: 1, y: 2},
			button: 'right',
			clickCount: 3,
			windowId: 42,
		})
		const args = xdotoolCalls()[0]!.args
		expect(args.includes('--repeat')).toBe(true)
		expect(args[args.indexOf('--repeat') + 1]).toBe('3')
		// Right mouse = X11 button "3"
		expect(args[args.length - 1]).toBe('3')
		expect(args.filter((a) => a === '--window').length).toBe(2)
	})
})

describe('moveMouse — windowId (P97-02)', () => {
	it('without windowId: nut-js setPosition path', async () => {
		await SUT.moveMouse({x: 5, y: 6})
		expect(mouseMock.setPosition).toHaveBeenCalledTimes(1)
		expect(xdotoolCalls()).toHaveLength(0)
	})

	it('with windowId: xdotool mousemove --window <wid> --sync', async () => {
		await SUT.moveMouse({x: 5, y: 6}, 12345)
		const args = xdotoolCalls()[0]!.args
		expect(args).toEqual(['mousemove', '--window', '12345', '--sync', '5', '6'])
		expect(mouseMock.setPosition).not.toHaveBeenCalled()
	})

	it('xdotool failure with windowId falls back to nut-js setPosition', async () => {
		xdotoolResult = 'enoent'
		await SUT.moveMouse({x: 5, y: 6}, 12345)
		expect(mouseMock.setPosition).toHaveBeenCalledTimes(1)
	})
})

describe('typeKeys — windowId (P97-02)', () => {
	it('without windowId: nut-js path (no xdotool spawn)', async () => {
		await SUT.typeKeys(['LeftControl', 'C'])
		expect(xdotoolCalls()).toHaveLength(0)
		expect(keyboardMock.pressKey).toHaveBeenCalled()
		expect(keyboardMock.releaseKey).toHaveBeenCalled()
	})

	it('with windowId on a combo: single xdotool key --window <wid> ctrl+c', async () => {
		await SUT.typeKeys(['LeftControl', 'C'], undefined, 7)
		const calls = xdotoolCalls()
		expect(calls).toHaveLength(1)
		expect(calls[0]!.args).toEqual(['key', '--window', '7', '--clearmodifiers', 'ctrl+c'])
		// nut-js path NOT taken.
		expect(keyboardMock.pressKey).not.toHaveBeenCalled()
	})

	it('with windowId on a sequence: one xdotool key per keysym', async () => {
		await SUT.typeKeys(['Tab', 'Tab', 'Enter'], undefined, 9)
		const calls = xdotoolCalls()
		expect(calls).toHaveLength(3)
		expect(calls[0]!.args).toEqual(['key', '--window', '9', '--clearmodifiers', 'Tab'])
		expect(calls[2]!.args).toEqual(['key', '--window', '9', '--clearmodifiers', 'Return'])
	})

	it('with windowId + xdotool unavailable: falls back to nut-js host-display', async () => {
		xdotoolResult = 'enoent'
		await SUT.typeKeys(['LeftControl', 'C'], undefined, 7)
		expect(keyboardMock.pressKey).toHaveBeenCalled()
	})
})

describe('pressKeys — windowId (P97-02)', () => {
	it('with windowId + down: xdotool keydown --window <wid> ctrl', async () => {
		await SUT.pressKeys(['LeftControl'], 'down', 100)
		const args = xdotoolCalls()[0]!.args
		expect(args).toEqual(['keydown', '--window', '100', '--clearmodifiers', 'ctrl'])
	})

	it('with windowId + up: xdotool keyup', async () => {
		await SUT.pressKeys(['LeftControl'], 'up', 100)
		const args = xdotoolCalls()[0]!.args
		expect(args[0]).toBe('keyup')
	})

	it('without windowId: nut-js pressKey/releaseKey path', async () => {
		await SUT.pressKeys(['LeftControl'], 'down')
		expect(xdotoolCalls()).toHaveLength(0)
		expect(keyboardMock.pressKey).toHaveBeenCalled()
	})
})

describe('typeText — windowId (P97-02)', () => {
	it('with windowId + delay: xdotool type --window <wid> --delay <ms> -- text', async () => {
		await SUT.typeText('hello', 50, false, 200)
		const args = xdotoolCalls()[0]!.args
		expect(args).toEqual(['type', '--window', '200', '--delay', '50', '--', 'hello'])
		expect(keyboardMock.type).not.toHaveBeenCalled()
	})

	it('with windowId no delay: --delay flag absent', async () => {
		await SUT.typeText('hi', undefined, false, 200)
		const args = xdotoolCalls()[0]!.args
		expect(args.includes('--delay')).toBe(false)
		expect(args[args.length - 1]).toBe('hi')
	})

	it('without windowId: nut-js keyboard.type path', async () => {
		await SUT.typeText('hello')
		expect(xdotoolCalls()).toHaveLength(0)
		expect(keyboardMock.type).toHaveBeenCalled()
	})
})

/**
 * Phase 100-09-03 — smoothMove (selfclaude interpolation pattern).
 *
 * SelfClaude (https://github.com/utopusc/selfclaude) walks the cursor along
 * a linearly-interpolated path between current and target positions in
 * `steps` increments, dispatching each step via `xdotool mousemove --sync`
 * with a `delayMs` sleep between steps. Replaces the teleport-style
 * one-shot mousemove that Luse's click chain previously emitted.
 *
 * Tests:
 *   - T-09-03-01 — interpolation correctness (5 steps from (0,0) → (100,100)).
 *   - T-09-03-02 — halt-on-failure (no half-trajectory).
 *   - T-09-03-03 — tryXdotoolClick invokes smoothMove BEFORE the click chain.
 */
describe('Phase 100-09-03 smoothMove (selfclaude interpolation)', () => {
	beforeEach(() => {
		// Inherit the file-level beforeEach reset; nothing extra.
	})

	it('T-09-03-01: smoothMove(100,100,0,0,5,0) calls spawnXdotool 5x with interpolated mousemove argv', async () => {
		const ok = await SUT.smoothMove(100, 100, 0, 0, 5, 0)
		expect(ok).toBe(true)
		const moveCalls = xdotoolCalls().filter((c) => c.args[0] === 'mousemove')
		expect(moveCalls).toHaveLength(5)
		// Step 1: t=0.2 → (20, 20).
		expect(moveCalls[0]!.args).toEqual(['mousemove', '--sync', '20', '20'])
		// Step 3: t=0.6 → (60, 60).
		expect(moveCalls[2]!.args).toEqual(['mousemove', '--sync', '60', '60'])
		// Step 5: t=1.0 → (100, 100).
		expect(moveCalls[4]!.args).toEqual(['mousemove', '--sync', '100', '100'])
	})

	it('T-09-03-02: smoothMove halts on first xdotool failure (no half-trajectory)', async () => {
		// Per-call override: first xdotool call fails (nonzero), all subsequent
		// would succeed — but smoothMove MUST stop after the first failure so
		// no further xdotool invocations are made.
		spawnPerCallResult = (_args, callIndex) => (callIndex === 0 ? 'nonzero' : 'success')
		const ok = await SUT.smoothMove(100, 100, 0, 0, 5, 0)
		expect(ok).toBe(false)
		// Only ONE spawn invoked (the failing one); no further interpolation.
		const moveCalls = xdotoolCalls().filter((c) => c.args[0] === 'mousemove')
		expect(moveCalls).toHaveLength(1)
	})

	it('T-09-03-03: tryXdotoolClick(coordinates, windowId) invokes smoothMove BEFORE the focused click chain', async () => {
		// Mock getmouselocation to return X=50, Y=50.
		getMouseLocationStdout = 'X=50\nY=50\nSCREEN=0\nWINDOW=0\n'
		await SUT.clickMouse({
			coordinates: {x: 200, y: 200},
			button: 'left',
			clickCount: 1,
			windowId: 0xa1b2c3,
		})
		const calls = xdotoolCalls()
		// First xdotool call must be getmouselocation (smoothMove start lookup).
		expect(calls[0]?.args[0]).toBe('getmouselocation')
		// Default steps=20: at least 20 mousemove calls follow.
		const moveCalls = calls.filter((c) => c.args[0] === 'mousemove')
		expect(moveCalls.length).toBeGreaterThanOrEqual(20)
		// Final mousemove (step 20) lands on the target.
		const lastMove = moveCalls[moveCalls.length - 1]!.args
		expect(lastMove).toEqual(['mousemove', '--sync', '200', '200'])
		// The click chain (windowactivate ... click) is dispatched in a SINGLE
		// xdotool spawn AFTER all smoothMove steps.
		const clickChain = calls.find((c) => c.args[0] === 'windowactivate')
		expect(clickChain).toBeDefined()
		expect(clickChain!.args).toContain('click')
		// The click chain must come AFTER the last mousemove call (smoothMove
		// before click — the assertion that proves Bug 3 is closed).
		const clickChainIdx = calls.indexOf(clickChain!)
		const lastMoveIdx = calls.lastIndexOf(moveCalls[moveCalls.length - 1]!)
		expect(clickChainIdx).toBeGreaterThan(lastMoveIdx)
	})
})
