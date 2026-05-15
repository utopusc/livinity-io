// Phase 100-06: floating action bar rendered OUTSIDE the WebApp window
// (mirrors window-chrome.tsx top close button — position relative to the
// window's bounding box but rendered as a sibling motion.div in
// windows-container.tsx). Round buttons with the same backdrop-blur +
// soft-shadow style as the close button.
//
// Modes shipped: Chat / Teach / Auto (Watch dropped per user request).
//
// State coupling: useWebAppDrawerStore (Zustand). The Sheet drawer host
// in webapp-stream-window.tsx subscribes to the same store.
//
// Phase 100-09-05: Chat icon REPURPOSED. Instead of `toggle(webappId,
// 'chat')` opening the Sheet drawer, it dispatched `toggleChatLog` on
// the same store, which expanded/collapsed the inline message log inside
// `WebAppChatBottomBar` (anchored at the bottom of the stream window).
//
// Phase 100-09-06: Teach icon REPURPOSED. Instead of `toggle(webappId,
// 'teach')` opening the Sheet drawer, it dispatches `toggleTeachRecording`
// on the same store, which flips the per-webappId recording flag. The
// recorder lifecycle (start/stop) is driven from a useEffect inside
// webapp-stream-window.tsx that subscribes to the flag. Active state
// for the Teach icon now reflects `isRecording`. Per user "altadki teach
// mode da da aynisi gecerli tiklandiginda panel acilmasin".
//
// Phase 100-09-08: this component becomes a 2-mode state machine driven
// by `chatInputModeByWebappId[webappId]` on the drawer store. Per user
// feedback after 09-05 deploy ("Message Liv... kismi pencerenin icinde
// olmamasi lazimdi assagida message iconuna tikladigimda o kisimin
// butun olarak inputa donusmesi lazimdi"): the persistent inline
// `WebAppChatBottomBar` from 09-05 is WRONG. The user wants the floating
// action-bar AREA itself to transform. Same area, two modes:
//   mode='icons'      → icon-button row, default.
//   mode='chat-input' → text input + Send + Close (X).
// Click Chat icon → mode='chat-input'. Send / Enter → sends + back to
// 'icons'. Close (X) / Escape → back to 'icons' without sending.
//
// Phase 100-10-05 D-100-10-G: Auto icon button + the lucide robot-icon
// import REMOVED. Per user "Auto butonu varya onu kaldir." The icon row
// now renders exactly 2 buttons (Chat + Teach). Backend P97 auto-mode
// capability is untouched — only the UI surface was retired.
//
// Phase 100-10-06 D-100-10-E: 2-mode state machine EXTENDED to 3-mode.
// 'chat-response' branch added. Per user (Issue 6 / D-100-10-E): when
// the user types + Enter from the chat-input bar, the response should
// render IN PLACE OF the input — not somewhere else. New flow:
//   1. Click Chat icon → 'chat-input' (existing).
//   2. Type + Enter (or click Send) → sendMessage(text) THEN flip mode
//      to 'chat-response' (NOT back to 'icons' — superseding the 09-08
//      behavior). Input area is REPLACED by a streaming response panel.
//   3. While streaming: Stop button (right side) calls agent.stopStreaming()
//      — alias for the existing useAgentSocket.interrupt (sends
//      `{type: 'interrupt'}` over the WS).
//   4. Stream completes: Stop becomes a "New message" (+) button that
//      flips back to 'chat-input' with response cleared.
//   5. Click Close (X) at any point in 'chat-response' → back to 'icons'.
//   6. Press Escape from 'chat-response' → back to 'icons'.
//
// Phase 100-10-10 — Bug A fix. ChatInputBar + ChatResponseBar each used to
// call `useWebAppAgent(webappId)` separately. Each call opens its OWN
// WebSocket (per-hook-instance wsRef inside useAgentSocket) and owns its
// OWN messages state (per-hook-instance useReducer). When the parent
// flipped mode from 'chat-input' → 'chat-response', ChatInputBar
// unmounted and closed its WS — BEFORE the assistant chunks arrived —
// so ChatResponseBar mounted a fresh WS with an empty messages array.
// The streaming reply was lost. Fix: HOIST `useWebAppAgent(webappId)`
// to the parent `WebAppFloatingActionBar` and pass `agent` as a prop
// into both sub-components. Single WebSocket persists across the mode
// flip; both sub-components share the same messages + isStreaming +
// agentStatus state via reference identity.
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts unchanged.

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {motion} from 'framer-motion'
// Phase 100-10-05 D-100-10-G: the robot-icon lucide import dropped — the
// Auto icon button was removed from the floating action bar per user
// "Auto butonu varya onu kaldir." Backend P97 auto-mode capability stays
// untouched; only the UI surface was retired.
// Phase 100-10-06: Square (Stop) + Plus (New message) icons added for
// the new ChatResponseBar component.
import {GraduationCap, MessageCircle, Plus, Send, Square, X, type LucideIcon} from 'lucide-react'

