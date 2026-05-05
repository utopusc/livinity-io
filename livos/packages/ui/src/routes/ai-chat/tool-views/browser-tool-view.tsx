/**
 * BrowserToolView — Phase 69-01 (VIEWS-02).
 *
 * Spec: .planning/phases/69-per-tool-views-suite/69-CONTEXT.md D-17..D-20
 *       + .planning/v31-DRAFT.md lines 423-431.
 *
 * Two modes determined by `snapshot.category`:
 *   - 'computer-use' → live mode placeholder (CONTEXT D-17). The real
 *     live-VNC embed is a Phase 71 deliverable; D-12 forbids new
 *     package additions in P69.
 *   - 'browser' (or anything else) → static mode using the
 *     `extractScreenshot` multi-strategy parser from `./utils` (shipped
 *     by Plan 69-02 in Wave 1; this plan declares `depends_on: [02]`).
 *
 * Visual elements:
 *   - Header: category icon (LivIcons.browser / LivIcons.screenShare) +
 *     label + status badge (top-right, P66-03 `liv-status-running`
 *     variant for running per CONTEXT D-19).
 *   - "Navigating to {url}" pulse line: only when toolName ===
 *     'browser-navigate' AND status === 'running' AND url present.
 *   - Animated progress bar (CONTEXT D-20): 95% width while running,
 *     snaps to 100% on done with `transition-all duration-200`. Pure
 *     Tailwind — no animation library.
 *   - Body: live placeholder OR static screenshot OR fallback message.
 *   - Footer: URL bar (truncated max-w-[200px], font-mono text-12).
 *
 * Pure helpers (`extractUrl`) are kept module-local — no shared
 * extraction needed because URL field semantics are browser-specific.
 *
 * Threat model: D-17/D-18/D-19/D-20 + 69-01 threat register.
 *   - T-69-01-01 XSS: data: URLs in <img src> are sandboxed by browser.
 *   - T-69-01-02 XSS: URL footer is React text-children, auto-escaped.
 *   - T-69-01-04 DoS: max-h-[60vh] + object-contain caps screenshot
 *     vertical extent. Fetch-tier truncation is P73.
 */

import {LivIcons} from '@/icons/liv-icons'
import {Badge} from '@/shadcn-components/ui/badge'

import type {ToolCallSnapshot, ToolViewProps} from './types'
import {extractScreenshot} from './utils'

// ─────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Extract a URL from `assistantCall.input` accepting the three
 * canonical Suna field names (CONTEXT D-18). First-present wins.
 */
function extractUrl(input: Record<string, unknown>): string | null {
	for (const k of ['url', 'href', 'targetUrl']) {
		const v = input[k]
		if (typeof v === 'string') return v
	}
	return null
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function StatusBadge({status}: {status: ToolCallSnapshot['status']}) {
	if (status === 'running') return <Badge variant='liv-status-running'>Running</Badge>
	if (status === 'error') return <Badge>Error</Badge>
	return <Badge>Done</Badge>
}

/**
 * Animated progress bar (CONTEXT D-20).
 *   - running → 95% width, ~30s ease-out.
 *   - done    → 100% width, snaps in 200ms.
 *   - error / other → null (omitted).
 */
function ProgressBar({status}: {status: ToolCallSnapshot['status']}) {
	if (status === 'running') {
		return (
			<div className='h-1 bg-[color:var(--liv-bg-elevated)] overflow-hidden rounded'>
				<div
					className='h-full bg-[color:var(--liv-accent-cyan)] transition-all'
					style={{
						width: '95%',
						transitionDuration: '30000ms',
						transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
					}}
				/>
			</div>
		)
	}
	if (status === 'done') {
		return (
			<div className='h-1 bg-[color:var(--liv-bg-elevated)] overflow-hidden rounded'>
				<div
					className='h-full bg-[color:var(--liv-accent-cyan)] transition-all duration-200'
					style={{width: '100%'}}
				/>
			</div>
		)
	}
	return null
}

/**
 * Live VNC placeholder (CONTEXT D-17). Phase 71 will replace this with
 * the real live-VNC embed component. P69 ships only the placeholder
 * div — D-12 forbids new package dependencies here.
 */
function LiveModePlaceholder({status}: {status: ToolCallSnapshot['status']}) {
	return (
		<div className='liv-glass border border-[color:var(--liv-accent-cyan)]/30 rounded p-8 text-center'>
			<div className='text-13 mb-2'>Live VNC requires Phase 71 (Computer Use Foundation)</div>
			<div className='text-12 text-[color:var(--liv-text-secondary)]'>
				Current snapshot status: {status}
			</div>
		</div>
	)
}

/**
 * Static screenshot rendering (CONTEXT D-17). Uses `extractScreenshot`
 * from `./utils` (Plan 69-02). Falls back to a contextual message when
 * no screenshot is yet present.
 */
function StaticModeImage({snapshot}: {snapshot: ToolCallSnapshot}) {
	const screenshot = snapshot.toolResult ? extractScreenshot(snapshot.toolResult.output) : null

	if (screenshot) {
		return (
			<img
				src={screenshot}
				alt='Browser screenshot'
				className='w-full max-h-[60vh] object-contain rounded border border-[color:var(--liv-border-subtle)]'
			/>
		)
	}

	if (snapshot.status === 'running') {
		return (
			<div className='text-12 text-[color:var(--liv-text-secondary)] py-8 text-center'>
				Screenshot pending...
			</div>
		)
	}
	return (
		<div className='text-12 text-[color:var(--liv-text-secondary)] py-8 text-center'>
			No screenshot available
		</div>
	)
}

// ─────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────

export function BrowserToolView({snapshot}: ToolViewProps) {
	const isLiveMode = snapshot.category === 'computer-use'
	const Icon = isLiveMode ? LivIcons.screenShare : LivIcons.browser
	const url = extractUrl(snapshot.assistantCall.input)
	const showNavigatingLine =
		snapshot.toolName === 'browser-navigate' && snapshot.status === 'running' && url

	return (
		<div className='flex flex-col gap-3 p-3' data-testid='liv-browser-tool-view'>
			<header className='flex items-center justify-between gap-2'>
				<div className='flex items-center gap-2'>
					<Icon size={16} className='text-[color:var(--liv-text-secondary)]' />
					<span className='text-13'>{isLiveMode ? 'Computer Use' : 'Browser'}</span>
				</div>
				<StatusBadge status={snapshot.status} />
			</header>

			{showNavigatingLine ? (
				<div className='text-12 text-[color:var(--liv-text-secondary)] animate-pulse'>
					Navigating to {url}
				</div>
			) : null}

			<ProgressBar status={snapshot.status} />

			{isLiveMode ? (
				<LiveModePlaceholder status={snapshot.status} />
			) : (
				<StaticModeImage snapshot={snapshot} />
			)}

			{url ? (
				<footer className='border-t border-[color:var(--liv-border-subtle)] py-2 px-3 font-mono text-12'>
					<span className='block truncate max-w-[200px] text-[color:var(--liv-text-secondary)]'>
						{url}
					</span>
				</footer>
			) : null}
		</div>
	)
}
