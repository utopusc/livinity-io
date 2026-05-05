/**
 * AgentSelector.tsx — Phase 88 (V32-MIGRATE-04)
 *
 * Compact agent dropdown rendered in the v32 chat top bar.
 *
 * Backed by `agents.list` tRPC (P85). Default selection priority:
 *   1. The agent the user previously picked (caller-controlled `value`)
 *   2. An agent with `isDefault === true`
 *   3. The known seed UUID `11111111-1111-4111-8111-111111111111` (Liv Default)
 *   4. The first agent in the list
 *
 * Why an agent selector here, in P88:
 *   - P84 deferred wiring the composer "+ MCP" install button because the v32
 *     chat had no concept of "the active agent". P88 introduces that concept
 *     so a future plan (or P90 cutover) can include `agentId` in the
 *     `/api/agent/start` body and "+ MCP" can install to the right agent.
 *
 * D-LIV-STYLED + D-NO-NEW-DEPS — uses existing shadcn `Select` + Tabler icons.
 */

import {useEffect, useMemo} from 'react'
import {IconRobot} from '@tabler/icons-react'

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/shadcn-components/ui/select'
import {cn} from '@/shadcn-lib/utils'

import {useAgents, type Agent} from '../../agents/agents-api'

/** Known seed UUID for the system "Liv Default" agent (from v32-DRAFT.md §7). */
export const LIV_DEFAULT_SEED_AGENT_ID = '11111111-1111-4111-8111-111111111111'

interface AgentSelectorProps {
	/** Currently selected agent id (controlled). Pass undefined to let the
	 * component pick a default — it will call onChange with that default
	 * once the agents list loads. */
	value: string | undefined
	onChange: (agentId: string, agent: Agent | undefined) => void
	disabled?: boolean
	className?: string
}

export function AgentSelector({
	value,
	onChange,
	disabled = false,
	className,
}: AgentSelectorProps) {
	const query = useAgents({})
	const agents: Agent[] = useMemo(() => query.data?.rows ?? [], [query.data])

	// Compute the default agent id — first the explicit isDefault flag, then
	// the well-known seed UUID, then the first row.
	const computedDefault = useMemo<string | undefined>(() => {
		if (agents.length === 0) return undefined
		const flagged = agents.find((a) => a.isDefault)
		if (flagged) return flagged.id
		const seed = agents.find((a) => a.id === LIV_DEFAULT_SEED_AGENT_ID)
		if (seed) return seed.id
		return agents[0].id
	}, [agents])

	// On first agents-list load, if caller has no value, push the computed
	// default up. This is the ONE place we coerce — avoids forcing every
	// caller to compute a fallback.
	useEffect(() => {
		if (value !== undefined) return
		if (!computedDefault) return
		const agent = agents.find((a) => a.id === computedDefault)
		onChange(computedDefault, agent)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [computedDefault])

	const selected = useMemo<Agent | undefined>(
		() => agents.find((a) => a.id === value),
		[agents, value],
	)

	const isLoading = query.isLoading
	const isEmpty = !isLoading && agents.length === 0

	return (
		<div className={cn('inline-flex items-center', className)}>
			<Select
				value={value ?? ''}
				onValueChange={(next) => {
					const agent = agents.find((a) => a.id === next)
					onChange(next, agent)
				}}
				disabled={disabled || isLoading || isEmpty}
			>
				<SelectTrigger
					aria-label='Select agent'
					className={cn(
						'h-8 gap-1.5 rounded-full border border-liv-border',
						'bg-liv-card px-3 text-xs font-medium text-liv-foreground',
						'hover:bg-liv-accent hover:text-liv-accent-foreground',
						'focus-visible:ring-2 focus-visible:ring-liv-ring',
						'transition-colors',
						// shrink padding inside the shadcn trigger so caret sits tight
						'[&>svg]:opacity-60',
						'w-auto min-w-[140px]',
					)}
				>
					<AgentTriggerLabel
						agent={selected}
						isLoading={isLoading}
						isEmpty={isEmpty}
					/>
				</SelectTrigger>

				<SelectContent align='start' className='max-h-72 min-w-[220px]'>
					{agents.map((agent) => (
						<SelectItem key={agent.id} value={agent.id} className='gap-2'>
							<span className='flex items-center gap-2'>
								<AgentAvatar agent={agent} />
								<span className='truncate text-sm'>{agent.name}</span>
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}

// ── Inner pieces ───────────────────────────────────────────────────────

function AgentTriggerLabel({
	agent,
	isLoading,
	isEmpty,
}: {
	agent: Agent | undefined
	isLoading: boolean
	isEmpty: boolean
}) {
	if (isLoading) {
		return (
			<span className='flex items-center gap-1.5 text-liv-muted-foreground'>
				<IconRobot size={14} aria-hidden='true' />
				<span>Loading agents…</span>
			</span>
		)
	}
	if (isEmpty) {
		return (
			<span className='flex items-center gap-1.5 text-liv-muted-foreground'>
				<IconRobot size={14} aria-hidden='true' />
				<span>No agents</span>
			</span>
		)
	}
	if (!agent) {
		// Trigger is uncontrolled (value=''); shadcn shows the placeholder via
		// SelectValue. We render our own to keep the visual consistent.
		return (
			<span className='flex items-center gap-1.5'>
				<IconRobot size={14} aria-hidden='true' />
				<SelectValue placeholder='Select agent' />
			</span>
		)
	}
	return (
		<span className='flex items-center gap-1.5'>
			<AgentAvatar agent={agent} />
			<span className='truncate'>{agent.name}</span>
		</span>
	)
}

function AgentAvatar({agent}: {agent: Agent}) {
	const emoji = agent.avatar?.trim()
	if (emoji && emoji.length > 0) {
		return (
			<span
				aria-hidden='true'
				className='inline-flex h-5 w-5 items-center justify-center rounded-full bg-liv-accent text-xs leading-none'
				style={
					agent.avatarColor
						? {backgroundColor: agent.avatarColor}
						: undefined
				}
			>
				{emoji}
			</span>
		)
	}
	return (
		<IconRobot size={14} aria-hidden='true' className='text-liv-secondary' />
	)
}
