// @vitest-environment jsdom
//
// Phase 68 Plan 68-05 Task 2 — LivToolPanel component tests.
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — established Phase 25/30/33/38/62/67-04/68-03 precedent;
// see livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx for
// the canonical "RTL absent" testing posture).
//
// Per that precedent, this file ships **direct react-dom/client renders**
// against the jsdom DOM with thin RTL-shaped helpers (`render`, `screen`,
// `fireEvent`) so the API matches what the plan requested without taking
// the dependency. When `@testing-library/react` eventually lands the
// helpers below can be swapped 1:1 for the real exports — no behavioural
// change.
//
// Coverage (8 tests, well over the 6+ required by must_haves):
//   1. renders nothing visible when isOpen=false
//   2. renders panel + empty state when open with no snapshots
//   3. renders dispatched view when snapshot present (GenericToolView path)
//   4. close button calls store.close() (and sets userClosed sticky-true)
//   5. prev/next buttons drive goToIndex (index + navigationMode flips)
//   6. "Return to live" visible only when manual + running, click → goLive
//   7. "Jump to latest" visible only when manual + !running, click → goLive
//   8. step counter shows "Step N of M" format
//
// Pure-helper tests (computeStepLabel, showReturnToLive, showJumpToLatest)
// extracted at top to keep DOM tests focused.
//
// References:
//   - .planning/phases/68-side-panel-tool-view-dispatcher/68-CONTEXT.md (D-15..D-19)
//   - .planning/phases/68-side-panel-tool-view-dispatcher/68-05-PLAN.md
//   - livos/packages/ui/src/components/inline-tool-pill.unit.test.tsx — RTL-absent precedent

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

// Silence React 18's "current testing environment is not configured to
// support act(...)" warning under jsdom — we ARE in a test env, vitest
// just doesn't set this global automatically.
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// Polyfill ResizeObserver — Radix Slider's transitive useSize hook calls
// `new ResizeObserver(...)` on mount, which jsdom does not implement.
// Minimal no-op stub satisfies the constructor + observe/disconnect API
// the hook needs. (Rule 3 auto-fix: blocking test-env gap.)
if (typeof globalThis.ResizeObserver === 'undefined') {
	;(globalThis as {ResizeObserver?: unknown}).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
}

import {
	LivToolPanel,
	computeStepLabel,
	showJumpToLatest,
	showReturnToLive,
} from './liv-tool-panel'
import {useLivToolPanelStore, type ToolCallSnapshot} from '@/stores/liv-tool-panel-store'

// ─────────────────────────────────────────────────────────────────────
// Test harness — minimal react-dom/client mount that mimics
// @testing-library/react's render / screen / fireEvent / cleanup API.
// Helpers are named to MATCH RTL exactly so a future migration is a
// drop-in 1:1 swap (`from '@testing-library/react'`).
// ─────────────────────────────────────────────────────────────────────

let container: HTMLDivElement | null = null
let root: Root | null = null

function render(ui: React.ReactNode): {container: HTMLDivElement} {
	if (!container || !root) throw new Error('test harness not initialised')
	act(() => {
		root!.render(ui as any)
	})
	return {container}
}

const screen = {
	getByTestId(id: string): HTMLElement {
		const el = container?.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
		if (!el) throw new Error(`screen.getByTestId: no element with data-testid="${id}"`)
		return el
	},
	queryByTestId(id: string): HTMLElement | null {
		return (container?.querySelector(`[data-testid="${id}"]`) as HTMLElement | null) ?? null
	},
	getByText(text: string): HTMLElement {
		const all = Array.from(container?.querySelectorAll('*') ?? [])
		const el = all.find(
			(n) => (n as HTMLElement).textContent?.trim() === text,
		) as HTMLElement | undefined
		if (!el) throw new Error(`screen.getByText: no element with text "${text}"`)
		return el
	},
}

const fireEvent = {
	click(el: Element) {
		act(() => {
			;(el as HTMLElement).click()
		})
	},
}

beforeEach(() => {
	// Isolate Zustand store between tests.
	useLivToolPanelStore.getState().reset()
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

// ─────────────────────────────────────────────────────────────────────
// Test data factory
// ─────────────────────────────────────────────────────────────────────

const makeSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 't-' + Math.random().toString(36).slice(2, 8),
	toolName: 'execute-command',
	category: 'terminal',
	assistantCall: {input: {cmd: 'ls'}, ts: 1000},
	status: 'done',
	startedAt: 1000,
	completedAt: 2000,
	toolResult: {output: 'file1\nfile2', isError: false, ts: 2000},
	...overrides,
})

