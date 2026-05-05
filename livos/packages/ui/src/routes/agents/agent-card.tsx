// Phase 85 (UI slice) — AgentCard.
//
// Suna-pattern card for the /agents grid:
//   - rounded-2xl overflow-hidden Card
//   - Top: 200 px (h-50) color zone using inline `style.backgroundColor`
//     from agent.avatarColor (per-row data — cannot be a Tailwind token)
//   - Centered avatar emoji over color zone (text-6xl)
//   - Top-right backdrop-blur badges: model_tier + (default?) + (public?)
//   - Below: white liv-card bg, p-4, name (font-semibold) + description
//     (text-sm liv-muted-foreground line-clamp-2)
//   - group-hover delete X button (bottom-right of color zone) — hidden for
//     system seeds (userId === null) since they're immutable from this API
//   - onClick: navigate to /agents/:id (delete button stops propagation)
//
// Uses existing primitives only (D-NO-NEW-DEPS): tabler IconX, AlertDialog
// from shadcn-components/ui, cn from shadcn-lib.

import {IconX} from '@tabler/icons-react'
import {useNavigate} from 'react-router-dom'

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/shadcn-components/ui/alert-dialog'
import {cn} from '@/shadcn-lib/utils'

import type {Agent} from './agents-api'

const FALLBACK_COLOR = '#1f2937' // tailwind slate-800 — used when avatar_color is null

export type AgentCardProps = {
	agent: Agent
	onDelete?: (agentId: string) => void
	isDeleting?: boolean
	className?: string
	/**
	 * When true the card is rendered larger (used on the /agents/:id editor
	 * preview pane). Default false (grid sizing).
	 */
	size?: 'default' | 'large'
}

export function AgentCard({agent, onDelete, isDeleting, className, size = 'default'}: AgentCardProps) {
	const navigate = useNavigate()
	const isSystemSeed = agent.userId === null

	const colorZoneHeight = size === 'large' ? 'h-64' : 'h-50'
	const emojiSize = size === 'large' ? 'text-7xl' : 'text-6xl'

	return (
		<div
			role='button'
			tabIndex={0}
			onClick={() => navigate(`/agents/${agent.id}`)}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					navigate(`/agents/${agent.id}`)
				}
			}}
			className={cn(
				'group relative cursor-pointer overflow-hidden rounded-2xl border border-liv-border bg-liv-card transition-all',
				'hover:shadow-lg hover:-translate-y-0.5',
				'focus:outline-none focus:ring-2 focus:ring-liv-ring focus:ring-offset-2',
				className,
			)}
			data-testid='agent-card'
		>
			{/* Color zone with avatar emoji + backdrop-blur badges */}
			<div
				className={cn('relative flex items-center justify-center', colorZoneHeight)}
				style={{backgroundColor: agent.avatarColor ?? FALLBACK_COLOR}}
				data-testid='agent-card-color-zone'
			>
				<span
					className={cn('select-none leading-none drop-shadow-sm', emojiSize)}
					aria-label={`${agent.name} avatar`}
					data-testid='agent-card-avatar'
				>
					{agent.avatar ?? '🤖'}
				</span>

				{/* Top-right corner badges (backdrop-blur over the color zone) */}
				<div className='absolute right-3 top-3 flex flex-wrap items-center justify-end gap-1.5'>
					<Badge>{agent.modelTier}</Badge>
					{agent.isDefault && <Badge>default</Badge>}
					{agent.isPublic && <Badge>public</Badge>}
				</div>

				{/* Delete button (bottom-right of color zone). Only shown
				    on hover, never for system seeds, never while actively
				    deleting. The AlertDialog confirms before firing. */}
				{onDelete && !isSystemSeed && (
					<div
						className={cn(
							'absolute bottom-3 right-3 opacity-0 transition-opacity',
							'group-hover:opacity-100 group-focus-within:opacity-100',
						)}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<button
									type='button'
									disabled={isDeleting}
									aria-label={`Delete ${agent.name}`}
									className='flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-colors hover:bg-liv-destructive hover:text-liv-destructive-foreground disabled:opacity-50'
									data-testid='agent-card-delete-button'
								>
									<IconX size={16} />
								</button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Delete &quot;{agent.name}&quot;?</AlertDialogTitle>
									<AlertDialogDescription>
										This will permanently delete the agent. Any chat sessions
										using it will fall back to the default agent. This action
										cannot be undone.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction
										onClick={() => onDelete(agent.id)}
										className='bg-liv-destructive text-liv-destructive-foreground hover:bg-liv-destructive/90'
									>
										Delete
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				)}
			</div>

			{/* Body — name + description */}
			<div className='p-4'>
				<h3
					className='truncate text-base font-semibold text-liv-card-foreground'
					data-testid='agent-card-name'
				>
					{agent.name}
				</h3>
				<p
					className='mt-1 line-clamp-2 text-sm text-liv-muted-foreground'
					data-testid='agent-card-description'
				>
					{agent.description || 'No description.'}
				</p>
			</div>
		</div>
	)
}

// ─── Helpers ───────────────────────────────────────────────────────────

function Badge({children}: {children: React.ReactNode}) {
	return (
		<span
			className='inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-md'
			data-testid='agent-card-badge'
		>
			{children}
		</span>
	)
}
