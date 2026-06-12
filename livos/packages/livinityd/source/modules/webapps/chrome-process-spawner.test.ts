/**
 * Phase 102-02 Task 1 (RED) — ChromeProcessSpawner.
 *
 * RED phase: tests below specify the spawner contract before any spawner
 * code exists. GREEN phase (Task 2) ships `chrome-process-spawner.ts` to
 * flip every case to PASS.
 *
 * Threat model: T-102-02 (Chrome arg injection). url/userDataDir/display
 * are all validated at the gate BEFORE argv interpolation. Invalid input
 * throws ChromeProcessSpawnError; spawn() is NEVER called with attacker-
 * controlled values.
 *
 * Coverage (11 tests):
 *   1. Happy path — spawnFn called with sudo + DISPLAY + bin + canonical argv
 *   2. T-102-02 URL invalid — throws CHROME_INVALID_URL, spawn NOT called
 *   3. T-102-02 URL shell-meta (semicolon) — throws CHROME_INVALID_URL
 *   4. T-102-02 userDataDir path traversal — throws CHROME_INVALID_USERDATADIR
 *   5. T-102-02 userDataDir non-UUID — throws CHROME_INVALID_USERDATADIR
 *   6. T-102-02 display shell-meta — throws CHROME_INVALID_DISPLAY
 *   7. display range — :99 accepted, :100 rejected
 *   8. Stderr tail accumulates last 50 lines, logger.error fires on exit code !=0
 *   9. handle.stop() — SIGTERM immediately, SIGKILL after 2000ms grace
 *  10. STATIC_ARGS contains canonical flags (--start-maximized + others)
 *  11. Custom chromeBinary substitutes into argv
 *
 * FakeChild mirrors `vnc-bridge.test.ts:46-53` / `native-app-spawner.test.ts:39-45`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {EventEmitter} from 'node:events'
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

import {
	spawnChromeProcess,
	ChromeProcessSpawnError,
} from './chrome-process-spawner.js'
// WS1 (2026-06-11): the `-u <user>` default now resolves to the desktop user
// (getDesktopUser()) instead of a hardcoded 'bruce'. makeValidOpts() leaves
// opts.user unset, so assert against the resolver to stay runner-agnostic.
import {getDesktopUser} from '../system/desktop-user.js'

// ─── Test primitives ────────────────────────────────────────────────────────

class FakeChild extends EventEmitter {
	pid: number | undefined = 4242
	unref = vi.fn()
	kill = vi.fn()
	stderr: EventEmitter = new EventEmitter()
}

function makeLogger() {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		verbose: vi.fn(),
	}
}

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'
const VALID_USERDATADIR = `/tmp/livos-chrome-app-${VALID_UUID}`
const VALID_URL = 'https://livinity.io'
const VALID_DISPLAY = ':10'

function makeValidOpts(overrides: Partial<Parameters<typeof spawnChromeProcess>[0]> = {}) {
	const child = new FakeChild()
	const spawnFn = vi.fn((..._args: any[]) => child as any)
	return {
		child,
		spawnFn,
		opts: {
			display: VALID_DISPLAY,
			userDataDir: VALID_USERDATADIR,
			url: VALID_URL,
			spawnFn: spawnFn as any,
			logger: makeLogger(),
			...overrides,
		},
	}
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('102-02-01 ChromeProcessSpawner', () => {
	describe('happy path — argv shape', () => {
		it('Test 1: spawn invoked with sudo + canonical args + DISPLAY env', async () => {
			const {spawnFn, opts} = makeValidOpts()
			await spawnChromeProcess(opts as any)
			expect(spawnFn).toHaveBeenCalledTimes(1)
			const [cmd, args, spawnOpts] = spawnFn.mock.calls[0] as [string, string[], any]
			expect(cmd).toBe('sudo')
			expect(args).toEqual(
				expect.arrayContaining([
					'-n',
					'-u',
					getDesktopUser(),
					`DISPLAY=${VALID_DISPLAY}`,
					'google-chrome',
					`--user-data-dir=${VALID_USERDATADIR}`,
					'--start-maximized',
					// Phase 102 deploy UAT round 4: switched from --app=URL
					// (chromeless) to URL positional (normal Chrome with
					// tabs + address bar visible). Test asserts URL is the
					// LAST arg, not embedded in --app=.
					VALID_URL,
				]),
			)
			expect(args[args.length - 1]).toBe(VALID_URL)
			expect(spawnOpts).toEqual(
				expect.objectContaining({
					detached: true,
					stdio: ['ignore', 'ignore', 'pipe'],
				}),
			)
			expect(spawnOpts.env.DISPLAY).toBe(VALID_DISPLAY)
		})
	})

	describe('T-102-02 — URL validation', () => {
		it('Test 2: invalid url throws CHROME_INVALID_URL, spawn NOT called', async () => {
			const {spawnFn, opts} = makeValidOpts({url: 'not-a-url' as any})
			await expect(spawnChromeProcess(opts as any)).rejects.toMatchObject({
				name: 'ChromeProcessSpawnError',
				code: 'CHROME_INVALID_URL',
			})
			expect(spawnFn).not.toHaveBeenCalled()
		})

		it('Test 3: url with non-http/https/file protocol rejected (e.g. javascript:)', async () => {
			const {spawnFn, opts} = makeValidOpts({url: 'javascript:alert(1)' as any})
			await expect(spawnChromeProcess(opts as any)).rejects.toBeInstanceOf(
				ChromeProcessSpawnError,
			)
			expect(spawnFn).not.toHaveBeenCalled()
		})
	})

	describe('T-102-02 — userDataDir regex', () => {
		it('Test 4: path traversal `/tmp/../etc/passwd` throws CHROME_INVALID_USERDATADIR', async () => {
			const {spawnFn, opts} = makeValidOpts({userDataDir: '/tmp/../etc/passwd' as any})
			await expect(spawnChromeProcess(opts as any)).rejects.toMatchObject({
				name: 'ChromeProcessSpawnError',
				code: 'CHROME_INVALID_USERDATADIR',
			})
			expect(spawnFn).not.toHaveBeenCalled()
		})

		it('Test 5: non-UUID suffix `/tmp/livos-chrome-app-NOTAUUID` rejected', async () => {
			const {spawnFn, opts} = makeValidOpts({
				userDataDir: '/tmp/livos-chrome-app-NOTAUUID' as any,
			})
			await expect(spawnChromeProcess(opts as any)).rejects.toMatchObject({
				code: 'CHROME_INVALID_USERDATADIR',
			})
			expect(spawnFn).not.toHaveBeenCalled()
		})
	})

	describe('T-102-02 — display regex', () => {
		it('Test 6: display with shell-meta `:0; evil` throws CHROME_INVALID_DISPLAY', async () => {
			const {spawnFn, opts} = makeValidOpts({display: ':0; evil' as any})
			await expect(spawnChromeProcess(opts as any)).rejects.toMatchObject({
				name: 'ChromeProcessSpawnError',
				code: 'CHROME_INVALID_DISPLAY',
			})
			expect(spawnFn).not.toHaveBeenCalled()
		})

		it('Test 7: display range — :99 accepted, :100 rejected', async () => {
			// :99 — accepted
			const ok = makeValidOpts({display: ':99' as any})
			await spawnChromeProcess(ok.opts as any)
			expect(ok.spawnFn).toHaveBeenCalledTimes(1)

			// :100 — rejected
			const bad = makeValidOpts({display: ':100' as any})
			await expect(spawnChromeProcess(bad.opts as any)).rejects.toMatchObject({
				code: 'CHROME_INVALID_DISPLAY',
			})
			expect(bad.spawnFn).not.toHaveBeenCalled()
		})
	})

	describe('stderr tail + exit dump', () => {
		it('Test 8: stderr accumulates lines; logger.error called with tail on exit !=0', async () => {
			const {child, opts} = makeValidOpts()
			await spawnChromeProcess(opts as any)
			child.stderr.emit('data', Buffer.from('chrome: GPU failure\n'))
			child.stderr.emit('data', Buffer.from('chrome: shutdown\n'))
			child.emit('exit', 1, null)
			const errorMock = (opts.logger as ReturnType<typeof makeLogger>).error
			expect(errorMock).toHaveBeenCalled()
			const errMsg = String(errorMock.mock.calls[0][0])
			expect(errMsg).toMatch(/code=1/)
			expect(errMsg).toMatch(/GPU failure/)
		})
	})

	describe('handle.stop() — SIGTERM → grace → SIGKILL', () => {
		beforeEach(() => {
			vi.useFakeTimers()
		})
		afterEach(() => {
			vi.useRealTimers()
		})

		it('Test 9: stop() sends SIGTERM immediately and SIGKILL after 2000ms', async () => {
			const {child, opts} = makeValidOpts()
			const handle = await spawnChromeProcess(opts as any)
			const stopPromise = handle.stop()
			expect(child.kill).toHaveBeenCalledWith('SIGTERM')
			// Advance past grace — SIGKILL should fire.
			await vi.advanceTimersByTimeAsync(2000)
			expect(child.kill).toHaveBeenCalledWith('SIGKILL')
			// Now emit exit to resolve stop()
			child.emit('exit', null, 'SIGKILL')
			await stopPromise
		})
	})

	describe('STATIC_ARGS canonical flags', () => {
		it('Test 10: argv contains --start-maximized + --no-first-run + --no-default-browser-check + disable-features', async () => {
			const {spawnFn, opts} = makeValidOpts()
			await spawnChromeProcess(opts as any)
			const args = spawnFn.mock.calls[0][1] as string[]
			expect(args).toContain('--start-maximized')
			expect(args).toContain('--no-first-run')
			expect(args).toContain('--no-default-browser-check')
			expect(args).toContain('--disable-features=ChromeWhatsNewUI,TranslateUI,InfoBars')
		})
	})

	describe('chromeBinary override', () => {
		it('Test 11: custom chromeBinary substitutes into argv', async () => {
			const {spawnFn, opts} = makeValidOpts({chromeBinary: '/usr/bin/chromium' as any})
			await spawnChromeProcess(opts as any)
			const args = spawnFn.mock.calls[0][1] as string[]
			expect(args).toContain('/usr/bin/chromium')
			expect(args).not.toContain('google-chrome')
		})
	})

	// Phase 103-01 Task 1 — widen USER_DATA_DIR_RE to accept the master profile
	// constant. T-103-01-02: master path is hardcoded in master-login-routes.ts
	// (MASTER_PROFILE_DIR), not caller-controlled. Both alternatives are fully
	// anchored (^...$) so path traversal and trailing-suffix injection remain
	// rejected for both branches.
	describe('103-01 — userDataDir master path acceptance', () => {
		it('accepts the master profile path /opt/livos/data/chrome-master', async () => {
			const {spawnFn, opts} = makeValidOpts({
				userDataDir: '/opt/livos/data/chrome-master' as any,
				display: ':42' as any,
				url: 'https://accounts.google.com' as any,
			})
			await spawnChromeProcess(opts as any)
			expect(spawnFn).toHaveBeenCalledTimes(1)
			const args = spawnFn.mock.calls[0][1] as string[]
			expect(args).toContain('--user-data-dir=/opt/livos/data/chrome-master')
		})

		it('accepts the legacy per-app uuid path', async () => {
			const {spawnFn, opts} = makeValidOpts({
				userDataDir: '/tmp/livos-chrome-app-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' as any,
			})
			await spawnChromeProcess(opts as any)
			expect(spawnFn).toHaveBeenCalledTimes(1)
		})

		it('rejects /etc/passwd as userDataDir', async () => {
			const {spawnFn, opts} = makeValidOpts({userDataDir: '/etc/passwd' as any})
			await expect(spawnChromeProcess(opts as any)).rejects.toMatchObject({
				name: 'ChromeProcessSpawnError',
				code: 'CHROME_INVALID_USERDATADIR',
			})
			expect(spawnFn).not.toHaveBeenCalled()
		})

		it('rejects /opt/livos/data/chrome-master/foo trailing path', async () => {
			const {spawnFn, opts} = makeValidOpts({
				userDataDir: '/opt/livos/data/chrome-master/foo' as any,
			})
			await expect(spawnChromeProcess(opts as any)).rejects.toMatchObject({
				name: 'ChromeProcessSpawnError',
				code: 'CHROME_INVALID_USERDATADIR',
			})
			expect(spawnFn).not.toHaveBeenCalled()
		})
	})
})
