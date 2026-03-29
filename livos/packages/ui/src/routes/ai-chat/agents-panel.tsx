import {useState, useRef, useEffect} from 'react'
import {IconRobot, IconArrowLeft, IconLoader2, IconClock, IconPlayerPlay, IconSend, IconPlayerStop, IconPlus, IconSettings, IconChevronDown, IconChevronUp, IconTrash, IconEdit, IconCheck, IconX} from '@tabler/icons-react'
import {formatDistanceToNow} from 'date-fns'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

// ── Types ──────────────────────────────────────────────────────

type AgentsView = {mode: 'list'} | {mode: 'detail'; agentId: string} | {mode: 'create'}

// ── Status Badge ───────────────────────────────────────────────

function StatusBadge({status}: {status: string}) {
	const colors =
		status === 'active'
			? 'bg-green-500/20 text-green-400'
			: status === 'stopped'
				? 'bg-red-500/20 text-red-400'
				: 'bg-yellow-500/20 text-yellow-400'
	return (
		<span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', colors)}>
			{status || 'active'}
		</span>
	)
}

// ── Agent List ─────────────────────────────────────────────────

function AgentList({onSelect}: {onSelect: (id: string) => void}) {
	const subagentsQuery = trpcReact.ai.listSubagents.useQuery(undefined, {refetchInterval: 5_000})

	if (subagentsQuery.isLoading) {
		return (
			<div className='flex h-full items-center justify-center'>
				<IconLoader2 size={24} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	const agents = Array.isArray(subagentsQuery.data) ? subagentsQuery.data : []

	if (agents.length === 0) {
		return (
			<div className='flex h-full flex-col items-center justify-center px-4 text-center'>
				<IconRobot size={40} className='mb-3 text-text-tertiary' />
				<p className='text-body-sm font-medium text-text-secondary'>No agents yet</p>
				<p className='mt-1 text-caption-sm text-text-tertiary'>
					Create agents from the Agents page or let AI create them autonomously
				</p>
			</div>
		)
	}

	return (
		<div className='space-y-2'>
			{agents.map((agent: any) => (
				<button
					key={agent.id}
					onClick={() => onSelect(agent.id)}
					className='group flex w-full flex-col gap-2 rounded-radius-sm border border-border-subtle bg-surface-base p-3 text-left transition-all hover:border-border-default hover:bg-surface-1'
				>
					<div className='flex items-start gap-3'>
						<div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20'>
							<IconRobot size={16} className='text-blue-400' />
						</div>
						<div className='min-w-0 flex-1'>
							<div className='flex items-center gap-2'>
								<span className='truncate text-body-sm font-medium text-text-primary'>
									{agent.name || agent.id}
								</span>
								<StatusBadge status={agent.status} />
							</div>
							{agent.description && (
								<p className='mt-0.5 truncate text-caption-sm text-text-tertiary'>
									{agent.description}
								</p>
							)}
						</div>
					</div>
					<div className='flex flex-wrap items-center gap-3 pl-11 text-caption-sm text-text-tertiary'>
						{agent.tier && (
							<span className='text-[10px] text-text-tertiary'>{agent.tier}</span>
						)}
						{agent.lastRunAt && (
							<span className='flex items-center gap-1'>
								<IconClock size={10} />
								{formatDistanceToNow(agent.lastRunAt, {addSuffix: true})}
							</span>
						)}
						{agent.runCount !== undefined && agent.runCount > 0 && (
							<span className='flex items-center gap-1'>
								<IconPlayerPlay size={10} />
								{agent.runCount} run{agent.runCount !== 1 ? 's' : ''}
							</span>
						)}
					</div>
				</button>
			))}
		</div>
	)
}

// ── Message Input ─────────────────────────────────────────────

function MessageInput({agentId}: {agentId: string}) {
	const [message, setMessage] = useState('')
	const executeMutation = trpcReact.ai.executeSubagent.useMutation()
	const utils = trpcReact.useUtils()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!message.trim() || executeMutation.isPending) return
		try {
			await executeMutation.mutateAsync({id: agentId, message: message.trim()})
			setMessage('')
			utils.ai.getSubagentHistory.invalidate({id: agentId})
			utils.ai.getSubagent.invalidate({id: agentId})
		} catch {
			// handled by tRPC
		}
	}

	return (
		<div className='border-t border-border-default px-3 py-2'>
			<form onSubmit={handleSubmit} className='flex items-center gap-2'>
				<input
					type='text'
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					placeholder='Send a message...'
					disabled={executeMutation.isPending}
					className='flex-1 rounded-radius-sm border border-border-default bg-surface-base px-3 py-2 text-caption text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand'
				/>
				<button
					type='submit'
					disabled={!message.trim() || executeMutation.isPending}
					className='rounded-radius-sm p-2 text-text-secondary transition-colors hover:bg-surface-2 hover:text-brand disabled:opacity-50'
				>
					{executeMutation.isPending ? (
						<IconLoader2 size={14} className='animate-spin' />
					) : (
						<IconSend size={14} />
					)}
				</button>
			</form>
		</div>
	)
}

