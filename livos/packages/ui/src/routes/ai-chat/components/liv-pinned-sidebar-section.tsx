/**
 * LivPinnedSidebarSection — Phase 75-07 / CONTEXT D-18.
 *
 * Sidebar list of the user's pinned messages. Fetches GET
 * /api/pinned-messages on mount, renders one card per pin (label or first-60
 * chars + content snippet + unpin (X) button). Click a card → invokes
 * `onSelectMessage` so the parent can scroll to the source conversation.
 *
 * The section renders ABOVE the conversation list (per CONTEXT D-18 +
 * v31-DRAFT line 793). When the user has zero pins, the section auto-hides
 * (no header, no empty state — keeps the sidebar quiet for first-time users).
 *
 * JWT auth source: `localStorage[JWT_LOCAL_STORAGE_KEY]` per the P67-04
 * convention (mirrors `useLivAgentStream` + `liv-conversation-search.tsx`).
 *
 * Wire-up site: ai-chat/index.tsx — mounted at the top of the sessions
 * sidebar by plan 75-07 task 2 step 6.
 */
import {useEffect, useState} from 'react'

import {IconPinFilled, IconX} from '@tabler/icons-react'

import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'

export interface PinnedItem {
	id: string
	messageId: string | null
	conversationId: string | null
	content: string
	label: string | null
	pinnedAt: string
}

export interface LivPinnedSidebarSectionProps {
	/** Optional click handler — receives (messageId | null, conversationId | null). */
	onSelectMessage?: (messageId: string | null, conversationId: string | null) => void
	/** Optional className appended to the wrapper div. */
	className?: string
	/** External revision counter — bump to force a refetch (e.g. after a pin is added elsewhere). */
	revision?: number
}

const PINNED_ENDPOINT = '/api/pinned-messages'

function getJwt(): string {
	if (typeof window === 'undefined') return ''
	return window.localStorage.getItem(JWT_LOCAL_STORAGE_KEY) ?? ''
}

export function LivPinnedSidebarSection({
	onSelectMessage,
	className,
	revision,
}: LivPinnedSidebarSectionProps) {
	const [items, setItems] = useState<PinnedItem[] | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)

	const refetch = async () => {
		setLoading(true)
		setError(null)
		try {
			const res = await fetch(PINNED_ENDPOINT, {
				headers: {Authorization: `Bearer ${getJwt()}`},
			})
			if (!res.ok) throw new Error(`fetch pins: ${res.status}`)
			const json = (await res.json()) as {results: PinnedItem[]}
			setItems(json.results ?? [])
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e)
			setError(msg)
			setItems([])
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void refetch()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [revision])

	const handleUnpin = async (e: React.MouseEvent, pinId: string) => {
		e.stopPropagation()
		try {
			const res = await fetch(`${PINNED_ENDPOINT}/${encodeURIComponent(pinId)}`, {
				method: 'DELETE',
				headers: {Authorization: `Bearer ${getJwt()}`},
			})
			if (!res.ok) throw new Error(`unpin: ${res.status}`)
			// Optimistic update — drop the item from the local list immediately.
			setItems((prev) => (prev ?? []).filter((p) => p.id !== pinId))
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setError(msg)
			setTimeout(() => setError(null), 2000)
		}
	}

	// Hide the section entirely when zero pins (CONTEXT D-18 — quiet sidebar
	// for first-time users). Loading state also hides; we don't want a
	// flashing header on initial paint.
	if (loading) return null
	if (!items || items.length === 0) return null

	return (
		<div className={`px-2 pt-2 ${className ?? ''}`}>
			<div className='mb-1 px-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-amber-400/70'>
				<IconPinFilled size={11} />
				<span>Pinned · {items.length}</span>
			</div>
			{error && (
				<div className='px-1 py-0.5 mb-1 text-[10px] text-rose-400'>{error}</div>
			)}
			<ul className='space-y-1'>
				{items.map((p) => {
					const label =
						p.label ??
						(p.content.length > 0 ? p.content.slice(0, 60).trim() : '(empty)')
					return (
						<li key={p.id}>
							<div
								className='group/pin flex items-start gap-1 rounded px-2 py-1.5 hover:bg-amber-500/5 cursor-pointer'
								onClick={() =>
									onSelectMessage?.(p.messageId ?? null, p.conversationId ?? null)
								}
							>
								<div className='min-w-0 flex-1'>
									<div className='text-[11px] font-medium text-amber-300/90 truncate'>
										{label}
									</div>
									<div className='text-[10px] text-slate-400 line-clamp-2 mt-0.5'>
										{p.content}
									</div>
								</div>
								<button
									type='button'
									onClick={(e) => handleUnpin(e, p.id)}
									aria-label='Unpin'
									title='Unpin'
									className='opacity-0 group-hover/pin:opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition'
								>
									<IconX size={11} />
								</button>
							</div>
						</li>
					)
				})}
			</ul>
		</div>
	)
}

export default LivPinnedSidebarSection
