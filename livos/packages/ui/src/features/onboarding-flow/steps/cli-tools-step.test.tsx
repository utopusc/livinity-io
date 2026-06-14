// @vitest-environment jsdom
//
// Phase 239 Plan 02 — CliToolsStep vitest coverage.
//
// RTL absent — same `react-dom/client + act + vi.mock` harness used by
// locale-timezone-step.test.tsx / region-step.test.tsx (D-NO-NEW-DEPS).
//
// Coverage:
//   1. Renders exactly 5 cards in document order (drift-lock vs Plan 239-01 SUPPORTED_CLIS)
//   2. Each card initial state = "Install" button when detect resolves {detected:false}
//   3. Card with detect {detected:true, version} shows "Installed" pill + hides Install button
//   4. Clicking Install opens the no-terminal CliAuthDialog (Phase 267-02) with the
//      exact CLI name + shows the optimistic Installing state (NO inline install)
//   5. Clicking Install records the pick in data.cliInstalled via setData
//   6. A detected CLI shows Installed and never opens the dialog
//   7. Continue button ENABLED on initial render with no installs (D-239-14)
//   8. Continue click invokes onContinue prop
//   9. Drift-lock: SUPPORTED_CLI_DISPLAY has exactly 5 entries in fixed order
//
// Phase 267-02 changed the install action: the onboarding step opens the
// no-terminal CliAuthDialog (install + device/apikey/browser auth in one flow)
// instead of installing inline. The old inline mutation/failure/retry tests
// were replaced to reflect that contract.
//
// References:
//   - .planning/phases/239-onboarding-cli-tools/239-02-PLAN.md (Task 2)
//   - .planning/phases/267-ui-cli-install-auth-no-terminal/267-02-PLAN.md (Task 3)

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {DEFAULT_DATA, type OnboardingData} from '../constants'

// ─────────────────────────────────────────────────────────────────────
// trpcReact mock — fan out per-CLI detect queries + a single install mutation.
// Each test mutates `detectMap` BEFORE renderStep() to seed initial detect data.
// ─────────────────────────────────────────────────────────────────────

type DetectResult = {detected: boolean; version?: string; path?: string}

const detectMap: Record<string, DetectResult> = {}
const installMock = vi.fn()

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		cliInstaller: {
			install: {
				useMutation: () => ({mutateAsync: installMock}),
			},
			detect: {
				useQuery: (input: {name: string}) => ({
					data: detectMap[input.name],
					isSuccess: detectMap[input.name] !== undefined,
				}),
			},
		},
	},
}))

// Phase 267-02 — the Install button now opens the no-terminal CliAuthDialog
// (install + auth in one flow) instead of installing inline. Mock the dialog
// opener so we can assert the click dispatches it with the right CLI name and
// don't pull the whole dialog component tree into this jsdom harness.
const openCliAuthDialogMock = vi.fn()

vi.mock('@/features/liv-ai/cli-auth-dialog', () => ({
	openCliAuthDialog: (detail: {cli: string; mode?: string}) =>
		openCliAuthDialogMock(detail),
}))

// Component import AFTER vi.mock to ensure hoisting.
import {CliToolsStep, SUPPORTED_CLI_DISPLAY} from './cli-tools-step'

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	installMock.mockReset()
	openCliAuthDialogMock.mockReset()
	for (const k of Object.keys(detectMap)) delete detectMap[k]
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
			<CliToolsStep
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

