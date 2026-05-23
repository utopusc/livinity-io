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
 *   198-05 — ThreadList sidebar [SHIPPED]
 *   198-06 — Slash commands + suggested prompts + attachments [SHIPPED]
 *   198-07 — Empty state + DevTools + a11y wrapper [THIS PLAN]
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
import {DevToolsMount} from './devtools-mount'
import {EmptyState} from './empty-state'
import {parseSlashCommand, SLASH_COMMANDS} from './slash-commands'
import {useThreadListAdapter} from './thread-list-adapter'
import {ToolRenderers} from './tool-renderers'

/**
 * Plan 198-07 — Rich empty-state mount.
 *
 * Replaces the Plan 198-06 bare `EmptyStateSuggestedPrompts` floating-
 * pill overlay with the richer <EmptyState> from ./empty-state.tsx
 * (Liv AI logo + tagline + suggested-prompts chip row). Behaviour
 * preserved: only renders when the active thread has zero messages;
 * clicking a chip calls `useThreadRuntime().append({role:'user', ...})`
 * to inject the chip text directly as a user message and kick off the
 * agent stream in one click.
 *
 * Mounted INSIDE `<main>` ABOVE `<Thread />` with `absolute inset-0`
 * positioning so the rich empty state owns the full thread viewport
 * when no messages exist, then disappears (returns null) when the
 * thread has messages — at which point `<Thread />` paints its own
 * message list underneath. The `pointer-events-auto` wrapper ensures
 * chips remain clickable while pointer events fall through to Thread
 * once the empty state un-mounts.
 */
function EmptyStateMount() {
	const messagesCount = useThread((t) => t.messages.length)
	const threadRuntime = useThreadRuntime()
	if (messagesCount > 0) return null

	const handlePick = (text: string) => {
		threadRuntime.append({role: 'user', content: [{type: 'text', text}]})
	}

	return (
		<div className='pointer-events-auto absolute inset-0 z-10'>
			<EmptyState onPick={handlePick} />
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
			{/*
			 * Plan 198-07 — DevToolsMount renders the assistant-ui DevTools
			 * panel in dev (T-198-07-01: gated behind import.meta.env.DEV
			 * so the production bundle tree-shakes it out entirely). Mounts
			 * at the root of <Assistant /> alongside the AssistantRuntime-
			 * Provider so the panel can inspect the full runtime tree.
			 */}
			<DevToolsMount />
			{/*
			 * Plan 198-07 — a11y wrapper. `role="application"` scopes the
			 * entire Liv AI chat surface as a single interactive application
			 * for screen readers (NVDA/JAWS/VoiceOver), so keystrokes are
			 * passed through to the composer instead of being intercepted
			 * as document-navigation commands. `aria-label="Liv AI chat"`
			 * provides the spoken landmark name. (Plan 198-07 must_haves
			 * truth #5 — verified via Plan 198-08 a11y audit.)
			 */}
			<div
				role='application'
				aria-label='Liv AI chat'
				className='flex h-full overflow-hidden'
			>
				{/* Plan 198-05 — Left sidebar: ThreadList */}
				<aside
					aria-label='Conversation history'
					className='flex h-full w-64 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900'
				>
					<div className='border-b border-neutral-200 p-3 dark:border-neutral-800'>
						<button
							type='button'
							onClick={onSwitchToNewThread}
							className='w-full rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700'
							data-testid='liv-ai-new-thread'
							aria-label='Start a new conversation'
						>
							+ New conversation
						</button>
					</div>
					<ul
						className='flex-1 overflow-y-auto p-2'
						aria-label='Threads'
					>
						{items.length === 0 ? (
							<li className='p-3 text-center text-xs text-neutral-500'>
								No conversations yet
							</li>
						) : (
							items.map((t) => (
								<li
									key={t.threadId}
									className={
										'group mb-1 flex items-center justify-between rounded-md px-2 py-2 text-sm ' +
										(t.threadId === currentThreadId
											? 'bg-cyan-100 dark:bg-cyan-950'
											: 'hover:bg-neutral-100 dark:hover:bg-neutral-800')
									}
									aria-current={
										t.threadId === currentThreadId ? 'true' : undefined
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
										aria-label={`Delete thread: ${t.title}`}
									>
										×
									</button>
								</li>
							))
						)}
					</ul>
				</aside>
				{/* Plan 198-02 — Main thread area.
				 * Plan 198-06 layered in the slash-command interceptor.
				 * Plan 198-07 replaces the bare SuggestedPrompts overlay
				 * with the rich <EmptyState> mount (logo + tagline + chips).
				 * EmptyStateMount returns null when messages.length > 0,
				 * so <Thread /> below paints unobstructed once a conversation
				 * begins. The interceptor only rewrites send when the
				 * composer text parses as a registered slash command — see
				 * SLASH_COMMANDS. */}
				<main className='relative flex-1 overflow-hidden'>
					<SlashCommandInterceptor onClear={onSwitchToNewThread} />
					<EmptyStateMount />
					<Thread />
				</main>
			</div>
		</AssistantRuntimeProvider>
	)
}

export default Assistant
