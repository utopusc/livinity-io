// Phase 68 Plan 01 — useLivToolPanelStore unit tests.
//
// Coverage matrix (CONTEXT D-05..D-13):
//   - isVisualTool helper (D-05): 4 tests covering all three prefixes + negative cases.
//   - open(toolId?) (D-13): 2 tests — tail/live-mode and toolId-targeted/manual-mode.
//   - close() (D-08): 1 test — sticky userClosed flag.
//   - goToIndex(idx) (D-12): 2 tests — manual when idx<tail, live when idx===tail.
//   - goLive(): 1 test — pin to tail in live mode.
//   - handleNewSnapshot(snapshot) (D-11): 7 tests — all branches of the algorithm.
//   - reset(): 1 test — full state restoration.
//
// Total: 18 tests.
//
// Each test calls `useLivToolPanelStore.getState().reset()` in beforeEach to
// prevent cross-test state pollution.

import {beforeEach, describe, expect, it} from 'vitest'

import {
	isVisualTool,
	useLivToolPanelStore,
	type ToolCallSnapshot,
} from './liv-tool-panel-store'

let counter = 0
const makeSnapshot = (
	overrides: Partial<ToolCallSnapshot> = {},
): ToolCallSnapshot => ({
	toolId: 'tool-' + counter++,
	toolName: 'execute-command',
	category: 'terminal',
	assistantCall: {input: {cmd: 'ls'}, ts: 1_700_000_000_000},
	status: 'running',
	startedAt: 1_700_000_000_000,
	...overrides,
})

beforeEach(() => {
	useLivToolPanelStore.getState().reset()
})

describe('isVisualTool (D-05)', () => {
	it('matches browser-* prefix', () => {
		expect(isVisualTool('browser-navigate')).toBe(true)
		expect(isVisualTool('browser-click')).toBe(true)
		expect(isVisualTool('browser-screenshot')).toBe(true)
	})

	it('matches computer-use-* prefix', () => {
		expect(isVisualTool('computer-use-screenshot')).toBe(true)
		expect(isVisualTool('computer-use-click')).toBe(true)
		expect(isVisualTool('computer-use-key')).toBe(true)
	})

	it('matches screenshot tools', () => {
		expect(isVisualTool('screenshot')).toBe(true)
		expect(isVisualTool('screenshot-region')).toBe(true)
	})

	it('does NOT match non-visual tools (D-06 — auto-open suppressed)', () => {
		expect(isVisualTool('execute-command')).toBe(false)
		expect(isVisualTool('mcp_brave_search')).toBe(false)
		expect(isVisualTool('file-read')).toBe(false)
		expect(isVisualTool('web-search')).toBe(false)
		expect(isVisualTool('str-replace')).toBe(false)
		// Edge: regex must be anchored — "do-browser-" should NOT match.
		expect(isVisualTool('do-browser-thing')).toBe(false)
	})
})

describe('initial state', () => {
	it('starts closed in live mode with no snapshots', () => {
		const state = useLivToolPanelStore.getState()
		expect(state.isOpen).toBe(false)
		expect(state.navigationMode).toBe('live')
		expect(state.internalIndex).toBe(-1)
		expect(state.userClosed).toBe(false)
		expect(state.lastVisualToolId).toBeNull()
		expect(state.snapshots).toEqual([])
	})
})

describe('open (D-13)', () => {
	it('opens at tail in live mode when called without toolId', () => {
		const store = useLivToolPanelStore.getState()
		const snapshots = [
			makeSnapshot({toolId: 'a'}),
			makeSnapshot({toolId: 'b'}),
			makeSnapshot({toolId: 'c'}),
		]
		store.setSnapshots(snapshots)
		useLivToolPanelStore.getState().open()
		const after = useLivToolPanelStore.getState()
		expect(after.isOpen).toBe(true)
		expect(after.userClosed).toBe(false)
		expect(after.internalIndex).toBe(2)
		expect(after.navigationMode).toBe('live')
	})

	it('focuses specific snapshot in manual mode when toolId provided', () => {
		const snapshots = [
			makeSnapshot({toolId: 'a'}),
			makeSnapshot({toolId: 'b'}),
			makeSnapshot({toolId: 'c'}),
		]
		useLivToolPanelStore.getState().setSnapshots(snapshots)
		useLivToolPanelStore.getState().open('b')
		const after = useLivToolPanelStore.getState()
		expect(after.isOpen).toBe(true)
		expect(after.userClosed).toBe(false)
		expect(after.internalIndex).toBe(1)
		expect(after.navigationMode).toBe('manual')
	})

	it('falls back to live tail when toolId not found in snapshots', () => {
		const snapshots = [makeSnapshot({toolId: 'a'}), makeSnapshot({toolId: 'b'})]
		useLivToolPanelStore.getState().setSnapshots(snapshots)
		useLivToolPanelStore.getState().open('missing-id')
		const after = useLivToolPanelStore.getState()
		expect(after.isOpen).toBe(true)
		expect(after.userClosed).toBe(false)
		expect(after.internalIndex).toBe(1)
		expect(after.navigationMode).toBe('live')
	})

	it('open() with empty snapshots gives internalIndex=-1', () => {
		useLivToolPanelStore.getState().open()
		const after = useLivToolPanelStore.getState()
		expect(after.isOpen).toBe(true)
		expect(after.internalIndex).toBe(-1)
		expect(after.navigationMode).toBe('live')
	})
})

