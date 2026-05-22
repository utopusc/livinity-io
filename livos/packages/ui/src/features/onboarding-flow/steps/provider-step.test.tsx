// @vitest-environment jsdom
//
// Phase 196 Plan 03 — ProviderStep vitest coverage.
//
// RTL (testing-library/react) is intentionally NOT used in this UI
// package (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67-04/68/195-04
// precedent — see livos/packages/ui/src/features/onboarding-flow/steps/connect-ai-step.test.tsx
// for the canonical react-dom/client harness).
//
// Coverage (4 it() blocks):
//
//   1. Idle render: all 4 provider cards rendered; xAI has
//      data-testid="provider-card-xai"; 3 disabled cards expose
//      aria-disabled="true" + "Coming soon" badge.
//   2. xAI auto-route: clicking the xAI card in a SINGLE synchronous
//      handler calls setData({provider: 'xai'}) AND onContinue() —
//      no intermediate Continue click required, no setTimeout.
//   3. Disabled cards do NOT advance: clicking each of the 3 disabled
//      cards leaves onContinue spy at 0 calls.
//   4. Footer Continue is inert (disabled) but Back still works.
//
// References:
//   - .planning/phases/196-onboarding-completion-installer-locale/196-03-PLAN.md (Task 1)
//   - connect-ai-step.test.tsx — RTL-absent precedent harness

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {DEFAULT_DATA, type OnboardingData} from '../constants'
import {ProviderStep} from './provider-step'

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
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
})

type Overrides = {
	data?: OnboardingData
	setData?: (d: OnboardingData) => void
	onContinue?: () => void
	onSkip?: () => void
	onBack?: () => void
}

function renderStep(overrides: Overrides = {}) {
	const data = overrides.data ?? {...DEFAULT_DATA}
	const setData = overrides.setData ?? vi.fn()
	const onContinue = overrides.onContinue ?? vi.fn()
	const onSkip = overrides.onSkip ?? vi.fn()
	const onBack = overrides.onBack ?? vi.fn()
	act(() => {
		root!.render(
			<ProviderStep
				data={data}
				setData={setData}
				onContinue={onContinue}
				onSkip={onSkip}
				onBack={onBack}
			/>,
		)
	})
	return {container: container!, data, setData, onContinue, onSkip, onBack}
}

// ─────────────────────────────────────────────────────────────────────
// 1. Idle render — 4 cards (1 active, 3 disabled with badges)
// ─────────────────────────────────────────────────────────────────────

describe('ProviderStep — idle render', () => {
	it('renders 4 provider cards: xAI enabled + 3 disabled with Coming soon badges', () => {
		const {container} = renderStep()

		const xaiCard = container.querySelector('[data-testid="provider-card-xai"]')
		expect(xaiCard).not.toBeNull()
		// xAI card is NOT marked aria-disabled.
		expect(xaiCard!.getAttribute('aria-disabled')).not.toBe('true')

		const claudeCard = container.querySelector('[data-testid="provider-card-claude"]')
		const openaiCard = container.querySelector('[data-testid="provider-card-openai"]')
		const anthropicCard = container.querySelector('[data-testid="provider-card-anthropic"]')

		expect(claudeCard).not.toBeNull()
		expect(openaiCard).not.toBeNull()
		expect(anthropicCard).not.toBeNull()

		// All 3 non-xAI cards aria-disabled="true".
		expect(claudeCard!.getAttribute('aria-disabled')).toBe('true')
		expect(openaiCard!.getAttribute('aria-disabled')).toBe('true')
		expect(anthropicCard!.getAttribute('aria-disabled')).toBe('true')

		// All 3 disabled cards render "Coming soon" badges.
		const badges = container.querySelectorAll('.provider-card-badge')
		expect(badges.length).toBe(3)
		badges.forEach((b) => {
			expect(b.textContent).toContain('Coming soon')
		})
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. xAI auto-route — single synchronous handler (no intermediate Continue)
// ─────────────────────────────────────────────────────────────────────

describe('ProviderStep — xAI auto-route', () => {
	it('clicking the xAI card synchronously calls setData({provider:"xai"}) AND onContinue() — no Continue button needed', () => {
		const setData = vi.fn()
		const onContinue = vi.fn()
		const {container} = renderStep({setData, onContinue})

		const xaiCard = container.querySelector(
			'[data-testid="provider-card-xai"]',
		) as HTMLButtonElement
		expect(xaiCard).not.toBeNull()

		// Click the xAI card.
		act(() => {
			xaiCard.click()
		})

		// setData called once with provider:'xai' shape (entire data preserved).
		expect(setData).toHaveBeenCalledTimes(1)
		const setDataArg = setData.mock.calls[0][0] as OnboardingData
		expect(setDataArg.provider).toBe('xai')

		// onContinue called once in the SAME synchronous handler (no setTimeout).
		expect(onContinue).toHaveBeenCalledTimes(1)

		// Continue button (footer) was NOT clicked — auto-route bypasses footer.
		// We verify by re-reading the FooterBar Continue button: still disabled.
		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		expect(continueBtn).toBeDefined()
		expect(continueBtn.disabled).toBe(true)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 3. T-196-03-01 — Disabled cards do NOT advance
// ─────────────────────────────────────────────────────────────────────

describe('ProviderStep — T-196-03-01 disabled cards must not advance', () => {
	it('clicking each of the 3 disabled cards leaves onContinue at 0 calls', () => {
		const setData = vi.fn()
		const onContinue = vi.fn()
		const {container} = renderStep({setData, onContinue})

		const claudeCard = container.querySelector(
			'[data-testid="provider-card-claude"]',
		) as HTMLButtonElement
		const openaiCard = container.querySelector(
			'[data-testid="provider-card-openai"]',
		) as HTMLButtonElement
		const anthropicCard = container.querySelector(
			'[data-testid="provider-card-anthropic"]',
		) as HTMLButtonElement

		act(() => {
			claudeCard.click()
			openaiCard.click()
			anthropicCard.click()
		})

		expect(onContinue).toHaveBeenCalledTimes(0)
		expect(setData).toHaveBeenCalledTimes(0)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 4. Footer — Continue inert, Back still works
// ─────────────────────────────────────────────────────────────────────

describe('ProviderStep — footer behaviour', () => {
	it('footer Continue is disabled (inert); clicking Back invokes onBack exactly once', () => {
		const onBack = vi.fn()
		const onContinue = vi.fn()
		const {container} = renderStep({onBack, onContinue})

		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		expect(continueBtn).toBeDefined()
		expect(continueBtn.disabled).toBe(true)

		// Even if we click it, onContinue is NOT invoked (browser semantics —
		// disabled buttons don't fire click handlers).
		act(() => {
			continueBtn.click()
		})
		expect(onContinue).toHaveBeenCalledTimes(0)

		// Back button still works.
		const backBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Back'),
		) as HTMLButtonElement
		expect(backBtn).toBeDefined()
		act(() => {
			backBtn.click()
		})
		expect(onBack).toHaveBeenCalledTimes(1)
	})
})
