// @vitest-environment jsdom
//
// Phase 179-04 — DisplaySection unit tests (5 assertions, RED gate).
// Pattern: createRoot + act() (D-NEW-DEPS-v35 — RTL not installed).

import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

import {DisplaySection} from './DisplaySection'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	window.localStorage.clear()
})

afterEach(() => {
	act(() => root.unmount())
	container.remove()
})

describe('DisplaySection', () => {
	it('renders slider-label-zoom with min="0" max="8" step="0.1"', () => {
		act(() => {
			root.render(<DisplaySection />)
		})
		const slider = container.querySelector('[data-testid="slider-label-zoom"]') as HTMLInputElement
		expect(slider).not.toBeNull()
		expect(slider.getAttribute('min')).toBe('0')
		expect(slider.getAttribute('max')).toBe('8')
		expect(slider.getAttribute('step')).toBe('0.1')
	})

	it('renders slider-node-size with min="0.5" max="3" step="0.1"', () => {
		act(() => {
			root.render(<DisplaySection />)
		})
		const slider = container.querySelector('[data-testid="slider-node-size"]') as HTMLInputElement
		expect(slider).not.toBeNull()
		expect(slider.getAttribute('min')).toBe('0.5')
		expect(slider.getAttribute('max')).toBe('3')
		expect(slider.getAttribute('step')).toBe('0.1')
	})

	it('renders slider-link-thickness with min="0.5" max="4" step="0.1"', () => {
		act(() => {
			root.render(<DisplaySection />)
		})
		const slider = container.querySelector('[data-testid="slider-link-thickness"]') as HTMLInputElement
		expect(slider).not.toBeNull()
		expect(slider.getAttribute('min')).toBe('0.5')
		expect(slider.getAttribute('max')).toBe('4')
		expect(slider.getAttribute('step')).toBe('0.1')
	})

	it('toggle-arrows defaults to unchecked (showArrows default false)', () => {
		act(() => {
			root.render(<DisplaySection />)
		})
		const toggle = container.querySelector('[data-testid="toggle-arrows"]') as HTMLInputElement
		expect(toggle).not.toBeNull()
		expect(toggle.checked).toBe(false)
	})

	it('changing slider-node-size calls onDisplayChange with updated nodeSizeScale', () => {
		const changes: any[] = []
		act(() => {
			root.render(<DisplaySection onDisplayChange={(d) => changes.push(d)} />)
		})
		const slider = container.querySelector('[data-testid="slider-node-size"]') as HTMLInputElement
		act(() => {
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype,
				'value',
			)?.set
			setter?.call(slider, '1.5')
			slider.dispatchEvent(new Event('input', {bubbles: true}))
		})
		expect(changes.length).toBeGreaterThan(0)
		expect(changes[changes.length - 1].nodeSizeScale).toBe(1.5)
	})
})
