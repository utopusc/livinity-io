/**
 * GenericToolView — Phase 68-02 fallback tool view (CONTEXT D-23..D-25).
 *
 * Renders ANY ToolCallSnapshot as:
 *   1. Header: category icon (LivIcons, P66-04) + tool name + status badge
 *      (Badge with `liv-status-running` variant from P66-03 while running).
 *   2. Body: two pretty-printed JSON blocks — `assistantCall.input` and
 *      `toolResult.output` (or "Pending..." while running).
 *   3. Footer: execution time. Ticks every 1000ms while running; settles
 *      to `((completedAt-startedAt)/1000).toFixed(1)+'s'` once done.
 *
 * Day-1 contract: the dispatcher (68-03) returns this for ALL toolNames
 * until P69 lands per-tool views. Without this, the panel would render
 * `null` for unknown tools.
 *
 * Pure helpers (`formatElapsed`, `safeStringify`, `getStatusBadgeText`,
 * `categoryToIconKey`) are exported so the unit-test file can drive them
 * directly — D-NO-NEW-DEPS keeps `@testing-library/react` out of the UI
 * package, mirroring the Phase 25/30/33/38/62/67 precedent.
 */

import {useEffect, useState} from 'react'

import {LivIcons, type LivIconKey} from '@/icons/liv-icons'
import {Badge} from '@/shadcn-components/ui/badge'
import {cn} from '@/shadcn-lib/utils'

import type {ToolCallSnapshot, ToolViewProps} from './types'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────

/**
 * Maps a `ToolCallSnapshot.category` to a `LivIconKey` (CONTEXT
 * code_context note — `computer-use` snapshot category resolves to the
 * `screenShare` icon key per P66-04).
 */
export const categoryToIconKey: Record<ToolCallSnapshot['category'], LivIconKey> = {
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

/**
 * Format an elapsed millisecond duration as a short human string.
 *   <10s → one decimal place ("2.5s")
 *   >=10s → integer seconds ("42s")
 * Negative inputs clamp to 0 (defensive — clock skew across tabs).
 */
export function formatElapsed(ms: number): string {
	const clamped = ms < 0 ? 0 : ms
	const sec = clamped / 1000
	return sec < 10 ? sec.toFixed(1) + 's' : Math.round(sec) + 's'
}

/**
 * `JSON.stringify(obj, null, 2)` with cycle-safe fallback. Mitigates
 * T-68-02-02 (cyclic objects in tool input/output crashing the panel).
 * Falls back to `String(value)` representation on TypeError.
 */
export function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2) ?? 'undefined'
	} catch {
		try {
			return String(value)
		} catch {
			return '[unserializable]'
		}
	}
}

/**
 * Status → badge label. Values are USER-FACING strings (asserted by the
 * unit tests in source-text invariants). Do not change without updating
 * tests.
 */
export function getStatusBadgeText(status: ToolCallSnapshot['status']): string {
	if (status === 'running') return 'Running'
	if (status === 'error') return 'Error'
	return 'Done'
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function StatusBadge({status}: {status: ToolCallSnapshot['status']}) {
	if (status === 'running') {
		return <Badge variant='liv-status-running'>{getStatusBadgeText(status)}</Badge>
	}
	if (status === 'error') {
		return (
			<Badge className='border-[color:var(--liv-accent-rose)]/40 bg-[color:var(--liv-accent-rose)]/10 text-[color:var(--liv-accent-rose)]'>
				{getStatusBadgeText(status)}
			</Badge>
		)
	}
	return <Badge>{getStatusBadgeText(status)}</Badge>
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export function GenericToolView({snapshot, isActive}: ToolViewProps) {
	// Live-ticking footer timer for `running` snapshots. Cleaned up on
	// unmount AND when status transitions out of 'running'.
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		if (snapshot.status !== 'running') return
		const id = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(id)
	}, [snapshot.status])

	const Icon = LivIcons[categoryToIconKey[snapshot.category]]
	const elapsedMs = (snapshot.completedAt ?? now) - snapshot.startedAt
	const isError = snapshot.status === 'error'

	return (
		<div
			className={cn('flex flex-col gap-3 p-4', isActive && 'data-active')}
			data-testid='liv-generic-tool-view'
		>
			{/* Header */}
			<header className='flex items-center gap-2'>
				<Icon className='size-4 text-[color:var(--liv-text-muted)]' />
				<h3 className='flex-1 truncate text-base font-semibold'>{snapshot.toolName}</h3>
				<StatusBadge status={snapshot.status} />
			</header>

			{/* Body: input */}
			<section className='flex flex-col gap-1'>
				<div className='text-caption text-[color:var(--liv-text-muted)]'>Input</div>
				<pre className='overflow-x-auto whitespace-pre-wrap rounded bg-[color:var(--liv-bg-elevated)]/40 p-2 font-mono text-12'>
					{safeStringify(snapshot.assistantCall.input)}
				</pre>
			</section>

			{/* Body: output */}
			<section className='flex flex-col gap-1'>
				<div className='text-caption text-[color:var(--liv-text-muted)]'>Output</div>
				{snapshot.toolResult === undefined ? (
					<div className='text-caption italic text-[color:var(--liv-text-muted)]'>Pending...</div>
				) : (
					<pre
						className={cn(
							'overflow-x-auto whitespace-pre-wrap rounded bg-[color:var(--liv-bg-elevated)]/40 p-2 font-mono text-12',
							isError && 'text-[color:var(--liv-accent-rose)]',
						)}
					>
						{safeStringify(snapshot.toolResult.output)}
					</pre>
				)}
			</section>

			{/* Footer */}
			<footer className='text-caption text-[color:var(--liv-text-muted)]'>
				{formatElapsed(elapsedMs)}
			</footer>
		</div>
	)
}
