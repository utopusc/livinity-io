/**
 * Phase 198-02 — Liv AI chat surface via assistant-ui.
 *
 * Wraps the Thread primitive with AssistantRuntimeProvider configured
 * to talk to livinityd's /chat/livAi Express route (Plan 198-01 ships
 * the backend). AssistantChatTransport handles all AI-SDK message
 * stream chunk-to-UI mapping automatically.
 *
 * Plan 198-05 extension — 2-column layout:
 *   - LEFT  (w-64) — ThreadList sidebar (New conversation button +
 *                    clickable thread items + per-row delete affordance)
 *                    wired via useThreadListAdapter() against the
 *                    existing P197-05 mastra.agent.threads.* tRPC
 *                    procedures.
 *   - RIGHT (flex-1) — Existing Thread primitive (unchanged) hosting
 *                      the assistant-ui message stream.
 *
 * The currentThreadId from the adapter is threaded into the transport
 * body so every /chat/livAi request carries the right thread scope —
 * Mastra Memory (P197-03 PostgresStore) automatically loads + persists
 * messages per threadId, so switching threads in the sidebar restores
 * history on the next message (or on initial agent.stream() resolve).
 *
 * Plans 198-03..07 layer on:
 *   198-03 — tool renderers (Generative UI for tool calls) [SHIPPED]
 *   198-04 — HITL Approval Card inline [SHIPPED]
 *   198-05 — ThreadList sidebar [THIS PLAN]
 *   198-06 — Slash commands + suggested prompts + attachments
 *   198-07 — Empty state + theming + DevTools
 */

import {
	AssistantRuntimeProvider,
	useComposerRuntime,
	useThread,
	useThreadRuntime,
} from '@assistant-ui/react'
import {
	AssistantChatTransport,
	useChatRuntime,
} from '@assistant-ui/react-ai-sdk'
import {useEffect, useRef} from 'react'

import {Thread} from '@/components/assistant-ui/thread'

import {createImageAttachmentAdapter} from './attachment-adapter'
import {parseSlashCommand, SLASH_COMMANDS} from './slash-commands'
import {SuggestedPrompts} from './suggested-prompts'
import {useThreadListAdapter} from './thread-list-adapter'
import {ToolRenderers} from './tool-renderers'

/**
 * Plan 198-06 — Empty-state suggested-prompt overlay.
 *
 * Rendered inside the AssistantRuntimeProvider so it can call
 * `useThread()` to read the message count (chips visible only when the
 * active thread is empty) and `useThreadRuntime().append(text)` to
 * inject the chip text directly as a user message, kicking off the
 * agent stream in one click.
 *
 * Mounted inside `<main>` ABOVE `<Thread />` with absolute positioning
 * so the chips float over the empty Thread.Viewport without leaking
 * layout space when the thread has messages.
 */
function EmptyStateSuggestedPrompts() {
	const messagesCount = useThread((t) => t.messages.length)
	const threadRuntime = useThreadRuntime()
	const hidden = messagesCount > 0

	const handlePick = (text: string) => {
		threadRuntime.append({role: 'user', content: [{type: 'text', text}]})
	}

	return (
		<div
			className='pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center'
			data-testid='liv-ai-empty-state'
		>
			<div className='pointer-events-auto'>
				<SuggestedPrompts onPick={handlePick} hidden={hidden} />
			</div>
		</div>
	)
}

/**
 * Plan 198-06 — Slash-command interceptor.
 *
 * Once the AssistantRuntimeProvider is mounted, this inner component
 * wraps `composerRuntime.send()` with a parse step that:
 *
 *   - On `/clear` → resets composer text + triggers onSwitchToNewThread
 *     and does NOT forward to the real send (so the agent isn't asked
 *     to "process" the literal "/clear" string).
 *   - On any other registered slash command → replaces composer text
 *     with the command's `transformedText` (e.g. `/help` →
 *     "What can you do? List the tools…") then forwards to the real
 *     send so the agent sees the clean natural-language prompt.
 *   - On non-slash text → forwards to the real send unmodified.
 *
 * The wrapper is installed once per composer-runtime instance (guarded
 * by `installedRef`) so React strict-mode double-mount doesn't double-
 * wrap. Plan 198-06 must_haves: SLASH_COMMANDS is the source of truth
 * for the 4 registered triggers; parseSlashCommand is the parser.
 */
