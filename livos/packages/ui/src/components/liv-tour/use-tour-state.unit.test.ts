// @vitest-environment jsdom
//
// Phase 76 Plan 76-05 — useTourState state-machine tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — established Phase 25/30/33/38/62/67-04/68-03/68-05/75-02
// precedent; see livos/packages/ui/src/routes/ai-chat/liv-tool-panel.unit.test.tsx
// for the canonical "RTL absent" testing posture).
//
// Per that precedent we drive the hook via direct react-dom/client renders
// against the jsdom DOM with a thin RTL-shaped harness. When
// `@testing-library/react` eventually lands, the helpers below collapse to
// `renderHook` 1:1.
//
// Coverage (6 tests per 76-05 PLAN must_haves):
//   1. init: localStorage flag absent → isVisible=true, currentStep=steps[0]
//   2. init: localStorage flag === '1' → isVisible=false, currentStep=null
//   3. next() increments currentStepIndex
//   4. back() at index 0 stays at 0 (clamped)
//   5. skip() sets localStorage flag and isVisible=false
//   6. next() past last step calls finish (sets flag, isVisible=false)
//
// All tests `localStorage.clear()` in `beforeEach` for isolation.

import {act} from 'react'
import {createElement, useEffect} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {DEFAULT_STORAGE_KEY, useTourState, type TourState} from './use-tour-state'

// Silence React 18's "current testing environment is not configured to
// support act(...)" warning under jsdom — we ARE in a test env, vitest
// just doesn't set this global automatically.
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ─────────────────────────────────────────────────────────────────────
// Test harness — direct react-dom/client mount that captures the live
// hook return value into a ref the test can poke and read.
// ─────────────────────────────────────────────────────────────────────

let container: HTMLDivElement | null = null
let root: Root | null = null
let captured: TourState | null = null

function HookHarness() {
	const state = useTourState()
	useEffect(() => {
		captured = state
	})
	// Always assign on render so synchronous reads (post-act) see the latest.
	captured = state
	return null
}

function renderHookHarness(): TourState {
	if (!container) throw new Error('test harness not initialised')
	root = createRoot(container)
	act(() => {
		root!.render(createElement(HookHarness))
	})
	if (!captured) throw new Error('hook did not produce state')
	return captured
}

beforeEach(() => {
	localStorage.clear()
	captured = null
	container = document.createElement('div')
	document.body.appendChild(container)
})

afterEach(() => {
	if (root) {
		act(() => {
			root!.unmount()
		})
		root = null
	}
	if (container && container.parentNode) {
		container.parentNode.removeChild(container)
	}
	container = null
	captured = null
	localStorage.clear()
})

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('useTourState (Phase 76-05)', () => {
	it('init: localStorage flag absent → isVisible=true and currentStep=steps[0]', () => {
		const state = renderHookHarness()
		expect(state.isVisible).toBe(true)
		expect(state.currentStepIndex).toBe(0)
		expect(state.currentStep?.id).toBe('welcome')
		expect(state.totalSteps).toBe(9)
	})

	it("init: localStorage flag === '1' → isVisible=false and currentStep=null", () => {
		localStorage.setItem(DEFAULT_STORAGE_KEY, '1')
		const state = renderHookHarness()
		expect(state.isVisible).toBe(false)
		expect(state.currentStep).toBeNull()
	})

	it('next() increments currentStepIndex', () => {
		renderHookHarness()
		const before = captured!
		expect(before.currentStepIndex).toBe(0)

		act(() => {
			before.next()
		})
		expect(captured!.currentStepIndex).toBe(1)
		expect(captured!.currentStep?.id).toBe('composer')

		act(() => {
			captured!.next()
		})
		expect(captured!.currentStepIndex).toBe(2)
		expect(captured!.currentStep?.id).toBe('slash-cmd')
	})

	it('back() at index 0 stays at 0 (clamped)', () => {
		renderHookHarness()
		const initial = captured!
		expect(initial.currentStepIndex).toBe(0)

		act(() => {
			initial.back()
		})
		expect(captured!.currentStepIndex).toBe(0)
		expect(captured!.isVisible).toBe(true)

		// And after advancing then going back twice past 0 — still clamped at 0.
		act(() => {
			captured!.next()
		})
		expect(captured!.currentStepIndex).toBe(1)
		act(() => {
			captured!.back()
		})
		expect(captured!.currentStepIndex).toBe(0)
		act(() => {
			captured!.back()
		})
		expect(captured!.currentStepIndex).toBe(0)
	})

	it('skip() sets localStorage flag and isVisible=false', () => {
		renderHookHarness()
		expect(localStorage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()

		act(() => {
			captured!.skip()
		})

		expect(localStorage.getItem(DEFAULT_STORAGE_KEY)).toBe('1')
		expect(captured!.isVisible).toBe(false)
		expect(captured!.currentStep).toBeNull()
	})

	it('next() past last step calls finish (sets flag and isVisible=false)', () => {
		renderHookHarness()
		expect(captured!.totalSteps).toBe(9)

		// Advance through all 8 transitions to reach final step (index 8).
		for (let i = 0; i < 8; i++) {
			act(() => {
				captured!.next()
			})
		}
		expect(captured!.currentStepIndex).toBe(8)
		expect(captured!.currentStep?.id).toBe('done')
		expect(captured!.isVisible).toBe(true)
		expect(localStorage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()

		// Next at the last step → finish (flag set + hidden).
		act(() => {
			captured!.next()
		})

		expect(localStorage.getItem(DEFAULT_STORAGE_KEY)).toBe('1')
		expect(captured!.isVisible).toBe(false)
		expect(captured!.currentStep).toBeNull()
	})
})
