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
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts unchanged.

import {useCallback, useEffect, useRef, useState} from 'react'
import {motion} from 'framer-motion'
// Phase 100-10-05 D-100-10-G: the robot-icon lucide import dropped — the
// Auto icon button was removed from the floating action bar per user
// "Auto butonu varya onu kaldir." Backend P97 auto-mode capability stays
// untouched; only the UI surface was retired.
import {GraduationCap, MessageCircle, Send, X, type LucideIcon} from 'lucide-react'

import {Magnetic} from '@/components/motion-primitives/magnetic'
import {useWebAppAgent} from '@/hooks/use-webapp-agent'
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
			{mode === 'chat-input' ? (
				<ChatInputBar webappId={webappId} onClose={() => setChatInputMode(webappId, 'icons')} />
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
													: 'bg-white/90 border-neutral-200/60 text-neutral-500 hover:bg-primary hover:border-primary/80 hover:text-white'
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
// Enter key, then returns to 'icons'.
// ─────────────────────────────────────────────────────────────────────

interface ChatInputBarProps {
	webappId: string
	onClose: () => void
}

function ChatInputBar({webappId, onClose}: ChatInputBarProps) {
	const agent = useWebAppAgent(webappId)
	const [input, setInput] = useState('')
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
		// Return to icon bar after dispatching the message — matches the
		// plan's "Send / Enter → sends + back to 'icons'" contract.
		onClose()
	}, [agent, input, onClose])

	return (
		<Magnetic intensity={0.2}>
			<div className='flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-xl border border-neutral-200/60 shadow-[0_2px_8px_rgba(0,0,0,0.08)] px-3 py-2'>
				<input
					ref={inputRef}
					type='text'
					value={input}
					onChange={(e) => setInput(e.target.value)}
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
							: 'bg-neutral-100 text-neutral-400 cursor-not-allowed',
					)}
				>
					<Send className='h-3.5 w-3.5' strokeWidth={2.25} />
				</button>
				<button
					type='button'
					onClick={onClose}
					aria-label='Close chat input'
					className='flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 transition-colors'
				>
					<X className='h-3.5 w-3.5' strokeWidth={2.25} />
				</button>
			</div>
		</Magnetic>
	)
}
