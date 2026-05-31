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
type NewTabOpener = () => void

let pendingCommand: string | null = null
let activeSender: Sender | null = null
let newTabOpener: NewTabOpener | null = null

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
 * GC-A/GC-B — request a command in a FRESH terminal tab.
 *
 * The plain `requestTerminalCommand` runs in whatever tab is currently
 * active+live. When the operator already has a CLI running in that tab (e.g.
 * `claude` mid-session), an auth/install command typed into it collides with
 * the running program's stdin (the operator reported the auth command landing
 * inside the live claude session). For auth + install we instead spin up a
 * clean new tab and run there.
 *
 * Mechanism: stash the command WITHOUT flushing to the current sender, then ask
 * the panel (via the registered opener) to create a new tab. Creating the tab
 * makes it active → the old pane deregisters (`setActiveTerminalSender(null)`,
 * a no-op flush) and the new live pane registers, at which point `flush()`
 * delivers the command into the clean tab. If no opener is registered (Terminal
 * window not mounted yet) we fall back to the normal queue — the freshly opened
 * window's first tab claims the command on `ready`.
 */
export function requestTerminalCommandInNewTab(command: string): void {
	pendingCommand = command
	if (newTabOpener) {
		newTabOpener()
	} else {
		// No panel mounted yet — opening the Terminal window will create the
		// first tab, which flushes the pending command on register.
		flush()
	}
}

/**
 * Consumer API — the active+live `TerminalTabPane` registers its send fn here.
 * Pass `null` on deactivate/unmount. Registering flushes any pending command.
 */
export function setActiveTerminalSender(sender: Sender | null): void {
	activeSender = sender
	flush()
}

/**
 * Consumer API — `PersistentTerminalPanel` registers a callback that mints a
 * new tab and makes it active. Used by `requestTerminalCommandInNewTab` so
 * auth/install commands always run in a clean shell. Pass `null` on unmount.
 */
export function setNewTabOpener(opener: NewTabOpener | null): void {
	newTabOpener = opener
}
