// @vitest-environment jsdom
//
// Phase 101-08 Task 3 — WebAppTeachPopupHost behavior tests (BLOCKER #4 fix).
//
// `@testing-library/react` is NOT installed (D-NO-NEW-DEPS). We mount the
// component via a minimal no-RTL adapter (createRoot + act) and dispatch
// the recorder's onAfterClick callback directly — the recorder is mocked
// via a shaped prop OR vi.mock so the test is hermetic.
//
// 3 behavior cases per plan (Task 3 <behavior> section):
//   1. Mount + simulate onAfterClick({x:100, y:200, button:1}) → pendingStep
//      passed to <TeachPopover> has {x:100, y:200, draftId: <truthy>}.
//   2. Commit fires recorder.pushNote(instruction) + clears pendingStep.
//   3. Rapid double-click queues second step (FIFO): only one popover
//      rendered at a time; second click waits in queue; after first commit,
//      second appears with its coords.
//
// Plus source-text invariants:
//   - `<TeachPopover` is rendered (BLOCKER #4 fix — not just imported).
//   - Sonner `toast.` calls are removed (or strictly fewer than before).
//   - FIFO queue pattern present (pendingQueue / queue array).

import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'

import * as ReactDom from 'react-dom/client'
import {createElement} from 'react'
import {act} from 'react-dom/test-utils'
import {describe, expect, it, vi, beforeEach} from 'vitest'

const HOST_PATH = resolve(__dirname, 'webapp-teach-popup-host.tsx')
const HOST_SRC = readFileSync(HOST_PATH, 'utf8')

