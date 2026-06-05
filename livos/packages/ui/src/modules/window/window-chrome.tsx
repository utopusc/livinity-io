import {motion} from 'framer-motion'
import {Maximize2} from 'lucide-react'
import {TbX} from 'react-icons/tb'

import {Magnetic} from '@/components/motion-primitives/magnetic'

import {WebAppFloatingActionBar} from './webapp-floating-action-bar'
import {WebAppFloatingSkillsButton} from './webapp-floating-skills-button'
import {useWebAppDrawerStore} from './webapp-drawer-store'

type WindowChromeProps = {
	title: string
	icon?: string
	onClose: () => void
	windowWidth: number
	webappId?: string
	// Phase 159 — when set, chrome renders Chat-only action area (no
	// Teach, no Skills) for a NativeApp window. Mutually exclusive
	// with webappId per windows-container assertion.
	nativeAppId?: string
	// Phase 260.1 (SC-E) — when provided, the chrome renders a fullscreen
	// button (locked decision #2 = BROWSER fullscreen, frontend only, all
	// display types). The actual requestFullscreen call (standards API +
	// webkit fallback) lives in window.tsx (Plan 05), which passes this
	// callback bound to the content ref. This file delivers the button +
	// prop only; an absent onFullscreen hides the button (plain non-stream
	// windows + existing call sites compile unchanged).
	onFullscreen?: () => void
}

// Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (sdk-agent-runner.ts) unchanged.

// Phase 157 round 14 — animation curve + duration. Previous rounds
// used Framer's `layout="size"` which animates via TRANSFORM: SCALE.
// Scale animations stretched the icons inside the action area
// ("ikonlar dalgalanıyor") and pulled the drag bar's title text
// taut ("drag bar ışınlanıyor gibi"). Round 14 abandons scale-based
// layout and instead animates the explicit `width` CSS property on
// both the action area and the drag bar — no transform, no
// distortion, content stays crisp.
const WIDTH_TRANSITION = {
	type: 'tween' as const,
	duration: 0.55,
	ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
}

// Intrinsic widths of each action-area mode. Measured from the
// rendered IconBar (2 buttons w-9 + gap-3) and ChatInputBar (h-9 pill
// with w-[380px] input + 2 buttons w-7 + gaps + padding).
const ACTION_WIDTH_ICONS = 84
const ACTION_WIDTH_CHAT_INPUT = 480

// Fixed overhead in the chrome row: X close (36) + Skills (36) plus
// three gap-3 (12px) gaps between [X | action | drag | Skills]. Used
// to derive the drag bar's explicit width so its shrink animates
// alongside the action area's grow.
const CHROME_FIXED_OVERHEAD = 36 + 36 + 12 * 3
const CHROME_FIXED_OVERHEAD_NON_WEBAPP = 36 + 12 // just X + one gap before drag bar
// Phase 159 — native-app chrome row: X (36) + action area (animated) +
// drag bar + gaps (12 each). Same as webapp BUT no Skills slot on
// the right.
const CHROME_FIXED_OVERHEAD_NATIVE = 36 + 12 * 2