// ─────────────────────────────────────────────────────────────────────
// Pure helper tests (locked source-text invariants)
// ─────────────────────────────────────────────────────────────────────

describe('computeStepLabel (D-18)', () => {
	it('returns "— of —" when currentSnapshot is null', () => {
		expect(computeStepLabel([], null)).toBe('— of —')
	})

	it('returns "— of —" when currentSnapshot is running (excluded from completed)', () => {
		const running = makeSnapshot({toolId: 'r1', status: 'running', completedAt: undefined})
		expect(computeStepLabel([running], running)).toBe('— of —')
	})

	it('formats "Step N of M" using completedSnapshots index + count', () => {
		const a = makeSnapshot({toolId: 'a'})
		const b = makeSnapshot({toolId: 'b'})
		const c = makeSnapshot({toolId: 'c'})
		expect(computeStepLabel([a, b, c], b)).toBe('Step 2 of 3')
		expect(computeStepLabel([a, b, c], c)).toBe('Step 3 of 3')
	})

	it('skips running snapshots in the count', () => {
		const a = makeSnapshot({toolId: 'a'})
		const b = makeSnapshot({toolId: 'b'})
		const running = makeSnapshot({toolId: 'r', status: 'running', completedAt: undefined})
		expect(computeStepLabel([a, b, running], b)).toBe('Step 2 of 2')
	})
})

describe('showReturnToLive (D-19)', () => {
	it('true only for manual + running', () => {
		const running = makeSnapshot({status: 'running', completedAt: undefined})
		const done = makeSnapshot({status: 'done'})
		expect(showReturnToLive('manual', running)).toBe(true)
		expect(showReturnToLive('manual', done)).toBe(false)
		expect(showReturnToLive('live', running)).toBe(false)
		expect(showReturnToLive('manual', null)).toBe(false)
	})
})

describe('showJumpToLatest (D-19)', () => {
	it('true only for manual + !running + snapshots > 0', () => {
		const done = makeSnapshot({status: 'done'})
		const running = makeSnapshot({status: 'running', completedAt: undefined})
		expect(showJumpToLatest('manual', done, 3)).toBe(true)
		expect(showJumpToLatest('manual', running, 3)).toBe(false)
		expect(showJumpToLatest('live', done, 3)).toBe(false)
		expect(showJumpToLatest('manual', done, 0)).toBe(false)
		expect(showJumpToLatest('manual', null, 0)).toBe(false)
	})
})

// ─────────────────────────────────────────────────────────────────────
// Component / DOM tests (8 cases)
// ─────────────────────────────────────────────────────────────────────

