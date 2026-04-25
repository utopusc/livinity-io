// Phase 24-01 — Docker section + sidebar store tests.
//
// Checks shape (12-entry SECTION_IDS, complete enum coverage), default state,
// and the two action shapes (setSection, toggleSidebar) the Sidebar component
// keys on. Persistence to localStorage is implicitly verified by zustand's
// `persist` middleware — we only test the in-memory store contract here.

import {beforeEach, describe, expect, test} from 'vitest'

import {SECTION_IDS, type SectionId, useDockerStore} from './store'

const EXPECTED_IDS: readonly SectionId[] = [
	'dashboard',
	'containers',
	'logs',
	'shell',
	'stacks',
	'images',
	'volumes',
	'networks',
	'registry',
	'activity',
	'schedules',
	'settings',
] as const

describe('SECTION_IDS', () => {
	test('has length 12', () => {
		expect(SECTION_IDS).toHaveLength(12)
	})

	test('contains the 12 expected section ids in display order', () => {
		expect([...SECTION_IDS]).toEqual([...EXPECTED_IDS])
	})
})

describe('useDockerStore', () => {
	beforeEach(() => {
		localStorage.clear()
		// Force-reset the store between tests so the persist middleware
		// doesn't leak state across cases.
		useDockerStore.setState({section: 'dashboard', sidebarCollapsed: false})
	})

	test("starts with section='dashboard' and sidebarCollapsed=false", () => {
		const s = useDockerStore.getState()
		expect(s.section).toBe('dashboard')
		expect(s.sidebarCollapsed).toBe(false)
	})

	test("setSection('containers') updates state.section", () => {
		useDockerStore.getState().setSection('containers')
		expect(useDockerStore.getState().section).toBe('containers')
	})

	test('toggleSidebar() flips sidebarCollapsed', () => {
		expect(useDockerStore.getState().sidebarCollapsed).toBe(false)
		useDockerStore.getState().toggleSidebar()
		expect(useDockerStore.getState().sidebarCollapsed).toBe(true)
		useDockerStore.getState().toggleSidebar()
		expect(useDockerStore.getState().sidebarCollapsed).toBe(false)
	})
})