describe('close (D-08)', () => {
	it('sets isOpen=false and userClosed=true (sticky)', () => {
		useLivToolPanelStore.getState().open()
		useLivToolPanelStore.getState().close()
		const after = useLivToolPanelStore.getState()
		expect(after.isOpen).toBe(false)
		expect(after.userClosed).toBe(true)
	})
})

describe('goToIndex (D-12)', () => {
	it('switches to manual mode when idx < tail', () => {
		const snapshots = [
			makeSnapshot({toolId: 'a'}),
			makeSnapshot({toolId: 'b'}),
			makeSnapshot({toolId: 'c'}),
		]
		useLivToolPanelStore.getState().setSnapshots(snapshots)
		useLivToolPanelStore.getState().goToIndex(0)
		const after = useLivToolPanelStore.getState()
		expect(after.navigationMode).toBe('manual')
		expect(after.internalIndex).toBe(0)
	})

	it('switches to live mode when idx === tail', () => {
		const snapshots = [
			makeSnapshot({toolId: 'a'}),
			makeSnapshot({toolId: 'b'}),
			makeSnapshot({toolId: 'c'}),
		]
		useLivToolPanelStore.getState().setSnapshots(snapshots)
		useLivToolPanelStore.getState().goToIndex(0) // manual
		useLivToolPanelStore.getState().goToIndex(2) // back to tail → live
		const after = useLivToolPanelStore.getState()
		expect(after.navigationMode).toBe('live')
		expect(after.internalIndex).toBe(2)
	})
})

describe('goLive', () => {
	it('pins to tail and sets live mode', () => {
		const snapshots = [
			makeSnapshot({toolId: 'a'}),
			makeSnapshot({toolId: 'b'}),
		]
		useLivToolPanelStore.getState().setSnapshots(snapshots)
		useLivToolPanelStore.getState().goToIndex(0) // manual
		useLivToolPanelStore.getState().goLive()
		const after = useLivToolPanelStore.getState()
		expect(after.navigationMode).toBe('live')
		expect(after.internalIndex).toBe(1)
	})
})

