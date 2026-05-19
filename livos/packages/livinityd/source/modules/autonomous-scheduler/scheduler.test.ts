/**
 * Phase 164-02 Task 2 — scheduler.test.ts
 *
 * Vitest suite locking the AutonomousScheduler runtime contract:
 *
 *   1. No-op when autonomous_enabled is unset/false — zero cron tasks registered
 *   2. Enabled flag + all defs enabled:false → zero cron tasks
 *   3. Enabled flag + one enabled def → exactly one cron task; stop() unregisters
 *   4. Parse partial-failure: 2 valid + 1 broken → 2 registered, no throw
 *   5. runNow happy path — SDK stub injected; daily spend incremented;
 *      active_count decremented; writeInboxEntry invoked with status='success'
 *   6. runNow concurrent cap reject — no SDK call, no inbox flood
 *   7. runNow daily budget reject — no SDK call, no inbox entry, no spend write
 *   8. SDK throws — status='error' in inbox; active_count decremented (no leak)
 *   9. active_count decrements via try/finally even when SDK iteration aborts
 *   10. registerDefinition() exposes a def to runNow() without growing tasks
 *
 * Test isolation: ioredis-mock is NOT a dep here (D-NO-NEW-DEPS), so the
 * fake-redis pattern from budget-gate.test.ts is reused (Map-backed). The
 * SDK is fully stubbed via the `queryImpl` injection point — no
 * api.anthropic.com round-trips. inbox-writer is stubbed via the
 * `inboxWriterImpl` injection so we can assert call shape without writing
 * to /tmp.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import {mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {AutonomousScheduler} from './scheduler.js'
import type {AgentDefinition} from './agent-definition-parser.js'
import type {InboxEntryInput, WriteInboxResult} from './inbox-writer.js'

// ─── Fake Redis (Map-backed) ──────────────────────────────────────────────

function makeFakeRedis() {
	const store = new Map<string, string>()
	const ttls = new Map<string, number>()

	type MultiOp = {op: string; args: any[]}

	const redis: any = {
		get: async (k: string): Promise<string | null> => store.get(k) ?? null,
		set: async (k: string, v: string): Promise<'OK'> => {
			store.set(k, String(v))
			return 'OK'
		},
		del: async (k: string): Promise<number> => (store.delete(k) ? 1 : 0),
		incr: async (k: string): Promise<number> => {
			const next = Number(store.get(k) ?? 0) + 1
			store.set(k, String(next))
			return next
		},
		decr: async (k: string): Promise<number> => {
			const next = Number(store.get(k) ?? 0) - 1
			store.set(k, String(next))
			return next
		},
		incrby: async (k: string, amount: number): Promise<number> => {
			const next = Number(store.get(k) ?? 0) + Math.round(amount)
			store.set(k, String(next))
			return next
		},
		expire: async (k: string, seconds: number): Promise<number> => {
			ttls.set(k, Math.floor(Date.now() / 1000) + Number(seconds))
			return 1
		},
		ttl: async (k: string): Promise<number> => {
			const t = ttls.get(k)
			return t === undefined ? -1 : t - Math.floor(Date.now() / 1000)
		},
		multi: () => {
			const ops: MultiOp[] = []
			const m: any = {
				incr(key: string) {
					ops.push({op: 'incr', args: [key]})
					return m
				},
				get(key: string) {
					ops.push({op: 'get', args: [key]})
					return m
				},
				incrby(key: string, amount: number) {
					ops.push({op: 'incrby', args: [key, amount]})
					return m
				},
				expire(key: string, seconds: number) {
					ops.push({op: 'expire', args: [key, seconds]})
					return m
				},
				exec: async () =>
					ops.map((op): [Error | null, any] => {
						switch (op.op) {
							case 'incr': {
								const next = Number(store.get(op.args[0]) ?? 0) + 1
								store.set(op.args[0], String(next))
								return [null, next]
							}
							case 'get':
								return [null, store.get(op.args[0]) ?? null]
							case 'incrby': {
								const next =
									Number(store.get(op.args[0]) ?? 0) +
									Math.round(op.args[1])
								store.set(op.args[0], String(next))
								return [null, next]
							}
							case 'expire': {
								ttls.set(
									op.args[0],
									Math.floor(Date.now() / 1000) + Number(op.args[1]),
								)
								return [null, 1]
							}
							default:
								return [new Error(`unknown op ${op.op}`), null]
						}
					}),
			}
			return m
		},
		eval: async (
			script: string,
			_numKeys: number,
			...keys: string[]
		): Promise<number> => {
			if (script.includes('if v <= 0')) {
				const key = keys[0]
				const cur = Number(store.get(key) ?? 0)
				if (cur <= 0) {
					store.set(key, '0')
					return 0
				}
				const next = cur - 1
				store.set(key, String(next))
				return next
			}
			throw new Error('unrecognized lua: ' + script.slice(0, 60))
		},
		__store: store,
	}
	return redis
}

type FakeRedis = ReturnType<typeof makeFakeRedis>

// ─── Test helpers ─────────────────────────────────────────────────────────

function makeLogger() {
	const logs: string[] = []
	const errors: Array<{msg: string; err?: unknown}> = []
	return {
		log: (msg: string) => logs.push(msg),
		error: (msg: string, err?: unknown) => errors.push({msg, err}),
		__logs: logs,
		__errors: errors,
	}
}

function writeAgentFile(
	dir: string,
	name: string,
	overrides: Partial<{
		schedule: string
		model: string
		enabled: boolean
		max_turns: number
		max_budget_usd: number
		body: string
	}> = {},
): string {
	const schedule = overrides.schedule ?? '0 3 * * *'
	const model = overrides.model ?? 'claude-haiku-4-5'
	const enabled = overrides.enabled === undefined ? true : overrides.enabled
	const maxTurns = overrides.max_turns ?? 3
	const maxBudgetUsd = overrides.max_budget_usd ?? 0.5
	const body = overrides.body ?? `# ${name}\n\nDo a thing.\n`
	const md = `---
name: ${name}
schedule: "${schedule}"
model: ${model}
max_turns: ${maxTurns}
max_budget_usd: ${maxBudgetUsd}
enabled: ${enabled}
---
${body}
`
	const filePath = path.join(dir, `${name}.md`)
	writeFileSync(filePath, md, 'utf8')
	return filePath
}

// Synthetic SDK message stream — emits `init` then `result` and ends.
function makeSdkStub(opts: {totalCostUsd: number; result: string; turns?: number}) {
	const calls: Array<{prompt: string; options: any}> = []
	const fn = (req: {prompt: string; options: any}) => {
		calls.push(req)
		async function* gen() {
			yield {type: 'system', subtype: 'init', model: req.options.model}
			yield {
				type: 'result',
				total_cost_usd: opts.totalCostUsd,
				result: opts.result,
				num_turns: opts.turns ?? 1,
			}
		}
		return gen()
	}
	return Object.assign(fn, {calls})
}

function makeThrowingSdkStub(message: string) {
	const calls: Array<{prompt: string; options: any}> = []
	const fn = (req: {prompt: string; options: any}) => {
		calls.push(req)
		// Throw synchronously to mimic an SDK auth/setup failure before
		// any AsyncIterable is produced — runAgent catches this in the
		// outer try/catch, NOT inside the for-await loop.
		throw new Error(message)
	}
	return Object.assign(fn, {calls})
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('AutonomousScheduler — Phase 164-02 Task 2', () => {
	let vaultPath: string
	let agentsDir: string
	let redis: FakeRedis
	let logger: ReturnType<typeof makeLogger>
	let inboxCalls: InboxEntryInput[]
	let inboxStub: (
		input: InboxEntryInput,
	) => Promise<WriteInboxResult>

	beforeEach(() => {
		vaultPath = mkdtempSync(path.join(tmpdir(), 'autosched-test-'))
		agentsDir = path.join(vaultPath, 'livos-agents')
		mkdirSync(agentsDir, {recursive: true})
		redis = makeFakeRedis()
		logger = makeLogger()
		inboxCalls = []
		inboxStub = async (input) => {
			inboxCalls.push(input)
			return {written: true, path: '/fake/inbox/entry.md'}
		}
	})

	afterEach(() => {
		rmSync(vaultPath, {recursive: true, force: true})
	})

	// Test 1 ────────────────────────────────────────────────────────────────
	it('Test 1 (no-op when autonomous_enabled unset): zero cron tasks', async () => {
		writeAgentFile(agentsDir, 'demo', {enabled: true})
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await scheduler.start()
		expect(scheduler.taskCount).toBe(0)
		// Some "disabled" log emitted
		expect(logger.__logs.some((l) => l.includes('disabled'))).toBe(true)
		await scheduler.stop()
	})

	// Test 2 ────────────────────────────────────────────────────────────────
	it('Test 2 (enabled flag + all defs enabled:false): zero cron tasks', async () => {
		await redis.set('liv:config:autonomous_enabled', 'true')
		writeAgentFile(agentsDir, 'a', {enabled: false})
		writeAgentFile(agentsDir, 'b', {enabled: false})
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await scheduler.start()
		expect(scheduler.taskCount).toBe(0)
		await scheduler.stop()
	})

	// Test 3 ────────────────────────────────────────────────────────────────
	it('Test 3 (one enabled def): one cron task; stop() unregisters', async () => {
		await redis.set('liv:config:autonomous_enabled', 'true')
		writeAgentFile(agentsDir, 'active-one', {enabled: true})
		writeAgentFile(agentsDir, 'sleeper', {enabled: false})
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await scheduler.start()
		expect(scheduler.taskCount).toBe(1)
		await scheduler.stop()
		expect(scheduler.taskCount).toBe(0)
	})

	// Test 4 ────────────────────────────────────────────────────────────────
	it('Test 4 (partial parse failure): valid agents register; broken file logged', async () => {
		await redis.set('liv:config:autonomous_enabled', 'true')
		writeAgentFile(agentsDir, 'good-a', {enabled: true})
		writeAgentFile(agentsDir, 'good-b', {enabled: true})
		// Broken: missing frontmatter
		writeFileSync(
			path.join(agentsDir, 'broken.md'),
			'no frontmatter here\n',
			'utf8',
		)
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await scheduler.start()
		expect(scheduler.taskCount).toBe(2)
		expect(
			logger.__errors.some((e) => e.msg.includes('parse error')),
		).toBe(true)
		await scheduler.stop()
	})

	// Test 5 ────────────────────────────────────────────────────────────────
	it('Test 5 (runNow happy path): SDK stub invoked + spend incremented + active decremented + inbox written', async () => {
		writeAgentFile(agentsDir, 'happy', {enabled: true, body: '# happy\n\nProbe'})
		const sdkStub = makeSdkStub({totalCostUsd: 0.42, result: 'mock body'})

		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
			queryImpl: sdkStub as any,
			inboxWriterImpl: inboxStub,
		})

		// Need a registered definition for runNow.
		const def: AgentDefinition = {
			name: 'happy',
			schedule: '0 3 * * *',
			model: 'claude-haiku-4-5',
			maxTurns: 2,
			maxBudgetUsd: 0.5,
			allowedTools: ['Read'],
			mcpServers: [],
			enabled: true,
			body: '# happy\n\nProbe\n',
			sourcePath: path.join(agentsDir, 'happy.md'),
		}
		scheduler.registerDefinition(def)

		const res = await scheduler.runNow('happy')
		expect(res.ok).toBe(true)

		// SDK called once
		expect(sdkStub.calls.length).toBe(1)
		// Spawn-block contract: cwd=vaultPath, settingSources=['project']
		expect(sdkStub.calls[0].options.cwd).toBe(vaultPath)
		expect(sdkStub.calls[0].options.settingSources).toEqual(['project'])
		expect(sdkStub.calls[0].options.permissionMode).toBe('acceptEdits')
		expect(sdkStub.calls[0].options.persistSession).toBe(false)
		expect(sdkStub.calls[0].options.env.HOME).toBe('/root')

		// Daily spend incremented to 42 cents
		const dateKey = new Date().toISOString().slice(0, 10)
		const spend = await redis.get(
			`liv:autonomous:daily_spend_cents:${dateKey}`,
		)
		expect(Number(spend)).toBe(42)

		// active_count decremented back to 0
		expect(await redis.get('liv:autonomous:active_count')).toBe('0')

		// Inbox entry written with status='success'
		expect(inboxCalls.length).toBe(1)
		expect(inboxCalls[0].agent).toBe('happy')
		expect(inboxCalls[0].status).toBe('success')
		expect(inboxCalls[0].body).toBe('mock body')
		expect(inboxCalls[0].costUsd).toBe(0.42)
	})

	// Test 6 ────────────────────────────────────────────────────────────────
	it('Test 6 (runNow concurrent cap reject): no SDK call, no inbox flood', async () => {
		// Cap=1 active=1 — next spawn over the wall.
		await redis.set('liv:config:autonomous_max_concurrent', '1')
		await redis.set('liv:autonomous:active_count', '1')

		const sdkStub = makeSdkStub({totalCostUsd: 0, result: ''})
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
			queryImpl: sdkStub as any,
			inboxWriterImpl: inboxStub,
		})
		const def: AgentDefinition = {
			name: 'rejected',
			schedule: '0 3 * * *',
			model: 'claude-haiku-4-5',
			maxTurns: 1,
			maxBudgetUsd: 0.1,
			allowedTools: [],
			mcpServers: [],
			enabled: true,
			body: 'noop',
			sourcePath: path.join(agentsDir, 'rejected.md'),
		}
		scheduler.registerDefinition(def)

		await scheduler.runNow('rejected')
		expect(sdkStub.calls.length).toBe(0)
		expect(inboxCalls.length).toBe(0)
		// Cap rollback intact: still 1
		expect(await redis.get('liv:autonomous:active_count')).toBe('1')
	})

	// Test 7 ────────────────────────────────────────────────────────────────
	it('Test 7 (runNow daily budget reject): no SDK call, no inbox entry, no spend INCRBY', async () => {
		await redis.set('liv:config:autonomous_daily_budget', '100')
		const dateKey = new Date().toISOString().slice(0, 10)
		await redis.set(`liv:autonomous:daily_spend_cents:${dateKey}`, '100')

		const sdkStub = makeSdkStub({totalCostUsd: 0, result: ''})
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
			queryImpl: sdkStub as any,
			inboxWriterImpl: inboxStub,
		})
		const def: AgentDefinition = {
			name: 'budget-bust',
			schedule: '0 3 * * *',
			model: 'claude-haiku-4-5',
			maxTurns: 1,
			maxBudgetUsd: 0.1,
			allowedTools: [],
			mcpServers: [],
			enabled: true,
			body: 'noop',
			sourcePath: path.join(agentsDir, 'budget-bust.md'),
		}
		scheduler.registerDefinition(def)

		await scheduler.runNow('budget-bust')
		expect(sdkStub.calls.length).toBe(0)
		expect(inboxCalls.length).toBe(0)
		// active_count was never incremented (daily gate fires before
		// concurrent gate)
		expect(await redis.get('liv:autonomous:active_count')).toBeNull()
		// Spend counter unchanged
		expect(
			await redis.get(`liv:autonomous:daily_spend_cents:${dateKey}`),
		).toBe('100')
	})

	// Test 8 ────────────────────────────────────────────────────────────────
	it("Test 8 (SDK throws): inbox status='error', active_count decremented (no leak)", async () => {
		const sdkStub = makeThrowingSdkStub('boom: subscription expired')
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
			queryImpl: sdkStub as any,
			inboxWriterImpl: inboxStub,
		})
		const def: AgentDefinition = {
			name: 'thrower',
			schedule: '0 3 * * *',
			model: 'claude-haiku-4-5',
			maxTurns: 1,
			maxBudgetUsd: 0.1,
			allowedTools: [],
			mcpServers: [],
			enabled: true,
			body: 'whatever',
			sourcePath: path.join(agentsDir, 'thrower.md'),
		}
		scheduler.registerDefinition(def)

		await scheduler.runNow('thrower')

		// Inbox entry with status='error' and body explains the failure
		expect(inboxCalls.length).toBe(1)
		expect(inboxCalls[0].status).toBe('error')
		expect(inboxCalls[0].body).toContain('Agent execution failed')
		expect(inboxCalls[0].body).toContain('boom: subscription expired')

		// active_count back to 0 — no leak
		expect(await redis.get('liv:autonomous:active_count')).toBe('0')
	})

	// Test 9 ────────────────────────────────────────────────────────────────
	it('Test 9 (active_count decrements via try/finally even when iterator aborts)', async () => {
		// Iterator that yields init then THROWS — runAgent must still hit
		// the finally block to decrement.
		const calls: any[] = []
		const sdkStub = (req: any) => {
			calls.push(req)
			async function* gen() {
				yield {type: 'system', subtype: 'init', model: req.options.model}
				throw new Error('mid-stream auth failure')
			}
			return gen()
		}

		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
			queryImpl: sdkStub as any,
			inboxWriterImpl: inboxStub,
		})
		const def: AgentDefinition = {
			name: 'mid-thrower',
			schedule: '0 3 * * *',
			model: 'claude-haiku-4-5',
			maxTurns: 1,
			maxBudgetUsd: 0.1,
			allowedTools: [],
			mcpServers: [],
			enabled: true,
			body: 'noop',
			sourcePath: path.join(agentsDir, 'mid-thrower.md'),
		}
		scheduler.registerDefinition(def)

		await scheduler.runNow('mid-thrower')
		expect(calls.length).toBe(1)
		expect(await redis.get('liv:autonomous:active_count')).toBe('0')
		expect(inboxCalls.length).toBe(1)
		expect(inboxCalls[0].status).toBe('error')
	})

	// Test 10 ───────────────────────────────────────────────────────────────
	it('Test 10 (registerDefinition): makes def available to runNow without affecting taskCount', async () => {
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
			queryImpl: makeSdkStub({totalCostUsd: 0, result: ''}) as any,
			inboxWriterImpl: inboxStub,
		})
		expect(scheduler.taskCount).toBe(0)
		const def: AgentDefinition = {
			name: 'cli-only',
			schedule: '0 3 * * *',
			model: 'claude-haiku-4-5',
			maxTurns: 1,
			maxBudgetUsd: 0.1,
			allowedTools: [],
			mcpServers: [],
			enabled: true,
			body: 'noop',
			sourcePath: '/fake/cli-only.md',
		}
		scheduler.registerDefinition(def)
		// registerDefinition does NOT register a cron task
		expect(scheduler.taskCount).toBe(0)
		// But runNow CAN find it
		const res = await scheduler.runNow('cli-only')
		expect(res.ok).toBe(true)
	})

	// Edge — unknown agent in runNow returns ok:false
	it('runNow with unknown agent name returns ok:false', async () => {
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		const res = await scheduler.runNow('never-registered')
		expect(res.ok).toBe(false)
		expect(res.reason).toMatch(/unknown agent/)
	})

	// ── Phase 165-02 Task 1 — listDefinitions / getEnabledNames / setAgentEnabled ──

	// Test 165-02-1 ──────────────────────────────────────────────────
	it('165-02-T1 (listDefinitions empty before start): returns []', async () => {
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		expect(scheduler.listDefinitions()).toEqual([])
		expect(scheduler.getEnabledNames()).toEqual([])
	})

	// Test 165-02-2 ──────────────────────────────────────────────────
	it('165-02-T2 (listDefinitions/getEnabledNames after start): returns parsed defs; enabled set excludes disabled', async () => {
		await redis.set('liv:config:autonomous_enabled', 'true')
		writeAgentFile(agentsDir, 'enabled-one', {enabled: true})
		writeAgentFile(agentsDir, 'disabled-one', {enabled: false})
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await scheduler.start()
		// listDefinitions returns ONLY the enabled defs (the disabled ones
		// are skipped at start() and never added to `definitions`).
		const defs = scheduler.listDefinitions()
		const names = defs.map((d) => d.name)
		expect(names).toContain('enabled-one')
		// getEnabledNames mirrors task registration — only enabled
		expect(scheduler.getEnabledNames()).toEqual(['enabled-one'])
		await scheduler.stop()
	})

	// Test 165-02-3 ──────────────────────────────────────────────────
	it('165-02-T3 (setAgentEnabled flips frontmatter on disk; other fields byte-identical)', async () => {
		const filePath = writeAgentFile(agentsDir, 'flipper', {
			enabled: false,
			model: 'claude-haiku-4-5',
			schedule: '*/5 * * * *',
		})
		const originalContent = readFileSync(filePath, 'utf8')

		await redis.set('liv:config:autonomous_enabled', 'true')
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await scheduler.start()
		// Disabled def is NOT in definitions map post-start (parser skips); use
		// registerDefinition to put it in so setAgentEnabled can find it.
		const parser = await import('./agent-definition-parser.js')
		const parseRes = parser.parseAgentDefinition(originalContent, filePath)
		expect(parseRes.ok).toBe(true)
		if (parseRes.ok) scheduler.registerDefinition(parseRes.definition)

		await scheduler.setAgentEnabled('flipper', true)
		const rewritten = readFileSync(filePath, 'utf8')
		expect(rewritten).toContain('enabled: true')
		expect(rewritten).not.toContain('enabled: false')
		// model + schedule lines unchanged
		expect(rewritten).toContain('model: claude-haiku-4-5')
		expect(rewritten).toContain('schedule: "*/5 * * * *"')
		await scheduler.stop()
	})

	// Test 165-02-4 ──────────────────────────────────────────────────
	it('165-02-T4 (setAgentEnabled true registers cron task; taskCount increments)', async () => {
		const filePath = writeAgentFile(agentsDir, 'enabler', {enabled: false})
		await redis.set('liv:config:autonomous_enabled', 'true')
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await scheduler.start()
		const parser = await import('./agent-definition-parser.js')
		const parseRes = parser.parseAgentDefinition(
			readFileSync(filePath, 'utf8'),
			filePath,
		)
		if (parseRes.ok) scheduler.registerDefinition(parseRes.definition)

		const before = scheduler.taskCount
		await scheduler.setAgentEnabled('enabler', true)
		expect(scheduler.taskCount).toBe(before + 1)
		expect(scheduler.getEnabledNames()).toContain('enabler')
		await scheduler.stop()
	})

	// Test 165-02-5 ──────────────────────────────────────────────────
	it('165-02-T5 (setAgentEnabled false stops + removes cron task; taskCount decrements)', async () => {
		writeAgentFile(agentsDir, 'disabler', {enabled: true})
		await redis.set('liv:config:autonomous_enabled', 'true')
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await scheduler.start()
		expect(scheduler.taskCount).toBe(1)
		expect(scheduler.getEnabledNames()).toContain('disabler')

		await scheduler.setAgentEnabled('disabler', false)
		expect(scheduler.taskCount).toBe(0)
		expect(scheduler.getEnabledNames()).not.toContain('disabler')
		await scheduler.stop()
	})

	// Test 165-02-6 ──────────────────────────────────────────────────
	it('165-02-T6 (setAgentEnabled unknown agent throws)', async () => {
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await expect(
			scheduler.setAgentEnabled('does-not-exist', true),
		).rejects.toThrow(/unknown agent/)
	})

	// Test 165-02-7 ──────────────────────────────────────────────────
	it('165-02-T7 (setAgentEnabled inserts enabled: line when missing from frontmatter)', async () => {
		// Hand-craft a frontmatter without `enabled:` line
		const filePath = path.join(agentsDir, 'no-enabled-line.md')
		writeFileSync(
			filePath,
			`---
name: no-enabled-line
schedule: "0 3 * * *"
model: claude-haiku-4-5
max_turns: 3
max_budget_usd: 0.5
---
# noop
`,
			'utf8',
		)
		// Parse + register manually (since enabled defaults to true via DEFAULT_ENABLED,
		// the parser will mark it enabled).
		const parser = await import('./agent-definition-parser.js')
		const parseRes = parser.parseAgentDefinition(
			readFileSync(filePath, 'utf8'),
			filePath,
		)
		expect(parseRes.ok).toBe(true)
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		if (parseRes.ok) scheduler.registerDefinition(parseRes.definition)

		// First call (true) — no task yet because we never started, so
		// currentlyEnabled === false; flip to true → registerTask
		await scheduler.setAgentEnabled('no-enabled-line', true)
		const rewritten = readFileSync(filePath, 'utf8')
		// `enabled: true` is now part of the frontmatter
		expect(rewritten).toMatch(/^enabled: true$/m)
		// closing --- still present
		const closing = rewritten.split('\n').filter((l) => l.trim() === '---')
		expect(closing.length).toBe(2)
		await scheduler.stop()
	})

	// Test 165-02-8 ──────────────────────────────────────────────────
	it('165-02-T8 (setAgentEnabled is no-op when state matches current: no write)', async () => {
		const filePath = writeAgentFile(agentsDir, 'idempotent', {enabled: true})
		await redis.set('liv:config:autonomous_enabled', 'true')
		const scheduler = new AutonomousScheduler({
			redis: redis as any,
			vaultPath,
			logger,
		})
		await scheduler.start()
		expect(scheduler.getEnabledNames()).toContain('idempotent')

		const fs = await import('node:fs')
		const statBefore = fs.statSync(filePath)

		// Already enabled — should be no-op
		await scheduler.setAgentEnabled('idempotent', true)

		const statAfter = fs.statSync(filePath)
		// mtime preserved (no write occurred)
		expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs)
		// taskCount unchanged
		expect(scheduler.taskCount).toBe(1)
		await scheduler.stop()
	})
})
