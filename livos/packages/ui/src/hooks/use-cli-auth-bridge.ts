/**
 * Phase 252 G17 — Liv AI "Local Agents" CLI-auth → LivOS Terminal bridge.
 *
 * The Liv AI panel (an iframe at /liv, served by liv-assistant / vendored
 * AionUi) renders an "Available to Install" section whose per-CLI "Auth"
 * button used to call livinityd's `cliInstaller.auth` (a fire-and-forget
 * spawn). That can never complete an INTERACTIVE login — `claude auth login`
 * et al. open a browser device-code / OAuth flow that needs a real TTY the
 * operator types into. The operator also refuses to paste tokens.
 *
 * New flow (see scripts/aionui-patches/local-agents-install-section.js):
 *   iframe Auth click → window.parent.postMessage(
 *       {source:'liv-240-local-agents', type:'cli-auth', cli:<name>}, origin)
 *   → THIS hook (mounted in the LivOS shell) →
 *       - validate origin (same-origin / *.livinity.io only),
 *       - map cli → WHITELISTED login command (RCE boundary: we never accept
 *         a raw command from the iframe, only a CLI name we look up here),
 *       - open (or focus) the LivOS Terminal window,
 *       - enqueue the command; the active+live terminal pane runs it.
 *
 * The iframe and the shell are same-origin (both https://<host>/...), so the
 * postMessage targetOrigin is the shell's own origin.
 */
import {useEffect} from 'react'

import {requestTerminalCommandInNewTab} from '@/features/v43-terminal/terminal-command-queue'
import {systemAppsKeyed} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'

// D-239-07 RCE BOUNDARY mirror — the iframe sends only a CLI NAME; we map it
// to a fixed login command string here. Must stay drift-locked with
// livos/packages/livinityd/source/modules/cli-installer/auth.ts CLI_AUTH_COMMANDS.
// Only AUTH-CAPABLE CLIs appear here. The authHidden CLIs (aion-cli + the 6
// Wave C install-only CLIs: kimi-cli, mistral-vibe, hermes-agent, nanobot,
// snow-cli, kiro) are intentionally absent — their Auth button is never
// rendered (CLI_META.authHidden in the patch JS) and an unknown name is
// ignored by the handler (RCE boundary).
const CLI_AUTH_COMMANDS: Readonly<Record<string, string>> = {
	'claude-code': 'claude auth login',
	opencode: 'opencode auth login',
	gemini: 'gemini auth login',
	openclaw: 'openclaw auth login',
	// Phase 253-04 — 9 auth-capable Local Agents CLIs (mirror auth.ts)
	// Wave A
	codex: 'codex auth login',
	'qwen-code': 'qwen auth',
	augment: 'auggie login',
	'github-copilot': 'copilot',
	codebuddy: 'codebuddy',
	'qoder-cli': 'qodercli',
	// Wave B
	goose: 'goose configure',
	'factory-droid': 'droid login',
	'cursor-agent': 'cursor-agent login',
}

// GC-B — install also runs in the LivOS Terminal (not the old headless
// livinityd spawn) so the operator SEES interactive install prompts (some CLIs
// ask questions during install). The iframe sends only a CLI NAME; we validate
// it against the known install roster and build a FIXED command here (RCE
// boundary mirror — we never accept a raw command from the iframe).
// Drift-locked with SUPPORTED_CLIS in install-scripts.ts / the panel patch JS.
const INSTALLABLE_CLIS: ReadonlySet<string> = new Set([
	'claude-code', 'opencode', 'gemini', 'openclaw', 'aion-cli',
	'codex', 'qwen-code', 'augment', 'github-copilot', 'codebuddy', 'qoder-cli',
	'goose', 'factory-droid', 'cursor-agent',
	'kimi-cli', 'mistral-vibe', 'hermes-agent', 'nanobot', 'snow-cli', 'kiro',
])

function installCommandFor(cli: string): string | null {
	// Strict allowlist + charset guard before interpolating into the command.
	if (!/^[a-z0-9-]+$/.test(cli)) return null
	if (!INSTALLABLE_CLIS.has(cli)) return null
	// Server-side path: the Terminal PTY runs on the box where deploy lands the
	// install scripts (G12/G21). The 20-CLI script names are install-scripts.ts.
	return `bash /opt/livos/scripts/install/cli/${cli}.sh`
}

function isAllowedOrigin(origin: string): boolean {
	if (typeof window !== 'undefined' && origin === window.location.origin) return true
	if (origin === 'https://livinity.io') return true
	if (/^https:\/\/[a-z0-9-]+\.livinity\.io$/.test(origin)) return true
	if (
		import.meta.env.DEV &&
		/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
	) {
		return true
	}
	return false
}

/**
 * Mounted once in the desktop shell. Listens for the Liv AI iframe's
 * `cli-auth` postMessage and drives the Terminal to run the matching login
 * command. No-op when the window manager is unavailable (e.g. mobile / preview
 * trees outside the provider).
 */
export function useCliAuthBridge(): void {
	const windowManager = useWindowManagerOptional()

	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			if (!isAllowedOrigin(event.origin)) return
			const data = event.data as
				| {source?: string; type?: string; cli?: string}
				| null
				| undefined
			if (!data || data.source !== 'liv-240-local-agents') return
			const cli = typeof data.cli === 'string' ? data.cli : ''

			// Two message types share this bridge:
			//   cli-auth    → run the whitelisted `<cli> auth login` command
			//   cli-install → run the install script (GC-B — interactive prompts)
			// Both map the iframe-supplied NAME to a FIXED command here.
			let command: string | null = null
			if (data.type === 'cli-auth') {
				command = CLI_AUTH_COMMANDS[cli] ?? null
			} else if (data.type === 'cli-install') {
				command = installCommandFor(cli)
			} else {
				return
			}
			if (!command) return // unknown / unsupported CLI — ignore (RCE boundary)
			if (!windowManager) return

			// Open (or focus, if already open) the Terminal window. Same args the
			// dock entry uses (dock.tsx) so the dedupe-by-appId path matches.
			windowManager.openWindow(
				'LIVINITY_terminal',
				'/terminal',
				'Terminal',
				systemAppsKeyed['LIVINITY_terminal'].icon,
			)

			// GC-A/GC-B — run in a FRESH terminal tab so the command never lands
			// in a tab already running a CLI (e.g. a live `claude` session the
			// operator was using). The clean new tab claims the command once its
			// PTY is live. (terminal-command-queue.ts)
			requestTerminalCommandInNewTab(command)
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [windowManager])
}
