// @vitest-environment jsdom
//
// Phase 181-02 — MobileTerminalKeyBar unit tests (12 TDD assertions).
//
// Pattern: RTL-absent — uses @testing-library/react which IS installed,
// as confirmed by existing CcTerminal.test.tsx patterns using fireEvent.
// Pattern: uses vitest fake timers for long-press test.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {MobileTerminalKeyBar} from './MobileTerminalKeyBar'

// ── Touch simulation helpers ──────────────────────────────────────────────

function tap(element: Element) {
	element.dispatchEvent(new TouchEvent('touchstart', {bubbles: true, cancelable: true}))
	element.dispatchEvent(new TouchEvent('touchend', {bubbles: true, cancelable: true}))
}

function touchStart(element: Element) {
	element.dispatchEvent(new TouchEvent('touchstart', {bubbles: true, cancelable: true}))
}

function touchEnd(element: Element) {
	element.dispatchEvent(new TouchEvent('touchend', {bubbles: true, cancelable: true}))
}

// ── Test setup ────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	vi.useRealTimers()
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	vi.useRealTimers()
	try {
		act(() => root.unmount())
	} catch {
		/* already unmounted */
	}
	container.remove()
})

function renderKeyBar(onKey: (seq: string) => void) {
	act(() => {
		root.render(<MobileTerminalKeyBar onKey={onKey} />)
	})
	return container
}

function findBtn(container: HTMLDivElement, label: string): Element {
	const buttons = container.querySelectorAll('button, [role="button"]')
	for (const btn of buttons) {
		if (btn.textContent?.trim() === label || btn.getAttribute('aria-label')?.includes(label)) {
			return btn
		}
	}
	// Try data-key attribute
	const byKey = container.querySelector(`[data-key="${label}"]`)
	if (byKey) return byKey
	throw new Error(`Button "${label}" not found. Available: ${Array.from(buttons).map(b => `"${b.textContent?.trim()}"(aria=${b.getAttribute('aria-label')})`).join(', ')}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('MobileTerminalKeyBar', () => {
	it('Test 1 — ESC tap: onKey called with "\\x1b"', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const btn = findBtn(c, 'ESC')
		act(() => tap(btn))
		expect(onKey).toHaveBeenCalledWith('\x1b')
	})

	it('Test 2 — TAB tap: onKey called with "\\x09"', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const btn = findBtn(c, 'TAB')
		act(() => tap(btn))
		expect(onKey).toHaveBeenCalledWith('\x09')
	})

	it('Test 3 — Arrow up: onKey called with "\\x1b[A"', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const btn = findBtn(c, '↑')
		act(() => tap(btn))
		expect(onKey).toHaveBeenCalledWith('\x1b[A')
	})

	it('Test 4 — Arrow down: onKey called with "\\x1b[B"', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const btn = findBtn(c, '↓')
		act(() => tap(btn))
		expect(onKey).toHaveBeenCalledWith('\x1b[B')
	})

	it('Test 5 — Arrow left: onKey called with "\\x1b[D"', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const btn = findBtn(c, '←')
		act(() => tap(btn))
		expect(onKey).toHaveBeenCalledWith('\x1b[D')
	})

	it('Test 6 — Arrow right: onKey called with "\\x1b[C"', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const btn = findBtn(c, '→')
		act(() => tap(btn))
		expect(onKey).toHaveBeenCalledWith('\x1b[C')
	})

	it('Test 7 — PGUP: onKey called with "\\x1b[5~"', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const btn = findBtn(c, 'PGUP')
		act(() => tap(btn))
		expect(onKey).toHaveBeenCalledWith('\x1b[5~')
	})

	it('Test 8 — ENTER: onKey called with "\\r"', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const btn = findBtn(c, '⏎')
		act(() => tap(btn))
		expect(onKey).toHaveBeenCalledWith('\r')
	})

	it('Test 9 — Pipe literal: onKey called with "|"', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const btn = findBtn(c, '|')
		act(() => tap(btn))
		expect(onKey).toHaveBeenCalledWith('|')
	})

	it('Test 10 — Sticky-Ctrl latch: tap CTRL → aria-pressed=true; tap ESC → onKey=\\x1b (arrow unmodified, state returns to off)', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const ctrlBtn = findBtn(c, 'CTRL')

		// Initially not pressed
		expect(ctrlBtn.getAttribute('aria-pressed')).not.toBe('true')

		// Tap CTRL to latch
		act(() => tap(ctrlBtn))
		expect(ctrlBtn.getAttribute('aria-pressed')).toBe('true')

		// Tap ESC — CTRL doesn't apply to ESC (it's a raw escape), so sends \x1b
		// and CTRL state returns to off
		act(() => tap(findBtn(c, 'ESC')))
		expect(onKey).toHaveBeenCalledWith('\x1b')
		// After non-modifier key, latched state auto-releases
		expect(ctrlBtn.getAttribute('aria-pressed')).toBe('false')
	})

	it('Test 11 — Sticky-Ctrl auto-release: tap CTRL (latched), tap ↑ → onKey=\\x1b[A, state returns to off', () => {
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const ctrlBtn = findBtn(c, 'CTRL')

		// Latch CTRL
		act(() => tap(ctrlBtn))
		expect(ctrlBtn.getAttribute('aria-pressed')).toBe('true')

		// Tap ↑ — arrows are not Ctrl-modified; they send raw escape sequence
		act(() => tap(findBtn(c, '↑')))
		expect(onKey).toHaveBeenCalledWith('\x1b[A')

		// CTRL state returns to off
		expect(ctrlBtn.getAttribute('aria-pressed')).toBe('false')
	})

	it('Test 12 — Long-press Ctrl lock: hold 700ms → locked; tap ↑ → onKey=\\x1b[A, state stays locked', () => {
		vi.useFakeTimers()
		const onKey = vi.fn()
		const c = renderKeyBar(onKey)
		const ctrlBtn = findBtn(c, 'CTRL')

		// Long press CTRL (> 600ms)
		act(() => touchStart(ctrlBtn))
		act(() => vi.advanceTimersByTime(700))
		act(() => touchEnd(ctrlBtn))

		// State should be 'locked' (aria-label includes 'locked' or aria-pressed+different visual)
		const ariaLabel = ctrlBtn.getAttribute('aria-label') ?? ''
		const isLocked = ariaLabel.includes('locked') || ctrlBtn.getAttribute('data-ctrl-state') === 'locked'
		expect(isLocked).toBe(true)

		// Tap ↑ — sends raw escape sequence even when locked
		act(() => tap(findBtn(c, '↑')))
		expect(onKey).toHaveBeenCalledWith('\x1b[A')

		// State stays locked
		const afterAriaLabel = ctrlBtn.getAttribute('aria-label') ?? ''
		const stillLocked = afterAriaLabel.includes('locked') || ctrlBtn.getAttribute('data-ctrl-state') === 'locked'
		expect(stillLocked).toBe(true)
	})
})
