/**
 * Phase 102-01 — XvfbSpawner unit tests (RED+GREEN).
 *
 * Coverage:
 *   1. spawnXvfb argv shape — sudo -n -u bruce Xvfb :N -screen 0 WxHx24 -nolisten tcp -ac (detached)
 *   2. xdpyinfo readiness poll — rejects N times then resolves → spawnXvfb returns handle
 *   3. xdpyinfo never-ready → XvfbReadyTimeoutError(display, code='XVFB_READY_TIMEOUT')
 *   4. On readiness timeout, child receives kill('SIGKILL')
 *   5. handle.stop() sends SIGTERM, then SIGKILL after 2000ms grace
 *   6. Custom width/height composes resolution string '1920x1080x24'
 *   7. Custom user substitutes into 'sudo -n -u root ...'
 *
 * FakeChild + injected spawnFn + injected execFileFn (xdpyinfo).
 *
 * Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f (D-102-SACRED) — never touched.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {EventEmitter} from 'node:events'
import {describe, it, expect, vi} from 'vitest'

import {spawnXvfb, XvfbReadyTimeoutError} from './xvfb-spawner.js'
// WS1 (2026-06-11): the `-u <user>` default is getDesktopUser() (the process's
// own login) not a hardcoded 'bruce'. Assert against the resolver — runner-agnostic.
import {getDesktopUser} from '../system/desktop-user.js'

// ─── Test primitives ────────────────────────────────────────────────────────

class FakeChild extends EventEmitter {
	pid: number | undefined = 7777
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('102-01-02 XvfbSpawner', () => {
	it('Test 1: spawnXvfb argv — sudo -n -u bruce Xvfb :N -screen 0 1280x720x24 -nolisten tcp -ac (detached)', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const execFileFn = vi.fn(async (..._args: any[]) => ({stdout: '', stderr: ''} as any))
		await spawnXvfb({
			display: ':10',
			spawnFn,
			execFileFn,
			pollIntervalMs: 1,
			logger: makeLogger(),
		})
		expect(spawnFn).toHaveBeenCalledTimes(1)
		const [cmd, args, opts] = spawnFn.mock.calls[0] as [string, string[], any]
		expect(cmd).toBe('sudo')
		expect(args).toEqual([
			'-n',
			'-u',
			getDesktopUser(),
			'Xvfb',
			':10',
			'-screen',
			'0',
			'1280x720x24',
			'-nolisten',
			'tcp',
			'-ac',
		])
		expect(opts).toEqual(expect.objectContaining({detached: true}))
	})

	it('Test 2: xdpyinfo rejects 3 times then resolves → spawnXvfb returns a handle', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		let calls = 0
		const execFileFn = vi.fn(async (..._args: any[]) => {
			calls += 1
			if (calls <= 3) {
				const err = new Error('xdpyinfo: unable to open display :10') as Error & {code: number}
				err.code = 1
				throw err
			}
			return {stdout: 'name of display:  :10\n', stderr: ''} as any
		})
		const handle = await spawnXvfb({
			display: ':10',
			spawnFn,
			execFileFn,
			pollIntervalMs: 1, // fast poll for test
			readyTimeoutMs: 1000,
			logger: makeLogger(),
		})
		expect(handle.pid).toBe(7777)
		expect(handle.display).toBe(':10')
		// 3 rejections + 1 success = 4 calls
		expect(execFileFn).toHaveBeenCalledTimes(4)
	})

	it('Test 3: xdpyinfo never resolves before deadline → throws XvfbReadyTimeoutError with display + code', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const execFileFn = vi.fn(async (..._args: any[]) => {
			const err = new Error('xdpyinfo: unable to open display :11') as Error & {code: number}
			err.code = 1
			throw err
		})
		await expect(
			spawnXvfb({
				display: ':11',
				spawnFn,
				execFileFn,
				pollIntervalMs: 1,
				readyTimeoutMs: 50,
				logger: makeLogger(),
			}),
		).rejects.toMatchObject({
			name: 'XvfbReadyTimeoutError',
			code: 'XVFB_READY_TIMEOUT',
			display: ':11',
		})
	})

	it('Test 4: on readiness timeout, child receives kill(SIGKILL)', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const execFileFn = vi.fn(async (..._args: any[]) => {
			throw new Error('xdpyinfo: unable to open display')
		})
		await expect(
			spawnXvfb({
				display: ':12',
				spawnFn,
				execFileFn,
				pollIntervalMs: 1,
				readyTimeoutMs: 30,
				logger: makeLogger(),
			}),
		).rejects.toBeInstanceOf(XvfbReadyTimeoutError)
		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
	})

	it('Test 5: handle.stop() sends SIGTERM then SIGKILL after 2000ms grace', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const execFileFn = vi.fn(async (..._args: any[]) => ({stdout: '', stderr: ''} as any))
		const handle = await spawnXvfb({
			display: ':13',
			spawnFn,
			execFileFn,
			pollIntervalMs: 1,
			graceMs: 30, // short grace for fast test
			logger: makeLogger(),
		})
		const stopPromise = handle.stop()
		// SIGTERM should fire immediately
		expect(child.kill).toHaveBeenCalledWith('SIGTERM')
		// Simulate child not exiting within grace; SIGKILL must follow
		// Wait beyond the grace window
		await new Promise((r) => setTimeout(r, 50))
		// Now emit exit to resolve the `exited` promise inside stop()
		child.emit('exit', null, 'SIGKILL')
		await stopPromise
		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
	})

	it('Test 6: custom width/height composes resolution string 1920x1080x24', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const execFileFn = vi.fn(async (..._args: any[]) => ({stdout: '', stderr: ''} as any))
		await spawnXvfb({
			display: ':14',
			width: 1920,
			height: 1080,
			spawnFn,
			execFileFn,
			pollIntervalMs: 1,
			logger: makeLogger(),
		})
		const [, args] = spawnFn.mock.calls[0] as [string, string[], any]
		expect(args).toContain('1920x1080x24')
	})

	it('Test 7: custom user substitutes into "sudo -n -u root ..." argv', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const execFileFn = vi.fn(async (..._args: any[]) => ({stdout: '', stderr: ''} as any))
		await spawnXvfb({
			display: ':15',
			user: 'root',
			spawnFn,
			execFileFn,
			pollIntervalMs: 1,
			logger: makeLogger(),
		})
		const [, args] = spawnFn.mock.calls[0] as [string, string[], any]
		// 'sudo' '-n' '-u' 'root' 'Xvfb' ':15' ...
		expect(args[0]).toBe('-n')
		expect(args[1]).toBe('-u')
		expect(args[2]).toBe('root')
		expect(args[3]).toBe('Xvfb')
	})
})
