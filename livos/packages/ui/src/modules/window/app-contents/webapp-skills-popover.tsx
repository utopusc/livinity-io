// Phase 100-09-06 — WebAppSkillsPopover.
//
// Per D-100-09-E1 (CONTEXT.md 09-06): top-right Skills popover replaces
// the deleted teach drawer's skills sidebar. Lightweight; doesn't eat
// horizontal space when closed. Trigger button anchored at absolute
// top-right of the WebApp stream window.
//
// Lists user's saved skills for this webapp via webapp.skills.list.
// Each row: skill name + Play (replay) + Delete buttons. Replay is
// surfaced via the optional `onReplaySkill` callback so the parent
// (webapp-stream-window.tsx) can wire it to the existing
// SkillReplayScrubber path (P96-06).
//
// Sacred SHA: liv/packages/core/src/sdk-agent-runner.ts unchanged.

import {useState} from 'react'
import {Library, Play, Trash2} from 'lucide-react'

import {trpcReact} from '@/trpc/trpc'
import {Popover, PopoverContent, PopoverTrigger} from '@/shadcn-components/ui/popover'
import {cn} from '@/shadcn-lib/utils'

export interface WebAppSkillsPopoverProps {
	webappId: string
	/** Optional callback when user clicks Play on a skill. */
	onReplaySkill?: (skillId: string) => void
}

export function WebAppSkillsPopover({webappId, onReplaySkill}: WebAppSkillsPopoverProps) {
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

	return (
		<div className='absolute right-2 top-2 z-20'>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<button
						type='button'
						aria-label='Skills'
						className={cn(
							'flex h-8 items-center gap-1.5 rounded-radius-sm bg-card-bg/90 px-2.5 backdrop-blur-md',
							'border border-border-default text-caption-sm text-text-primary',
							'hover:bg-card-bg shadow-sm',
						)}
					>
						<Library className='h-3.5 w-3.5' />
						<span>Skills</span>
						{skills.length > 0 ? (
							<span className='ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-2 px-1 text-caption-xs'>
								{skills.length}
							</span>
						) : null}
					</button>
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
										onClick={() => onReplaySkill?.(s.id)}
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
		</div>
	)
}

export default WebAppSkillsPopover
