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
// 'chat')` opening the Sheet drawer, it dispatches `toggleChatLog` on
// the same store, which expands/collapses the inline message log inside
// `WebAppChatBottomBar` (anchored at the bottom of the stream window).
// Active state for the Chat icon now reflects `chatLogExpanded`. Teach
// + Auto buttons unchanged. Per user "Chat penceresi olmasin sadece yazi
// yazalim. Butonlar kalsin o sirada."
//
// Phase 100-09-06: Teach icon REPURPOSED. Instead of `toggle(webappId,
// 'teach')` opening the Sheet drawer, it dispatches `toggleTeachRecording`
// on the same store, which flips the per-webappId recording flag. The
// recorder lifecycle (start/stop) is driven from a useEffect inside
// webapp-stream-window.tsx that subscribes to the flag. Active state
// for the Teach icon now reflects `isRecording`. Auto button unchanged
// (still opens Sheet drawer). Per user "altadki teach mode da da aynisi
// gecerli tiklandiginda panel acilmasin".
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts unchanged.

import {motion} from 'framer-motion'
import {Bot, GraduationCap, MessageCircle, type LucideIcon} from 'lucide-react'

import {Magnetic} from '@/components/motion-primitives/magnetic'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/shadcn-components/ui/tooltip'
import {cn} from '@/shadcn-lib/utils'

import {useWebAppDrawerStore, type WebAppDrawerMode} from './webapp-drawer-store'
import {WEBAPP_MODE_CHANGE_EVENT} from './webapp-mode-selector'

const MODES: ReadonlyArray<{id: WebAppDrawerMode; label: string; Icon: LucideIcon}> = [
	{id: 'chat', label: 'Chat', Icon: MessageCircle},
	{id: 'teach', label: 'Teach', Icon: GraduationCap},
	{id: 'auto', label: 'Auto', Icon: Bot},
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

export function WebAppFloatingActionBar({
	webappId,
	windowX,
	windowBottomY,
	windowWidth,
	zIndex,
}: WebAppFloatingActionBarProps) {
	const open = useWebAppDrawerStore((s) => s.openByWebappId[webappId] ?? null)
	const toggle = useWebAppDrawerStore((s) => s.toggle)
	// Phase 100-09-05: Chat icon toggles the inline bottom-bar message log
	// instead of opening the Sheet drawer.
	const toggleChatLog = useWebAppDrawerStore((s) => s.toggleChatLog)
	const chatLogExpanded = useWebAppDrawerStore((s) => s.chatLogExpandedByWebappId[webappId] ?? false)
	// Phase 100-09-06: Teach icon toggles the per-webappId recording flag
	// (drives recorder lifecycle from webapp-stream-window.tsx). NOT the drawer.
	const toggleTeachRecording = useWebAppDrawerStore((s) => s.toggleTeachRecording)
	const isRecording = useWebAppDrawerStore((s) => s.isRecordingByWebappId[webappId] ?? false)

	return (
		<motion.div
			className='fixed select-none'
			style={{
				left: windowX + windowWidth / 2,
				top: windowBottomY + 16,
				transform: 'translateX(-50%)',
				zIndex: zIndex + 1,
			}}
			initial={{opacity: 0, y: 10, scale: 0.9}}
			animate={{opacity: 1, y: 0, scale: 1}}
			exit={{opacity: 0, y: 10, scale: 0.9}}
			transition={{type: 'spring', stiffness: 500, damping: 35}}
		>
			<TooltipProvider delayDuration={300}>
				<div className='flex items-center gap-3'>
					{MODES.map(({id, label, Icon}) => {
						// Phase 100-09-05: Chat icon's active state mirrors the inline
						// bottom-bar log expanded state.
						// Phase 100-09-06: Teach icon's active state mirrors the
						// per-webappId recording flag (drawer Teach mode REMOVED).
						// Auto retains drawer state.
						const active =
							id === 'chat'
								? chatLogExpanded
								: id === 'teach'
									? isRecording
									: open === id
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
													// Phase 100-09-05: Chat icon toggles the inline
													// bottom-bar log (drawer Chat mode REMOVED).
													toggleChatLog(webappId)
												} else if (id === 'teach') {
													// Phase 100-09-06: Teach icon toggles per-webappId
													// recording flag (drawer Teach mode REMOVED).
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
											aria-label={label}
											className={cn(
												'group flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-xl border shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all duration-200',
												active
													? 'bg-primary border-primary/80 text-white'
													: 'bg-white/90 border-neutral-200/60 text-neutral-500 hover:bg-primary hover:border-primary/80 hover:text-white',
											)}
										>
											<Icon
												className='h-4 w-4 transition-colors'
												strokeWidth={2.25}
											/>
										</button>
									</Magnetic>
								</TooltipTrigger>
								<TooltipContent side='bottom'>{label}</TooltipContent>
							</Tooltip>
						)
					})}
				</div>
			</TooltipProvider>
		</motion.div>
	)
}
