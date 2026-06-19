// Phase 290 — curated terminal-command templates (backend source of truth).
//
// Returned by `shortcut.terminalTemplates`. The Terminal tab of the Add
// Shortcut dialog renders these as one-click starters; the user can edit the
// command before saving.
//
// M5 SECURITY FIX: the `claude` template ships with NO flags (a hint only).
// NEVER pre-fill `--dangerously-skip-permissions` — a one-click guard-off tile
// is a security regression. Same discipline for any agent CLI: bare invocation.

export type TerminalTemplate = {
	id: string
	label: string
	/** The command pre-filled into the editor. Editable before save. */
	command: string
	/** Short human hint shown under the label. */
	hint?: string
	/** A default icon hint (favicon/emoji-ish path) the dialog may use. */
	icon?: string
}

export const TERMINAL_TEMPLATES: ReadonlyArray<TerminalTemplate> = [
	{
		id: 'claude',
		label: 'Claude Code',
		// M5 — NO flags. Bare invocation only.
		command: 'claude',
		hint: 'Starts Claude Code in this directory (no flags — add your own).',
	},
	{
		id: 'shell',
		label: 'Shell',
		command: 'bash',
		hint: 'Open an interactive bash shell.',
	},
	{
		id: 'htop',
		label: 'htop',
		command: 'htop',
		hint: 'Interactive process viewer.',
	},
	{
		id: 'logs',
		label: 'Follow logs',
		command: 'journalctl -f',
		hint: 'Tail the system journal.',
	},
]
