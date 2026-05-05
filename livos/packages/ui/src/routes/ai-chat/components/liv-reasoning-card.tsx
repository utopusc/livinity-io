/**
 * LivReasoningCard — Phase 75-02. Renders Kimi `reasoning_content` as a
 * collapsible amber card. Default collapsed. GlowPulse while streaming.
 * MEM-01 + MEM-02.
 *
 * Surface (binding contract per CONTEXT D-13):
 *   <LivReasoningCard
 *     reasoning={lastMsg.reasoning}
 *     isStreaming={status === 'streaming' && lastChunkType === 'reasoning'}
 *     durationMs={lastMsg.reasoningDurationMs}
 *     defaultOpen={false}
 *   />
 *
 * Visual (CONTEXT D-14):
 *   - Header: amber-tinted Brain icon + label + chevron. Pointer cursor.
 *   - Closed background: rgba(255,189,56,0.04). Hover: rgba(255,189,56,0.08).
 *   - Border: 1px solid var(--liv-border-subtle).
 *   - While streaming: <GlowPulse color="amber"> wraps the brain icon.
 *   - Open body: react-markdown over `reasoning`, prose styling, top divider.
 *
 * Wire-up (D-15) lives in plan 75-07 (chat-messages render path). This file
 * is the standalone primitive; tests cover the helper + source-text invariants
 * per the established P67-04 / P68-01 / P70-04 D-NO-NEW-DEPS pattern (no RTL).
 *
 * Threat model (T-75-02-01 mitigation): react-markdown 9 sanitizes by
 * default — raw HTML is escaped, NOT interpreted. We must NEVER add the
 * raw-HTML rehype plugin or React's html-bypass escape hatch. The test
 * file enforces both invariants by greppable source-text assertions.
 */

import {useState, type KeyboardEvent} from 'react'

import {IconBrain, IconChevronDown, IconChevronRight} from '@tabler/icons-react'
import ReactMarkdown from 'react-markdown'

import {GlowPulse} from '@/components/motion'
import {cn} from '@/shadcn-lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Pure helper (D-13 / D-14)
// ─────────────────────────────────────────────────────────────────────

/**
 * Format an elapsed-millisecond span as a compact human label.
 *
 *   undefined          → ''         (label suppression — no duration suffix)
 *   < 1000             → '<1s'
 *   1000..59999        → '4.3s'     (1 decimal, toFixed(1) rounding)
 *   >= 60000           → '2m 13s'   (whole minutes + whole seconds)
 *
 * Pure / side-effect-free / no React deps — directly unit-tested.
 */
export function formatDuration(ms: number | undefined): string {
	if (ms === undefined || ms === null) return ''
	if (ms < 1000) return '<1s'
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
	const mins = Math.floor(ms / 60_000)
	const secs = Math.floor((ms % 60_000) / 1000)
	return `${mins}m ${secs}s`
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export interface LivReasoningCardProps {
	/** The accumulated `reasoning_content` text (Kimi only — empty string for
	 * Anthropic / non-thinking turns). Caller is responsible for not mounting
	 * this component when `reasoning` is empty. */
	reasoning: string
	/** True while the run-status is `'streaming'` AND the most-recent chunk
	 * type was `'reasoning'`. Drives the GlowPulse + label switch. */
	isStreaming: boolean
	/** Total elapsed milliseconds for the reasoning phase (set by the hook
	 * when reasoning completes). Optional — undefined hides the duration
	 * suffix from the closed-state label. */
	durationMs?: number
	/** Initial collapsed/expanded state. Defaults to `false` per
	 * v31-DRAFT line 786 ("Collapsible card, default collapsed"). */
	defaultOpen?: boolean
	/** Optional className override on the outer card container. */
	className?: string
}

let bodyIdSeed = 0
function nextBodyId(): string {
	bodyIdSeed += 1
	return `liv-reasoning-body-${bodyIdSeed}`
}

export function LivReasoningCard({
	reasoning,
	isStreaming,
	durationMs,
	defaultOpen = false,
	className,
}: LivReasoningCardProps) {
	const [open, setOpen] = useState<boolean>(defaultOpen)
	// One id per mounted instance — collisions only matter for screen readers
	// within the same parent, but stable per-mount keeps the aria-controls
	// linkage deterministic.
	const [bodyId] = useState<string>(() => nextBodyId())

	const label = isStreaming
		? 'Liv is thinking…'
		: durationMs !== undefined
			? `${'Reasoning'} · ${formatDuration(durationMs)}`
			: 'Reasoning'

	const Chevron = open ? IconChevronDown : IconChevronRight

	const brainIcon = (
		<IconBrain
			size={16}
			className='text-[color:var(--liv-accent-amber)]'
			aria-hidden='true'
		/>
	)

	const toggle = () => setOpen((o) => !o)

	const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			toggle()
		}
	}

	return (
		<div
			className={cn(
				'my-2 overflow-hidden rounded-md border',
				'border-[color:var(--liv-border-subtle)]',
				'bg-[rgba(255,189,56,0.04)]',
				className,
			)}
			data-testid='liv-reasoning-card'
			data-streaming={isStreaming ? 'true' : 'false'}
			data-open={open ? 'true' : 'false'}
		>
			<button
				type='button'
				role='button'
				aria-expanded={open}
				aria-controls={bodyId}
				tabIndex={0}
				onClick={toggle}
				onKeyDown={handleKeyDown}
				className={cn(
					'flex w-full cursor-pointer items-center gap-2',
					'px-3 py-2 text-left',
					'hover:bg-[rgba(255,189,56,0.08)]',
					'focus:outline-none focus-visible:ring-2',
					'focus-visible:ring-[color:var(--liv-accent-amber)]',
				)}
			>
				{isStreaming ? (
					<GlowPulse color='amber' blur='soft' duration={2}>
						{brainIcon}
					</GlowPulse>
				) : (
					brainIcon
				)}
				<span
					className={cn(
						'flex-1 text-sm font-medium',
						'text-[color:var(--liv-accent-amber)]',
					)}
				>
					{label}
				</span>
				<Chevron
					size={14}
					className='text-[color:var(--liv-accent-amber)] opacity-70'
					aria-hidden='true'
				/>
			</button>
			{open && (
				<div
					id={bodyId}
					className={cn(
						'border-t border-[color:var(--liv-border-subtle)]',
						'px-4 py-3',
						'prose prose-sm prose-invert max-w-none',
						'text-[color:var(--liv-text-secondary)]',
					)}
				>
					<ReactMarkdown>{reasoning}</ReactMarkdown>
				</div>
			)}
		</div>
	)
}

export default LivReasoningCard
