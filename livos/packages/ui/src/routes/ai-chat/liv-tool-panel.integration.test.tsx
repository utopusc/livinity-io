// @vitest-environment jsdom
//
// Phase 68 Plan 68-07 — End-to-end integration test for LivToolPanel.
//
// This file is the END-OF-PHASE CONTRACT VERIFICATION GATE for P68.
// It exercises the FULL pipeline (real Zustand store + real LivToolPanel
// + real useLivToolPanelShortcut hook + real dispatcher + real
// GenericToolView) against the LOCKED auto-open behavior contract from
// `.planning/STATE.md` line 79:
//
//   "Visual tools (browser-*, computer-use-*, screenshot) auto-open the
//    side panel. Non-visual tools (terminal, file, mcp) NEVER auto-open."
//
// Each test name embeds the CAPS-LOCKED phrase from the contract so a
// failure log immediately points to the violated decision (T-68-07-03).
//
// `@testing-library/react` is NOT installed in this UI package
// (D-NO-NEW-DEPS — established Phase 25/30/33/38/62/67-04/68-03/68-05/68-06
// precedent). Per that locked posture this file ships **direct
// react-dom/client renders** against the jsdom DOM with thin RTL-shaped
// helpers (`render`, `screen`, `fireEvent`, `waitFor`) so the API matches
// what the plan requested without taking the dependency. When
// `@testing-library/react` eventually lands the helpers below can be
// swapped 1:1 for the real exports — no behavioural change.
//
// Coverage (8 integration tests, exactly per plan must_haves):
//   1. VISUAL TOOL AUTO-OPEN — browser-* opens panel from closed state
//   2. NON-VISUAL TOOL DOES NOT AUTO-OPEN — execute-command keeps panel closed
//   3. USER-CLOSED PANEL STAYS CLOSED FOR NON-VISUAL TOOLS
//   4. NEW VISUAL TOOL RE-OPENS PANEL EVEN AFTER USER-CLOSE
//   5. MANUAL OPEN VIA store.open(toolId) WORKS FOR NON-VISUAL TOOLS
//   6. LIVE-MODE AUTO-ADVANCE applies to all categories once panel is open
//   7. CMD+I CLOSES PANEL FROM AUTO-OPEN STATE AND SETS userClosed (regression)
//   8. SAME VISUAL TOOL DISPATCHED TWICE → DEDUPED (regression)
//
// References:
//   - .planning/STATE.md line 79 (locked contract)
//   - .planning/phases/68-side-panel-tool-view-dispatcher/68-CONTEXT.md (D-05..D-13)
//   - livos/packages/ui/src/routes/ai-chat/liv-tool-panel.unit.test.tsx — RTL-absent precedent
//   - livos/packages/ui/src/hooks/use-liv-tool-panel-shortcut.unit.test.ts — keydown precedent

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

// Silence React 18's "current testing environment is not configured to
// support act(...)" warning under jsdom — we ARE in a test env, vitest
// just doesn't set this global automatically. (See 68-05 precedent.)
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// Polyfill ResizeObserver — Radix Slider's transitive useSize hook calls
// `new ResizeObserver(...)` on mount, which jsdom does not implement.
// (Same Rule 3 auto-fix as 68-05.)
if (typeof globalThis.ResizeObserver === 'undefined') {
	;(globalThis as {ResizeObserver?: unknown}).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
}

import {LivToolPanel} from './liv-tool-panel'
import {useLivToolPanelStore, type ToolCallSnapshot} from '@/stores/liv-tool-panel-store'

// ─────────────────────────────────────────────────────────────────────
// Test harness — minimal react-dom/client mount mimicking
// @testing-library/react's render / screen / fireEvent / waitFor /
// cleanup API. Helpers are named to MATCH RTL exactly so a future
// migration is a drop-in 1:1 swap (`from '@testing-library/react'`).
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
}

