// Phase 29 Plan 29-01 — useExecTabs unit tests.
//
// Locks down the multi-tab session-state contract for the Shell section. The
// store is a tiny zustand instance with three actions (addTab/closeTab/
// activateTab). Tests use .getState()/setState equivalents so we don't need
// React render harnessing — the resource-store unit tests use the same
// pattern (Plan 26-01 D-04 — pure-store-as-data-fixture).
//
// Notes on assertions:
//   - addTab returns the new tab id (the suite asserts uniqueness across
//     rapid double-adds via Test G).
//   - closeTab on the active tab activates the next remaining tab if any
//     (rightward fallback): if [a, b, c] active=b, closeTab(b) → active=c.
//     The implementation may pick left fallback as long as the post-close
//     active is one of the remaining tabs OR null — Test D pins "rightward
//     when possible, null when none".

import {beforeEach, describe, expect, test} from 'vitest'

import {useExecTabs} from './use-exec-tabs.js'

describe('useExecTabs', () => {
	beforeEach(() => {
		// Reset store between tests so they don't leak state.
		useExecTabs.setState({tabs: [], activeTabId: null})
	})

	test('A: initial state — tabs=[], activeTabId=null', () => {
		const s = useExecTabs.getState()
		expect(s.tabs).toEqual([])
		expect(s.activeTabId).toBeNull()
	})

	test("B: addTab('n8n') → 1 tab, active=newId, tab has containerName + addedAt", () => {
		const id = useExecTabs.getState().addTab('n8n')
		const s = useExecTabs.getState()
		expect(s.tabs.length).toBe(1)
		expect(s.tabs[0].id).toBe(id)
		expect(s.tabs[0].containerName).toBe('n8n')
		expect(typeof s.tabs[0].addedAt).toBe('number')
		expect(s.activeTabId).toBe(id)
	})

	test('C: addTab(same name) twice → 2 entries, NOT deduped (user explicitly opens new sessions)', () => {
		const id1 = useExecTabs.getState().addTab('app')
		const id2 = useExecTabs.getState().addTab('app')
		const s = useExecTabs.getState()
		expect(s.tabs.length).toBe(2)
		expect(id1).not.toBe(id2)
		expect(s.tabs[0].containerName).toBe('app')
		expect(s.tabs[1].containerName).toBe('app')
		expect(s.activeTabId).toBe(id2) // most recent activation
	})

	test('D: closeTab on the active tab → next remaining becomes active (rightward fallback); empty → null', () => {
		const a = useExecTabs.getState().addTab('a')
		const b = useExecTabs.getState().addTab('b')
		const c = useExecTabs.getState().addTab('c')
		// activate the middle tab
		useExecTabs.getState().activateTab(b)
		expect(useExecTabs.getState().activeTabId).toBe(b)

		// closeTab on active → rightward fallback to c
		useExecTabs.getState().closeTab(b)
		const after1 = useExecTabs.getState()
		expect(after1.tabs.map((t) => t.id)).toEqual([a, c])
		expect(after1.activeTabId).toBe(c)

		// close the new active (last) → leftward fallback to a (only remaining)
		useExecTabs.getState().closeTab(c)
		const after2 = useExecTabs.getState()
		expect(after2.tabs.map((t) => t.id)).toEqual([a])
		expect(after2.activeTabId).toBe(a)

		// close last remaining → null
		useExecTabs.getState().closeTab(a)
		const after3 = useExecTabs.getState()
		expect(after3.tabs).toEqual([])
		expect(after3.activeTabId).toBeNull()
	})

	test('E: activateTab(id) → activeTabId === id', () => {
		const a = useExecTabs.getState().addTab('a')
		const b = useExecTabs.getState().addTab('b')
		// b is active after second add
		expect(useExecTabs.getState().activeTabId).toBe(b)
		useExecTabs.getState().activateTab(a)
		expect(useExecTabs.getState().activeTabId).toBe(a)
	})

	test('F: closeTab on non-existent id is a no-op (defensive)', () => {
		const a = useExecTabs.getState().addTab('a')
		const before = useExecTabs.getState()
		useExecTabs.getState().closeTab('nonexistent-id-zzz')
		const after = useExecTabs.getState()
		expect(after.tabs).toEqual(before.tabs)
		expect(after.activeTabId).toBe(a)
	})

	test('G: tab id is unique across rapid double-adds (monotonic counter prevents collision)', () => {
		const ids = new Set<string>()
		for (let i = 0; i < 50; i++) {
			ids.add(useExecTabs.getState().addTab('rapid'))
		}
		expect(ids.size).toBe(50)
		expect(useExecTabs.getState().tabs.length).toBe(50)
	})
})
