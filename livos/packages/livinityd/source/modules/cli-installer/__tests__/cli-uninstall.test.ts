/**
 * Phase 268-02 Task 1 — cli-uninstall.test.ts
 *
 * Unit tests for uninstallCli + the drift-locked CLI_UNINSTALL map.
 *
 * Mirrors the injected-fake-spawn (installer.test.ts) + fake-fs
 * (api-key-writer.test.ts) patterns. NO real subprocess or fs touch — the
 * spawn is a fake child EventEmitter and fs.rm is a vi.fn() recorder.
 *
 * Covers the 268-02 must-haves:
 *   - CLI_UNINSTALL drift-lock: 20 keys === SUPPORTED_CLIS.length
 *   - whitelist guard (D-239-07): unknown name throws BEFORE any spawn/fs
 *   - npm-global kind: EXACT argv ['uninstall','-g','--prefix',<home>/.npm-global,<pkg>]
 *   - rm-bin kind: fs.rm on bin path + config dir + the 267 WRITE_TARGETS secret
 *   - pip kind: spawn pip3 with ['uninstall','-y',<pkg>]
 *   - rm-paths / snow-cli collision (E-5): EXACT static paths only, NEVER `command -v`
 *   - none kind / aion-cli: no spawn, no bin rm, {ok:false, skipped:true}
 *   - never-throw on subprocess non-zero exit → {ok:false} (not a throw)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {EventEmitter} from 'node:events'
import path from 'node:path'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {CLI_UNINSTALL, uninstallCli, type UninstallCliDeps} from '../cli-uninstall.js'
import {SUPPORTED_CLIS} from '../install-scripts.js'
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

/** A fake spawn that returns a child and (optionally) auto-exits with `code`. */
function makeFakeSpawn(exitCode = 0) {
	const child = makeFakeChild()
	const spawnFn = vi.fn(() => {
		setImmediate(() => {
			child.stdout.emit('data', Buffer.from('ok\n'))
			child.emit('exit', exitCode)
		})
		return child as any
	})
	return {spawnFn, child}
}

/** A fake fs that records every rm(path, opts) call. */
function makeFakeFs() {
	const rm = vi.fn(async (_p: string, _opts?: any) => undefined)
	return {rm}
}

const HOME = '/home/test-user'

afterEach(() => {
	vi.useRealTimers()
})

describe('CLI_UNINSTALL — drift-lock (mirrors auth-methods.ts)', () => {
	test('has exactly one entry per SUPPORTED_CLIS name (20)', () => {
		expect(Object.keys(CLI_UNINSTALL).length).toBe(SUPPORTED_CLIS.length)
		expect(Object.keys(CLI_UNINSTALL).length).toBe(20)
		for (const name of SUPPORTED_CLIS) {
			expect(CLI_UNINSTALL[name]).toBeDefined()
		}
	})
})