import {Magnetic} from '@/components/motion-primitives/magnetic'
import {useWebAppAgent, type UseWebAppAgentResult} from '@/hooks/use-webapp-agent'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/shadcn-components/ui/tooltip'
import {cn} from '@/shadcn-lib/utils'

import {EMPTY_TEACH_EVENTS, useWebAppDrawerStore, type WebAppDrawerMode} from './webapp-drawer-store'
import {WEBAPP_MODE_CHANGE_EVENT} from './webapp-mode-selector'

// Phase 100-10-05 D-100-10-G: the auto-mode entry (with the robot lucide
// icon) dropped — Auto button removed from the floating action bar
// entirely (T-10-05-09 source-text invariant locks the negative).
const MODES: ReadonlyArray<{id: WebAppDrawerMode; label: string; Icon: LucideIcon}> = [
	{id: 'chat', label: 'Chat', Icon: MessageCircle},
	{id: 'teach', label: 'Teach', Icon: GraduationCap},
]

interface WebAppFloatingActionBarProps {
	webappId: string
	/** WebApp window's bottom-left x in viewport coords. */
	windowX: number
	/** WebApp window's bottom y (windowY + height) in viewport coords. */
	windowBottomY: number
	/** WebApp window width — used to center the bar. */
	windowWidth: number
	/** zIndex of the parent window (bar sits one above). */
	zIndex: number
}

