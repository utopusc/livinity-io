// @vitest-environment jsdom
//
// Phase 196-04 Task 3 — RegionStep vitest coverage.
//
// RTL (testing-library/react) is intentionally NOT used (D-NO-NEW-DEPS,
// established Phase 25/30/33/38/62/67-04/68/195-04/196-03 precedent —
// see connect-ai-step.test.tsx + provider-step.test.tsx for the
// canonical react-dom/client + vi.mock harness).
//
// Coverage (6 it() blocks):
//
//   1. 6 cards render: all 6 region labels in DOM + testids.
//   2. initialSuggestedRegion='europe' pre-selects Europe + renders
//      the "Suggested by your location" pill on the Europe card.
//   3. No prop + Intl timezone 'Europe/Istanbul' → Europe pre-selected
//      via client-side timezone fallback.
//   4. Continue calls trpc.setup.setRegion + onContinue (single
//      synchronous click → setData + mutate + onContinue chain).
//   5. Skip calls onSkip without setRegion.mutate.
//   6. Selecting a different card updates the chosen region — click
//      Asia, click Continue, assert mutate called with {region:'asia'}.

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ─────────────────────────────────────────────────────────────────────
// Mock trpcReact.setup.setRegion BEFORE component import.
// ─────────────────────────────────────────────────────────────────────

const setRegionMutateAsync = vi.fn()
let isPending = false

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		setup: {
			setRegion: {
				useMutation: () => ({
					mutateAsync: setRegionMutateAsync,
					get isPending() {
						return isPending
					},
				}),
			},
		},
	},
}))

import {DEFAULT_DATA, type OnboardingData} from '../constants'
import {RegionStep} from './region-step'

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	setRegionMutateAsync.mockReset()
	setRegionMutateAsync.mockResolvedValue({ok: true})
	isPending = false
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
	initialSuggestedRegion?: 'europe' | 'north-america' | 'south-america' | 'asia' | 'africa' | 'oceania' | null
}

function renderStep(overrides: Overrides = {}) {
	const data = overrides.data ?? {...DEFAULT_DATA}
	const setData = overrides.setData ?? vi.fn()
	const onContinue = overrides.onContinue ?? vi.fn()
	const onSkip = overrides.onSkip ?? vi.fn()
	const onBack = overrides.onBack ?? vi.fn()
	const initialSuggestedRegion = overrides.initialSuggestedRegion
	act(() => {
		root!.render(
			<RegionStep
				data={data}
				setData={setData}
				onContinue={onContinue}
				onSkip={onSkip}
				onBack={onBack}
				initialSuggestedRegion={initialSuggestedRegion}
			/>,
		)
	})
	return {container: container!, data, setData, onContinue, onSkip, onBack}
}

