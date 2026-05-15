import React from 'react'

import {cn} from '@/shadcn-lib/utils'

/**
 * v36 LivOS Design Port — PlanCard + PlanGrid (Phase 126, Step 5 of 8).
 *
 * Pricing/tier card per design-system.html §08 (lines 741-786):
 *   - 3-col grid (`<PlanGrid>` ships the layout)
 *   - 26px/24px padding, 16px radius, hairline border, gradient bg for featured
 *   - Mono uppercase name → 44px thin price + mono per-suffix → tag → spec rows
 *     with justify-between → CTA pill at bottom
 *   - Featured plan: peach beige gradient + filled CTA + Popular badge
 */

export interface PlanSpec {
	label: string
	value: string
}

export interface PlanCardProps {
	name: string
	priceNumber: string
	pricePeriod: string
	tag: string
	specs: PlanSpec[]
	cta: string
	onSelect?: () => void
	featured?: boolean
	badge?: string
}

export function PlanCard({name, priceNumber, pricePeriod, tag, specs, cta, onSelect, featured = false, badge}: PlanCardProps) {
	return (
		<div
			className={cn(
				'relative flex flex-col gap-3.5 rounded-2xl p-6 transition-all duration-200 cursor-pointer',
				'border bg-[color:var(--bg)] border-line',
				'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop',
				featured && '!border-line-strong',
			)}
			style={featured ? {background: 'linear-gradient(160deg, #faf6f1 0%, #f5ede2 100%)'} : undefined}
		>
			{featured && (
				<span className='absolute top-[18px] right-[18px] font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] px-[9px] py-1 rounded-full bg-fg text-[color:var(--bg)]'>
					{badge ?? 'Popular'}
				</span>
			)}
			<div className='font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-fg'>{name}</div>
			<div className='flex items-baseline gap-1'>
				<span className='text-[44px] font-light tracking-[-0.035em] leading-none text-fg'>{priceNumber}</span>
				<span className='text-[13px] text-fg-mute font-mono'>{pricePeriod}</span>
			</div>
			<div className='text-[12px] text-fg-mute leading-[1.4] min-h-[34px]'>{tag}</div>
			<div className='flex flex-col gap-2.5 pt-3.5 border-t border-line text-[13px]'>
				{specs.map((s) => (
					<div key={s.label} className='flex justify-between text-fg-dim'>
						<span>{s.label}</span>
						<b className='text-fg font-medium'>{s.value}</b>
					</div>
				))}
			</div>
			<button
				type='button'
				onClick={onSelect}
				className={cn(
					'mt-auto inline-flex items-center justify-center gap-2 px-[18px] py-3 rounded-full text-[13.5px] font-medium border transition-all duration-150',
					featured
						? 'bg-fg text-[color:var(--bg)] border-fg hover:opacity-90'
						: 'bg-transparent text-fg border-line-strong hover:bg-fg hover:text-[color:var(--bg)] hover:border-fg',
				)}
			>
				{cta}
			</button>
		</div>
	)
}

export interface PlanGridProps {
	children: React.ReactNode
	className?: string
}

export function PlanGrid({children, className}: PlanGridProps) {
	return <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', className)}>{children}</div>
}
