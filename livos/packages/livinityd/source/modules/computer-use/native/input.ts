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
 * Strategy: pure async functions, one per 72-01 LUSE_TOOLS schema. Param shapes match
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

/**
 * Common short-form key aliases the LLM agent tends to emit. Mapped to the
 * nut-js Key enum names. Without this, agents that pass `Alt`, `Ctrl`,
 * `Shift`, `Esc`, `Cmd`, etc. would hit `Unknown key name` errors despite
 * those being well-understood key labels.
 */
const KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
	Alt: 'LeftAlt',
	Ctrl: 'LeftControl',
	Control: 'LeftControl',
	Shift: 'LeftShift',
	Super: 'LeftSuper',
	Meta: 'LeftSuper',
	Cmd: 'LeftSuper',
	Command: 'LeftSuper',
	Win: 'LeftSuper',
	Windows: 'LeftSuper',
	Esc: 'Escape',
})

function normalizeKeyToken(token: string): string {
	const trimmed = token.trim()
	return KEY_ALIASES[trimmed] ?? trimmed
}

/**
 * Expand a single key token into one or more nut-js Key enum names.
 * Handles two LLM-common patterns:
 *   - Combined string: `"Alt+F4"` → `["LeftAlt", "F4"]`.
 *   - Aliased name: `"Alt"` → `["LeftAlt"]`.
 *
 * The combo-vs-sequence detection in `typeKeys` runs against the EXPANDED
 * list, so an agent calling `keys: ["Alt+F4"]` gets the same combo behavior
 * as `keys: ["LeftAlt", "F4"]`.
 */
function expandKeyToken(name: string): string[] {
	if (name.includes('+')) {
		return name
			.split('+')
			.map((part) => part.trim())
			.filter((p) => p.length > 0)
			.map(normalizeKeyToken)
	}
	return [normalizeKeyToken(name)]
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared types (mirror 72-01 LUSE_TOOLS schema field shapes verbatim).
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
	// Expand aliases & "Alt+F4"-style combined tokens BEFORE enum lookup so
	// the agent's looser key vocabulary still resolves cleanly.
	const expanded = names.flatMap(expandKeyToken)
	return expanded.map(resolveKey)
}

/** Same as resolveKeys but returns the expanded NAME list — used by typeKeys
 *  to detect combo-vs-sequence after expansion. */
function expandKeyNames(names: readonly string[]): string[] {
	return names.flatMap(expandKeyToken)
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
 *
 * 2026-05-08 P97-02 — Optional `windowId`. When set, dispatch via
 * `xdotool mousemove --window <wid> --sync X Y` so the cursor warp targets
 * the specified window's coordinate space (xdotool documents `--window`
 * for `mousemove` as relative-to-window coordinates with `mousemove_relative`
 * semantics; we use it on absolute mode here for consistency with click).
 * On xdotool failure, falls back to nut-js host-display setPosition.
 */
export async function moveMouse(coordinates: Coords, windowId?: number): Promise<void> {
	if (typeof windowId === 'number') {
		const ok = await tryXdotoolMouseMove(coordinates, windowId)
		if (ok) return
	}
	await mouse.setPosition(new Point(coordinates.x, coordinates.y))
}

/**
 * P97-02: spawn `xdotool mousemove --window <wid> --sync X Y`. Returns true
 * on clean exit; false otherwise. Never throws.
 */
async function tryXdotoolMouseMove(coords: Coords, windowId: number): Promise<boolean> {
	const args = [
		'mousemove',
		'--window',
		String(windowId),
		'--sync',
		String(coords.x),
		String(coords.y),
	]
	return await spawnXdotool(args)
}

/**
 * P97-02: shared xdotool spawn helper. Returns true on clean exit; false on
 * ENOENT / spawn error / non-zero exit. Never throws.
 */
function spawnXdotool(args: readonly string[]): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		let settled = false
		const settle = (ok: boolean) => {
			if (settled) return
			settled = true
			resolve(ok)
		}
		try {
			const child = spawn('xdotool', args as string[], {
				stdio: 'ignore',
				env: process.env,
			})
			child.on('error', () => settle(false))
			child.on('close', (code: number | null) => settle(code === 0))
		} catch {
			settle(false)
		}
	})
}

