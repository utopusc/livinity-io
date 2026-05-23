// @vitest-environment jsdom
//
// Phase 198-05 Task 1 — thread-list-adapter.ts tests (TDD RED → GREEN).
// Phase 200-07 — extended with 2 runtime-sync cases (D-200-19):
//   Test 5: onSwitchToNewThread awaits runtime.threads.switchToNewThread()
//           BEFORE flipping local currentThreadId state (RESEARCH §J4 —
//           forgetting `await` is a race-condition pitfall).
//   Test 6: onDelete of the current thread also calls
//           runtime.threads.switchToNewThread() so the runtime forgets
//           the deleted thread's UIMessages and the operator never lands
//           on a tombstone in the runtime view.
//
// Validates the ExternalStoreThreadListAdapter-shape hook returned by
// `useThreadListAdapter()`:
//
//   1. adapter.threads() returns mapped {threadId, title, status} from
//      the mocked trpc.mastra.agent.threads.list useQuery data.
//   2. adapter.onDelete(threadId) invokes
//      trpc.mastra.agent.threads.delete.useMutation().mutateAsync({threadId})
//      exactly once.
//   3. adapter.onSwitchToNewThread() generates a new client-side
//      threadId (UUID-shaped) and updates currentThreadId.
//   4. adapter.threads() returns [] when useQuery data is undefined
//      (graceful degrade — initial render before fetch settles).
//   5. onSwitchToNewThread() calls runtime.threads.switchToNewThread()
//      before setCurrentThreadId(newThreadId()) (Phase 200-07 D-200-19).
//   6. onDelete(currentThreadId) calls runtime.threads.switchToNewThread()
//      (Phase 200-07 cleanup path).
//
// Per the LivOS UI testing precedent (Plan 30-02 → 198-04), the UI
// package has D-NO-NEW-DEPS — `@testing-library/react` is NOT
// installed. Tests use direct react-dom/client mounts against jsdom +
// querySelector + the inline @/trpc/trpc vi.mock factory.

