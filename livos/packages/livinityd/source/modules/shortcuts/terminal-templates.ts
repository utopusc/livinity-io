// Phase 290 — curated terminal-command templates (backend source of truth).
//
// Returned by `shortcut.terminalTemplates`. The Terminal tab of the Add
// Shortcut dialog renders these as an icon-rich card grid; selecting an
// `ai-cli` template also reveals a flags reference panel (Phase 290 R2).
//
// ⛔ M5 SECURITY: every `command` is the BARE binary. NEVER pre-fill a
// guard-off flag (`--dangerously-skip-permissions`, `--yolo`,
// `--dangerously-bypass-approvals-and-sandbox`, `--full-auto`, `--yes-always`).
// Those flags ARE documented in `flags[]` so the operator can opt in with an
// explicit "Insert" click — but a tile must never ship them pre-applied.
//
// Flag references were web-verified against each tool's official CLI docs
// (2026-06): Claude Code, OpenAI Codex, Google Gemini CLI, OpenCode, aider.

export type TerminalTemplateFlag = {
	/** The flag token, e.g. "--model" or "-p / --print". */
	flag: string
	/** One-line human description. */
	description: string
}

export type TerminalTemplate = {
	id: string
	label: string
	/** The command pre-filled into the editor (BARE — M5). Editable before save. */
	command: string
	/** Short human hint shown under the label. */
	hint?: string
	/** Icon URL/path the dialog renders on the template card. */
	icon?: string
	/** Grouping for the dialog UI. */
	category?: 'ai-cli' | 'shell' | 'system' | 'dev'
	/** AI-CLI flag reference, shown in the right-column panel when selected. */
	flags?: TerminalTemplateFlag[]
}

const DI = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg'
const TERMINAL_SVG = '/figma-exports/dock-terminal.svg'

export const TERMINAL_TEMPLATES: ReadonlyArray<TerminalTemplate> = [
	// ── AI CLIs ──────────────────────────────────────────────────────────────
	{
		id: 'claude',
		label: 'Claude Code',
		command: 'claude', // M5 — bare.
		hint: 'Anthropic Claude Code agent. Add flags from the reference if you need them.',
		icon: `${DI}/claude-ai.svg`,
		category: 'ai-cli',
		flags: [
			{flag: '--model <name>', description: 'Pick the model (e.g. opus, sonnet, or a full model id).'},
			{flag: '-p / --print', description: 'Non-interactive: print the response and exit (good for scripts/pipes).'},
			{flag: '-c / --continue', description: 'Continue the most recent conversation in this directory.'},
			{flag: '-r / --resume', description: 'Resume a specific past session (prompts for / takes a session id).'},
			{flag: '--add-dir <path>', description: 'Grant the session access to an additional working directory.'},
			{flag: '--permission-mode <mode>', description: 'Set the permission mode (e.g. plan, acceptEdits, default).'},
			{flag: '--output-format <fmt>', description: 'Output as text / json / stream-json (use with --print).'},
			{flag: '--mcp-config <file>', description: 'Load MCP servers from a JSON config file.'},
		],
	},
	{
		id: 'codex',
		label: 'Codex',
		command: 'codex', // M5 — bare (NOT --full-auto / --yolo).
		hint: 'OpenAI Codex CLI. `codex exec` runs non-interactively.',
		icon: `${DI}/openai.svg`,
		category: 'ai-cli',
		flags: [
			{flag: '-m / --model <name>', description: 'Override the configured model.'},
			{flag: '-s / --sandbox <policy>', description: 'Sandbox: read-only | workspace-write | danger-full-access.'},
			{flag: '-a / --ask-for-approval <p>', description: 'Approval prompts: untrusted | on-request | never.'},
			{flag: '-C / --cd <dir>', description: 'Set the working directory before running.'},
			{flag: '-i / --image <file>', description: 'Attach one or more images to the prompt.'},
			{flag: '-p / --profile <name>', description: 'Layer a named config profile over the base config.'},
			{flag: '--search', description: 'Enable live web search instead of cached results.'},
			{flag: 'exec', description: 'Subcommand: run a scripted task non-interactively.'},
		],
	},
	{
		id: 'opencode',
		label: 'OpenCode',
		command: 'opencode', // M5 — bare.
		hint: 'OpenCode terminal agent. `opencode run` for non-interactive prompts.',
		icon: TERMINAL_SVG,
		category: 'ai-cli',
		flags: [
			{flag: 'run "<prompt>"', description: 'Run a one-shot prompt non-interactively.'},
			{flag: '-m / --model <name>', description: 'Pick a model variant.'},
			{flag: '--continue', description: 'Continue the previous session.'},
			{flag: '--session <id>', description: 'Resume a specific session by id.'},
			{flag: 'auth login', description: 'Configure provider API credentials.'},
			{flag: 'session list', description: 'List your saved sessions.'},
		],
	},
	{
		id: 'gemini',
		label: 'Gemini',
		command: 'gemini', // M5 — bare (NOT --yolo).
		hint: 'Google Gemini CLI. Use -p "…" for a one-shot prompt.',
		icon: `${DI}/google-gemini.svg`,
		category: 'ai-cli',
		flags: [
			{flag: '-m / --model <name>', description: 'Choose the Gemini model (alias or full name).'},
			{flag: '-p / --prompt "<text>"', description: 'Send a prompt directly (non-interactive).'},
			{flag: '-i / --prompt-interactive "<text>"', description: 'Start interactive with an initial prompt.'},
			{flag: '--all-files', description: 'Include all files in the current dir as context.'},
			{flag: '--sandbox', description: 'Run tool actions inside a sandbox.'},
			{flag: '--approval-mode <mode>', description: 'Set approval mode (default | auto-edit | yolo).'},
		],
	},
	{
		id: 'aider',
		label: 'aider',
		command: 'aider', // M5 — bare (NOT --yes-always).
		hint: 'aider AI pair programmer. Add files / models from the reference.',
		icon: TERMINAL_SVG,
		category: 'ai-cli',
		flags: [
			{flag: '--model <name>', description: 'Model to use for the main chat.'},
			{flag: '--message "<text>"', description: 'Send a one-shot message and exit.'},
			{flag: '--architect', description: 'Launch in architect mode (planner + editor models).'},
			{flag: '--read <file>', description: 'Add read-only files at launch (repeatable).'},
			{flag: '--map-tokens <n>', description: 'Token budget for the repo map (0 disables it).'},
		],
	},

	// ── Shell / system ────────────────────────────────────────────────────────
	{
		id: 'shell',
		label: 'Shell',
		command: 'bash',
		hint: 'Open an interactive bash shell.',
		icon: TERMINAL_SVG,
		category: 'shell',
	},
	{
		id: 'htop',
		label: 'htop',
		command: 'htop',
		hint: 'Interactive process viewer.',
		icon: TERMINAL_SVG,
		category: 'system',
	},
	{
		id: 'logs',
		label: 'Follow logs',
		command: 'journalctl -f',
		hint: 'Tail the system journal.',
		icon: TERMINAL_SVG,
		category: 'system',
	},
]