// ── Loop Controls ─────────────────────────────────────────────

function LoopControls({agentId, hasLoopConfig}: {agentId: string; hasLoopConfig: boolean}) {
	const loopQuery = trpcReact.ai.getLoopStatus.useQuery({id: agentId}, {refetchInterval: 5_000, enabled: hasLoopConfig})
	const startMutation = trpcReact.ai.startLoop.useMutation()
	const stopMutation = trpcReact.ai.stopLoop.useMutation()
	const utils = trpcReact.useUtils()

	if (!hasLoopConfig) return null

	const loop = loopQuery.data as any
	const isRunning = loop?.running ?? false

	const handleStart = async () => {
		try {
			await startMutation.mutateAsync({id: agentId})
			utils.ai.getLoopStatus.invalidate({id: agentId})
			utils.ai.listSubagents.invalidate()
		} catch {
			// handled by tRPC
		}
	}

	const handleStop = async () => {
		try {
			await stopMutation.mutateAsync({id: agentId})
			utils.ai.getLoopStatus.invalidate({id: agentId})
			utils.ai.listSubagents.invalidate()
		} catch {
			// handled by tRPC
		}
	}

	return (
		<div>
			<h4 className='mb-1.5 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
				Loop Status
			</h4>
			<div className='rounded-radius-sm bg-surface-1 p-3 space-y-2'>
				<div className='flex items-center justify-between'>
					<div className='flex items-center gap-2'>
						<div className={cn('h-2 w-2 rounded-full', isRunning ? 'bg-green-500' : 'bg-red-500/50')} />
						<span className='text-caption text-text-secondary'>
							{isRunning ? 'Running' : 'Stopped'}
						</span>
					</div>
					<span className='text-caption-sm text-text-tertiary'>
						Iteration {loop?.iteration || 0}
					</span>
				</div>
				{loop?.intervalMs && (
					<p className='text-caption-sm text-text-tertiary'>
						Every {Math.round((loop.intervalMs || 0) / 1000)}s
					</p>
				)}
				{loop?.state && (
					<p className='font-mono text-[10px] text-text-tertiary'>
						{String(loop.state).length > 100 ? String(loop.state).slice(0, 100) + '...' : String(loop.state)}
					</p>
				)}
				<div>
					{isRunning ? (
						<button
							onClick={handleStop}
							disabled={stopMutation.isPending}
							className='flex items-center gap-1.5 rounded-radius-sm bg-red-500/10 px-3 py-1.5 text-caption font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50'
						>
							<IconPlayerStop size={14} />
							{stopMutation.isPending ? 'Stopping...' : 'Stop'}
						</button>
					) : (
						<button
							onClick={handleStart}
							disabled={startMutation.isPending}
							className='flex items-center gap-1.5 rounded-radius-sm bg-green-500/10 px-3 py-1.5 text-caption font-medium text-green-400 transition-colors hover:bg-green-500/20 disabled:opacity-50'
						>
							<IconPlayerPlay size={14} />
							{startMutation.isPending ? 'Starting...' : 'Start'}
						</button>
					)}
				</div>
			</div>
		</div>
	)
}

