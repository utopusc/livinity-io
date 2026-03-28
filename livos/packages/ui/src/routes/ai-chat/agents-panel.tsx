import {useState} from 'react'
import {IconRobot, IconArrowLeft, IconLoader2, IconClock, IconPlayerPlay} from '@tabler/icons-react'
import {formatDistanceToNow} from 'date-fns'
import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

// ── Types ──────────────────────────────────────────────────────

type AgentsView = {mode: 'list'} | {mode: 'detail'; agentId: string}

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

// ── Agent Detail ───────────────────────────────────────────────

function AgentDetail({agentId, onBack}: {agentId: string; onBack: () => void}) {
	const agentQuery = trpcReact.ai.getSubagent.useQuery({id: agentId})
	const historyQuery = trpcReact.ai.getSubagentHistory.useQuery({id: agentId, limit: 50})

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
				<button
					onClick={onBack}
					className='mt-2 text-caption text-brand hover:underline'
				>
					Back to list
				</button>
			</div>
		)
	}

	const history = Array.isArray(historyQuery.data) ? historyQuery.data : []
	const lastResult = agent.lastResult
		? agent.lastResult.length > 200
			? agent.lastResult.slice(0, 200) + '...'
			: agent.lastResult
		: null

	return (
		<div className='flex h-full flex-col'>
			{/* Header */}
			<div className='flex flex-shrink-0 items-center gap-3 border-b border-border-default px-4 py-3'>
				<button
					onClick={onBack}
					className='rounded-radius-sm p-1 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary'
				>
					<IconArrowLeft size={16} />
				</button>
				<div className='min-w-0 flex-1'>
					<h3 className='truncate text-body font-semibold text-text-primary'>
						{agent.name || agent.id}
					</h3>
				</div>
			</div>

			{/* Content */}
			<div className='flex-1 overflow-y-auto p-3 space-y-4'>
				{/* Status + Meta */}
				<div className='flex flex-wrap items-center gap-2'>
					<StatusBadge status={agent.status} />
					{agent.tier && (
						<span className='rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-text-tertiary'>
							{agent.tier}
						</span>
					)}
					{agent.runCount !== undefined && (
						<span className='flex items-center gap-1 text-caption-sm text-text-tertiary'>
							<IconPlayerPlay size={10} />
							{agent.runCount} run{agent.runCount !== 1 ? 's' : ''}
						</span>
					)}
					{agent.lastRunAt && (
						<span className='flex items-center gap-1 text-caption-sm text-text-tertiary'>
							<IconClock size={10} />
							{formatDistanceToNow(agent.lastRunAt, {addSuffix: true})}
						</span>
					)}
				</div>

				{/* Last Result */}
				{lastResult && (
					<div>
						<h4 className='mb-1.5 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
							Last Result
						</h4>
						<div className='rounded-radius-sm bg-surface-1 p-3 text-caption text-text-secondary'>
							{lastResult}
						</div>
					</div>
				)}

				{/* Configuration */}
				<div>
					<h4 className='mb-1.5 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
						Configuration
					</h4>
					<div className='space-y-2 rounded-radius-sm bg-surface-1 p-3'>
						{agent.description && (
							<div>
								<span className='text-caption-sm font-medium text-text-tertiary'>Description</span>
								<p className='mt-0.5 text-caption text-text-secondary'>{agent.description}</p>
							</div>
						)}
						<div>
							<span className='text-caption-sm font-medium text-text-tertiary'>Tools</span>
							<p className='mt-0.5 text-caption text-text-secondary'>
								{agent.tools && agent.tools.length > 0
									? agent.tools.join(', ')
									: 'No tools configured'}
							</p>
						</div>
						<div>
							<span className='text-caption-sm font-medium text-text-tertiary'>Schedule</span>
							<p className='mt-0.5 font-mono text-caption text-text-secondary'>
								{agent.schedule || 'No schedule'}
							</p>
						</div>
						{agent.systemPrompt && (
							<div>
								<span className='text-caption-sm font-medium text-text-tertiary'>System Prompt</span>
								<p className='mt-0.5 font-mono text-caption text-text-secondary'>
									{agent.systemPrompt.length > 100
										? agent.systemPrompt.slice(0, 100) + '...'
										: agent.systemPrompt}
								</p>
							</div>
						)}
					</div>
				</div>

				{/* Chat History */}
				<div>
					<h4 className='mb-1.5 text-caption-sm font-semibold uppercase tracking-wide text-text-tertiary'>
						Chat History
					</h4>
					{historyQuery.isLoading ? (
						<div className='flex items-center justify-center py-4'>
							<IconLoader2 size={16} className='animate-spin text-text-tertiary' />
						</div>
					) : history.length === 0 ? (
						<p className='rounded-radius-sm bg-surface-1 p-3 text-center text-caption text-text-tertiary'>
							No conversation history
						</p>
					) : (
						<div className='space-y-2'>
							{history.map((msg: any, idx: number) => (
								<div
									key={idx}
									className={cn(
										'flex flex-col',
										msg.role === 'user' ? 'items-end' : 'items-start',
									)}
								>
									<div
										className={cn(
											'max-w-[85%] rounded-radius-sm px-3 py-2 text-caption',
											msg.role === 'user'
												? 'bg-brand/10 text-text-primary'
												: 'bg-surface-1 text-text-secondary',
										)}
									>
										{msg.text}
									</div>
									{msg.ts && (
										<span className='mt-0.5 text-[10px] text-text-tertiary'>
											{formatDistanceToNow(msg.ts, {addSuffix: true})}
										</span>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
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
						<div>
							<h2 className='text-body font-semibold text-text-primary'>Agents</h2>
							<p className='text-caption-sm text-text-tertiary'>
								Autonomous AI agents running on your server
							</p>
						</div>
					</div>
				</div>
			)}

			{/* Content */}
			<div className='flex-1 overflow-y-auto'>
				{view.mode === 'list' ? (
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
