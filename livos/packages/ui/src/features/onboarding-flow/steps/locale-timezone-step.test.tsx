// @vitest-environment jsdom
//
// Phase 196-05 Task 4 — LocaleTimezoneStep vitest coverage.
//
// RTL (testing-library/react) is intentionally NOT used (D-NO-NEW-DEPS —
// established Phase 25/30/33/38/62/67-04/68/195-04/196-03/196-04
// precedent). The canonical harness is `react-dom/client createRoot()` +
// `vi.mock('@/trpc/trpc')` + `act()` for synchronous click dispatch.
//
// Coverage (6 it() blocks):
//
//   1. auto-detect render — Intl.DateTimeFormat stub returns
//      Europe/Istanbul + navigator.language='tr-TR' → both pills present,
//      selected values match detected.
//   2. operator overrides timezone — type 'America/New_York' in the
//      combobox + click the matching item + Continue → mutate called
//      with {timezone:'America/New_York', locale:'tr-TR'}.
//   3. operator overrides locale — change the <select> to 'en-US' +
//      Continue → mutate called with {timezone:'Europe/Istanbul',
//      locale:'en-US'}.
//   4. Continue calls trpc + onContinue on success (the success-only
//      sequence is locked separately from the override paths above).
//   5. Skip bypasses the mutation entirely — onSkip called once,
//      mutate never invoked.
//   6. mutation failure renders the error inline — mock rejects with
//      Error('timedatectl exit 1: permission denied'); inline error
//      region contains 'permission denied'; onContinue NOT called.

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ─────────────────────────────────────────────────────────────────────
// Mock trpcReact.setup.setLocaleTimezone BEFORE component import.
// ─────────────────────────────────────────────────────────────────────

const setLocaleTimezoneMutateAsync = vi.fn()
let isPending = false

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		setup: {
			setLocaleTimezone: {
				useMutation: () => ({
					mutateAsync: setLocaleTimezoneMutateAsync,
					get isPending() {
						return isPending
					},
				}),
			},
		},
	},
}))

import {DEFAULT_DATA, type OnboardingData} from '../constants'
import {LocaleTimezoneStep} from './locale-timezone-step'

let container: HTMLDivElement | null = null
let root: Root | null = null

// Real Intl.DateTimeFormat backup — restore after each test (some
// tests stub resolvedOptions to return a specific timeZone).
const realDTF = Intl.DateTimeFormat
const realNavigatorLanguageDesc = Object.getOwnPropertyDescriptor(
	Object.getPrototypeOf(window.navigator) as object,
	'language',
)

function stubIntl(timeZone: string) {
	// @ts-expect-error — test stub of Intl.DateTimeFormat constructor.
	// We swap ONLY the constructor; `Intl.supportedValuesOf` (a separate
	// top-level property on the Intl namespace) is unaffected and the
	// component's `listSupportedTimezones()` keeps returning the full
	// IANA zone list from the real implementation.
	Intl.DateTimeFormat = function (...args: unknown[]) {
		if (args.length === 0) {
			return {
				resolvedOptions: () => ({timeZone}),
			}
		}
		// @ts-expect-error — fall through to real DTF for any other usage.
		return new realDTF(...args)
	}
}

function stubNavigatorLanguage(value: string) {
	Object.defineProperty(window.navigator, 'language', {
		value,
		configurable: true,
	})
}

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	setLocaleTimezoneMutateAsync.mockReset()
	setLocaleTimezoneMutateAsync.mockResolvedValue({ok: true})
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

	// Restore real Intl.DateTimeFormat
	Intl.DateTimeFormat = realDTF
	if (realNavigatorLanguageDesc) {
		Object.defineProperty(
			Object.getPrototypeOf(window.navigator) as object,
			'language',
			realNavigatorLanguageDesc,
		)
	}
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
			<LocaleTimezoneStep
				data={data}
				setData={setData}
				onContinue={onContinue}
				onSkip={onSkip}
				onBack={onBack}
			/>,
		)
	})
	return {container: container!, setData, onContinue, onSkip, onBack}
}

