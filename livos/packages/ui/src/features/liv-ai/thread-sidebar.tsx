/**
 * Phase 197-06 — ThreadSidebar.
 *
 * Lists past Liv AI conversations via trpc.mastra.agent.threads.list query.
 * Deferred-detail design — clicking a thread selects it; delete button calls
 * threads.delete mutation. v1 has no rename; that's a v2 nicety.
 */

import {trpcReact} from '@/trpc/trpc'

export interface ThreadEntry {
	id: string
	title: string | null
}

export function ThreadSidebar({
	currentThreadId,
	onSelect,
	onNew,
}: {
	currentThreadId: string
	onSelect(threadId: string): void
	onNew(): void
}) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const trpcAny = trpcReact as any
	const listQ = trpcAny.mastra?.agent?.threads?.list?.useQuery?.(undefined, {
		retry: false,
		staleTime: 60_000,
	})
	const deleteMut = trpcAny.mastra?.agent?.threads?.delete?.useMutation?.({
		onSuccess: () => listQ?.refetch?.(),
	})

	const threads: ThreadEntry[] = listQ?.data?.threads ?? []

	return (
		<aside className='flex h-full w-64 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'>
			<div className='border-b border-neutral-200 p-3 dark:border-neutral-800'>
				<button
					type='button'
					onClick={onNew}
					className='w-full rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700'
				>
					New conversation
				</button>
			</div>
			<div className='flex-1 overflow-y-auto p-2'>
				{threads.length === 0 ? (
					<p className='p-3 text-center text-xs text-neutral-500'>No past conversations</p>
				) : (
					threads.map((t) => (
						<div
							key={t.id}
							className={
								'group mb-1 flex items-center justify-between rounded-md px-2 py-2 text-sm ' +
								(t.id === currentThreadId
									? 'bg-cyan-100 dark:bg-cyan-950'
									: 'hover:bg-neutral-100 dark:hover:bg-neutral-800')
							}
						>
							<button
								type='button'
								onClick={() => onSelect(t.id)}
								className='flex-1 truncate text-left'
							>
								{t.title ?? 'Untitled'}
							</button>
							<button
								type='button'
								onClick={() => deleteMut?.mutate?.({threadId: t.id})}
								className='ml-2 hidden text-xs text-neutral-500 hover:text-red-600 group-hover:inline'
								aria-label='Delete thread'
							>
								×
							</button>
						</div>
					))
				)}
			</div>
		</aside>
	)
}