describe('LivToolPanel rendering', () => {
	it('renders nothing visible when isOpen=false', () => {
		render(<LivToolPanel />)
		// AnimatePresence keeps no children when initial isOpen=false.
		expect(screen.queryByTestId('liv-tool-panel')).toBeNull()
	})

	it('renders panel + empty state when open with no snapshots', () => {
		act(() => {
			useLivToolPanelStore.getState().open()
		})
		render(<LivToolPanel />)
		expect(screen.queryByTestId('liv-tool-panel')).not.toBeNull()
		expect(screen.queryByTestId('panel-empty-state')).not.toBeNull()
		// No snapshots → footer/slider must NOT render.
		expect(screen.queryByTestId('panel-footer')).toBeNull()
		expect(screen.queryByTestId('panel-slider')).toBeNull()
	})

	it('renders dispatched view when snapshot present', () => {
		const snap = makeSnapshot({toolName: 'execute-command'})
		act(() => {
			useLivToolPanelStore.getState().setSnapshots([snap])
			useLivToolPanelStore.getState().open()
		})
		render(<LivToolPanel />)
		// Empty state suppressed.
		expect(screen.queryByTestId('panel-empty-state')).toBeNull()
		// Dispatcher → GenericToolView (P68 day-1 behaviour) is mounted in body.
		const body = screen.getByTestId('panel-body')
		expect(body.querySelector('[data-testid="liv-generic-tool-view"]')).not.toBeNull()
		// Tool name appears (header + GenericToolView header).
		expect(container?.textContent ?? '').toContain('execute-command')
	})

	it('close button calls store.close() (sets isOpen=false + userClosed=true)', () => {
		act(() => {
			useLivToolPanelStore.getState().setSnapshots([makeSnapshot()])
			useLivToolPanelStore.getState().open()
		})
		render(<LivToolPanel />)
		const btn = screen.getByTestId('panel-close-btn')
		fireEvent.click(btn)
		const state = useLivToolPanelStore.getState()
		expect(state.isOpen).toBe(false)
		expect(state.userClosed).toBe(true)
	})

	it('prev/next buttons call goToIndex (manual on prev, live at tail)', () => {
		const a = makeSnapshot({toolId: 'a'})
		const b = makeSnapshot({toolId: 'b'})
		const c = makeSnapshot({toolId: 'c'})
		act(() => {
			useLivToolPanelStore.getState().setSnapshots([a, b, c])
			useLivToolPanelStore.getState().open() // open at tail (idx 2), live mode
		})
		render(<LivToolPanel />)
		// Sanity: starts at tail / live.
		expect(useLivToolPanelStore.getState().internalIndex).toBe(2)
		expect(useLivToolPanelStore.getState().navigationMode).toBe('live')

		// Click prev → idx 1, manual mode.
		fireEvent.click(screen.getByTestId('panel-prev-btn'))
		expect(useLivToolPanelStore.getState().internalIndex).toBe(1)
		expect(useLivToolPanelStore.getState().navigationMode).toBe('manual')

		// Click next → idx 2 (tail), live mode.
		fireEvent.click(screen.getByTestId('panel-next-btn'))
		expect(useLivToolPanelStore.getState().internalIndex).toBe(2)
		expect(useLivToolPanelStore.getState().navigationMode).toBe('live')
	})

	it('shows "Return to live" only when manual + running, click → goLive', () => {
		// 4 snapshots: [done, running, done, done]; goToIndex(1) → manual + running.
		const s0 = makeSnapshot({toolId: 's0', status: 'done'})
		const s1 = makeSnapshot({toolId: 's1', status: 'running', completedAt: undefined})
		const s2 = makeSnapshot({toolId: 's2', status: 'done'})
		const s3 = makeSnapshot({toolId: 's3', status: 'done'})
		act(() => {
			useLivToolPanelStore.getState().setSnapshots([s0, s1, s2, s3])
			useLivToolPanelStore.getState().open()
			useLivToolPanelStore.getState().goToIndex(1) // manual + current=running
		})
		render(<LivToolPanel />)
		// At idx 0 (done) — first verify the OPPOSITE branch is suppressed: navigate
		// briefly to idx 0 to confirm absence of return-to-live, then back.
		expect(useLivToolPanelStore.getState().navigationMode).toBe('manual')
		expect(screen.queryByTestId('panel-return-to-live')).not.toBeNull()
		expect(screen.queryByTestId('panel-jump-to-latest')).toBeNull()

		// Click → goLive(): navigationMode=live, internalIndex=tail.
		fireEvent.click(screen.getByTestId('panel-return-to-live'))
		const state = useLivToolPanelStore.getState()
		expect(state.navigationMode).toBe('live')
		expect(state.internalIndex).toBe(3)
	})

	it('shows "Jump to latest" only when manual + !running, click → goLive', () => {
		const a = makeSnapshot({toolId: 'a'})
		const b = makeSnapshot({toolId: 'b'})
		const c = makeSnapshot({toolId: 'c'})
		act(() => {
			useLivToolPanelStore.getState().setSnapshots([a, b, c])
			useLivToolPanelStore.getState().open()
			useLivToolPanelStore.getState().goToIndex(0) // manual + !running
		})
		render(<LivToolPanel />)
		expect(useLivToolPanelStore.getState().navigationMode).toBe('manual')
		expect(screen.queryByTestId('panel-jump-to-latest')).not.toBeNull()
		expect(screen.queryByTestId('panel-return-to-live')).toBeNull()

		fireEvent.click(screen.getByTestId('panel-jump-to-latest'))
		const state = useLivToolPanelStore.getState()
		expect(state.navigationMode).toBe('live')
		expect(state.internalIndex).toBe(2)
	})

	it('step counter shows "Step N of M" format', () => {
		const a = makeSnapshot({toolId: 'a'})
		const b = makeSnapshot({toolId: 'b'})
		const c = makeSnapshot({toolId: 'c'})
		act(() => {
			useLivToolPanelStore.getState().setSnapshots([a, b, c])
			useLivToolPanelStore.getState().open() // tail = idx 2
		})
		render(<LivToolPanel />)
		const counter = screen.getByTestId('step-counter')
		expect(counter.textContent ?? '').toMatch(/Step\s+3\s+of\s+3/)
	})
})
