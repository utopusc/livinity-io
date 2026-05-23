/**
 * Phase 198-06 — Slash command catalog + parser.
 *
 * The Liv AI composer (assistant-ui Thread Composer in `assistant.tsx`)
 * intercepts user input before sending. If the trimmed first token of
 * the input matches a registered SLASH_COMMANDS trigger, the matched
 * command's `transform` is used to produce either:
 *
 *   - a replacement user-message string (default path — the agent
 *     receives a normalized natural-language prompt instead of the
 *     literal slash invocation), OR
 *   - `null` — signalling "do not send a message", at which point the
 *     UI takes an alternative action (e.g. `/clear` triggers a fresh
 *     thread switch via `onSwitchToNewThread`).
 *
 * The 4 locked triggers shipped in Phase 198-06 (per the plan
 * must_haves) are:
 *
 *   /help        — explain the assistant + list available tools
 *   /clear       — start a new thread (UI-handled, no message sent)
 *   /screenshot  — ask the agent to capture the current screen
 *   /search …    — web-search the rest of the input
 *
 * Adding a new command later is a single-file edit: push another entry
 * into SLASH_COMMANDS. No call-site changes needed because the parser
 * uses runtime lookup, not generated unions.
 */

export interface SlashCommand {
	/** Wire trigger like '/help' — must start with '/'. */
	trigger: string
	/** Short human-readable label, e.g. shown in slash-popover. */
	label: string
	/** One-line help string explaining the command. */
	description: string
	/**
	 * Returns the text to insert as a user message, OR `null` to suppress
	 * sending (used by /clear which is wired to onSwitchToNewThread by
	 * the UI layer).
	 *
	 * @param rawInput  Full trimmed input including the trigger token.
	 * @param restArgs  Everything after the trigger, space-joined. Empty
	 *                  string if no arguments were supplied.
	 */
	transform: (rawInput: string, restArgs: string) => string | null
}

/**
 * The 4 locked slash commands shipped in Phase 198-06. Order is
 * preserved for any future popover-style UI; the parser itself does a
 * linear scan but the catalog is small so it doesn't matter.
 */
export const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
	{
		trigger: '/help',
		label: 'Help',
		description: 'Explain the assistant and list available tools',
		transform: () =>
			'What can you do? List the tools you have access to and give a one-line summary of each.',
	},
	{
		trigger: '/clear',
		label: 'New conversation',
		description: 'Start a fresh thread',
		// UI handles this — slash parser signals "suppress send" by
		// returning null. Assistant.tsx onSubmit checks for this case and
		// calls onSwitchToNewThread() instead of routing to the runtime.
		transform: () => null,
	},
	{
		trigger: '/screenshot',
		label: 'Take screenshot',
		description: 'Capture the current screen via the screenshot tool',
		transform: () => 'Take a screenshot of the current screen.',
	},
	{
		trigger: '/search',
		label: 'Web search',
		description: 'Search the web for the given query',
		transform: (_raw, rest) =>
			rest
				? `Search the web for: ${rest}`
				: 'What would you like to search the web for?',
	},
] as const

export interface ParsedSlash {
	/** The matched SLASH_COMMANDS entry. */
	command: SlashCommand
	/**
	 * Text the UI should send as the user message, OR `null` to suppress
	 * sending (UI takes an alternative action, e.g. /clear).
	 */
	transformedText: string | null
}

/**
 * Parse a raw composer input string and return the matched
 * SlashCommand + transformed text, or `null` if the input is not a
 * recognized slash command.
 *
 * Returns `null` for:
 *   - empty / whitespace-only input
 *   - input not starting with '/'
 *   - input starting with '/' but the first token isn't a registered
 *     trigger (e.g. '/unknown')
 */
export function parseSlashCommand(input: string): ParsedSlash | null {
	const trimmed = input.trim()
	if (!trimmed.startsWith('/')) return null
	const parts = trimmed.split(/\s+/)
	const trigger = parts[0]
	const rest = parts.slice(1)
	const command = SLASH_COMMANDS.find((c) => c.trigger === trigger)
	if (!command) return null
	const restArgs = rest.join(' ')
	return {
		command,
		transformedText: command.transform(trimmed, restArgs),
	}
}
