/**
 * LivAgentStatus — Phase 70-05.
 *
 * Replaces legacy `agent-status-overlay.tsx` with P66 GlowPulse motion primitive
 * + shadcn `liv-status-running` Badge variant. Six visual states per CONTEXT D-36:
 *
 *   | Phase     | Visual                                                     |
 *   |-----------|------------------------------------------------------------|
 *   | idle      | renders null                                               |
 *   | listening | cyan GlowPulse + "Listening..."                            |
 *   | thinking  | cyan GlowPulse + IconBrain + "Thinking..."                 |
 *   | executing | amber GlowPulse + IconLoader2 + Badge(liv-status-running)  |
 *   | responding| no glow (caret in chat handles this; pass through)         |
 *   | error     | rose-tinted (className-driven; see note) + IconX + "Error" |
 *
 * GlowPulse API adaptation (D-04 hard rule, no new deps):
 *   GlowPulse's `color` prop accepts only `'amber' | 'cyan' | 'violet'`. There is
 *   no `'rose'` option. `getStatusGlowColor` still returns `'rose'` (per plan
 *   must-have spec) — but the render path detects `'rose'` and renders a static
 *   rose-tinted container instead of wrapping in <GlowPulse>. This keeps the
 *   pure helper test contract aligned with CONTEXT D-36 mappings while honoring
 *   the actual GlowPulse signature.
 *
 * Steps-list rendering (D-37) ports legacy lines 38-58 verbatim with P66 token
 * replacements (text-violet-400 → --liv-accent-violet, text-red-400 →
 * --liv-accent-rose, text-green-400 → --liv-accent-emerald).
 */

import {IconBrain, IconCheck, IconLoader2, IconX} from '@tabler/icons-react'

import {GlowPulse} from '@/components/motion'
import {Badge} from '@/shadcn-components/ui/badge'
import {cn} from '@/shadcn-lib/utils'
import type {AgentStatus} from '@/hooks/use-agent-socket'

/**
 * Returns the GlowPulse / accent color for a given phase.
 * - 'cyan'   → 'thinking', 'listening'
 * - 'amber'  → 'executing'
 * - 'rose'   → 'error'
 * - null     → 'idle', 'responding', anything else
 *
 * Note: GlowPulse only accepts 'amber'/'cyan'/'violet' — see render path for the
 * rose adaptation.
 */
export function getStatusGlowColor(phase: string): 'cyan' | 'amber' | 'rose' | null {
	switch (phase) {
		case 'thinking':
		case 'listening':
			return 'cyan'
		case 'executing':
			return 'amber'
		case 'error':
			return 'rose'
		case 'idle':
		case 'responding':
		default:
			return null
	}
}

/** Format tool name for display: strip `mcp__servername__` prefix (port from legacy line 7-10). */
function formatToolName(name: string): string {
	const match = name.match(/^mcp__[^_]+__(.+)$/)
	return match ? match[1] : name
}

export function LivAgentStatus({status}: {status: AgentStatus}) {
	// Read fields with defensive defaults — legacy AgentStatus type doesn't declare
	// `steps`/`error` but `useAgentSocket` runtime may carry them in extended phases.
	// Cast through `as` to allow future-proofing without forcing a broader type change.
	const phase = status.phase as string
	const stepsRaw = (status as unknown as {steps?: Array<{id: string; status: string; description: string}>}).steps
	const steps = Array.isArray(stepsRaw) ? stepsRaw : []

	if (phase === 'idle') return null

	const glow = getStatusGlowColor(phase)
	const hasSteps = steps.length > 0
	const visibleSteps = steps.slice(-6)

	const headerContent = (
		<>
			{(phase === 'thinking' || phase === 'listening') && (
				<div className='flex items-center gap-2 px-3 py-2 text-body-sm text-[color:var(--liv-text-secondary)]'>
					<IconBrain size={14} className='text-[color:var(--liv-accent-violet)]' />
					<span>{phase === 'listening' ? 'Listening...' : 'Thinking...'}</span>
				</div>
			)}
			{phase === 'executing' && status.currentTool && (
				<div className='flex items-center gap-2 border-b border-[color:var(--liv-border-subtle)] px-3 py-1.5 text-body-sm'>
					<IconLoader2 size={14} className='animate-spin text-[color:var(--liv-accent-amber)]' />
					<Badge variant='liv-status-running' className='font-mono text-xs'>
						{formatToolName(status.currentTool)}
					</Badge>
				</div>
			)}
			{phase === 'error' && (
				<div className='flex items-center gap-2 px-3 py-2 text-body-sm'>
					<IconX size={14} className='text-[color:var(--liv-accent-rose)]' />
					<span className='text-[color:var(--liv-accent-rose)]'>Error</span>
				</div>
			)}
		</>
	)

	// GlowPulse only accepts 'amber'/'cyan'/'violet' (D-04 adaptation): for 'rose'
	// (error state) we render a static rose-tinted ring instead of breathing glow.
	const wrapped =
		glow === 'amber' || glow === 'cyan' ? (
			<GlowPulse color={glow}>{headerContent}</GlowPulse>
		) : (
			headerContent
		)

	return (
		<div
			className={cn(
				'mb-3 overflow-hidden rounded-lg border bg-[color:var(--liv-bg-elevated)]',
				glow === 'rose'
					? 'border-[color:var(--liv-accent-rose)]/40'
					: 'border-[color:var(--liv-border-subtle)]',
			)}
		>
			{wrapped}

			{hasSteps && (
				<div className='space-y-1.5 px-3 py-2'>
					{visibleSteps.map((step) => (
						<div key={step.id} className='flex items-center gap-2 text-body-sm'>
							{step.status === 'running' ? (
								<IconLoader2
									size={14}
									className='flex-shrink-0 animate-spin text-[color:var(--liv-accent-violet)]'
								/>
							) : step.status === 'error' ? (
								<IconX size={14} className='flex-shrink-0 text-[color:var(--liv-accent-rose)]' />
							) : (
								<IconCheck
									size={14}
									className='flex-shrink-0 text-[color:var(--liv-accent-emerald)]'
								/>
							)}
							<span
								className={cn(
									step.status === 'running'
										? 'text-[color:var(--liv-text-primary)]'
										: 'text-[color:var(--liv-text-tertiary)]',
								)}
							>
								{step.description}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	)
}
