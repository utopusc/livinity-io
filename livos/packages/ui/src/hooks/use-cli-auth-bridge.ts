/**
 * Phase 252 G17 → Phase 267-02 — Liv AI "Local Agents" CLI install/auth bridge.
 *
 * NO-TERMINAL DEFAULT (267-02): the Liv AI panel (an iframe at /liv, served by
 * liv-assistant / vendored AionUi) and the onboarding CLI step trigger CLI
 * install/auth by posting a CLI NAME to this hook. The OLD behavior opened the
 * LivOS Terminal and ran `bash …/cli/<name>.sh` / `<cli> auth login` in a PTY
 * tab — the operator wants that GONE.
 *
 * New default flow:
 *   iframe Install/Auth click → window.parent.postMessage(
 *       {source:'liv-240-local-agents', type:'cli-install'|'cli-auth', cli:<name>}, origin)
 *   → THIS hook (mounted in the LivOS shell) →
 *       - validate origin (same-origin / *.livinity.io only),
 *       - validate the CLI NAME against the install/auth whitelist (RCE
 *         boundary: we never accept a raw command from the iframe, only a
 *         NAME we look up here),
 *       - OPEN the no-terminal <CliAuthDialog> (openCliAuthDialog) — which
 *         drives install + the device/apikey/browser auth branch over tRPC.
 *
 * DEMOTED Terminal fallback (267-02): the OLD Terminal-routing behavior is NOT
 * deleted — it is moved behind the dialog's explicit "Advanced: run in Terminal
 * instead" affordance. The dialog calls `runCliInTerminalFallback(...)` (exported
 * below), which maps the NAME → a FIXED whitelisted command and runs it in a
 * fresh Terminal tab exactly as before. Power users keep the escape hatch; the
 * default path never opens the Terminal.
 *
 * The iframe and the shell are same-origin (both https://<host>/...), so the
 * postMessage targetOrigin is the shell's own origin.
 */
import {useEffect} from 'react'

import {openCliAuthDialog} from '@/features/liv-ai/cli-auth-dialog'
import {requestTerminalCommandInNewTab} from '@/features/v43-terminal/terminal-command-queue'
import {systemAppsKeyed} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'

/** The window-manager handle the desktop shell hook holds (may be null). */
type WindowManager = ReturnType<typeof useWindowManagerOptional>

// D-239-07 RCE BOUNDARY mirror — the iframe sends only a CLI NAME; we map it
// to a fixed login command string here. Must stay drift-locked with
// livos/packages/livinityd/source/modules/cli-installer/auth.ts CLI_AUTH_COMMANDS.
// This map now ONLY feeds the DEMOTED "Advanced: run in Terminal" fallback
// (runCliInTerminalFallback) — the default path opens the dialog instead. The
// auth-method branch (apikey vs device vs browser) is decided server-side by
// cliInstaller.getAuthMethod inside the dialog, NOT here.
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
	// Phase 267-02 — the Wave-C device/browser-auth CLIs also get a Terminal
	// fallback command (mirror auth.ts CLI_AUTH_COMMANDS); the default path is
	// still the dialog, this is only the "Advanced" escape hatch.
	'kimi-cli': 'kimi login',
	'hermes-agent': 'hermes setup --portal',
	kiro: 'kiro-cli login',
}

// GC-B — install in the LivOS Terminal is now the DEMOTED fallback only. The
// iframe sends only a CLI NAME; we validate it against the known install roster
// and build a FIXED command here (RCE boundary mirror — we never accept a raw
// command from the iframe). Drift-locked with SUPPORTED_CLIS in
// install-scripts.ts / the panel patch JS.
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
 * DEMOTED Terminal fallback (267-02). Called by the dialog's "Advanced: run in
 * Terminal instead" affordance — maps the CLI NAME → a FIXED whitelisted
 * command and runs it in a fresh Terminal tab, exactly as the OLD default did.
 *
 * The NAME-only RCE boundary is preserved: an unknown / unsupported name maps to
 * null and is ignored. No-op when the window manager is unavailable.
 */
export function runCliInTerminalFallback(
	windowManager: WindowManager,
	type: 'cli-install' | 'cli-auth',
	cli: string,
): void {
	let command: string | null = null
	if (type === 'cli-auth') {
		command = CLI_AUTH_COMMANDS[cli] ?? null
	} else if (type === 'cli-install') {
		command = installCommandFor(cli)
	} else {
		return
	}
	if (!command) return // unknown / unsupported CLI — ignore (RCE boundary)
	if (!windowManager) return

	// Open (or focus, if already open) the Terminal window. Same args the dock
	// entry uses (dock.tsx) so the dedupe-by-appId path matches.
	windowManager.openWindow(
		'LIVINITY_terminal',
		'/terminal',
		'Terminal',
		systemAppsKeyed['LIVINITY_terminal'].icon,
	)

	// GC-A/GC-B — run in a FRESH terminal tab so the command never lands in a tab
	// already running a CLI (e.g. a live `claude` session). The clean new tab
	// claims the command once its PTY is live. (terminal-command-queue.ts)
	requestTerminalCommandInNewTab(command)
}

/**
 * Mounted once in the desktop shell. Listens for the Liv AI iframe's
 * `cli-install` / `cli-auth` postMessage and OPENS the no-terminal
 * <CliAuthDialog> (default 267-02 behavior). The dialog (also mounted in the
 * shell) decides install vs the device/apikey/browser auth branch over tRPC.
 */
export function useCliAuthBridge(): void {
	useEffect(() => {
		function handleMessage(event: MessageEvent) {
			if (!isAllowedOrigin(event.origin)) return
			const data = event.data as
				| {source?: string; type?: string; cli?: string}
				| null
				| undefined
			if (!data || data.source !== 'liv-240-local-agents') return
			const cli = typeof data.cli === 'string' ? data.cli : ''

			// NAME-only RCE boundary: validate against the same whitelist the
			// Terminal fallback uses before we hand the name to the dialog. The
			// dialog only ever sends the NAME to whitelist-guarded tRPC routes,
			// but we gate here too so an unknown name never opens anything.
			if (!/^[a-z0-9-]+$/.test(cli) || !INSTALLABLE_CLIS.has(cli)) return

			// Three message types share this bridge:
			//   cli-install   → open the dialog on the install step
			//   cli-auth      → open the dialog toward the auth branch
			//   cli-uninstall → open the dialog on the detected CLI (it shows the
			//                   Uninstall confirm)
			if (data.type === 'cli-install') {
				openCliAuthDialog({cli, mode: 'install'})
			} else if (data.type === 'cli-auth') {
				openCliAuthDialog({cli, mode: 'auth'})
			} else if (data.type === 'cli-uninstall') {
				// Phase 268-04 — the Remove button in the panel posts cli-uninstall;
				// we open the dialog on the detected CLI (it shows the Uninstall
				// confirm + calls cliInstaller.uninstall). NAME-only RCE boundary
				// unchanged: the /^[a-z0-9-]+$/ && INSTALLABLE_CLIS gate above already
				// ran. mode:'auth' keeps the CliAuthDialogDetail union ('install'|'auth')
				// unchanged — the dialog detects the CLI and surfaces Remove.
				openCliAuthDialog({cli, mode: 'auth'})
			} else {
				// Unknown message type — ignore.
			}
		}

		window.addEventListener('message', handleMessage)
		return () => window.removeEventListener('message', handleMessage)
	}, [])
}
