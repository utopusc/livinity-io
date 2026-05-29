/**
 * Phase 243-01 Task 2 — session.test.ts (RED→GREEN)
 *
 * Unit tests for PtySession — node-pty wrapper class.
 *
 * D-243-NO-ROOT (L-243-B): runtime guard rejects any username other than
 *   'bruce'. Test cases 1+2 drift-lock the rejection BEFORE spawn fires.
 *
 * Test pattern mirrors `cli-installer/__tests__/installer.test.ts` from
 * Phase 239-01 — fake spawn via DI, no real subprocess.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, expect, test, vi} from 'vitest'

import {PtySession, type MinimalPty} from '../session.js'
import type {PtySpawnOptions} from '../types.js'

function makeFakePty(): MinimalPty & {
	onData: ReturnType<typeof vi.fn>
	onExit: ReturnType<typeof vi.fn>
	write: ReturnType<typeof vi.fn>
	resize: ReturnType<typeof vi.fn>
	kill: ReturnType<typeof vi.fn>
} {
	return {
		onData: vi.fn(),
		onExit: vi.fn(),
		write: vi.fn(),
		resize: vi.fn(),
		kill: vi.fn(),
	}
}

describe('PtySession.start() — root-only username guard (R4 + D-243-NO-ROOT)', () => {
	test('throws root/uid-0 rejection when opts.username === "root"', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'root', cols: 80, rows: 24},
			{ptyFactory},
		)
		expect(() => session.start()).toThrow(/root\/uid-0 username rejected/i)
		expect(ptyFactory).not.toHaveBeenCalled()
	})

	test('throws root/uid-0 rejection when opts.username === "0"', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: '0', cols: 80, rows: 24},
			{ptyFactory},
		)
		expect(() => session.start()).toThrow(/root\/uid-0 username rejected/i)
		expect(ptyFactory).not.toHaveBeenCalled()
	})

	test('does NOT throw when opts.username === "bruce"', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'bruce', cols: 80, rows: 24},
			{ptyFactory},
		)
		expect(() => session.start()).not.toThrow()
		expect(ptyFactory).toHaveBeenCalledTimes(1)
	})

	test('does NOT throw when opts.username === "alice" (any non-root desktop user)', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'alice', cols: 80, rows: 24},
			{ptyFactory},
		)
		expect(() => session.start()).not.toThrow()
		expect(ptyFactory).toHaveBeenCalledTimes(1)
	})
})

describe('PtySession.start() — sudo-less bash spawn contract (R8)', () => {
	test('spawns file="bash" with argv=["--login","-c",MOTD] — NO sudo, NO --user', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'bruce', cols: 80, rows: 24},
			{ptyFactory},
		)
		session.start()
		expect(ptyFactory).toHaveBeenCalledTimes(1)
		const [file, args] = ptyFactory.mock.calls[0]
		expect(file).toBe('bash')
		expect(args[0]).toBe('--login')
		expect(args[1]).toBe('-c')
		expect(args[2]).toBe(
			'if [ -f /etc/motd ]; then cat /etc/motd; fi; exec bash',
		)
		expect(args).not.toContain('--user')
		expect(file).not.toBe('sudo')
	})

	test('forwards cols/rows from opts to ptyFactory options', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'bruce', cols: 120, rows: 40},
			{ptyFactory},
		)
		session.start()
		const opts = ptyFactory.mock.calls[0][2]
		expect(opts.cols).toBe(120)
		expect(opts.rows).toBe(40)
		expect(opts.name).toBe('xterm-color')
	})

	test('forwards cwd from opts to ptyFactory options when provided', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'bruce', cols: 80, rows: 24, cwd: '/home/bruce/projects'},
			{ptyFactory},
		)
		session.start()
		const opts = ptyFactory.mock.calls[0][2]
		expect(opts.cwd).toBe('/home/bruce/projects')
	})
})

describe('PtySession — event forwarding & IO', () => {
	test('on("data", cb) fires cb with the chunk that ptyFactory onData received', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'bruce', cols: 80, rows: 24},
			{ptyFactory},
		)
		session.start()
		// Capture the onData handler the session registered with the pty
		const onDataCb = fake.onData.mock.calls[0][0] as (chunk: string) => void
		const received: string[] = []
		session.on('data', (chunk) => received.push(chunk))
		onDataCb('hello\n')
		onDataCb('world')
		expect(received).toEqual(['hello\n', 'world'])
	})

	test('write("ls\\n") calls ptyFactory mock pty.write with "ls\\n"', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'bruce', cols: 80, rows: 24},
			{ptyFactory},
		)
		session.start()
		session.write('ls\n')
		expect(fake.write).toHaveBeenCalledWith('ls\n')
	})

	test('resize(120, 30) calls pty.resize(120, 30)', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'bruce', cols: 80, rows: 24},
			{ptyFactory},
		)
		session.start()
		session.resize(120, 30)
		expect(fake.resize).toHaveBeenCalledWith(120, 30)
	})

	test('kill() calls pty.kill() once; second kill() does NOT call pty.kill() again (idempotency)', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'bruce', cols: 80, rows: 24},
			{ptyFactory},
		)
		session.start()
		session.kill()
		session.kill()
		expect(fake.kill).toHaveBeenCalledTimes(1)
	})

	test('on("exit", cb) fires cb with {exitCode, signal} from the ptyFactory mock', () => {
		const fake = makeFakePty()
		const ptyFactory = vi.fn().mockReturnValue(fake)
		const session = new PtySession(
			{username: 'bruce', cols: 80, rows: 24},
			{ptyFactory},
		)
		session.start()
		const onExitCb = fake.onExit.mock.calls[0][0] as (info: {
			exitCode: number
			signal: string | null
		}) => void
		let received: {exitCode: number; signal: string | null} | null = null
		session.on('exit', (info) => {
			received = info
		})
		onExitCb({exitCode: 0, signal: null})
		expect(received).toEqual({exitCode: 0, signal: null})
	})
})

// Drift-lock (R4): PtySpawnOptions.username is `string` — an arbitrary
// non-bruce desktop user typechecks. This is a compile-time check.
const _typeProof: PtySpawnOptions = {username: 'alice', cols: 80, rows: 24}
void _typeProof
