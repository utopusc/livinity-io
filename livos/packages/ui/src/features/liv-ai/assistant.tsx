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
 *   - RIGHT (flex-1) — Existing Thread primitive (Phase 199-05 rebuilt
 *                      into AuiIf-branched centered-empty vs
 *                      sticky-footer chat layout — see <main> below)
 *                      hosting the assistant-ui message stream.
 *
 * The currentThreadId from the adapter is threaded into the transport
 * body so every /chat/livAi request carries the right thread scope —
 * Mastra Memory (P197-03 PostgresStore) automatically loads + persists
 * messages per threadId, so switching threads in the sidebar restores
 * history on the next message (or on initial agent.stream() resolve).
 *
 * Phase 199-05 rebuild — centered empty-state composer:
 *   - DELETED Phase 198-07 `EmptyStateMount` absolute-positioned overlay
 *     (D-199-28; RESEARCH Pitfall 5). The overlay fought the Thread
 *     layout — it absolutely-positioned the empty-state on top of a
 *     Thread that pinned the composer at the bottom, so the composer
 *     stayed sticky-footer even when no messages existed.
 *   - REPLACED with canonical assistant-ui `<AuiIf condition={(s) =>
 *     s.thread.isEmpty}>` empty-state branch + matching
 *     `!s.thread.isEmpty` chat branch (D-199-17; RESEARCH B1 + Pattern
 *     2 — the Grok / ChatGPT pattern operator asked for).
 *   - Single shared `<LivAiComposer
											selectedModel={selectedModel}
											onModelChange={handleModelChange}
										/>` from ./composer mounted in BOTH
 *     branches (D-199-18; RESEARCH Pitfall 7). The assistant-ui runtime
 *     preserves ComposerPrimitive text/focus across the empty→chat
 *     layout flip — typing in the centered hero does NOT lose
 *     characters when the first send relocates the composer to the
 *     sticky footer.
 *   - Empty-state hero (logo + heading + tagline + SuggestedPrompts +
 *     centered Composer) rendered INLINE inside the AuiIf branch so the
 *     layout is natural flex-column flow (no absolute positioning).
 *     `data-testid='liv-ai-empty-state'` preserved on the outer
 *     centered div (INV-199-08 + D-199-29).
 *   - Logo tightened from h-20/w-20 → h-16/w-16 for the centered layout
 *     (D-199-25).
 *
 * Plans 198-03..07 layer on:
 *   198-03 — tool renderers (Generative UI for tool calls) [SHIPPED]
 *   198-04 — HITL Approval Card inline [SHIPPED]
 *   198-05 — ThreadList sidebar [SHIPPED]
 *   198-06 — Slash commands + suggested prompts + attachments [SHIPPED]
 *   198-07 — Empty state + DevTools + a11y wrapper [SHIPPED — empty-state
 *            rebuilt by Plan 199-05; DevTools + a11y wrapper preserved]
 *
 * Plan 199-07 will mount the header bar (Liv AI title + LivAiModelPicker
 * + "+ New conversation" quick action) ABOVE this 2-column layout. The
 * transport `body` is already a callback so Plan 199-07 can extend it
 * with `config.modelName` from the picker without touching this file.
 */