function SlashCommandInterceptor({
	onClear,
}: {
	onClear: () => void
}) {
	const composerRuntime = useComposerRuntime()
	const installedRef = useRef(false)

	useEffect(() => {
		if (installedRef.current) return
		installedRef.current = true

		const originalSend = composerRuntime.send.bind(composerRuntime)
		composerRuntime.send = ((opts) => {
			const state = composerRuntime.getState()
			const parsed = parseSlashCommand(state.text)
			if (!parsed) {
				// Not a slash command — preserve default behavior.
				return originalSend(opts)
			}
			if (parsed.transformedText === null) {
				// /clear (or any future "no-send" slash command) — reset
				// composer text + invoke the UI-level action. Skip the
				// underlying send so the agent never sees the literal slash.
				void composerRuntime.reset()
				onClear()
				return
			}
			// Other slash commands — rewrite the composer text to the
			// transformed prompt, then send normally so the agent receives
			// the clean natural-language version.
			composerRuntime.setText(parsed.transformedText)
			return originalSend(opts)
		}) as typeof composerRuntime.send

		return () => {
			// Restore original send on unmount so re-mounting doesn't stack
			// wrappers. (Reusing originalSend is safe because we captured it
			// via .bind() above.)
			composerRuntime.send = originalSend as typeof composerRuntime.send
			installedRef.current = false
		}
	}, [composerRuntime, onClear])

	return null
}

export function Assistant() {
	const {
		threads,
		currentThreadId,
		onSwitchToNewThread,
		onSwitchToThread,
		onDelete,
	} = useThreadListAdapter()

	const runtime = useChatRuntime({
		transport: new AssistantChatTransport({
			// Caddy reverse-proxy on Mini PC forwards /chat/* to livinityd:8080
			// unchanged. In local dev (vite proxy at :3000 → :8080), the same
			// path works (Plan 198-01 mounted POST /chat/:agentId on the
			// livinityd Express app behind an inline JWT auth gate).
			api: '/chat/livAi',
			// Send the existing LIVINITY_SESSION JWT cookie so the inline
			// chatAuthGate (Plan 198-01) authenticates the request the same
			// way as the rest of the UI's tRPC traffic.
			credentials: 'include',
			// Plan 198-05 — per-thread Memory scoping. AssistantChatTransport
			// merges this `body` into every POST /chat/livAi request body,
			// so the backend agent.stream() call receives the currently
			// selected threadId and Mastra Memory picks the matching thread
			// out of PostgresStore.
			body: {threadId: currentThreadId},
		}),
		// Plan 198-06 — image-only attachment adapter. Composer Attachment
		// surface accepts image/png|jpeg|webp|gif drag-drop or click; the
		// adapter base64-encodes and surfaces the bytes in the AI-SDK
		// message stream as multimodal content. xAI/Grok handles vision
		// natively, so livinityd's chatRoute (Plan 198-01) forwards the
		// message stream unchanged. PDF / audio deferred to Phase 199.
		adapters: {
			attachments: createImageAttachmentAdapter(),
		},
	})

	const items = threads()

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			{/*
			 * Plan 198-03 — Generative UI tool renderers. Each child is the
			 * return value of `makeAssistantToolUI({toolName, render})` which
			 * registers a per-tool renderer in the runtime's tool registry
			 * via useAssistantToolUI (effect-only; renders null). Must mount
			 * BEFORE <Thread /> so registrations are present when the first
			 * tool-call message part is rendered.
			 *
			 * Plan 198-04 — 6 ApprovalCardToolUI HITL renderers extend the
			 * same barrel for destructive Luse MCP tools.
			 */}
			<ToolRenderers />
			<div className='flex h-full overflow-hidden'>
				{/* Plan 198-05 — Left sidebar: ThreadList */}
				<aside className='flex h-full w-64 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'>
					<div className='border-b border-neutral-200 p-3 dark:border-neutral-800'>
						<button
							type='button'
							onClick={onSwitchToNewThread}
							className='w-full rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700'
							data-testid='liv-ai-new-thread'
						>
							+ New conversation
						</button>
					</div>
					<div className='flex-1 overflow-y-auto p-2'>
						{items.length === 0 ? (
							<p className='p-3 text-center text-xs text-neutral-500'>
								No conversations yet
							</p>
						) : (
							items.map((t) => (
								<div
									key={t.threadId}
									className={
										'group mb-1 flex items-center justify-between rounded-md px-2 py-2 text-sm ' +
										(t.threadId === currentThreadId
											? 'bg-cyan-100 dark:bg-cyan-950'
											: 'hover:bg-neutral-100 dark:hover:bg-neutral-800')
									}
									data-testid={`liv-ai-thread-item-${t.threadId}`}
								>
									<button
										type='button'
										onClick={() => onSwitchToThread(t.threadId)}
										className='flex-1 truncate text-left'
									>
										{t.title}
									</button>
									<button
										type='button'
										onClick={() => {
											void onDelete(t.threadId)
										}}
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
				{/* Plan 198-02 — Main thread area; Plan 198-06 layers in
				    the empty-state SuggestedPrompts overlay + the slash-
				    command interceptor. Both are no-op when not applicable
				    (overlay returns null when messages.length > 0; the
				    interceptor only rewrites send when the composer text
				    parses as a registered slash command — see SLASH_COMMANDS). */}
				<main className='relative flex-1 overflow-hidden'>
					<SlashCommandInterceptor onClear={onSwitchToNewThread} />
					<EmptyStateSuggestedPrompts />
					<Thread />
				</main>
			</div>
		</AssistantRuntimeProvider>
	)
}

export default Assistant
