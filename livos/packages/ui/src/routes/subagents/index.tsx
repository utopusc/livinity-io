import {useState} from 'react'
import {
	IconRobot,
	IconPlus,
	IconTrash,
	IconPlayerPlay,
	IconPencil,
	IconClock,
} from '@tabler/icons-react'

import {trpcReact} from '@/trpc/trpc'

function CreateSubagentForm({onClose}: {onClose: () => void}) {
	const [form, setForm] = useState({
		id: '',
		name: '',
		description: '',
		systemPrompt: '',
		tier: 'sonnet' as const,
		maxTurns: 10,
		schedule: '',
		scheduledTask: '',
	})

	const createMutation = trpcReact.ai.createSubagent.useMutation()
	const utils = trpcReact.useUtils()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		const id = form.id || form.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
		try {
			await createMutation.mutateAsync({
				id,
				name: form.name,
				description: form.description,
				systemPrompt: form.systemPrompt || undefined,
				tier: form.tier,
				maxTurns: form.maxTurns,
				schedule: form.schedule || undefined,
				scheduledTask: form.scheduledTask || undefined,
			})
			utils.ai.listSubagents.invalidate()
			onClose()
		} catch (error) {
			// handled by tRPC
		}
	}

	return (
		<form onSubmit={handleSubmit} className='space-y-4 rounded-xl border border-border-default bg-surface-base p-6'>
			<h3 className='text-lg font-semibold text-text-primary'>Create Subagent</h3>

			<div className='grid grid-cols-2 gap-4'>
				<div>
					<label className='mb-1 block text-xs font-medium text-text-secondary'>Name *</label>
					<input
						value={form.name}
						onChange={(e) => setForm((f) => ({...f, name: e.target.value}))}
						className='w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-text-primary outline-none focus:border-brand'
						required
					/>
				</div>
				<div>
					<label className='mb-1 block text-xs font-medium text-text-secondary'>ID (auto-generated)</label>
					<input
						value={form.id}
						onChange={(e) => setForm((f) => ({...f, id: e.target.value}))}
						placeholder={form.name.toLowerCase().replace(/\s+/g, '-')}
						className='w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-text-secondary outline-none focus:border-brand'
					/>
				</div>
			</div>

			<div>
				<label className='mb-1 block text-xs font-medium text-text-secondary'>Description *</label>
				<textarea
					value={form.description}
					onChange={(e) => setForm((f) => ({...f, description: e.target.value}))}
					rows={2}
					className='w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-text-primary outline-none focus:border-brand'
					required
				/>
			</div>

			<div>
				<label className='mb-1 block text-xs font-medium text-text-secondary'>System Prompt</label>
				<textarea
					value={form.systemPrompt}
					onChange={(e) => setForm((f) => ({...f, systemPrompt: e.target.value}))}
					rows={3}
					className='w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-text-primary outline-none focus:border-brand'
					placeholder='Optional custom system prompt...'
				/>
			</div>

			<div className='grid grid-cols-2 gap-4'>
				<div>
					<label className='mb-1 block text-xs font-medium text-text-secondary'>Model Tier</label>
					<select
						value={form.tier}
						onChange={(e) => setForm((f) => ({...f, tier: e.target.value as any}))}
						className='w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-text-primary outline-none focus:border-brand'
					>
						<option value='flash'>Flash (fast, cheap)</option>
						<option value='sonnet'>Sonnet (balanced)</option>
						<option value='opus'>Opus (powerful)</option>
					</select>
				</div>
				<div>
					<label className='mb-1 block text-xs font-medium text-text-secondary'>Max Turns</label>
					<input
						type='number'
						value={form.maxTurns}
						onChange={(e) => setForm((f) => ({...f, maxTurns: parseInt(e.target.value) || 10}))}
						className='w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-text-primary outline-none focus:border-brand'
					/>
				</div>
			</div>

			<div className='grid grid-cols-2 gap-4'>
				<div>
					<label className='mb-1 block text-xs font-medium text-text-secondary'>Cron Schedule</label>
					<input
						value={form.schedule}
						onChange={(e) => setForm((f) => ({...f, schedule: e.target.value}))}
						placeholder='e.g. 0 9 * * MON-FRI'
						className='w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-text-secondary outline-none focus:border-brand'
					/>
				</div>
				<div>
					<label className='mb-1 block text-xs font-medium text-text-secondary'>Scheduled Task</label>
					<input
						value={form.scheduledTask}
						onChange={(e) => setForm((f) => ({...f, scheduledTask: e.target.value}))}
						placeholder='Task to run on schedule'
						className='w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-text-secondary outline-none focus:border-brand'
					/>
				</div>
			</div>

			<div className='flex justify-end gap-3'>
				<button
					type='button'
					onClick={onClose}
					className='rounded-lg px-4 py-2 text-sm text-text-secondary hover:text-text-primary'
				>
					Cancel
				</button>
				<button
					type='submit'
					disabled={createMutation.isPending}
					className='rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500 disabled:opacity-50'
				>
					{createMutation.isPending ? 'Creating...' : 'Create'}
				</button>
			</div>
		</form>
	)
}

