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
 *   - RIGHT (flex-1) — Canonical assistant-ui <Thread /> (Phase 200-02
 *                      registry port) with a `composerSlot` (D-200-16)
 *                      that injects <LivAiComposer /> from ./composer
 *                      (Plan 200-05 Grok-pattern composer with the
 *                      relocated model picker in the footer-strip).
 *
 * The currentThreadId from the adapter is threaded into the transport
 * body so every /chat/livAi request carries the right thread scope —
 * Mastra Memory (P197-03 PostgresStore) automatically loads + persists
 * messages per threadId, so switching threads in the sidebar restores
 * history on the next message (or on initial agent.stream() resolve).
 *
 * Phase 200-06 rebuild — registry-canonical Thread mount (D-200-16):
 *   - DELETED Phase 199-05 inline `<ThreadPrimitive.Root>` + dual `<AuiIf>`
 *     empty/chat branches and the local UserMessage / AssistantMessage
 *     renderers. The canonical <Thread /> (livos/packages/ui/src/
 *     components/assistant-ui/thread.tsx — verbatim r.assistant-ui.com/
 *     thread.json port) owns the entire surface now: ThreadWelcome with
 *     canonical heading + the D-200-18 English Liv AI subtitle, the full
 *     MessagePrimitive.GroupedParts render pipeline (text / reasoning /
 *     tool-call routed through part.toolUI — Phase 198 generative-UI
 *     renderers stay FROZEN per INV-200-03), AssistantActionBar with
 *     ActionBarPrimitive.Copy / Reload / ExportMarkdown, BranchPicker,
 *     EditComposer, AttachmentDropzone, ThreadScrollToBottom, etc.
 *   - REPLACED with a single `<Thread composerSlot={<LivAiComposer
 *     selectedModel={...} onModelChange={...} />} />` mount (the one
 *     intentional delta from upstream registry, per D-200-16 — already
 *     wired in Plan 200-02 as `ThreadProps = { composerSlot?: ReactNode }`).
 *   - DELETED EmptyStateBranch (Phase 199-05) — the canonical
 *     ThreadWelcome in thread.tsx (with the Phase 200-06 subtitle delta)
 *     is the registry-canonical empty-state surface. The Phase 198-06
 *     SuggestedPrompts catalog is preserved as `ThreadPrimitive.Suggestions`
 *     children registered via the runtime adapter (deferred to a follow-up
 *     wire — registry Thread renders 0 suggestion chips today when the
 *     runtime ships no Suggestion entries; canonical ThreadWelcome heading
 *     + Liv AI subtitle remain visible).
 *   - DELETED the (vestigial Phase 199-05) inline UserMessage /
 *     AssistantMessage renderers + the unused MessagePrimitive,
 *     ComposerPrimitive, AuiIf, useThreadRuntime, ThreadPrimitive,
 *     LIV_AI_TAGLINE, SuggestedPrompts imports — they all live INSIDE the
 *     canonical Thread now.
 *
 * Plan 199-07 model-picker state + transport body callback wiring is
 * preserved verbatim: `selectedModel` / `handleModelChange` are passed
 * down into LivAiComposer via the `composerSlot` prop; the
 * AssistantChatTransport `body` callback still emits
 * `{threadId, config: {modelName: selectedModel}}` per request.
 *
 * Plans 198-03..07 layer on:
 *   198-03 — tool renderers (Generative UI for tool calls) [SHIPPED]
 *   198-04 — HITL Approval Card inline [SHIPPED]
 *   198-05 — ThreadList sidebar [SHIPPED]
 *   198-06 — Slash commands + suggested prompts + attachments [SHIPPED]
 *   198-07 — Empty state + DevTools + a11y wrapper [SHIPPED — empty-state
 *            rebuilt by Plan 199-05 → finalized by Plan 200-06 to the
 *            canonical ThreadWelcome; DevTools + a11y wrapper preserved]
 */

import {
	AssistantRuntimeProvider,
} from '@assistant-ui/react'
import {
	AssistantChatTransport,
	useChatRuntime,
} from '@assistant-ui/react-ai-sdk'
import {useEffect, useRef, useState} from 'react'

import {Thread} from '@/components/assistant-ui/thread'
import {trpcReact} from '@/trpc/trpc'

import {createImageAttachmentAdapter} from './attachment-adapter'
import {LivAiComposer} from './composer'
import {DevToolsMount} from './devtools-mount'
import {DEFAULT_LIV_AI_MODEL_ID, type LivAiModelId} from './models'
import {useThreadListAdapter} from './thread-list-adapter'
import {ToolRenderers} from './tool-renderers'

