/**
 * Native input primitives — port of Bytebot's bytebotd computer-use action handlers.
 *
 * Upstream reference (Apache 2.0):
 *   https://github.com/bytebot-ai/bytebot
 *   Files:
 *     packages/bytebotd/src/computer-use/computer-use.service.ts (action dispatch)
 *     packages/bytebotd/src/nut/nut.service.ts (nut-js wrappers)
 *   Snapshot date: 2026-05-05
 *
 * APIs ported: mouse.* (setPosition, click, pressButton, releaseButton, scroll*, getPosition),
 *              keyboard.* (pressKey, releaseKey, type), Point, Key, Button — all from
 *              @nut-tree-fork/nut-js@^4.2.6.
 *
 * Strategy: pure async functions, one per 72-01 BYTEBOT_TOOLS schema. Param shapes match
 * the upstream tool schemas verbatim so 72-native-05's MCP handlers are direct dispatchers.
 *
 * Apache 2.0 NOTICE: full license text mirrored at
 * `.planning/licenses/bytebot-LICENSE.txt` (file already present from 72-01 / 72-02
 * attribution work).
 *
 * Architecture decisions (per .planning/phases/72-computer-use-agent-loop/72-CONTEXT.md):
 *   D-NATIVE-04 — Input port surface: 11 functions matching 72-01 tool schemas verbatim.
 *   D-NATIVE-06 — Pure functions, no NestJS / DI / decorators.
 *   D-NATIVE-12 — Sole new npm dep is @nut-tree-fork/nut-js@^4.2.6.
 *   D-NATIVE-14 — Platform guard: clear error if nut-js native binding fails.
 *   D-NATIVE-15 — Sacred SHA `4f868d31...` of nexus/packages/core/src/sdk-agent-runner.ts
 *                 unchanged across this plan.
 *
 * Pure async functions — no NestJS, no class wrapping, no DI. Bytebot upstream
 * uses a NestJS service; the IMPLEMENTATION STRATEGY (the nut-js calls) is
 * what we port, not the framework wrapping.
 */
import {spawn} from 'node:child_process'

import {mouse, keyboard, Point, Key, Button} from '@nut-tree-fork/nut-js'

/**
 * 2026-05-07 P79-06 — Match upstream Bytebot's autoDelayMs config.
 *
 * nut-js's default `autoDelayMs` is 10ms — the gap inserted between
 * press/release inside `mouse.click()` and `keyboard.pressKey()`. Upstream
 * Bytebot sets this to 100ms in NutService's constructor:
 *   github.com/bytebot-ai/bytebot
 *   packages/bytebotd/src/nut/nut.service.ts:126-127
 *
 * 10ms is fine on upstream's Xvfb + xfwm4 combo (permissive synthetic-event
 * delivery). On real GNOME Shell + Mutter (our deploy target), 10ms is too
 * fast — GTK/GNOME modal dialogs miss the click as a button activation
 * because mutter coalesces or filters press/release pairs that arrive
 * faster than its input-grab cycle. Symptom: mouse moves to "Cancel"
 * button, click events fire, but the dialog never closes.
 *
 * Module-level config (vs NutService constructor) because we don't have a
 * class wrapping (D-NATIVE-06: pure functions, no NestJS).
 */
mouse.config.autoDelayMs = 100
keyboard.config.autoDelayMs = 100

/**
 * Sleep N milliseconds. Uses the global `setTimeout` so vitest fake timers
 * (`vi.useFakeTimers()`) can advance through the wait without real wall time.
 * Avoids `node:timers/promises` whose setTimeout is harder to fake in vitest.
 */
function sleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms)
	})
}

/**
 * Modifier keys recognized by nut-js. typeKeys uses this to decide between
 * combo-press (modifier+key, e.g. Ctrl+C) and sequential-press (Tab,Tab,Tab).
 * nut-js's `pressKey(...keys)` spread form internally builds an X11 modifier
 * flag mask — it throws "Invalid key flag specified" when ALL keys are
 * non-modifiers because no modifier flag can be derived. Sequential typing
 * must use per-key press+release.
 */
const MODIFIER_KEY_NAMES: ReadonlySet<string> = new Set([
	'LeftAlt',
	'RightAlt',
	'LeftShift',
	'RightShift',
	'LeftControl',
	'RightControl',
	'LeftSuper',
	'RightSuper',
	'LeftWin',
	'RightWin',
	'LeftCmd',
	'RightCmd',
	'Fn',
	'Menu',
])

