/**
 * Phase 239-01 Task 1 — detector.test.ts
 *
 * Unit tests for cli-installer/detector.ts. DI'd spawn mock — no real probe.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {EventEmitter} from 'node:events'
import {describe, expect, test, vi} from 'vitest'

import {detectCli, type DetectCliDeps} from '../detector.js'
import {CLI_BIN_NAMES} from '../install-scripts.js'
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
	child.kill = vi.fn(() => {
		child.killed = true
		return true
	})
	return child
}

describe('detectCli', () => {
	test('rejects unknown CLI name (whitelist guard)', async () => {
		const spawnFn = vi.fn()
		const deps: DetectCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}
		await expect(detectCli({name: 'foo' as any}, deps)).rejects.toThrow(
			/not in whitelist|CLI not in whitelist/i,
		)
		expect(spawnFn).not.toHaveBeenCalled()
	})

	test('returns detected:true with path + version on command -v exit 0 then --version exit 0', async () => {
		const child1 = makeFakeChild() // command -v claude
		const child2 = makeFakeChild() // claude --version
		const spawnFn = vi.fn()
		spawnFn.mockReturnValueOnce(child1 as any).mockReturnValueOnce(child2 as any)
		const deps: DetectCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}

		const p = detectCli({name: 'claude-code'}, deps)
		setImmediate(() => {
			child1.stdout.emit('data', Buffer.from('/usr/local/bin/claude\n'))
			child1.emit('exit', 0)
		})
		// Wait one microtask tick for the orchestrator to consume the first probe
		// then satisfy the version probe.
		setTimeout(() => {
			child2.stdout.emit('data', Buffer.from('claude 1.2.3\n'))
			child2.emit('exit', 0)
		}, 10)

		const result = await p
		expect(result.detected).toBe(true)
		expect(result.path).toBe('/usr/local/bin/claude')
		expect(result.version).toMatch(/claude 1\.2\.3/)
	})

	test('returns detected:false when command -v exits non-zero (CLI absent)', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const deps: DetectCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}
		const p = detectCli({name: 'gemini'}, deps)
		setImmediate(() => child.emit('exit', 1))
		const result = await p
		expect(result.detected).toBe(false)
	})

	test('uses CLI_BIN_NAMES[name] for the probe command', async () => {
		// Drift-lock: ensure the detector consults the bin-name map (not the
		// CLI key) so e.g. claude-code → claude, aion-cli → aion.
		expect(CLI_BIN_NAMES['claude-code']).toBe('claude')
		expect(CLI_BIN_NAMES['aion-cli']).toBe('aion')
		expect(CLI_BIN_NAMES['openclaw']).toBe('openclaw')
		expect(CLI_BIN_NAMES['opencode']).toBe('opencode')
		expect(CLI_BIN_NAMES['gemini']).toBe('gemini')

		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const deps: DetectCliDeps = {logger: makeLogger(), spawnFn: spawnFn as any}
		const p = detectCli({name: 'aion-cli'}, deps)
		setImmediate(() => child.emit('exit', 1))
		await p
		// First (and only, since we exit 1) spawn call must reference the
		// mapped bin name 'aion' — NOT the CLI key 'aion-cli'.
		const [, args] = spawnFn.mock.calls[0] as unknown as [string, string[]]
		const cmdString = args.join(' ')
		expect(cmdString).toMatch(/command -v aion(\s|$)/)
		expect(cmdString).not.toMatch(/command -v aion-cli/)
	})
})
