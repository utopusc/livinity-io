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
 * SUPPORTED_CLIS contract is preserved.
 *
 * Drift-locks (Tests 13 + 14):
 *   - AUTH_TIMEOUT_MS === 300_000 (matches INSTALL_TIMEOUT_MS magnitude)
 *   - CLI_AUTH_COMMANDS has exactly 20 keys matching SUPPORTED_CLIS
 *     (IN-01 — was "5"; the tuple expanded to 20 in Phase 253-04)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {createHash} from 'node:crypto'
import {EventEmitter} from 'node:events'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
	AUTH_TIMEOUT_MS,
	authCli,
	CLI_AUTH_COMMANDS,
	registerLiveAuth,
	sendAuthInput,
	_resetLiveAuthsForTests,
	type AuthCliDeps,
	type SendAuthInputDeps,
} from '../auth.js'
import {SUPPORTED_CLIS} from '../install-scripts.js'
import type {CliName, InstallerLogger} from '../types.js'

function makeLogger(): InstallerLogger {
	return {info: vi.fn(), warn: vi.fn(), error: vi.fn()}
}

interface FakeStdin {
	write: ReturnType<typeof vi.fn>
	destroyed: boolean
}

interface FakeChild extends EventEmitter {
	stdout: EventEmitter
	stderr: EventEmitter
	stdin: FakeStdin
	kill: ReturnType<typeof vi.fn>
	killed: boolean
}

function makeFakeChild(): FakeChild {
	const child = new EventEmitter() as FakeChild
	child.stdout = new EventEmitter()
	child.stderr = new EventEmitter()
	child.stdin = {write: vi.fn(() => true), destroyed: false}
	child.killed = false
	child.kill = vi.fn((_sig?: string) => {
		child.killed = true
		return true
	})
	return child
}

// Phase 269-02 — a fake MinimalPty for the pty-backed (paste-back / claude) path.
// node-pty's surface is onData/onExit/write/resize/kill — a PTY has NO `.stdin`
// stream (you write to the handle itself). The fake records data/exit callbacks so
// tests can drive the merged stream + completion, and spies `write`/`kill`.
interface FakePty {
	onData: ReturnType<typeof vi.fn>
	onExit: ReturnType<typeof vi.fn>
	write: ReturnType<typeof vi.fn>
	resize: ReturnType<typeof vi.fn>
	kill: ReturnType<typeof vi.fn>
	// test drivers (call the captured callbacks)
	emitData(chunk: string): void
	emitExit(exitCode: number, signal?: string | null): void
}

function makeFakePty(): FakePty {
	let dataCb: ((chunk: string) => void) | null = null
	let exitCb: ((info: {exitCode: number; signal: string | null}) => void) | null = null
	const pty: FakePty = {
		onData: vi.fn((cb: (chunk: string) => void) => {
			dataCb = cb
		}),
		onExit: vi.fn((cb: (info: {exitCode: number; signal: string | null}) => void) => {
			exitCb = cb
		}),
		write: vi.fn((_data: string) => undefined),
		resize: vi.fn((_c: number, _r: number) => undefined),
		kill: vi.fn(() => undefined),
		emitData(chunk: string) {
			dataCb?.(chunk)
		},
		emitExit(exitCode: number, signal: string | null = null) {
			exitCb?.({exitCode, signal})
		},
	}
	return pty
}

interface MockRedis {
	set: ReturnType<typeof vi.fn>
}

function makeRedis(): MockRedis {
	return {set: vi.fn().mockResolvedValue('OK')}
}

