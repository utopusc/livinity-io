import React from 'react'

import {cn} from '@/shadcn-lib/utils'

/**
 * v36 LivOS Design Port — StatTile + StatRow (Phase 127, Step 6 of 8).
 *
 * Stat card with 4px hairline progress bar per design-system.html §11
 * (lines 851-883 + .os-stat CSS at lines 291-297):
 *   - 14px/16px padding, 12px radius, hairline border, bg
 *   - 11px label / 19px font-semibold value with mono-em unit / 4px bar
 *   - Bar fill: bg-fg solid, bar track: bg-[var(--bg-2)]
 *
 * Replaces the legacy gradient bar in CPU/Memory/Storage cards (deferred
 * consumer migration to v37 per the v36 micro-commit rule).
 */

export interface StatTileProps {
	label: string
	value: React.ReactNode
	/** 0-1 fill ratio. Clamped to [0, 1]. */
	fill?: number
	className?: string
}

export function StatTile({label, value, fill, className}: StatTileProps) {
	const clamped = fill === undefined ? null : Math.max(0, Math.min(1, fill))
	return (
		<div className={cn('rounded-[12px] border border-line bg-[color:var(--bg)] p-4', className)}>
			<div className='text-[11px] font-medium text-fg-mute'>{label}</div>
			<div className='text-[19px] font-semibold tracking-[-0.02em] mt-1 text-fg'>{value}</div>
			{clamped !== null && (
				<div className='h-1 rounded-[2px] bg-[color:var(--bg-2)] mt-2.5 overflow-hidden'>
					<div className='h-full bg-fg rounded-[2px]' style={{width: `${clamped * 100}%`}} />
				</div>
			)}
		</div>
	)
}

export interface StatRowProps {
	children: React.ReactNode
	className?: string
}

export function StatRow({children, className}: StatRowProps) {
	return <div className={cn('grid grid-cols-3 gap-2.5', className)}>{children}</div>
}

/**
 * Convenience helper for the common "{value} <em>{unit}</em>" pattern from §11.
 * The mono em renders the unit with --fg-mute styling, matching the spec.
 */
export function StatValue({number, unit}: {number: string | number; unit: string}) {
	return (
		<>
			{number}
			<em className='text-fg-mute font-medium not-italic font-mono ml-1 text-[14px]'>{unit}</em>
		</>
	)
}
