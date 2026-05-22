// @vitest-environment jsdom
//
// Phase 195 Plan 04 — ConnectAiStep RTL/vitest coverage.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS, established Phase 25/30/33/38/62/67-04/68 precedent —
// see livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx
// for the canonical "RTL absent" testing posture).
//
// Per that precedent, this file ships **direct react-dom/client renders**
// against the jsdom DOM — covering the same behaviours that RTL's
// `render` + `screen.getByText` + `userEvent.click` would (mount, query by
// data-testid / text content, dispatch click events) without requiring a
// new dependency. This is a strict superset of the smoke + source-text
// invariant pattern: real DOM render + real click events + real
// async state-machine transitions covered.
//
// Coverage (≥5 it() blocks, ≥5 assertions, per plan acceptance criteria):
//
//   1. Initial idle render → "Sign in with xAI" button visible; Continue
//      button is disabled.
//   2. Happy path click → window.open spy called once with the start URL,
//      '_blank' target, AND 'noopener,noreferrer' features. Component
//      eventually lands in `connected` state with tier 1 + scope chips
//      [Chat / Tools / Image / Video]; Continue becomes enabled.
//   3. T-195-04-01 MALICIOUS URL — start returns `https://evil.example.com/oauth` →
//      window.open MUST NOT have been called; component lands in error
//      state ("aborted for safety").
//   4. Error state → "Retry" button returns to idle (Sign in button
//      visible again).
//   5. Error state → "Skip for now" link calls onSkip prop.
//   6. (bonus) Pure helper `isXaiOAuthUrl` allow-list — accepts x.ai +
//      auth.x.ai over https:, rejects http: / wrong hosts /
//      x.ai-subdomain-trick / malformed URLs (locks T-195-04-01 contract
//      at the helper level, independent of the React state machine).
//   7. (bonus) Pure helper `mapScopesToDisplay` — maps grok-cli:access →
//      Chat, api:access → Tools+Image+Video, locks the scope-mapping
//      contract for the connected-state UI.
//
// ─────────────────────────────────────────────────────────────────────
// Deferred RTL tests (uncomment when @testing-library/react lands and
// remove the react-dom/client harness above — RTL's `render` and
// `fireEvent` are 1:1 replacements for the helpers below):
// ─────────────────────────────────────────────────────────────────────
//   import {render, fireEvent, screen} from '@testing-library/react'
//   import userEvent from '@testing-library/user-event'
//
//   render(<ConnectAiStep onContinue={vi.fn()} onSkip={vi.fn()} onBack={vi.fn()} />)
//   expect(screen.getByText(/Sign in with xAI/i)).toBeInTheDocument()
//   await userEvent.click(screen.getByTestId('xai-signin-btn'))
//
// References:
//   - .planning/phases/195-xai-oauth-onboarding/195-04-PLAN.md (Task 2)
//   - livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx — RTL-absent precedent
//   - 195-CONTEXT.md "Verified facts" block (xAI OAuth URL shape `https://x.ai/oauth/device?code=…`)

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Silence React 18's "current testing environment is not configured to
// support act(...)" warning under jsdom — we ARE in a test env, vitest
// just doesn't set this global automatically.
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ─────────────────────────────────────────────────────────────────────
// Mock the tRPC react client BEFORE the component import.
// Each mutation hook returns a stable object with mutateAsync that
// individual tests can override via the `__startMock` / `__waitMock` /
// `__statusMock` hatch — same pattern hooks/use-app-install.tsx tests
// would use, simplified for this single-component file.
// ─────────────────────────────────────────────────────────────────────

const startMock = vi.fn()
const waitMock = vi.fn()
const statusMock = vi.fn()

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		auth: {
			xai: {
				start: {
					useMutation: () => ({mutateAsync: startMock}),
				},
				waitForCompletion: {
					useMutation: () => ({mutateAsync: waitMock}),
				},
			},
		},
		useUtils: () => ({
			auth: {
				xai: {
					status: {fetch: statusMock},
				},
			},
		}),
	},
}))

// Component import — must come AFTER vi.mock to ensure the mock is hoisted.
import {ConnectAiStep, isXaiOAuthUrl, mapScopesToDisplay} from './connect-ai-step'

// ─────────────────────────────────────────────────────────────────────
// Test harness — minimal react-dom/client mount that mimics RTL's
// render/cleanup lifecycle.
// ─────────────────────────────────────────────────────────────────────

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)

	startMock.mockReset()
	waitMock.mockReset()
	statusMock.mockReset()
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

