/**
 * Phase 252 G17 + Phase 290 R2 — terminal-command-queue unit tests.
 *
 * Locks the producer/consumer hand-off contracts:
 *   - legacy `requestTerminalCommand` runs in the active tab (CLI-auth bridge
 *     fire-into-focused-tab path).
 *   - Phase 290 R2 `requestTerminalCommandInNewTab` delivers ONLY into a fresh,
 *     keyed tab — never the currently-active/busy tab — and prefixes `cd <cwd>`.
 */
import {afterEach, describe, expect, it, vi} from 'vitest'

import {
	_resetTerminalCommandQueueForTest,
	registerActiveSenderForTab,
	requestTerminalCommand,
	requestTerminalCommandInNewTab,
	setActiveTerminalSender,
	setNewTabOpener,
} from './terminal-command-queue'

afterEach(() => {
	// M2 — reset ALL module-level state (legacy slot, keyed pending map,
	// fresh-tab stash, both registrations) so nothing leaks between cases.
	_resetTerminalCommandQueueForTest()
})

describe('terminal-command-queue — legacy active-tab path', () => {
	it('runs immediately when a sender is already registered', () => {
		const sender = vi.fn()
		setActiveTerminalSender(sender)
		requestTerminalCommand('claude auth login')
		expect(sender).toHaveBeenCalledTimes(1)
		expect(sender).toHaveBeenCalledWith('claude auth login')
	})

	it('defers a command until a sender registers, then flushes it', () => {
		requestTerminalCommand('opencode auth login')
		const sender = vi.fn()
		setActiveTerminalSender(sender)
		expect(sender).toHaveBeenCalledTimes(1)
		expect(sender).toHaveBeenCalledWith('opencode auth login')
	})

	it('runs a pending command exactly once (not re-run on next register)', () => {
		requestTerminalCommand('gemini auth login')
		const first = vi.fn()
		setActiveTerminalSender(first)
		expect(first).toHaveBeenCalledTimes(1)

		setActiveTerminalSender(null)
		const second = vi.fn()
		setActiveTerminalSender(second)
		expect(second).not.toHaveBeenCalled()
	})

	it('does not flush when sender is cleared to null', () => {
		const sender = vi.fn()
		setActiveTerminalSender(sender)
		setActiveTerminalSender(null)
		requestTerminalCommand('claude auth login')
		expect(sender).not.toHaveBeenCalled()
	})
})

describe('terminal-command-queue — Phase 290 R2 fresh-tab keyed delivery', () => {
	it('mints a fresh tab via the opener and delivers ONLY into that keyed tab', () => {
		let minted = 0
		setNewTabOpener(() => `tab-${++minted}`)

		requestTerminalCommandInNewTab('htop')

		// A DIFFERENT (busy) tab registering must NOT receive the command.
		const busy = vi.fn()
		registerActiveSenderForTab('some-other-busy-tab', busy)
		expect(busy).not.toHaveBeenCalled()

		// The minted tab registering DOES receive it, exactly once.
		const fresh = vi.fn()
		registerActiveSenderForTab('tab-1', fresh)
		expect(fresh).toHaveBeenCalledTimes(1)
		expect(fresh).toHaveBeenCalledWith('htop')

		// Re-registering the same tab does not re-deliver.
		const freshAgain = vi.fn()
		registerActiveSenderForTab('tab-1', freshAgain)
		expect(freshAgain).not.toHaveBeenCalled()
	})

	it('B2 — single-arg call (CLI-auth bridge) still works under keyed delivery', () => {
		setNewTabOpener(() => 'auth-tab')
		requestTerminalCommandInNewTab('claude') // bridge passes one arg
		const sender = vi.fn()
		registerActiveSenderForTab('auth-tab', sender)
		expect(sender).toHaveBeenCalledTimes(1)
		expect(sender).toHaveBeenCalledWith('claude')
	})

	it('B3 — when no opener is mounted, stashes for the next fresh tab and never delivers into an existing tab', () => {
		// No opener yet.
		requestTerminalCommandInNewTab('npm run dev')

		// An existing/active tab registering must NOT receive it (B3).
		const existing = vi.fn()
		registerActiveSenderForTab('existing-tab', existing)
		expect(existing).not.toHaveBeenCalled()

		// Panel mounts → opener registered → mints a fresh tab for the stash.
		setNewTabOpener(() => 'fresh-on-mount')
		const fresh = vi.fn()
		registerActiveSenderForTab('fresh-on-mount', fresh)
		expect(fresh).toHaveBeenCalledTimes(1)
		expect(fresh).toHaveBeenCalledWith('npm run dev')
	})

	it('prefixes `cd <quoted cwd> &&` when a cwd is provided (cwd-first)', () => {
		setNewTabOpener(() => 'cwd-tab')
		requestTerminalCommandInNewTab('ls -la', '/Home/projects')
		const sender = vi.fn()
		registerActiveSenderForTab('cwd-tab', sender)
		expect(sender).toHaveBeenCalledWith("cd '/Home/projects' && ls -la")
	})

	it('POSIX-escapes a single quote in the cwd', () => {
		setNewTabOpener(() => 'q-tab')
		requestTerminalCommandInNewTab('pwd', "/Home/it's mine")
		const sender = vi.fn()
		registerActiveSenderForTab('q-tab', sender)
		expect(sender).toHaveBeenCalledWith("cd '/Home/it'\\''s mine' && pwd")
	})

	it('registerActiveSenderForTab with a null sender is a no-op (cleanup path)', () => {
		setNewTabOpener(() => 'n-tab')
		requestTerminalCommandInNewTab('echo hi')
		// Null deregister must not consume the pending command.
		registerActiveSenderForTab('n-tab', null)
		const sender = vi.fn()
		registerActiveSenderForTab('n-tab', sender)
		expect(sender).toHaveBeenCalledTimes(1)
		expect(sender).toHaveBeenCalledWith('echo hi')
	})
})
