/**
 * Phase 198-05 — ThreadList adapter wiring assistant-ui's
 * ExternalStoreThreadListAdapter contract to the existing Phase 197-05
 * backend (trpc.mastra.agent.threads.list + threads.delete).
 *
 * Thread persistence is handled by PostgresStore (P197-03) — Mastra
 * Memory loads thread history automatically on agent.stream() per
 * threadId. The UI's only responsibilities are:
 *
 *   - Render the list of existing threadIds returned by the
 *     `mastra.agent.threads.list` adminProcedure (P197-05).
 *   - Track the currently selected threadId in client state so the
 *     transport body can pass it on each /chat/livAi request, scoping
 *     Mastra Memory to the right thread.
 *   - Fire `mastra.agent.threads.delete` adminProcedure on delete.
 *   - Generate fresh client-side threadIds on "New conversation" —
 *     PostgresStore persists the thread on first message.
 *
 * Wire contract verified by 4 vitest tests in
 * `thread-list-adapter.test.tsx`:
 *
 *   1. threads() maps useQuery data → ThreadHistoryItem[]
 *   2. onDelete(id) invokes threads.delete.mutateAsync({threadId}) once
 *   3. onSwitchToNewThread() generates a fresh UUID-shaped threadId
 *   4. threads() returns [] when useQuery data is undefined
 *
 * The `as any` escape hatch around trpcReact mirrors the rest of the UI
 * codebase's approach for optional mastra.* paths — typed access is
 * brittle across @trpc/react-query helper versions (see Plan 198-04
 * use-approve-mutation.ts decision rationale).
 *
 * Multi-tenant scoping (per-user thread allow-list) is deferred to
 * v40+. On the Mini PC single-operator deployment, adminProcedure on
 * the backend gates both list + delete and every thread implicitly
 * belongs to the admin user — see threat T-198-05-01 (accept).
 */

import {useCallback, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export interface ThreadHistoryItem {
	threadId: string
	title: string
	status: 'regular' | 'archived'
}

export interface ThreadListAdapter {
	threads: () => ThreadHistoryItem[]
	currentThreadId: string
	onSwitchToNewThread: () => void
	onSwitchToThread: (threadId: string) => void
	onDelete: (threadId: string) => Promise<void>
	isLoading: boolean
}

// UUID-shaped client-generated threadId — PostgresStore (P197-03)
// persists this id on the first agent.stream() call carrying it.
// Format matches the regex `^t-\d+-[a-z0-9]+$` asserted by Test 3.
function newThreadId(): string {
	return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function useThreadListAdapter(): ThreadListAdapter {
	const [currentThreadId, setCurrentThreadId] = useState<string>(() =>
		newThreadId(),
	)

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const trpcAny = trpcReact as any
	const listQ = trpcAny.mastra?.agent?.threads?.list?.useQuery?.(undefined, {
		retry: false,
		staleTime: 60_000,
	})
	const deleteMut = trpcAny.mastra?.agent?.threads?.delete?.useMutation?.({
		onSuccess: () => listQ?.refetch?.(),
	})

	const threads = useCallback((): ThreadHistoryItem[] => {
		const raw = (listQ?.data?.threads ?? []) as Array<{
			id: string
			title?: string | null
		}>
		const today = new Date().toISOString().slice(0, 10)
		return raw.map((t) => ({
			threadId: t.id,
			title: t.title ?? `Untitled · ${today}`,
			status: 'regular' as const,
		}))
	}, [listQ?.data])

	const onSwitchToNewThread = useCallback(() => {
		setCurrentThreadId(newThreadId())
	}, [])

	const onSwitchToThread = useCallback((threadId: string) => {
		setCurrentThreadId(threadId)
	}, [])

	const onDelete = useCallback(
		async (threadId: string): Promise<void> => {
			if (deleteMut?.mutateAsync) {
				await deleteMut.mutateAsync({threadId})
			}
			// If the deleted thread was the active one, switch to a fresh
			// thread so the operator never lands on a tombstone.
			if (threadId === currentThreadId) {
				setCurrentThreadId(newThreadId())
			}
		},
		[deleteMut, currentThreadId],
	)

	return {
		threads,
		currentThreadId,
		onSwitchToNewThread,
		onSwitchToThread,
		onDelete,
		isLoading: listQ?.isLoading ?? false,
	}
}