// ── Agent Detail ───────────────────────────────────────────────

function AgentDetail({agentId, onBack}: {agentId: string; onBack: () => void}) {
	const agentQuery = trpcReact.ai.getSubagent.useQuery({id: agentId})
	const historyQuery = trpcReact.ai.getSubagentHistory.useQuery({id: agentId, limit: 50}, {refetchInterval: 3_000})
	const [showConfig, setShowConfig] = useState(false)
	const [editing, setEditing] = useState(false)
	const [editForm, setEditForm] = useState({description: '', tier: '', schedule: '', systemPrompt: ''})
	const chatEndRef = useRef<HTMLDivElement>(null)
	const chatContainerRef = useRef<HTMLDivElement>(null)
	const updateMutation = trpcReact.ai.updateSubagent.useMutation()
	const deleteMutation = trpcReact.ai.deleteSubagent.useMutation()
	const utils = trpcReact.useUtils()

	// Auto-scroll to bottom when history changes or on first load
	useEffect(() => {
		if (chatEndRef.current) {
			chatEndRef.current.scrollIntoView({behavior: 'smooth'})
		}
	}, [historyQuery.data])

	if (agentQuery.isLoading) {
		return (
			<div className='flex h-full items-center justify-center'>
				<IconLoader2 size={24} className='animate-spin text-text-tertiary' />
			</div>
		)
	}

	const agent = agentQuery.data as any
	if (!agent) {
		return (
			<div className='flex h-full flex-col items-center justify-center'>
				<p className='text-body-sm text-text-tertiary'>Agent not found</p>
				<button onClick={onBack} className='mt-2 text-caption text-brand hover:underline'>Back to list</button>
			</div>
		)
	}

	const history = Array.isArray(historyQuery.data) ? historyQuery.data : []

	return (
		<div className='flex h-full flex-col'>
			{/* Header — agent name + status + back */}
			<div className='flex flex-shrink-0 items-center gap-3 border-b border-border-default px-4 py-2.5'>
				<button
					onClick={onBack}
					className='rounded-radius-sm p-1 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
				>
					<IconArrowLeft size={16} />
				</button>
				<div className='flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20'>
					<IconRobot size={14} className='text-blue-400' />
				</div>
				<div className='min-w-0 flex-1'>
					<div className='flex items-center gap-2'>
						<h3 className='truncate text-body-sm font-semibold text-text-primary'>{agent.name || agent.id}</h3>
						<StatusBadge status={agent.status} />
					</div>
					<div className='flex items-center gap-3 text-[10px] text-text-tertiary'>
						<span>{agent.tier}</span>
						{agent.runCount > 0 && <span>{agent.runCount} runs</span>}
						{agent.lastRunAt && <span>{formatDistanceToNow(agent.lastRunAt, {addSuffix: true})}</span>}
					</div>
				</div>
				<button
					onClick={() => setShowConfig(!showConfig)}
					className={cn('rounded-radius-sm p-1.5 transition-colors', showConfig ? 'bg-surface-2 text-brand' : 'text-text-tertiary hover:bg-surface-2 hover:text-text-secondary')}
					title='Agent settings'
				>
					<IconSettings size={16} />
				</button>
			</div>

			{/* Collapsible Config Panel */}
			{showConfig && (
				<div className='flex-shrink-0 border-b border-border-default bg-surface-1/50 p-3 space-y-3 max-h-[50vh] overflow-y-auto'>
					{/* Loop Controls */}
					<LoopControls agentId={agentId} hasLoopConfig={!!agent.loop || !!agent.schedule} />

					{/* Edit / View Mode */}
					{editing ? (
						<div className='space-y-2'>
							<div>
								<label className='mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-text-tertiary'>Description</label>
								<textarea value={editForm.description} onChange={e => setEditForm(f => ({...f, description: e.target.value}))} rows={2} className='w-full resize-none rounded-radius-sm border border-border-default bg-surface-base px-2.5 py-1.5 text-caption text-text-primary outline-none focus:border-brand' />
							</div>
							<div className='flex gap-2'>
								<div className='flex-1'>
									<label className='mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-text-tertiary'>Tier</label>
									<select value={editForm.tier} onChange={e => setEditForm(f => ({...f, tier: e.target.value}))} className='w-full rounded-radius-sm border border-border-default bg-surface-base px-2.5 py-1.5 text-caption text-text-primary outline-none focus:border-brand'>
										<option value='flash'>flash</option>
										<option value='sonnet'>sonnet</option>
										<option value='opus'>opus</option>
									</select>
								</div>
								<div className='flex-1'>
									<label className='mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-text-tertiary'>Schedule (cron)</label>
									<input value={editForm.schedule} onChange={e => setEditForm(f => ({...f, schedule: e.target.value}))} placeholder='0 */2 * * *' className='w-full rounded-radius-sm border border-border-default bg-surface-base px-2.5 py-1.5 font-mono text-caption text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand' />
								</div>
							</div>
							<div>
								<label className='mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-text-tertiary'>System Prompt</label>
								<textarea value={editForm.systemPrompt} onChange={e => setEditForm(f => ({...f, systemPrompt: e.target.value}))} rows={4} className='w-full resize-none rounded-radius-sm border border-border-default bg-surface-base px-2.5 py-1.5 font-mono text-caption text-text-primary outline-none focus:border-brand' />
							</div>
							<div className='flex gap-2'>
								<button
									onClick={async () => {
										await updateMutation.mutateAsync({id: agentId, ...editForm})
										utils.ai.getSubagent.invalidate({id: agentId})
										utils.ai.listSubagents.invalidate()
										setEditing(false)
									}}
									disabled={updateMutation.isPending}
									className='flex items-center gap-1 rounded-radius-sm bg-brand px-3 py-1.5 text-caption font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50'
								>
									<IconCheck size={14} />
									{updateMutation.isPending ? 'Saving...' : 'Save'}
								</button>
								<button onClick={() => setEditing(false)} className='flex items-center gap-1 rounded-radius-sm bg-surface-2 px-3 py-1.5 text-caption text-text-secondary transition-colors hover:bg-surface-3'>
									<IconX size={14} />
									Cancel
								</button>
							</div>
						</div>
					) : (
						<div className='space-y-1.5'>
							{agent.description && (
								<div className='flex gap-2'>
									<span className='text-[10px] font-medium uppercase tracking-wide text-text-tertiary w-16 flex-shrink-0'>Desc</span>
									<p className='text-caption-sm text-text-secondary'>{agent.description.length > 120 ? agent.description.slice(0, 120) + '...' : agent.description}</p>
								</div>
							)}
							<div className='flex gap-2'>
								<span className='text-[10px] font-medium uppercase tracking-wide text-text-tertiary w-16 flex-shrink-0'>Tools</span>
								<p className='text-caption-sm text-text-secondary'>
									{agent.tools && agent.tools.length > 0 ? agent.tools.join(', ') : 'All tools'}
								</p>
							</div>
							{agent.schedule && (
								<div className='flex gap-2'>
									<span className='text-[10px] font-medium uppercase tracking-wide text-text-tertiary w-16 flex-shrink-0'>Cron</span>
									<p className='font-mono text-caption-sm text-text-secondary'>{agent.schedule}</p>
								</div>
							)}
							{agent.systemPrompt && (
								<div className='flex gap-2'>
									<span className='text-[10px] font-medium uppercase tracking-wide text-text-tertiary w-16 flex-shrink-0'>Prompt</span>
									<p className='text-caption-sm text-text-secondary'>
										{agent.systemPrompt.length > 150 ? agent.systemPrompt.slice(0, 150) + '...' : agent.systemPrompt}
									</p>
								</div>
							)}

							{/* Edit + Delete buttons */}
							<div className='flex gap-2 pt-2'>
								<button
									onClick={() => {
										setEditForm({
											description: agent.description || '',
											tier: agent.tier || 'sonnet',
											schedule: agent.schedule || '',
											systemPrompt: agent.systemPrompt || '',
										})
										setEditing(true)
									}}
									className='flex items-center gap-1 rounded-radius-sm bg-surface-2 px-3 py-1.5 text-caption text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary'
								>
									<IconEdit size={13} />
									Edit
								</button>
								<button
									onClick={async () => {
										if (!confirm(`Delete agent "${agent.name}"?`)) return
										await deleteMutation.mutateAsync({id: agentId})
										utils.ai.listSubagents.invalidate()
										onBack()
									}}
									disabled={deleteMutation.isPending}
									className='flex items-center gap-1 rounded-radius-sm bg-red-500/10 px-3 py-1.5 text-caption text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50'
								>
									<IconTrash size={13} />
									{deleteMutation.isPending ? 'Deleting...' : 'Delete'}
								</button>
							</div>
						</div>
					)}
				</div>
			)}

			{/* Chat area — scrollable, starts at bottom */}
			<div ref={chatContainerRef} className='flex-1 overflow-y-auto px-4 py-3'>
				{historyQuery.isLoading ? (
					<div className='flex h-full items-center justify-center'>
						<IconLoader2 size={16} className='animate-spin text-text-tertiary' />
					</div>
				) : history.length === 0 ? (
					<div className='flex h-full flex-col items-center justify-center text-center'>
						<IconRobot size={32} className='mb-2 text-text-tertiary' />
						<p className='text-caption text-text-tertiary'>No conversation yet</p>
						<p className='mt-1 text-[10px] text-text-tertiary'>Send a message to start chatting with this agent</p>
					</div>
				) : (
					<div className='space-y-3'>
						{history.map((msg: any, idx: number) => (
							<div
								key={idx}
								className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}
							>
								<div
									className={cn(
										'max-w-[90%] rounded-xl px-3.5 py-2.5 text-body-sm leading-relaxed',
										msg.role === 'user'
											? 'bg-brand/10 text-text-primary rounded-br-sm'
											: 'bg-surface-1 text-text-secondary rounded-bl-sm',
									)}
								>
									<pre className='whitespace-pre-wrap break-words font-sans'>{msg.text}</pre>
								</div>
								{msg.ts && (
									<span className='mt-1 text-[10px] text-text-tertiary'>
										{formatDistanceToNow(msg.ts, {addSuffix: true})}
									</span>
								)}
							</div>
						))}
						<div ref={chatEndRef} />
					</div>
				)}
			</div>

			{/* Message Input (pinned to bottom) */}
			<MessageInput agentId={agentId} />
		</div>
	)
}

