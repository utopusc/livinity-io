// Phase 29 Plan 29-02 — useSidebarDensity unit tests (DOC-17).
//
// Locks down the localStorage-backed sidebar density preference. Tests run
// under jsdom (vitest UI default) so window.localStorage is available.
//
// Test cases A-D:
//   A: default density === 'comfortable'
//   B: setDensity('compact') updates state to 'compact'
//   C: setDensity persists to localStorage 'livos:docker:sidebar-density'
//   D: corrupted localStorage value (e.g. 'banana') falls back to 'comfortable'

import {beforeEach, describe, expect, test} from 'vitest'

describe('useSidebarDensity store', () => {
	beforeEach(() => {
		localStorage.clear()
		// Reset zustand persist module state by re-importing fresh via vi.resetModules.
		// Vitest gives a fresh module instance per `await import()` after `resetModules()`.
	})

	test('A: default density === "comfortable"', async () => {
		const {vi} = await import('vitest')
		vi.resetModules()
		const {useSidebarDensity} = await import('./sidebar-density.js')
		expect(useSidebarDensity.getState().density).toBe('comfortable')
	})

	test('B: setDensity("compact") updates state', async () => {
		const {vi} = await import('vitest')
		vi.resetModules()
		const {useSidebarDensity} = await import('./sidebar-density.js')
		useSidebarDensity.getState().setDensity('compact')
		expect(useSidebarDensity.getState().density).toBe('compact')
	})

	test('C: setDensity persists to localStorage "livos:docker:sidebar-density"', async () => {
		const {vi} = await import('vitest')
		vi.resetModules()
		const {useSidebarDensity} = await import('./sidebar-density.js')
		useSidebarDensity.getState().setDensity('compact')
		const raw = localStorage.getItem('livos:docker:sidebar-density')
		expect(raw).toBeTruthy()
		const parsed = JSON.parse(raw!)
		// zustand persist wraps the state under `state.density`
		expect(parsed.state.density).toBe('compact')
	})

	test('D: corrupted localStorage value falls back to "comfortable"', async () => {
		// Pre-seed localStorage with a malformed density value
		localStorage.setItem(
			'livos:docker:sidebar-density',
			JSON.stringify({state: {density: 'banana'}, version: 0}),
		)
		const {vi} = await import('vitest')
		vi.resetModules()
		const {useSidebarDensity} = await import('./sidebar-density.js')
		expect(useSidebarDensity.getState().density).toBe('comfortable')
	})
})
