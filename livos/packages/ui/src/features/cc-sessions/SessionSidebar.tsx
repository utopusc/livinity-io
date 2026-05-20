// Phase 168-02 — CC PTY session sidebar.
//
// - Lists sessions sorted by max(lastMessageAt, lastAttachedAt) DESC.
// - Polls every 10s (refetchInterval 10_000) — Phase 169 may later add a
//   WS push but the polling fallback is the v35.0 baseline (D-V35-C).
// - `+ New Session` triggers create; onSuccess auto-selects the new id +
//   refetches the list (so the new session appears immediately).
// - Rename / Delete are owned here; SessionItem just emits the callbacks.
//
// Phase 168-04 — Cross-tab attach indicator. Subscribes to
// `trpcReact.ccPty.subscribeAttachStatus` and tracks `activeAttachers` as
// a per-sessionId set of attachIds. For each session row, computes
// `attachedElsewhere = any attachId !== this tab's tabAttachIdRef`. Until
// CcTerminal threads `tabAttachIdRef` through the WS attach envelope
// (deferred to a follow-up plan), the local tab's attachId never appears
// in `activeAttachers` — so the badge is correct for "another tab" cases
// from day one and tabAttachIdRef is a forward-compatible self-suppression slot.

import {useMemo, useRef, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {NewSessionButton} from './NewSessionButton'
import {SessionItem} from './SessionItem'

export interface SessionSidebarProps {
	activeSessionId: string | null
	onSelect: (id: string | null) => void
}

export function SessionSidebar({activeSessionId, onSelect}: SessionSidebarProps) {
	const list = trpcReact.ccPty.list.useQuery(undefined, {refetchInterval: 10_000})

	// Phase 168-04 — per-mount tab attachId; stable across re-renders, resets
	// on remount. Used by attachedElsewhere comparison to suppress self-attach
	// badges when CcTerminal eventually threads this through the WS attach
	// envelope.
	const tabAttachIdRef = useRef<string>(
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `tab-${Math.random().toString(36).slice(2)}`,
	)
	// activeAttachers: sessionId → Set<attachId> across all known peer tabs.
	// Phase 168-04 subscribeAttachStatus mutates this in onData.
	const [activeAttachers, setActiveAttachers] = useState<Map<string, Set<string>>>(
		() => new Map(),
	)

	trpcReact.ccPty.subscribeAttachStatus.useSubscription(undefined, {
		onData: (msg: {
			sessionId: string
			attachId: string
			attachedAt: number
			action: 'attached' | 'detached'
		}) => {
			setActiveAttachers((prev) => {
				const next = new Map(prev)
				const cur = new Set(next.get(msg.sessionId) ?? [])
				if (msg.action === 'attached') cur.add(msg.attachId)
				else cur.delete(msg.attachId)
				if (cur.size === 0) next.delete(msg.sessionId)
				else next.set(msg.sessionId, cur)
				return next
			})
		},
	})

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
					sortedSessions.map((s) => {
						const attachers = activeAttachers.get(s.id) ?? new Set<string>()
						const attachedElsewhere = Array.from(attachers).some(
							(aid) => aid !== tabAttachIdRef.current,
						)
						return (
							<SessionItem
								key={s.id}
								session={s}
								active={s.id === activeSessionId}
								attachedElsewhere={attachedElsewhere}
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
						)
					})
				)}
			</div>
		</div>
	)
}