import {act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Silence React 18's "current testing environment is not configured to
// support act(...)" warning under jsdom.
;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true

// ─── Mock trpcReact at module boundary ───────────────────────────────
//
// The hook reads trpcReact.mastra.agent.threads.list.useQuery() +
// trpcReact.mastra.agent.threads.delete.useMutation(). We mock both so
// tests don't need to boot the full tRPC provider tree. Test bodies
// reassign `mockQueryData` to drive the data branch and assert
// mockMutateAsync was invoked with the expected shape.

let mockQueryData: {threads: Array<{id: string; title?: string | null}>} | undefined
const mockRefetch = vi.fn()
const mockMutateAsync = vi.fn(async () => ({ok: true}))

// Phase 200-07 — mock @assistant-ui/react's useAssistantRuntime so the
// hook can wire runtime.threads.switchToNewThread() without booting a
// real AssistantRuntimeProvider tree. Tests 5 + 6 assert the spy was
// invoked.
const mockSwitchToNewThread = vi.fn(async () => undefined)

vi.mock('@assistant-ui/react', () => ({
	useAssistantRuntime: () => ({
		threads: {switchToNewThread: mockSwitchToNewThread},
	}),
}))

vi.mock('@/trpc/trpc', () => ({
	trpcReact: {
		mastra: {
			agent: {
				threads: {
					list: {
						useQuery: () => ({
							data: mockQueryData,
							isLoading: false,
							refetch: mockRefetch,
						}),
					},
					delete: {
						useMutation: () => ({
							mutateAsync: mockMutateAsync,
							isPending: false,
						}),
					},
				},
			},
		},
	},
}))

// Import AFTER the vi.mock factory runs.
import {useThreadListAdapter, type ThreadListAdapter} from './thread-list-adapter'

// ─── Test harness ────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root
let captured: ThreadListAdapter | null = null

function CapturingHookHost() {
	captured = useThreadListAdapter()
	return null
}

beforeEach(() => {
	mockQueryData = undefined
	mockRefetch.mockClear()
	mockMutateAsync.mockClear()
	mockSwitchToNewThread.mockClear()
	captured = null
	container = document.createElement('div')
	document.body.appendChild(container)
	root = createRoot(container)
})

afterEach(() => {
	act(() => {
		root.unmount()
	})
	container.remove()
})

// ─── Tests ───────────────────────────────────────────────────────────

describe('useThreadListAdapter', () => {
	it('Test 1: threads() maps useQuery data rows to ThreadHistoryItem shape', () => {
		mockQueryData = {
			threads: [
				{id: 't-aaa', title: 'First chat'},
				{id: 't-bbb', title: null},
			],
		}
		act(() => {
			root.render(<CapturingHookHost />)
		})
		expect(captured).not.toBeNull()
		const items = captured!.threads()
		expect(items).toHaveLength(2)
		expect(items[0]).toMatchObject({
			threadId: 't-aaa',
			title: 'First chat',
			status: 'regular',
		})
		expect(items[1].threadId).toBe('t-bbb')
		// title fallback "Untitled · YYYY-MM-DD" when server returns null
		expect(items[1].title).toMatch(/^Untitled · \d{4}-\d{2}-\d{2}$/)
		expect(items[1].status).toBe('regular')
	})

	it('Test 2: onDelete(threadId) invokes threads.delete.mutateAsync once with {threadId}', async () => {
		mockQueryData = {threads: [{id: 't-victim', title: 'doomed'}]}
		act(() => {
			root.render(<CapturingHookHost />)
		})
		expect(captured).not.toBeNull()
		await act(async () => {
			await captured!.onDelete('t-victim')
		})
		expect(mockMutateAsync).toHaveBeenCalledTimes(1)
		expect(mockMutateAsync).toHaveBeenCalledWith({threadId: 't-victim'})
	})

	it('Test 3: onSwitchToNewThread() generates a new client-side threadId and updates currentThreadId', async () => {
		act(() => {
			root.render(<CapturingHookHost />)
		})
		expect(captured).not.toBeNull()
		const first = captured!.currentThreadId
		expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

		// Phase 200-07: callback is now async (awaits
		// runtime.threads.switchToNewThread() before flipping local state)
		// — must await + use async act() so React 18 flushes the state
		// update before assertions read currentThreadId.
		await act(async () => {
			await captured!.onSwitchToNewThread()
		})
		const second = captured!.currentThreadId
		expect(second).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
		expect(second).not.toBe(first)
	})

	it('Test 4: threads() returns [] when useQuery data is undefined (graceful degrade)', () => {
		mockQueryData = undefined
		act(() => {
			root.render(<CapturingHookHost />)
		})
		expect(captured).not.toBeNull()
		expect(captured!.threads()).toEqual([])
	})

	// ─── Phase 200-07 — runtime-sync cases (D-200-19) ──────────────────

	it('Test 5: onSwitchToNewThread calls runtime.threads.switchToNewThread BEFORE flipping local state (D-200-19)', async () => {
		act(() => {
			root.render(<CapturingHookHost />)
		})
		expect(captured).not.toBeNull()
		const before = captured!.currentThreadId
		expect(before).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		)
		await act(async () => {
			await captured!.onSwitchToNewThread()
		})
		// Canonical runtime-sync call — Plan 200-07's whole purpose.
		expect(mockSwitchToNewThread).toHaveBeenCalledTimes(1)
		// Local state still flips so the body callback's closure
		// captures the fresh threadId on the next /chat/livAi request.
		const after = captured!.currentThreadId
		expect(after).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		)
		expect(after).not.toBe(before)
	})

	it('Test 6: onDelete(currentThreadId) ALSO calls runtime.threads.switchToNewThread (cleanup path)', async () => {
		// Seed the list so the deleted thread === the current one.
		// CapturingHookHost mounts before any thread is selected — the
		// hook's currentThreadId is generated client-side via
		// crypto.randomUUID(); we exercise the cleanup path by passing
		// that same id back through onDelete.
		act(() => {
			root.render(<CapturingHookHost />)
		})
		expect(captured).not.toBeNull()
		const currentId = captured!.currentThreadId
		await act(async () => {
			await captured!.onDelete(currentId)
		})
		// Backend mutation fired exactly once (existing Test 2 behavior).
		expect(mockMutateAsync).toHaveBeenCalledTimes(1)
		expect(mockMutateAsync).toHaveBeenCalledWith({threadId: currentId})
		// Phase 200-07 cleanup: runtime forgets the deleted thread's
		// UIMessages so the operator never lands on a tombstone.
		expect(mockSwitchToNewThread).toHaveBeenCalledTimes(1)
		// Local state also flips to a fresh UUID.
		expect(captured!.currentThreadId).not.toBe(currentId)
		expect(captured!.currentThreadId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		)
	})

	it('Test 7: onDelete(other-thread-id) does NOT call runtime.threads.switchToNewThread', async () => {
		// Deleting an OLD thread (not the active one) must leave the
		// runtime untouched — operator stays in their current thread.
		mockQueryData = {threads: [{id: 't-other', title: 'unrelated'}]}
		act(() => {
			root.render(<CapturingHookHost />)
		})
		expect(captured).not.toBeNull()
		const currentBefore = captured!.currentThreadId
		await act(async () => {
			await captured!.onDelete('t-other')
		})
		expect(mockMutateAsync).toHaveBeenCalledTimes(1)
		expect(mockSwitchToNewThread).not.toHaveBeenCalled()
		// Local state stays put.
		expect(captured!.currentThreadId).toBe(currentBefore)
	})
})
