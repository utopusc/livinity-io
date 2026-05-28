/**
 * Phase 246-01 Task 2 — SessionManager class.
 *
 * Multi-session map wrapping PtySession (composition, not inheritance).
 * Single ownership boundary for all live PTYs in livinityd, consumed by:
 *   - 246-02 Redis scrollback writer
 *   - 246-03 WS attach protocol
 *   - 246-05 TTL GC
 *   - admin "kill session by id" UI
 *
 * Drift-locks (D-V44-NO-ROOT-PTY): create() propagates the non-bruce throw
 * from PtySession.start() verbatim — never catches it. Bad usernames never
 * produce a Session record.
 *
 * D-V44-SACRED: this module does NOT touch sdk-agent-runner.ts.
 */

import type {PtySession} from './session.js'
import {PtySession as RealPtySession} from './session.js'
import type {
	PtySpawnOptions,
	Session,
	SessionManagerDeps,
	SessionSummary,
} from './types.js'

export class SessionManager {
	private readonly sessions = new Map<string, Session>()
	private readonly factory: (opts: PtySpawnOptions) => PtySession
	private readonly now: () => string

	constructor(deps: SessionManagerDeps = {}) {
		this.factory = deps.ptySessionFactory ?? ((opts) => new RealPtySession(opts))
		this.now = deps.nowFn ?? (() => new Date().toISOString())
	}

	create(opts: PtySpawnOptions, nameHint?: string): Session {
		const pty = this.factory(opts)
		pty.start() // throws on non-bruce — propagate verbatim (D-V44-NO-ROOT-PTY)
		const name = nameHint ?? `terminal-${this.sessions.size + 1}`
		const ts = this.now()
		const session: Session = {
			id: pty.sessionId,
			name,
			pty,
			createdAt: ts,
			lastAttachAt: ts,
		}
		this.sessions.set(pty.sessionId, session)
		return session
	}

	get(sessionId: string): Session | null {
		return this.sessions.get(sessionId) ?? null
	}

	list(): SessionSummary[] {
		return Array.from(this.sessions.values()).map(({pty: _pty, ...rest}) => rest)
	}

	kill(sessionId: string): boolean {
		const s = this.sessions.get(sessionId)
		if (!s) return false
		s.pty.kill()
		this.sessions.delete(sessionId)
		return true
	}

	rename(sessionId: string, newName: string): boolean {
		const s = this.sessions.get(sessionId)
		if (!s) return false
		s.name = newName
		return true
	}

	touch(sessionId: string): boolean {
		const s = this.sessions.get(sessionId)
		if (!s) return false
		s.lastAttachAt = this.now()
		return true
	}

	size(): number {
		return this.sessions.size
	}

	entries(): IterableIterator<[string, Session]> {
		return this.sessions.entries()
	}
}
