// Phase 168-02 — CC PTY session sidebar.
//
// - Lists sessions sorted by max(lastMessageAt, lastAttachedAt) DESC.
// - Polls every 10s (refetchInterval 10_000) — Phase 169 may later add a
//   WS push but the polling fallback is the v35.0 baseline (D-V35-C).
// - `+ New Session` triggers create; onSuccess auto-selects the new id +
//   refetches the list (so the new session appears immediately).
// - Rename / Delete are owned here; SessionItem just emits the callbacks.

import {useMemo} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {NewSessionButton} from './NewSessionButton'
import {SessionItem} from './SessionItem'

export interface SessionSidebarProps {
	activeSessionId: string | null
	onSelect: (id: string | null) => void
}

export function SessionSidebar({activeSessionId, onSelect}: SessionSidebarProps) {
	const list = trpcReact.ccPty.list.useQuery(undefined, {refetchInterval: 10_000})

	const createMutation = trpcReact.ccPty.create.useMutation({
		onSuccess: ({session}) => {
			list.refetch()
			onSelect(session.id)
		},
	})

	const renameMutation = trpcReact.ccPty.rename.useMutation({
		onSuccess: () => {
			list.refetch()
		},
	})

	const deleteMutation = trpcReact.ccPty.delete.useMutation({
		onSuccess: () => {
			list.refetch()
		},
	})

	const sortedSessions = useMemo(
		() =>
			[...(list.data?.sessions ?? [])].sort(
				(a, b) =>
					Math.max(b.lastMessageAt, b.lastAttachedAt) -
					Math.max(a.lastMessageAt, a.lastAttachedAt),
			),
		[list.data],
	)

	return (
		<div className='flex h-full flex-col gap-2 p-3'>
			<NewSessionButton
				onClick={() => createMutation.mutate({})}
				loading={createMutation.isPending}
			/>
			<div className='flex-1 overflow-y-auto'>
				{sortedSessions.length === 0 ? (
					<p className='text-sm text-text-secondary'>
						No sessions yet. Click "New Session" to start.
					</p>
				) : (
					sortedSessions.map((s) => (
						<SessionItem
							key={s.id}
							session={s}
							active={s.id === activeSessionId}
							onSelect={() => onSelect(s.id)}
							onRename={(title) => renameMutation.mutate({id: s.id, title})}
							onDelete={() => {
								deleteMutation.mutate(
									{id: s.id},
									{
										onSuccess: () => {
											if (s.id === activeSessionId) onSelect(null)
										},
									},
								)
							}}
						/>
					))
				)}
			</div>
		</div>
	)
}
