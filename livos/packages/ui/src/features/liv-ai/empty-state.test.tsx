// @vitest-environment jsdom
//
// Phase 198-07 Task 1 — empty-state.tsx tests (TDD RED → GREEN).
//
// Locks the EmptyState component contract from Plan 198-07 must_haves:
//
//   1. Renders the Liv AI logo (img with alt="Liv AI") + heading.
//   2. Renders the tagline string (English D-200-18; was Turkish pre-Phase-200).
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
	it('Test 1: renders the Liv AI logo image (alt="Liv AI") at h-16/w-16 (D-199-25)', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<EmptyState onPick={onPick} />)
		})

		const img = document.querySelector(
			'[data-testid="liv-ai-empty-state"] img',
		) as HTMLImageElement | null
		expect(img).not.toBeNull()
		expect(img!.getAttribute('alt')).toBe('Liv AI')
		// Plan 199-05 D-199-25 — logo tightened from h-20/w-20 → h-16/w-16
		// for the centered empty-state layout.
		const cls = img!.getAttribute('class') ?? ''
		expect(cls).toMatch(/\bh-16\b/)
		expect(cls).toMatch(/\bw-16\b/)
	})

	it('Test 2: renders the locked Liv AI tagline ("Liv AI — your operating system\'s assistant.") [D-200-18]', () => {
		const onPick = vi.fn()
		act(() => {
			root.render(<EmptyState onPick={onPick} />)
		})

		const root_el = document.querySelector(
			'[data-testid="liv-ai-empty-state"]',
		)
		expect(root_el).not.toBeNull()
		const text = root_el!.textContent ?? ''
		// Locked English phrase from D-200-18 (Plan 200-06 replaces the Phase
		// 198-07 Turkish wording per INV-200-05).
		expect(text).toContain('Liv AI')
		expect(text).toContain("your operating system's assistant")
	})

	it('Test 2b: LIV_AI_TAGLINE constant is the English D-200-18 string with NO Turkish diacritics (INV-200-05)', async () => {
		const {LIV_AI_TAGLINE} = await import('./empty-state')
		expect(LIV_AI_TAGLINE).toBe("Liv AI — your operating system's assistant.")
		// Sentinel — guards INV-200-05 against any future regression that
		// reintroduces Turkish diacritics into the Liv AI surface.
		expect(LIV_AI_TAGLINE).not.toMatch(/[ğüşıöçĞÜŞİÖÇ]/)
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
