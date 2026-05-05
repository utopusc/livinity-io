/**
 * LivPinButton — Phase 75-07 / CONTEXT D-17.
 *
 * Small icon button that pins the wrapped chat message to the user's
 * "Pinned Memory" via POST /api/pinned-messages. On hover (group-hover)
 * it appears with `opacity-0 group-hover:opacity-100`; on click it POSTS,
 * flips its local state to `pinned`, and switches `IconPin` to
 * `IconPinFilled`. This is purely additive surface — there is no special
 * layout coupling beyond a top-right absolute placement chosen by the
 * caller.
 *
 * JWT auth source: `localStorage[JWT_LOCAL_STORAGE_KEY]` per the P67-04
 * convention (mirrors `useLivAgentStream` + `liv-conversation-search.tsx`).
 *
 * Threat model:
 *  - T-75-07-03 (cross-user pin leak): the route validates JWT userId and
 *    PinnedMessagesRepository scopes WHERE user_id = $userId. The button
 *    only sends content the user already sees in the chat.
 *  - T-75-03-03 (prompt injection via pin content): accepted at backend
 *    (4096-char cap in getContextString); button has no input sanitisation.
 *
 * Wire-up site: chat-messages.tsx (UserMessage + AssistantMessage hover
 * surfaces). The button is opaque to the surrounding layout — caller
 * positions it via wrapper div + className.
 */
import {useState} from 'react'

import {IconPin, IconPinFilled} from '@tabler/icons-react'

import {JWT_LOCAL_STORAGE_KEY} from '@/modules/auth/shared'

export interface LivPinButtonProps {
	/** Stable id of the underlying chat message (server-side or client-side). */
	messageId: string
	/** Conversation id the message belongs to. */
	conversationId: string
	/** Snapshot of the message content at pin time. */
	content: string
	/** Optional human label; falls back to first 60 chars of content server-side. */
	label?: string
	/** Optional className appended to the wrapper button. */
	className?: string
}

export function LivPinButton({
	messageId,
	conversationId,
	content,
	label,
	className,
}: LivPinButtonProps) {
	const [pinned, setPinned] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
		e.stopPropagation()
		if (busy || pinned) return
		setBusy(true)
		setError(null)
		try {
			const jwt =
				typeof window !== 'undefined'
					? (window.localStorage.getItem(JWT_LOCAL_STORAGE_KEY) ?? '')
					: ''
			const res = await fetch('/api/pinned-messages', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${jwt}`,
				},
				body: JSON.stringify({messageId, conversationId, content, label}),
			})
			if (!res.ok) {
				throw new Error(`pin failed: ${res.status}`)
			}
			setPinned(true)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			setError(msg)
			// Auto-clear error tooltip after 2s so the icon settles back to
			// the unpinned state and a future click can retry.
			setTimeout(() => setError(null), 2000)
		} finally {
			setBusy(false)
		}
	}

	const Icon = pinned ? IconPinFilled : IconPin
	const title = error
		? `Pin failed: ${error}`
		: pinned
			? 'Pinned to memory'
			: 'Pin to memory'

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={busy}
			aria-label={title}
			title={title}
			data-pinned={pinned ? 'true' : 'false'}
			className={`p-1 rounded text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10 transition-colors ${
				className ?? ''
			}`}
		>
			<Icon size={14} />
		</button>
	)
}

export default LivPinButton
