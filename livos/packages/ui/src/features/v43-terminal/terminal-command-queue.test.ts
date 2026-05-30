/**
 * Phase 252 G17 — terminal-command-queue unit tests.
 *
 * Locks the producer/consumer hand-off contract used by the Liv AI CLI-auth
 * bridge: commands run immediately when a sender is registered, otherwise
 * they wait (single-slot) for the next sender to register.
 */
import {afterEach, describe, expect, it, vi} from 'vitest'

import {requestTerminalCommand, setActiveTerminalSender} from './terminal-command-queue'

afterEach(() => {
	// Always clear the active sender so module-level state never leaks between
	// tests. Re-registering also flushes any stale pending command into a noop
	// sink before we drop it.
	setActiveTerminalSender(() => {})
	setActiveTerminalSender(null)
})

describe('terminal-command-queue', () => {
	it('runs immediately when a sender is already registered', () => {
		const sender = vi.fn()
		setActiveTerminalSender(sender)
		requestTerminalCommand('claude auth login')
		expect(sender).toHaveBeenCalledTimes(1)
		expect(sender).toHaveBeenCalledWith('claude auth login')
	})

	it('defers a command until a sender registers, then flushes it', () => {
		// No sender yet.
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

		// New pane takes over — must NOT re-run the already-consumed command.
		setActiveTerminalSender(null)
		const second = vi.fn()
		setActiveTerminalSender(second)
		expect(second).not.toHaveBeenCalled()
	})

	it('overwrites a pending command if a second arrives before any sender', () => {
		requestTerminalCommand('claude auth login')
		requestTerminalCommand('openclaw auth login')
		const sender = vi.fn()
		setActiveTerminalSender(sender)
		expect(sender).toHaveBeenCalledTimes(1)
		expect(sender).toHaveBeenCalledWith('openclaw auth login')
	})

	it('does not flush when sender is cleared to null', () => {
		const sender = vi.fn()
		setActiveTerminalSender(sender)
		setActiveTerminalSender(null)
		requestTerminalCommand('claude auth login')
		expect(sender).not.toHaveBeenCalled()
	})
})
