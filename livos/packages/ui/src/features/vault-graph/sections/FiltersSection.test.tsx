// @vitest-environment jsdom
//
// Phase 179-02 — FiltersSection unit tests (5 assertions, RED gate).
// Pattern: @testing-library/react render + fireEvent; real jsdom localStorage.

import {describe, it, expect, beforeEach} from 'vitest'
import {render, fireEvent} from '@testing-library/react'

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

beforeEach(() => {
	window.localStorage.clear()
})

describe('FiltersSection', () => {
	it('renders 7 type checkboxes (one per VaultNodeType)', () => {
		const {getByTestId} = render(<FiltersSection />)
		for (const type of ALL_TYPES) {
			expect(getByTestId(`type-toggle-${type}`)).toBeTruthy()
		}
	})

	it('clicking a type checkbox calls onFiltersChange with that type removed from enabledTypes', () => {
		const changes: any[] = []
		const {getByTestId} = render(
			<FiltersSection onFiltersChange={(f) => changes.push(f)} />,
		)
		// Click the 'memory' checkbox — it's currently checked, so clicking removes it
		fireEvent.click(getByTestId('type-toggle-memory'))
		expect(changes.length).toBeGreaterThan(0)
		expect(changes[changes.length - 1].enabledTypes).not.toContain('memory')
	})

	it('orphans toggle (toggle-orphans) changes showOrphans boolean', () => {
		const changes: any[] = []
		const {getByTestId} = render(
			<FiltersSection onFiltersChange={(f) => changes.push(f)} />,
		)
		const toggle = getByTestId('toggle-orphans') as HTMLInputElement
		// Default showOrphans is true; click to toggle to false
		fireEvent.click(toggle)
		expect(changes.length).toBeGreaterThan(0)
		expect(changes[changes.length - 1].showOrphans).toBe(false)
	})

	it('excluded-paths textarea fires onChange with new value', () => {
		const changes: any[] = []
		const {getByTestId} = render(
			<FiltersSection onFiltersChange={(f) => changes.push(f)} />,
		)
		const textarea = getByTestId('excluded-paths') as HTMLTextAreaElement
		fireEvent.change(textarea, {target: {value: 'sessions/**'}})
		expect(changes.length).toBeGreaterThan(0)
		expect(changes[changes.length - 1].excludedPaths).toBe('sessions/**')
	})

	it('component initializes state from props.initialFilters (not hardcoded defaultFilters)', () => {
		const custom = {...defaultFilters, enabledTypes: ['memory', 'inbox'] as any}
		const {getByTestId} = render(<FiltersSection initialFilters={custom} />)
		// session type checkbox should NOT be checked
		const sessionCheckbox = getByTestId(
			'type-toggle-session',
		) as HTMLInputElement
		expect(sessionCheckbox.checked).toBe(false)
		// memory type checkbox SHOULD be checked
		const memoryCheckbox = getByTestId('type-toggle-memory') as HTMLInputElement
		expect(memoryCheckbox.checked).toBe(true)
	})
})
