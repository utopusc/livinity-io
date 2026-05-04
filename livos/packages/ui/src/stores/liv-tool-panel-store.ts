/** LivToolPanel Zustand store — Phase 68-01.
 *
 * State + actions per CONTEXT D-10..D-13. Auto-open logic per D-11
 * (visual-tools-only, locked STATE.md line 79).
 *
 * In-memory only — NO persist middleware (CONTEXT D-09). Refresh resets
 * panel state; panel state is per-session.
 *
 * Consumers (P70+):
 *   - useLivAgentStream subscriber → handleNewSnapshot(snapshot)
 *   - LivToolPanel component → reads state, calls open/close/goToIndex/goLive
 *   - InlineToolPill click → calls open(toolId)
 *   - Cmd+I shortcut → toggles open/close
 *
 * NOTE: ToolCallSnapshot is locally re-declared here per CONTEXT D-14
 * because P67 has not yet shipped its `@nexus/core` re-export. Shape is
 * verbatim from P67-CONTEXT D-12 — DO NOT alter without coordinating P67.
 */

import {create} from 'zustand'

// Visual-tool regex — STATE.md line 79 LOCKED product decision.
// DO NOT widen to other categories. Tested in unit tests.
export const VISUAL_TOOL_PATTERN = /^(browser-|computer-use-|screenshot)/

export function isVisualTool(toolName: string): boolean {
	return VISUAL_TOOL_PATTERN.test(toolName)
}

// Local re-declaration of P67's ToolCallSnapshot (CONTEXT D-14).
// Source of truth: 67-CONTEXT.md D-12. Aligned via review when P67 ships
// `@nexus/core` exports.
export type ToolCallSnapshot = {
	toolId: string
	toolName: string
	category:
		| 'browser'
		| 'terminal'
		| 'file'
		| 'fileEdit'
		| 'webSearch'
		| 'webCrawl'
		| 'webScrape'
		| 'mcp'
		| 'computer-use'
		| 'generic'
	assistantCall: {input: Record<string, unknown>; ts: number}
	toolResult?: {output: unknown; isError: boolean; ts: number}
	status: 'running' | 'done' | 'error'
	startedAt: number
	completedAt?: number
}

export type NavigationMode = 'live' | 'manual'

export interface LivToolPanelStore {
	// State (CONTEXT D-10)
	isOpen: boolean
	navigationMode: NavigationMode
	internalIndex: number
	userClosed: boolean
	lastVisualToolId: string | null
	snapshots: ToolCallSnapshot[]

	// Actions (CONTEXT D-10)
	open: (toolId?: string) => void
	close: () => void
	goToIndex: (idx: number) => void
	goLive: () => void
	handleNewSnapshot: (snapshot: ToolCallSnapshot) => void
	setSnapshots: (snapshots: ToolCallSnapshot[]) => void
	reset: () => void
}

const initialState = {
	isOpen: false,
	navigationMode: 'live' as NavigationMode,
	internalIndex: -1,
	userClosed: false,
	lastVisualToolId: null as string | null,
	snapshots: [] as ToolCallSnapshot[],
}

export const useLivToolPanelStore = create<LivToolPanelStore>()((set, get) => ({
	...initialState,

	// open(toolId?) — CONTEXT D-13
	// With toolId: focus that snapshot in 'manual' mode.
	// Without toolId (or toolId not found): tail open in 'live' mode.
	// Always sets isOpen=true, userClosed=false.
	open: (toolId) => {
		const state = get()
		if (toolId !== undefined) {
			const idx = state.snapshots.findIndex((s) => s.toolId === toolId)
			if (idx >= 0) {
				set({
					isOpen: true,
					userClosed: false,
					internalIndex: idx,
					navigationMode: 'manual',
				})
				return
			}
		}
		// Fallback: live-mode tail open (also when toolId absent).
		set({
			isOpen: true,
			userClosed: false,
			internalIndex: state.snapshots.length - 1, // -1 if empty
			navigationMode: 'live',
		})
	},

	// close() — CONTEXT D-08
	// Sticky-closed flag suppresses non-visual auto-open until a NEW visual
	// snapshot arrives (which resets userClosed in handleNewSnapshot).
	close: () => set({isOpen: false, userClosed: true}),

	// goToIndex(idx) — CONTEXT D-12
	// idx === tail → 'live' mode; idx < tail → 'manual' mode.
	goToIndex: (idx) => {
		const len = get().snapshots.length
		const mode: NavigationMode = idx === len - 1 ? 'live' : 'manual'
		set({internalIndex: idx, navigationMode: mode})
	},

	// goLive() — sets navigationMode to 'live' and pins to the tail.
	goLive: () => {
		const len = get().snapshots.length
		set({navigationMode: 'live', internalIndex: len - 1})
	},

	// handleNewSnapshot(snapshot) — CONTEXT D-11 (verbatim algorithm).
	// Step 1: dedupe by toolId (replace existing or append).
	// Step 2: classify visual / non-visual.
	// Step 3 (visual): record lastVisualToolId; auto-open if closed (resets
	//                  userClosed); auto-advance index if open + live.
	// Step 4 (non-visual): auto-advance index ONLY if already open + live;
	//                      NEVER touch isOpen for non-visual tools.
	handleNewSnapshot: (snapshot) => {
		const state = get()
		// Step 1: dedupe by toolId per P67 D-15.
		const existingIdx = state.snapshots.findIndex(
			(s) => s.toolId === snapshot.toolId,
		)
		const newSnapshots =
			existingIdx >= 0
				? state.snapshots.map((s, i) => (i === existingIdx ? snapshot : s))
				: [...state.snapshots, snapshot]
		const newTailIdx = newSnapshots.length - 1
		const isVisual = isVisualTool(snapshot.toolName)

		const updates: Partial<LivToolPanelStore> = {snapshots: newSnapshots}

		if (isVisual) {
			updates.lastVisualToolId = snapshot.toolId
			if (!state.isOpen) {
				// Visual tool RESETS sticky-closed and auto-opens.
				updates.isOpen = true
				updates.userClosed = false
				updates.internalIndex = newTailIdx
				updates.navigationMode = 'live'
			} else if (state.navigationMode === 'live') {
				// Already open in live-mode → auto-advance to new tail.
				updates.internalIndex = newTailIdx
			}
			// Else: open + manual → user is browsing history; don't disturb.
		} else {
			// Non-visual tool: NEVER auto-open.
			if (state.isOpen && state.navigationMode === 'live') {
				updates.internalIndex = newTailIdx
			}
			// Else: closed OR manual → just append, don't change index/isOpen.
		}

		set(updates)
	},

	// setSnapshots(snapshots) — bulk replace (called by P70 wiring).
	setSnapshots: (snapshots) => set({snapshots}),

	// reset() — return to initial state. Used by tests + page nav.
	reset: () => set(initialState),
}))
