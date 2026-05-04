/**
 * InlineToolPill — Phase 68-03. Suna-pattern inline tool indicator for
 * the chat thread. NOT Hermes UI (STATE.md line 67).
 *
 * Renders a single clickable pill on a chat row:
 *   <status-dot> <icon> <user-friendly-name> <elapsed-time> <chevron>
 *
 * Click invokes `props.onClick()` — the CALLER (P70's chat-messages
 * rewrite) decides whether to dispatch `useLivToolPanelStore.open(toolId)`.
 * The pill itself is store-agnostic so the unit tests don't need a
 * Zustand provider and the component can render in Storybook isolation.
 *
 * Spec source: .planning/phases/68-side-panel-tool-view-dispatcher/68-CONTEXT.md
 *   D-26 (layout), D-27 (status colors), D-28 (name helper), D-28a (visual border).
 *
 * Auto-open is NOT decided here — see liv-tool-panel-store.ts (68-01).
 * This pill is for non-visual tools that render inline AND visual tools
 * that ALSO appear inline (the cyan left-border decoration hints "click
 * me to see the live view").
 *
 * Wave-1 safety: re-declares `ToolCallSnapshot` type and `isVisualTool`
 * helper so this file builds even if 68-01's store ships in parallel.
 * Per planner's note in 68-03-PLAN.md: keep the duplicate, mark with TODO,
 * consolidate after wave-1 lands.
 */

import {useEffect, useState} from 'react'

import {IconChevronRight, type TablerIcon} from '@tabler/icons-react'

import {LivIcons, type LivIconKey} from '@/icons/liv-icons'
import {cn} from '@/shadcn-lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Local type re-declaration (CONTEXT D-14 wave-1 safety).
// MUST stay verbatim with 67-CONTEXT.md D-12 + tool-views/types.ts.
// ─────────────────────────────────────────────────────────────────────

export type ToolCategory =
	| 'browser'
	| 'terminal'
	| 'file'
	| 'fileEdit'
	| 'webSearch'
	| 'webCrawl'
	| 'webScrape'
	| 'mcp'
	| 'computer-use'
	| 'generic'

export type ToolCallSnapshot = {
	toolId: string
	toolName: string
	category: ToolCategory
	assistantCall: {input: Record<string, unknown>; ts: number}
	toolResult?: {output: unknown; isError: boolean; ts: number}
	status: 'running' | 'done' | 'error'
	startedAt: number
	completedAt?: number
}

// ─────────────────────────────────────────────────────────────────────
// Visual-tool detection.
//
// TODO(P70): import isVisualTool from '@/stores/liv-tool-panel-store' once
// 68-01 ships and remove this duplicate. Kept here for wave-1 safety so
// the file builds even if 68-01 ships in parallel and either ordering
// works. Regex MUST match 68-01's exactly: /^(browser-|computer-use-|screenshot)/
// ─────────────────────────────────────────────────────────────────────

const VISUAL_TOOL_PATTERN = /^(browser-|computer-use-|screenshot)/

export function isVisualTool(toolName: string): boolean {
	return VISUAL_TOOL_PATTERN.test(toolName)
}

// ─────────────────────────────────────────────────────────────────────
// User-friendly name helper (CONTEXT D-28).
// Replaces hyphens/underscores with spaces, title-cases each word.
// Examples:
//   'browser-navigate'        → 'Browser Navigate'
//   'execute_command'         → 'Execute Command'
//   'mcp_brave_search'        → 'Mcp Brave Search'
//   'computer-use-screenshot' → 'Computer Use Screenshot'
// ─────────────────────────────────────────────────────────────────────

export function getUserFriendlyToolName(toolName: string): string {
	return toolName
		.replace(/[-_]+/g, ' ')
		.split(' ')
		.filter(Boolean)
		.map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
		.join(' ')
}