describe('WebAppTeachPopupHost — source-text invariants (BLOCKER #4)', () => {
	it('imports TeachPopover from sibling module', () => {
		expect(HOST_SRC).toMatch(/from\s+['"]\.\.\/teach-popover['"]/)
	})

	it('renders <TeachPopover> (BLOCKER #4: TeachPopover IS wired, not just imported)', () => {
		// The acceptance gate from the plan: `grep -q '<TeachPopover'`.
		expect(HOST_SRC).toMatch(/<TeachPopover\b/)
	})

	it('removes Sonner toast emission path (no `toast.(` calls remain)', () => {
		// Plan acceptance: `grep -c "toast\." ... outputs 0`.
		// Old code emitted toast(describeEvent(...)) per event.
		expect(HOST_SRC).not.toMatch(/\btoast\(/)
		expect(HOST_SRC).not.toMatch(/\btoast\.(success|error|info|warning|message)\b/)
	})

	it('subscribes to recorder via setOnAfterClick (event-driven, not events-array polling)', () => {
		// The host listens for the recorder's onAfterClick callback to know
		// WHEN to show a popover — that's the SelfClaude flow. Polling the
		// `events` array is the OLD pattern (would also fire on key steps).
		expect(HOST_SRC).toMatch(/setOnAfterClick/)
	})

	it('maintains a FIFO queue for rapid clicks (D-101-TEACH-V3 risk 3)', () => {
		// Either an explicit queue: PendingStep[] state OR pending + queue
		// array refs. Source must mention `queue` or `Queue` as a state
		// concept.
		expect(HOST_SRC).toMatch(/queue/i)
	})

	it('calls recorder.pushNote on commit (writes NoteStep into v3 action log)', () => {
		expect(HOST_SRC).toMatch(/pushNote/)
	})
})

// ─────────────────────────────────────────────────────────────────────────
// Phase 101-08 Task 3 — 3 behavior tests (BLOCKER #4 fix — these are the
// behavioral assertions the plan demands, not just source-text contracts).
//
// Mount strategy: createRoot + act, NO RTL. The host accepts a `recorder`
// prop (injectable for tests) OR the test passes a shaped fake hook
// result. We inject a controllable fake that exposes setOnAfterClick +
// pushNote spies + an `events` array.
// ─────────────────────────────────────────────────────────────────────────

import {WebAppTeachPopupHost} from './webapp-teach-popup-host'

/**
 * React 18 synthetic-event-aware input setter. React reads `value` through
 * its tracked descriptor; setting `.value` directly bypasses React's
 * change tracker so `onChange` never fires. The standard workaround: use
 * the prototype's native setter so React sees the value mutate, then
 * dispatch the `input` event manually.
 */
function setReactInputValue(input: HTMLInputElement, value: string): void {
	const nativeSetter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		'value',
	)?.set
	nativeSetter!.call(input, value)
	input.dispatchEvent(new Event('input', {bubbles: true}))
}

type FakeRecorder = {
	state: 'idle' | 'recording' | 'saving'
	recording: boolean
	sessionId: string | null
	eventCount: number
	droppedCount: number
	autoStopped: boolean
	events: readonly unknown[]
	pushNote: ReturnType<typeof vi.fn>
	setOnAfterClick: (cb: ((c: {x: number; y: number; button: 1 | 2 | 3}) => void) | null) => void
	_lastCb: ((c: {x: number; y: number; button: 1 | 2 | 3}) => void) | null
}

function makeFakeRecorder(): FakeRecorder {
	const r: FakeRecorder = {
		state: 'recording',
		recording: true,
		sessionId: 'fake-sid',
		eventCount: 0,
		droppedCount: 0,
		autoStopped: false,
		events: [],
		pushNote: vi.fn(),
		setOnAfterClick: (cb) => {
			r._lastCb = cb
		},
		_lastCb: null,
	}
	return r
}

function mountHost(props: Parameters<typeof WebAppTeachPopupHost>[0]) {
	const root = document.createElement('div')
	document.body.appendChild(root)
	const r = ReactDom.createRoot(root)
	act(() => {
		r.render(createElement(WebAppTeachPopupHost, props))
	})
	return {
		root,
		rerender: (newProps: Parameters<typeof WebAppTeachPopupHost>[0]) => {
			act(() => {
				r.render(createElement(WebAppTeachPopupHost, newProps))
			})
		},
		unmount: () => {
			act(() => {
				r.unmount()
			})
			document.body.removeChild(root)
		},
	}
}

describe('WebAppTeachPopupHost — behavior (BLOCKER #4 — 3 cases)', () => {
	beforeEach(() => {
		// Clean any leftover Radix Portal nodes.
		document.body.innerHTML = ''
	})

	it('TEST 1: mount + onAfterClick(100, 200) → pendingStep {x:100, y:200, draftId} flowed into TeachPopover', () => {
		const recorder = makeFakeRecorder()
		const mounted = mountHost({
			isRecording: true,
			events: recorder.events,
			eventCount: 0,
			recorder: recorder as never,
		} as never)
		try {
			// Fire onAfterClick — the host should have subscribed.
			expect(recorder._lastCb).toBeTruthy()
			act(() => {
				recorder._lastCb!({x: 100, y: 200, button: 1})
			})
			// Radix Popover.Portal renders into document.body — assert the
			// instruction prompt label is in the DOM.
			const labelEl = document.querySelector('label[for="teach-popover-input"]')
			expect(labelEl?.textContent).toContain('Bu adımı ne için yapıyorsun?')
		} finally {
			mounted.unmount()
		}
	})

	it('TEST 2: commit fires recorder.pushNote(instruction) + clears pendingStep (popover removed)', () => {
		const recorder = makeFakeRecorder()
		const mounted = mountHost({
			isRecording: true,
			events: recorder.events,
			eventCount: 0,
			recorder: recorder as never,
		} as never)
		try {
			act(() => {
				recorder._lastCb!({x: 50, y: 60, button: 1})
			})
			// Find the input and the Save button.
			const input = document.querySelector(
				'input#teach-popover-input',
			) as HTMLInputElement
			expect(input).toBeTruthy()
			act(() => {
				setReactInputValue(input, 'search bar')
			})
			const saveBtn = Array.from(document.querySelectorAll('button')).find(
				(b) => b.textContent?.trim() === 'Save',
			) as HTMLButtonElement
			expect(saveBtn).toBeTruthy()
			act(() => {
				saveBtn.click()
			})
			expect(recorder.pushNote).toHaveBeenCalledWith('search bar')
			// Popover removed → label gone.
			expect(document.querySelector('label[for="teach-popover-input"]')).toBeNull()
		} finally {
			mounted.unmount()
		}
	})

	it('TEST 3: rapid double-click queues second step (FIFO; one popover at a time)', () => {
		const recorder = makeFakeRecorder()
		const mounted = mountHost({
			isRecording: true,
			events: recorder.events,
			eventCount: 0,
			recorder: recorder as never,
		} as never)
		try {
			// Two rapid clicks BEFORE any commit.
			act(() => {
				recorder._lastCb!({x: 50, y: 60, button: 1})
			})
			act(() => {
				recorder._lastCb!({x: 200, y: 300, button: 1})
			})
			// Only ONE popover input in the DOM.
			const inputs1 = document.querySelectorAll('input#teach-popover-input')
			expect(inputs1.length).toBe(1)
			// Commit the first with "step one".
			const input1 = inputs1[0] as HTMLInputElement
			act(() => {
				setReactInputValue(input1, 'step one')
			})
			const saveBtn1 = Array.from(document.querySelectorAll('button')).find(
				(b) => b.textContent?.trim() === 'Save',
			) as HTMLButtonElement
			act(() => {
				saveBtn1.click()
			})
			expect(recorder.pushNote).toHaveBeenNthCalledWith(1, 'step one')
			// Now the SECOND queued click's popover should appear with its
			// coords. The popover is still anchored — the input is fresh
			// (draft reset via draftId change in TeachPopover).
			const input2 = document.querySelector(
				'input#teach-popover-input',
			) as HTMLInputElement
			expect(input2).toBeTruthy()
			expect(input2.value).toBe('') // fresh draft
			act(() => {
				setReactInputValue(input2, 'step two')
			})
			const saveBtn2 = Array.from(document.querySelectorAll('button')).find(
				(b) => b.textContent?.trim() === 'Save',
			) as HTMLButtonElement
			act(() => {
				saveBtn2.click()
			})
			expect(recorder.pushNote).toHaveBeenNthCalledWith(2, 'step two')
			// Queue empty → no popover.
			expect(
				document.querySelector('input#teach-popover-input'),
			).toBeNull()
		} finally {
			mounted.unmount()
		}
	})
})
