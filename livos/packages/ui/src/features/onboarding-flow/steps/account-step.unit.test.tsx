// @vitest-environment jsdom
//
// Phase 368.7 — AccountStep 2FA sub-state regression tests.
//
// These cover the defect that stopped two external testers from ever reaching the
// product. The setup wizard's 2FA sub-state had exactly one exit — `onContinue`,
// fired from use2fa's completion callback — and Phase 328 (IDENT-05) stopped that
// callback from firing whenever the server returns one-time recovery codes, which
// on a DB-backed session is ALWAYS. A correct code therefore enabled 2FA
// server-side and then stranded the user on a screen with no Back, no Skip and no
// Continue. Nothing covered this: there were zero tests under onboarding-flow/.
//
// `@testing-library/react` is NOT installed in this package (D-NO-NEW-DEPS,
// established Phase 25/30/33/38/62/67-04/68-03 precedent), so these are direct
// react-dom/client renders against jsdom.
//
// Coverage:
//   1. The 2FA sub-state offers a Skip control that advances the wizard (ONB-02).
//   2. A successful enrol shows the one-time recovery codes and then reaches
//      onContinue (ONB-01) — this is the test that fails on the old code.
//   3. An "already enabled" rejection is distinguished from a wrong code and
//      surfaces an enabled Continue instead of an identical shake (ONB-03).
//   4. A wrong code keeps the user on the step with an error and no advance.
//
// References: .planning/phases/368.7-onboard2fa/368.7-CONTEXT.md

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ── Shared mock state (hoisted so the vi.mock factories can reach it) ────────
const h = vi.hoisted(() => ({
	state: {
		totpUri: 'otpauth://totp/Livinity?secret=JBSWY3DPEHPK3PXP&period=30&digits=6&algorithm=SHA1&issuer=livinity.local',
		recoveryCodes: undefined as string[] | undefined,
		/** Codes the server hands back on a successful enrol (the DB path always does). */
		codesOnEnrol: [] as string[],
		enableImpl: async (_code: string): Promise<boolean> => true,
	},
	reset() {
		h.state.recoveryCodes = undefined
		h.state.codesOnEnrol = []
		h.state.enableImpl = async () => true
	},
}))

// The real hook's contract, faithfully: `enable` resolves, and `onEnableChange`
// is NOT called when recovery codes come back — only `confirmEnrolled` fires it
// (use-2fa.ts:17-24, :69-72). Reproducing that here is the whole point.
vi.mock('@/hooks/use-2fa', async () => {
	const React = await import('react')
	return {
		use2fa: (onEnableChange?: (enabled: boolean) => void) => {
			const [, force] = React.useState(0)
			return {
				isEnabled: false,
				totpUri: h.state.totpUri,
				generateTotpUri: () => {},
				enable: async (code: string) => {
					const ok = await h.state.enableImpl(code)
					if (h.state.codesOnEnrol.length > 0) {
						h.state.recoveryCodes = h.state.codesOnEnrol
						force((n) => n + 1)
					} else {
						onEnableChange?.(true)
					}
					return ok
				},
				disable: async () => {},
				recoveryCodes: h.state.recoveryCodes,
				confirmEnrolled: () => onEnableChange?.(true),
			}
		},
	}
})

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		useUtils: () => ({user: {clockCheck: {fetch: async () => ({serverTime: 0, skewSeconds: 0})}}}),
		user: {
			login: {
				useMutation: (opts?: {onSuccess?: (jwt: string) => void}) => ({
					mutate: () => opts?.onSuccess?.('test-jwt'),
					isPending: false,
				}),
			},
			register: {
				useMutation: (opts?: {onSuccess?: () => void}) => ({
					mutate: () => opts?.onSuccess?.(),
					isPending: false,
				}),
			},
		},
	},
	wsClient: {close: () => {}},
}))

vi.mock('@/utils/i18n', () => ({t: (key: string) => key, maybeT: (key: string) => key}))

vi.mock('react-qr-code', async () => {
	const React = await import('react')
	return {default: ({value}: {value: string}) => React.createElement('div', {'data-qr': value})}
})

vi.mock('@/components/ui/copyable-field', async () => {
	const React = await import('react')
	return {CopyableField: ({value}: {value: string}) => React.createElement('code', null, value)}
})

// Stand-in for the 6-digit input: the state machine under test is AccountStep's,
// not rci's. Clicking it submits a code exactly as PinInput's auto-submit does.
vi.mock('@/components/ui/pin-input', async () => {
	const React = await import('react')
	return {
		PinInput: ({onCodeCheck}: {onCodeCheck: (code: string) => Promise<boolean>}) =>
			React.createElement(
				'button',
				{type: 'button', 'data-testid': 'submit-code', onClick: () => void onCodeCheck('123456')},
				'submit code',
			),
	}
})