export function WindowChrome({
	title,
	icon,
	onClose,
	windowWidth,
	webappId,
	nativeAppId,
	onFullscreen,
}: WindowChromeProps) {
	// Phase 159 — discriminator: 'webapp' = full chrome (Chat + Teach +
	// Skills); 'native' = Chat only (Teach + Skills omitted, RESEARCH A5);
	// null = non-stream window (e.g. Settings, Files) — no action area.
	type StreamKind = 'webapp' | 'native' | null
	const streamKind: StreamKind = webappId ? 'webapp' : nativeAppId ? 'native' : null
	const hasChromeChat = streamKind !== null
	const streamId = webappId ?? nativeAppId
	const isWebApp = streamKind === 'webapp'  // preserved for the Skills slot gate + drag-bar math (literal kept)

	// Phase 159 — chat-mode store read keys on the unified streamId. Slot
	// name (chatInputModeByWebappId) preserved per Plan 06 namespace
	// re-use note — UUID collision-free.
	const setSelectedSkillId = useWebAppDrawerStore((s) => s.setSelectedSkillId)
	const chatMode = useWebAppDrawerStore(
		(s) => (streamId ? s.chatInputModeByWebappId[streamId] : undefined) ?? 'icons',
	)

	// Explicit widths drive the width animation. Action area's width is
	// fixed per mode; drag bar's width is derived from windowWidth so
	// the chrome row always exactly spans the window beneath it.
	const actionAreaWidth = chatMode === 'icons' ? ACTION_WIDTH_ICONS : ACTION_WIDTH_CHAT_INPUT
	const dragBarWidth = isWebApp
		? Math.max(60, windowWidth - CHROME_FIXED_OVERHEAD - actionAreaWidth)
		: streamKind === 'native'
			? Math.max(60, windowWidth - CHROME_FIXED_OVERHEAD_NATIVE - actionAreaWidth)
			: Math.max(60, windowWidth - CHROME_FIXED_OVERHEAD_NON_WEBAPP)

	return (
		<div
			className='relative flex items-center gap-3'
			style={{width: windowWidth}}
		>
			{/* Close pill — fixed shape on the far left. Plain button (no
			    motion / layout) so window drag (parent's left/top mutates
			    60fps) doesn't trigger FLIP animations. */}
			<Magnetic
				intensity={0.3}
				range={60}
				springOptions={{stiffness: 200, damping: 12, mass: 0.15}}
			>
				<button
					type='button'
					onClick={(e) => {
						e.stopPropagation()
						onClose()
					}}
					onMouseDown={(e) => e.stopPropagation()}
					className='group flex shrink-0 items-center justify-center w-9 h-9 rounded-full bg-white/95 dark:bg-zinc-800/95 border border-dash-line dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)] hover:bg-destructive dark:hover:bg-destructive hover:border-destructive/80 transition-colors duration-200'
					aria-label='Close window'
				>
					<TbX
						className='h-4 w-4 text-neutral-500 dark:text-neutral-400 group-hover:text-white transition-colors'
						strokeWidth={2.5}
					/>
				</button>
			</Magnetic>

			{/* Fullscreen pill — Phase 260.1 (SC-E), locked decision #2 =
			    BROWSER fullscreen (frontend only, all display types). Rendered
			    only when an onFullscreen callback is supplied (so plain
			    non-stream windows don't show it). Mirrors the close button's
			    w-9 h-9 rounded-full shape for visual consistency but uses a
			    NEUTRAL hover (not the close button's destructive hover). The
			    actual requestFullscreen call (standards Fullscreen API + a
			    webkit fallback) is supplied by window.tsx in Plan 05 — this
			    file delivers the button + prop only (keeps files disjoint). */}
			{onFullscreen && (
				<button
					type='button'
					onClick={(e) => {
						e.stopPropagation()
						onFullscreen?.()
					}}
					onMouseDown={(e) => e.stopPropagation()}
					className='flex shrink-0 items-center justify-center w-9 h-9 rounded-full bg-white/95 dark:bg-zinc-800/95 border border-dash-line dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)] hover:bg-[color:var(--bg-2)] transition-colors duration-200'
					aria-label='Fullscreen'
					title='Fullscreen'
				>
					<Maximize2
						className='h-4 w-4 text-neutral-500 dark:text-neutral-400'
						strokeWidth={2.5}
					/>
				</button>
			)}

			{/* WebApp action area — Chat + Teach icons (default), or the
			    chat-input / streaming-response pill. Width is animated
			    via explicit `animate={{width}}` (CSS width transition,
			    NOT transform: scale). That keeps icons and text inside
			    crisp — no stretching, no distortion. */}
			{hasChromeChat && (
				<motion.div
					initial={false}
					animate={{width: actionAreaWidth}}
					transition={WIDTH_TRANSITION}
					className='shrink-0 h-9 overflow-hidden flex items-center'
					onMouseDown={(e) => e.stopPropagation()}
				>
					<WebAppFloatingActionBar
						inline
						webappId={webappId}
						nativeAppId={nativeAppId}
					/>
				</motion.div>
			)}

			{/* Drag bar — explicit width animated in lockstep with the
			    action area. Shrinks visibly when chat-input opens, grows
			    back when it closes. CSS width transition (not scale) so
			    the title text stays anchored and doesn't visually
			    teleport. */}
			<motion.div
				initial={false}
				animate={{width: dragBarWidth}}
				transition={WIDTH_TRANSITION}
				className='flex items-center justify-center px-4 h-9 bg-white/95 dark:bg-zinc-800/95 rounded-full border border-dash-line dark:border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.4)] cursor-grab active:cursor-grabbing overflow-hidden'
				style={{flex: '0 0 auto'}}
			>
				<span className='text-[13px] font-semibold text-neutral-700 dark:text-neutral-200 tracking-tight whitespace-nowrap select-none truncate'>
					{title}
				</span>
			</motion.div>

			{/* Skills library button — far right of the chrome row. */}
			{isWebApp && (
				<div
					className='shrink-0'
					onMouseDown={(e) => e.stopPropagation()}
				>
					<WebAppFloatingSkillsButton
						inline
						webappId={webappId!}
						onReplaySkill={(skillId) => setSelectedSkillId(webappId!, skillId)}
					/>
				</div>
			)}
		</div>
	)
}
