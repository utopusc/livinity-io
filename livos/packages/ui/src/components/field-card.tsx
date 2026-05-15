import React from 'react'

import {cn} from '@/shadcn-lib/utils'

/**
 * v36 LivOS Design Port — FieldCard + FieldRow (Phase 125, Step 4 of 8).
 *
 * Bordered card containing one or more hairline-divided rows. Each FieldRow
 * uses a 180px / 1fr / auto grid (label / value / trailing slot — typically a
 * ghost button). Inputs inside FieldRow.value sit on bg-2 with no visible
 * border at rest.
 *
 * Source: .planning/design-system/livinity-design-system.html §05 Inputs & fields
 *         (lines 621-647, grid-template-columns: 180px 1fr auto).
 */
export interface FieldCardProps extends React.HTMLAttributes<HTMLDivElement> {
	children?: React.ReactNode
}

export function FieldCard({className, children, ...props}: FieldCardProps) {
	return (
		<div
			className={cn(
				'rounded-[var(--r-lg)] border border-line bg-[color:var(--bg)] divide-y divide-line overflow-hidden',
				className,
			)}
			{...props}
		>
			{children}
		</div>
	)
}

export interface FieldRowProps {
	/** Left column — label text (mono optional). */
	label: React.ReactNode
	/** Middle column — value: text, input, or any node. Wraps gracefully. */
	value: React.ReactNode
	/** Right column — trailing action (ghost button typically). Optional. */
	trailing?: React.ReactNode
	/** Optional extra row-level classes. */
	className?: string
}

export function FieldRow({label, value, trailing, className}: FieldRowProps) {
	return (
		<div
			className={cn(
				'grid grid-cols-[180px_1fr_auto] items-center gap-4 px-5 py-4 min-h-[60px]',
				'max-md:grid-cols-1 max-md:gap-2',
				className,
			)}
		>
			<div className='text-[13px] font-medium text-[color:var(--fg-mute)]'>{label}</div>
			<div className='text-[14px] text-[color:var(--fg)] min-w-0'>{value}</div>
			{trailing && <div className='justify-self-end'>{trailing}</div>}
		</div>
	)
}

/**
 * FieldCardInput — Input variant tuned for FieldRow.value usage.
 * Fills bg-2 with no visible border at rest; line on focus.
 */
export interface FieldCardInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function FieldCardInput({className, ...props}: FieldCardInputProps) {
	return (
		<input
			className={cn(
				'w-full px-3 py-2 rounded-[var(--r-sm)] bg-[color:var(--bg-2)] text-[14px] text-[color:var(--fg)]',
				'border border-transparent outline-none transition-colors',
				'focus:border-line-strong focus:bg-[color:var(--bg)]',
				'placeholder:text-[color:var(--fg-faint)]',
				className,
			)}
			{...props}
		/>
	)
}
