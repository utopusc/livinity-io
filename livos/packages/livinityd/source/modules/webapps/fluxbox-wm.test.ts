/**
 * Phase 100-08-01 — fluxbox WM helper unit tests.
 *
 * Phase 100-09-07 — added T-09-07-F1..F3 covering stderr capture + early-exit
 * health check + healthy-run regression. Root cause: original spawn used
 * `stdio: 'ignore'` which silently swallowed fluxbox's stderr — when sudo
 * NOPASSWD was missing on Mini PC, fluxbox died on startup with no log,
 * leaving the WM absent on :1 and downstream wmctrl calls failing with
 * `Cannot get client list properties (_NET_CLIENT_LIST or _WIN_CLIENT_LIST)`.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {EventEmitter} from 'node:events'

const spawnCalls: Array<{cmd: string; args: string[]; opts: Record<string, unknown>}> = []
let mockChild: EventEmitter & {
	pid?: number
	kill?: ReturnType<typeof vi.fn>
	unref?: () => void
	stderr?: EventEmitter
	stdout?: EventEmitter
}

vi.mock('node:child_process', () => ({
	spawn: vi.fn((cmd: string, args: string[], opts: Record<string, unknown>) => {
		spawnCalls.push({cmd, args: [...args], opts})
		return mockChild
	}),
}))

function makeMockChild(pid = 99002): typeof mockChild {
	const stderr = new EventEmitter()
	const stdout = new EventEmitter()
	return Object.assign(new EventEmitter(), {
		pid,
		kill: vi.fn(),
		unref: () => {},
		stderr,
		stdout,
	})
}

beforeEach(() => {
	spawnCalls.length = 0
	mockChild = makeMockChild()
})
afterEach(() => {
	vi.useRealTimers()
	vi.resetModules()
})

describe('fluxbox-wm', () => {
	it('exports startFluxbox function', async () => {
		const mod = await import('./fluxbox-wm.js')
		expect(typeof mod.startFluxbox).toBe('function')
	})

	it('spawns fluxbox with -display :1 and DISPLAY=:1 env', async () => {
		vi.useFakeTimers()
		const {startFluxbox} = await import('./fluxbox-wm.js')
		const p = startFluxbox({display: ':1'})
		await vi.advanceTimersByTimeAsync(600)
		await p
		const call = spawnCalls[0]!
		const flat = call.args.join(' ')
		expect(flat).toContain('fluxbox')
		expect(flat).toContain('-display :1')
		// env propagated:
		const env = (call.opts.env as Record<string, string> | undefined) ?? {}
		expect(env.DISPLAY).toBe(':1')
	})

	it('spawns under sudo -n -u <desktop-user> by default', async () => {
		vi.useFakeTimers()
		// WS1 (2026-06-11): the default user is getDesktopUser() (the process's own
		// login) not a hardcoded 'bruce'. Assert against the resolver so the test
		// is runner-agnostic (Mini PC=bruce, jack box=jack, CI/dev=runner login).
		const {getDesktopUser} = await import('../system/desktop-user.js')
		const {startFluxbox} = await import('./fluxbox-wm.js')
		const p = startFluxbox({})
		await vi.advanceTimersByTimeAsync(600)
		await p
		expect(spawnCalls[0]?.cmd).toBe('sudo')
		const userIdx = spawnCalls[0]!.args.indexOf('-u')
		expect(spawnCalls[0]!.args[userIdx + 1]).toBe(getDesktopUser())
	})

	it('stop() sends SIGTERM then SIGKILL after 2s', async () => {
		vi.useFakeTimers()
		const {startFluxbox} = await import('./fluxbox-wm.js')
		const startP = startFluxbox({})
		await vi.advanceTimersByTimeAsync(600) // clear early-exit race
		const handle = await startP
		const stopP = handle.stop()
		expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
		await vi.advanceTimersByTimeAsync(2100)
		expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL')
		mockChild.emit('exit', 0, null)
		await stopP
	})

	// ---- Phase 100-09-07 — stderr capture + health check ----

	it('T-09-07-F1: captures fluxbox stderr and forwards to logger.warn', async () => {
		vi.useFakeTimers()
		const warn = vi.fn()
		const info = vi.fn()
		const error = vi.fn()
		const logger = {info, warn, error}
		const {startFluxbox} = await import('./fluxbox-wm.js')
		const startP = startFluxbox({logger})
		// Emit stderr chunk BEFORE the early-exit race resolves.
		await Promise.resolve()
		mockChild.stderr?.emit(
			'data',
			Buffer.from('fluxbox: cannot connect to X server :1\n', 'utf8'),
		)
		await vi.advanceTimersByTimeAsync(600) // race resolves with no exit
		await startP
		// Assert: warn was called with stderr text in the message.
		const warnMessages = warn.mock.calls.map((c) => String(c[0]))
		expect(warnMessages.some((m) => m.includes('fluxbox stderr') && m.includes('cannot connect to X server'))).toBe(true)
	})

	it('T-09-07-F2: throws + logs error when fluxbox exits within 500ms', async () => {
		vi.useFakeTimers()
		const warn = vi.fn()
		const info = vi.fn()
		const error = vi.fn()
		const logger = {info, warn, error}
		const {startFluxbox} = await import('./fluxbox-wm.js')
		const startP = startFluxbox({logger})
		// Attach catch handler synchronously so the rejection is observed even
		// while we step through fake-timer assertions below.
		const rejection = startP.catch((e: unknown) => e)
		// Emit stderr then immediate exit to simulate sudo NOPASSWD missing.
		await Promise.resolve()
		mockChild.stderr?.emit(
			'data',
			Buffer.from('sudo: a password is required\n', 'utf8'),
		)
		mockChild.emit('exit', 1, null)
		await vi.advanceTimersByTimeAsync(50)
		const err = (await rejection) as Error
		expect(err).toBeInstanceOf(Error)
		expect(err.message).toMatch(/fluxbox failed to start/)
		// Thrown message must carry the captured stderr context.
		expect(err.message).toMatch(/password is required/)
		const errorMessages = error.mock.calls.map((c) => String(c[0]))
		expect(
			errorMessages.some(
				(m) =>
					m.includes('fluxbox FAILED to start') || m.includes('fluxbox failed to start'),
			),
		).toBe(true)
		expect(errorMessages.some((m) => m.includes('password is required') || m.includes('sudo'))).toBe(true)
	})

	it('T-09-07-F3: regression — healthy fluxbox (no exit, no stderr) resolves with handle', async () => {
		vi.useFakeTimers()
		const warn = vi.fn()
		const info = vi.fn()
		const error = vi.fn()
		const logger = {info, warn, error}
		const {startFluxbox} = await import('./fluxbox-wm.js')
		const startP = startFluxbox({logger})
		await vi.advanceTimersByTimeAsync(600) // race resolves with no exit
		const handle = await startP
		expect(handle.pid).toBe(99002)
		expect(handle.display).toBe(':1')
		expect(typeof handle.stop).toBe('function')
		expect(error).not.toHaveBeenCalled()
	})
})
