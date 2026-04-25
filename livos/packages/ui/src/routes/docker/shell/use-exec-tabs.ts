// Phase 29 Plan 29-01 — multi-tab session-state hook for the Shell section.
//
// Tiny zustand store holding the open exec tabs + currently active tab. NO
// persist middleware — exec sessions are conversational (Plan 26-01 D-04
// resource-store precedent: only preferential state earns persist). When the
// user closes the Docker window, all sessions tear down naturally.
//
// Module-counter id generation guarantees unique tab ids across rapid
// double-clicks (50 calls in <1ms still yield 50 distinct ids — Date.now()
// alone would collide). Mirrors Phase 28-01 LogLine#counter pattern.
//
// closeTab fallback: rightward when possible, leftward if at end, null when
// empty. Pinned by Test D in use-exec-tabs.unit.test.ts.

import {create} from 'zustand'

export interface ExecTab {
	id: string
	containerName: string
	addedAt: number
}

interface ExecTabsStore {
	tabs: ExecTab[]
	activeTabId: string | null
	addTab: (containerName: string) => string
	closeTab: (id: string) => void
	activateTab: (id: string) => void
}

let _nextId = 0
const nextId = () => `tab-${++_nextId}-${Date.now()}`

export const useExecTabs = create<ExecTabsStore>((set, get) => ({
	tabs: [],
	activeTabId: null,
	addTab: (containerName: string) => {
		const id = nextId()
		const newTab: ExecTab = {id, containerName, addedAt: Date.now()}
		set((s) => ({tabs: [...s.tabs, newTab], activeTabId: id}))
		return id
	},
	closeTab: (id: string) => {
		const {tabs, activeTabId} = get()
		const idx = tabs.findIndex((t) => t.id === id)
		if (idx === -1) return // no-op on non-existent (defensive)
		const nextTabs = tabs.filter((t) => t.id !== id)
		let nextActive: string | null = activeTabId
		if (activeTabId === id) {
			if (nextTabs.length === 0) {
				nextActive = null
			} else if (idx < nextTabs.length) {
				// rightward fallback — the tab that was at idx+1 is now at idx
				nextActive = nextTabs[idx].id
			} else {
				// closed the last tab in the list — leftward fallback
				nextActive = nextTabs[nextTabs.length - 1].id
			}
		}
		set({tabs: nextTabs, activeTabId: nextActive})
	},
	activateTab: (id: string) => {
		set({activeTabId: id})
	},
}))
