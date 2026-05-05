import {Link, useNavigate} from 'react-router-dom'
import {IconRobot, IconExternalLink, IconRefresh} from '@tabler/icons-react'

import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {Card} from '@/components/ui/card'
import {trpcReact} from '@/trpc/trpc'

import {SettingsPageLayout} from './_components/settings-page-layout'

// ─────────────────────────────────────────────────────────────────────────────
// Liv Agent settings page (Phase 76 / Plan 06 / MARKET-07).
//
// Per CONTEXT D-12 this section is intentionally THIN: it re-uses the existing
// `/subagents` route for per-agent edit (model picker / tier dropdown / max
// turns / schedule live there) and links out to `/agent-marketplace` (76-04)
// for the catalog. The only NEW behaviour here is the "Replay Tour" button —
// it clears the `liv-tour-completed` localStorage flag (set by 76-05's
// `<LivTour>` component on finish/skip) and navigates to `/ai-chat` so the
// LivTour mount in 76-07 picks the cleared flag and re-runs.
//
// NO model picker / tool grid / idle-timeout slider here (D-12). NO new deps
// (D-NO-NEW-DEPS). NO sacred-file edits.
// ─────────────────────────────────────────────────────────────────────────────

// Local minimal type for a cloned subagent row. The tRPC `ai.listSubagents`
// procedure returns `await response.json()` (untyped pass-through from nexus
// `/api/subagents`), so a strongly-typed `RouterOutputs['ai']['listSubagents']`
// would resolve to `any` anyway. Locking the shape we actually consume here.
type SubagentRow = {
	id: string
	name?: string
	tier?: string
	description?: string
	status?: string
}

export default function LivAgentSettings() {
	const navigate = useNavigate()
	const subagentsQuery = trpcReact.ai.listSubagents.useQuery()

	const replayTour = () => {
		if (typeof window !== 'undefined') {
			window.localStorage.removeItem('liv-tour-completed')
		}
		navigate('/ai-chat')
	}

	const subagents: SubagentRow[] = Array.isArray(subagentsQuery.data) ? subagentsQuery.data : []

	return (
		<SettingsPageLayout
			title='Liv Agent'
			description='Manage your AI agents and onboarding experience.'
		>
			<div className='max-w-2xl space-y-6'>
				{/* ── Section 1 — Marketplace ──────────────────────────── */}
				<Card variant='liv-elevated'>
					<div className='flex items-start justify-between gap-4'>
						<div className='min-w-0'>
							<h2 className='text-body font-semibold text-text-primary'>Marketplace</h2>
							<p className='mt-1 text-body-sm text-text-secondary'>
								Browse opinionated agent presets — Researcher, Coder, Writer, more.
							</p>
						</div>
						<Button variant='liv-primary' size='sm' asChild>
							<Link to='/marketplace'>
								Browse <IconExternalLink size={16} className='ml-1.5' />
							</Link>
						</Button>
					</div>
				</Card>

				{/* ── Section 2 — My Agents ────────────────────────────── */}
				<Card variant='liv-elevated'>
					<div className='mb-4 flex items-start justify-between gap-4'>
						<div className='min-w-0'>
							<h2 className='text-body font-semibold text-text-primary'>My Agents</h2>
							<p className='mt-1 text-body-sm text-text-secondary'>
								Cloned agents you can run. Configure each one in detail at{' '}
								<Link
									to='/subagents'
									className='underline decoration-text-tertiary underline-offset-2 hover:decoration-text-primary'
								>
									/subagents
								</Link>
								.
							</p>
						</div>
					</div>

					{/* aria-live region so screen readers announce list updates */}
					<div aria-live='polite'>
						{subagentsQuery.isLoading && (
							<div className='h-12 animate-pulse rounded-radius-md bg-surface-base' />
						)}
						{subagentsQuery.error && (
							<p className='text-body-sm text-destructive'>Failed to load agents.</p>
						)}
						{!subagentsQuery.isLoading && !subagentsQuery.error && subagents.length === 0 && (
							<p className='text-body-sm text-text-secondary'>
								No cloned agents yet — visit the marketplace.
							</p>
						)}
						{!subagentsQuery.isLoading && !subagentsQuery.error && subagents.length > 0 && (
							<ul className='divide-y divide-border-subtle'>
								{subagents.map((sa) => (
									<li key={sa.id} className='flex items-center justify-between py-3'>
										<div className='flex items-center gap-3'>
											<IconRobot size={20} className='text-[color:var(--liv-accent-cyan)]' />
											<div>
												<div className='text-body-sm font-medium text-text-primary'>
													{sa.name ?? sa.id}
												</div>
												<div className='text-caption text-text-tertiary'>{sa.id}</div>
											</div>
										</div>
										<Badge>{sa.tier ?? 'sonnet'}</Badge>
									</li>
								))}
							</ul>
						)}
					</div>
				</Card>

				{/* ── Section 3 — Onboarding tour ──────────────────────── */}
				<Card variant='liv-elevated'>
					<div className='flex items-start justify-between gap-4'>
						<div className='min-w-0'>
							<h2 className='text-body font-semibold text-text-primary'>Onboarding Tour</h2>
							<p className='mt-1 text-body-sm text-text-secondary'>
								Replay the 9-step tour that explains the chat surface.
							</p>
						</div>
						<Button variant='liv-primary' size='sm' onClick={replayTour}>
							<IconRefresh size={16} className='mr-1.5' /> Replay Tour
						</Button>
					</div>
				</Card>
			</div>
		</SettingsPageLayout>
	)
}
