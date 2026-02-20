import {IconCalendar, IconTrash, IconClock, IconRobot} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'

export default function Schedules() {
	const schedulesQuery = trpcReact.ai.listSchedules.useQuery(undefined, {refetchInterval: 10_000})
	const removeMutation = trpcReact.ai.removeSchedule.useMutation()
	const utils = trpcReact.useUtils()

	const handleRemove = async (subagentId: string) => {
		if (!confirm(`Remove schedule for "${subagentId}"?`)) return
		await removeMutation.mutateAsync({subagentId})
		utils.ai.listSchedules.invalidate()
	}

	const schedules: any[] = Array.isArray(schedulesQuery.data) ? schedulesQuery.data : []

	function formatNextRun(next?: string) {
		if (!next) return null
		try {
			const d = new Date(next)
			return d.toLocaleString()
		} catch {
			return next
		}
	}

	return (
		<div className='space-y-6'>
			<div>
				<h1 className='text-2xl font-bold text-white'>Schedules</h1>
				<p className='mt-1 text-sm text-white/50'>Cron-based recurring tasks managed by Nexus</p>
			</div>

			{schedulesQuery.isLoading ? (
				<div className='py-8 text-center text-sm text-white/40'>Loading schedules...</div>
			) : schedules.length === 0 ? (
				<div className='rounded-xl border border-white/10 bg-white/5 p-8 text-center'>
					<IconCalendar size={48} className='mx-auto mb-4 text-white/20' />
					<p className='text-sm text-white/40'>No scheduled tasks yet.</p>
					<p className='mt-1 text-xs text-white/30'>
						Ask the AI to create a subagent with a cron schedule, or use the Subagents page.
					</p>
				</div>
			) : (
				<div className='space-y-3'>
					{schedules.map((s: any) => (
						<div key={s.subagentId || s.jobName} className='rounded-xl border border-white/10 bg-white/5 p-4'>
							<div className='flex items-start justify-between'>
								<div className='flex items-center gap-3'>
									<div className='flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/20'>
										<IconRobot size={20} className='text-violet-400' />
									</div>
									<div>
										<div className='font-medium text-white'>{s.subagentId || s.jobName}</div>
										{s.task && (
											<div className='mt-0.5 max-w-md truncate text-xs text-white/40'>{s.task}</div>
										)}
									</div>
								</div>
								<button
									onClick={() => handleRemove(s.subagentId || s.jobName)}
									disabled={removeMutation.isPending}
									className='rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-red-400 disabled:opacity-50'
									title='Remove schedule'
								>
									<IconTrash size={16} />
								</button>
							</div>

							<div className='mt-3 flex flex-wrap gap-4 text-xs text-white/50'>
								<span className='flex items-center gap-1'>
									<IconClock size={12} />
									<span className='font-mono'>{s.cron}</span>
								</span>
								{s.timezone && <span>TZ: {s.timezone}</span>}
								{s.next && (
									<span className='text-white/30'>
										Next: {formatNextRun(s.next)}
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
