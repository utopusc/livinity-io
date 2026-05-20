// @vitest-environment jsdom
//
// Phase 179-02 — FiltersSection unit tests (5 assertions, RED gate).
// Pattern: createRoot + act() (D-NEW-DEPS-v35 — RTL not installed); real jsdom localStorage.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

import {FiltersSection, defaultFilters} from './FiltersSection'

const ALL_TYPES = [
	'memory',
	'session',
	'inbox',
	'agent',
	'skill',
	'command',
	'root',
] as const

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
})

describe('FiltersSection', () => {
	it('renders 7 type checkboxes (one per VaultNodeType)', () => {
		act(() => {
			root.render(<FiltersSection />)
		})
		for (const type of ALL_TYPES) {
			expect(
				container.querySelector(`[data-testid="type-toggle-${type}"]`),
			).not.toBeNull()
		}
	})

	it('clicking a type checkbox calls onFiltersChange with that type removed from enabledTypes', () => {
		const changes: any[] = []
		act(() => {
			root.render(<FiltersSection onFiltersChange={(f) => changes.push(f)} />)
		})
		act(() => {
			;(
				container.querySelector('[data-testid="type-toggle-memory"]') as HTMLInputElement
			).click()
		})
		expect(changes.length).toBeGreaterThan(0)
		expect(changes[changes.length - 1].enabledTypes).not.toContain('memory')
	})

	it('orphans toggle (toggle-orphans) changes showOrphans boolean', () => {
		const changes: any[] = []
		act(() => {
			root.render(<FiltersSection onFiltersChange={(f) => changes.push(f)} />)
		})
		act(() => {
			;(
				container.querySelector('[data-testid="toggle-orphans"]') as HTMLInputElement
			).click()
		})
		expect(changes.length).toBeGreaterThan(0)
		expect(changes[changes.length - 1].showOrphans).toBe(false)
	})

	it('excluded-paths textarea fires onChange with new value', () => {
		const changes: any[] = []
		act(() => {
			root.render(<FiltersSection onFiltersChange={(f) => changes.push(f)} />)
		})
		const textarea = container.querySelector(
			'[data-testid="excluded-paths"]',
		) as HTMLTextAreaElement
		// Use native setter + input event for controlled React textarea
		const setter = Object.getOwnPropertyDescriptor(
			window.HTMLTextAreaElement.prototype,
			'value',
		)?.set
		act(() => {
			setter?.call(textarea, 'sessions/**')
			textarea.dispatchEvent(new Event('input', {bubbles: true}))
		})
		expect(changes.length).toBeGreaterThan(0)
		expect(changes[changes.length - 1].excludedPaths).toBe('sessions/**')
	})

	it('component initializes state from props.initialFilters (not hardcoded defaultFilters)', () => {
		const custom = {
			...defaultFilters,
			enabledTypes: ['memory', 'inbox'] as ('memory' | 'session' | 'inbox' | 'agent' | 'skill' | 'command' | 'root')[],
		}
		act(() => {
			root.render(<FiltersSection initialFilters={custom} />)
		})
		const sessionCheckbox = container.querySelector(
			'[data-testid="type-toggle-session"]',
		) as HTMLInputElement
		expect(sessionCheckbox.checked).toBe(false)
		const memoryCheckbox = container.querySelector(
			'[data-testid="type-toggle-memory"]',
		) as HTMLInputElement
		expect(memoryCheckbox.checked).toBe(true)
	})
})
