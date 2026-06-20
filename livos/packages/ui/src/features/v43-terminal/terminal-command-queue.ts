/**
 * Phase 252 G17 + Phase 290 R2 — Terminal command queue (cross-component,
 * module-level).
 *
 * The Liv AI "Local Agents" panel (an iframe at /liv) cannot drive the LivOS
 * shell's Terminal directly. When the operator clicks a CLI "Auth" button the
 * iframe postMessages the LivOS shell (see `use-cli-auth-bridge.ts`), which
 * maps the CLI name to a whitelisted login command and asks the Terminal to
 * RUN it interactively (browser-OAuth / device-code flows can't complete in a
 * fire-and-forget livinityd spawn — the operator must finish them at a TTY).
 *
 * This module is the hand-off seam between producers (the CLI-auth bridge, the
 * Add-Shortcut launcher) and the active `TerminalTabPane` consumers.
 *
 * ── Phase 290 R2 rewrite — the new-tab bug fix ───────────────────────────────
 * BUG (round 1): a single `pendingCommand` slot + `setActiveTerminalSender`
 * meant `requestTerminalCommandInNewTab` could deliver into whatever tab was
 * active+live — when no `newTabOpener` was registered it fell back to `flush()`
 * into the CURRENT (busy) tab. The operator saw an auth/launch command pasted
 * into a tab already running `claude`.
 *
 * FIX: a per-TAB keyed pending map. `NewTabOpener` now RETURNS the minted
 * tabKey. `requestTerminalCommandInNewTab(command, cwd?)` either:
 *   - mints a fresh tab via the opener and stashes the command keyed by the
 *     returned tabKey → delivered ONLY when THAT tab registers its sender, OR
 *   - (B3) when no opener is mounted yet, stashes the command for the NEXT
 *     FRESH tab. On `setNewTabOpener` (panel mount) we immediately mint a fresh
 *     tab so the stashed command always lands in a brand-new tab, NEVER an
 *     existing focused one.
 *
 * `requestTerminalCommand` (legacy, fire-into-active-tab) is preserved verbatim
 * for any caller that genuinely wants the focused tab.
 */

type Sender = (command: string) => void
/**
 * Mints a new terminal tab and makes it active. RETURNS the minted tabKey so
 * the queue can address the freshly-created tab specifically (Phase 290 R2).
 */
type NewTabOpener = () => string

/** A pending command + optional working directory awaiting a specific tab. */
type PendingCommand = {command: string; cwd?: string}

// Legacy single-slot pending (fire-into-active-tab path, requestTerminalCommand).
let pendingCommand: string | null = null
let activeSender: Sender | null = null

// Phase 290 R2 — per-tab keyed pending + fresh-tab fallback.
const pendingByTab = new Map<string, PendingCommand>()
let pendingForNextFreshTab: PendingCommand | null = null
let newTabOpener: NewTabOpener | null = null

/**
 * POSIX single-quote escape so a cwd with spaces / special chars survives the
 * shell. `'` → `'\''`. Wrapped in single quotes.
 */