// ── Create Agent Form ──────────────────────────────────────────

function CreateAgentForm({onClose}: {onClose: () => void}) {
	const [form, setForm] = useState({name: '', description: '', tier: 'sonnet' as 'flash' | 'sonnet' | 'opus'})
	const createMutation = trpcReact.ai.createSubagent.useMutation()
	const utils = trpcReact.useUtils()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!form.name.trim() || createMutation.isPending) return
		const id = form.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
		try {
			await createMutation.mutateAsync({
				id,
				name: form.name,
				description: form.description,
				tier: form.tier,
			})
			utils.ai.listSubagents.invalidate()
			onClose()
		} catch {
			// handled by tRPC
		}
	}

	return (
		<form onSubmit={handleSubmit} className='space-y-3 rounded-radius-sm border border-border-default bg-surface-1 p-3'>
			<div className='flex items-center justify-between'>
				<span className='text-body-sm font-semibold text-text-primary'>New Agent</span>
				<button type='button' onClick={onClose} className='text-caption text-text-tertiary transition-colors hover:text-text-secondary'>
					Cancel
				</button>
			</div>

			<div>
				<label className='mb-1 block text-caption-sm font-medium text-text-tertiary'>Name</label>
				<input
					value={form.name}
					onChange={(e) => setForm((f) => ({...f, name: e.target.value}))}
					placeholder='e.g. Research Assistant'
					required
					className='w-full rounded-radius-sm border border-border-default bg-surface-base px-2.5 py-1.5 text-caption text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand'
				/>
			</div>

			<div>
				<label className='mb-1 block text-caption-sm font-medium text-text-tertiary'>Description</label>
				<textarea
					value={form.description}
					onChange={(e) => setForm((f) => ({...f, description: e.target.value}))}
					placeholder='What does this agent do?'
					rows={2}
					className='w-full resize-none rounded-radius-sm border border-border-default bg-surface-base px-2.5 py-1.5 text-caption text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand'
				/>
			</div>

			<div>
				<label className='mb-1 block text-caption-sm font-medium text-text-tertiary'>Model Tier</label>
				<select
					value={form.tier}
					onChange={(e) => setForm((f) => ({...f, tier: e.target.value as 'flash' | 'sonnet' | 'opus'}))}
					className='w-full rounded-radius-sm border border-border-default bg-surface-base px-2.5 py-1.5 text-caption text-text-primary outline-none focus:border-brand'
				>
					<option value='flash'>flash</option>
					<option value='sonnet'>sonnet</option>
					<option value='opus'>opus</option>
				</select>
			</div>

			<button
				type='submit'
				disabled={!form.name.trim() || createMutation.isPending}
				className='w-full rounded-radius-sm bg-brand px-3 py-1.5 text-caption font-medium text-white transition-colors hover:bg-brand/90 disabled:opacity-50'
			>
				{createMutation.isPending ? 'Creating...' : 'Create Agent'}
			</button>
		</form>
	)
}