import {DEFAULT_DATA, type OnboardingData} from '../constants'
import {AccountStep} from './account-step'

// ── Harness ──────────────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root
let onContinue: ReturnType<typeof vi.fn>
let onBack: ReturnType<typeof vi.fn>

const VALID: OnboardingData = {...DEFAULT_DATA, name: 'Test User', password: 'correct-horse', confirm: 'correct-horse'}

function buttonByText(text: string): HTMLButtonElement | undefined {
	return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
}

async function click(element: Element) {
	await act(async () => {
		element.dispatchEvent(new MouseEvent('click', {bubbles: true}))
	})
}

/** Render, then walk register → login so we land in the enrolling-2fa sub-state. */
async function renderInEnrolState() {
	await act(async () => {
		root.render(<AccountStep data={VALID} setData={() => {}} onContinue={onContinue} onBack={onBack} />)
	})
	const create = container.querySelector<HTMLButtonElement>('.btn-primary')
	expect(create, 'the register step should offer a primary button').toBeTruthy()
	await click(create!)
	expect(container.querySelector('[data-testid="submit-code"]'), 'should be on the 2FA sub-state').toBeTruthy()
}

beforeEach(() => {
	h.reset()
	vi.useFakeTimers({shouldAdvanceTime: true})
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	onContinue = vi.fn()
	onBack = vi.fn()
})

afterEach(() => {
	act(() => root.unmount())
	container.remove()
	vi.useRealTimers()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AccountStep — 2FA enrolment sub-state', () => {
	it('offers a Skip control that advances the wizard without enrolling (ONB-02)', async () => {
		await renderInEnrolState()

		const skip = buttonByText('onboarding.2fa.skip')
		expect(skip, 'the 2FA step must always have an exit').toBeTruthy()

		await click(skip!)
		expect(onContinue).toHaveBeenCalledTimes(1)
	})

	it('completes the wizard after a successful enrol that returns recovery codes (ONB-01)', async () => {
		// The exact server behaviour that dead-ended setup: enable2fa resolves AND
		// hands back 10 one-time codes, so use2fa withholds onEnableChange.
		h.state.codesOnEnrol = Array.from({length: 10}, (_, i) => `code${i}abcdef0${i}`)

		await renderInEnrolState()
		await click(container.querySelector('[data-testid="submit-code"]')!)

		// The codes must be shown — they are generated, encrypted and otherwise never
		// seen again, and they are the only escape from a lost authenticator.
		for (const code of h.state.codesOnEnrol) {
			expect(container.textContent).toContain(code)
		}

		// Before acknowledgement the wizard has NOT advanced (codes stay on screen).
		expect(onContinue).not.toHaveBeenCalled()

		const done = buttonByText('2fa.recovery.done')
		expect(done, 'the recovery panel must offer an acknowledgement').toBeTruthy()
		await click(done!)

		// …and acknowledging finally advances. On the pre-368.7 code nothing here
		// existed and onContinue was unreachable for the rest of the session.
		expect(onContinue).toHaveBeenCalledTimes(1)
	})

	it('distinguishes an already-enrolled account from a wrong code (ONB-03)', async () => {
		h.state.enableImpl = async () => {
			throw new Error('2FA is already enabled')
		}

		await renderInEnrolState()

		const continueButton = buttonByText('onboarding.2fa.continue')
		expect(continueButton?.disabled, 'Continue starts disabled').toBe(true)

		await click(container.querySelector('[data-testid="submit-code"]')!)

		expect(container.textContent).toContain('onboarding.2fa.already-enabled')
		expect(buttonByText('onboarding.2fa.continue')?.disabled, 'Continue must become available').toBe(false)

		await click(buttonByText('onboarding.2fa.continue')!)
		expect(onContinue).toHaveBeenCalledTimes(1)
	})

	it('keeps the user on the step with an explanation when the code is wrong', async () => {
		h.state.enableImpl = async () => {
			throw new Error('Incorrect 2FA code')
		}

		await renderInEnrolState()
		await click(container.querySelector('[data-testid="submit-code"]')!)

		expect(container.textContent).toContain('onboarding.2fa.rejected')
		expect(container.textContent).not.toContain('onboarding.2fa.already-enabled')
		expect(onContinue).not.toHaveBeenCalled()
		// The exit stays available even when enrolment keeps failing.
		expect(buttonByText('onboarding.2fa.skip')).toBeTruthy()
	})
})
