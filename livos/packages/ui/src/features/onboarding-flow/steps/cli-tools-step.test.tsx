// @vitest-environment jsdom
//
// Phase 239 Plan 02 — CliToolsStep vitest coverage.
//
// RTL absent — same `react-dom/client + act + vi.mock` harness used by
// locale-timezone-step.test.tsx / region-step.test.tsx (D-NO-NEW-DEPS).
//
// Coverage (>=9 it() blocks per acceptance criteria):
//   1. Renders exactly 5 cards in document order (drift-lock vs Plan 239-01 SUPPORTED_CLIS)
//   2. Each card initial state = "Install" button when detect resolves {detected:false}
//   3. Card with detect {detected:true, version} shows "Installed" pill + hides Install button
//   4. Clicking Install dispatches cliInstaller.install.mutateAsync with that exact name + transitions to Installing state
//   5. Successful install transitions to "Installed" + appends to data.cliInstalled via setData
//   6. Failed install (ok:false) transitions to "Failed" with Retry button + tooltip-accessible error
//   7. Retry transitions back to not-installed (Install button visible again)
//   8. Continue button ENABLED on initial render with no installs (D-239-14)
//   9. Continue click invokes onContinue prop
//  10. Drift-lock: SUPPORTED_CLI_DISPLAY has exactly 5 entries in fixed order
//
// References:
//   - .planning/phases/239-onboarding-cli-tools/239-02-PLAN.md (Task 2)
//   - .planning/phases/239-onboarding-cli-tools/239-01-SUMMARY.md (cliInstaller contract)

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

// Component import AFTER vi.mock to ensure hoisting.
import {CliToolsStep, SUPPORTED_CLI_DISPLAY} from './cli-tools-step'

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	installMock.mockReset()
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
// 4. Click Install → mutateAsync called + Installing spinner state
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — install dispatch', () => {
	it('clicking Install dispatches cliInstaller.install.mutateAsync({name}) and transitions to Installing state', async () => {
		detectMap['gemini'] = {detected: false}
		// Never-resolving promise so we can observe the Installing state.
		let resolveInstall: ((v: {ok: boolean; output: string; exitCode: number; durationMs: number}) => void) | null = null
		installMock.mockImplementation(
			() =>
				new Promise((res) => {
					resolveInstall = res
				}),
		)
		const {container} = renderStep()
		const btn = container.querySelector('[data-testid="cli-install-gemini"]') as HTMLButtonElement
		expect(btn).not.toBeNull()
		await act(async () => {
			btn.click()
			await flushMicrotasks()
		})
		expect(installMock).toHaveBeenCalledTimes(1)
		expect(installMock).toHaveBeenCalledWith({name: 'gemini'})
		const installing = container.querySelector('[data-testid="cli-installing-gemini"]')
		expect(installing).not.toBeNull()
		// Cleanup — resolve the dangling promise to avoid unhandled rejection.
		const r = resolveInstall as
			| ((v: {ok: boolean; output: string; exitCode: number; durationMs: number}) => void)
			| null
		if (r !== null) r({ok: true, output: '', exitCode: 0, durationMs: 1})
	})
})

// ─────────────────────────────────────────────────────────────────────
// 5. Successful install → Installed + setData appends cliInstalled
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — install success', () => {
	it('on ok:true mutation result transitions to Installed and calls setData with cliInstalled appended', async () => {
		detectMap['openclaw'] = {detected: false}
		installMock.mockResolvedValue({ok: true, output: 'installed ok', exitCode: 0, durationMs: 1234})
		const setData = vi.fn()
		const {container} = renderStep({setData})
		const btn = container.querySelector('[data-testid="cli-install-openclaw"]') as HTMLButtonElement
		await act(async () => {
			btn.click()
			await flushMicrotasks()
			await flushMicrotasks()
		})
		// Installed pill rendered.
		const installed = container.querySelector('[data-testid="cli-installed-openclaw"]')
		expect(installed).not.toBeNull()
		// setData called with cliInstalled containing 'openclaw'.
		expect(setData).toHaveBeenCalled()
		const lastCall = setData.mock.calls[setData.mock.calls.length - 1][0] as OnboardingData
		expect(lastCall.cliInstalled).toContain('openclaw')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 6. Failed install → Failed state with Retry button + tooltip
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — install failure', () => {
	it('on ok:false mutation result transitions to Failed with Retry button and tooltip-accessible error text', async () => {
		detectMap['aion-cli'] = {detected: false}
		installMock.mockResolvedValue({
			ok: false,
			output: 'line1\nline2\nfatal: install refused\n',
			exitCode: 1,
			durationMs: 200,
		})
		const {container} = renderStep()
		const btn = container.querySelector('[data-testid="cli-install-aion-cli"]') as HTMLButtonElement
		await act(async () => {
			btn.click()
			await flushMicrotasks()
			await flushMicrotasks()
		})
		const failedPanel = container.querySelector('[data-testid="cli-failed-aion-cli"]')
		expect(failedPanel).not.toBeNull()
		// Retry button visible.
		const retryBtn = container.querySelector(
			'[data-testid="cli-retry-aion-cli"]',
		) as HTMLButtonElement
		expect(retryBtn).not.toBeNull()
		// Tooltip-accessible error text via title attribute.
		const failedLabel = failedPanel!.querySelector('[title]')
		expect(failedLabel).not.toBeNull()
		expect(failedLabel!.getAttribute('title')).toContain('fatal: install refused')
	})
})

// ─────────────────────────────────────────────────────────────────────
// 7. Retry returns to not-installed
// ─────────────────────────────────────────────────────────────────────

describe('CliToolsStep — retry', () => {
	it('Retry button transitions card back to not-installed (Install button visible)', async () => {
		detectMap['aion-cli'] = {detected: false}
		installMock.mockResolvedValue({ok: false, output: 'boom', exitCode: 1, durationMs: 1})
		const {container} = renderStep()
		const btn = container.querySelector('[data-testid="cli-install-aion-cli"]') as HTMLButtonElement
		await act(async () => {
			btn.click()
			await flushMicrotasks()
			await flushMicrotasks()
		})
		const retryBtn = container.querySelector(
			'[data-testid="cli-retry-aion-cli"]',
		) as HTMLButtonElement
		await act(async () => {
			retryBtn.click()
			await flushMicrotasks()
		})
		const reinstallBtn = container.querySelector('[data-testid="cli-install-aion-cli"]')
		expect(reinstallBtn).not.toBeNull()
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