afterEach(() => {
	vi.useRealTimers()
	_resetLiveAuthsForTests()
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
	test('Test 3: claude-code spawns with bare argv ["claude", []] and exits 0 (Phase 268 paste-back)', async () => {
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
		// 268 — reclassified from ['auth','login'] to the bare paste-back login.
		expect(args).toEqual([])
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

// Phase 267-01 Task 3 — streaming device-code surfacing.
describe('authCli — streaming device-code (Phase 267-01)', () => {
	test('Test 16: onChunk fires with {url, code} BEFORE the exit event', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const order: string[] = []
		const onChunk = vi.fn((payload: {url?: string; code?: string}) => {
			order.push(`onChunk:${payload.url}:${payload.code}`)
		})
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
			onChunk: onChunk as any,
		}
		// github-copilot is a device CLI with a non-null login argv (spawns today);
		// kimi-cli/kiro device argv land in Task 4 — streaming is CLI-agnostic.
		const p = authCli({name: 'github-copilot'}, deps)
		setImmediate(() => {
			// A device login prints the URL + code early, then keeps polling.
			child.stderr.emit(
				'data',
				Buffer.from('Visit https://kimi.com/device and enter code CODE-1234\n'),
			)
			// Simulate the user finishing in the browser → process exits later.
			setImmediate(() => {
				order.push('exit')
				child.emit('exit', 0)
			})
		})
		const result = await p
		expect(result.ok).toBe(true)
		// onChunk MUST have fired, and BEFORE exit.
		expect(onChunk).toHaveBeenCalled()
		const firstArg = onChunk.mock.calls[0][0] as {url?: string; code?: string}
		expect(firstArg.url).toBe('https://kimi.com/device')
		expect(firstArg.code).toBe('CODE-1234')
		expect(order[0]).toBe('onChunk:https://kimi.com/device:CODE-1234')
		expect(order).toContain('exit')
		expect(order.indexOf('onChunk:https://kimi.com/device:CODE-1234')).toBeLessThan(
			order.indexOf('exit'),
		)
	})

	test('Test 17: publishes {url, code} to liv:cli:auth:stream:<name> + sets url key', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const publish = vi.fn().mockResolvedValue(1)
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
			redisPub: {publish} as any,
		}
		const p = authCli({name: 'github-copilot'}, deps)
		setImmediate(() => {
			child.stdout.emit(
				'data',
				Buffer.from('Open https://github.com/login/device — code ABCD-9999\n'),
			)
			child.emit('exit', 0)
		})
		await p
		// pub/sub channel carried the payload
		expect(publish).toHaveBeenCalled()
		const [channel, payload] = publish.mock.calls[0] as [string, string]
		expect(channel).toBe('liv:cli:auth:stream:github-copilot')
		const decoded = JSON.parse(payload)
		expect(decoded.url).toBe('https://github.com/login/device')
		expect(decoded.code).toBe('ABCD-9999')
		// A late-poll url key was SET with an EX TTL.
		const urlKeySet = redis.set.mock.calls.find(
			(c: unknown[]) => c[0] === 'liv:cli:auth:url:github-copilot',
		)
		expect(urlKeySet).toBeDefined()
		const decodedKey = JSON.parse(urlKeySet![1] as string)
		expect(decodedKey.url).toBe('https://github.com/login/device')
		expect(decodedKey.code).toBe('ABCD-9999')
		expect(urlKeySet![2]).toBe('EX')
	})

	test('Test 18: onChunk fires only ONCE even if the URL+code repeats in later chunks', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const onChunk = vi.fn()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
			onChunk: onChunk as any,
		}
		const p = authCli({name: 'github-copilot'}, deps)
		setImmediate(() => {
			const line = 'go https://kimi.com/device code AAAA-1111\n'
			child.stderr.emit('data', Buffer.from(line))
			child.stderr.emit('data', Buffer.from(line))
			child.emit('exit', 0)
		})
		await p
		expect(onChunk).toHaveBeenCalledTimes(1)
	})

	test('Test 19 (WR-01): an uppercase banner token BEFORE the URL is not mistaken for the code', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const onChunk = vi.fn()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
			onChunk: onChunk as any,
		}
		const p = authCli({name: 'github-copilot'}, deps)
		setImmediate(() => {
			// A startup banner prints uppercase tokens (WELCOME / BUILD / A1B2C3)
			// BEFORE the device prompt. The bare [A-Z0-9]{4,8} regex would match
			// "WELCOME" first on the full tail and, via the fire-once guard,
			// permanently shadow the real code. The URL-line anchor must win.
			child.stderr.emit(
				'data',
				Buffer.from(
					'WELCOME to FooCLI v1.2.3 BUILD A1B2C3\nVisit https://kimi.com/device and enter code CODE-1234\n',
				),
			)
			child.emit('exit', 0)
		})
		await p
		expect(onChunk).toHaveBeenCalled()
		const firstArg = onChunk.mock.calls[0][0] as {url?: string; code?: string}
		expect(firstArg.url).toBe('https://kimi.com/device')
		expect(firstArg.code).toBe('CODE-1234')
	})
})

