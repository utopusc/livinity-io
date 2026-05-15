import React from 'react'

import {cn} from '@/shadcn-lib/utils'

/**
 * v36 LivOS Design Port — AvatarGradient (Phase 130-02).
 *
 * Initial-on-gradient avatar with the peach→pink linear gradient + soft
 * pink-tinted shadow from the design-system reference (Downloads/design-
 * system.html .avatar block, lines 223-269 of 130-PLAN.md).
 *
 * Sizes: sm (30px, 12px font) / md (64px, 24px font) / lg (96px, 38px font).
 * The gradient and shadow are inlined as a single style object so Tailwind
 * purge can't strip them.
 *
 * Returns a `<div>`. Callers wrap in a `<button>` if they want it clickable.
 */
export type AvatarSize = 'sm' | 'md' | 'lg'

const SIZE_CLASS: Record<AvatarSize, string> = {
	sm: 'h-[30px] w-[30px] text-[12px] font-semibold',
	md: 'h-16 w-16 text-[24px] font-medium',
	lg: 'h-24 w-24 text-[38px] font-medium',
}

const AVATAR_STYLE: React.CSSProperties = {
	background: 'linear-gradient(135deg, #ff8a65, #f06292)',
	boxShadow: '0 12px 30px -12px rgba(240, 98, 146, 0.5)',
}

export interface AvatarGradientProps {
	/** 1-2 letter initials computed by the caller. */
	initials: string
	size?: AvatarSize
	className?: string
}

export function AvatarGradient({initials, size = 'sm', className}: AvatarGradientProps) {
	return (
		<div
			className={cn(
				'inline-grid place-items-center rounded-full text-white select-none shrink-0',
				SIZE_CLASS[size],
				className,
			)}
			style={AVATAR_STYLE}
			aria-hidden='true'
		>
			{initials}
		</div>
	)
}

/**
 * Shared helper for computing 1-2 letter initials from a display name.
 * Falls back to '?' for empty input.
 */
export function getInitials(name: string | null | undefined): string {
	if (!name) return '?'
	const parts = name.trim().split(/\s+/).filter(Boolean)
	if (parts.length === 0) return '?'
	if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
	return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}
