// @vitest-environment jsdom
//
// Phase 181-01 — useDeviceClass hook unit tests.
//
// Pattern: RTL-absent (D-NO-NEW-DEPS) — direct react-dom/client mount + vi.fn stubs.
// 6 assertions for hook logic.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── matchMedia mock helper ────────────────────────────────────────────────
function mockMatchMedia(coarseMatches: boolean) {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		configurable: true,
		value: vi.fn((query: string) => ({
			matches: query.includes('coarse') ? coarseMatches : false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	})
}

function mockInnerWidth(width: number) {
	Object.defineProperty(window, 'innerWidth', {
		writable: true,
		configurable: true,
		value: width,
	})
}

// ── useBreakpoint mock ────────────────────────────────────────────────────
// useBreakpoint from react-use returns the breakpoint NAME for the current window width.
// sm = 640, md = 768, lg = 1024, xl = 1280, 2xl = 1536
// For phones (< 640px), react-use returns 'sm' as the smallest registered breakpoint.
const mockBreakpointValue = {value: 'lg'}
vi.mock('@/utils/tw', () => ({
	useBreakpoint: () => mockBreakpointValue.value,
	breakpoints: {sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536},
	tw: (s: TemplateStringsArray, ...v: string[]) => {
		let r = s[0]
		for (let i = 0; i < v.length; i++) r += v[i] + s[i + 1]
		return r
	},
}))

import {useDeviceClass} from './useDeviceClass'

// ── Test harness ──────────────────────────────────────────────────────────
let container: HTMLDivElement
let root: Root
let lastResult: string | null = null

function TestComponent() {
	const dc = useDeviceClass()
	lastResult = dc
	return null
}

beforeEach(() => {
	lastResult = null
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	try {
		act(() => root.unmount())
	} catch {
		/* already unmounted */
	}
	container.remove()
})

describe('useDeviceClass', () => {
	it('Test 1 — phone: width=390, coarse pointer → returns "phone"', () => {
		mockInnerWidth(390)
		mockMatchMedia(true)
		mockBreakpointValue.value = 'sm'
		act(() => {
			root.render(<TestComponent />)
		})
		expect(lastResult).toBe('phone')
	})

	it('Test 2 — phone (no pointer pref): width=390, fine pointer → returns "phone"', () => {
		mockInnerWidth(390)
		mockMatchMedia(false)
		mockBreakpointValue.value = 'sm'
		act(() => {
			root.render(<TestComponent />)
		})
		expect(lastResult).toBe('phone')
	})

	it('Test 3 — tablet: width=768, coarse pointer → returns "tablet"', () => {
		mockInnerWidth(768)
		mockMatchMedia(true)
		mockBreakpointValue.value = 'md'
		act(() => {
			root.render(<TestComponent />)
		})
		expect(lastResult).toBe('tablet')
	})

	it('Test 4 — tablet edge (640px): width=640, coarse pointer → returns "tablet"', () => {
		mockInnerWidth(640)
		mockMatchMedia(true)
		mockBreakpointValue.value = 'md'
		act(() => {
			root.render(<TestComponent />)
		})
		expect(lastResult).toBe('tablet')
	})

	it('Test 5 — desktop (fine pointer): width=768, fine pointer → returns "desktop"', () => {
		mockInnerWidth(768)
		mockMatchMedia(false)
		mockBreakpointValue.value = 'md'
		act(() => {
			root.render(<TestComponent />)
		})
		expect(lastResult).toBe('desktop')
	})

	it('Test 6 — desktop (wide, no touch): width=1440, fine pointer → returns "desktop"', () => {
		mockInnerWidth(1440)
		mockMatchMedia(false)
		mockBreakpointValue.value = 'xl'
		act(() => {
			root.render(<TestComponent />)
		})
		expect(lastResult).toBe('desktop')
	})
})