function shellQuote(s: string): string {
	return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Build the command line for a pending entry. When a cwd is present we `cd`
 * into it FIRST (cwd-first), then run the command, joined with `&&` so the
 * command only runs if the cd succeeds.
 */
function buildCommandLine(pending: PendingCommand): string {
	if (pending.cwd && pending.cwd.length > 0) {
		return `cd ${shellQuote(pending.cwd)} && ${pending.command}`
	}
	return pending.command
}

function flushLegacy(): void {
	if (pendingCommand != null && activeSender) {
		const cmd = pendingCommand
		pendingCommand = null
		activeSender(cmd)
	}
}

/**
 * Producer API (legacy) — run a command in whatever tab is currently
 * active+live. Used by callers that explicitly want the focused tab. Runs
 * immediately if a sender is registered, otherwise waits for the next sender.
 */
export function requestTerminalCommand(command: string): void {
	pendingCommand = command
	flushLegacy()
}

/**
 * Producer API (Phase 290 R2) — run a command in a FRESH terminal tab.
 *
 * Mechanism:
 *   - If a `newTabOpener` is registered (the Terminal panel is mounted): mint a
 *     fresh tab, stash {command, cwd} keyed by the RETURNED tabKey. The new tab
 *     becomes active → the old pane deregisters, the new live pane registers via
 *     `registerActiveSenderForTab(tabKey, sender)` and delivers ONLY its keyed
 *     command. The command can NEVER leak into a busy tab.
 *   - If NO opener is registered yet (Terminal window not mounted): stash for
 *     the NEXT FRESH tab (B3). `setNewTabOpener` (panel mount) immediately mints
 *     a fresh tab for it, so it still lands in a brand-new tab.
 *
 * @param command the command to run (the bridge passes a single arg — cwd is
 *   optional so `requestTerminalCommandInNewTab(command)` keeps compiling, B2).
 * @param cwd optional working directory; `cd <cwd> && <command>` (cwd-first).
 */
export function requestTerminalCommandInNewTab(command: string, cwd?: string): void {
	const pending: PendingCommand = {command, ...(cwd ? {cwd} : {})}
	if (newTabOpener) {
		const tabKey = newTabOpener()
		pendingByTab.set(tabKey, pending)
	} else {
		// No panel mounted yet — stash for the next fresh tab. Opening the
		// Terminal window registers an opener (setNewTabOpener) which mints a
		// fresh tab for this command. B3: NEVER deliver into an existing tab.
		pendingForNextFreshTab = pending
	}
}

/**
 * Consumer API (legacy) — the active+live `TerminalTabPane` registers its send
 * fn here for the fire-into-active-tab path. Pass `null` on deactivate/unmount.
 * Registering flushes any legacy pending command.
 */
export function setActiveTerminalSender(sender: Sender | null): void {
	activeSender = sender
	flushLegacy()
}

/**
 * Consumer API (Phase 290 R2) — a live `TerminalTabPane` registers its send fn
 * keyed by its tabKey. Delivers ONLY that tab's keyed pending command (set by
 * `requestTerminalCommandInNewTab` via the opener). Pass `null` on
 * deactivate/unmount (no-op delivery). A command is delivered exactly once.
 */
export function registerActiveSenderForTab(tabKey: string, sender: Sender | null): void {
	if (!sender) return
	const pending = pendingByTab.get(tabKey)
	if (pending) {
		pendingByTab.delete(tabKey)
		sender(buildCommandLine(pending))
	}
}

/**
 * Consumer API — `PersistentTerminalPanel` registers a callback that mints a
 * new tab and makes it active, RETURNING the new tabKey (Phase 290 R2). Used by
 * `requestTerminalCommandInNewTab` so auth/launch commands always run in a clean
 * shell. Pass `null` on unmount.
 *
 * B3 — on registration, if a command was stashed for the next fresh tab (it was
 * requested before the panel mounted), immediately mint a fresh tab for it and
 * key the pending command to that tab, so it never lands in an existing tab.
 */
export function setNewTabOpener(opener: NewTabOpener | null): void {
	newTabOpener = opener
	if (opener && pendingForNextFreshTab) {
		const pending = pendingForNextFreshTab
		pendingForNextFreshTab = null
		const tabKey = opener()
		pendingByTab.set(tabKey, pending)
	}
}

/**
 * Test-only — reset ALL module-level state (M2). Vitest shares the module
 * across cases, so the afterEach hook must clear the legacy slot, the keyed
 * pending map, the fresh-tab stash, and both registrations.
 */
export function _resetTerminalCommandQueueForTest(): void {
	pendingCommand = null
	activeSender = null
	pendingByTab.clear()
	pendingForNextFreshTab = null
	newTabOpener = null
}
