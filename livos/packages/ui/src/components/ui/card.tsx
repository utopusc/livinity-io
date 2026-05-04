import {HtmlHTMLAttributes} from 'react'

import {cn} from '@/shadcn-lib/utils'
import {tw} from '@/utils/tw'

// Liv Design System v1 (Phase 66 / DESIGN-07) — opt-in variant prop.
// Defaults to existing surface (no behavioural change for current callers).
// 'liv-elevated' composes the .liv-glass utility from Plan 66-01 with an
// explicit border keyed on var(--liv-border-subtle), per D-15 / v31-DRAFT line 251.
export type CardVariant = 'default' | 'liv-elevated'

export function Card({
	children,
	className,
	variant = 'default',
	...props
}: {children?: React.ReactNode; className?: string; variant?: CardVariant} & HtmlHTMLAttributes<HTMLDivElement>) {
	const variantClass = variant === 'liv-elevated' ? livElevatedClass : cardClass
	return (
		<div className={cn(variantClass, className)} {...props}>
			{children}
		</div>
	)
}

export const cardClass = tw`rounded-radius-xl bg-surface-1 px-4 py-5 max-lg:min-h-[95px] lg:p-6 border border-border-subtle shadow-elevation-sm transition-all duration-200 hover:bg-surface-2 hover:border-border-default hover:shadow-elevation-md`

// liv-elevated: glassmorphic surface (.liv-glass = blur(12px) saturate(1.2) + var(--liv-bg-glass))
// PLUS an explicit 1px border keyed on var(--liv-border-subtle), retaining the radius/padding cadence
// of the default Card. Hover state mirrors the default (subtle elevation up) so the surface still
// feels interactive.
export const livElevatedClass = tw`liv-glass rounded-radius-xl px-4 py-5 max-lg:min-h-[95px] lg:p-6 border border-[color:var(--liv-border-subtle)] shadow-elevation-sm transition-all duration-[var(--liv-dur-fast)] hover:shadow-elevation-md`
