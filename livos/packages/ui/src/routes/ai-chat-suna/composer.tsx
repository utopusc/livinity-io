// v32-redo Stage 2b — shared composer used by both the dashboard hero
// (first-send creates a conversation) and the thread view (follow-up
// sends inside an existing conversation).
//
// Send flow split:
//
//   1. New conversation (no selected id):
//      a. POST conversations.create({title: derived from task}).
//      b. POST conversations.appendMessage({role: 'user', content: task}).
//      c. selectConversation(newId) — layout swaps to thread view.
//      d. sendMessage(task) on the SSE hook (uses the new id as
//         `conversationId` in the Zustand store slice key, so the thread
//         view can subscribe to live messages by the same key).
//      e. When status reaches 'complete', the parent thread view persists
//         the assistant message via conversations.appendMessage.
//
//   2. Existing conversation:
//      a. POST conversations.appendMessage({role: 'user', content: task}).
//      b. sendMessage(task) on the SSE hook.
//      c. Same complete-handler runs in thread view.
//
// Keyboard:
//   - Enter (no shift) / Cmd+Enter → submit
//   - Shift+Enter → newline
//   - Esc → blur (no destructive action)
//
// Auto-grow:
//   The textarea grows from min 60px to a soft max of ~200px (overflow
//   scrolls inside). Implemented manually rather than using a third-party
//   autogrow lib (D-NO-NEW-DEPS).

import {useCallback, useEffect, useRef, useState} from 'react'
import {ArrowUp, Loader2, Paperclip, Mic, Square} from 'lucide-react'
import {toast} from 'sonner'

import {trpcReact} from '@/trpc/trpc'
import {useLivAgentStream} from '@/lib/use-liv-agent-stream'

import {Button} from './ui/button'
import {useChatRouter} from './lib/chat-router'

const MAX_TITLE_LEN = 120
const TEXTAREA_MIN_PX = 60
const TEXTAREA_MAX_PX = 200

/**
 * Derive a short title from the first user message. Falls back to a
 * generic placeholder when the task is whitespace-only (defensive — the
 * caller already trims).
 */
function deriveTitle(task: string): string {
	const trimmed = task.trim().replace(/\s+/g, ' ')
	if (!trimmed) return 'New conversation'
	if (trimmed.length <= MAX_TITLE_LEN) return trimmed
	return trimmed.slice(0, MAX_TITLE_LEN - 1).trimEnd() + '…'
}

interface ComposerProps {
	/**
	 * When set, follow-up sends append to this conversation. When null, the
	 * first send creates a new conversation.
	 */
	conversationId: string | null
	placeholder?: string
	/** Visible above the composer in the dashboard (compact: false). */
	compact?: boolean
}

