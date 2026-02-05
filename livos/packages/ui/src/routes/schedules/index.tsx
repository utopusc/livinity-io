import {useState} from 'react'
import {IconClock, IconPlus, IconTrash, IconCalendarEvent} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'

function AddScheduleForm({onClose}: {onClose: () => void}) {
	const [form, setForm] = useState({
		subagentId: '',
		task: '',
		cron: '',
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	})

	const addMutation = trpcReact.ai.addSchedule.useMutation()
	const subagentsQuery = trpcReact.ai.listSubagents.useQuery()
	const utils = trpcReact.useUtils()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		try {
			await addMutation.mutateAsync(form)
			utils.ai.listSchedules.invalidate()
			onClose()
		} catch {
			// handled by tRPC
		}
	}

	const cronPresets = [
		{label: 'Every minute', value: '* * * * *'},
		{label: 'Every hour', value: '0 * * * *'},
		{label: 'Every day at 9am', value: '0 9 * * *'},
		{label: 'Weekdays at 9am', value: '0 9 * * MON-FRI'},
		{label: 'Every Sunday', value: '0 0 * * SUN'},
		{label: 'First of month', value: '0 0 1 * *'},
	]

	return (
		<form onSubmit={handleSubmit} className='space-y-4 rounded-xl border border-white/10 bg-white/5 p-6'>
			<h3 className='text-lg font-semibold text-white'>Add Schedule</h3>

			<div>
				<label className='mb-1 block text-xs font-medium text-white/50'>Subagent *</label>
				<select
					value={form.subagentId}
					onChange={(e) => setForm((f) => ({...f, subagentId: e.target.value}))}
					className='w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
					required
				>
					<option value=''>Select a subagent...</option>
					{(Array.isArray(subagentsQuery.data) ? subagentsQuery.data : []).map((agent: any) => (
						<option key={agent.id} value={agent.id}>
							{agent.name || agent.id}
						</option>
					))}
				</select>
			</div>

			<div>
				<label className='mb-1 block text-xs font-medium text-white/50'>Task *</label>
				<textarea
					value={form.task}
					onChange={(e) => setForm((f) => ({...f, task: e.target.value}))}
					rows={2}
					placeholder='Describe what the agent should do...'
					className='w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-500'
					required
				/>
			</div>

			<div>
				<label className='mb-1 block text-xs font-medium text-white/50'>Cron Expression *</label>
				<input
					value={form.cron}
					onChange={(e) => setForm((f) => ({...f, cron: e.target.value}))}
					placeholder='0 9 * * MON-FRI'
					className='w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white outline-none focus:border-blue-500'
					required
				/>
				<div className='mt-2 flex flex-wrap gap-2'>
					{cronPresets.map((preset) => (
						<button
							key={preset.value}
							type='button'
							onClick={() => setForm((f) => ({...f, cron: preset.value}))}
							className='rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80'
						>
							{preset.label}
						</button>
					))}
				</div>
			</div>

			<div>
				<label className='mb-1 block text-xs font-medium text-white/50'>Timezone</label>
				<input
					value={form.timezone}
					onChange={(e) => setForm((f) => ({...f, timezone: e.target.value}))}
					className='w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60 outline-none focus:border-blue-500'
				/>
			</div>

			<div className='flex justify-end gap-3'>
				<button
					type='button'
					onClick={onClose}
					className='rounded-lg px-4 py-2 text-sm text-white/60 hover:text-white'
				>
					Cancel
				</button>
				<button
					type='submit'
					disabled={addMutation.isPending}
					className='rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500 disabled:opacity-50'
				>
					{addMutation.isPending ? 'Adding...' : 'Add Schedule'}
				</button>
			</div>
		</form>
	)
}

export default function Schedules() {
	const [showAdd, setShowAdd] = useState(false)

	const schedulesQuery = trpcReact.ai.listSchedules.useQuery(undefined, {refetchInterval: 5_000})
	const removeMutation = trpcReact.ai.removeSchedule.useMutation()
	const utils = trpcReact.useUtils()

	const handleRemove = async (subagentId: string) => {
		if (!confirm(`Remove schedule for "${subagentId}"?`)) return
		await removeMutation.mutateAsync({subagentId})
		utils.ai.listSchedules.invalidate()
	}

	const schedules = Array.isArray(schedulesQuery.data) ? schedulesQuery.data : []

	return (
		<div className='space-y-6'>
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-white'>Scheduled Tasks</h1>
					<p className='mt-1 text-sm text-white/50'>Manage cron jobs and automated agent tasks</p>
				</div>
				<button
					onClick={() => setShowAdd(!showAdd)}
					className='flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500'
				>
					<IconPlus size={16} />
					Add Schedule
				</button>
			</div>

			{showAdd && <AddScheduleForm onClose={() => setShowAdd(false)} />}

			{/* Schedule List */}
			{schedulesQuery.isLoading ? (
				<div className='py-8 text-center text-sm text-white/40'>Loading schedules...</div>
			) : schedules.length === 0 ? (
				<div className='rounded-xl border border-white/10 bg-white/5 p-8 text-center'>
					<IconCalendarEvent size={48} className='mx-auto mb-4 text-white/20' />
					<p className='text-sm text-white/40'>No scheduled tasks. Create one to automate agent work.</p>
				</div>
			) : (
				<div className='space-y-3'>
					{schedules.map((schedule: any) => (
						<div
							key={schedule.subagentId || schedule.id}
							className='rounded-xl border border-white/10 bg-white/5 p-4'
						>
							<div className='flex items-start justify-between'>
								<div className='flex items-center gap-3'>
									<div className='flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20'>
										<IconClock size={20} className='text-purple-400' />
									</div>
									<div>
										<div className='font-medium text-white'>{schedule.subagentId || schedule.name}</div>
										<div className='mt-0.5 text-xs text-white/40'>{schedule.task || 'No task specified'}</div>
									</div>
								</div>
								<button
									onClick={() => handleRemove(schedule.subagentId || schedule.id)}
									className='rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-red-400'
									title='Remove'
								>
									<IconTrash size={16} />
								</button>
							</div>
							<div className='mt-3 flex flex-wrap gap-3 text-xs'>
								<span className='rounded-md bg-purple-500/10 px-2 py-1 font-mono text-purple-400'>
									{schedule.cron}
								</span>
								{schedule.timezone && <span className='text-white/40'>TZ: {schedule.timezone}</span>}
								{schedule.lastRun && (
									<span className='text-white/40'>Last run: {new Date(schedule.lastRun).toLocaleString()}</span>
								)}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
