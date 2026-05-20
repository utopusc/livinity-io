// @vitest-environment jsdom
//
// Phase 179-02 — GraphControls unit tests (5 assertions, RED gate).
// Pattern: createRoot + act() (D-NEW-DEPS-v35 — RTL not installed).

import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

import {GraphControls} from './GraphControls'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	act(() => root.unmount())
	container.remove()
})

describe('GraphControls', () => {
	it('renders collapsed chip by default (controls-chip visible, controls-panel absent)', () => {
		act(() => {
			root.render(<GraphControls />)
		})
		expect(container.querySelector('[data-testid="controls-chip"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="controls-panel"]')).toBeNull()
	})

	it('clicking chip opens panel (controls-panel becomes visible)', () => {
		act(() => {
			root.render(<GraphControls />)
		})
		act(() => {
			;(container.querySelector('[data-testid="controls-chip"]') as HTMLButtonElement).click()
		})
		expect(container.querySelector('[data-testid="controls-panel"]')).not.toBeNull()
	})

	it('clicking close button inside panel collapses back to chip', () => {
		act(() => {
			root.render(<GraphControls />)
		})
		act(() => {
			;(container.querySelector('[data-testid="controls-chip"]') as HTMLButtonElement).click()
		})
		act(() => {
			;(container.querySelector('[data-testid="controls-close"]') as HTMLButtonElement).click()
		})
		expect(container.querySelector('[data-testid="controls-chip"]')).not.toBeNull()
		expect(container.querySelector('[data-testid="controls-panel"]')).toBeNull()
	})

	it('renders children prop when panel is open', () => {
		act(() => {
			root.render(
				<GraphControls>
					<div data-testid='child-content'>hello</div>
				</GraphControls>,
			)
		})
		act(() => {
			;(container.querySelector('[data-testid="controls-chip"]') as HTMLButtonElement).click()
		})
		expect(container.querySelector('[data-testid="child-content"]')).not.toBeNull()
	})

	it('controls-chip has aria-label="Open graph controls"', () => {
		act(() => {
			root.render(<GraphControls />)
		})
		const chip = container.querySelector('[data-testid="controls-chip"]') as HTMLButtonElement
		expect(chip.getAttribute('aria-label')).toBe('Open graph controls')
	})
})