// ─────────────────────────────────────────────────────────────────────
// ToolCategory → LivIconKey adapter (P66-04).
// Mirrors the dispatcher (68-02). Keep these two maps in sync; once both
// land, P69 may extract to a single shared util.
//
// Note: ToolCategory has 'computer-use' which is NOT a LivIcons key — we
// route it to 'screenShare' (the closest visual semantic).
// ─────────────────────────────────────────────────────────────────────

const categoryToIconKey: Record<ToolCategory, LivIconKey> = {
	browser: 'browser',
	terminal: 'terminal',
	file: 'file',
	fileEdit: 'fileEdit',
	webSearch: 'webSearch',
	webCrawl: 'webCrawl',
	webScrape: 'webScrape',
	mcp: 'mcp',
	'computer-use': 'screenShare',
	generic: 'generic',
}

// ─────────────────────────────────────────────────────────────────────
// Status dot — small colored circle, animate-pulse only when running.
// CONTEXT D-27. Inline `style` for the background-color so we get the
// CSS-token-driven palette without a Tailwind safelist entry.
// ─────────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<ToolCallSnapshot['status'], string> = {
	running: 'var(--liv-accent-cyan)',
	done: 'var(--liv-accent-emerald)',
	error: 'var(--liv-accent-rose)',
}

function StatusDot({status}: {status: ToolCallSnapshot['status']}) {
	return (
		<span
			data-status={status}
			className={cn(
				'inline-block size-2 shrink-0 rounded-full',
				status === 'running' && 'animate-pulse',
			)}
			style={{backgroundColor: STATUS_COLOR[status]}}
			aria-hidden
		/>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Elapsed-time formatting helper. Same arithmetic as GenericToolView
// (68-02). Duplicated intentionally per planner note in 68-03-PLAN.md
// — both files are <30 lines worth of helper; centralizing in P69.
// ─────────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
	const sec = Math.max(0, ms) / 1000
	return sec < 10 ? `${sec.toFixed(1)}s` : `${Math.round(sec)}s`
}

// ─────────────────────────────────────────────────────────────────────
// Public component
// ─────────────────────────────────────────────────────────────────────

export interface InlineToolPillProps {
	snapshot: ToolCallSnapshot
	onClick: () => void
	className?: string
}

export function InlineToolPill({snapshot, onClick, className}: InlineToolPillProps) {
	// Tick the elapsed counter once a second while running. When the
	// snapshot finishes, the interval is cleared and the pill freezes
	// at the final completedAt - startedAt value.
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		if (snapshot.status !== 'running') return
		const id = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(id)
	}, [snapshot.status])

	const Icon: TablerIcon = LivIcons[categoryToIconKey[snapshot.category]]
	const isVisual = isVisualTool(snapshot.toolName)
	const elapsedMs = (snapshot.completedAt ?? now) - snapshot.startedAt
	const friendlyName = getUserFriendlyToolName(snapshot.toolName)

	return (
		<button
			type='button'
			onClick={onClick}
			data-testid='inline-tool-pill'
			data-visual={isVisual ? 'true' : 'false'}
			className={cn(
				'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-left',
				'bg-[color:var(--liv-bg-elevated)]/50 hover:bg-[color:var(--liv-bg-elevated)]',
				'cursor-pointer transition-colors',
				isVisual && 'border-l-2 border-[color:var(--liv-accent-cyan)]/40',
				className,
			)}
		>
			<StatusDot status={snapshot.status} />
			<Icon className='size-4 shrink-0 text-[color:var(--liv-text-muted)]' aria-hidden />
			<span className='min-w-0 flex-1 truncate text-12 font-medium'>{friendlyName}</span>
			<span className='shrink-0 text-12 text-[color:var(--liv-text-muted)] tabular-nums'>
				{formatElapsed(elapsedMs)}
			</span>
			<IconChevronRight
				className='size-3 shrink-0 text-[color:var(--liv-text-muted)]'
				aria-hidden
			/>
		</button>
	)
}