function flushMicrotasks() {
	return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

// ─────────────────────────────────────────────────────────────────────
// 1. auto-detect render
// ─────────────────────────────────────────────────────────────────────

describe('LocaleTimezoneStep — auto-detect on mount', () => {
	it('renders with detected timezone + locale and shows the Suggested pills', () => {
		stubIntl('Europe/Istanbul')
		stubNavigatorLanguage('tr-TR')

		const {container} = renderStep()

		const tzCurrent = container.querySelector(
			'[data-testid="locale-timezone-tz-current"]',
		)
		expect(tzCurrent).not.toBeNull()
		expect(tzCurrent!.textContent).toContain('Europe/Istanbul')

		const localeSelect = container.querySelector(
			'[data-testid="locale-timezone-locale-select"]',
		) as HTMLSelectElement
		expect(localeSelect).not.toBeNull()
		expect(localeSelect.value).toBe('tr-TR')

		// Both Suggested pills visible (selection equals detection).
		expect(
			container.querySelector('[data-testid="locale-timezone-tz-suggested"]'),
		).not.toBeNull()
		expect(
			container.querySelector('[data-testid="locale-timezone-locale-suggested"]'),
		).not.toBeNull()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. operator overrides timezone
// ─────────────────────────────────────────────────────────────────────

describe('LocaleTimezoneStep — operator override (timezone)', () => {
	it('typing + selecting America/New_York then Continue mutates with the overridden timezone', async () => {
		stubIntl('Europe/Istanbul')
		stubNavigatorLanguage('tr-TR')

		const onContinue = vi.fn()
		const {container} = renderStep({onContinue})

		// Type a query into the combobox via the React-aware native value
		// setter (React 18 onChange listens on the synthetic-event tree;
		// setting `.value` directly is insufficient).
		const tzInput = container.querySelector(
			'[data-testid="locale-timezone-tz-input"]',
		) as HTMLInputElement
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			window.HTMLInputElement.prototype,
			'value',
		)!.set!
		await act(async () => {
			nativeInputValueSetter.call(tzInput, 'America/New_York')
			tzInput.dispatchEvent(new Event('input', {bubbles: true}))
			await flushMicrotasks()
		})

		// Click the matching <li> button (looked up by data-tz attribute
		// — IANA zone strings contain `/` which complicates CSS attr
		// selectors, so we filter the className-scoped node list).
		const matchButtons = Array.from(
			container.querySelectorAll<HTMLButtonElement>('button.locale-timezone-tz-match'),
		)
		const match = matchButtons.find(
			(b) => b.getAttribute('data-tz') === 'America/New_York',
		)
		expect(match).toBeDefined()
		act(() => {
			match!.click()
		})

		// Click Continue.
		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		await act(async () => {
			continueBtn.click()
			await flushMicrotasks()
			await flushMicrotasks()
		})

		expect(setLocaleTimezoneMutateAsync).toHaveBeenCalledTimes(1)
		expect(setLocaleTimezoneMutateAsync).toHaveBeenCalledWith({
			timezone: 'America/New_York',
			locale: 'tr-TR',
		})
		expect(onContinue).toHaveBeenCalledTimes(1)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 3. operator overrides locale
// ─────────────────────────────────────────────────────────────────────

describe('LocaleTimezoneStep — operator override (locale)', () => {
	it('changing the locale <select> to en-US then Continue mutates with the overridden locale', async () => {
		stubIntl('Europe/Istanbul')
		stubNavigatorLanguage('tr-TR')

		const onContinue = vi.fn()
		const {container} = renderStep({onContinue})

		const localeSelect = container.querySelector(
			'[data-testid="locale-timezone-locale-select"]',
		) as HTMLSelectElement
		const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(
			window.HTMLSelectElement.prototype,
			'value',
		)!.set!
		act(() => {
			nativeSelectValueSetter.call(localeSelect, 'en-US')
			localeSelect.dispatchEvent(new Event('change', {bubbles: true}))
		})
		expect(localeSelect.value).toBe('en-US')

		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		await act(async () => {
			continueBtn.click()
			await flushMicrotasks()
			await flushMicrotasks()
		})

		expect(setLocaleTimezoneMutateAsync).toHaveBeenCalledTimes(1)
		expect(setLocaleTimezoneMutateAsync).toHaveBeenCalledWith({
			timezone: 'Europe/Istanbul',
			locale: 'en-US',
		})
		expect(onContinue).toHaveBeenCalledTimes(1)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 4. Continue calls trpc + onContinue on success
// ─────────────────────────────────────────────────────────────────────

describe('LocaleTimezoneStep — Continue success path', () => {
	it('clicking Continue with auto-detected values calls mutate({tz, locale}) + onContinue once each', async () => {
		stubIntl('Europe/Istanbul')
		stubNavigatorLanguage('tr-TR')

		const onContinue = vi.fn()
		const setData = vi.fn()
		const {container} = renderStep({onContinue, setData})

		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		await act(async () => {
			continueBtn.click()
			await flushMicrotasks()
			await flushMicrotasks()
		})

		expect(setData).toHaveBeenCalledTimes(1)
		const arg = setData.mock.calls[0][0] as OnboardingData & {timezone?: string; locale?: string}
		expect(arg.timezone).toBe('Europe/Istanbul')
		expect(arg.locale).toBe('tr-TR')

		expect(setLocaleTimezoneMutateAsync).toHaveBeenCalledTimes(1)
		expect(setLocaleTimezoneMutateAsync).toHaveBeenCalledWith({
			timezone: 'Europe/Istanbul',
			locale: 'tr-TR',
		})
		expect(onContinue).toHaveBeenCalledTimes(1)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5. Skip bypasses mutate
// ─────────────────────────────────────────────────────────────────────

describe('LocaleTimezoneStep — Skip path', () => {
	it('clicking Skip invokes onSkip once and does NOT call setLocaleTimezone.mutate', () => {
		stubIntl('Europe/Istanbul')
		stubNavigatorLanguage('tr-TR')

		const onSkip = vi.fn()
		const {container} = renderStep({onSkip})

		const skipBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.match(/^Skip$|Skip for now/),
		) as HTMLButtonElement
		expect(skipBtn).toBeDefined()

		act(() => {
			skipBtn.click()
		})

		expect(onSkip).toHaveBeenCalledTimes(1)
		expect(setLocaleTimezoneMutateAsync).not.toHaveBeenCalled()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 6. Mutation failure surfaces inline error
// ─────────────────────────────────────────────────────────────────────

describe('LocaleTimezoneStep — inline error on mutation failure', () => {
	it('mutate rejecting with "permission denied" renders the message in the inline error region', async () => {
		stubIntl('Europe/Istanbul')
		stubNavigatorLanguage('tr-TR')

		setLocaleTimezoneMutateAsync.mockRejectedValueOnce(
			new Error('timedatectl exit 1: permission denied'),
		)

		const onContinue = vi.fn()
		const {container} = renderStep({onContinue})

		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		await act(async () => {
			continueBtn.click()
			await flushMicrotasks()
			await flushMicrotasks()
		})

		const err = container.querySelector('[data-testid="locale-timezone-err"]')
		expect(err).not.toBeNull()
		expect(err!.textContent).toContain('permission denied')

		// onContinue must NOT have been called on failure.
		expect(onContinue).not.toHaveBeenCalled()
	})
})
