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
 * Wire contract verified by vitest cases in `thread-list-adapter.test.tsx`:
 *
 *   1. threads() maps useQuery data → ThreadHistoryItem[]
 *   2. onDelete(id) invokes threads.delete.mutateAsync({threadId}) once
 *   3. onSwitchToNewThread() generates a fresh UUID-shaped threadId
 *   4. threads() returns [] when useQuery data is undefined
 *   5. (Phase 200-07) onSwitchToNewThread awaits
 *      runtime.threads.switchToNewThread() BEFORE flipping local state
 *      (D-200-19; RESEARCH §G4 Option A + §J4 await-pitfall)
 *   6. (Phase 200-07) onDelete(currentThreadId) ALSO calls
 *      runtime.threads.switchToNewThread() — runtime cleanup
 *   7. (Phase 200-07) onDelete(other-id) does NOT call
 *      runtime.threads.switchToNewThread() — only current-thread delete
 *      triggers cleanup
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
 *
 * Phase 200-07 — New Conversation runtime sync (D-200-19, INV-200-08):
 *
 *   useAssistantRuntime() is wired into the hook so onSwitchToNewThread
 *   can await `runtime.threads.switchToNewThread()` BEFORE the local
 *   setCurrentThreadId(newThreadId()) state flip. This is the canonical
 *   runtime-sync call — the same one /clear uses (D-200-11, see
 *   slash-adapter.ts:89) — so the sidebar New Conversation button and
 *   /clear converge on identical behavior:
 *
 *     1. Runtime's internal UIMessage store resets to []
 *     2. Local currentThreadId rotates to a fresh UUID
 *     3. Next /chat/livAi body callback closure captures the new id
 *
 *   onDelete: if the deleted thread === currentThreadId, the same
 *   runtime-sync path runs as cleanup so the operator never lands on a
 *   tombstone in the runtime view.
 *
 *   onSwitchToThread (sidebar click on an old thread) is INTENTIONALLY
 *   unchanged — Option B (full ExternalStoreThreadListAdapter wire-up to
 *   load the old thread's UIMessages from PG into the runtime) is
 *   DEFERRED to Phase 201 per D-200-20. First ship known limitation:
 *   clicking an old thread flips local state + sets the next-send body
 *   threadId, but does NOT reload that thread's UIMessages into the
 *   runtime. Operator can refresh the window to load — backend Memory
 *   (PostgresStore) returns the full history on the next agent.stream().
 *
 *   Render-tree caveat: useAssistantRuntime() must be called from inside
 *   a component that is a descendant of <AssistantRuntimeProvider>. The
 *   Plan 200-07 Task 1 audit found the current Assistant() function in
 *   assistant.tsx calls useThreadListAdapter() OUTSIDE the provider —
 *   Plan 200-07 Task 2 restructures assistant.tsx to extract an
 *   <AssistantInner /> child component that mounts inside the provider
 *   so this hook resolves.
 */

import {useAssistantRuntime} from '@assistant-ui/react'
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
	/**
	 * Phase 200-07 — async because we await
	 * `runtime.threads.switchToNewThread()` BEFORE the local state flip
	 * (D-200-19; RESEARCH §J4 — never fire-and-forget the runtime call).
	 * Existing call sites that fire-and-forget the returned promise
	 * (e.g. the sidebar onClick handler in assistant.tsx) continue to
	 * work — JS swallows the unhandled return; the next /chat/livAi
	 * body callback closure picks up the fresh currentThreadId.
	 */
	onSwitchToNewThread: () => Promise<void>
	onSwitchToThread: (threadId: string) => void
	onDelete: (threadId: string) => Promise<void>
	isLoading: boolean
}

// UUID-shaped client-generated threadId — PostgresStore (P197-03) backs
// Mastra Memory and its `mastra_threads.id` column is `uuid` typed, so the
// id MUST match the RFC 4122 UUID grammar. Previous `t-{ts}-{rand}` format
// failed at prepare-memory-step with `invalid input syntax for type uuid`
// (P199 UAT hot-fix). `crypto.randomUUID()` is available in all browsers
// targeted by Vite — no new dep, no polyfill (D-NO-NEW-DEPS preserved).
function newThreadId(): string {
	return crypto.randomUUID()
}

export function useThreadListAdapter(): ThreadListAdapter {
	// Phase 200-07 D-200-19 — wire useAssistantRuntime() at the top of
	// the hook so onSwitchToNewThread + onDelete-of-current can sync the
	// runtime's internal UIMessage store via runtime.threads.switchToNewThread().
	// Must be called from inside a component that is a descendant of
	// <AssistantRuntimeProvider> — see render-tree caveat in the module
	// docstring (Plan 200-07 Task 2 restructures assistant.tsx to satisfy
	// this).
	const runtime = useAssistantRuntime()

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

	const onSwitchToNewThread = useCallback(async () => {
		// D-200-19 — canonical runtime-sync path. RESEARCH §J4 documents
		// the await pitfall: forgetting `await` races the body callback
		// against the runtime reset, so the next /chat/livAi request may
		// fire BEFORE the runtime's state.messages clears → operator sees
		// stale UI. The await is load-bearing — do NOT remove.
		await runtime.threads.switchToNewThread()
		setCurrentThreadId(newThreadId())
	}, [runtime])

	const onSwitchToThread = useCallback((threadId: string) => {
		// TODO(phase-201): Option B sync via ExternalStoreThreadListAdapter
		// — see RESEARCH §G4 / D-200-20. First-ship known limitation:
		// clicking an old thread flips local state + the next-send body
		// threadId, but the runtime's UIMessage store still holds the
		// previously-active thread's history. Operator can refresh the
		// window to reload — backend Memory (PostgresStore) returns the
		// full history on the next agent.stream() resolve.
		setCurrentThreadId(threadId)
	}, [])

	const onDelete = useCallback(
		async (threadId: string): Promise<void> => {
			if (deleteMut?.mutateAsync) {
				await deleteMut.mutateAsync({threadId})
			}
			// If the deleted thread was the active one, switch to a fresh
			// thread so the operator never lands on a tombstone — both in
			// local state AND in the assistant-ui runtime's UIMessage store
			// (Phase 200-07 cleanup path; D-200-19 same runtime call as
			// onSwitchToNewThread above).
			if (threadId === currentThreadId) {
				await runtime.threads.switchToNewThread()
				setCurrentThreadId(newThreadId())
			}
		},
		[deleteMut, currentThreadId, runtime],
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
