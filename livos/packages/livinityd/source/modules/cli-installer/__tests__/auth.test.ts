/**
 * Phase 240-01 Task 1 — auth.test.ts
 *
 * Unit tests for the cli-installer/auth.ts spawn wrapper.
 *
 * Mirrors installer.test.ts in shape (fake EventEmitter child + DI spawn), but
 * additionally probes the Redis status-key writes (`liv:cli:auth:<name>`)
 * and the optional auditLog DI seam (one row per auth attempt).
 *
 * D-239-07 RCE boundary still applies: the whitelist guard MUST throw before
 * any spawn fires (Test 1) and aion-cli MUST short-circuit (Test 2) — the
 * 5-tuple SUPPORTED_CLIS contract is preserved.
 *
 * Drift-locks (Tests 13 + 14):
 *   - AUTH_TIMEOUT_MS === 300_000 (matches INSTALL_TIMEOUT_MS magnitude)
 *   - CLI_AUTH_COMMANDS has exactly 5 keys matching SUPPORTED_CLIS
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {createHash} from 'node:crypto'
import {EventEmitter} from 'node:events'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
	AUTH_TIMEOUT_MS,
	authCli,
	CLI_AUTH_COMMANDS,
	type AuthCliDeps,
} from '../auth.js'
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

interface MockRedis {
	set: ReturnType<typeof vi.fn>
}

function makeRedis(): MockRedis {
	return {set: vi.fn().mockResolvedValue('OK')}
}

afterEach(() => {
	vi.useRealTimers()
})

describe('authCli — whitelist guard (D-239-07 RCE boundary)', () => {
	test('Test 1: rejects unknown CLI name BEFORE spawn fires', async () => {
		const spawnFn = vi.fn()
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		await expect(authCli({name: '../etc/passwd' as any}, deps)).rejects.toThrow(
			/not in whitelist|CLI not in whitelist/i,
		)
		expect(spawnFn).not.toHaveBeenCalled()
		expect(redis.set).not.toHaveBeenCalled()
	})
})

describe('authCli — aion-cli short-circuit (AUTH_UNSUPPORTED)', () => {
	test('Test 2: aion-cli returns AUTH_UNSUPPORTED without spawning', async () => {
		const spawnFn = vi.fn()
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		const result = await authCli({name: 'aion-cli'}, deps)
		expect(result.ok).toBe(false)
		expect(result.exitCode).toBe(-1)
		expect(result.output).toMatch(/AUTH_UNSUPPORTED/)
		expect(result.durationMs).toBe(0)
		expect(spawnFn).not.toHaveBeenCalled()
	})
})

describe('authCli — spawn happy path', () => {
	test('Test 3: claude-code spawns with argv ["claude", ["code","login"]] and exits 0', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		const p = authCli({name: 'claude-code'}, deps)
		setImmediate(() => {
			child.stdout.emit('data', Buffer.from('login-url=https://example.com\n'))
			child.emit('exit', 0)
		})
		const result = await p
		expect(result.ok).toBe(true)
		expect(result.exitCode).toBe(0)
		expect(spawnFn).toHaveBeenCalledTimes(1)
		const [cmd, args] = spawnFn.mock.calls[0] as unknown as [string, string[]]
		expect(cmd).toBe('claude')
		expect(args).toEqual(['code', 'login'])
	})

	test('Test 4: captures combined stdout+stderr tail-truncated to OUTPUT_CAP_BYTES', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		const p = authCli({name: 'opencode'}, deps)
		setImmediate(() => {
			// Push 40KB of stdout (above 32KB OUTPUT_CAP_BYTES) — only last 32KB retained
			const big = 'x'.repeat(40 * 1024)
			child.stdout.emit('data', Buffer.from(big))
			child.stderr.emit('data', Buffer.from('ERR-TAIL\n'))
			child.emit('exit', 0)
		})
		const result = await p
		// Total bytes captured <= 32KB (cap enforced)
		expect(Buffer.byteLength(result.output, 'utf8')).toBeLessThanOrEqual(32 * 1024)
		// The very last bytes (stderr) must survive because tail-truncation keeps the END
		expect(result.output).toContain('ERR-TAIL')
	})
})

describe('authCli — timeout', () => {
	test('Test 5: times out at AUTH_TIMEOUT_MS, SIGKILL, returns TIMEOUT marker', async () => {
		vi.useFakeTimers()
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		const p = authCli({name: 'gemini'}, deps)
		await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS + 1000)
		const result = await p
		expect(result.ok).toBe(false)
		expect(result.exitCode).toBe(-1)
		expect(result.output).toMatch(/===TIMEOUT===/)
		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
	})
})

describe('authCli — spawn ENOENT', () => {
	test('Test 6: spawn throws ENOENT → structured ===SPAWN-FAILED=== result', async () => {
		const spawnFn = vi.fn(() => {
			const err: NodeJS.ErrnoException = new Error(
				'spawn claude ENOENT',
			) as NodeJS.ErrnoException
			err.code = 'ENOENT'
			throw err
		})
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		const result = await authCli({name: 'claude-code'}, deps)
		expect(result.ok).toBe(false)
		expect(result.exitCode).toBe(-1)
		expect(result.output.startsWith('===SPAWN-FAILED===')).toBe(true)
	})
})

describe('authCli — Redis status key writes', () => {
	test("Test 7: SET 'liv:cli:auth:claude-code' = 'running' on dispatch", async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		const p = authCli({name: 'claude-code'}, deps)
		setImmediate(() => child.emit('exit', 0))
		await p
		// First call must be the 'running' write
		expect(redis.set).toHaveBeenCalled()
		const firstCall = redis.set.mock.calls[0]
		expect(firstCall).toEqual(['liv:cli:auth:claude-code', 'running', 'EX', 3600])
	})

	test("Test 8: SET 'liv:cli:auth:claude-code' = 'ok' on success", async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		const p = authCli({name: 'claude-code'}, deps)
		setImmediate(() => child.emit('exit', 0))
		await p
		// Last call must be the 'ok' write
		const lastCall = redis.set.mock.calls[redis.set.mock.calls.length - 1]
		expect(lastCall).toEqual(['liv:cli:auth:claude-code', 'ok', 'EX', 3600])
	})

	test("Test 9: SET 'liv:cli:auth:claude-code' = 'failed' on non-zero exit", async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		const p = authCli({name: 'claude-code'}, deps)
		setImmediate(() => child.emit('exit', 13))
		await p
		const lastCall = redis.set.mock.calls[redis.set.mock.calls.length - 1]
		expect(lastCall).toEqual(['liv:cli:auth:claude-code', 'failed', 'EX', 3600])
	})
})

describe('authCli — auditLog DI seam', () => {
	test('Test 10: auditLog called once on completion with structured row', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const auditLog = vi.fn().mockResolvedValue(undefined)
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
			auditLog: auditLog as any,
		}
		const p = authCli({name: 'claude-code'}, deps)
		setImmediate(() => child.emit('exit', 0))
		await p
		expect(auditLog).toHaveBeenCalledTimes(1)
		const expectedDigest = createHash('sha256')
			.update(JSON.stringify({name: 'claude-code'}))
			.digest('hex')
		const row = auditLog.mock.calls[0][0]
		expect(row).toMatchObject({
			tool_name: 'cliInstaller.auth',
			params_digest: expectedDigest,
			success: true,
			error: null,
		})
	})

	test('Test 11: auditLog is OPTIONAL — authCli still completes without it', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
			// no auditLog
		}
		const p = authCli({name: 'opencode'}, deps)
		setImmediate(() => child.emit('exit', 0))
		const result = await p
		expect(result.ok).toBe(true)
	})
})

describe('authCli — redisStatusKey echoed in result', () => {
	test('Test 12: result.redisStatusKey === "liv:cli:auth:<name>"', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		const p = authCli({name: 'openclaw'}, deps)
		setImmediate(() => child.emit('exit', 0))
		const result = await p
		expect(result.redisStatusKey).toBe('liv:cli:auth:openclaw')
	})
})

describe('authCli — drift-lock constants', () => {
	test('Test 13: AUTH_TIMEOUT_MS exported as 300_000', () => {
		expect(AUTH_TIMEOUT_MS).toBe(300_000)
	})

	test('Test 14: CLI_AUTH_COMMANDS has exactly 5 keys matching SUPPORTED_CLIS tuple', () => {
		const keys = Object.keys(CLI_AUTH_COMMANDS).sort()
		const expected = [...SUPPORTED_CLIS].sort()
		expect(keys).toEqual(expected)
		expect(keys.length).toBe(5)
	})
})