/**
 * Phase 100-09-03 — Smooth-move pattern from selfclaude
 * (https://github.com/utopusc/selfclaude — read-only reference). Walks the
 * cursor along a linearly-interpolated path between (currentX, currentY) and
 * (targetX, targetY) in `steps` increments, dispatching each step via
 * `xdotool mousemove --sync` and sleeping `delayMs` between steps.
 *
 * Defaults (steps=20, delayMs=5) → ~100ms total trajectory. Smooth perceived
 * motion at the cost of 100ms latency. Acceptable for bytebot's
 * human-looking mouse (NOT for real-time interactive cursor warp — that
 * still uses `moveMouse`'s one-shot path).
 *
 * Closes 100-09 Bug 3 — bytebot mouse teleports.
 *
 * Returns true on full success (all steps clean exit). Returns false if ANY
 * step fails — caller falls back to teleport so the final cursor still
 * reaches the target without a half-trajectory left behind.
 */
export async function smoothMove(
	targetX: number,
	targetY: number,
	currentX: number,
	currentY: number,
	steps: number = 20,
	delayMs: number = 5,
): Promise<boolean> {
	if (steps <= 0) return false
	for (let i = 1; i <= steps; i++) {
		const t = i / steps
		const x = Math.round(currentX + (targetX - currentX) * t)
		const y = Math.round(currentY + (targetY - currentY) * t)
		const ok = await spawnXdotool(['mousemove', '--sync', String(x), String(y)])
		if (!ok) return false
		if (i < steps && delayMs > 0) await sleep(delayMs)
	}
	return true
}

/**
 * Phase 100-09-03 — query current cursor position via xdotool
 * `getmouselocation --shell`. Used by smoothMove integrations to compute the
 * starting point of an interpolated trajectory. Returns undefined on failure
 * (caller falls back to teleport). Never throws.
 */