const fireEvent = {
	click(el: Element) {
		act(() => {
			;(el as HTMLElement).click()
		})
	},
}

/**
 * waitFor — polls `predicate()` until it returns truthy or throws no error.
 * In our react-dom/client + AnimatePresence setup, all state updates are
 * synchronous (no microtask deferral required) so the predicate normally
 * resolves on the first call. We still implement a real polling loop with
 * a 1000ms cap to handle any future framer-motion exit-animation timing
 * gaps without flaking. (T-68-07-02 mitigation.)
 */
async function waitFor(predicate: () => void | Promise<void>, timeoutMs = 1000): Promise<void> {
	const start = Date.now()
	let lastErr: unknown
	while (Date.now() - start < timeoutMs) {
		try {
			await predicate()
			return
		} catch (err) {
			lastErr = err
			await new Promise((r) => setTimeout(r, 16))
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error('waitFor timed out')
}

function cleanup() {
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
}

// ─────────────────────────────────────────────────────────────────────
// Test data factory + dispatch helper
// ─────────────────────────────────────────────────────────────────────

const makeSnapshot = (overrides: Partial<ToolCallSnapshot> = {}): ToolCallSnapshot => ({
	toolId: 't-' + Math.random().toString(36).slice(2, 10),
	toolName: 'execute-command',
	category: 'terminal',
	assistantCall: {input: {}, ts: 1000},
	status: 'running',
	startedAt: 1000,
	...overrides,
})

/**
 * Dispatch a snapshot through the REAL store action — simulates exactly
 * what `useLivAgentStream` will do in P70 when a tool_use event arrives.
 * Wrapped in act() so React 18's batching + scheduler observe the update
 * before assertions run.
 */
function dispatch(snapshot: ToolCallSnapshot): void {
	act(() => {
		useLivToolPanelStore.getState().handleNewSnapshot(snapshot)
	})
}

// ─────────────────────────────────────────────────────────────────────
// Test suite lifecycle
// ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
	// Isolate Zustand store between tests — T-68-07-01 mitigation.
	useLivToolPanelStore.getState().reset()
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(cleanup)

// ─────────────────────────────────────────────────────────────────────
// 8 integration tests — STATE.md line 79 LOCKED contract verification
// ─────────────────────────────────────────────────────────────────────

describe('P68 Integration — Auto-Open Behavior (STATE.md line 79 LOCKED)', () => {
	it('VISUAL TOOL AUTO-OPEN — browser-* snapshot opens panel even when previously closed', async () => {
		render(<LivToolPanel />)
		// Sanity: panel is NOT in DOM before any snapshot dispatched.
		expect(screen.queryByTestId('liv-tool-panel')).toBeNull()

		// Dispatch a visual tool snapshot through the REAL store action.
		dispatch(makeSnapshot({toolName: 'browser-navigate', category: 'browser'}))

		// Panel must auto-open and render within the AnimatePresence cycle.
		await waitFor(() => {
			expect(screen.getByTestId('liv-tool-panel')).not.toBeNull()
		})

		// Verify the locked auto-open invariants from CONTEXT D-11.
		const state = useLivToolPanelStore.getState()
		expect(state.isOpen).toBe(true)
		expect(state.userClosed).toBe(false)
		expect(state.internalIndex).toBe(0)
		expect(state.navigationMode).toBe('live')
		expect(state.lastVisualToolId).toBeTruthy()
		expect(state.snapshots.length).toBe(1)
	})

	it('NON-VISUAL TOOL DOES NOT AUTO-OPEN — execute-command snapshot keeps panel closed', () => {
		render(<LivToolPanel />)

		// Dispatch a non-visual (terminal) tool — must NEVER auto-open.
		dispatch(makeSnapshot({toolName: 'execute-command', category: 'terminal'}))

		// Panel must NOT be in the DOM (AnimatePresence renders nothing while closed).
		expect(screen.queryByTestId('liv-tool-panel')).toBeNull()

		// State invariants: snapshot recorded, but isOpen still false.
		const state = useLivToolPanelStore.getState()
		expect(state.isOpen).toBe(false)
		expect(state.userClosed).toBe(false) // user has not interacted
		expect(state.snapshots.length).toBe(1) // snapshot still tracked
		expect(state.lastVisualToolId).toBeNull() // no visual tool seen
	})

	it('USER-CLOSED PANEL STAYS CLOSED FOR NON-VISUAL TOOLS', async () => {
		render(<LivToolPanel />)

		// Step 1: visual tool auto-opens panel.
		dispatch(makeSnapshot({toolName: 'browser-navigate', category: 'browser'}))
		await waitFor(() => {
			expect(screen.getByTestId('liv-tool-panel')).not.toBeNull()
		})
		expect(useLivToolPanelStore.getState().isOpen).toBe(true)

		// Step 2: user clicks the close button → sticky userClosed=true.
		fireEvent.click(screen.getByTestId('panel-close-btn'))
		await waitFor(() => {
			expect(screen.queryByTestId('liv-tool-panel')).toBeNull()
		})
		expect(useLivToolPanelStore.getState().userClosed).toBe(true)
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)

		// Step 3: dispatch a non-visual tool — panel MUST stay closed.
		dispatch(makeSnapshot({toolName: 'execute-command', category: 'terminal'}))
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		expect(screen.queryByTestId('liv-tool-panel')).toBeNull()
	})

	it('NEW VISUAL TOOL RE-OPENS PANEL EVEN AFTER USER-CLOSE', async () => {
		render(<LivToolPanel />)

		// Step 1: auto-open via visual tool, then user closes it.
		dispatch(makeSnapshot({toolName: 'browser-navigate', category: 'browser'}))
		await waitFor(() => {
			expect(screen.getByTestId('liv-tool-panel')).not.toBeNull()
		})
		fireEvent.click(screen.getByTestId('panel-close-btn'))
		await waitFor(() => {
			expect(screen.queryByTestId('liv-tool-panel')).toBeNull()
		})
		expect(useLivToolPanelStore.getState().userClosed).toBe(true)

		// Step 2: a NEW visual tool MUST reset userClosed and re-open the panel.
		dispatch(makeSnapshot({toolName: 'computer-use-screenshot', category: 'computer-use'}))
		await waitFor(() => {
			expect(screen.getByTestId('liv-tool-panel')).not.toBeNull()
		})

		const state = useLivToolPanelStore.getState()
		expect(state.isOpen).toBe(true)
		expect(state.userClosed).toBe(false) // sticky flag cleared by visual auto-open
		expect(state.snapshots.length).toBe(2)
	})

	it('MANUAL OPEN VIA store.open(toolId) WORKS FOR NON-VISUAL TOOLS', async () => {
		render(<LivToolPanel />)

		// A non-visual snapshot lives in the store but does NOT auto-open.
		const snap = makeSnapshot({toolName: 'execute-command', category: 'terminal'})
		dispatch(snap)
		expect(screen.queryByTestId('liv-tool-panel')).toBeNull()

		// User clicks the inline tool pill → calls store.open(toolId).
		// This is the manual-mode entry point that opens the panel focused
		// on a specific snapshot (D-13).
		act(() => {
			useLivToolPanelStore.getState().open(snap.toolId)
		})
		await waitFor(() => {
			expect(screen.getByTestId('liv-tool-panel')).not.toBeNull()
		})

		const state = useLivToolPanelStore.getState()
		expect(state.isOpen).toBe(true)
		expect(state.internalIndex).toBe(0) // focused on the only snapshot
		expect(state.navigationMode).toBe('manual') // open(toolId) → manual
		expect(state.userClosed).toBe(false)
	})

	it('LIVE-MODE AUTO-ADVANCE applies to all categories once panel is open', async () => {
		render(<LivToolPanel />)

		// Step 1: visual tool auto-opens panel in live mode at index 0.
		dispatch(makeSnapshot({toolName: 'browser-navigate', category: 'browser'}))
		await waitFor(() => {
			expect(screen.getByTestId('liv-tool-panel')).not.toBeNull()
		})
		expect(useLivToolPanelStore.getState().internalIndex).toBe(0)
		expect(useLivToolPanelStore.getState().navigationMode).toBe('live')

		// Step 2: non-visual snapshot — panel was already open in live mode,
		// so the index must auto-advance to the new tail (D-11 step 4).
		dispatch(makeSnapshot({toolName: 'execute-command', category: 'terminal'}))
		expect(useLivToolPanelStore.getState().internalIndex).toBe(1)
		expect(useLivToolPanelStore.getState().snapshots.length).toBe(2)

		// Step 3: another non-visual snapshot from a different category —
		// live-mode auto-advance is category-agnostic once the panel is open.
		dispatch(makeSnapshot({toolName: 'mcp_brave_search', category: 'mcp'}))
		expect(useLivToolPanelStore.getState().internalIndex).toBe(2)
		expect(useLivToolPanelStore.getState().snapshots.length).toBe(3)
		expect(useLivToolPanelStore.getState().navigationMode).toBe('live')
	})

	it('CMD+I CLOSES PANEL FROM AUTO-OPEN STATE AND SETS userClosed (regression for 68-06)', async () => {
		render(<LivToolPanel />)

		// Auto-open via a visual tool — exercises the full auto-open pipeline.
		dispatch(makeSnapshot({toolName: 'browser-navigate', category: 'browser'}))
		await waitFor(() => {
			expect(screen.getByTestId('liv-tool-panel')).not.toBeNull()
		})
		expect(useLivToolPanelStore.getState().isOpen).toBe(true)

		// Cmd+I keydown — listener was installed by useLivToolPanelShortcut
		// inside <LivToolPanel /> via useEffect. This verifies the hook
		// stays wired across the auto-open → close transition.
		act(() => {
			window.dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'i',
					metaKey: true,
					bubbles: true,
					cancelable: true,
				}),
			)
		})

		// Panel MUST close and userClosed MUST flip sticky-true so the next
		// non-visual snapshot won't re-open it (regression on 68-06).
		await waitFor(() => {
			expect(screen.queryByTestId('liv-tool-panel')).toBeNull()
		})
		const state = useLivToolPanelStore.getState()
		expect(state.isOpen).toBe(false)
		expect(state.userClosed).toBe(true)
	})

	it('SAME VISUAL TOOL DISPATCHED TWICE → DEDUPED, panel still open (regression for 68-01)', async () => {
		render(<LivToolPanel />)

		// First dispatch — visual tool starts running, panel auto-opens.
		const snap = makeSnapshot({
			toolId: 'visual-1',
			toolName: 'browser-navigate',
			category: 'browser',
			status: 'running',
		})
		dispatch(snap)
		await waitFor(() => {
			expect(screen.getByTestId('liv-tool-panel')).not.toBeNull()
		})
		expect(useLivToolPanelStore.getState().snapshots.length).toBe(1)

		// Second dispatch — SAME toolId, status transition to 'done'.
		// Per CONTEXT D-15 / D-11 step 1, this must REPLACE (dedupe) the
		// existing snapshot — NOT append — and the panel must stay open.
		dispatch({
			...snap,
			status: 'done',
			completedAt: 2000,
			toolResult: {output: 'ok', isError: false, ts: 2000},
		})

		const state = useLivToolPanelStore.getState()
		expect(state.snapshots.length).toBe(1) // deduped
		expect(state.snapshots[0].status).toBe('done') // replaced with new status
		expect(state.snapshots[0].toolResult).toBeDefined()
		expect(state.isOpen).toBe(true) // panel never closes during dedupe
		expect(screen.getByTestId('liv-tool-panel')).not.toBeNull()
	})
})
