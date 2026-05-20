// @vitest-environment jsdom
//
// Phase 179-05 — useGraphSettings hook tests (3 assertions, RED gate).
// Pattern: renderHook from @testing-library/react — but since RTL not installed,
// use a minimal renderHook wrapper via createRoot + act (same pattern as all other UI tests).

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {useState} from 'react'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
	true

import {useGraphSettings} from './useGraphSettings'
import {defaultFilters} from '../sections/FiltersSection'
import {defaultForces, FORCES_KEY} from '../sections/ForcesSection'

// Minimal hook tester: renders a component that calls the hook and exposes its result.
let hookResult: any = undefined
let container: HTMLDivElement
let root: Root

function HookWrapper({fn}: {fn: () => any}) {
	hookResult = fn()
	return null
}

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	window.localStorage.clear()
	hookResult = undefined
})

afterEach(() => {
	act(() => root.unmount())
	container.remove()
	vi.restoreAllMocks()
})

describe('useGraphSettings', () => {
	it('returns defaultFilters when localStorage has no filters key', () => {
		act(() => {
			root.render(<HookWrapper fn={() => useGraphSettings()} />)
		})
		expect(hookResult.filters).toEqual(defaultFilters)
	})

	it('returns persisted ForcesState when localStorage has forces key', () => {
		const persisted = {...defaultForces, centerStrength: 0.9}
		window.localStorage.setItem(FORCES_KEY(), JSON.stringify(persisted))
		act(() => {
			root.render(<HookWrapper fn={() => useGraphSettings()} />)
		})
		expect(hookResult.forces.centerStrength).toBe(0.9)
	})

	it('calling setForces() updates state AND writes to localStorage forces key', () => {
		act(() => {
			root.render(<HookWrapper fn={() => useGraphSettings()} />)
		})
		const newForces = {...defaultForces, repelStrength: -120}
		act(() => {
			hookResult.setForces(newForces)
		})
		expect(hookResult.forces.repelStrength).toBe(-120)
		const stored = JSON.parse(window.localStorage.getItem(FORCES_KEY()) ?? '{}')
		expect(stored.repelStrength).toBe(-120)
	})
})
