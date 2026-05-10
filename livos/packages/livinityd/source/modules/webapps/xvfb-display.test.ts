/**
 * Phase 100-08-01 — Xvfb :1 helper unit tests.
 */
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {EventEmitter} from 'node:events'

// We mock node:child_process at module scope. Each test resets the captured
// calls via beforeEach.
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
	mockChild = Object.assign(new EventEmitter(), {
		pid: 99001,
		kill: vi.fn(),
		unref: () => {},
	})
})
afterEach(() => {
	vi.useRealTimers()
	vi.resetModules()
})

describe('xvfb-display', () => {
	it('exports startXvfb function', async () => {
		const mod = await import('./xvfb-display')
		expect(typeof mod.startXvfb).toBe('function')
	})

	it('spawns Xvfb with display :1, resolution 1920x1080x24, -nolisten tcp, -ac', async () => {
		const {startXvfb} = await import('./xvfb-display')
		const handle = startXvfb({display: ':1', resolution: '1920x1080x24'})
		// Allow the spawn to register synchronously
		await Promise.resolve()
		expect(spawnCalls.length).toBeGreaterThan(0)
		const call = spawnCalls[0]!
		// Argv MUST contain Xvfb, :1, -screen 0 1920x1080x24, -nolisten tcp, -ac:
		const flat = call.args.join(' ')
		expect(flat).toContain('Xvfb')
		expect(flat).toContain(':1')
		expect(flat).toContain('-screen 0 1920x1080x24')
		expect(flat).toContain('-nolisten tcp')
		expect(flat).toContain('-ac')
		await handle  // resolve the promise to consume it
	})

	it('spawns under sudo -n -u bruce by default', async () => {
		const {startXvfb} = await import('./xvfb-display')
		void startXvfb({})
		await Promise.resolve()
		expect(spawnCalls[0]?.cmd).toBe('sudo')
		expect(spawnCalls[0]?.args).toContain('-n')
		expect(spawnCalls[0]?.args).toContain('-u')
		const userIdx = spawnCalls[0]!.args.indexOf('-u')
		expect(spawnCalls[0]!.args[userIdx + 1]).toBe('bruce')
	})

	it('stop() sends SIGTERM then SIGKILL after 2s', async () => {
		vi.useFakeTimers()
		const {startXvfb} = await import('./xvfb-display')
		const handle = await startXvfb({})
		// First call: SIGTERM
		const stopP = handle.stop()
		expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
		// Advance 2s — second call: SIGKILL
		await vi.advanceTimersByTimeAsync(2100)
		expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL')
		// Simulate exit so the awaiter resolves
		mockChild.emit('exit', 0, null)
		await stopP
	})
})