function flushMicrotasks() {
	return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

// ─────────────────────────────────────────────────────────────────────
// 1. 6 cards render
// ─────────────────────────────────────────────────────────────────────

describe('RegionStep — idle render', () => {
	it('renders all 6 region cards with their labels', () => {
		const {container} = renderStep()

		const europe = container.querySelector('[data-testid="region-card-europe"]')
		const na = container.querySelector('[data-testid="region-card-north-america"]')
		const sa = container.querySelector('[data-testid="region-card-south-america"]')
		const asia = container.querySelector('[data-testid="region-card-asia"]')
		const africa = container.querySelector('[data-testid="region-card-africa"]')
		const oceania = container.querySelector('[data-testid="region-card-oceania"]')

		expect(europe).not.toBeNull()
		expect(na).not.toBeNull()
		expect(sa).not.toBeNull()
		expect(asia).not.toBeNull()
		expect(africa).not.toBeNull()
		expect(oceania).not.toBeNull()

		expect(europe!.textContent).toContain('Europe')
		expect(na!.textContent).toContain('North America')
		expect(sa!.textContent).toContain('South America')
		expect(asia!.textContent).toContain('Asia')
		expect(africa!.textContent).toContain('Africa')
		expect(oceania!.textContent).toContain('Oceania')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. initialSuggestedRegion pre-selects + pill renders
// ─────────────────────────────────────────────────────────────────────

describe('RegionStep — SSR-injected suggestion', () => {
	it('initialSuggestedRegion="europe" pre-selects Europe + renders the Suggested pill on Europe', () => {
		const {container} = renderStep({initialSuggestedRegion: 'europe'})

		const europeCard = container.querySelector(
			'[data-testid="region-card-europe"]',
		) as HTMLButtonElement
		expect(europeCard.getAttribute('aria-pressed')).toBe('true')
		expect(europeCard.className).toContain('is-selected')
		expect(europeCard.className).toContain('is-suggested')

		// Suggested pill only on Europe.
		const europePill = container.querySelector('[data-testid="region-card-europe-suggested"]')
		expect(europePill).not.toBeNull()
		expect(europePill!.textContent).toContain('Suggested by your location')

		// No other card has a suggested pill.
		const asiaPill = container.querySelector('[data-testid="region-card-asia-suggested"]')
		expect(asiaPill).toBeNull()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 3. Client-side timezone fallback (no SSR prop)
// ─────────────────────────────────────────────────────────────────────

describe('RegionStep — client timezone fallback', () => {
	it('without initialSuggestedRegion, Intl.DateTimeFormat timeZone=Europe/Istanbul pre-selects Europe', () => {
		const realDTF = Intl.DateTimeFormat
		// Stub Intl.DateTimeFormat so resolvedOptions().timeZone returns 'Europe/Istanbul'.
		const stubInstance = {
			resolvedOptions: () => ({timeZone: 'Europe/Istanbul'}),
		}
		// @ts-expect-error — test stub
		Intl.DateTimeFormat = function () {
			return stubInstance
		}

		try {
			const {container} = renderStep({})
			const europeCard = container.querySelector(
				'[data-testid="region-card-europe"]',
			) as HTMLButtonElement
			expect(europeCard.getAttribute('aria-pressed')).toBe('true')
			expect(europeCard.className).toContain('is-suggested')
		} finally {
			Intl.DateTimeFormat = realDTF
		}
	})
})

// ─────────────────────────────────────────────────────────────────────
// 4. Continue → trpc.setup.setRegion.mutate + onContinue
// ─────────────────────────────────────────────────────────────────────

describe('RegionStep — Continue persistence', () => {
	it('Continue calls trpc.setup.setRegion.mutate({region:"europe"}) and onContinue exactly once', async () => {
		const setData = vi.fn()
		const onContinue = vi.fn()
		const {container} = renderStep({
			setData,
			onContinue,
			initialSuggestedRegion: 'europe',
		})

		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		expect(continueBtn).toBeDefined()
		expect(continueBtn.disabled).toBe(false)

		await act(async () => {
			continueBtn.click()
			await flushMicrotasks()
			await flushMicrotasks()
		})

		// setData called with the region merged into OnboardingData.
		expect(setData).toHaveBeenCalledTimes(1)
		const setDataArg = setData.mock.calls[0][0] as OnboardingData & {region?: string}
		expect(setDataArg.region).toBe('europe')

		// tRPC mutation invoked with {region:'europe'}.
		expect(setRegionMutateAsync).toHaveBeenCalledTimes(1)
		expect(setRegionMutateAsync).toHaveBeenCalledWith({region: 'europe'})

		// onContinue fired after the mutation resolved.
		expect(onContinue).toHaveBeenCalledTimes(1)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5. Skip → onSkip only (no persistence)
// ─────────────────────────────────────────────────────────────────────

describe('RegionStep — Skip path', () => {
	it('clicking Skip invokes onSkip exactly once and does NOT call setRegion.mutate', () => {
		const onSkip = vi.fn()
		const {container} = renderStep({onSkip, initialSuggestedRegion: 'europe'})

		const skipBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.match(/^Skip$|Skip for now/),
		) as HTMLButtonElement
		expect(skipBtn).toBeDefined()

		act(() => {
			skipBtn.click()
		})

		expect(onSkip).toHaveBeenCalledTimes(1)
		expect(setRegionMutateAsync).not.toHaveBeenCalled()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 6. Different card click updates the chosen region
// ─────────────────────────────────────────────────────────────────────

describe('RegionStep — manual override', () => {
	it('clicking the Asia card after a Europe suggestion makes Continue persist {region:"asia"}', async () => {
		const setData = vi.fn()
		const onContinue = vi.fn()
		const {container} = renderStep({
			setData,
			onContinue,
			initialSuggestedRegion: 'europe',
		})

		// Click the Asia card.
		const asiaCard = container.querySelector(
			'[data-testid="region-card-asia"]',
		) as HTMLButtonElement
		act(() => {
			asiaCard.click()
		})
		expect(asiaCard.getAttribute('aria-pressed')).toBe('true')

		// Europe is no longer selected (but still has the suggested pill).
		const europeCard = container.querySelector(
			'[data-testid="region-card-europe"]',
		) as HTMLButtonElement
		expect(europeCard.getAttribute('aria-pressed')).toBe('false')
		// Suggested pill on Europe still present (suggestion is locked at mount).
		expect(
			container.querySelector('[data-testid="region-card-europe-suggested"]'),
		).not.toBeNull()

		// Click Continue.
		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		await act(async () => {
			continueBtn.click()
			await flushMicrotasks()
			await flushMicrotasks()
		})

		expect(setRegionMutateAsync).toHaveBeenCalledTimes(1)
		expect(setRegionMutateAsync).toHaveBeenCalledWith({region: 'asia'})
		expect(onContinue).toHaveBeenCalledTimes(1)
	})
})
