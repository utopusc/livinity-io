/**
 * Phase 246-01 Task 2 — session-manager.test.ts (RED→GREEN)
 *
 * Unit tests for SessionManager — multi-session map wrapping PtySession.
 *
 * Mock pattern mirrors session.test.ts (Phase 243-01) — fake PtySession via
 * `ptySessionFactory` DI seam, no real node-pty subprocess.
 *
 * Drift-locks:
 *   - Case 1: name defaults to `terminal-${size+1}` (=> 'terminal-1' on first)
 *   - Case 3: counter follows map size, NOT a private monotonic field
 *   - Case 5: SessionManager.create propagates non-bruce throw (D-V44-NO-ROOT-PTY)
 *   - Case 8: list() strips the `pty` field for serialization safety
 *   - Case 10: kill() removes from map AND calls pty.kill() exactly once
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {beforeEach, describe, expect, it, vi} from 'vitest'

import {SessionManager} from '../session-manager.js'
import type {PtySession} from '../session.js'
import type {PtySpawnOptions} from '../types.js'

function makeFakePty(id: string): PtySession {
	return {
		sessionId: id,
		start: vi.fn(),
		kill: vi.fn(),
		on: vi.fn(),
		write: vi.fn(),
		resize: vi.fn(),
	} as unknown as PtySession
}

const baseOpts: PtySpawnOptions = {username: 'bruce', cols: 80, rows: 24}
const FIXED_TS = '2026-05-28T00:00:00.000Z'

describe('SessionManager.create()', () => {
	it('Case 1: returns Session with id === pty.sessionId, name === "terminal-1", createdAt === lastAttachAt', () => {
		const fake = makeFakePty('id-1')
		const mgr = new SessionManager({
			ptySessionFactory: vi.fn().mockReturnValue(fake),
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		const s = mgr.create(baseOpts)
		expect(s.id).toBe('id-1')
		expect(s.name).toBe('terminal-1')
		expect(s.createdAt).toBe(FIXED_TS)
		expect(s.lastAttachAt).toBe(FIXED_TS)
	})

	it('Case 2: with nameHint="foo" returns Session with name === "foo"', () => {
		const fake = makeFakePty('id-1')
		const mgr = new SessionManager({
			ptySessionFactory: vi.fn().mockReturnValue(fake),
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		const s = mgr.create(baseOpts, 'foo')
		expect(s.name).toBe('foo')
	})

	it('Case 3: called twice without nameHint produces "terminal-1" then "terminal-2"', () => {
		const fake1 = makeFakePty('id-1')
		const fake2 = makeFakePty('id-2')
		const factory = vi
			.fn()
			.mockReturnValueOnce(fake1)
			.mockReturnValueOnce(fake2)
		const mgr = new SessionManager({
			ptySessionFactory: factory,
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		const s1 = mgr.create(baseOpts)
		const s2 = mgr.create(baseOpts)
		expect(s1.name).toBe('terminal-1')
		expect(s2.name).toBe('terminal-2')
	})

	it('Case 4: calls factory once with the opts and start() exactly once', () => {
		const fake = makeFakePty('id-1')
		const factory = vi.fn().mockReturnValue(fake)
		const mgr = new SessionManager({
			ptySessionFactory: factory,
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		mgr.create(baseOpts)
		expect(factory).toHaveBeenCalledTimes(1)
		expect(factory).toHaveBeenCalledWith(baseOpts)
		expect(fake.start).toHaveBeenCalledTimes(1)
	})

	it('Case 5: propagates throw if pty.start() throws (non-bruce path — do NOT catch)', () => {
		const fake = makeFakePty('id-1')
		;(fake.start as any).mockImplementation(() => {
			throw new Error('non-bruce')
		})
		const mgr = new SessionManager({
			ptySessionFactory: vi.fn().mockReturnValue(fake),
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		expect(() => mgr.create(baseOpts)).toThrow('non-bruce')
		expect(mgr.size()).toBe(0)
	})
})

describe('SessionManager.get()', () => {
	it('Case 6: get(unknown_id) returns null', () => {
		const mgr = new SessionManager({
			ptySessionFactory: vi.fn(),
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		expect(mgr.get('does-not-exist')).toBeNull()
	})

	it('Case 7: get(known_id) returns the Session previously created', () => {
		const fake = makeFakePty('id-1')
		const mgr = new SessionManager({
			ptySessionFactory: vi.fn().mockReturnValue(fake),
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		const created = mgr.create(baseOpts)
		expect(mgr.get('id-1')).toBe(created)
	})
})

describe('SessionManager.list()', () => {
	it('Case 8: with 2 sessions returns 2 SessionSummary entries with no `pty` field present', () => {
		const fake1 = makeFakePty('id-1')
		const fake2 = makeFakePty('id-2')
		const factory = vi
			.fn()
			.mockReturnValueOnce(fake1)
			.mockReturnValueOnce(fake2)
		const mgr = new SessionManager({
			ptySessionFactory: factory,
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		mgr.create(baseOpts)
		mgr.create(baseOpts)
		const list = mgr.list()
		expect(list).toHaveLength(2)
		expect(list[0]).not.toHaveProperty('pty')
		expect(list[1]).not.toHaveProperty('pty')
		expect(list[0]).toEqual({
			id: 'id-1',
			name: 'terminal-1',
			createdAt: FIXED_TS,
			lastAttachAt: FIXED_TS,
		})
	})
})

describe('SessionManager.kill()', () => {
	it('Case 9: kill(unknown_id) returns false + does NOT call any pty.kill()', () => {
		const fake = makeFakePty('id-1')
		const mgr = new SessionManager({
			ptySessionFactory: vi.fn().mockReturnValue(fake),
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		mgr.create(baseOpts)
		const result = mgr.kill('not-a-real-id')
		expect(result).toBe(false)
		expect(fake.kill).not.toHaveBeenCalled()
	})

	it('Case 10: kill(known_id) returns true + calls pty.kill() exactly once + get(id) is null afterwards', () => {
		const fake = makeFakePty('id-1')
		const mgr = new SessionManager({
			ptySessionFactory: vi.fn().mockReturnValue(fake),
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		mgr.create(baseOpts)
		const result = mgr.kill('id-1')
		expect(result).toBe(true)
		expect(fake.kill).toHaveBeenCalledTimes(1)
		expect(mgr.get('id-1')).toBeNull()
	})
})

describe('SessionManager.rename()', () => {
	it('Case 11: rename(known_id, "foo") returns true + list() shows the new name', () => {
		const fake = makeFakePty('id-1')
		const mgr = new SessionManager({
			ptySessionFactory: vi.fn().mockReturnValue(fake),
			nowFn: vi.fn().mockReturnValue(FIXED_TS),
		})
		mgr.create(baseOpts)
		const result = mgr.rename('id-1', 'foo')
		expect(result).toBe(true)
		expect(mgr.list()[0].name).toBe('foo')
	})
})

describe('SessionManager.touch()', () => {
	it('Case 12: touch(known_id) updates lastAttachAt to nowFn next return value', () => {
		const fake = makeFakePty('id-1')
		const nowFn = vi
			.fn()
			.mockReturnValueOnce('A')
			.mockReturnValueOnce('B')
		const mgr = new SessionManager({
			ptySessionFactory: vi.fn().mockReturnValue(fake),
			nowFn,
		})
		const created = mgr.create(baseOpts)
		expect(created.lastAttachAt).toBe('A')
		const result = mgr.touch('id-1')
		expect(result).toBe(true)
		expect(mgr.get('id-1')?.lastAttachAt).toBe('B')
	})
})
