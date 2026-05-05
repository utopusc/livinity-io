// @vitest-environment jsdom
//
// Phase 68 Plan 68-06 Task 2 — useLivToolPanelShortcut hook tests.
//
// `@testing-library/react` (and its `renderHook` helper) is NOT
// installed in this UI package — D-NO-NEW-DEPS, established by Phase
// 25/30/33/38/62/67-04/68-03/68-05 precedent. The plan reference shows
// `renderHook` for clarity, but per the project's locked test posture
// we substitute a minimal react-dom/client harness that mounts a tiny
// `<HookProbe />` component which calls the hook in its body — this
// exercises the hook's `useEffect` lifecycle (mount → listener install,
// unmount → listener remove) verbatim.
//
// Coverage (8 tests, well over the 5+ minimum required by must_haves):
//   1. Cmd+I (metaKey) toggles closed → open
//   2. Cmd+I again toggles open → closed (and sets userClosed sticky)
//   3. Ctrl+I (ctrlKey) toggles cross-platform
//   4. Cmd+Shift+I does NOT toggle (DevTools binding preserved)
//   5. Cmd+Alt+I does NOT toggle (DevTools alt binding preserved)
//   6. Cmd+J (wrong key) does NOT toggle
//   7. Cmd+I in a textarea target does NOT toggle (text-edit italic preserved)
//   8. cleans up listener on unmount (subsequent events have no effect)
//
// References:
//   - .planning/phases/68-side-panel-tool-view-dispatcher/68-CONTEXT.md (D-29)
//   - .planning/phases/68-side-panel-tool-view-dispatcher/68-06-PLAN.md
//   - livos/packages/ui/src/routes/ai-chat/liv-tool-panel.unit.test.tsx — RTL-absent precedent

import {act, createElement} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'

// Silence React 18's "current testing environment is not configured to
// support act(...)" warning under jsdom — we ARE in a test env, vitest
// just doesn't set this global automatically.
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

import {useLivToolPanelShortcut} from './use-liv-tool-panel-shortcut'
import {useLivToolPanelStore} from '@/stores/liv-tool-panel-store'

// ─────────────────────────────────────────────────────────────────────
// Test harness — mount a tiny component that calls the hook so the
// useEffect lifecycle runs exactly as it would in production. This is
// the renderHook() substitute under D-NO-NEW-DEPS.
// ─────────────────────────────────────────────────────────────────────

function HookProbe(): null {
	useLivToolPanelShortcut()
	return null
}

let container: HTMLDivElement | null = null
let root: Root | null = null

function mount(): {unmount: () => void} {
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
	act(() => {
		root!.render(createElement(HookProbe))
	})
	return {
		unmount() {
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
		},
	}
}

function dispatchKey(
	overrides: Partial<KeyboardEventInit> = {},
	target?: EventTarget,
): void {
	const event = new KeyboardEvent('keydown', {
		key: 'i',
		bubbles: true,
		cancelable: true,
		...overrides,
	})
	if (target) {
		Object.defineProperty(event, 'target', {value: target, writable: false})
	}
	act(() => {
		window.dispatchEvent(event)
	})
}

beforeEach(() => {
	useLivToolPanelStore.getState().reset()
})

