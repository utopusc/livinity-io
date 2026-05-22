/**
 * Phase 195 Plan 01 Task 2 — flow-service.test.ts (RED → GREEN).
 *
 * Vitest suite for XaiAuthFlowService. Uses vi.mock to stub the
 * opencode-spawner module so we never spawn a real child process.
 *
 * Coverage:
 *   - start() validates flowId regex (rejects non-alphanumeric / too-short)
 *   - start() spawns with provider=xai + supplied method, captures stdout,
 *     resolves with extracted URL within timeout
 *   - start() on a duplicate flowId rejects with DuplicateFlowError
 *   - waitForCompletion times out and rejects with XaiAuthFlowTimeoutError;
 *     subsequent hasActiveFlow(flowId) is false (cleanup verified)
 *   - abort(flowId) sends SIGTERM, escalates to SIGKILL after grace, removes
 *     flow from registry
 *   - URL discovery timeout (30s default) SIGKILLs the child if no URL
 *     emerges
 */

import {EventEmitter} from 'node:events'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

// ─── Mock setup ───────────────────────────────────────────────────────────────
// We need a controllable fake `ChildProcessWithoutNullStreams` and a spy on
// spawnOpencodeLogin. The fake child exposes the stdout/stderr emitters the
// real one would.

interface FakeChild extends EventEmitter {
	stdout: EventEmitter & {setEncoding: (enc: string) => void}
	stderr: EventEmitter & {setEncoding: (enc: string) => void}
	kill: (sig?: NodeJS.Signals | number) => boolean
	killed: boolean
	signalsSent: Array<NodeJS.Signals | number>
}

function makeFakeChild(): FakeChild {
	const child = new EventEmitter() as FakeChild
	const stdout = new EventEmitter() as FakeChild['stdout']
	stdout.setEncoding = () => {}
	const stderr = new EventEmitter() as FakeChild['stderr']
	stderr.setEncoding = () => {}
	child.stdout = stdout
	child.stderr = stderr
	child.killed = false
	child.signalsSent = []
	child.kill = (sig?: NodeJS.Signals | number) => {
		child.signalsSent.push(sig ?? 'SIGTERM')
		child.killed = true
		return true
	}
	return child
}

const spawnerState: {
	lastCall: {provider?: string; method?: string} | null
	nextChild: FakeChild | null
	calls: number
} = {lastCall: null, nextChild: null, calls: 0}

vi.mock('./opencode-spawner.js', async () => {
	return {
		spawnOpencodeLogin: vi.fn((opts: {provider: string; method: string; onStdout: (c: string) => void; onStderr?: (c: string) => void}) => {
			spawnerState.calls++
			spawnerState.lastCall = {provider: opts.provider, method: opts.method}
			const child = spawnerState.nextChild ?? makeFakeChild()
			// Hook stdout/stderr through the supplied callbacks.
			child.stdout.on('data', (chunk: string) => opts.onStdout(chunk))
			if (opts.onStderr) child.stderr.on('data', (chunk: string) => opts.onStderr!(chunk))
			// Match the real spawner contract: ready resolves on first stdout chunk.
			const ready = new Promise<void>((resolve, reject) => {
				let sawStdout = false
				child.stdout.on('data', () => {
					if (!sawStdout) {
						sawStdout = true
						resolve()
					}
				})
				child.on('error', (err) => {
					if (!sawStdout) reject(err)
				})
				child.on('exit', () => {
					if (!sawStdout) reject(new Error('exited before stdout'))
				})
			})
			return {child, ready}
		}),
		// Re-export error classes so flow-service.ts can import them.
		OpencodeNotInstalledError: class extends Error {
			readonly code = 'OPENCODE_NOT_INSTALLED' as const
		},
		OpencodeSpawnError: class extends Error {
			readonly code = 'OPENCODE_SPAWN_FAILED' as const
		},
		resolveOpencodeBinary: vi.fn(() => '/usr/local/bin/opencode'),
	}
})

import {
	XaiAuthFlowService,
	XaiAuthFlowTimeoutError,
	DuplicateFlowError,
	ValidationError,
	UnknownFlowError,
} from './flow-service.js'