type RenderProps = Partial<Parameters<typeof ConnectAiStep>[0]>

function renderStep(overrides: RenderProps = {}) {
	const onContinue = overrides.onContinue ?? vi.fn()
	const onSkip = overrides.onSkip ?? vi.fn()
	const onBack = overrides.onBack ?? vi.fn()
	act(() => {
		root!.render(<ConnectAiStep onContinue={onContinue} onSkip={onSkip} onBack={onBack} />)
	})
	return {container: container!, onContinue, onSkip, onBack}
}

function flushMicrotasks() {
	// Three queued microtasks: start.mutate resolve, wait.mutate resolve,
	// status.fetch resolve. We yield to the event loop multiple times to
	// let every chained `await` in the component's handleSignIn settle.
	return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

// ─────────────────────────────────────────────────────────────────────
// 1. Initial idle render
// ─────────────────────────────────────────────────────────────────────

describe('ConnectAiStep — initial idle render', () => {
	it('renders "Sign in with xAI" button and disables Continue', () => {
		const {container} = renderStep()
		// Sign in button visible
		const signinBtn = container.querySelector('[data-testid="xai-signin-btn"]') as HTMLButtonElement
		expect(signinBtn).not.toBeNull()
		expect(signinBtn.textContent).toContain('Sign in with xAI')
		// Continue button disabled (FooterBar primary)
		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		expect(continueBtn).toBeDefined()
		expect(continueBtn.disabled).toBe(true)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. Happy path → connected state with tier + scopes + window.open features
// ─────────────────────────────────────────────────────────────────────

describe('ConnectAiStep — happy path', () => {
	it('opens xAI URL with noopener,noreferrer and renders Connected panel with tier + scope chips', async () => {
		startMock.mockResolvedValue({
			flowId: 'abc-12345678',
			url: 'https://x.ai/oauth/device?code=Z',
			startedAt: Date.now(),
		})
		waitMock.mockResolvedValue({success: true, completedAt: Date.now()})
		statusMock.mockResolvedValue({
			connected: true,
			tier: 1,
			scopes: ['openid', 'profile', 'email', 'offline_access', 'grok-cli:access', 'api:access'],
		})

		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

		const {container} = renderStep()
		const signinBtn = container.querySelector('[data-testid="xai-signin-btn"]') as HTMLButtonElement
		await act(async () => {
			signinBtn.click()
			await flushMicrotasks()
			await flushMicrotasks()
			await flushMicrotasks()
		})

		// window.open called exactly once with the xAI URL and noopener,noreferrer features.
		expect(openSpy).toHaveBeenCalledTimes(1)
		expect(openSpy).toHaveBeenCalledWith(
			'https://x.ai/oauth/device?code=Z',
			'_blank',
			'noopener,noreferrer',
		)

		// Component is in connected state.
		const connectedPanel = container.querySelector('[data-testid="xai-connected"]')
		expect(connectedPanel).not.toBeNull()
		expect(connectedPanel!.textContent).toContain('SuperGrok Tier 1')

		// All four expected scope chips rendered.
		expect(connectedPanel!.textContent).toContain('Chat')
		expect(connectedPanel!.textContent).toContain('Tools')
		expect(connectedPanel!.textContent).toContain('Image')
		expect(connectedPanel!.textContent).toContain('Video')

		// Continue button now enabled.
		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		expect(continueBtn.disabled).toBe(false)

		openSpy.mockRestore()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 3. T-195-04-01 — Tampering / MITM malicious URL
// ─────────────────────────────────────────────────────────────────────

describe('ConnectAiStep — T-195-04-01 malicious URL rejection', () => {
	it('does NOT open window when backend returns an attacker URL like https://evil.example.com/oauth', async () => {
		startMock.mockResolvedValue({
			flowId: 'abc-12345678',
			url: 'https://evil.example.com/oauth',
			startedAt: Date.now(),
		})
		// waitMock + statusMock should NEVER be reached — we land in error first.

		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

		const {container} = renderStep()
		const signinBtn = container.querySelector('[data-testid="xai-signin-btn"]') as HTMLButtonElement
		await act(async () => {
			signinBtn.click()
			await flushMicrotasks()
		})

		// window.open MUST NOT have been called.
		expect(openSpy).not.toHaveBeenCalled()

		// Component lands in error state with the safety message.
		const errorPanel = container.querySelector('[data-testid="xai-error"]')
		expect(errorPanel).not.toBeNull()
		expect(errorPanel!.textContent?.toLowerCase()).toMatch(/aborted for safety|unexpected sign-in url/)

		// waitForCompletion was never reached.
		expect(waitMock).not.toHaveBeenCalled()

		openSpy.mockRestore()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 4. Error → Retry returns to idle
// ─────────────────────────────────────────────────────────────────────

describe('ConnectAiStep — retry path', () => {
	it('clicking Retry from error state returns the user to the idle "Sign in with xAI" view', async () => {
		// Trigger error via start.mutateAsync rejection.
		startMock.mockRejectedValue(new Error('OpenCode CLI not installed'))

		const {container} = renderStep()
		const signinBtn = container.querySelector('[data-testid="xai-signin-btn"]') as HTMLButtonElement
		await act(async () => {
			signinBtn.click()
			await flushMicrotasks()
		})

		const errorPanel = container.querySelector('[data-testid="xai-error"]')
		expect(errorPanel).not.toBeNull()

		const retryBtn = container.querySelector('[data-testid="xai-retry-btn"]') as HTMLButtonElement
		expect(retryBtn).not.toBeNull()

		await act(async () => {
			retryBtn.click()
		})

		// Back to idle — sign-in button visible again.
		const signinBtn2 = container.querySelector('[data-testid="xai-signin-btn"]') as HTMLButtonElement
		expect(signinBtn2).not.toBeNull()
		expect(container.querySelector('[data-testid="xai-error"]')).toBeNull()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5. Error → Skip for now → onSkip prop called
// ─────────────────────────────────────────────────────────────────────

describe('ConnectAiStep — skip path', () => {
	it('clicking "Skip for now" in error state invokes the onSkip prop', async () => {
		startMock.mockRejectedValue(new Error('OpenCode CLI not installed'))

		const {container, onSkip} = renderStep()
		const signinBtn = container.querySelector('[data-testid="xai-signin-btn"]') as HTMLButtonElement
		await act(async () => {
			signinBtn.click()
			await flushMicrotasks()
		})

		const skipLink = container.querySelector('[data-testid="xai-skip-link"]') as HTMLButtonElement
		expect(skipLink).not.toBeNull()

		await act(async () => {
			skipLink.click()
		})

		expect(onSkip).toHaveBeenCalledTimes(1)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 6. Pure helper isXaiOAuthUrl — T-195-04-01 allow-list contract
// ─────────────────────────────────────────────────────────────────────

describe('isXaiOAuthUrl — T-195-04-01 allow-list', () => {
	it('accepts only https://x.ai/ + https://auth.x.ai/ and rejects every attacker-flavoured URL variant', () => {
		// Allowed.
		expect(isXaiOAuthUrl('https://x.ai/oauth/device?code=Z')).toBe(true)
		expect(isXaiOAuthUrl('https://auth.x.ai/oauth2/token')).toBe(true)
		// Rejected — wrong protocol.
		expect(isXaiOAuthUrl('http://x.ai/oauth')).toBe(false)
		// Rejected — attacker-controlled host.
		expect(isXaiOAuthUrl('https://evil.example.com/oauth')).toBe(false)
		// Rejected — subdomain trick (x.ai.evil.example.com NOT === x.ai).
		expect(isXaiOAuthUrl('https://x.ai.evil.example.com/oauth')).toBe(false)
		// Rejected — userinfo trick (https:x.ai@evil.example.com).
		expect(isXaiOAuthUrl('https://x.ai@evil.example.com/oauth')).toBe(false)
		// Rejected — malformed URL.
		expect(isXaiOAuthUrl('not-a-url')).toBe(false)
		expect(isXaiOAuthUrl('')).toBe(false)
	})
})

// ─────────────────────────────────────────────────────────────────────
// 7. Pure helper mapScopesToDisplay — scope → label contract
// ─────────────────────────────────────────────────────────────────────

describe('mapScopesToDisplay — scope → display label contract', () => {
	it('maps grok-cli:access -> Chat, api:access -> Tools+Image+Video, never lists speech/transcription chips', () => {
		expect(mapScopesToDisplay(['grok-cli:access'])).toEqual(['Chat'])
		expect(mapScopesToDisplay(['api:access'])).toEqual(['Tools', 'Image', 'Video'])
		expect(mapScopesToDisplay(['grok-cli:access', 'api:access'])).toEqual([
			'Chat',
			'Tools',
			'Image',
			'Video',
		])
		// Unknown scopes (e.g. hypothetical future ones) are silently ignored.
		expect(mapScopesToDisplay(['openid', 'profile', 'email', 'offline_access'])).toEqual([])
	})
})