// Phase 268-01 Task 2 — live-child registry + registerLiveAuth + sendAuthInput.
function makeSendDeps(): SendAuthInputDeps {
	return {logger: makeLogger()}
}

describe('sendAuthInput — whitelist guard FIRST (D-239-07 RCE boundary)', () => {
	test('rejects unknown CLI name BEFORE any registry lookup', async () => {
		// A child IS registered under a real name — the throw must happen before
		// the registry is even consulted (whitelist guard is the first statement).
		const child = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		await expect(
			sendAuthInput({name: 'not-a-cli' as CliName, code: 'X'}, makeSendDeps()),
		).rejects.toThrow(/not in whitelist|CLI not in whitelist/i)
		// The registered child's stdin was NOT touched.
		expect(child.stdin.write).not.toHaveBeenCalled()
	})
})

describe('sendAuthInput — write to live child stdin', () => {
	test("writes 'ABC123\\n' to the registered child's stdin exactly once → {ok:true}", async () => {
		const child = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		const res = await sendAuthInput(
			{name: 'claude-code', code: 'ABC123'},
			makeSendDeps(),
		)
		expect(res).toEqual({ok: true})
		expect(child.stdin.write).toHaveBeenCalledTimes(1)
		expect(child.stdin.write).toHaveBeenCalledWith('ABC123\n')
	})

	test('with NO registered child for the name → {ok:false}, does not throw', async () => {
		const res = await sendAuthInput(
			{name: 'opencode', code: 'X'},
			makeSendDeps(),
		)
		expect(res).toEqual({ok: false})
	})

	test('with a registered child whose stdin.destroyed === true → {ok:false}', async () => {
		const child = makeFakeChild()
		child.stdin.destroyed = true
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		const res = await sendAuthInput(
			{name: 'claude-code', code: 'X'},
			makeSendDeps(),
		)
		expect(res).toEqual({ok: false})
		expect(child.stdin.write).not.toHaveBeenCalled()
	})
})

describe('sendAuthInput — never log the pasted code (it may be a bearer token)', () => {
	test('logs ONLY the char length, never the literal code string', async () => {
		const child = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		const deps = makeSendDeps()
		await sendAuthInput({name: 'claude-code', code: 'ABC123'}, deps)
		const allLogArgs = [
			...(deps.logger.info as ReturnType<typeof vi.fn>).mock.calls,
			...(deps.logger.warn as ReturnType<typeof vi.fn>).mock.calls,
			...(deps.logger.error as ReturnType<typeof vi.fn>).mock.calls,
		].flat()
		// The secret never appears in any log arg.
		for (const arg of allLogArgs) {
			expect(String(arg)).not.toContain('ABC123')
		}
		// But the length (6) IS logged.
		const infoJoined = (deps.logger.info as ReturnType<typeof vi.fn>).mock.calls
			.flat()
			.join(' ')
		expect(infoJoined).toContain('6')
	})
})

