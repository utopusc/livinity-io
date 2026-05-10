/**
 * Phase 100-08-01 — fluxbox WM helper unit tests.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {EventEmitter} from 'node:events'

const spawnCalls: Array<{cmd: string; args: string[]; opts: Record<string, unknown>}> = []
let mockChild: EventEmitter & {pid?: number; kill?: ReturnType<typeof vi.fn>; unref?: () => void}

vi.mock('node:child_process', () => ({
	spawn: vi.fn((cmd: string, args: string[], opts: Record<string, unknown>) => {
		spawnCalls.push({cmd, args: [...args], opts})
		return mockChild
	}),
}))

beforeEach(() => {
	spawnCalls.length = 0
	mockChild = Object.assign(new EventEmitter(), {pid: 99002, kill: vi.fn(), unref: () => {}})
})
afterEach(() => {
	vi.useRealTimers()
	vi.resetModules()
})

describe('fluxbox-wm', () => {
	it('exports startFluxbox function', async () => {
		const mod = await import('./fluxbox-wm')
		expect(typeof mod.startFluxbox).toBe('function')
	})

	it('spawns fluxbox with -display :1 and DISPLAY=:1 env', async () => {
		const {startFluxbox} = await import('./fluxbox-wm')
		void startFluxbox({display: ':1'})
		await Promise.resolve()
		const call = spawnCalls[0]!
		const flat = call.args.join(' ')
		expect(flat).toContain('fluxbox')
		expect(flat).toContain('-display :1')
		// env propagated:
		const env = (call.opts.env as Record<string, string> | undefined) ?? {}
		expect(env.DISPLAY).toBe(':1')
	})

	it('spawns under sudo -n -u bruce by default', async () => {
		const {startFluxbox} = await import('./fluxbox-wm')
		void startFluxbox({})
		await Promise.resolve()
		expect(spawnCalls[0]?.cmd).toBe('sudo')
		const userIdx = spawnCalls[0]!.args.indexOf('-u')
		expect(spawnCalls[0]!.args[userIdx + 1]).toBe('bruce')
	})

	it('stop() sends SIGTERM then SIGKILL after 2s', async () => {
		vi.useFakeTimers()
		const {startFluxbox} = await import('./fluxbox-wm')
		const handle = await startFluxbox({})
		const stopP = handle.stop()
		expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
		await vi.advanceTimersByTimeAsync(2100)
		expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL')
		mockChild.emit('exit', 0, null)
		await stopP
	})
})
