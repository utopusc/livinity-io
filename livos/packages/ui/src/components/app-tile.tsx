import React from 'react'

import {cn} from '@/shadcn-lib/utils'

/**
 * v36 LivOS Design Port — AppTile + AppTileGrid (Phase 128, Step 7 of 8).
 *
 * App library tile per design-system.html §09 (lines 792-810):
 *   - 18/16 padding, 16px radius, hairline border, bg
 *   - 34×34 monogram glyph (fg/bg invert, 10px radius)
 *   - 14px semibold name + 11px mono uppercase category
 *   - Hover lifts -3px and rotates/scales the glyph
 *   - Min-height 112px so empty tiles still feel intentional
 *
 * Defaults to the monogram variant from the design system. Pass `iconUrl`
 * to render an existing image icon instead (back-compat with the dock and
 * legacy app-store rows).
 */

export interface AppTileProps {
	name: string
	category?: string
	/** Single letter / initials for monogram (default: first letter of name). */
	monogram?: string
	/** When provided, renders the icon image instead of the monogram glyph. */
	iconUrl?: string
	onOpen?: () => void
	className?: string
}

export function AppTile({name, category, monogram, iconUrl, onOpen, className}: AppTileProps) {
	const initials = (monogram ?? name.slice(0, 1)).toUpperCase()
	return (
		<button
			type='button'
			onClick={onOpen}
			className={cn(
				'group relative flex flex-col gap-1.5 rounded-2xl p-4 pt-[18px] pb-4 min-h-[112px]',
				'border border-line bg-[color:var(--bg)] transition-all duration-[350ms] ease-out-v36',
				'hover:-translate-y-0.5 hover:border-[color:var(--fg-faint)] cursor-pointer text-left',
				className,
			)}
		>
			{iconUrl ? (
				<div
					className='h-[34px] w-[34px] rounded-[10px] bg-cover bg-center mb-1.5 transition-transform duration-[350ms] ease-out-v36 group-hover:scale-[1.06] group-hover:-rotate-2'
					style={{backgroundImage: `url(${iconUrl})`}}
				/>
			) : (
				<div className='h-[34px] w-[34px] rounded-[10px] grid place-items-center text-[16px] font-semibold bg-[color:var(--fg)] text-[color:var(--bg)] mb-1.5 transition-transform duration-[350ms] ease-out-v36 group-hover:scale-[1.06] group-hover:-rotate-2'>
					{initials}
				</div>
			)}
			<div className='text-[14px] font-semibold tracking-[-0.01em] text-[color:var(--fg)]'>{name}</div>
			{category && <div className='text-[11px] text-[color:var(--fg-mute)] font-medium'>{category}</div>}
		</button>
	)
}

export interface AppTileGridProps {
	children: React.ReactNode
	className?: string
}

export function AppTileGrid({children, className}: AppTileGridProps) {
	return (
		<div className={cn('grid grid-cols-3 md:grid-cols-5 gap-2.5', className)}>{children}</div>
	)
}
