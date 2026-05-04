/**
 * LivWelcome — Phase 70-03. First-open welcome screen with greeting + 4
 * suggestion cards (CONTEXT D-41, D-42, D-43).
 *
 * Mounted by `index.tsx` in 70-08 when `messages.length === 0 && !isStreaming`.
 * This file ships ONLY the presentational component + 4 default suggestions
 * + two pure helpers (`getTimeOfDayGreeting`, `formatGreeting`). The mount
 * decision and tRPC user-name plumbing live in 70-08; this component takes
 * `userName` as an optional prop and falls back to `'there'`.
 *
 * Design tokens: P66 `liv-tokens.css` (D-08). Motion: P66 `FadeIn` +
 * `StaggerList` (D-09). Icons: P66 `LivIcons` map (D-17).
 *
 * NOTE on `<FadeIn delay>`: the prop is in **seconds** (matches framer-motion
 * `transition.delay`). The plan text suggested `delay={100}` but per the
 * shipped P66-02 API at `livos/packages/ui/src/components/motion/FadeIn.tsx`
 * line 23 the comment reads "Delay (seconds) before the entrance animation
 * begins." We pass `0.1` (= 100ms) to honour the original design intent.
 */

import {useMemo} from 'react'

import {FadeIn, StaggerList} from '@/components/motion'
import {LivIcons} from '@/icons/liv-icons'
import {cn} from '@/shadcn-lib/utils'

// ─────────────────────────────────────────────────────────────────────
// Suggestion data + types (CONTEXT D-41, D-42)
// ─────────────────────────────────────────────────────────────────────

export interface LivWelcomeSuggestion {
	title: string
	prompt: string
	icon: keyof typeof LivIcons
}

/**
 * Hardcoded default suggestions for the v31 entry. Per CONTEXT D-42:
 * 1. Search the web   → webSearch
 * 2. Help me write    → fileEdit
 * 3. Run a command    → terminal
 * 4. Take a screenshot→ screenShare
 *
 * Per-user / configurable suggestions are explicitly deferred to backlog
 * (CONTEXT scope_guard).
 */
export const LIV_WELCOME_SUGGESTIONS: LivWelcomeSuggestion[] = [
	{
		title: 'Search the web',
		prompt: 'Search the web for the latest news on AI agents',
		icon: 'webSearch',
	},
	{
		title: 'Help me write',
		prompt: 'Help me write a thank-you email to my team',
		icon: 'fileEdit',
	},
	{
		title: 'Run a command',
		prompt: 'List all Docker containers and their status on my server',
		icon: 'terminal',
	},
	{
		title: 'Take a screenshot',
		prompt: 'Take a screenshot of my desktop and describe what you see',
		icon: 'screenShare',
	},
]

// ─────────────────────────────────────────────────────────────────────
// Pure helpers (D-43)
// ─────────────────────────────────────────────────────────────────────

/**
 * Time-of-day greeting based on a 24h hour value.
 *
 *   0..11  → 'Good morning'
 *   12..17 → 'Good afternoon'
 *   18..23 → 'Good evening'
 *
 * Caller is responsible for passing a valid 0-23 hour. Out-of-range hours
 * fall through to 'Good evening' (defensive, but spec only covers 0-23).
 */
export function getTimeOfDayGreeting(hour: number): string {
	if (hour < 12) return 'Good morning'
	if (hour < 18) return 'Good afternoon'
	return 'Good evening'
}

/**
 * Full greeting line. When `name` is undefined / null / empty / whitespace-
 * only, falls back to `'there'`.
 *
 * Examples:
 *   formatGreeting('bruce', 8)     → 'Good morning, bruce'
 *   formatGreeting(undefined, 18)  → 'Good evening, there'
 *   formatGreeting('   ', 12)      → 'Good afternoon, there'
 */
export function formatGreeting(
	name: string | undefined | null,
	hour: number,
): string {
	const display = name && name.trim().length > 0 ? name : 'there'
	return `${getTimeOfDayGreeting(hour)}, ${display}`
}

// ─────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────

export interface LivWelcomeProps {
	/** Optional display name (typically `trpc.users.getCurrent.useQuery().data?.name`
	 * threaded in by index.tsx in 70-08). Empty / null → 'there'. */
	userName?: string | null
	/** Click-handler invoked with the suggestion's prompt string. */
	onSelectSuggestion: (prompt: string) => void
	className?: string
}

/**
 * First-open welcome screen. Centred greeting + 4 suggestion cards in a
 * 2x2 grid (1-col on mobile per `grid-cols-1 md:grid-cols-2`) + slash-menu
 * hint at bottom.
 */
export function LivWelcome({
	userName,
	onSelectSuggestion,
	className,
}: LivWelcomeProps) {
	const hour = new Date().getHours()
	const greeting = useMemo(() => formatGreeting(userName, hour), [userName, hour])

	return (
		<div
			className={cn(
				'flex h-full w-full flex-col items-center justify-center gap-8 px-6 py-12',
				className,
			)}
			data-testid='liv-welcome'
		>
			<FadeIn delay={0.1} className='flex flex-col items-center text-center'>
				<h1 className='text-display-2 font-semibold text-[color:var(--liv-text-primary)]'>
					{greeting}
				</h1>
				<p className='mt-2 text-body text-[color:var(--liv-text-secondary)]'>
					How can Liv help you today?
				</p>
			</FadeIn>

			<StaggerList className='grid w-full max-w-2xl grid-cols-1 gap-3 md:grid-cols-2'>
				{LIV_WELCOME_SUGGESTIONS.map((s) => {
					const Icon = LivIcons[s.icon]
					return (
						<button
							key={s.title}
							type='button'
							onClick={() => onSelectSuggestion(s.prompt)}
							className='flex items-start gap-3 rounded-xl border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] p-4 text-left transition-colors hover:border-[color:var(--liv-accent-cyan)] hover:bg-[color:var(--liv-bg-deep)]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--liv-accent-cyan)]'
							data-suggestion-icon={s.icon}
						>
							<div className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[color:var(--liv-bg-deep)] text-[color:var(--liv-accent-cyan)]'>
								<Icon size={18} />
							</div>
							<div className='flex min-w-0 flex-col gap-0.5'>
								<span className='text-body font-medium text-[color:var(--liv-text-primary)]'>
									{s.title}
								</span>
								<span className='truncate text-caption text-[color:var(--liv-text-tertiary)]'>
									{s.prompt}
								</span>
							</div>
						</button>
					)
				})}
			</StaggerList>

			<div className='mt-2 text-caption text-[color:var(--liv-text-tertiary)]'>
				Press{' '}
				<kbd className='rounded border border-[color:var(--liv-border-subtle)] bg-[color:var(--liv-bg-elevated)] px-1.5 py-0.5 font-mono text-[10px]'>
					/
				</kbd>{' '}
				for commands
			</div>
		</div>
	)
}
