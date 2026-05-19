// Phase 100-10-05 — WebAppFloatingSkillsButton.
//
// Per D-100-10-D: the Skills popover trigger was previously rendered
// INSIDE the WebApp window's top-right (where 09-06 placed it as
// `<WebAppSkillsPopover/>`). User feedback after 09-09 deploy:
//   "Teaching mod u guncelle Skill kismini pencerenin sag ust kismindan
//    kaldir. Onun yerine pencerenin disinda sag ust de skill butonu olsun."
//
// Fix: move the Skills trigger OUTSIDE the window, anchored at the
// window's top-right corner — mirroring the Phase 100-06.1 pattern
// (floating action bar moved OUTSIDE at the bottom).
//
// Same Magnetic + motion.div + `rounded-full bg-white/90 backdrop-blur-xl`
// pill aesthetic as the floating action bar. Single round icon button.
// Click → opens Radix Popover with the skills list (Play / Delete per
// skill). The Popover content body mirrors what the old
// `webapp-skills-popover.tsx` rendered — `webapp-skills-popover.tsx` is
// retained (deprecated) for revert safety; this file owns the new
// outside-window render path.
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts unchanged.

import {useState} from 'react'
import {motion} from 'framer-motion'
import {Library, Play, Trash2} from 'lucide-react'

import {Magnetic} from '@/components/motion-primitives/magnetic'
import {Popover, PopoverContent, PopoverTrigger} from '@/shadcn-components/ui/popover'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

export interface WebAppFloatingSkillsButtonProps {
	webappId: string
	// Phase 157 round 10 — when `inline` is true, the component renders
	// ONLY the Magnetic + Popover button (no fixed-positioned motion.div
	// wrapper). Used by WindowChrome to embed the Skills button on the
	// far right of the top chrome row. Position props are ignored in
	// inline mode (the chrome owns layout).
	inline?: boolean
	/** WebApp window's top-left x in viewport coords. */
	windowX?: number
	/** WebApp window's top y in viewport coords. */
	windowY?: number
	/** WebApp window width — used to anchor the button at the right edge. */
	windowWidth?: number
	/** zIndex of the parent window (button sits one above). */
	zIndex?: number
	/** Optional callback when user clicks Play on a skill. */
	onReplaySkill?: (skillId: string) => void
}

export function WebAppFloatingSkillsButton(props: WebAppFloatingSkillsButtonProps) {
	const {webappId, inline = false} = props
	const [open, setOpen] = useState(false)
	const listQuery = trpcReact.webapp.skills.list.useQuery(
		{webappId},
		{
			enabled: !!webappId && /^[0-9a-f-]{36}$/i.test(webappId),
			staleTime: 30_000,
		},
	)
	const utils = trpcReact.useUtils()
	const deleteMutation = trpcReact.webapp.skills.delete.useMutation({
		onSuccess: () => {
			void utils.webapp.skills.list.invalidate({webappId})
		},
	})

	const skills = listQuery.data ?? []

	// Phase 157 round 10 — Popover + Magnetic + Library glyph extracted
	// so both render branches (fixed satellite + inline chrome embed)
	// share the same tree without duplication.
	const popover = (
		<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Magnetic
						intensity={0.3}
						range={60}
						springOptions={{stiffness: 200, damping: 12, mass: 0.15}}
					>
						<button
							type='button'
							aria-label='Skills'
							className={cn(
								'group relative flex h-9 w-9 items-center justify-center rounded-full bg-card-bg/90 backdrop-blur-xl border border-dash-line shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-text-secondary hover:bg-primary hover:border-primary/80 hover:text-white transition-all duration-200',
							)}
						>
							<Library className='h-4 w-4 transition-colors' strokeWidth={2.25} />
							{skills.length > 0 ? (
								<span
									className='absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center px-1 ring-2 ring-white'
									aria-label={`${skills.length} saved skills`}
								>
									{skills.length}
								</span>
							) : null}
						</button>
					</Magnetic>
				</PopoverTrigger>
				<PopoverContent side='bottom' align='end' className='w-72 p-2'>
					{skills.length === 0 ? (
						<div className='px-2 py-3 text-caption-sm text-text-tertiary'>
							No saved skills yet. Click Teach to record one.
						</div>
					) : (
						<div className='flex flex-col gap-1'>
							{skills.map((s) => (
								<div
									key={s.id}
									className='flex items-center gap-2 rounded-radius-sm px-2 py-1.5 hover:bg-surface-2'
								>
									<span className='flex-1 truncate text-caption-sm text-text-primary'>
										{s.skillName}
									</span>
									<button
										type='button'
										aria-label='Play'
										onClick={() => props.onReplaySkill?.(s.id)}
										className='flex h-6 w-6 items-center justify-center rounded-radius-xs text-text-secondary hover:bg-surface-1 hover:text-text-primary'
									>
										<Play className='h-3 w-3' />
									</button>
									<button
										type='button'
										aria-label='Delete'
										onClick={() => deleteMutation.mutate({skillId: s.id})}
										className='flex h-6 w-6 items-center justify-center rounded-radius-xs text-text-secondary hover:bg-accent-red/10 hover:text-accent-red'
									>
										<Trash2 className='h-3 w-3' />
									</button>
								</div>
							))}
						</div>
					)}
				</PopoverContent>
			</Popover>
	)

	// Inline branch — WindowChrome embeds the Skills button directly
	// into the top chrome row. No fixed positioning, no entry/exit
	// motion (the parent chrome's motion.div owns animations).
	if (inline) return popover

	return (
		<motion.div
			className='fixed select-none'
			style={{
				// Anchor at the WebApp window's top-right corner. translateX(-100%)
				// pulls the button so its right edge aligns with the window's
				// right edge; 16px offsets match the floating action bar pattern.
				left: (props.windowX ?? 0) + (props.windowWidth ?? 0) - 16,
				top: (props.windowY ?? 0) + 16,
				transform: 'translateX(-100%)',
				zIndex: (props.zIndex ?? 0) + 1,
			}}
			initial={{opacity: 0, y: -10, scale: 0.9}}
			animate={{opacity: 1, y: 0, scale: 1}}
			exit={{opacity: 0, y: -10, scale: 0.9}}
			transition={{type: 'spring', stiffness: 500, damping: 35}}
			layout
		>
			{popover}
		</motion.div>
	)
}

export default WebAppFloatingSkillsButton