export function Composer({
	conversationId,
	placeholder = 'Describe what you need help with…',
	compact = false,
}: ComposerProps) {
	const [value, setValue] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)
	const textareaRef = useRef<HTMLTextAreaElement | null>(null)
	const utils = trpcReact.useUtils()
	const {selectConversation} = useChatRouter()

	// The SSE hook is keyed by conversationId. For the "no conversation yet"
	// state we still need a stable key so the hook works — but we MUST switch
	// to the real id once it exists. Pre-create the hook against either the
	// real id (existing convo) OR an ephemeral 'new' bucket; once the bucket
	// receives a real id we navigate via selectConversation and the parent
	// thread view re-mounts with the real conversationId.
	const streamKey = conversationId ?? 'new'
	const {sendMessage, status, stop} = useLivAgentStream({conversationId: streamKey})

	const createConversation = trpcReact.conversations.create.useMutation()
	const appendMessage = trpcReact.conversations.appendMessage.useMutation()

	const isStreaming = status === 'starting' || status === 'running' || status === 'reconnecting'

	const autoGrow = useCallback(() => {
		const el = textareaRef.current
		if (!el) return
		el.style.height = 'auto'
		const next = Math.min(Math.max(el.scrollHeight, TEXTAREA_MIN_PX), TEXTAREA_MAX_PX)
		el.style.height = `${next}px`
		el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_PX ? 'auto' : 'hidden'
	}, [])

	useEffect(() => {
		autoGrow()
	}, [value, autoGrow])

	const submit = useCallback(async () => {
		const task = value.trim()
		if (!task || isSubmitting || isStreaming) return
		setIsSubmitting(true)
		try {
			let activeConvId = conversationId

			if (!activeConvId) {
				// First send: create the conversation row, then bring the
				// thread view up before kicking off the stream so the user
				// sees their message immediately in place.
				const created = await createConversation.mutateAsync({
					title: deriveTitle(task),
				})
				activeConvId = created.id
				selectConversation(activeConvId)
			}

			// Persist the user turn BEFORE starting the agent so a
			// page refresh mid-stream still shows the question in history.
			// Fire-and-await: appendMessage is fast (single insert + upsert).
			await appendMessage.mutateAsync({
				conversationId: activeConvId,
				role: 'user',
				content: task,
			})

			// Refresh sidebar so the new/updated conversation jumps to top.
			await utils.conversations.list.invalidate()
			// Refresh thread message list so the persisted user turn renders
			// even before the live stream produces anything.
			await utils.conversations.listMessages.invalidate({
				conversationId: activeConvId,
			})

			// Kick the SSE stream. The hook keyed on streamKey will see the
			// user message via its own appendUserMessage path AND the SSE
			// chunks for the assistant turn. When the parent component
			// re-renders with the real conversationId (post-selectConversation),
			// the stream slice keyed by 'new' is abandoned — we only do this
			// before the swap; afterwards subsequent sends use the real key.
			await sendMessage(task)

			setValue('')
			// Reset the textarea height so the next message starts compact.
			if (textareaRef.current) {
				textareaRef.current.style.height = `${TEXTAREA_MIN_PX}px`
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Send failed'
			toast.error(msg)
		} finally {
			setIsSubmitting(false)
		}
	}, [
		appendMessage,
		conversationId,
		createConversation,
		isStreaming,
		isSubmitting,
		selectConversation,
		sendMessage,
		utils,
		value,
	])

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			// Cmd/Ctrl+Enter or plain Enter — submit
			e.preventDefault()
			void submit()
			return
		}
		if (e.key === 'Escape') {
			textareaRef.current?.blur()
		}
	}

	const showStop = isStreaming
	const submitDisabled = !value.trim() || isSubmitting || isStreaming

	return (
		<div
			className={`relative flex flex-col rounded-xl border border-input bg-background shadow-sm ${
				compact ? '' : ''
			}`}
		>
			<textarea
				ref={textareaRef}
				className="w-full resize-none bg-transparent px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
				style={{minHeight: `${TEXTAREA_MIN_PX}px`, maxHeight: `${TEXTAREA_MAX_PX}px`}}
				placeholder={placeholder}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				rows={1}
				disabled={isSubmitting && !conversationId}
				aria-label="Message"
			/>
			<div className="flex items-center justify-between px-3 py-2">
				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						type="button"
						disabled
						title="Attachments come in a later stage"
					>
						<Paperclip className="h-4 w-4" />
						<span className="sr-only">Attach file</span>
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						type="button"
						disabled
						title="Voice input comes in a later stage"
					>
						<Mic className="h-4 w-4" />
						<span className="sr-only">Voice input</span>
					</Button>
				</div>
				{showStop ? (
					<Button
						size="icon"
						variant="secondary"
						className="h-8 w-8"
						type="button"
						onClick={() => void stop()}
						aria-label="Stop generation"
					>
						<Square className="h-4 w-4" />
					</Button>
				) : (
					<Button
						size="icon"
						className="h-8 w-8"
						type="button"
						disabled={submitDisabled}
						onClick={() => void submit()}
						aria-label="Send"
					>
						{isSubmitting ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<ArrowUp className="h-4 w-4" />
						)}
					</Button>
				)}
			</div>
		</div>
	)
}
