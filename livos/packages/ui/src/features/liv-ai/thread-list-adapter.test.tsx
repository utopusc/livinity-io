// @vitest-environment jsdom
//
// Phase 198-05 Task 1 — thread-list-adapter.ts tests (TDD RED → GREEN).
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

	it('Test 3: onSwitchToNewThread() generates a new client-side threadId and updates currentThreadId', () => {
		act(() => {
			root.render(<CapturingHookHost />)
		})
		expect(captured).not.toBeNull()
		const first = captured!.currentThreadId
		expect(first).toMatch(/^t-\d+-[a-z0-9]+$/)

		act(() => {
			captured!.onSwitchToNewThread()
		})
		const second = captured!.currentThreadId
		expect(second).toMatch(/^t-\d+-[a-z0-9]+$/)
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
})