export function WebAppFloatingActionBar(props: WebAppFloatingActionBarProps) {
	const {webappId} = props
	// Phase 100-09-08 — the bar is a 2-mode state machine. The same
	// `motion.div` host renders ONE of {IconBar | ChatInputBar} based on
	// the per-webappId mode slot. Default mode (undefined) reads as 'icons'.
	const mode = useWebAppDrawerStore((s) => s.chatInputModeByWebappId[webappId] ?? 'icons')
	const setChatInputMode = useWebAppDrawerStore((s) => s.setChatInputMode)

	// Phase 100-10-10 Bug A fix — useWebAppAgent(webappId) is HOISTED
	// here, in the parent. Pre-fix, both ChatInputBar AND ChatResponseBar
	// called the hook themselves, each opening its OWN WebSocket. On
	// mode flip, ChatInputBar unmounted (closing WS#A) BEFORE the
	// assistant chunks arrived; ChatResponseBar mounted with a FRESH WS
	// and empty messages array. The reply was lost. With the hook
	// hoisted to the parent: a single WS persists across the mode flip,
	// and `agent` (the shared reference) is passed as a prop into both
	// sub-components so they observe the SAME messages + isStreaming +
	// agentStatus state.
	const agent = useWebAppAgent(webappId)

	return (
		<motion.div
			className='fixed select-none'
			style={{
				left: props.windowX + props.windowWidth / 2,
				top: props.windowBottomY + 16,
				transform: 'translateX(-50%)',
				zIndex: props.zIndex + 1,
			}}
			initial={{opacity: 0, y: 10, scale: 0.9}}
			animate={{opacity: 1, y: 0, scale: 1}}
			exit={{opacity: 0, y: 10, scale: 0.9}}
			transition={{type: 'spring', stiffness: 500, damping: 35}}
			layout
		>
			{/* Phase 100-10-06 D-100-10-E: 3-mode dispatch.
			    - 'chat-response' branch renders the ChatResponseBar (streaming
			      response panel + Stop button while streaming + Close X).
			    - 'chat-input' branch renders the ChatInputBar (text input +
			      Send + Close X). Send/Enter now flips to 'chat-response'
			      (NOT back to 'icons' — superseding 09-08's behavior).
			    - Default 'icons' branch renders the IconBar (Chat + Teach).
			    Phase 100-10-10 Bug A fix: `agent` is passed as a prop into
			    both ChatInputBar and ChatResponseBar so the shared hook
			    state survives the mode flip (single WS, single messages
			    array).
			*/}
			{mode === 'chat-response' ? (
				<ChatResponseBar
					webappId={webappId}
					agent={agent}
					onClose={() => setChatInputMode(webappId, 'icons')}
					onNew={() => setChatInputMode(webappId, 'chat-input')}
				/>
			) : mode === 'chat-input' ? (
				<ChatInputBar
					webappId={webappId}
					agent={agent}
					onClose={() => setChatInputMode(webappId, 'icons')}
					onSent={() => setChatInputMode(webappId, 'chat-response')}
				/>
			) : (
				<IconBar
					webappId={webappId}
					onChatClick={() => setChatInputMode(webappId, 'chat-input')}
				/>
			)}
		</motion.div>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Mode 1: IconBar — 2-button row (Chat / Teach).
//
// Chat icon (id='chat') click flips floating-bar mode to 'chat-input'
// (Phase 100-09-08 — replaces the 09-05 `toggleChatLog` wire). Teach
// icon (id='teach') click flips per-webappId recording flag (Phase
// 100-09-06). Auto icon dropped 100-10-05 D-100-10-G.
// ─────────────────────────────────────────────────────────────────────

interface IconBarProps {
	webappId: string
	onChatClick: () => void
}

function IconBar({webappId, onChatClick}: IconBarProps) {
	const open = useWebAppDrawerStore((s) => s.openByWebappId[webappId] ?? null)
	const toggle = useWebAppDrawerStore((s) => s.toggle)
	// Phase 100-09-06: Teach icon toggles the per-webappId recording flag
	// (drives recorder lifecycle from webapp-stream-window.tsx).
	const toggleTeachRecording = useWebAppDrawerStore((s) => s.toggleTeachRecording)
	const isRecording = useWebAppDrawerStore((s) => s.isRecordingByWebappId[webappId] ?? false)
	// Phase 100-09-09: subscribe to the events mirror so the Teach button
	// can display a live click-count badge while recording. The events
	// array reference comes straight from the recorder's React state
	// (stream-window mirrors it to this slot on each push), so
	// `events.length` reflects the live count without any extra wiring.
	// Per user "tikladiktan sonra kirmizi buton olsun teach. sag yukarida
	// stop butonu olmasin ve sure saymasin sadece clickleri saysin."
	const events = useWebAppDrawerStore(
		(s) => s.teachEventsByWebappId[webappId] ?? EMPTY_TEACH_EVENTS,
	)
	const clickCount = events.length

	return (
		<TooltipProvider delayDuration={300}>
			<div className='flex items-center gap-3'>
				{MODES.map(({id, label, Icon}) => {
					// Phase 100-09-08: Chat icon's active state mirrors the
					// floating-bar mode (always false in 'icons' mode; entering
					// 'chat-input' swaps the whole bar, so the active-state
					// affordance is implicit). Teach icon's active state mirrors
					// `isRecording` (09-06). Auto retains drawer state.
					const active =
						id === 'chat'
							? false
							: id === 'teach'
								? isRecording
								: open === id
					// Phase 100-09-09: Teach icon gets a special red treatment
					// when recording — the button itself turns red, replacing
					// the 09-06 top-right `TeachRecordingOverlay` widget. The
					// Stop affordance is now the same button that started the
					// recording (clicking the red button → toggleTeachRecording
					// → recorder.stop → SaveSkillDialog opens — unchanged from
					// 09-06's stop pipeline; only the trigger surface moved).
					const teachRecording = id === 'teach' && isRecording
					return (
						<Tooltip key={id}>
							<TooltipTrigger asChild>
								<Magnetic
									intensity={0.3}
									range={60}
									springOptions={{stiffness: 200, damping: 12, mass: 0.15}}
								>
									<button
										type='button'
										onClick={(e) => {
											e.stopPropagation()
											if (id === 'chat') {
												// Phase 100-09-08: Chat icon transforms the
												// floating bar itself into a chat-input row
												// (replaces the 09-05 `toggleChatLog` wire).
												onChatClick()
											} else if (id === 'teach') {
												// Phase 100-09-06: Teach icon toggles per-webappId
												// recording flag (drawer Teach mode REMOVED).
												// Phase 100-09-09: same wire — second click on the
												// now-red button stops + opens save modal via the
												// existing useEffect in webapp-stream-window.tsx.
												toggleTeachRecording(webappId)
											} else {
												toggle(webappId, id)
											}
											try {
												window.dispatchEvent(
													new CustomEvent(WEBAPP_MODE_CHANGE_EVENT, {
														detail: {mode: id},
													}),
												)
											} catch {
												// JSDOM / older browsers — non-blocking.
											}
										}}
										aria-pressed={active}
										aria-label={
											teachRecording
												? `Stop teaching (${clickCount} clicks)`
												: label
										}
										className={cn(
											'group relative flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-xl border shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-200',
											// Phase 100-09-09: red-button-when-recording branch
											// takes precedence over the generic `active` styling
											// for the Teach icon. `bg-red-500/90` matches the
											// plan's interfaces sketch + the success criteria
											// (truth: "Teach icon button background is red
											// (`bg-red-500/90` or equivalent) when `isRecording`
											// is true"). The literal `isRecording &&
											// 'bg-red-500/90 ...'` shape is locked by
											// T-09-09-01 in webapp-stream-window.unit.test.tsx.
											id === 'teach' && isRecording && 'bg-red-500/90 border-red-500/80 text-white hover:bg-red-500',
											(id !== 'teach' || !isRecording) && (
												active
													? 'bg-primary border-primary/80 text-white'
													: 'bg-card-bg/90 border-dash-line text-text-secondary hover:bg-primary hover:border-primary/80 hover:text-white'
											),
										)}
									>
										<Icon
											className='h-4 w-4 transition-colors'
											strokeWidth={2.25}
										/>
										{/* Phase 100-09-09: numeric click-count badge — only
										    shown for the Teach icon while recording AND at
										    least one event has been captured. Uses the
										    `events.length` derived from the recorder's live
										    events array (mirrored into the drawer store via
										    `setTeachEvents` from webapp-stream-window.tsx).
										    Per user "sure saymasin sadece clickleri saysin"
										    (don't count time, only count clicks). */}
										{id === 'teach' && isRecording && clickCount > 0 && (
											<span
												className='absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center px-1 ring-2 ring-white'
												aria-label={`${clickCount} clicks captured`}
											>
												{clickCount}
											</span>
										)}
									</button>
								</Magnetic>
							</TooltipTrigger>
							<TooltipContent side='bottom'>
								{teachRecording ? `Stop teaching (${clickCount} clicks)` : label}
							</TooltipContent>
						</Tooltip>
					)
				})}
			</div>
		</TooltipProvider>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Mode 2: ChatInputBar — text input + Send + Close (X).
//
// Phase 100-09-08. Replaces the persistent inline `WebAppChatBottomBar`
// from 09-05 per user feedback. Auto-focuses on mount, listens for the
// Escape key to bail back to 'icons', sends on Send button click /
// Enter key.
//
// Phase 100-10-06 D-100-10-E: Send/Enter no longer flips back to 'icons'.
// Instead it calls `onSent()` which transitions to 'chat-response' so the
// streaming assistant reply renders IN PLACE OF the input area. Close (X)
// + Escape still flip back to 'icons' without sending.
// ─────────────────────────────────────────────────────────────────────

interface ChatInputBarProps {
	webappId: string
	/** Phase 100-10-10 Bug A fix — `agent` is now hoisted to the parent
	 *  `WebAppFloatingActionBar` and passed through. Pre-fix this
	 *  component called `useWebAppAgent(webappId)` itself, which opened
	 *  its OWN WebSocket; on unmount (mode flip to 'chat-response'),
	 *  that WS closed and the assistant reply was lost. With the hoist,
	 *  the WS persists across mode flips. */
	agent: UseWebAppAgentResult
	onClose: () => void
	/** Phase 100-10-06 D-100-10-E — called AFTER agent.sendMessage(text)
	 *  dispatches. Wired by the parent to flip mode to 'chat-response'
	 *  so the response area renders in-place. */
	onSent: () => void
}

function ChatInputBar({webappId, agent, onClose, onSent}: ChatInputBarProps) {
	// Phase 100-10-10 Bug A fix — `agent` is a prop now (hoisted from
	// parent). The previous `useWebAppAgent(webappId)` call site here is
	// removed so a single WS instance is shared across the mode flip.
	void webappId
	const [input, setInput] = useState('')
	// Phase 101-09 (D-101-CHAT-ANIMS) — focus state drives the idle-pulse
	// gating predicate. The Input element fires onFocus/onBlur into this
	// local boolean; the `chat-input-idle` utility class is applied to the
	// pill border ONLY when `!isFocused && input.length === 0 &&
	// !agent.isStreaming`. See index.css `@keyframes idleBreath` (4s
	// ease-in-out, opacity 0.3↔0.8) and the prefers-reduced-motion override
	// (Q5 RESOLVED — OS-level only, no per-user Settings toggle).
	const [isFocused, setIsFocused] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	// Auto-focus on mount + bind Escape-to-close at window level so the
	// user can bail back to the icon bar without clicking the X button.
	useEffect(() => {
		inputRef.current?.focus()
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	const handleSend = useCallback(() => {
		const text = input.trim()
		if (!text || agent.isStreaming) return
		agent.sendMessage(text)
		setInput('')
		// Phase 100-10-06 D-100-10-E: flip to 'chat-response' so the
		// streaming assistant reply renders IN PLACE OF the input area
		// (replaces the 09-08 wire which returned to 'icons' directly).
		// The parent flips mode via setChatInputMode(webappId, 'chat-response').
		onSent()
	}, [agent, input, onSent])

	// Phase 101-09 (D-101-CHAT-ANIMS, Pillar E) — thinking-dots gate.
	//
	// CONTEXT line 122 specifies: render the 3 staggered dots when
	// `isStreaming && messages.length === lastSentCount` (user sent, no
	// response token yet). `useWebAppAgent` does not expose
	// `lastSentCount` directly, so we derive the same predicate from the
	// observable messages array: the latest assistant message either does
	// not exist yet OR has empty content. The dots vanish as soon as the
	// first text delta arrives via APPEND_TEXT (assistant message gets
	// non-empty `content`) — which is exactly the "first response token"
	// edge that CONTEXT line 122 references.
	const lastAssistantHasContent = useMemo(() => {
		const messages = agent.messages
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === 'assistant') {
				return (messages[i].content || '').length > 0
			}
		}
		return false
	}, [agent.messages])
	// thinking-dots: streaming AND no assistant token yet.
	const showThinkingDots = agent.isStreaming && !lastAssistantHasContent

	// Phase 101-09 idle-pulse gate: input unfocused + empty + not streaming.
	// The utility class is defined in `livos/packages/ui/src/index.css`
	// (Task 2 of plan 101-09) and the rule is suppressed under
	// `prefers-reduced-motion: reduce`. The Tailwind `motion-reduce:`
	// variant on the outer wrapper also short-circuits the animate-*
	// utilities for users who set reduced motion at the OS level.
	const idlePulseActive = !isFocused && input.length === 0 && !agent.isStreaming

	return (
		<Magnetic intensity={0.2}>
			{/* Phase 100-10-10 Bug B — the input pill stays a flex-row; a
			    secondary status line (per-tool streaming) renders BELOW
			    the pill via a column wrapper, but only while agent is
			    streaming. The wrapper is `inline-flex flex-col items-center`
			    so the row stays its original ~360px width and the status
			    line centers beneath it without disturbing the layout.

			    Phase 101-09 — the wrapper carries the Tailwind
			    `motion-reduce:[&_*]:!animate-none` variant so that all
			    nested animations (thinking dots, idle-pulse, status pulse,
			    streaming caret) are suppressed for users with
			    prefers-reduced-motion: reduce. The CSS-level @media rule
			    in index.css backstops this for the .chat-input-idle
			    utility + raw .animate-pulse class (Q5 RESOLVED). */}
			<div className='inline-flex flex-col items-center gap-1.5 motion-reduce:[&_*]:!animate-none'>
				<div
					className={cn(
						'flex items-center gap-2 rounded-full bg-card-bg/95 backdrop-blur-xl border border-dash-line shadow-[0_2px_8px_rgba(0,0,0,0.08)] px-3 py-2',
						// Phase 101-09 (D-101-CHAT-ANIMS) — idle-pulse on the
						// pill border. The `chat-input-idle` class targets the
						// @keyframes idleBreath rule (4s ease-in-out, opacity
						// 0.3↔0.8) defined in index.css. Honors
						// prefers-reduced-motion: reduce via the index.css
						// @media override + Tailwind motion-reduce: variant
						// on the outer wrapper.
						idlePulseActive && 'chat-input-idle motion-reduce:animate-none',
					)}
				>
					<input
						ref={inputRef}
						type='text'
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault()
								handleSend()
							}
						}}
						placeholder='Mesaj yaz...'
						disabled={agent.isStreaming}
						className='w-[360px] bg-transparent text-caption-sm text-text-primary placeholder:text-text-tertiary outline-none border-none focus-visible:ring-0 disabled:opacity-50'
					/>
					<button
						type='button'
						onClick={handleSend}
						disabled={!input.trim() || agent.isStreaming}
						aria-label='Send'
						className={cn(
							'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
							input.trim() && !agent.isStreaming
								? 'bg-primary text-white hover:bg-primary/90'
								: 'bg-card-bg-2 text-text-tertiary cursor-not-allowed',
						)}
					>
						<Send className='h-3.5 w-3.5' strokeWidth={2.25} />
					</button>
					<button
						type='button'
						onClick={onClose}
						aria-label='Close chat input'
						className='flex h-7 w-7 items-center justify-center rounded-full text-text-secondary hover:bg-card-bg-2 hover:text-text-primary transition-colors'
					>
						<X className='h-3.5 w-3.5' strokeWidth={2.25} />
					</button>
				</div>
				{/* Phase 101-09 (D-101-CHAT-ANIMS, Pillar E) — thinking-dots.
				    Rendered when `agent.isStreaming` is true AND no assistant
				    response token has arrived yet (lastAssistantHasContent is
				    false). The 3 spans pulse with staggered animation-delay
				    values 0ms / 150ms / 300ms (CONTEXT lines 122-129 verbatim).
				    Tailwind arbitrary-value syntax `[animation-delay:Nms]`
				    compiles to inline animation-delay declarations.
				    motion-reduce on the wrapper above suppresses animate-pulse
				    when prefers-reduced-motion is set. */}
				{showThinkingDots ? (
					<div
						className='text-caption-xs text-text-tertiary flex items-center gap-1.5'
						aria-label='thinking-dots'
						aria-live='polite'
					>
						<span className='inline-flex gap-1' aria-hidden='true'>
							<span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:0ms]' />
							<span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:150ms]' />
							<span className='w-1.5 h-1.5 rounded-full bg-text-tertiary animate-pulse [animation-delay:300ms]' />
						</span>
					</div>
				) : null}
				{/* Phase 100-10-10 Bug B — per-tool streaming status sub-line.
				    Mirrors the line inside ChatResponseBar so the user sees
				    tool-call progress even before the mode flips (and during
				    the brief window between Send and mode-flip). Gated on
				    `agent.isStreaming` AND (Hermes `phrase` OR `currentTool`)
				    — see ChatResponseBar comment for backend wiring notes.

				    Phase 101-09 Pillar F: the status_detail relay landed in
				    agent-runner-factory.ts (Task 3) means `phrase` now
				    carries the real Hermes verb ("inspecting", "calling",
				    etc.) once the WS path also forwards it. The chat-WS
				    path through AgentSessionManager (liv-core agent-session.ts)
				    is a separate hop and is NOT modified by 101-09 — but the
				    SSE broker pass-through (createSdkAgentRunnerForUser) is. */}
				{agent.isStreaming && (agent.agentStatus?.phrase || agent.agentStatus?.currentTool) ? (
					<div className='text-caption-xs text-text-tertiary flex items-center gap-1.5'>
						<span className='inline-block w-1 h-1 rounded-full bg-text-tertiary animate-pulse' aria-hidden='true' />
						<span>{agent.agentStatus.phrase ?? `Using ${agent.agentStatus.currentTool}…`}</span>
					</div>
				) : null}
			</div>
		</Magnetic>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Mode 3: ChatResponseBar — live response panel + Stop / New + Close.
//
// Phase 100-10-06 D-100-10-E. Renders the latest assistant message text
// from `useWebAppAgent(webappId).messages` with a streaming caret while
// `agent.isStreaming` is true. The right-side button is Stop (Square
// icon) while streaming — clicking calls `agent.stopStreaming()`, which
// is an alias for the existing `useAgentSocket.interrupt` runtime cancel
// (sends `{type: 'interrupt'}` over the WS — see use-agent-socket.ts
// L551-558). After streaming completes, the Stop button transitions to a
// "New message" (Plus icon) affordance that flips back to 'chat-input'
// with the response cleared (via parent's onNew callback wiring through
// setChatInputMode → 'chat-input'). The Close (X) button always returns
// to 'icons'. Escape key also returns to 'icons' (mirrors ChatInputBar).
// ─────────────────────────────────────────────────────────────────────

interface ChatResponseBarProps {
	webappId: string
	/** Phase 100-10-10 Bug A fix — `agent` is hoisted to the parent
	 *  `WebAppFloatingActionBar`. Pre-fix this component called
	 *  `useWebAppAgent(webappId)` itself, opening a FRESH WebSocket on
	 *  mount (with an empty messages array). The assistant reply
	 *  streamed to the now-closed ChatInputBar WS, was lost, and never
	 *  rendered here. With the hoist, the shared `agent` keeps the
	 *  same WS + messages array across the mode flip. */
	agent: UseWebAppAgentResult
	/** X button + Escape key → return to 'icons' mode. */
	onClose: () => void
	/** "New message" (+) button click after streaming completes → flip
	 *  back to 'chat-input' so the user can type a follow-up. */
	onNew: () => void
}

function ChatResponseBar({webappId, agent, onClose, onNew}: ChatResponseBarProps) {
	// Phase 100-10-10 Bug A fix — `agent` is a prop now (hoisted from
	// parent). The previous `useWebAppAgent(webappId)` call site here is
	// removed so the WS opened by ChatInputBar's parent persists into
	// this mode and the assistant chunks land in this component's view.
	void webappId
	// Find the latest assistant message (the streaming reply). Using
	// useMemo so the lookup is stable across re-renders when messages
	// array reference hasn't changed.
	const lastAssistant = useMemo(() => {
		const messages = agent.messages
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === 'assistant') return messages[i]
		}
		return null
	}, [agent.messages])

	// Auto-bind Escape → onClose at window level (mirrors ChatInputBar).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
			}
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	return (
		<Magnetic intensity={0.2}>
			<div className='flex items-start gap-2 rounded-dash bg-card-bg/95 backdrop-blur-xl border border-dash-line shadow-[0_2px_8px_rgba(0,0,0,0.08)] px-4 py-3 max-w-[480px]'>
				<div className='flex-1 text-caption-sm text-text-primary whitespace-pre-wrap min-h-[20px]'>
					{lastAssistant?.content ?? ''}
					{agent.isStreaming ? (
						<span
							className='inline-block w-1.5 h-3.5 ml-1 bg-primary animate-pulse align-middle'
							aria-hidden='true'
						/>
					) : null}
					{/* Phase 100-10-10 Bug B — per-tool streaming status line.
					    User UAT 2026-05-10 wanted to see "parça parça" which
					    tool the agent is using while it streams. Renders ONLY
					    while `agent.isStreaming` AND (Hermes `phrase` OR
					    `currentTool` is set). The chat WS path today does not
					    carry Phase 87 status_detail chunks (agent-session.ts
					    doesn't relay runStore status_detail) — so `phrase`
					    will be null and the fallback shows `Using <tool>…`
					    from `agentStatus.currentTool` (populated by
					    use-agent-socket.ts content_block_start handler). */}
					{agent.isStreaming && (agent.agentStatus?.phrase || agent.agentStatus?.currentTool) ? (
						<div className='text-caption-xs text-text-tertiary mt-1.5 flex items-center gap-1.5'>
							<span className='inline-block w-1 h-1 rounded-full bg-text-tertiary animate-pulse' aria-hidden='true' />
							<span>{agent.agentStatus.phrase ?? `Using ${agent.agentStatus.currentTool}…`}</span>
						</div>
					) : null}
				</div>
				{agent.isStreaming ? (
					<button
						type='button'
						onClick={() => agent.stopStreaming()}
						aria-label='Stop streaming'
						className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-red text-white hover:bg-accent-red/90 transition-colors'
					>
						<Square className='h-3.5 w-3.5' strokeWidth={2.25} />
					</button>
				) : (
					<button
						type='button'
						onClick={onNew}
						aria-label='New message'
						className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white hover:bg-primary/90 transition-colors'
					>
						<Plus className='h-3.5 w-3.5' strokeWidth={2.25} />
					</button>
				)}
				<button
					type='button'
					onClick={onClose}
					aria-label='Close chat response'
					className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-card-bg-2 hover:text-text-primary transition-colors'
				>
					<X className='h-3.5 w-3.5' strokeWidth={2.25} />
				</button>
			</div>
		</Magnetic>
	)
}
