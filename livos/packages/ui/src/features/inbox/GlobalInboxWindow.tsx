// Phase 177-04 — GlobalInboxWindow: cross-agent inbox browser.
//
// Displays all agent inbox entries from vault.inbox.listGlobal (newest-first).
// Supports client-side filter by agentId (substring, case-insensitive).
// Row click calls vault.inbox.markRead + refetches.
//
// Security:
//   - Filter operates on already-fetched data in memory — no server round-trip.
//   - vault.inbox.listGlobal is adminProcedure-gated (T-177-04-03 accept).
//   - No raw HTML from inbox entries is rendered (T-177-04-02 accept).
//
// Styling uses Livinity DS tokens only — NO hardcoded hex values.

import {useState} from 'react'
import {trpcReact} from '@/trpc/trpc'

export interface GlobalInboxWindowProps {
	onClose?: () => void
}

export function GlobalInboxWindow({onClose}: GlobalInboxWindowProps) {
	const [filter, setFilter] = useState('')

	const globalQuery = trpcReact.vault.inbox.listGlobal.useQuery()
	const markReadMutation = trpcReact.vault.inbox.markRead.useMutation()

	const allEntries = globalQuery.data?.entries ?? []
	const filteredEntries = filter
		? allEntries.filter((e) => e.agentId.toLowerCase().includes(filter.toLowerCase()))
		: allEntries

	return (
		<div
			data-testid='global-inbox-window'
			className='flex h-full flex-col bg-bg text-text-primary'
		>
			{/* Header */}
			<div className='flex items-center gap-2 border-b border-line px-4 py-3'>
				<h2 className='flex-1 text-sm font-semibold'>Global Inbox</h2>
				{onClose && (
					<button
						type='button'
						data-testid='global-inbox-close'
						onClick={onClose}
						className='rounded px-2 py-1 text-xs text-text-secondary hover:bg-surface-2'
					>
						Close
					</button>
				)}
			</div>

			{/* Filter */}
			<div className='px-4 py-2'>
				<input
					data-testid='inbox-filter'
					type='text'
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					placeholder='Filter by agent...'
					className='w-full rounded border border-line bg-bg px-2 py-1 text-sm text-text-primary placeholder:text-text-secondary'
				/>
			</div>

			{/* Entry list */}
			{globalQuery.isLoading ? (
				<div className='px-4 py-2 text-sm text-text-secondary'>Loading…</div>
			) : filteredEntries.length === 0 ? (
				<div
					data-testid='global-inbox-empty'
					className='px-4 py-2 text-sm text-text-secondary'
				>
					No inbox entries
				</div>
			) : (
				<ul className='flex flex-1 flex-col gap-0 overflow-y-auto'>
					{filteredEntries.map((entry) => (
						<li
							key={entry.id}
							data-testid='global-inbox-entry'
							onClick={() =>
								markReadMutation.mutate(
									{filePath: entry.filePath},
									{onSuccess: () => globalQuery.refetch()},
								)
							}
							className={`flex cursor-pointer items-center gap-3 border-b border-line px-4 py-2 text-sm hover:bg-surface-2 ${
								entry.read ? 'opacity-50' : ''
							}`}
						>
							<span className='min-w-0 flex-1 truncate font-medium'>{entry.agentId}</span>
							<span className='text-xs text-text-secondary'>
								{new Date(entry.runAt).toLocaleDateString()}
							</span>
							<span
								className={`rounded px-1.5 py-0.5 text-xs ${
									entry.status === 'success'
										? 'bg-surface-2 text-text-secondary'
										: 'bg-surface-2 text-text-secondary'
								}`}
							>
								{entry.status}
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
