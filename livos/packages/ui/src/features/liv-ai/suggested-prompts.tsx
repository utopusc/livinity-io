/**
 * Phase 198-06 — Empty-thread suggested-prompt chips.
 *
 * Rendered inside the Liv AI Assistant when the active thread has no
 * messages (i.e. operator just clicked "+ New conversation" or first
 * launched the app). Clicking a chip surfaces the chip text into the
 * composer (the parent wires `onPick` to the composer-runtime append
 * helper) so the operator gets to a useful first prompt in one click.
 *
 * The 4 locked default prompts shipped in Plan 198-06 must_haves are:
 *
 *   - 'What is the weather in Istanbul?'    (xAI weather tool path)
 *   - 'Take a screenshot of my screen'      (Luse MCP screenshot path)
 *   - 'List my open windows'                (Luse MCP list_windows path)
 *   - 'What can you do?'                    (catch-all capability discovery)
 *
 * Operators / future plans can pass their own `prompts` array to
 * override the defaults (used by tests + future personalization plans).
 *
 * Plan 198-07 will style the empty-state container + add an
 * accompanying Liv AI logo + tagline; Plan 198-06 ships the bare
 * functional chip component, since the visual polish layer is a
 * separate plan boundary.
 */

import type {ReactElement} from 'react'

export const DEFAULT_SUGGESTED_PROMPTS: ReadonlyArray<string> = [
	'What is the weather in Istanbul?',
	'Take a screenshot of my screen',
	'List my open windows',
	'What can you do?',
] as const

export interface SuggestedPromptsProps {
	/**
	 * Override the default 4 prompts. If omitted, DEFAULT_SUGGESTED_PROMPTS
	 * is used.
	 */
	prompts?: ReadonlyArray<string>
	/**
	 * Fired with the chip's text when the operator clicks a chip. Parent
	 * is responsible for injecting the text into the composer runtime
	 * (assistant-ui exposes useComposerRuntime for this — see
	 * assistant.tsx wire-up in Task 4).
	 */
	onPick: (text: string) => void
	/**
	 * When true, the component returns null (renders nothing). The parent
	 * passes `hidden={messageCount > 0}` so chips disappear as soon as the
	 * thread has any messages.
	 */
	hidden?: boolean
}

export function SuggestedPrompts({
	prompts = DEFAULT_SUGGESTED_PROMPTS,
	onPick,
	hidden = false,
}: SuggestedPromptsProps): ReactElement | null {
	if (hidden) return null
	return (
		<div
			className='flex flex-wrap gap-2 p-4'
			data-testid='liv-ai-suggested-prompts'
		>
			{prompts.map((p) => (
				<button
					key={p}
					type='button'
					onClick={() => onPick(p)}
					className='rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800'
					data-testid={`liv-ai-suggested-prompt-${p.slice(0, 16).replace(/\s+/g, '-')}`}
				>
					{p}
				</button>
			))}
		</div>
	)
}

export default SuggestedPrompts