function flushMicrotasks() {
	return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

// ─────────────────────────────────────────────────────────────────────
// 1. Drift-lock: 5 cards, fixed order
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — drift-lock', () => {
	it('SUPPORTED_CLI_DISPLAY has exactly 5 entries in the fixed Phase 240 order', () => {
		expect(SUPPORTED_CLI_DISPLAY.length).toBe(5)
		expect(SUPPORTED_CLI_DISPLAY.map((c) => c.id)).toEqual([
			'claude-code',
			'opencode',
			'gemini',
			'openclaw',
			'aion-cli',
		])
	})

	it('renders exactly 5 cards in document order: Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI', () => {
		const {container} = renderStep()
		const cards = container.querySelectorAll('[data-testid^="cli-card-"]')
		expect(cards.length).toBe(5)
		const orderedIds = Array.from(cards).map((c) => c.getAttribute('data-testid'))
		expect(orderedIds).toEqual([
			'cli-card-claude-code',
			'cli-card-opencode',
			'cli-card-gemini',
			'cli-card-openclaw',
			'cli-card-aion-cli',
		])
		// Display names present in document.
		const text = container.textContent || ''
		expect(text).toContain('Claude Code')
		expect(text).toContain('OpenCode')
		expect(text).toContain('Gemini')
		expect(text).toContain('OpenClaw')
		expect(text).toContain('Aion CLI')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 2. Initial state — Install button visible when not detected
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — initial state', () => {
	it('each card shows Install button when detect returns {detected:false}', () => {
		detectMap['claude-code'] = {detected: false}
		detectMap['opencode'] = {detected: false}
		detectMap['gemini'] = {detected: false}
		detectMap['openclaw'] = {detected: false}
		detectMap['aion-cli'] = {detected: false}
		const {container} = renderStep()
		const installButtons = container.querySelectorAll('[data-testid^="cli-install-"]')
		expect(installButtons.length).toBe(5)
		installButtons.forEach((b) => {
			expect(b.textContent).toContain('Install')
		})
	})
})

// ─────────────────────────────────────────────────────────────────────
// 3. Card with detected:true → Installed pill, no Install button
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — already-installed card', () => {
	it('card with detect {detected:true, version} shows Installed pill + hides Install button', async () => {
		detectMap['claude-code'] = {detected: true, version: '2.1.89', path: '/usr/local/bin/claude'}
		const {container} = renderStep()
		// Allow the useEffect that syncs detect -> installed state to fire.
		await act(async () => {
			await flushMicrotasks()
		})
		const installBtn = container.querySelector('[data-testid="cli-install-claude-code"]')
		expect(installBtn).toBeNull()
		const installedPill = container.querySelector('[data-testid="cli-installed-claude-code"]')
		expect(installedPill).not.toBeNull()
		expect(installedPill!.textContent).toContain('Installed')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 4. Click Install → opens the no-terminal CliAuthDialog + optimistic Installing
//    (Phase 267-02: onboarding no longer installs inline — the dialog drives
//    install + auth with no Terminal.)
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — install opens the dialog', () => {
	it('clicking Install opens CliAuthDialog with that CLI name and shows the Installing state', async () => {
		detectMap['gemini'] = {detected: false}
		const {container} = renderStep()
		const btn = container.querySelector('[data-testid="cli-install-gemini"]') as HTMLButtonElement
		expect(btn).not.toBeNull()
		await act(async () => {
			btn.click()
			await flushMicrotasks()
		})
		// Opens the no-terminal dialog with the exact CLI name (NAME-only) and
		// NEVER installs inline (no install mutation fired).
		expect(openCliAuthDialogMock).toHaveBeenCalledTimes(1)
		expect(openCliAuthDialogMock).toHaveBeenCalledWith({cli: 'gemini', mode: 'install'})
		expect(installMock).not.toHaveBeenCalled()
		// Card optimistically shows Installing while the dialog is open.
		const installing = container.querySelector('[data-testid="cli-installing-gemini"]')
		expect(installing).not.toBeNull()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5. Click Install → records the pick in data.cliInstalled (Continue intent)
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — install records the pick', () => {
	it('clicking Install appends the CLI to data.cliInstalled via setData', async () => {
		detectMap['openclaw'] = {detected: false}
		const setData = vi.fn()
		const {container} = renderStep({setData})
		const btn = container.querySelector('[data-testid="cli-install-openclaw"]') as HTMLButtonElement
		await act(async () => {
			btn.click()
			await flushMicrotasks()
		})
		expect(openCliAuthDialogMock).toHaveBeenCalledWith({cli: 'openclaw', mode: 'install'})
		expect(setData).toHaveBeenCalled()
		const lastCall = setData.mock.calls[setData.mock.calls.length - 1][0] as OnboardingData
		expect(lastCall.cliInstalled).toContain('openclaw')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 6. Already-detected CLI shows Installed and never offers an Install button
//    (detect-sync drives the installed state; the dialog is for not-installed).
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — detected CLI stays installed', () => {
	it('a detected CLI shows the Installed pill and no Install button (no dialog)', async () => {
		detectMap['claude-code'] = {detected: true, version: '1.2.3'}
		const {container} = renderStep()
		await act(async () => {
			await flushMicrotasks()
		})
		const installBtn = container.querySelector('[data-testid="cli-install-claude-code"]')
		expect(installBtn).toBeNull()
		const installed = container.querySelector('[data-testid="cli-installed-claude-code"]')
		expect(installed).not.toBeNull()
		expect(openCliAuthDialogMock).not.toHaveBeenCalled()
	})
})

// ─────────────────────────────────────────────────────────────────────
// 8. Continue enabled on initial render (D-239-14)
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — Continue always enabled', () => {
	it('Continue button is ENABLED on initial render with no installs (D-239-14)', () => {
		const {container} = renderStep()
		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		expect(continueBtn).toBeDefined()
		expect(continueBtn.disabled).toBe(false)
	})

	it('Continue click invokes onContinue prop', () => {
		const onContinue = vi.fn()
		const {container} = renderStep({onContinue})
		const continueBtn = Array.from(container.querySelectorAll('button')).find((b) =>
			b.textContent?.includes('Continue'),
		) as HTMLButtonElement
		act(() => {
			continueBtn.click()
		})
		expect(onContinue).toHaveBeenCalledTimes(1)
	})
})