// ── Main Panel ─────────────────────────────────────────────────

export default function AgentsPanel() {
	const [view, setView] = useState<AgentsView>({mode: 'list'})

	return (
		<div className='flex h-full flex-col bg-surface-base'>
			{/* Header (only in list mode) */}
			{view.mode === 'list' && (
				<div className='flex-shrink-0 border-b border-border-default px-4 py-3'>
					<div className='flex items-center gap-3'>
						<div className='flex h-8 w-8 items-center justify-center rounded-radius-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20'>
							<IconRobot size={16} className='text-blue-400' />
						</div>
						<div className='flex-1'>
							<h2 className='text-body font-semibold text-text-primary'>Agents</h2>
							<p className='text-caption-sm text-text-tertiary'>
								Autonomous AI agents running on your server
							</p>
						</div>
						<button
							onClick={() => setView({mode: 'create'})}
							className='rounded-radius-sm p-1.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-brand'
						>
							<IconPlus size={16} />
						</button>
					</div>
				</div>
			)}

			{/* Content */}
			<div className='flex-1 overflow-y-auto'>
				{view.mode === 'create' ? (
					<div className='p-3'>
						<CreateAgentForm onClose={() => setView({mode: 'list'})} />
					</div>
				) : view.mode === 'list' ? (
					<div className='p-3'>
						<AgentList onSelect={(id) => setView({mode: 'detail', agentId: id})} />
					</div>
				) : (
					<AgentDetail
						agentId={view.agentId}
						onBack={() => setView({mode: 'list'})}
					/>
				)}
			</div>
		</div>
	)
}