describe('sendAuthInput — defensive bounds', () => {
	test('strips trailing CR/LF → writes exactly one trailing newline', async () => {
		const child = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		await sendAuthInput(
			{name: 'claude-code', code: 'CODE-99\r\n'},
			makeSendDeps(),
		)
		expect(child.stdin.write).toHaveBeenCalledWith('CODE-99\n')
	})

	test('caps a > 4096-char code to 4096 before appending the newline', async () => {
		const child = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		const huge = 'A'.repeat(5000)
		await sendAuthInput({name: 'claude-code', code: huge}, makeSendDeps())
		const written = (child.stdin.write as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string
		expect(written.length).toBe(4097) // 4096 chars + one '\n'
		expect(written.endsWith('\n')).toBe(true)
		expect(written.slice(0, 4096)).toBe('A'.repeat(4096))
	})
})

describe('registerLiveAuth — single-in-flight per CLI', () => {
	test('registering a second child for the same name SIGKILLs the prior child', async () => {
		const childA = makeFakeChild()
		const childB = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'child', child: childA as any})
		registerLiveAuth('claude-code', {kind: 'child', child: childB as any})
		// Prior child killed.
		expect(childA.kill).toHaveBeenCalledWith('SIGKILL')
		// Registry now holds childB — a write lands on childB, not childA.
		await sendAuthInput({name: 'claude-code', code: 'XY'}, makeSendDeps())
		expect(childB.stdin.write).toHaveBeenCalledWith('XY\n')
		expect(childA.stdin.write).not.toHaveBeenCalled()
	})
})

describe('registerLiveAuth — natural-exit cleanup', () => {
	test("emitting 'exit' removes the child from the registry", async () => {
		const child = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		// Natural exit → registry entry dropped.
		child.emit('exit', 0)
		const res = await sendAuthInput(
			{name: 'claude-code', code: 'X'},
			makeSendDeps(),
		)
		expect(res).toEqual({ok: false})
	})
})

describe('registerLiveAuth — stranded-child timeout teardown', () => {
	test('after AUTH_TIMEOUT_MS the child is SIGKILLed and removed from the registry', async () => {
		vi.useFakeTimers()
		const child = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS + 1000)
		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
		// Registry no longer holds it.
		const res = await sendAuthInput(
			{name: 'claude-code', code: 'X'},
			makeSendDeps(),
		)
		expect(res).toEqual({ok: false})
	})
})

// ───────────────────────────────────────────────────────────────────────────
// Phase 269-02 Task 1 — LiveAuth child|pty discriminated union.
// The registry now backs a login with EITHER a child_process (device-poll CLIs,
// unchanged) OR a node-pty (paste-back CLIs like claude that need a real TTY).
// sendAuthInput writes `code + '\r'` to a pty (TTY line discipline submits on CR)
// and the existing `code + '\n'` to a child's stdin. All teardown (single-in-
// flight kill, 300s timeout, natural-exit cleanup) works for BOTH backings.
// ───────────────────────────────────────────────────────────────────────────

