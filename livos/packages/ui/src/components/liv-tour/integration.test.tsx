// @vitest-environment jsdom
//
// Phase 76 Plan 76-07 — LivTour integration tests.
//
// Coverage (4 cases per PLAN <interfaces>):
//   1. Tour mounts (renders overlay) when localStorage flag is absent.
//   2. Tour does NOT render overlay when localStorage flag === '1'.
//   3. All 6 `data-tour="*"` selectors from LIV_TOUR_STEPS resolve to elements
//      in a fixture DOM that mirrors what 76-07 wires into the ai-chat tree.
//   4. Step 5 (`demo-prompt`) fires `onSetComposerDraft` with the locked
//      DEMO_PROMPT_TEXT ('Take a screenshot of google.com').
//
// Test discipline mirrors P76-05 use-tour-state.unit.test.ts:
//   - `@testing-library/react` is NOT installed in this UI package
//     (D-NO-NEW-DEPS — Phase 25/30/33/38/62/67-04/68-03/68-05/75-02/76-05 precedent).
//   - Direct `react-dom/client` mount + `act()` from React.
//   - Fixture DOM elements created via `document.createElement` to satisfy the
//     6 selectors without rendering the real /ai-chat tree (which pulls in
//     trpc/router/auth context that an integration test shouldn't need).

import {act} from 'react'
import {createElement} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {LivTour} from './index'
import {LIV_TOUR_STEPS} from './liv-tour-steps'
import {DEFAULT_STORAGE_KEY} from './use-tour-state'

// React 18 act() environment flag — vitest doesn't set this automatically.
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ─────────────────────────────────────────────────────────────────────
// Test harness
// ─────────────────────────────────────────────────────────────────────

let container: HTMLDivElement | null = null
let root: Root | null = null

function mount(node: React.ReactElement): void {
	if (!container) throw new Error('test harness not initialised')
	root = createRoot(container)
	act(() => {
		root!.render(node)
	})
}

beforeEach(() => {
	localStorage.clear()
	document.body.innerHTML = ''
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
	container = null
	document.body.innerHTML = ''
	localStorage.clear()
})

// ─────────────────────────────────────────────────────────────────────
// Helpers — build a fixture DOM that mirrors what 76-07 wires into
// /ai-chat. Adds 6 elements bearing the locked data-tour attributes.
// ─────────────────────────────────────────────────────────────────────

function buildAiChatFixture(): void {
	// 6 anchor elements for the 6 `data-tour="*"` selectors used by
	// LIV_TOUR_STEPS — composer, slash-hint, agent-picker, liv-tool-panel,
	// reasoning-card, marketplace-link. Each is a sibling div under body so
	// `document.querySelector('[data-tour="..."]')` resolves.
	const anchors: Array<['composer' | 'slash-hint' | 'agent-picker' | 'liv-tool-panel' | 'reasoning-card' | 'marketplace-link', string]> = [
		['composer', 'composer-fixture'],
		['slash-hint', 'slash-hint-fixture'],
		['agent-picker', 'agent-picker-fixture'],
		['liv-tool-panel', 'liv-tool-panel-fixture'],
		['reasoning-card', 'reasoning-card-fixture'],
		['marketplace-link', 'marketplace-link-fixture'],
	]
	for (const [attr, label] of anchors) {
		const el = document.createElement('div')
		el.setAttribute('data-tour', attr)
		el.textContent = label
		// Give the element a non-zero bounding rect so Spotlight has something
		// to measure (jsdom defaults all rects to 0/0/0/0; tour gracefully
		// degrades either way per D-15).
		document.body.appendChild(el)
	}
}

// ─────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('LivTour integration (Phase 76-07)', () => {
	it('mounts overlay (step 1) when localStorage flag is absent', () => {
		expect(localStorage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()

		mount(createElement(LivTour))

		// Tour renders via createPortal into document.body — overlay marker is
		// `[data-tour-overlay='1']`. Locked in 76-05 index.tsx.
		const overlay = document.querySelector('[data-tour-overlay="1"]')
		expect(overlay).not.toBeNull()

		// Step 1 (welcome) shows the locked title 'Meet Liv.' verbatim per
		// CONTEXT D-15 + 76-05 LIV_TOUR_STEPS[0].
		expect(document.body.textContent).toContain('Meet Liv.')

		// Step counter should read '1 of 9'.
		const counter = document.querySelector('[data-tour-counter="1"]')
		expect(counter?.textContent).toBe('1 of 9')
	})

	it("does NOT render overlay when localStorage flag === '1'", () => {
		localStorage.setItem(DEFAULT_STORAGE_KEY, '1')

		mount(createElement(LivTour))

		// `useTourState` init lambda reads localStorage → isVisible=false →
		// LivTour root returns null → no overlay element exists in DOM.
		const overlay = document.querySelector('[data-tour-overlay="1"]')
		expect(overlay).toBeNull()
		expect(document.body.textContent).not.toContain('Meet Liv.')
	})

	it('all 6 data-tour selectors resolve to elements in the ai-chat fixture', () => {
		buildAiChatFixture()

		// LIV_TOUR_STEPS contains 9 steps; only the 6 anchored steps have
		// `targetSelector`. The other 3 are centered modals (welcome / done)
		// or share a selector (demo-prompt re-uses the composer anchor).
		const selectors = LIV_TOUR_STEPS
			.map((s) => s.targetSelector)
			.filter((s): s is string => typeof s === 'string')

		// Sanity: 5 distinct selectors covering 6 attribute names — the
		// `composer` anchor is referenced by two steps (step 2 + step 5).
		// PLAN <must_haves> lists 6 attributes; the test asserts each
		// attribute resolves at least one element.
		const attributes = ['composer', 'slash-hint', 'agent-picker', 'liv-tool-panel', 'reasoning-card', 'marketplace-link']
		for (const attr of attributes) {
			const el = document.querySelector(`[data-tour="${attr}"]`)
			expect(el, `data-tour="${attr}" must resolve to an element in the fixture`).not.toBeNull()
		}

		// And each LIV_TOUR_STEPS targetSelector must resolve too.
		for (const sel of selectors) {
			const el = document.querySelector(sel)
			expect(el, `LIV_TOUR_STEPS targetSelector ${sel} must resolve`).not.toBeNull()
		}
	})

	it('step 5 onSetComposerDraft fires with the locked demo prompt text', () => {
		const draftSpy = vi.fn()

		mount(createElement(LivTour, {onSetComposerDraft: draftSpy}))

		// At mount, step 0 (welcome) — spy must NOT have been called yet.
		expect(draftSpy).not.toHaveBeenCalled()

		// LIV_TOUR_STEPS index 4 (`demo-prompt`) is reached by 4 next() calls
		// from index 0. The user-facing keyboard (ArrowRight) maps to next()
		// per LivTour's keydown handler — driving via keydown exercises the
		// real production path (no test-only API surface).
		for (let i = 0; i < 4; i++) {
			act(() => {
				document.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight'}))
			})
		}

		// Step 5 (`demo-prompt`) onEnter effect fires — useEffect dependency
		// is the step id, so the synchronous dispatch + act() flushes the
		// effect on the same frame.
		expect(draftSpy).toHaveBeenCalledWith('Take a screenshot of google.com')
		expect(draftSpy).toHaveBeenCalledTimes(1)
	})
})