export default function Subagents() {
	const [showCreate, setShowCreate] = useState(false)
	const [executeResult, setExecuteResult] = useState<{id: string; result: string} | null>(null)

	const subagentsQuery = trpcReact.ai.listSubagents.useQuery(undefined, {refetchInterval: 5_000})
	const deleteMutation = trpcReact.ai.deleteSubagent.useMutation()
	const executeMutation = trpcReact.ai.executeSubagent.useMutation()
	const utils = trpcReact.useUtils()

	const handleDelete = async (id: string) => {
		if (!confirm(`Delete subagent "${id}"?`)) return
		await deleteMutation.mutateAsync({id})
		utils.ai.listSubagents.invalidate()
	}

	const handleExecute = async (id: string) => {
		const message = prompt('Enter message for the subagent:')
		if (!message) return
		try {
			const result = await executeMutation.mutateAsync({id, message})
			setExecuteResult({id, result: JSON.stringify(result, null, 2)})
		} catch (error: any) {
			setExecuteResult({id, result: `Error: ${error.message}`})
		}
	}

	return (
		<div className='space-y-6'>
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-2xl font-bold text-text-primary'>Subagents</h1>
					<p className='mt-1 text-sm text-text-secondary'>Create and manage autonomous AI agents</p>
				</div>
				<button
					onClick={() => setShowCreate(!showCreate)}
					className='flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-500'
				>
					<IconPlus size={16} />
					New Subagent
				</button>
			</div>

			{showCreate && <CreateSubagentForm onClose={() => setShowCreate(false)} />}

			{/* Subagent List */}
			{subagentsQuery.isLoading ? (
				<div className='py-8 text-center text-sm text-text-tertiary'>Loading subagents...</div>
			) : !subagentsQuery.data || (Array.isArray(subagentsQuery.data) && subagentsQuery.data.length === 0) ? (
				<div className='rounded-xl border border-border-default bg-surface-base p-8 text-center'>
					<IconRobot size={48} className='mx-auto mb-4 text-text-tertiary' />
					<p className='text-sm text-text-tertiary'>No subagents yet. Create one to get started.</p>
				</div>
			) : (
				<div className='space-y-3'>
					{(Array.isArray(subagentsQuery.data) ? subagentsQuery.data : []).map((agent: any) => (
						<div key={agent.id} className='rounded-xl border border-border-default bg-surface-base p-4'>
							<div className='flex items-start justify-between'>
								<div className='flex items-center gap-3'>
									<div className='flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20'>
										<IconRobot size={20} className='text-blue-400' />
									</div>
									<div>
										<div className='font-medium text-text-primary'>{agent.name || agent.id}</div>
										<div className='text-xs text-text-tertiary'>{agent.description || 'No description'}</div>
									</div>
								</div>
								<div className='flex items-center gap-1'>
									<span
										className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
											agent.status === 'active'
												? 'bg-green-500/20 text-green-400'
												: 'bg-yellow-500/20 text-yellow-400'
										}`}
									>
										{agent.status || 'active'}
									</span>
									<button
										onClick={() => handleExecute(agent.id)}
										className='rounded-lg p-1.5 text-text-tertiary hover:bg-surface-1 hover:text-green-400'
										title='Execute'
									>
										<IconPlayerPlay size={16} />
									</button>
									<button
										onClick={() => handleDelete(agent.id)}
										className='rounded-lg p-1.5 text-text-tertiary hover:bg-surface-1 hover:text-red-400'
										title='Delete'
									>
										<IconTrash size={16} />
									</button>
								</div>
							</div>
							<div className='mt-3 flex flex-wrap gap-3 text-xs text-text-tertiary'>
								<span>Tier: {agent.tier || 'sonnet'}</span>
								<span>Max Turns: {agent.maxTurns || 10}</span>
								{agent.schedule && (
									<span className='flex items-center gap-1'>
										<IconClock size={12} />
										{agent.schedule}
									</span>
								)}
								{agent.runCount !== undefined && <span>Runs: {agent.runCount}</span>}
							</div>
						</div>
					))}
				</div>
			)}

			{/* Execute Result */}
			{executeResult && (
				<div className='rounded-xl border border-border-default bg-surface-base p-4'>
					<div className='mb-2 flex items-center justify-between'>
						<div className='text-xs font-medium uppercase text-text-tertiary'>
							Execution Result — {executeResult.id}
						</div>
						<button onClick={() => setExecuteResult(null)} className='text-xs text-text-tertiary hover:text-text-primary'>
							Dismiss
						</button>
					</div>
					<pre className='max-h-60 overflow-auto whitespace-pre-wrap text-sm text-text-secondary'>
						{executeResult.result}
					</pre>
				</div>
			)}
		</div>
	)
}
