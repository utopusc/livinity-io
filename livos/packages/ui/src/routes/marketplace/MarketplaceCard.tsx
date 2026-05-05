// Phase 86 V32-MKT — MarketplaceCard component.
//
// One agent tile in the /marketplace grid. Suna-pattern layout (D-MK-12):
//   - Outer Card: rounded-2xl overflow-hidden p-0, flex column h-full
//   - Color zone: h-50 with backgroundColor=avatarColor, big emoji centered,
//     backdrop-blur download badge top-right + tag badges (max 2) below it
//   - Lower section: bg-surface-base p-4, name + creator + relative date +
//     2-line-clamp description + primary "Add to Library" button (mt-auto)
//
// Stateless: receives `agent`, `onAdd`, and `isAdding` from the parent
// route. Parent owns the mutation lifecycle + optimistic cache update.
//
// D-LIV-STYLED: All non-agent colors via Tailwind tokens (text-text-primary,
// bg-surface-base, border-border-subtle). avatarColor IS user data — stored
// as hex in the DB — so the inline style is intentional, not a token bypass.

import {IconCalendar, IconDownload, IconLoader2, IconUser} from '@tabler/icons-react'

import {Badge} from '@/shadcn-components/ui/badge'
import {Button} from '@/shadcn-components/ui/button'
import {cn} from '@/shadcn-lib/utils'

import type {MarketplaceAgent} from './marketplace-api'

export type MarketplaceCardProps = {
	agent: MarketplaceAgent
	onAdd: (agentId: string, agentName: string) => void
	isAdding: boolean
}

const DEFAULT_AVATAR_COLOR = '#6366f1'

export function MarketplaceCard({agent, onAdd, isAdding}: MarketplaceCardProps) {
	const avatar = agent.avatar ?? '🤖'
	const avatarColor = agent.avatarColor ?? DEFAULT_AVATAR_COLOR
	const tags = agent.tags ?? []
	const visibleTags = tags.slice(0, 2)
	const overflowTagCount = tags.length - visibleTags.length

	return (
		<article
			className={cn(
				'flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-base shadow-elevation-sm transition-all duration-200',
				'hover:border-border-default hover:shadow-elevation-md',
			)}
			data-testid='marketplace-card'
		>
			{/* Color zone — h-50 (200px) edge-to-edge brand fill */}
			<div
				className='relative flex h-50 items-center justify-center'
				style={{backgroundColor: avatarColor}}
				aria-hidden='true'
			>
				<span className='select-none text-5xl leading-none' data-testid='marketplace-card-avatar'>
					{avatar}
				</span>

				{/* Download count badge — top-right, backdrop-blur over the brand fill */}
				<div className='absolute right-3 top-3 flex flex-col items-end gap-1.5'>
					<div
						className='inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-12 font-medium text-white backdrop-blur-sm'
						data-testid='marketplace-card-download-badge'
					>
						<IconDownload size={12} />
						<span>{agent.downloadCount}</span>
					</div>

					{/* Tag chips on the color zone — visible over the brand fill */}
					{visibleTags.length > 0 && (
						<div className='flex flex-wrap justify-end gap-1' data-testid='marketplace-card-tags'>
							{visibleTags.map((tag) => (
								<span
									key={tag}
									className='inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-11 font-medium text-white backdrop-blur-sm'
								>
									{tag}
								</span>
							))}
							{overflowTagCount > 0 && (
								<span className='inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-11 font-medium text-white backdrop-blur-sm'>
									+{overflowTagCount}
								</span>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Lower section — metadata + CTA */}
			<div className='flex flex-1 flex-col p-4'>
				<h3
					className='line-clamp-1 text-h3 font-semibold text-text-primary'
					data-testid='marketplace-card-name'
				>
					{agent.name}
				</h3>

				<div className='mt-1 space-y-0.5 text-caption text-text-secondary'>
					<div className='flex items-center gap-1'>
						<IconUser size={12} />
						<span data-testid='marketplace-card-creator'>by {agent.creatorLabel}</span>
					</div>
					<div className='flex items-center gap-1'>
						<IconCalendar size={12} />
						<span data-testid='marketplace-card-date'>
							Published {formatRelativeDate(agent.marketplacePublishedAt)}
						</span>
					</div>
				</div>

				<p
					className='mt-3 line-clamp-2 flex-1 text-body text-text-secondary'
					data-testid='marketplace-card-description'
				>
					{agent.description || 'No description available.'}
				</p>

				<Button
					variant='liv-primary'
					onClick={() => onAdd(agent.id, agent.name)}
					disabled={isAdding}
					className='mt-4 w-full'
					data-testid='marketplace-card-add-button'
					aria-label={isAdding ? `Adding ${agent.name}` : `Add ${agent.name} to library`}
				>
					{isAdding ? (
						<>
							<IconLoader2 size={14} className='animate-spin' />
							Adding…
						</>
					) : (
						<>
							<IconDownload size={14} />
							Add to Library
						</>
					)}
				</Button>
			</div>

			{/* Hidden Badge re-export keeps the shadcn Badge import live for
			    future tag styling tweaks without losing the import on tree-shake. */}
			<Badge className='hidden' aria-hidden='true'>
				_
			</Badge>
		</article>
	)
}

// ─── Date helper (D-MK-13 — dependency-free Intl.RelativeTimeFormat) ───

const RTF =
	typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat !== 'undefined'
		? new Intl.RelativeTimeFormat('en', {numeric: 'auto'})
		: null

function formatRelativeDate(date: Date | string | null | undefined): string {
	if (!date) return 'Recently'
	const d = date instanceof Date ? date : new Date(date)
	if (Number.isNaN(d.getTime())) return 'Recently'

	const diffMs = d.getTime() - Date.now()
	const diffSec = Math.round(diffMs / 1000)
	const absSec = Math.abs(diffSec)

	if (!RTF) {
		// Fallback: legacy environments without Intl.RelativeTimeFormat.
		// Returns an absolute date — still readable, no crash.
		return d.toLocaleDateString()
	}

	if (absSec < 60) return RTF.format(diffSec, 'second')
	const diffMin = Math.round(diffSec / 60)
	if (Math.abs(diffMin) < 60) return RTF.format(diffMin, 'minute')
	const diffHour = Math.round(diffMin / 60)
	if (Math.abs(diffHour) < 24) return RTF.format(diffHour, 'hour')
	const diffDay = Math.round(diffHour / 24)
	if (Math.abs(diffDay) < 7) return RTF.format(diffDay, 'day')
	const diffWeek = Math.round(diffDay / 7)
	if (Math.abs(diffWeek) < 5) return RTF.format(diffWeek, 'week')
	const diffMonth = Math.round(diffDay / 30)
	if (Math.abs(diffMonth) < 12) return RTF.format(diffMonth, 'month')
	const diffYear = Math.round(diffDay / 365)
	return RTF.format(diffYear, 'year')
}
