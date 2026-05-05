/** LivToolRow — Phase 69-04 (VIEWS-01).
 *  Suna inline tool pill, Liv-styled. Coexists with P68-03's
 *  inline-tool-pill.tsx (which is NOT replaced in P69 — see
 *  69-CONTEXT.md D-13). P70 will adopt <LivToolRow> in
 *  chat-messages.tsx and deprecate the P68 pill.
 *
 *  Spec: 69-CONTEXT.md D-13..D-16 + v31-DRAFT lines 404-419.
 *
 *  Visual contract (D-15):
 *    [<status-dot>] [<icon>] [<friendly-name> --------] [<elapsed>] [<chevron>]
 *
 *  Status dot tokens (P66-01):
 *    running → var(--liv-accent-cyan) + animate-pulse
 *    done    → var(--liv-accent-emerald) static
 *    error   → var(--liv-accent-rose) static
 *
 *  Visual-tool border accent (D-15, v31-DRAFT line 419):
 *    isVisualTool(toolName) === true → border-l-2 border-cyan/40 — hint
 *    that clicking auto-opens the side panel.
 *
 *  Click handler (D-16): outer div onClick calls props.onClick directly.
 *  No event bubbling concerns — only interactive element. Keyboard a11y:
 *  role='button' + tabIndex={0} + Enter/Space → onClick().
 *
 *  D-NO-NEW-DEPS honored: imports only @tabler/icons-react (already in
 *  deps), tool-views/utils helpers (P69-02 sibling), tool-views/types
 *  (P68-02). NO new packages.
 *
 *  Sacred SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` UNTOUCHED.
 */

import {useEffect, useState} from 'react'

import {IconChevronRight} from '@tabler/icons-react'

import {getToolIcon, getUserFriendlyToolName, isVisualTool} from '@/routes/ai-chat/tool-views/utils'
import type {ToolCallSnapshot} from '@/routes/ai-chat/tool-views/types'

export interface LivToolRowProps {
	toolCall: ToolCallSnapshot
	onClick: () => void
}

// ─────────────────────────────────────────────────────────────────────
// StatusDot — small colored circle, animate-pulse only when running.
// Tokens via P66-01 CSS variables — NO hardcoded hex.
// ─────────────────────────────────────────────────────────────────────

function StatusDot({status}: {status: ToolCallSnapshot['status']}): JSX.Element {
	if (status === 'running') {
		return (
			<span
				className='w-2 h-2 rounded-full bg-[color:var(--liv-accent-cyan)] animate-pulse shrink-0'
				aria-label='running'
			/>
		)
	}
	if (status === 'error') {
		return (
			<span
				className='w-2 h-2 rounded-full bg-[color:var(--liv-accent-rose)] shrink-0'
				aria-label='error'
			/>
		)
	}
	return (
		<span
			className='w-2 h-2 rounded-full bg-[color:var(--liv-accent-emerald)] shrink-0'
			aria-label='done'
		/>
	)
}

// ─────────────────────────────────────────────────────────────────────
// ElapsedTimer — ticks every 1s while running (cleaned up on unmount or
// status transition); static `((completedAt-startedAt)/1000).toFixed(1)+'s'`
// for done/error. Defensive `completedAt ?? now` fallback so a `done`
// snapshot without `completedAt` never crashes (cosmetic — model
// invariants forbid it but defense in depth).
// ─────────────────────────────────────────────────────────────────────

function ElapsedTimer({snapshot}: {snapshot: ToolCallSnapshot}): JSX.Element {
	const isRunning = snapshot.status === 'running'
	const [now, setNow] = useState<number>(() => Date.now())

	useEffect(() => {
		if (!isRunning) return
		const id = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(id)
	}, [isRunning])

	const endTs = isRunning ? now : (snapshot.completedAt ?? now)
	const elapsedSec = Math.max(0, (endTs - snapshot.startedAt) / 1000)
	return (
		<span className='text-12 text-[color:var(--liv-text-secondary)] font-mono shrink-0'>
			{elapsedSec.toFixed(1)}s
		</span>
	)
}

// ─────────────────────────────────────────────────────────────────────
// LivToolRow — main component
// ─────────────────────────────────────────────────────────────────────

export function LivToolRow({toolCall, onClick}: LivToolRowProps): JSX.Element {
	const Icon = getToolIcon(toolCall.toolName)
	const friendly = getUserFriendlyToolName(toolCall.toolName)
	const visual = isVisualTool(toolCall.toolName)

	const baseClasses =
		'flex items-center gap-2 py-2 px-3 rounded-md hover:bg-[color:var(--liv-bg-elevated)] cursor-pointer transition-colors'
	const accentClasses = visual ? 'border-l-2 border-[color:var(--liv-accent-cyan)]/40' : ''

	return (
		<div
			role='button'
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					onClick()
				}
			}}
			className={`${baseClasses} ${accentClasses}`.trim()}
			data-tool-id={toolCall.toolId}
			data-visual={visual ? 'true' : 'false'}
		>
			<StatusDot status={toolCall.status} />
			<Icon className='size-[14px] text-[color:var(--liv-text-secondary)] shrink-0' aria-hidden />
			<span className='text-13 font-medium truncate flex-1'>{friendly}</span>
			<ElapsedTimer snapshot={toolCall} />
			<IconChevronRight
				className='size-[14px] text-[color:var(--liv-text-secondary)] shrink-0'
				aria-hidden
			/>
		</div>
	)
}
