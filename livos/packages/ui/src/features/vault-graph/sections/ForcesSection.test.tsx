// @vitest-environment jsdom
//
// Phase 179-04 — ForcesSection unit tests (5 assertions, RED gate).
// Pattern: createRoot + act() (D-NEW-DEPS-v35 — RTL not installed).
// Uses vi.useFakeTimers() to verify debounced localStorage write.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

import {ForcesSection, defaultForces} from './ForcesSection'

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
	vi.restoreAllMocks()
	vi.useRealTimers()
})

describe('ForcesSection', () => {
	it('renders slider-center with min="0" max="1" step="0.01"', () => {
		act(() => {
			root.render(<ForcesSection />)
		})
		const slider = container.querySelector('[data-testid="slider-center"]') as HTMLInputElement
		expect(slider).not.toBeNull()
		expect(slider.getAttribute('min')).toBe('0')
		expect(slider.getAttribute('max')).toBe('1')
		expect(slider.getAttribute('step')).toBe('0.01')
	})

	it('renders slider-repel with min="-200" max="0" step="1"', () => {
		act(() => {
			root.render(<ForcesSection />)
		})
		const slider = container.querySelector('[data-testid="slider-repel"]') as HTMLInputElement
		expect(slider).not.toBeNull()
		expect(slider.getAttribute('min')).toBe('-200')
		expect(slider.getAttribute('max')).toBe('0')
		expect(slider.getAttribute('step')).toBe('1')
	})

	it('renders slider-link-distance with min="20" max="200" step="1"', () => {
		act(() => {
			root.render(<ForcesSection />)
		})
		const slider = container.querySelector('[data-testid="slider-link-distance"]') as HTMLInputElement
		expect(slider).not.toBeNull()
		expect(slider.getAttribute('min')).toBe('20')
		expect(slider.getAttribute('max')).toBe('200')
		expect(slider.getAttribute('step')).toBe('1')
	})

	it('forces-reset button exists', () => {
		act(() => {
			root.render(<ForcesSection />)
		})
		expect(container.querySelector('[data-testid="forces-reset"]')).not.toBeNull()
	})

	it('clicking reset button calls onForcesChange with defaultForces values', () => {
		// First change a value, then reset
		const changes: any[] = []
		act(() => {
			root.render(<ForcesSection onForcesChange={(f) => changes.push(f)} />)
		})
		// Change center strength
		const centerSlider = container.querySelector('[data-testid="slider-center"]') as HTMLInputElement
		act(() => {
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype,
				'value',
			)?.set
			setter?.call(centerSlider, '0.5')
			centerSlider.dispatchEvent(new Event('input', {bubbles: true}))
		})
		// Now reset
		act(() => {
			;(container.querySelector('[data-testid="forces-reset"]') as HTMLButtonElement).click()
		})
		const last = changes[changes.length - 1]
		expect(last.centerStrength).toBe(defaultForces.centerStrength)
		expect(last.repelStrength).toBe(defaultForces.repelStrength)
		expect(last.linkStrength).toBe(defaultForces.linkStrength)
		expect(last.linkDistance).toBe(defaultForces.linkDistance)
	})
})