// ─────────────────────────────────────────────────────────────────────────────
// Shared types (mirror 72-01 BYTEBOT_TOOLS schema field shapes verbatim).
// ─────────────────────────────────────────────────────────────────────────────

export interface Coords {
	x: number
	y: number
}

export type ButtonName = 'left' | 'right' | 'middle'
export type ScrollDirection = 'up' | 'down' | 'left' | 'right'
export type PressMode = 'up' | 'down'

// ─────────────────────────────────────────────────────────────────────────────
// String → nut-js enum lookups.
//
// Bytebot tool calls arrive as JSON, so the agent passes button names + key
// names as plain strings. We translate at the input boundary.
// ─────────────────────────────────────────────────────────────────────────────

const BUTTON_MAP: Record<ButtonName, Button> = {
	left: Button.LEFT,
	right: Button.RIGHT,
	middle: Button.MIDDLE,
}

/**
 * Translate a string key name (from Bytebot tool schema, e.g. 'LeftShift', 'A')
 * into the corresponding nut-js {@link Key} enum value.
 *
 * Throws a clear error if the name is not a known Key — surfaces as an
 * isError tool result on the MCP boundary rather than a daemon crash
 * (T-72N2-04 mitigation).
 */
function resolveKey(name: string): Key {
	// Direct enum lookup — nut-js Keys are reverse-mapped numeric enum members,
	// so `Key[name]` either returns the numeric value or undefined.
	const value = (Key as unknown as Record<string, Key | undefined>)[name]
	if (value === undefined) {
		throw new Error(
			`Unknown key name: ${JSON.stringify(name)}. ` +
				`Must be a member of the nut-js Key enum (e.g. 'LeftShift', 'LeftControl', 'A', 'F1').`,
		)
	}
	return value
}

function resolveKeys(names: readonly string[]): Key[] {
	return names.map(resolveKey)
}

/**
 * Run an action with a set of modifier keys held down.
 *
 * Press order: provided order. Release order: REVERSED (modifier-last release
 * pattern from upstream, matches what most apps expect).
 *
 * Wraps in try/finally so a thrown action doesn't leave keys stuck pressed.
 */