export function Assistant() {
	// Phase 200-07 — the `useThreadListAdapter()` hook call moved INSIDE
	// the <AssistantRuntimeProvider> render boundary (see <AssistantShell>
	// below). That's required because Plan 200-07 wires
	// `useAssistantRuntime()` at the top of the adapter hook so the New
	// Conversation button can call `runtime.threads.switchToNewThread()`
	// (D-200-19) — and `useAssistantRuntime()` only resolves from a
	// descendant of the provider.
	//
	// The body callback in `useChatRuntime` (still owned by the outer
	// Assistant component) reads the current threadId via a ref kept in
	// lockstep with the adapter's internal state by an effect inside the
	// shell. This is the minimal restructure permitted by the Plan 200-07
	// Task 2 pitfall guard ("if the consumer is OUTSIDE the provider,
	// MOVE the sidebar mount inside the provider").
	const currentThreadIdRef = useRef<string>('')

	// Phase 199-07 — selectedModel state + Redis hydration.
	//
	// Initial value: DEFAULT_LIV_AI_MODEL_ID (Grok 4.20, D-199-07) so the
	// composer paints with a sensible default during the first React render
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
	// local state flips immediately so the composer model-picker reflects the
	// choice without waiting for the round trip; onSuccess refetches the query
	// for ground-truth re-hydration (defense against concurrent operator
	// updates, T-199-07-05).
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
			//
			// Phase 200-07 — `currentThreadId` now flows via
			// `currentThreadIdRef` (kept in sync by `<AssistantShell>` so the
			// adapter hook can live inside the provider; see file header).
			// The closure reads `.current` per request so the latest threadId
			// is always picked up — same semantics as the prior direct
			// closure-capture pattern (Plan 199-05 RESEARCH B6 rationale).
			body: () => ({
				threadId: currentThreadIdRef.current,
				config: {modelName: selectedModel},
			}),
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

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			{/*
			 * Plan 198-03 — Generative UI tool renderers. Each child is the
			 * return value of `makeAssistantToolUI({toolName, render})` which
			 * registers a per-tool renderer in the runtime's tool registry
			 * via useAssistantToolUI (effect-only; renders null). Must mount
			 * BEFORE <Thread /> so registrations are present when the first
			 * tool-call message part is rendered by the canonical Thread's
			 * MessagePrimitive.GroupedParts switch.
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
			 * Phase 200-07 — moved sidebar + thread JSX into
			 * <AssistantShell /> so the `useThreadListAdapter()` hook (which
			 * now calls `useAssistantRuntime()` internally for the
			 * `runtime.threads.switchToNewThread()` D-200-19 fix) runs INSIDE
			 * the provider's React context. `currentThreadIdRef` bridges the
			 * shell's currentThreadId state back to the outer body callback.
			 */}
			<AssistantShell
				selectedModel={selectedModel}
				onModelChange={handleModelChange}
				currentThreadIdRef={currentThreadIdRef}
			/>
		</AssistantRuntimeProvider>
	)
}

/**
 * Phase 200-07 — child component rendered INSIDE
 * `<AssistantRuntimeProvider>` so the `useThreadListAdapter()` hook
 * (which calls `useAssistantRuntime()` internally for the D-200-19 New
 * Conversation runtime-sync fix) resolves the provider's runtime
 * context. Owns the entire sidebar JSX + the canonical `<Thread />`
 * mount that previously lived in the outer Assistant body.
 *
 * Bridge: `currentThreadIdRef` is updated via `useEffect` whenever the
 * adapter's local state rotates — the outer `useChatRuntime` body
 * callback reads `currentThreadIdRef.current` so each /chat/livAi
 * request carries the latest threadId (no semantic change vs the prior
 * closure-capture pattern).
 */
function AssistantShell({
	selectedModel,
	onModelChange,
	currentThreadIdRef,
}: {
	selectedModel: LivAiModelId
	onModelChange: (next: LivAiModelId) => void
	currentThreadIdRef: React.MutableRefObject<string>
}) {
	const {
		threads,
		currentThreadId,
		onSwitchToNewThread,
		onSwitchToThread,
		onDelete,
	} = useThreadListAdapter()

	// Phase 200-07 — keep the outer body callback's ref in lockstep with
	// the adapter's currentThreadId. Effect runs on every change so the
	// next /chat/livAi request always carries the latest threadId.
	useEffect(() => {
		currentThreadIdRef.current = currentThreadId
	}, [currentThreadId, currentThreadIdRef])

	const items = threads()

	return (
		<div className='flex h-full flex-col overflow-hidden'>
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
							onClick={() => {
								// Phase 200-07 — onSwitchToNewThread is now async
								// (awaits runtime.threads.switchToNewThread()
								// before flipping local state); fire-and-forget
								// is fine — the body callback closure picks up
								// the fresh threadId on the next request.
								void onSwitchToNewThread()
							}}
							className='w-full rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700'
							data-testid='liv-ai-new-thread'
							aria-label='Start a new conversation'
						>
							+ New conversation
						</button>
					</div>
					<ul className='flex-1 overflow-y-auto p-2' aria-label='Threads'>
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
				 * Plan 200-06 — Canonical <Thread /> mount (D-200-16). The
				 * `composerSlot` prop is the one intentional delta from the
				 * upstream registry (Plan 200-02 ThreadProps extension); we
				 * inject the LivAiComposer (Plan 200-05 Grok-pattern footer-
				 * strip composer with the relocated model picker, @ mention
				 * popover, / slash popover, image attachments) so the
				 * canonical Thread surface gets the full Liv AI composer
				 * UX without forking the registry composer wholesale. */}
				<main className='relative flex-1 overflow-hidden'>
					<Thread
						composerSlot={
							<LivAiComposer
								selectedModel={selectedModel}
								onModelChange={onModelChange}
							/>
						}
					/>
				</main>
			</div>
			{/* /role='application' */}
		</div>
		// /flex h-full flex-col
	)
}

export default Assistant