describe('Phase 269-02 — registerLiveAuth accepts a pty backing', () => {
	test("registering a {kind:'pty'} backing lets sendAuthInput write to it", async () => {
		const pty = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		const res = await sendAuthInput(
			{name: 'claude-code', code: 'PTYCODE'},
			makeSendDeps(),
		)
		expect(res).toEqual({ok: true})
		expect(pty.write).toHaveBeenCalledTimes(1)
	})

	test('a second login for the same name kills the prior PTY backing (single-in-flight)', async () => {
		const ptyA = makeFakePty()
		const ptyB = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'pty', pty: ptyA as any})
		registerLiveAuth('claude-code', {kind: 'pty', pty: ptyB as any})
		// Prior pty killed via MinimalPty.kill() (NOT child.kill('SIGKILL')).
		expect(ptyA.kill).toHaveBeenCalledTimes(1)
		// Registry now holds ptyB — a write lands on ptyB.
		await sendAuthInput({name: 'claude-code', code: 'XY'}, makeSendDeps())
		expect(ptyB.write).toHaveBeenCalledWith('XY\r')
		expect(ptyA.write).not.toHaveBeenCalled()
	})

	test('a child backing replacing a prior PTY backing kills the pty via .kill()', async () => {
		const pty = makeFakePty()
		const child = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		expect(pty.kill).toHaveBeenCalledTimes(1)
	})

	test('a pty backing replacing a prior CHILD backing SIGKILLs the child', async () => {
		const child = makeFakeChild()
		const pty = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		expect(child.kill).toHaveBeenCalledWith('SIGKILL')
	})

	test('_resetLiveAuthsForTests kills a pty backing too', async () => {
		const pty = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		_resetLiveAuthsForTests()
		expect(pty.kill).toHaveBeenCalledTimes(1)
		// Registry empty afterwards.
		const res = await sendAuthInput(
			{name: 'claude-code', code: 'X'},
			makeSendDeps(),
		)
		expect(res).toEqual({ok: false})
	})

	test('after AUTH_TIMEOUT_MS a stranded PTY login is killed + removed', async () => {
		vi.useFakeTimers()
		const pty = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS + 1000)
		expect(pty.kill).toHaveBeenCalledTimes(1)
		const res = await sendAuthInput(
			{name: 'claude-code', code: 'X'},
			makeSendDeps(),
		)
		expect(res).toEqual({ok: false})
	})
})