afterEach(() => {
	// Defensive — most tests call unmount() explicitly, but if a test
	// throws before that we still want the harness clean for the next.
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
// Tests
// ─────────────────────────────────────────────────────────────────────

describe('useLivToolPanelShortcut (D-29)', () => {
	it('Cmd+I (metaKey) toggles panel from closed → open', () => {
		const {unmount} = mount()
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		dispatchKey({metaKey: true})
		expect(useLivToolPanelStore.getState().isOpen).toBe(true)
		unmount()
	})

	it('Cmd+I again toggles panel from open → closed (sets userClosed sticky)', () => {
		const {unmount} = mount()
		act(() => {
			useLivToolPanelStore.getState().open()
		})
		expect(useLivToolPanelStore.getState().isOpen).toBe(true)
		dispatchKey({metaKey: true})
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		// close() sets the sticky flag — keeps non-visual auto-open suppressed.
		expect(useLivToolPanelStore.getState().userClosed).toBe(true)
		unmount()
	})

	it('Ctrl+I (ctrlKey) toggles panel cross-platform', () => {
		const {unmount} = mount()
		dispatchKey({ctrlKey: true, metaKey: false})
		expect(useLivToolPanelStore.getState().isOpen).toBe(true)
		unmount()
	})

	it('Cmd+Shift+I does NOT toggle (DevTools combo preserved)', () => {
		const {unmount} = mount()
		dispatchKey({metaKey: true, shiftKey: true})
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		unmount()
	})

	it('Cmd+Alt+I does NOT toggle (alt-modifier combos preserved)', () => {
		const {unmount} = mount()
		dispatchKey({metaKey: true, altKey: true})
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		unmount()
	})

	it('Cmd+J (wrong key) does NOT toggle', () => {
		const {unmount} = mount()
		dispatchKey({metaKey: true, key: 'j'})
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		unmount()
	})

	it('modifier-only (Cmd alone with no letter) does NOT toggle', () => {
		const {unmount} = mount()
		dispatchKey({metaKey: true, key: 'Meta'})
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		unmount()
	})

	it('Cmd+I in a textarea does NOT toggle (text-edit italic preserved)', () => {
		const {unmount} = mount()
		const ta = document.createElement('textarea')
		document.body.appendChild(ta)
		ta.focus()
		dispatchKey({metaKey: true}, ta)
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		document.body.removeChild(ta)
		unmount()
	})

	it('Cmd+I in an input does NOT toggle', () => {
		const {unmount} = mount()
		const input = document.createElement('input')
		input.type = 'text'
		document.body.appendChild(input)
		input.focus()
		dispatchKey({metaKey: true}, input)
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		document.body.removeChild(input)
		unmount()
	})

	it('Cmd+I in a contenteditable element does NOT toggle', () => {
		const {unmount} = mount()
		const div = document.createElement('div')
		div.setAttribute('contenteditable', 'true')
		// jsdom does NOT auto-derive `isContentEditable` from the
		// `contenteditable` attribute (documented gap, jsdom #1670).
		// Override the getter so the hook's `instanceof HTMLElement &&
		// target.isContentEditable` check exercises the production path.
		Object.defineProperty(div, 'isContentEditable', {
			value: true,
			configurable: true,
		})
		document.body.appendChild(div)
		dispatchKey({metaKey: true}, div)
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
		document.body.removeChild(div)
		unmount()
	})

	it('cleans up listener on unmount (subsequent events have no effect)', () => {
		const {unmount} = mount()
		// Sanity: listener IS active before unmount.
		dispatchKey({metaKey: true})
		expect(useLivToolPanelStore.getState().isOpen).toBe(true)
		// Reset and unmount.
		act(() => {
			useLivToolPanelStore.getState().reset()
		})
		unmount()
		// Now any subsequent keydown must NOT change the store.
		dispatchKey({metaKey: true})
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)
	})

	it('preventDefault is called when shortcut activates', () => {
		const {unmount} = mount()
		const event = new KeyboardEvent('keydown', {
			key: 'i',
			metaKey: true,
			bubbles: true,
			cancelable: true,
		})
		act(() => {
			window.dispatchEvent(event)
		})
		expect(event.defaultPrevented).toBe(true)
		unmount()
	})

	it('preventDefault is NOT called when shortcut does not match', () => {
		const {unmount} = mount()
		const event = new KeyboardEvent('keydown', {
			key: 'j',
			metaKey: true,
			bubbles: true,
			cancelable: true,
		})
		act(() => {
			window.dispatchEvent(event)
		})
		expect(event.defaultPrevented).toBe(false)
		unmount()
	})
})