describe('handleNewSnapshot (D-11)', () => {
	it('visual tool when closed → auto-opens, resets userClosed', () => {
		// Arrange: simulate prior user-close (sticky-closed = true).
		useLivToolPanelStore.getState().close()
		expect(useLivToolPanelStore.getState().userClosed).toBe(true)

		const visual = makeSnapshot({
			toolId: 'browser-1',
			toolName: 'browser-navigate',
			category: 'browser',
		})
		useLivToolPanelStore.getState().handleNewSnapshot(visual)

		const after = useLivToolPanelStore.getState()
		expect(after.isOpen).toBe(true)
		expect(after.userClosed).toBe(false)
		expect(after.internalIndex).toBe(0)
		expect(after.navigationMode).toBe('live')
		expect(after.lastVisualToolId).toBe('browser-1')
		expect(after.snapshots).toHaveLength(1)
	})

	it('non-visual tool when closed → does NOT open (D-06)', () => {
		const nonVisual = makeSnapshot({
			toolId: 'cmd-1',
			toolName: 'execute-command',
		})
		useLivToolPanelStore.getState().handleNewSnapshot(nonVisual)

		const after = useLivToolPanelStore.getState()
		expect(after.isOpen).toBe(false)
		expect(after.snapshots).toHaveLength(1)
		expect(after.internalIndex).toBe(-1)
		expect(after.lastVisualToolId).toBeNull()
	})

	it('non-visual tool when open + live → advances index (D-07)', () => {
		useLivToolPanelStore.getState().open()
		const first = makeSnapshot({toolId: 'cmd-1', toolName: 'execute-command'})
		useLivToolPanelStore.getState().handleNewSnapshot(first)
		expect(useLivToolPanelStore.getState().internalIndex).toBe(0)

		const second = makeSnapshot({toolId: 'cmd-2', toolName: 'file-read'})
		useLivToolPanelStore.getState().handleNewSnapshot(second)

		const after = useLivToolPanelStore.getState()
		expect(after.internalIndex).toBe(1)
		expect(after.snapshots).toHaveLength(2)
	})

	it('non-visual tool when open + manual → does NOT advance index', () => {
		const snapshots = [
			makeSnapshot({toolId: 'a'}),
			makeSnapshot({toolId: 'b'}),
			makeSnapshot({toolId: 'c'}),
		]
		useLivToolPanelStore.getState().setSnapshots(snapshots)
		useLivToolPanelStore.getState().open()
		useLivToolPanelStore.getState().goToIndex(0) // manual mode

		const newNonVisual = makeSnapshot({
			toolId: 'd',
			toolName: 'execute-command',
		})
		useLivToolPanelStore.getState().handleNewSnapshot(newNonVisual)

		const after = useLivToolPanelStore.getState()
		expect(after.internalIndex).toBe(0) // unchanged — user is browsing history
		expect(after.snapshots).toHaveLength(4) // appended
		expect(after.navigationMode).toBe('manual')
	})

	it('dedupes by toolId — replaces existing snapshot (P67 D-15)', () => {
		const running = makeSnapshot({
			toolId: 'x',
			toolName: 'browser-navigate',
			status: 'running',
		})
		useLivToolPanelStore.getState().handleNewSnapshot(running)
		expect(useLivToolPanelStore.getState().snapshots).toHaveLength(1)

		const done = makeSnapshot({
			toolId: 'x',
			toolName: 'browser-navigate',
			status: 'done',
			completedAt: 1_700_000_001_000,
		})
		useLivToolPanelStore.getState().handleNewSnapshot(done)

		const after = useLivToolPanelStore.getState()
		expect(after.snapshots).toHaveLength(1) // still 1 — replaced, not appended
		expect(after.snapshots[0]?.status).toBe('done')
		expect(after.snapshots[0]?.completedAt).toBe(1_700_000_001_000)
	})

	it('visual tool when user-closed → re-opens panel and resets userClosed', () => {
		const firstVisual = makeSnapshot({
			toolId: 'v1',
			toolName: 'browser-navigate',
		})
		useLivToolPanelStore.getState().handleNewSnapshot(firstVisual)
		expect(useLivToolPanelStore.getState().isOpen).toBe(true)

		useLivToolPanelStore.getState().close()
		expect(useLivToolPanelStore.getState().userClosed).toBe(true)
		expect(useLivToolPanelStore.getState().isOpen).toBe(false)

		const secondVisual = makeSnapshot({
			toolId: 'v2',
			toolName: 'computer-use-screenshot',
		})
		useLivToolPanelStore.getState().handleNewSnapshot(secondVisual)

		const after = useLivToolPanelStore.getState()
		expect(after.isOpen).toBe(true) // re-opened
		expect(after.userClosed).toBe(false) // reset by new visual
		expect(after.lastVisualToolId).toBe('v2')
	})

	it('visual tool when open + live → advances index to new tail', () => {
		useLivToolPanelStore.getState().open()

		const v1 = makeSnapshot({toolId: 'v1', toolName: 'browser-navigate'})
		useLivToolPanelStore.getState().handleNewSnapshot(v1)
		expect(useLivToolPanelStore.getState().internalIndex).toBe(0)

		const v2 = makeSnapshot({toolId: 'v2', toolName: 'browser-click'})
		useLivToolPanelStore.getState().handleNewSnapshot(v2)

		const after = useLivToolPanelStore.getState()
		expect(after.internalIndex).toBe(1)
		expect(after.snapshots).toHaveLength(2)
		expect(after.lastVisualToolId).toBe('v2')
	})

	it('visual tool when open + manual → does NOT advance, but DOES update lastVisualToolId', () => {
		const snapshots = [
			makeSnapshot({toolId: 'a', toolName: 'browser-navigate'}),
			makeSnapshot({toolId: 'b', toolName: 'browser-click'}),
		]
		useLivToolPanelStore.getState().setSnapshots(snapshots)
		useLivToolPanelStore.getState().open()
		useLivToolPanelStore.getState().goToIndex(0) // manual

		const v3 = makeSnapshot({toolId: 'c', toolName: 'browser-screenshot'})
		useLivToolPanelStore.getState().handleNewSnapshot(v3)

		const after = useLivToolPanelStore.getState()
		expect(after.internalIndex).toBe(0) // unchanged — user is browsing
		expect(after.navigationMode).toBe('manual')
		expect(after.lastVisualToolId).toBe('c') // tracked anyway
		expect(after.snapshots).toHaveLength(3)
	})
})

describe('reset', () => {
	it('returns store to initial state', () => {
		// Mutate every field we can.
		const snapshots = [
			makeSnapshot({toolId: 'a', toolName: 'browser-navigate'}),
			makeSnapshot({toolId: 'b'}),
		]
		useLivToolPanelStore.getState().setSnapshots(snapshots)
		useLivToolPanelStore.getState().open('a')
		useLivToolPanelStore
			.getState()
			.handleNewSnapshot(makeSnapshot({toolId: 'c', toolName: 'browser-click'}))
		useLivToolPanelStore.getState().close()

		// Reset.
		useLivToolPanelStore.getState().reset()

		const after = useLivToolPanelStore.getState()
		expect(after.isOpen).toBe(false)
		expect(after.navigationMode).toBe('live')
		expect(after.internalIndex).toBe(-1)
		expect(after.userClosed).toBe(false)
		expect(after.lastVisualToolId).toBeNull()
		expect(after.snapshots).toEqual([])
	})
})