describe('Phase 269-02 — sendAuthInput writes CR to a pty, LF to a child', () => {
	test("pty backing → writes exactly `code + '\\r'` (CR, not LF)", async () => {
		const pty = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		const res = await sendAuthInput(
			{name: 'claude-code', code: 'ABC123'},
			makeSendDeps(),
		)
		expect(res).toEqual({ok: true})
		expect(pty.write).toHaveBeenCalledTimes(1)
		expect(pty.write).toHaveBeenCalledWith('ABC123\r')
	})

	test('pty backing → strips trailing CR/LF before appending exactly one CR', async () => {
		const pty = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		await sendAuthInput(
			{name: 'claude-code', code: 'CODE-99\r\n'},
			makeSendDeps(),
		)
		expect(pty.write).toHaveBeenCalledWith('CODE-99\r')
	})

	test('pty backing → caps a > 4096-char code to 4096 before the CR', async () => {
		const pty = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		const huge = 'A'.repeat(5000)
		await sendAuthInput({name: 'claude-code', code: huge}, makeSendDeps())
		const written = (pty.write as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string
		expect(written.length).toBe(4097) // 4096 chars + one '\r'
		expect(written.endsWith('\r')).toBe(true)
		expect(written.slice(0, 4096)).toBe('A'.repeat(4096))
	})

	test("child backing STILL writes `code + '\\n'` (LF) — unchanged behavior", async () => {
		const child = makeFakeChild()
		registerLiveAuth('claude-code', {kind: 'child', child: child as any})
		await sendAuthInput({name: 'claude-code', code: 'ABC123'}, makeSendDeps())
		expect(child.stdin.write).toHaveBeenCalledWith('ABC123\n')
	})

	test('pty backing → never logs the pasted code, only its char length', async () => {
		const pty = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		const deps = makeSendDeps()
		await sendAuthInput({name: 'claude-code', code: 'SECRET99'}, deps)
		const allLogArgs = [
			...(deps.logger.info as ReturnType<typeof vi.fn>).mock.calls,
			...(deps.logger.warn as ReturnType<typeof vi.fn>).mock.calls,
			...(deps.logger.error as ReturnType<typeof vi.fn>).mock.calls,
		].flat()
		for (const arg of allLogArgs) {
			expect(String(arg)).not.toContain('SECRET99')
		}
		const infoJoined = (deps.logger.info as ReturnType<typeof vi.fn>).mock.calls
			.flat()
			.join(' ')
		expect(infoJoined).toContain('8') // 'SECRET99'.length === 8
	})

	test('whitelist guard is STILL first — unknown name throws before pty lookup', async () => {
		const pty = makeFakePty()
		registerLiveAuth('claude-code', {kind: 'pty', pty: pty as any})
		await expect(
			sendAuthInput({name: 'not-a-cli' as CliName, code: 'X'}, makeSendDeps()),
		).rejects.toThrow(/not in whitelist|CLI not in whitelist/i)
		expect(pty.write).not.toHaveBeenCalled()
	})
})

// Phase 268-01 — the spawn site registers the live child.
describe('authCli — registers the live child the instant it spawns', () => {
	test('a write via sendAuthInput reaches the child authCli spawned', async () => {
		const child = makeFakeChild()
		const spawnFn = vi.fn(() => child as any)
		const redis = makeRedis()
		const deps: AuthCliDeps = {
			logger: makeLogger(),
			spawnFn: spawnFn as any,
			redis: redis as any,
		}
		// Start the login (claude-code now spawns the bare paste-back login).
		const p = authCli({name: 'claude-code'}, deps)
		// authCli awaits the redis 'running' SET before spawning — yield until the
		// spawn (and registerLiveAuth) has actually run.
		await vi.waitFor(() => expect(spawnFn).toHaveBeenCalled())
		// BEFORE the child exits, the operator pastes a code — it must reach stdin.
		const sendRes = await sendAuthInput(
			{name: 'claude-code', code: 'PASTE9'},
			makeSendDeps(),
		)
		expect(sendRes).toEqual({ok: true})
		expect(child.stdin.write).toHaveBeenCalledWith('PASTE9\n')
		// Let the login finish.
		child.emit('exit', 0)
		const result = await p
		expect(result.ok).toBe(true)
	})
})

describe('authCli — drift-lock constants', () => {
	test('Test 13: AUTH_TIMEOUT_MS exported as 300_000', () => {
		expect(AUTH_TIMEOUT_MS).toBe(300_000)
	})

	test('Test 14: CLI_AUTH_COMMANDS has exactly 20 keys matching SUPPORTED_CLIS tuple', () => {
		const keys = Object.keys(CLI_AUTH_COMMANDS).sort()
		const expected = [...SUPPORTED_CLIS].sort()
		expect(keys).toEqual(expected)
		expect(keys.length).toBe(20)
	})

	test('Test 15: api-key-only / n-a Wave-C CLIs stay null (AUTH_UNSUPPORTED short-circuit)', () => {
		// Phase 267-01 — these authenticate via cliInstaller.setApiKey (api-key
		// write), NOT a login spawn, so their canonical-login argv stays null.
		for (const name of ['mistral-vibe', 'nanobot', 'snow-cli'] as const) {
			expect(CLI_AUTH_COMMANDS[name]).toBeNull()
		}
		// aion-cli is genuinely unsupported (AionUi embedded backend).
		expect(CLI_AUTH_COMMANDS['aion-cli']).toBeNull()
		// cursor-agent's auth bin MUST equal its install/detector binary (BLOCKER 1).
		expect(CLI_AUTH_COMMANDS['cursor-agent']).toEqual(['cursor-agent', ['login']])
	})

	test('Test 15b: Phase 267-01 — auth-able Wave-C CLIs got a real login argv', () => {
		// Device-flow logins (the no-terminal streaming path consumes these).
		expect(CLI_AUTH_COMMANDS['kimi-cli']).toEqual(['kimi', ['login']])
		expect(CLI_AUTH_COMMANDS['kiro']).toEqual(['kiro-cli', ['login']])
		// hermes-agent device portal (api-key is the other path via setApiKey).
		expect(CLI_AUTH_COMMANDS['hermes-agent']).toEqual([
			'hermes',
			['setup', '--portal'],
		])
	})
})