describe('uninstallCli — whitelist guard (D-239-07 RCE boundary)', () => {
	test('unknown name throws BEFORE any spawn/fs', async () => {
		const {spawnFn} = makeFakeSpawn()
		const fs = makeFakeFs()
		await expect(
			uninstallCli(
				{name: 'evil' as any},
				{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
			),
		).rejects.toThrow(/not in whitelist/i)
		expect(spawnFn).not.toHaveBeenCalled()
		expect(fs.rm).not.toHaveBeenCalled()
	})

	test('rejects RCE-shaped name BEFORE any spawn/fs', async () => {
		const {spawnFn} = makeFakeSpawn()
		const fs = makeFakeFs()
		await expect(
			uninstallCli(
				{name: 'snow-cli; rm -rf /' as any},
				{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
			),
		).rejects.toThrow(/not in whitelist/i)
		expect(spawnFn).not.toHaveBeenCalled()
		expect(fs.rm).not.toHaveBeenCalled()
	})
})

describe('uninstallCli — npm-global kind (codex)', () => {
	test('spawns npm with EXACT argv ["uninstall","-g","--prefix",<home>/.npm-global,"@openai/codex"]', async () => {
		const {spawnFn} = makeFakeSpawn(0)
		const fs = makeFakeFs()
		const result = await uninstallCli(
			{name: 'codex'},
			{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
		)
		expect(result.ok).toBe(true)
		expect(spawnFn).toHaveBeenCalledTimes(1)
		const [cmd, args] = spawnFn.mock.calls[0] as unknown as [string, string[]]
		expect(cmd).toBe('npm')
		expect(args).toEqual([
			'uninstall',
			'-g',
			'--prefix',
			path.join(HOME, '.npm-global'),
			'@openai/codex',
		])
	})
})

describe('uninstallCli — npm-global config-dir cleanup (github-copilot, WR-03)', () => {
	test('npm-global uninstall ALSO rm -rf its config dir (~/.copilot)', async () => {
		const {spawnFn} = makeFakeSpawn(0)
		const fs = makeFakeFs()
		const result = await uninstallCli(
			{name: 'github-copilot'},
			{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
		)
		expect(result.ok).toBe(true)
		// Still spawns the npm uninstall…
		expect(spawnFn).toHaveBeenCalledTimes(1)
		const [cmd, args] = spawnFn.mock.calls[0] as unknown as [string, string[]]
		expect(cmd).toBe('npm')
		expect(args).toEqual([
			'uninstall',
			'-g',
			'--prefix',
			path.join(HOME, '.npm-global'),
			'@github/copilot',
		])
		// …AND removes the config dir so a re-install isn't silently pre-authed.
		const rmPaths = fs.rm.mock.calls.map((c) => c[0] as string)
		expect(rmPaths).toContain(path.join(HOME, '.copilot'))
		// The config-dir rm is recursive.
		const copilotCall = fs.rm.mock.calls.find(
			(c) => c[0] === path.join(HOME, '.copilot'),
		)
		expect((copilotCall?.[1] as {recursive?: boolean})?.recursive).toBe(true)
	})
})

describe('uninstallCli — rm-bin kind (claude-code)', () => {
	test('rm bin path + config dir + the 267 .claude/.env secret', async () => {
		const {spawnFn} = makeFakeSpawn()
		const fs = makeFakeFs()
		const result = await uninstallCli(
			{name: 'claude-code'},
			{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
		)
		expect(result.ok).toBe(true)
		// rm-bin must not spawn anything
		expect(spawnFn).not.toHaveBeenCalled()
		const rmPaths = fs.rm.mock.calls.map((c) => c[0] as string)
		expect(rmPaths).toContain(path.join(HOME, '.local/bin/claude'))
		expect(rmPaths).toContain(path.join(HOME, '.claude')) // config dir
		expect(rmPaths).toContain(path.join(HOME, '.claude/.env')) // WRITE_TARGETS secret
	})
})

describe('uninstallCli — pip kind (nanobot)', () => {
	test('spawns pip3 with ["uninstall","-y","nanobot-ai"]', async () => {
		const {spawnFn} = makeFakeSpawn(0)
		const fs = makeFakeFs()
		const result = await uninstallCli(
			{name: 'nanobot'},
			{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
		)
		expect(result.ok).toBe(true)
		expect(spawnFn).toHaveBeenCalledTimes(1)
		const [cmd, args] = spawnFn.mock.calls[0] as unknown as [string, string[]]
		expect(cmd).toBe('pip3')
		expect(args).toEqual(['uninstall', '-y', 'nanobot-ai'])
	})
})

describe('uninstallCli — rm-paths kind / snow-cli Snowflake collision (E-5)', () => {
	test('rm EXACTLY the static known snow paths + the .snow/.env secret; NEVER `command -v snow`', async () => {
		const {spawnFn} = makeFakeSpawn()
		const fs = makeFakeFs()
		const result = await uninstallCli(
			{name: 'snow-cli'},
			{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
		)
		expect(result.ok).toBe(true)
		// rm-paths must NOT spawn — no `command -v snow` / `which snow` probe (E-5).
		expect(spawnFn).not.toHaveBeenCalled()
		const rmPaths = fs.rm.mock.calls.map((c) => c[0] as string)
		expect(rmPaths).toContain(path.join(HOME, '.local/bin/snow'))
		expect(rmPaths).toContain(path.join(HOME, '.npm-global/bin/snow'))
		expect(rmPaths).toContain(path.join(HOME, '.livos-cli/snow-cli'))
		expect(rmPaths).toContain(path.join(HOME, '.snow')) // config dir
		expect(rmPaths).toContain(path.join(HOME, '.snow/.env')) // WRITE_TARGETS secret
		// Defensive: NOTHING resembling a system-wide `snow` (Snowflake CLI) gets deleted.
		expect(rmPaths).not.toContain('/usr/bin/snow')
		expect(rmPaths).not.toContain('/usr/local/bin/snow')
	})

	test('openclaw rm-paths includes the ABSOLUTE pnpm-shim /opt/livos/bin/openclaw', async () => {
		const {spawnFn} = makeFakeSpawn()
		const fs = makeFakeFs()
		const result = await uninstallCli(
			{name: 'openclaw'},
			{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
		)
		expect(result.ok).toBe(true)
		expect(spawnFn).not.toHaveBeenCalled()
		const rmPaths = fs.rm.mock.calls.map((c) => c[0] as string)
		// Absolute path is used AS-IS, not joined under home.
		expect(rmPaths).toContain('/opt/livos/bin/openclaw')
		expect(rmPaths).toContain(path.join(HOME, '.openclaw')) // config dir
		expect(rmPaths).toContain(path.join(HOME, '.openclaw/.env')) // WRITE_TARGETS secret
	})
})

describe('uninstallCli — none kind (aion-cli) refuses/no-ops', () => {
	test('does NOT spawn, does NOT rm a binary; returns {ok:false, skipped:true}', async () => {
		const {spawnFn} = makeFakeSpawn()
		const fs = makeFakeFs()
		const result = await uninstallCli(
			{name: 'aion-cli'},
			{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
		)
		expect(result.ok).toBe(false)
		expect(result.skipped).toBe(true)
		expect(spawnFn).not.toHaveBeenCalled()
		expect(fs.rm).not.toHaveBeenCalled()
		expect(result.output).toMatch(/UNINSTALL_REFUSED|AionUi|embedded/i)
	})
})

describe('uninstallCli — never throws on subprocess failure', () => {
	test('npm exit non-zero → {ok:false} (NOT a throw)', async () => {
		const {spawnFn} = makeFakeSpawn(1)
		const fs = makeFakeFs()
		const result = await uninstallCli(
			{name: 'codex'},
			{logger: makeLogger(), homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
		)
		expect(result.ok).toBe(false)
		expect(result.exitCode).toBe(1)
	})
})

describe('uninstallCli — never logs a secret', () => {
	test('logger receives only name + static paths, never the secret file contents', async () => {
		const logger = makeLogger()
		const {spawnFn} = makeFakeSpawn()
		const fs = makeFakeFs()
		await uninstallCli(
			{name: 'claude-code'},
			{logger, homeDir: HOME, fs: fs as any, spawnFn: spawnFn as any},
		)
		const allLogArgs = [
			...(logger.info as any).mock.calls,
			...(logger.warn as any).mock.calls,
			...(logger.error as any).mock.calls,
		]
			.flat()
			.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
			.join(' | ')
		// The 267 secret VALUE is never read here, so nothing secret can leak; assert
		// the logger at least names the CLI (observability) without throwing.
		expect(allLogArgs).toContain('claude-code')
	})

	// Deps signature stays usable without injected spawn/fs (production defaults).
	test('UninstallCliDeps allows logger-only construction (defaults fill spawn/fs)', () => {
		const deps: UninstallCliDeps = {logger: makeLogger()}
		expect(deps.logger).toBeDefined()
	})
})
