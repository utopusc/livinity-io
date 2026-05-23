// @vitest-environment jsdom
//
// Phase 198-07 Task 1 — empty-state.tsx tests (TDD RED → GREEN).
//
// Locks the EmptyState component contract from Plan 198-07 must_haves:
//
//   1. Renders the Liv AI logo (img with alt="Liv AI") + heading.
//   2. Renders the tagline string (LivOS'un yapay zekası — ...).
//   3. Clicking a SuggestedPrompts chip propagates the chip text through
//      the EmptyState's onPick prop exactly once.
//
// Per LivOS UI testing precedent (Plans 30-02 → 198-06), the UI package
// has D-NO-NEW-DEPS — `@testing-library/react` is NOT installed. Tests
// use direct react-dom/client mounts against jsdom + querySelector.

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Silence React 18's "current testing environment is not configured to
// support act(...)" warning under jsdom.
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {EmptyState} from './empty-state'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	act(() => {
		root.unmount()
	})
	container.remove()
})

describe('EmptyState', () => {
	it('Test 1: renders the Liv AI logo image (alt="Liv AI")', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<EmptyState onPick={onPick} />)
		})

		const img = document.querySelector(
			'[data-testid="liv-ai-empty-state"] img',
		) as HTMLImageElement | null
		expect(img).not.toBeNull()
		expect(img!.getAttribute('alt')).toBe('Liv AI')
	})

	it('Test 2: renders the locked Liv AI tagline ("ekranını yönetir, sorularına cevap verir, hatırlar")', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<EmptyState onPick={onPick} />)
		})

		const root_el = document.querySelector(
			'[data-testid="liv-ai-empty-state"]',
		)
		expect(root_el).not.toBeNull()
		const text = root_el!.textContent ?? ''
		// Locked phrase from Plan 198-07 must_haves truth #1.
		expect(text).toContain('ekranını yönetir')
		expect(text).toContain('sorularına cevap verir')
		expect(text).toContain('hatırlar')
	})

	it('Test 3: clicking a SuggestedPrompts chip propagates to onPick callback', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<EmptyState onPick={onPick} />)
		})

		const buttons = document.querySelectorAll(
			'[data-testid="liv-ai-suggested-prompts"] button',
		)
		expect(buttons.length).toBeGreaterThan(0)

		act(() => {
			;(buttons[0] as HTMLButtonElement).click()
		})

		expect(onPick).toHaveBeenCalledTimes(1)
		// First chip in DEFAULT_SUGGESTED_PROMPTS (locked by 198-06).
		expect(onPick).toHaveBeenCalledWith('What is the weather in Istanbul?')
	})
})

// Phase 199-01 — brand-string regression-lock (INV-199-02).
//
// Locks the literal 'Liv AI' brand string at three surfaces:
//   1. EmptyState <h2> hero heading
//   2. EmptyState outermost div data-testid='liv-ai-empty-state'
//      (carry-forward lock for Plan 199-05 which rebuilds this surface)
//   3. apps.tsx systemApps registry entry name === 'Liv AI'
//      (dock label string — must not revert to 'Liv' / 'LivinityAI')
//
// Any future rename regression (e.g. accidental 'Livinity AI' or 'Liv')
// breaks CI; the operator directive 2026-05-22 locks 'Liv AI' literally.
import {systemApps} from '../../providers/apps'

describe('EmptyState — Phase 199-01 brand regression-lock', () => {
	it('Test 1: hero <h2> renders the literal text "Liv AI"', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<EmptyState onPick={onPick} />)
		})

		const h2 = document.querySelector(
			'[data-testid="liv-ai-empty-state"] h2',
		)
		expect(h2).not.toBeNull()
		expect(h2!.textContent?.trim()).toBe('Liv AI')
	})

	it('Test 2: outermost div preserves data-testid="liv-ai-empty-state" (lock for Plan 199-05 rebuild)', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<EmptyState onPick={onPick} />)
		})

		const el = document.querySelector('[data-testid="liv-ai-empty-state"]')
		expect(el).not.toBeNull()
	})

	it('Test 3: apps.tsx systemApps entry id="LIVINITY_liv-ai" has name === "Liv AI"', () => {
		const livAiEntry = systemApps.find((a) => a.id === 'LIVINITY_liv-ai')
		expect(livAiEntry).toBeDefined()
		expect(livAiEntry!.name).toBe('Liv AI')
	})
})
