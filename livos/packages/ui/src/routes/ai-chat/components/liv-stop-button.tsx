/** LivStopButton — Phase 70-06. Stop/send button with color toggle.
 *
 * Single button, three visual states per CONTEXT D-22:
 *   - `streaming` → red bg `var(--liv-accent-rose)` + IconPlayerStop  → onStop
 *   - `send`      → cyan bg `var(--liv-accent-cyan)` + IconArrowUp   → onSend
 *   - `disabled`  → cyan/40 + IconArrowUp + cursor-not-allowed         → no-op
 *
 * Color transition via Tailwind `transition-colors duration-200` (CONTEXT D-24);
 * NO framer-motion for this micro-interaction.
 *
 * Wired in 70-08 by replacing the `data-testid='liv-composer-stop-stub'`
 * placeholder LivComposer ships in 70-01. Locked prop contract:
 *   {isStreaming, hasContent, disabled?, onSend, onStop}.
 *
 * NO new npm deps (D-07). Reuses P66 `--liv-accent-rose/cyan` tokens. */

import {IconArrowUp, IconPlayerStop} from '@tabler/icons-react'

import {cn} from '@/shadcn-lib/utils'

export type StopButtonState = 'streaming' | 'send' | 'disabled'

export interface LivStopButtonProps {
	isStreaming: boolean
	hasContent: boolean
	disabled?: boolean
	onSend: () => void
	onStop: () => void
	className?: string
}

/** Pure helper — derives visual state from props. Disabled wins, then streaming, then content.
 * Exported for vitest hammering (no DOM/RTL needed). */
export function getStopButtonState(args: {
	isStreaming: boolean
	hasContent: boolean
	disabled?: boolean
}): StopButtonState {
	if (args.disabled) return 'disabled'
	if (args.isStreaming) return 'streaming'
	if (args.hasContent) return 'send'
	return 'disabled'
}

export function LivStopButton({
	isStreaming,
	hasContent,
	disabled,
	onSend,
	onStop,
	className,
}: LivStopButtonProps) {
	const state = getStopButtonState({isStreaming, hasContent, disabled})

	const handleClick = () => {
		if (state === 'streaming') {
			onStop()
			return
		}
		if (state === 'send') {
			onSend()
			return
		}
		// disabled: no-op
	}

	return (
		<button
			type='button'
			onClick={handleClick}
			disabled={state === 'disabled'}
			aria-label={state === 'streaming' ? 'Stop generation' : 'Send message'}
			data-state={state}
			className={cn(
				'flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors duration-200',
				state === 'streaming' && 'bg-[color:var(--liv-accent-rose)] hover:opacity-90',
				state === 'send' && 'bg-[color:var(--liv-accent-cyan)] hover:opacity-90',
				state === 'disabled' && 'cursor-not-allowed bg-[color:var(--liv-accent-cyan)]/40',
				className,
			)}
		>
			{state === 'streaming' ? <IconPlayerStop size={16} /> : <IconArrowUp size={16} />}
		</button>
	)
}
