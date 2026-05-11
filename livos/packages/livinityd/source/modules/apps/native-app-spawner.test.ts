/**
 * Phase 101-03 Task 2 — Ubuntu native-app spawner.
 *
 * RED phase: tests below specify the spawner contract before any spawner
 * code exists. GREEN phase ships `native-app-spawner.ts` implementing the
 * minimum surface that flips every case to PASS.
 *
 * Coverage (≥8):
 *   1. spawnFn invoked with cfg.binaryPath as command (positional 0)
 *   2. spawnFn args[0..] match cfg.args
 *   3. spawnFn env contains DISPLAY=:1 by default
 *   4. spawnFn env override (display: ":42") propagates
 *   5. spawnFn env merges cfg.env over process.env
 *   6. spawn opts include detached:true + stdio:['ignore','ignore','pipe']
 *   7. child.unref is called when the spawned ChildProcess exposes it
 *   8. throws NativeAppSpawnError when binaryPath is relative
 *   9. throws NativeAppSpawnError when cfg.env contains LD_PRELOAD
 *  10. throws NativeAppSpawnError when the spawned child has no pid
 *  11. returns {pid, child} when the spawn succeeds
 *  12. stderr-tail captures and logger.warn fires on non-zero exit
 *
 * FakeChild is the canonical mock (mirrors window-manager.test.ts:31-33).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {describe, it, expect, vi} from 'vitest'
import {EventEmitter} from 'node:events'
import {randomUUID} from 'node:crypto'

import {
	spawnNativeApp,
	NativeAppSpawnError,
} from './native-app-spawner.js'
import type {NativeAppConfig} from './native-app-config.js'

// ─── Test primitives ────────────────────────────────────────────────────────

class FakeChild extends EventEmitter {
	pid: number | undefined = 4242
	unref = vi.fn()
	// stderr is a duplex-like EventEmitter (the spawner only reads 'data' events
	// off it, never writes), so a bare EventEmitter is sufficient.
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

function makeValidConfig(overrides: Partial<NativeAppConfig> = {}): NativeAppConfig {
	return {
		id: randomUUID(),
		name: 'Antigravity IDE',
		binaryPath: '/usr/bin/antigravity',
		...overrides,
	}
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('spawnNativeApp', () => {
	it('invokes spawnFn with cfg.binaryPath as the command', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const cfg = makeValidConfig({binaryPath: '/opt/antigravity/bin/antigravity'})
		await spawnNativeApp({cfg, spawnFn, logger: makeLogger()})
		expect(spawnFn).toHaveBeenCalledTimes(1)
		expect(spawnFn.mock.calls[0][0]).toBe('/opt/antigravity/bin/antigravity')
	})

	it('passes cfg.args verbatim to spawnFn as the args array', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const cfg = makeValidConfig({args: ['--new-window', '--disable-gpu']})
		await spawnNativeApp({cfg, spawnFn, logger: makeLogger()})
		const args = spawnFn.mock.calls[0][1]
		expect(args).toEqual(['--new-window', '--disable-gpu'])
	})

	it('defaults to DISPLAY=:1 when no display override is passed', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		await spawnNativeApp({cfg: makeValidConfig(), spawnFn, logger: makeLogger()})
		const opts = spawnFn.mock.calls[0][2]
		expect(opts?.env?.DISPLAY).toBe(':1')
	})

	it('respects the display override when provided', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		await spawnNativeApp({cfg: makeValidConfig(), display: ':42', spawnFn, logger: makeLogger()})
		const opts = spawnFn.mock.calls[0][2]
		expect(opts?.env?.DISPLAY).toBe(':42')
	})

	it('merges cfg.env into spawn env (DISPLAY always wins last)', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const cfg = makeValidConfig({env: {MY_FLAG: 'on', NODE_ENV: 'production'}})
		await spawnNativeApp({cfg, spawnFn, logger: makeLogger()})
		const opts = spawnFn.mock.calls[0][2]
		expect(opts?.env?.MY_FLAG).toBe('on')
		expect(opts?.env?.NODE_ENV).toBe('production')
		expect(opts?.env?.DISPLAY).toBe(':1')
	})

	it("pins detached:true and stdio:['ignore','ignore','pipe'] in spawn opts", async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		await spawnNativeApp({cfg: makeValidConfig(), spawnFn, logger: makeLogger()})
		const opts = spawnFn.mock.calls[0][2]
		expect(opts?.detached).toBe(true)
		expect(opts?.stdio).toEqual(['ignore', 'ignore', 'pipe'])
	})

	it('calls child.unref() when present (so livinityd does not block on exit)', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		await spawnNativeApp({cfg: makeValidConfig(), spawnFn, logger: makeLogger()})
		expect(child.unref).toHaveBeenCalledTimes(1)
	})

	it('returns {pid, child} on success', async () => {
		const child = new FakeChild()
		child.pid = 9001
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const result = await spawnNativeApp({cfg: makeValidConfig(), spawnFn, logger: makeLogger()})
		expect(result.pid).toBe(9001)
		expect(result.child).toBe(child)
	})

	it('throws NativeAppSpawnError when binaryPath is relative (defense in depth)', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const cfg = {...makeValidConfig(), binaryPath: 'google-chrome'} as NativeAppConfig
		await expect(
			spawnNativeApp({cfg, spawnFn, logger: makeLogger()}),
		).rejects.toBeInstanceOf(NativeAppSpawnError)
		// spawnFn must never have been called — defense-in-depth means we bail
		// BEFORE handing off to child_process.
		expect(spawnFn).not.toHaveBeenCalled()
	})

	it('throws NativeAppSpawnError when env contains LD_PRELOAD (re-validates at spawn time)', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const cfg: NativeAppConfig = {
			...makeValidConfig(),
			env: {LD_PRELOAD: '/tmp/evil.so'},
		}
		await expect(
			spawnNativeApp({cfg, spawnFn, logger: makeLogger()}),
		).rejects.toBeInstanceOf(NativeAppSpawnError)
		expect(spawnFn).not.toHaveBeenCalled()
	})

	it('throws NativeAppSpawnError when the spawned child has no pid', async () => {
		const child = new FakeChild()
		child.pid = undefined
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		await expect(
			spawnNativeApp({cfg: makeValidConfig(), spawnFn, logger: makeLogger()}),
		).rejects.toBeInstanceOf(NativeAppSpawnError)
	})

	it('captures stderr-tail and warns on non-zero exit', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const logger = makeLogger()
		const result = await spawnNativeApp({cfg: makeValidConfig({name: 'Crashy'}), spawnFn, logger})
		// Simulate stderr output then a non-zero exit.
		child.stderr.emit('data', Buffer.from('Segmentation fault\n'))
		child.stderr.emit('data', Buffer.from('libfoo: fatal error\n'))
		child.emit('exit', 139, null)
		expect(result.pid).toBe(4242)
		expect(logger.warn).toHaveBeenCalledTimes(1)
		const warnMsg = logger.warn.mock.calls[0][0] as string
		expect(warnMsg).toMatch(/Crashy/)
		expect(warnMsg).toMatch(/code=139/)
		expect(warnMsg).toMatch(/Segmentation fault/)
	})

	it('does NOT warn when the child exits cleanly (code=0)', async () => {
		const child = new FakeChild()
		const spawnFn = vi.fn((..._args: any[]) => child as any)
		const logger = makeLogger()
		await spawnNativeApp({cfg: makeValidConfig(), spawnFn, logger})
		child.emit('exit', 0, null)
		expect(logger.warn).not.toHaveBeenCalled()
	})
})