async function getCursorPositionViaXdotool(): Promise<{x: number; y: number} | undefined> {
	return await new Promise<{x: number; y: number} | undefined>((resolve) => {
		let settled = false
		let stdout = ''
		const settle = (val: {x: number; y: number} | undefined) => {
			if (settled) return
			settled = true
			resolve(val)
		}
		try {
			const child = spawn('xdotool', ['getmouselocation', '--shell'], {
				stdio: ['ignore', 'pipe', 'ignore'],
				env: process.env,
			})
			child.stdout?.on('data', (chunk: Buffer) => {
				stdout += chunk.toString('utf-8')
			})
			child.on('error', () => settle(undefined))
			child.on('close', (code: number | null) => {
				if (code !== 0) return settle(undefined)
				const xMatch = stdout.match(/^X=(-?\d+)/m)
				const yMatch = stdout.match(/^Y=(-?\d+)/m)
				if (!xMatch || !yMatch) return settle(undefined)
				settle({x: parseInt(xMatch[1]!, 10), y: parseInt(yMatch[1]!, 10)})
			})
		} catch {
			settle(undefined)
		}
	})
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
 *
 * 2026-05-07 P79-07 — Two-strategy click for Mutter compatibility:
 *
 *   - **xdotool path** (no holdKeys): `xdotool mousemove --sync X Y click 1`.
 *     `--sync` waits for the X server to acknowledge each event before
 *     returning, which is what GNOME Shell + Mutter need to register a
 *     click as a real button activation. nut-js' synthetic `mouse.click()`
 *     fires XTestFakeButtonEvent without a sync flush; on Mutter this lets
 *     the X event loop drop or coalesce the press/release pair so GTK
 *     modal dialog buttons (Cancel, OK) never trigger their handlers.
 *     `--clearmodifiers` releases stuck modifier state before the click and
 *     restores it after — avoids accidental Shift+click etc.
 *
 *   - **nut-js path** (holdKeys present, OR xdotool fails/missing): the
 *     original modifier-aware path. xdotool's `--clearmodifiers` is
 *     incompatible with deliberately-held keys, so we keep nut-js for the
 *     drag-with-modifier / shift-click case.
 *
 * 2026-05-08 P97-02 — Optional `windowId`. When set, the xdotool argv is
 * prefixed with `--window <wid>` so events target that window even if a
 * different window is currently focused. The nut-js fallback path is
 * host-display only (window scoping there is out of scope).
 */
export async function clickMouse(opts: {
	coordinates?: Coords
	button: ButtonName
	clickCount: number
	holdKeys?: readonly string[]
	/** P97-02: target a specific X11 window via `xdotool --window <wid>`. */
	windowId?: number
}): Promise<void> {
	const count = Math.max(1, Math.floor(opts.clickCount))

	if (!opts.holdKeys || opts.holdKeys.length === 0) {
		const ok = await tryXdotoolClick(opts.button, count, opts.coordinates, opts.windowId)
		if (ok) return
		// Fall through to nut-js — xdotool not installed or failed. nut-js
		// has no per-window scoping; if windowId was set, the event will
		// land on the focused window. Caller should treat windowed clicks
		// as best-effort when xdotool isn't available.
	}

	const btn = BUTTON_MAP[opts.button]
	await withHeldKeys(opts.holdKeys, async () => {
		if (opts.coordinates) {
			await mouse.setPosition(new Point(opts.coordinates.x, opts.coordinates.y))
		}
		for (let i = 0; i < count; i++) {
			await mouse.click(btn)
		}
	})
}

/** xdotool button numbers — X11 convention. */
const XDOTOOL_BUTTON: Record<ButtonName, string> = {
	left: '1',
	middle: '2',
	right: '3',
}

/**
 * Phase 100-09-02 — X11 wheel button mapping. Mirrors the SAME convention
 * as input-dispatcher.ts ScrollButton (4=up, 5=down, 6=left, 7=right). Kept
 * in sync between bytebot path and user-canvas path; if a future plan adds
 * horizontal-scroll surfacing, consider centralising into a shared module.
 */
const SCROLL_BUTTON: Record<ScrollDirection, '4' | '5' | '6' | '7'> = {
	up: '4',
	down: '5',
	left: '6',
	right: '7',
}

/**
 * Run an xdotool chain: optional sync mouse-move + click N times. Returns
 * true on success, false on any failure (ENOENT / non-zero exit / spawn
 * error). Never throws — caller falls back to nut-js path.
 *
 * Implemented via `child_process.spawn` (not `execFile`) so the existing
 * vitest mock — which replaces `node:child_process` with a `spawn`-only
 * surface — still loads this module.
 *
 * 2026-05-08 P97-02 — Optional `windowId`. When set, every command in the
 * xdotool argv chain is prefixed with `--window <wid>`. xdotool documents
 * `--window` as a per-command override that pins the event target to a
 * specific X11 window id. We apply it to both `mousemove` and `click` so
 * cursor warp and button event both land on the same window.
 */
async function tryXdotoolClick(
	button: ButtonName,
	count: number,
	coordinates: Coords | undefined,
	windowId?: number,
): Promise<boolean> {
	// Phase 100-09-03 — interpolated approach for smooth trajectory. When
	// coordinates are set, query current cursor, walk a smooth path to the
	// target via smoothMove, THEN dispatch the focused click chain (without
	// a separate mousemove sub-command). Closes 100-09 Bug 3.
	let usedSmoothMove = false
	if (coordinates) {
		const start = await getCursorPositionViaXdotool()
		if (start) {
			usedSmoothMove = await smoothMove(coordinates.x, coordinates.y, start.x, start.y)
		}
		// If start lookup or smoothMove failed, usedSmoothMove stays false;
		// fall back to one-shot teleport in the chain below (pre-09-03 path).
	}

	const args: string[] = []
	// 2026-05-08 P100-07.3 — Chrome (and many GTK apps) drop `xdotool click
	// --window <wid>` because they filter synthetic XSendEvents
	// (`send_event=True`). We must use the activate-first pattern instead:
	// activate the bound wid, focus it, move the cursor (wid-relative if
	// --window is passed to mousemove for coord translation), then click
	// WITHOUT --window so xdotool dispatches a real button event to the
	// now-focused window. Same fix as input-dispatcher.ts (Phase 100-07.1).
	if (typeof windowId === 'number') {
		const widStr = String(windowId)
		args.push('windowactivate', '--sync', widStr, 'windowfocus', '--sync', widStr)
	}
	if (coordinates && !usedSmoothMove) {
		// Phase 100-09-03 fallback: smoothMove unavailable or failed —
		// legacy one-shot teleport (pre-09-03 behavior so the click still
		// lands at the right spot).
		// `--window <wid>` on mousemove tells xdotool the coords are
		// wid-relative — translation only, NOT XSendEvent. Safe to keep.
		const moveWin: string[] = typeof windowId === 'number' ? ['--window', String(windowId)] : []
		args.push('mousemove', ...moveWin, '--sync', String(coordinates.x), String(coordinates.y))
	}
	const btnNum = XDOTOOL_BUTTON[button]
	// `click` does NOT carry --window — fires a real button event to the
	// X11-focused window (= the wid we just activated above).
	if (count > 1) {
		// 150ms inter-click delay matches upstream Bytebot's clickMouse loop
		// (packages/bytebotd/src/computer-use/computer-use.service.ts:147).
		args.push('click', '--clearmodifiers', '--repeat', String(count), '--delay', '150', btnNum)
	} else {
		args.push('click', '--clearmodifiers', btnNum)
	}
	return await new Promise<boolean>((resolve) => {
		let settled = false
		const settle = (ok: boolean) => {
			if (settled) return
			settled = true
			resolve(ok)
		}
		try {
			const child = spawn('xdotool', args, {
				stdio: 'ignore',
				env: process.env,
			})
			child.on('error', () => settle(false))
			child.on('close', (code: number | null) => settle(code === 0))
		} catch {
			settle(false)
		}
	})
}

/**
 * Phase 100-09-02 — xdotool scroll via activate-first chain. Same Chrome
 * synthetic-event filter that broke clicks (P100-07.3) breaks nut-js
 * scrollDown/scrollUp too — Chrome filters synthetic XTestFakeButtonEvent
 * the same way it filters synthetic clicks. Returns true on clean exit;
 * false otherwise (caller falls back to nut-js host-display path).
 * Never throws.
 */
async function tryXdotoolScroll(
	direction: ScrollDirection,
	count: number,
	coordinates: Coords,
	windowId: number,
): Promise<boolean> {
	const widStr = String(windowId)
	const btn = SCROLL_BUTTON[direction]
	const args: string[] = [
		'windowactivate', '--sync', widStr,
		'windowfocus', '--sync', widStr,
		'mousemove', '--window', widStr, '--sync', String(coordinates.x), String(coordinates.y),
	]
	// xdotool's `click --repeat N --delay <ms> <btn>` for N>1 scroll notches.
	if (count > 1) {
		args.push('click', '--clearmodifiers', '--repeat', String(count), '--delay', '50', btn)
	} else {
		args.push('click', '--clearmodifiers', btn)
	}
	return await spawnXdotool(args)
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
 *
 * 2026-05-10 P100-09-02 — when `windowId` is set AND no holdKeys are held,
 * route via `tryXdotoolScroll` (activate-first xdotool click 4/5/6/7 chain).
 * Closes 100-09 Bug 2 — Chrome filters nut-js's synthetic
 * XTestFakeButtonEvent the same way it filters synthetic clicks (same fix
 * pattern as P100-07.3 `tryXdotoolClick`). Falls through to nut-js when
 * xdotool unavailable OR holdKeys present (xdotool's `--clearmodifiers`
 * conflicts with deliberately-held modifier keys).
 */
export async function scroll(opts: {
	coordinates: Coords
	direction: ScrollDirection
	scrollCount: number
	holdKeys?: readonly string[]
	/** P100-09-02: target a specific X11 window via xdotool activate-first chain. */
	windowId?: number
}): Promise<void> {
	const n = Math.max(1, Math.floor(opts.scrollCount))
	if (typeof opts.windowId === 'number' && (!opts.holdKeys || opts.holdKeys.length === 0)) {
		const ok = await tryXdotoolScroll(opts.direction, n, opts.coordinates, opts.windowId)
		if (ok) return
		// Fall through to nut-js — xdotool unavailable. Host-display only;
		// the nut-js path has no per-window scoping.
	}
	await withHeldKeys(opts.holdKeys, async () => {
		await mouse.setPosition(new Point(opts.coordinates.x, opts.coordinates.y))
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
export async function typeKeys(keys: readonly string[], delay?: number, windowId?: number): Promise<void> {
	if (keys.length === 0) return
	// P97-02: window-scoped path. xdotool `key --window <wid> <combo>` accepts
	// the X11 keysym names directly. We map nut-js-style names to xdotool
	// keysyms via the existing alias expansion + a small xdotool name table.
	if (typeof windowId === 'number') {
		const ok = await tryXdotoolKey(keys, windowId, false, delay)
		if (ok) return
		// Falls through to nut-js (host-display) if xdotool unavailable.
	}
	// Expand aliases ("Alt" → "LeftAlt") and combined tokens ("Alt+F4" →
	// ["LeftAlt","F4"]) BEFORE detecting combo-vs-sequence — modifier presence
	// must be checked on the expanded list, not the raw input.
	const expandedNames = expandKeyNames(keys)
	const resolved = expandedNames.map(resolveKey)
	const stepDelay = typeof delay === 'number' && delay > 0 ? delay : 0

	const hasModifier = expandedNames.some((name) => MODIFIER_KEY_NAMES.has(name))
	const isSingleKey = expandedNames.length === 1
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
 *
 * 2026-05-08 P97-02 — Optional `windowId`. When set, dispatch via
 * `xdotool keydown/keyup --window <wid> <keysym>...`.
 */
export async function pressKeys(keys: readonly string[], press: PressMode, windowId?: number): Promise<void> {
	if (keys.length === 0) return
	if (typeof windowId === 'number') {
		const ok = await tryXdotoolPressRelease(keys, windowId, press)
		if (ok) return
	}
	const resolved = resolveKeys(keys)
	if (press === 'down') {
		await keyboard.pressKey(...resolved)
	} else {
		await keyboard.releaseKey(...resolved)
	}
}

/**
 * P97-02 — map nut-js-style key names to xdotool X11 keysyms.
 *
 * xdotool accepts standard X11 keysyms. nut-js Key enum names mostly map
 * directly (e.g. 'F1' → 'F1', 'Tab' → 'Tab', 'A' → 'a' lowercase for
 * xdotool's keysym, 'Enter' → 'Return'). Modifier names need translation.
 *
 * Unknown names pass through unchanged so callers can still send xdotool
 * keysyms directly (e.g. 'plus', 'minus', 'comma').
 */
const NUTJS_TO_XDOTOOL_KEY: Readonly<Record<string, string>> = Object.freeze({
	LeftAlt: 'alt',
	RightAlt: 'alt',
	LeftShift: 'shift',
	RightShift: 'shift',
	LeftControl: 'ctrl',
	RightControl: 'ctrl',
	LeftSuper: 'super',
	RightSuper: 'super',
	LeftMeta: 'super',
	RightMeta: 'super',
	LeftCmd: 'super',
	RightCmd: 'super',
	LeftWin: 'super',
	RightWin: 'super',
	Enter: 'Return',
	Backspace: 'BackSpace',
	Delete: 'Delete',
	Escape: 'Escape',
	Tab: 'Tab',
	Space: 'space',
	PageUp: 'Page_Up',
	PageDown: 'Page_Down',
	Home: 'Home',
	End: 'End',
	Up: 'Up',
	Down: 'Down',
	Left: 'Left',
	Right: 'Right',
})

function toXdotoolKeysym(name: string): string {
	const mapped = NUTJS_TO_XDOTOOL_KEY[name]
	if (mapped !== undefined) return mapped
	// Single uppercase letters (A-Z) → lowercase for xdotool's keysym name.
	if (/^[A-Z]$/.test(name)) return name.toLowerCase()
	return name
}

/**
 * P97-02: dispatch typeKeys via xdotool. Returns true on clean exit; false
 * otherwise (caller falls back to nut-js).
 *
 * Strategy:
 *   - For combo (modifier present or single key), build a single
 *     `xdotool key --window <wid> --clearmodifiers <a>+<b>+...`.
 *   - For sequence (no modifiers, multi-key), one xdotool key per key
 *     with optional inter-key delay (xdotool's `--delay` is ms between
 *     keystrokes when typing strings, but `key` is one keysym; we sleep
 *     in JS instead).
 */
async function tryXdotoolKey(
	keys: readonly string[],
	windowId: number,
	_alreadyExpanded: boolean,
	delay?: number,
): Promise<boolean> {
	const expanded = expandKeyNames(keys)
	const xkeys = expanded.map(toXdotoolKeysym)
	const stepDelay = typeof delay === 'number' && delay > 0 ? delay : 0
	const hasModifier = expanded.some((n) => MODIFIER_KEY_NAMES.has(n))
	const isSingleKey = expanded.length === 1

	// 2026-05-08 P100-07.3 — Same Chrome synthetic-event filter as click.
	// `key --window <wid>` dispatches XSendEvent which Chrome drops. Use
	// activate-first: focus the wid, then send a real key event.
	const widStr = String(windowId)
	const activatePrefix = ['windowactivate', '--sync', widStr, 'windowfocus', '--sync', widStr]

	if (hasModifier || isSingleKey) {
		const combo = xkeys.join('+')
		return await spawnXdotool([...activatePrefix, 'key', '--clearmodifiers', combo])
	}
	// Sequence mode: one keysym per spawn (re-activate each time so focus
	// stays on the bound wid even if the user clicks elsewhere).
	for (let i = 0; i < xkeys.length; i++) {
		const ok = await spawnXdotool([...activatePrefix, 'key', '--clearmodifiers', xkeys[i]!])
		if (!ok) return false
		if (stepDelay > 0 && i < xkeys.length - 1) await sleep(stepDelay)
	}
	return true
}

/**
 * P97-02: dispatch pressKeys (down or up) via xdotool keydown/keyup.
 *
 * 2026-05-08 P100-07.3: activate-first pattern (Chrome filters synthetic
 * --window keydown/keyup the same way it filters --window click).
 */
async function tryXdotoolPressRelease(
	keys: readonly string[],
	windowId: number,
	press: PressMode,
): Promise<boolean> {
	const verb = press === 'down' ? 'keydown' : 'keyup'
	const expanded = expandKeyNames(keys)
	const xkeys = expanded.map(toXdotoolKeysym)
	const widStr = String(windowId)
	return await spawnXdotool([
		'windowactivate', '--sync', widStr,
		'windowfocus', '--sync', widStr,
		verb, '--clearmodifiers', ...xkeys,
	])
}

/**
 * Type a string of text character-by-character. Mirrors `_typeTextTool`
 * (computer_type_text). When `delay > 0`, inserts a sleep between characters.
 *
 * `isSensitive=true` triggers log redaction: a `[REDACTED — typed N chars
 * sensitive]` message replaces any per-call logging that would otherwise
 * include the raw text. (T-72N2-01 mitigation.)
 */
export async function typeText(text: string, delay?: number, isSensitive?: boolean, windowId?: number): Promise<void> {
	if (isSensitive) {
		// eslint-disable-next-line no-console -- log redaction is a security feature.
		console.log(`[REDACTED — typed ${text.length} chars sensitive]`)
	}
	// P97-02: window-scoped path via xdotool. xdotool's `type --window <wid>
	// --delay <ms> <text>` natively supports per-window typing with inter-
	// character delays (unlike `key`, which we have to loop in JS).
	if (typeof windowId === 'number') {
		// 2026-05-08 P100-07.3 — activate-first pattern; `type --window`
		// hits the same Chrome synthetic-event filter as `key --window`.
		const widStr = String(windowId)
		const args: string[] = [
			'windowactivate', '--sync', widStr,
			'windowfocus', '--sync', widStr,
			'type',
		]
		if (typeof delay === 'number' && delay > 0) {
			args.push('--delay', String(delay))
		}
		// `--` ensures `text` starting with '-' isn't parsed as a flag.
		args.push('--', text)
		const ok = await spawnXdotool(args)
		if (ok) return
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
export async function pasteText(text: string, isSensitive?: boolean, windowId?: number): Promise<void> {
	if (isSensitive) {
		// eslint-disable-next-line no-console -- log redaction is a security feature.
		console.log(`[REDACTED — pasted ${text.length} chars sensitive]`)
	}

	const xclipOk = await tryXclipCopy(text)
	if (xclipOk) {
		// 2026-06-02 — Issue Ctrl+V via XDOTOOL, not nut-js. nut-js's
		// `pressKey(Ctrl, V)` fires XTestFakeKeyEvent press/release pairs with
		// no sync flush; on Xvfb the target app can process the `v` keypress
		// before the Ctrl modifier registers, so the paste lands as a literal
		// `v` (modifier-drop race — reported across every app, not just Chrome).
		// `xdotool key --clearmodifiers ctrl+v` holds the modifier across the
		// keypress atomically, and the activate-first prefix focuses the bound
		// window so the paste lands on the right surface (nut-js has no window
		// scoping). Same pattern that fixed click/typeKeys/typeText (P100-07.3).
		const okPaste = await tryXdotoolPaste(windowId)
		if (okPaste) return
		// xdotool unavailable — fall back to the legacy nut-js Ctrl+V (racy on
		// Xvfb, but better than nothing on hosts without xdotool).
		await keyboard.pressKey(Key.LeftControl, Key.V)
		await keyboard.releaseKey(Key.V, Key.LeftControl)
		return
	}

	// Clipboard copy failed (xclip missing). Type the text instead — app-
	// agnostic, no clipboard/modifier needed. Prefer xdotool `type` (window-
	// focused, handles the modifier-less path cleanly) over nut-js. NOTE: typed
	// newlines become Enter keypresses, so clipboard+Ctrl+V above is preferred
	// for multi-line text in submit-on-Enter boxes.
	if (typeof windowId === 'number') {
		const widStr = String(windowId)
		const ok = await spawnXdotool([
			'windowactivate', '--sync', widStr,
			'windowfocus', '--sync', widStr,
			'type', '--', text,
		])
		if (ok) return
	}
	if (!isSensitive) {
		// eslint-disable-next-line no-console -- operator visibility into the fallback.
		console.warn(
			'[computer-use/native/input] xclip + xdotool unavailable or failed — falling back to keyboard.type. ' +
				'Install xclip + xdotool (apt-get install xclip xdotool) for proper paste support.',
		)
	}
	await keyboard.type(text)
}

/**
 * Send Ctrl+V via xdotool. When `windowId` is set, activate-first the bound
 * window so the paste targets it (Chrome & GTK filter synthetic `--window`
 * key events, so we focus then send a real, unscoped key event — same fix as
 * tryXdotoolKey/tryXdotoolClick). `--clearmodifiers` clears any stuck modifier
 * before the combo and restores it after. Returns true on clean exit, false on
 * ENOENT / non-zero exit. Never throws.
 */
async function tryXdotoolPaste(windowId?: number): Promise<boolean> {
	const args: string[] = []
	if (typeof windowId === 'number') {
		const widStr = String(windowId)
		args.push('windowactivate', '--sync', widStr, 'windowfocus', '--sync', widStr)
	}
	args.push('key', '--clearmodifiers', 'ctrl+v')
	return await spawnXdotool(args)
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
