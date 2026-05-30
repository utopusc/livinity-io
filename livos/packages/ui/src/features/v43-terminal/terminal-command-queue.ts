/**
 * Phase 252 G17 — Terminal command queue (cross-component, module-level).
 *
 * The Liv AI "Local Agents" panel (an iframe at /liv) cannot drive the LivOS
 * shell's Terminal directly. When the operator clicks a CLI "Auth" button the
 * iframe postMessages the LivOS shell (see `use-cli-auth-bridge.ts`), which
 * maps the CLI name to a whitelisted login command and asks the Terminal to
 * RUN it interactively (browser-OAuth / device-code flows can't complete in a
 * fire-and-forget livinityd spawn — the operator must finish them at a TTY).
 *
 * This module is the hand-off seam between the bridge (producer) and the
 * active `TerminalTabPane` (consumer):
 *
 *   bridge → requestTerminalCommand(cmd)
 *            ├─ a live+active pane is registered → run immediately
 *            └─ no pane yet (terminal still opening) → stash as pending;
 *               the next pane that becomes live+active flushes it on register.
 *
 * Exactly ONE pane registers as the active sender at a time (the focused tab
 * that has received `ready`/`reattached`). Pending is single-slot — a second
 * request before the first runs overwrites it (operator double-click is the
 * only realistic source, and re-running the same login is harmless).
 */

type Sender = (command: string) => void

let pendingCommand: string | null = null
let activeSender: Sender | null = null

function flush(): void {
	if (pendingCommand != null && activeSender) {
		const cmd = pendingCommand
		pendingCommand = null
		activeSender(cmd)
	}
}

/**
 * Producer API — the bridge calls this to request a command run in the
 * Terminal. Runs immediately if a live+active pane is registered, otherwise
 * the command waits for the next pane to register (e.g. a freshly opened
 * Terminal window finishing its WS handshake).
 */
export function requestTerminalCommand(command: string): void {
	pendingCommand = command
	flush()
}

/**
 * Consumer API — the active+live `TerminalTabPane` registers its send fn here.
 * Pass `null` on deactivate/unmount. Registering flushes any pending command.
 */
export function setActiveTerminalSender(sender: Sender | null): void {
	activeSender = sender
	flush()
}
