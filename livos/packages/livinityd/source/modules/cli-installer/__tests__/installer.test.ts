/**
 * Phase 239-01 Task 1 — installer.test.ts
 *
 * Unit tests for the cli-installer/installer.ts spawn wrapper.
 *
 * D-239-07 RCE boundary: every test mocks `spawnFn` via DI; no real subprocess
 * fires here. The whitelist guard MUST throw BEFORE any spawn call.
 *
 * D-239-10 stable contract: drift-lock test asserts SUPPORTED_CLIS is exactly
 * the 5-element tuple in fixed order; Phase 240 depends on this contract.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {EventEmitter} from 'node:events'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
	INSTALL_TIMEOUT_MS,
	installCli,
	type InstallCliDeps,
} from '../installer.js'
import {SUPPORTED_CLIS, SUPPORTED_CLIS_SET} from '../install-scripts.js'
import type {InstallerLogger} from '../types.js'

function makeLogger(): InstallerLogger {
	return {info: vi.fn(), warn: vi.fn(), error: vi.fn()}
}

interface FakeChild extends EventEmitter {
	stdout: EventEmitter
	stderr: EventEmitter
	kill: ReturnType<typeof vi.fn>
	killed: boolean
}

function makeFakeChild(): FakeChild {
	const child = new EventEmitter() as FakeChild
	child.stdout = new EventEmitter()
	child.stderr = new EventEmitter()
	child.killed = false
	child.kill = vi.fn((_sig?: string) => {
		child.killed = true
		return true
	})
	return child
}

afterEach(() => {
	vi.useRealTimers()
})

describe('installCli — whitelist guard (D-239-07 RCE boundary)', () => {
	test('rejects unknown CLI name BEFORE spawn fires', async () => {
		const spawnFn = vi.fn()
		const deps: InstallCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}
		await expect(installCli({name: 'foo' as any}, deps)).rejects.toThrow(
			/not in whitelist|CLI not in whitelist/i,
		)
		expect(spawnFn).not.toHaveBeenCalled()
	})

	test('rejects RCE-shaped name "claude-code; rm -rf /" BEFORE spawn fires', async () => {
		const spawnFn = vi.fn()
		const deps: InstallCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}
		await expect(
			installCli({name: 'claude-code; rm -rf /' as any}, deps),
		).rejects.toThrow(/not in whitelist/i)
		expect(spawnFn).not.toHaveBeenCalled()
	})
})

describe('installCli — spawn + capture behaviour', () => {
	test('spawns matching install script with bash argv-array form and captures stdout', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const deps: InstallCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}
		const p = installCli({name: 'claude-code'}, deps)
		// Push some stdout then exit 0
		setImmediate(() => {
			child.stdout.emit('data', Buffer.from('hello\n'))
			child.emit('exit', 0)
		})
		const result = await p
		expect(result.ok).toBe(true)
		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('hello')
		// Spawn called as argv form ['bash', [scriptPath]] — NOT bash -c userString
		expect(spawnFn).toHaveBeenCalledTimes(1)
		const [cmd, args] = spawnFn.mock.calls[0] as unknown as [string, string[]]
		expect(cmd).toBe('bash')
		expect(Array.isArray(args)).toBe(true)
		expect(args[0]).toMatch(/scripts[\\/]install[\\/]cli[\\/]claude-code\.sh$/)
	})

	test('captures stderr alongside stdout in output', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const deps: InstallCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}
		const p = installCli({name: 'opencode'}, deps)
		setImmediate(() => {
			child.stdout.emit('data', Buffer.from('out-line\n'))
			child.stderr.emit('data', Buffer.from('warn-line\n'))
			child.emit('exit', 0)
		})
		const result = await p
		expect(result.output).toContain('out-line')
		expect(result.output).toContain('warn-line')
	})

	test('returns ok:false when exit code is non-zero', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const deps: InstallCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}
		const p = installCli({name: 'gemini'}, deps)
		setImmediate(() => {
			child.stdout.emit('data', Buffer.from('fail-output\n'))
			child.emit('exit', 75)
		})
		const result = await p
		expect(result.ok).toBe(false)
		expect(result.exitCode).toBe(75)
		expect(result.output).toContain('fail-output')
	})

	test('times out after INSTALL_TIMEOUT_MS, kills child SIGKILL, returns ok:false with TIMEOUT marker', async () => {
		vi.useFakeTimers()
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const deps: InstallCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}
		const p = installCli({name: 'openclaw'}, deps)
		// Never emit exit; advance time past timeout.
		await vi.advanceTimersByTimeAsync(INSTALL_TIMEOUT_MS + 1000)
		const result = await p
		expect(result.ok).toBe(false)
		expect(result.exitCode).toBe(-1)
		expect(result.output).toMatch(/TIMEOUT/)
		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
	})
})

describe('installCli — drift-lock constants', () => {
	test('INSTALL_TIMEOUT_MS exported as 300_000', () => {
		expect(INSTALL_TIMEOUT_MS).toBe(300_000)
	})

	test('SUPPORTED_CLIS exported as exactly 5 names in fixed order (Phase 240 contract)', () => {
		expect([...SUPPORTED_CLIS]).toEqual([
			'claude-code',
			'opencode',
			'gemini',
			'openclaw',
			'aion-cli',
		])
		expect(SUPPORTED_CLIS_SET.size).toBe(5)
		for (const name of SUPPORTED_CLIS) {
			expect(SUPPORTED_CLIS_SET.has(name)).toBe(true)
		}
	})
})