import {
	AssistantRuntimeProvider,
	AuiIf,
	ComposerPrimitive,
	MessagePrimitive,
	ThreadPrimitive,
	useThreadRuntime,
} from '@assistant-ui/react'
import {
	AssistantChatTransport,
	useChatRuntime,
} from '@assistant-ui/react-ai-sdk'
import {useEffect, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

import {createImageAttachmentAdapter} from './attachment-adapter'
import {LivAiComposer} from './composer'
import {DevToolsMount} from './devtools-mount'
import {LIV_AI_TAGLINE} from './empty-state'
import {DEFAULT_LIV_AI_MODEL_ID, type LivAiModelId} from './models'
import {SuggestedPrompts} from './suggested-prompts'
import {useThreadListAdapter} from './thread-list-adapter'
import {ToolRenderers} from './tool-renderers'

/**
 * Minimal MessagePrimitive renderers for the chat-branch viewport.
 * Mirrors the shape Phase 198-02 ships in components/assistant-ui/thread.tsx
 * — we re-declare them here so Plan 199-05 can switch the live render
 * surface to ThreadPrimitive.Root inline without depending on the legacy
 * <Thread /> wrapper (which still mounts a hand-rolled
 * ThreadPrimitive.Empty + ViewportFooter shape that we no longer want).
 */
function UserMessage() {
	return (
		<MessagePrimitive.Root data-role='user' className='flex justify-end px-2'>
			<div className='rounded-2xl bg-muted px-4 py-2 text-foreground'>
				<MessagePrimitive.Content />
			</div>
		</MessagePrimitive.Root>
	)
}

function AssistantMessage() {
	return (
		<MessagePrimitive.Root
			data-role='assistant'
			className='relative px-2 leading-relaxed text-foreground'
		>
			<MessagePrimitive.Content />
		</MessagePrimitive.Root>
	)
}

/**
 * Phase 199-05 — Centered empty-state hero (replaces Phase 198-07
 * EmptyStateMount overlay; D-199-28). Lives INSIDE AssistantRuntime-
 * Provider so `useThreadRuntime().append()` resolves a valid runtime
 * when a SuggestedPrompts chip is picked.
 *
 * The outer container preserves `data-testid='liv-ai-empty-state'`
 * per INV-199-08 + D-199-29 (regression-locked by the existing
 * empty-state vitest + the new assistant.test.tsx Test 1).
 */
interface EmptyStateBranchProps {
	selectedModel: LivAiModelId
	onModelChange: (next: LivAiModelId) => void
}

function EmptyStateBranch({selectedModel, onModelChange}: EmptyStateBranchProps) {
	const threadRuntime = useThreadRuntime()
	const handlePickPrompt = (text: string) => {
		threadRuntime.append({role: 'user', content: [{type: 'text', text}]})
	}
	return (
		<div
			className='flex h-full flex-col items-center justify-center gap-4 p-8 text-center'
			data-testid='liv-ai-empty-state'
		>
			<img
				src='/figma-exports/liv-ai.svg'
				alt='Liv AI'
				className='h-16 w-16'
			/>
			<h2 className='text-2xl font-semibold text-neutral-900 dark:text-neutral-100'>
				Liv AI
			</h2>
			<p className='max-w-md text-sm text-neutral-600 dark:text-neutral-400'>
				{LIV_AI_TAGLINE}
			</p>
			<div className='w-full max-w-3xl'>
				<LivAiComposer
					selectedModel={selectedModel}
					onModelChange={onModelChange}
				/>
			</div>
			<SuggestedPrompts onPick={handlePickPrompt} />
		</div>
	)
}

export function Assistant() {
	const {
		threads,
		currentThreadId,
		onSwitchToNewThread,
		onSwitchToThread,
		onDelete,
	} = useThreadListAdapter()

	// Phase 199-07 — selectedModel state + Redis hydration.
	//
	// Initial value: DEFAULT_LIV_AI_MODEL_ID (Grok 4.20, D-199-07) so the
	// header bar paints with a sensible default during the first React render
	// before the getActiveModel useQuery resolves.
	//
	// Hydration: useEffect listens to `activeModelQuery.data?.modelName` and
	// pushes it into `selectedModel` state when the query resolves with a
	// non-empty value. Backend `coerceModel()` guarantees this value is one of
	// the 4 allow-listed ids, so the cast to LivAiModelId is sound (T-199-02-01
	// + T-199-02-02 mitigation lives backend-side per D-199-24).
	//
	// onChange: handleModelChange fires the setActiveModel mutation which
	// writes `liv:config:active_model` in Redis (D-199-10). Optimistic update —
	// local state flips immediately so the header bar reflects the choice
	// without waiting for the round trip; onSuccess refetches the query for
	// ground-truth re-hydration (defense against concurrent operator updates,
	// T-199-07-05).
	const [selectedModel, setSelectedModel] = useState<LivAiModelId>(
		DEFAULT_LIV_AI_MODEL_ID,
	)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const trpcAny = trpcReact as any
	const activeModelQuery = trpcAny.mastra?.agent?.getActiveModel?.useQuery?.()
	useEffect(() => {
		const next = activeModelQuery?.data?.modelName as
			| LivAiModelId
			| undefined
		if (next) {
			setSelectedModel(next)
		}
	}, [activeModelQuery?.data?.modelName])
	const setActiveModelMutation = trpcAny.mastra?.agent?.setActiveModel?.useMutation?.({
		onSuccess: () => activeModelQuery?.refetch?.(),
	})
	const handleModelChange = (next: LivAiModelId) => {
		setSelectedModel(next)
		setActiveModelMutation?.mutate?.({modelName: next})
	}

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
			// Phase 199-05 — body switched from static object → callback form
			// (RESEARCH B6). The function closure captures `currentThreadId`
			// fresh per request so thread switches in the sidebar always
			// thread the right Memory scope into livinityd.
			//
			// Phase 199-07 — extended with `config: {modelName: selectedModel}`
			// (D-199-09). The backend chat-route (Plan 199-03) reads
			// `config.modelName` and builds a RequestContext that the agent's
			// dynamic-model resolver (provider-router.resolveAgentModel) consumes
			// per request. Allows mid-conversation model switching (UAT step 9).
			body: () => ({threadId: currentThreadId, config: {modelName: selectedModel}}),
		}),
		// Plan 198-06 — image-only attachment adapter. Composer Attachment
		// surface accepts image/png|jpeg|webp|gif drag-drop or click; the
		// adapter base64-encodes and surfaces the bytes in the AI-SDK
		// message stream as multimodal content. xAI/Grok handles vision
		// natively, so livinityd's chatRoute (Plan 198-01) forwards the
		// message stream unchanged. PDF / audio deferred to Phase 200+.
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
			 * BEFORE <ThreadPrimitive.Root /> so registrations are present
			 * when the first tool-call message part is rendered.
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
			 * Phase 200-05 — DELETED the Phase 199-07 <LivAiHeaderBar> shell
			 * (D-200-15 / Plan 200-05 Task 3). The model picker has been
			 * relocated INTO <LivAiComposer> (Grok footer-strip pattern;
			 * D-200-13), and the "+ New conversation" button already lives in
			 * the sidebar (assistant.tsx <aside> below). Pitfall 6 (two model
			 * pickers in DOM) is now structurally impossible.
			 *
			 * The outer flex-column wrapper is preserved so the 2-column
			 * application landmark below still has a bounded parent. Plan
			 * 200-06 will swap the inline ThreadPrimitive.Root composition to
			 * the canonical <Thread composerSlot={<LivAiComposer .../>} />.
			 */}
			<div className='flex h-full flex-col overflow-hidden'>
				{/*
				 * Plan 198-07 — a11y wrapper. `role="application"` scopes the
				 * entire Liv AI chat surface as a single interactive application
				 * for screen readers (NVDA/JAWS/VoiceOver), so keystrokes are
				 * passed through to the composer instead of being intercepted
				 * as document-navigation commands. `aria-label="Liv AI chat"`
				 * provides the spoken landmark name. (Plan 198-07 must_haves
				 * truth #5 — verified via Plan 198-08 a11y audit.)
				 *
				 * Phase 199-07 — wrapped inside an outer flex-column with the
				 * new header bar above; this div retains its 2-column shape but
				 * the outer flex-1 lets it consume remaining vertical space
				 * below the header.
				 */}
				<div
					role='application'
					aria-label='Liv AI chat'
					className='flex flex-1 overflow-hidden'
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
				 * Plan 199-05 — REBUILT: ThreadPrimitive.Root hosts two
				 * AuiIf branches. Empty branch renders a vertically-
				 * centered hero (logo + 'Liv AI' + tagline + Composer +
				 * SuggestedPrompts). Non-empty branch renders the chat
				 * viewport with ThreadPrimitive.Messages + sticky-footer
				 * Composer. The SAME <Composer /> from ./composer mounts
				 * in BOTH branches (D-199-18) so runtime preserves text/
				 * focus across the empty→chat transition.
				 *
				 * The Phase 198-07 EmptyStateMount overlay is DELETED
				 * (D-199-28; RESEARCH Pitfall 5) — overlay layout fought
				 * the bottom-sticky composer; AuiIf-branched layout is
				 * the canonical Grok / ChatGPT pattern (RESEARCH B1). */}
				<main className='relative flex-1 overflow-hidden'>
					<ThreadPrimitive.Root className='flex h-full flex-col bg-background'>
						{/*
						 * Phase 200-04 — DELETED the Phase 198-06 imperative
						 * slash-command runtime interceptor (the
						 * composerRuntime monkey-patch). Slash command UX is
						 * now owned by the canonical
						 * unstable_useSlashCommandAdapter adapter
						 * (slash-adapter.ts) mounted inside the new
						 * LivAiComposer via ComposerTriggerPopover char="/"
						 * (Plan 200-05). All 4 Phase 198-06 SLASH_COMMANDS
						 * ids — help, clear, screenshot, search — preserved
						 * (INV-200-06).
						 */}
						<AuiIf condition={(s) => s.thread.isEmpty}>
							<EmptyStateBranch
									selectedModel={selectedModel}
									onModelChange={handleModelChange}
								/>
						</AuiIf>

						<AuiIf condition={(s) => !s.thread.isEmpty}>
							<ThreadPrimitive.Viewport className='relative flex flex-1 flex-col overflow-y-auto px-4 pt-4'>
								<div className='mx-auto flex w-full max-w-3xl flex-1 flex-col'>
									<ThreadPrimitive.Messages
										components={{
											UserMessage,
											AssistantMessage,
										}}
									/>
									<ThreadPrimitive.ViewportFooter className='sticky bottom-0 mt-auto flex flex-col gap-4 bg-background pb-4'>
										<LivAiComposer
											selectedModel={selectedModel}
											onModelChange={handleModelChange}
										/>
									</ThreadPrimitive.ViewportFooter>
								</div>
							</ThreadPrimitive.Viewport>
						</AuiIf>
					</ThreadPrimitive.Root>
				</main>
				</div>
				{/* /role='application' (Phase 199-07 nested under header-bar shell) */}
			</div>
			{/* /flex h-full flex-col — Phase 199-07 header-bar shell */}
		</AssistantRuntimeProvider>
	)
}

export default Assistant
