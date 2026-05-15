import React from 'react'

import {cn} from '@/shadcn-lib/utils'

/**
 * v36 LivOS Design Port — ChatBubble + ChatLog (Phase 129, Step 8 of 8).
 *
 * Conversation bubble per design-system.html §13 (lines 915-936 + .bubble CSS
 * at lines 301-303):
 *   - max-width: 88%, 11/14px padding, 18px base radius
 *   - User: align-self end + bg-fg/text-bg invert + bottom-right-radius 6
 *           (the "speech bubble tail" asymmetry)
 *   - Liv : align-self start + bg + hairline border + bottom-left-radius 6
 *
 * The §13 spec is "Bubbles invert fg/bg by role." — no emoji, no colored
 * ornaments, just the monochrome ink/page contrast for user vs assistant.
 */

export type ChatRole = 'user' | 'liv'

export interface ChatBubbleProps {
	role: ChatRole
	children: React.ReactNode
	className?: string
}

export function ChatBubble({role, children, className}: ChatBubbleProps) {
	return (
		<div
			className={cn(
				'max-w-[88%] px-3.5 py-[11px] text-[14px] leading-[1.4]',
				role === 'user'
					? 'self-end bg-[color:var(--fg)] text-[color:var(--bg)] rounded-2xl rounded-br-[6px]'
					: 'self-start bg-[color:var(--bg)] text-[color:var(--fg)] border border-line rounded-2xl rounded-bl-[6px]',
				className,
			)}
		>
			{children}
		</div>
	)
}

export interface ChatLogProps {
	children: React.ReactNode
	className?: string
}

export function ChatLog({children, className}: ChatLogProps) {
	return <div className={cn('flex flex-col gap-2', className)}>{children}</div>
}