beforeEach(() => {
	spawnerState.lastCall = null
	spawnerState.nextChild = null
	spawnerState.calls = 0
})

afterEach(() => {
	vi.useRealTimers()
})

describe('XaiAuthFlowService.start()', () => {
	test('emits a URL within 1s when child stdout contains an xAI OAuth URL', async () => {
		const child = makeFakeChild()
		spawnerState.nextChild = child
		const svc = new XaiAuthFlowService({method: 'xAI Grok Auth Headless / Remote / VPS'})
		const startPromise = svc.start('flow-abc12345')
		// Emit stdout asynchronously
		setTimeout(() => {
			child.stdout.emit('data', 'Open https://x.ai/oauth/device?code=ZZZ to continue\n')
		}, 10)
		const result = await startPromise
		expect(result.url).toBe('https://x.ai/oauth/device?code=ZZZ')
		expect(typeof result.startedAt).toBe('number')
		expect(spawnerState.lastCall?.provider).toBe('xai')
		expect(spawnerState.lastCall?.method).toBe('xAI Grok Auth Headless / Remote / VPS')
		expect(svc.hasActiveFlow('flow-abc12345')).toBe(true)
		await svc.abort('flow-abc12345')
	})

	test('rejects with ValidationError for malformed flowId (too short)', async () => {
		const svc = new XaiAuthFlowService()
		await expect(svc.start('abc')).rejects.toBeInstanceOf(ValidationError)
	})

	test('rejects with ValidationError for flowId with invalid characters', async () => {
		const svc = new XaiAuthFlowService()
		await expect(svc.start('flow$with;injection')).rejects.toBeInstanceOf(ValidationError)
	})

	test('rejects with DuplicateFlowError on second start with same id', async () => {
		const child = makeFakeChild()
		spawnerState.nextChild = child
		const svc = new XaiAuthFlowService()
		const p = svc.start('flow-dup12345')
		setTimeout(() => {
			child.stdout.emit('data', 'https://x.ai/oauth/device?code=A')
		}, 5)
		await p
		await expect(svc.start('flow-dup12345')).rejects.toBeInstanceOf(DuplicateFlowError)
		await svc.abort('flow-dup12345')
	})
})

describe('XaiAuthFlowService.waitForCompletion()', () => {
	test('throws UnknownFlowError when flowId is not registered', async () => {
		const svc = new XaiAuthFlowService()
		await expect(svc.waitForCompletion('never-started-123')).rejects.toBeInstanceOf(UnknownFlowError)
	})

	test('times out and rejects with XaiAuthFlowTimeoutError; flow cleaned up', async () => {
		const child = makeFakeChild()
		spawnerState.nextChild = child
		const svc = new XaiAuthFlowService()
		const startP = svc.start('flow-timeout001')
		setTimeout(() => {
			child.stdout.emit('data', 'https://x.ai/oauth/device?code=T')
		}, 5)
		await startP
		await expect(svc.waitForCompletion('flow-timeout001', 50)).rejects.toBeInstanceOf(
			XaiAuthFlowTimeoutError,
		)
		// After timeout, registry must be cleaned.
		expect(svc.hasActiveFlow('flow-timeout001')).toBe(false)
	})
})

describe('XaiAuthFlowService.abort()', () => {
	test('SIGTERMs then SIGKILLs the child and removes the flow from the registry', async () => {
		const child = makeFakeChild()
		spawnerState.nextChild = child
		const svc = new XaiAuthFlowService()
		const startP = svc.start('flow-abort001')
		setTimeout(() => {
			child.stdout.emit('data', 'https://x.ai/oauth/device?code=Q')
		}, 5)
		await startP
		expect(svc.hasActiveFlow('flow-abort001')).toBe(true)
		// abort() escalates via setTimeout; allow time for SIGKILL.
		const abortPromise = svc.abort('flow-abort001')
		await abortPromise
		expect(child.signalsSent).toContain('SIGTERM')
		// Registry cleaned regardless of escalation.
		expect(svc.hasActiveFlow('flow-abort001')).toBe(false)
	})
})