async function withHeldKeys<T>(holdKeys: readonly string[] | undefined, action: () => Promise<T>): Promise<T> {
	if (!holdKeys || holdKeys.length === 0) {
		return action()
	}
	const keys = resolveKeys(holdKeys)
	await keyboard.pressKey(...keys)
	try {
		return await action()
	} finally {
		await keyboard.releaseKey(...[...keys].reverse())
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Mouse primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Move the mouse cursor to absolute coordinates. Mirrors `_moveMouseTool`
 * (computer_move_mouse). Required-coordinates per upstream schema.
 */
export async function moveMouse(coordinates: Coords): Promise<void> {
	await mouse.setPosition(new Point(coordinates.x, coordinates.y))
}

/**
 * Walk the cursor through a path of points (no buttons held). Mirrors
 * `_traceMouseTool` (computer_trace_mouse). Optional holdKeys.
 */
export async function traceMouse(path: readonly Coords[], holdKeys?: readonly string[]): Promise<void> {
	await withHeldKeys(holdKeys, async () => {
		for (const point of path) {
			await mouse.setPosition(new Point(point.x, point.y))
		}
	})
}

/**
 * Click a mouse button N times at optional coordinates. Mirrors
 * `_clickMouseTool` (computer_click_mouse). When `coordinates` is undefined,
 * clicks at the current cursor position (per upstream).
 */
export async function clickMouse(opts: {
	coordinates?: Coords
	button: ButtonName
	clickCount: number
	holdKeys?: readonly string[]
}): Promise<void> {
	const btn = BUTTON_MAP[opts.button]
	await withHeldKeys(opts.holdKeys, async () => {
		if (opts.coordinates) {
			await mouse.setPosition(new Point(opts.coordinates.x, opts.coordinates.y))
		}
		const count = Math.max(1, Math.floor(opts.clickCount))
		for (let i = 0; i < count; i++) {
			await mouse.click(btn)
		}
	})
}

/**
 * Press or release a mouse button. Mirrors `_pressMouseTool`
 * (computer_press_mouse). Used by agents that want explicit control over
 * button state (e.g. drag-with-modifier).
 */
export async function pressMouse(opts: {
	coordinates?: Coords
	button: ButtonName
	press: PressMode
}): Promise<void> {
	const btn = BUTTON_MAP[opts.button]
	if (opts.coordinates) {
		await mouse.setPosition(new Point(opts.coordinates.x, opts.coordinates.y))
	}
	if (opts.press === 'down') {
		await mouse.pressButton(btn)
	} else {
		await mouse.releaseButton(btn)
	}
}

/**
 * Drag through a path of points with a button held. Mirrors `_dragMouseTool`
 * (computer_drag_mouse). Implementation: setPosition(start) → pressButton →
 * setPosition through path → releaseButton.
 *
 * Done manually instead of via nut-js' built-in `mouse.drag(path)` to keep
 * holdKeys press/release ordering consistent with click/scroll.
 */
export async function dragMouse(
	path: readonly Coords[],
	button: ButtonName,
	holdKeys?: readonly string[],
): Promise<void> {
	if (path.length === 0) return
	const btn = BUTTON_MAP[button]
	await withHeldKeys(holdKeys, async () => {
		// Press first, then walk all points (including the first), then release.
		// Order: pressButton → setPosition[0] → setPosition[1] → ... → releaseButton.
		// Matches upstream Bytebot upstream pattern (pressButton encloses ALL
		// position events) so drag-with-modifier and drag-and-select work as
		// users expect — the first cursor move is part of the drag, not a
		// separate "anchor" event.
		await mouse.pressButton(btn)
		try {
			for (const point of path) {
				await mouse.setPosition(new Point(point.x, point.y))
			}
		} finally {
			await mouse.releaseButton(btn)
		}
	})
}

/**
 * Scroll the wheel in a direction at coordinates. Mirrors `_scrollTool`
 * (computer_scroll). nut-js exposes 4 separate scroll* APIs; we dispatch
 * by direction.
 */
export async function scroll(opts: {
	coordinates: Coords
	direction: ScrollDirection
	scrollCount: number
	holdKeys?: readonly string[]
}): Promise<void> {
	await withHeldKeys(opts.holdKeys, async () => {
		await mouse.setPosition(new Point(opts.coordinates.x, opts.coordinates.y))
		const n = Math.max(1, Math.floor(opts.scrollCount))
		switch (opts.direction) {
			case 'up':
				await mouse.scrollUp(n)
				break
			case 'down':
				await mouse.scrollDown(n)
				break
			case 'left':
				await mouse.scrollLeft(n)
				break
			case 'right':
				await mouse.scrollRight(n)
				break
		}
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Press a sequence of keys. Mirrors `_typeKeysTool` (computer_type_keys).
 *
 * Two modes, auto-detected:
 *   - **Combo** (any modifier present, e.g. ['LeftControl','C'] or ['LeftAlt','F4']):
 *     simultaneous press of all keys, optional delay, simultaneous release in
 *     reverse order. Matches upstream Bytebot's `sendKeys`
 *     (packages/bytebotd/src/nut/nut.service.ts:148-154).
 *   - **Sequence** (all non-modifiers, e.g. ['Tab','Tab','Tab']):
 *     per-key press+release loop with optional inter-key delay. nut-js'
 *     `pressKey(...spread)` throws "Invalid key flag specified" when no
 *     modifier is present, so a list of plain keys MUST be typed sequentially.
 *     Matches upstream's `typeText` per-key pattern (nut.service.ts:228-232).
 *
 * Single-key calls always use the combo path (it's a no-op simplification).
 *
 * Optional `delay` (ms): in combo mode inserted BETWEEN press and release;
 * in sequence mode inserted BETWEEN consecutive keys.
 */
export async function typeKeys(keys: readonly string[], delay?: number): Promise<void> {
	if (keys.length === 0) return
	const resolved = resolveKeys(keys)
	const stepDelay = typeof delay === 'number' && delay > 0 ? delay : 0

	const hasModifier = keys.some((name) => MODIFIER_KEY_NAMES.has(name))
	const isSingleKey = keys.length === 1
	if (hasModifier || isSingleKey) {
		// Combo path: simultaneous press, optional gap, reverse-order release.
		await keyboard.pressKey(...resolved)
		if (stepDelay > 0) await sleep(stepDelay)
		await keyboard.releaseKey(...[...resolved].reverse())
		return
	}

	// Sequence path: per-key press+release. Each key is fully pressed and
	// released before the next one starts.
	for (let i = 0; i < resolved.length; i++) {
		await keyboard.pressKey(resolved[i]!)
		await keyboard.releaseKey(resolved[i]!)
		if (stepDelay > 0 && i < resolved.length - 1) {
			await sleep(stepDelay)
		}
	}
}

/**
 * Press or release a set of keys (without auto-release). Mirrors
 * `_pressKeysTool` (computer_press_keys). Used by agents that want explicit
 * modifier-state control.
 */
export async function pressKeys(keys: readonly string[], press: PressMode): Promise<void> {
	if (keys.length === 0) return
	const resolved = resolveKeys(keys)
	if (press === 'down') {
		await keyboard.pressKey(...resolved)
	} else {
		await keyboard.releaseKey(...resolved)
	}
}

/**
 * Type a string of text character-by-character. Mirrors `_typeTextTool`
 * (computer_type_text). When `delay > 0`, inserts a sleep between characters.
 *
 * `isSensitive=true` triggers log redaction: a `[REDACTED — typed N chars
 * sensitive]` message replaces any per-call logging that would otherwise
 * include the raw text. (T-72N2-01 mitigation.)
 */
export async function typeText(text: string, delay?: number, isSensitive?: boolean): Promise<void> {
	if (isSensitive) {
		// eslint-disable-next-line no-console -- log redaction is a security feature.
		console.log(`[REDACTED — typed ${text.length} chars sensitive]`)
	}
	if (typeof delay === 'number' && delay > 0) {
		// Char-by-char with inter-character sleep.
		for (let i = 0; i < text.length; i++) {
			await keyboard.type(text[i]!)
			if (i < text.length - 1) {
				await sleep(delay)
			}
		}
		return
	}
	await keyboard.type(text)
}

/**
 * Paste text via clipboard. Mirrors `_pasteTextTool` (computer_paste_text).
 *
 * Strategy (per upstream Bytebot pattern + D-NATIVE-02):
 *   1. spawn xclip -selection clipboard, write text to its stdin.
 *   2. On successful exit, send Ctrl+V via keyboard.pressKey/releaseKey.
 *   3. On ENOENT (xclip not installed) or non-zero exit, fall back to
 *      keyboard.type(text). Logged as warning so operators can apt-install
 *      xclip (72-native-07 includes it on the apt-install list).
 *
 * `isSensitive=true` triggers log redaction (T-72N2-01).
 */
export async function pasteText(text: string, isSensitive?: boolean): Promise<void> {
	if (isSensitive) {
		// eslint-disable-next-line no-console -- log redaction is a security feature.
		console.log(`[REDACTED — pasted ${text.length} chars sensitive]`)
	}

	const xclipOk = await tryXclipCopy(text)
	if (xclipOk) {
		// Issue Ctrl+V via raw press/release so any modifier already held by
		// the agent isn't disturbed by `keyboard.type` quirks. Symmetric
		// release order (V first, then LeftControl) matches typeKeys.
		await keyboard.pressKey(Key.LeftControl, Key.V)
		await keyboard.releaseKey(Key.V, Key.LeftControl)
		return
	}

	// Fallback path: type the text as if the user typed it.
	if (!isSensitive) {
		// eslint-disable-next-line no-console -- operator visibility into the fallback.
		console.warn(
			'[computer-use/native/input] xclip unavailable or failed — falling back to keyboard.type. ' +
				'Install xclip (apt-get install xclip) for proper paste support.',
		)
	}
	await keyboard.type(text)
}

/**
 * Spawn xclip and write text to its stdin. Returns true on clean exit, false
 * on ENOENT / spawn error / non-zero exit code. NEVER throws — the fallback
 * path is what the caller wants on any failure.
 */
async function tryXclipCopy(text: string): Promise<boolean> {
	return await new Promise<boolean>((resolve) => {
		let settled = false
		const settle = (ok: boolean) => {
			if (settled) return
			settled = true
			resolve(ok)
		}
		try {
			const child = spawn('xclip', ['-selection', 'clipboard'], {
				stdio: ['pipe', 'ignore', 'ignore'],
			})
			child.on('error', () => settle(false))
			child.on('close', (code: number | null) => settle(code === 0))
			// Defend against stdin throwing on closed pipe.
			try {
				child.stdin?.end(text)
			} catch {
				settle(false)
			}
		} catch {
			settle(false)
		}
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursor query
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the current cursor position. Mirrors `_cursorPositionTool`
 * (computer_cursor_position). Strips the nut-js Point type so consumers
 * see plain numeric x/y keys.
 */
export async function getCursorPosition(): Promise<Coords> {
	const pt = await mouse.getPosition()
	return {x: pt.x, y: pt.y}
}
