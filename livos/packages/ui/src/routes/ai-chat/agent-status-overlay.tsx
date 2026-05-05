import {IconBrain, IconCheck, IconLoader2, IconX} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'
import type {AgentStatus} from '@/hooks/use-agent-socket'

/** Format tool name for display: strip mcp__servername__ prefix */
function formatToolName(name: string): string {
	const match = name.match(/^mcp__[^_]+__(.+)$/)
	return match ? match[1] : name
}

export function AgentStatusOverlay({status}: {status: AgentStatus}) {
	if (status.phase === 'idle') return null

	const hasSteps = status.steps.length > 0
	const visibleSteps = status.steps.slice(-6)

	return (
		// data-tour: P75 reasoning card will replace this anchor when shipped.
		// Phase 76-07 wires this transitional anchor so the LIV_TOUR_STEPS step 7
		// (`reasoning-card`) has a target element. Spotlight gracefully degrades
		// when the overlay is not visible (phase === 'idle').
		<div data-tour='reasoning-card' className='mb-3 rounded-lg border border-border-default bg-surface-1 overflow-hidden'>
			{/* Thinking indicator -- shown when phase is 'thinking' and no steps yet, or between tool calls */}
			{status.phase === 'thinking' && (
				<div className='flex items-center gap-2 px-3 py-2 text-body-sm text-text-secondary'>
					<IconBrain size={14} className='animate-pulse text-violet-400' />
					<span>Thinking...</span>
				</div>
			)}

			{/* Current tool badge -- shown when a tool is actively executing */}
			{status.phase === 'executing' && status.currentTool && (
				<div className='flex items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-body-sm'>
					<IconLoader2 size={14} className='animate-spin text-violet-400' />
					<span className='font-mono text-xs font-medium text-violet-300'>
						{formatToolName(status.currentTool)}
					</span>
				</div>
			)}

			{/* Steps list -- shows completed and running steps */}
			{hasSteps && (
				<div className='px-3 py-2 space-y-1.5'>
					{visibleSteps.map((step) => (
						<div key={step.id} className='flex items-center gap-2 text-body-sm'>
							{step.status === 'running' ? (
								<IconLoader2 size={14} className='flex-shrink-0 animate-spin text-violet-400' />
							) : step.status === 'error' ? (
								<IconX size={14} className='flex-shrink-0 text-red-400' />
							) : (
								<IconCheck size={14} className='flex-shrink-0 text-green-400' />
							)}
							<span className={cn(
								step.status === 'running' ? 'text-text-primary' : 'text-text-tertiary',
							)}>
								{step.description}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
