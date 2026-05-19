// Phase 164-02 Task 2 — AutonomousScheduler runtime.
//
// At boot (after Phase 162-01 vault scaffolder + Phase 162-03 smoke auth
// check) livinityd instantiates this class and calls `.start()`. The flow:
//
//   1. Read Redis flag `liv:config:autonomous_enabled`. If unset/false, the
//      scheduler is a NO-OP — zero cron tasks registered. This is the
//      default — autonomous mode is opt-in via that one Redis key.
//
//   2. Parse every `<vaultPath>/livos-agents/*.md` via Phase 164-01's
//      `parseAgentDefinitionsDir()`. Partial failures are logged but do
//      NOT block the rest of the directory (a single broken YAML file
//      cannot take down the whole scheduler).
//
//   3. For every parse-success def with `enabled: true`, register a
//      `node-cron` task. The cron expression was already validated by
//      the parser (164-01) so this cannot throw at registration time.
//
//   4. Each cron tick fires `runAgent(def)`:
//        a. Per-agent in-flight mutex — overlapping ticks of the SAME
//           agent are dropped (a slow nightly-backup-audit doesn't pile
//           up if the previous one is still running).
//        b. DAILY-budget gate (cheap GET-vs-GET; no Redis write).
//        c. CONCURRENT-cap gate (atomic INCR + GET inside MULTI/EXEC,
//           with DECR rollback on overflow — see budget-gate.ts).
//        d. Spawn `@anthropic-ai/claude-agent-sdk`'s `query()` directly
//           — NOT through liv-core's AgentSessionManager. This separation
//           is intentional: chat sessions are user-driven, multi-turn,
//           surface-aware; autonomous runs are cron-triggered, headless,
//           and global to the vault. Coupling them would force the
//           chat-path code to grow concurrent-cap + cron + inbox
//           writeback concerns that don't belong there. (CONTEXT.md
//           D-V34-G locks this separation.)
//        e. Consume the AsyncIterable, capture `total_cost_usd` +
//           `result` + `num_turns` from the `result` event.
//        f. Decrement active_count + remove from in-flight (try/finally
//           guarantees this even on SDK exception or mid-stream throw).
//        g. INCRBY the daily spend counter (regardless of success/error
//           — even an erroring SDK call may have billed tokens before
//           the throw).
//        h. Write inbox entry via Phase 164-03's `writeInboxEntry`. An
//           inbox write failure is logged but does NOT propagate.
//
// `runNow(name)` is the manual-trigger escape hatch: it bypasses cron
// scheduling but still respects daily + concurrent caps. Used by the
// `livinityd autonomous-trigger <name>` CLI (Task 3) and by future
// Settings-UI "run now" buttons (Phase 165).
//
// `stop()` unregisters every cron task and drains in-flight runs with a
// 30s timeout. Beyond 30s we log the orphan count and proceed — SIGTERM
// from systemd has a hard kill window we cannot exceed.
//
// `registerDefinition(def)` is the CLI bypass for the autonomous_enabled
// flag — see cli-trigger.ts (Task 3) for the manual operator invocation
// path. It loads a def into the in-memory map WITHOUT registering a cron
// task, so a `runNow()` against it works but the def doesn't start
// firing on its schedule.
//
// File-IO scope: this module touches Redis + the SDK + the inbox
// writer. It does NOT mutate `package.json`, `vault-scaffolder.ts`, the
// chat path's `agent-session.ts`, or the Phase 161-02 `agent-prompt-
// builder.ts`. (Sacred guards from 164-02-PLAN.md.)

import * as cron from 'node-cron'
import path from 'node:path'
import type {Redis} from 'ioredis'

import {
	parseAgentDefinitionsDir,
	type AgentDefinition,
} from './agent-definition-parser.js'
import {
	writeInboxEntry as defaultWriteInboxEntry,
	type InboxEntryInput,
	type WriteInboxResult,
} from './inbox-writer.js'
import {
	checkAndIncrementConcurrent,
	decrementConcurrent,
	checkDailyBudget,
	incrementDailySpend,
	dateKeyForUtc,
} from './budget-gate.js'

// ─── Constants ────────────────────────────────────────────────────────────

const REDIS_KEY_ENABLED = 'liv:config:autonomous_enabled'
const DEFAULT_TIMEOUT_PER_TURN_MS = 60_000
const MAX_TIMEOUT_MS = 600_000 // 10min hard cap
const STOP_DRAIN_TIMEOUT_MS = 30_000

// ─── Public types ────────────────────────────────────────────────────────

export type SdkQueryFn = (opts: {
	prompt: string
	options: SdkQueryOptions
}) => AsyncIterable<unknown>

/**
 * Subset of the SDK query() options we set here. Mirrors auth-verifier.ts's
 * SdkQueryOptions but adds the autonomous-specific fields (`mcpServers`,
 * `allowedTools`, `maxTurns`, `maxBudgetUsd`, `permissionMode='acceptEdits'`)
 * locked verbatim by CONTEXT.md lines 82-96.
 */
export interface SdkQueryOptions {
	cwd: string
	settingSources: ['project']
	mcpServers: Record<string, unknown>
	allowedTools: string[]
	maxTurns: number
	maxBudgetUsd: number
	model: string
	permissionMode: 'acceptEdits'
	persistSession: false
	env: Record<string, string | undefined>
}

export interface AutonomousSchedulerLogger {
	log: (msg: string) => void
	error: (msg: string, err?: unknown) => void
}

export interface AutonomousSchedulerOptions {
	redis: Redis
	vaultPath: string
	logger: AutonomousSchedulerLogger
	/** Tests-only injection of the SDK `query()` AsyncIterable factory. */
	queryImpl?: SdkQueryFn
	/** Tests-only injection of the inbox writer (avoids touching the FS). */
	inboxWriterImpl?: (input: InboxEntryInput) => Promise<WriteInboxResult>
}

// ─── AutonomousScheduler ─────────────────────────────────────────────────

export class AutonomousScheduler {
	private redis: Redis
	private vaultPath: string
	private logger: AutonomousSchedulerLogger
	private queryImpl?: SdkQueryFn
	private inboxWriterImpl: (
		input: InboxEntryInput,
	) => Promise<WriteInboxResult>
	private tasks = new Map<string, cron.ScheduledTask>()
	private definitions = new Map<string, AgentDefinition>()
	private inFlight = new Set<string>()
	private started = false

	constructor(opts: AutonomousSchedulerOptions) {
		this.redis = opts.redis
		this.vaultPath = opts.vaultPath
		this.logger = opts.logger
		this.queryImpl = opts.queryImpl
		this.inboxWriterImpl = opts.inboxWriterImpl ?? defaultWriteInboxEntry
	}

	/** Number of registered cron tasks (read-only — for tests + diagnostics). */
	get taskCount(): number {
		return this.tasks.size
	}

	async start(): Promise<void> {
		if (this.started) return
		const flag = await this.redis.get(REDIS_KEY_ENABLED)
		if (flag !== 'true') {
			this.logger.log(
				`[autonomous-scheduler] disabled (${REDIS_KEY_ENABLED}=${flag ?? 'unset'}) — skipping`,
			)
			this.started = true
			return
		}

		const agentsDir = path.join(this.vaultPath, 'livos-agents')
		const parseResult = await parseAgentDefinitionsDir(agentsDir)
		for (const e of parseResult.errors) {
			this.logger.error(
				`[autonomous-scheduler] parse error ${e.path}: ${e.err}`,
			)
		}
		for (const def of parseResult.ok) {
			if (!def.enabled) {
				this.logger.log(
					`[autonomous-scheduler] skipping disabled agent: ${def.name}`,
				)
				continue
			}
			this.definitions.set(def.name, def)
			this.registerTask(def)
		}
		this.started = true
		this.logger.log(
			`[autonomous-scheduler] started — ${this.tasks.size} task(s) registered`,
		)
	}

	async stop(): Promise<void> {
		for (const task of this.tasks.values()) {
			try {
				task.stop()
			} catch (err) {
				this.logger.error('[autonomous-scheduler] stop task', err)
			}
		}
		this.tasks.clear()
		// Wait up to STOP_DRAIN_TIMEOUT_MS for in-flight runs to drain.
		const drainStart = Date.now()
		while (
			this.inFlight.size > 0 &&
			Date.now() - drainStart < STOP_DRAIN_TIMEOUT_MS
		) {
			await new Promise((r) => setTimeout(r, 250))
		}
		if (this.inFlight.size > 0) {
			this.logger.error(
				`[autonomous-scheduler] stop timeout — ${this.inFlight.size} run(s) still active`,
			)
		}
		this.started = false
	}

	/**
	 * Trigger an agent immediately, bypassing the cron schedule. Still
	 * respects daily + concurrent budget caps. Used by `livinityd
	 * autonomous-trigger <name>` (Task 3).
	 */
	async runNow(name: string): Promise<{ok: boolean; reason?: string}> {
		const def = this.definitions.get(name)
		if (!def) {
			return {ok: false, reason: `unknown agent: ${name}`}
		}
		await this.runAgent(def)
		return {ok: true}
	}

	/**
	 * Inject an AgentDefinition into the in-memory map without registering
	 * a cron task. Used by the CLI trigger (Task 3) so an operator can
	 * fire `livinityd autonomous-trigger <name>` even when
	 * `liv:config:autonomous_enabled` is false. The cli-trigger.ts
	 * documents this as an explicit operator action (T-164-02-06 accepted
	 * trade-off).
	 */
	registerDefinition(def: AgentDefinition): void {
		this.definitions.set(def.name, def)
	}

	private registerTask(def: AgentDefinition): void {
		const task = cron.schedule(def.schedule, () => {
			this.runAgent(def).catch((err) =>
				this.logger.error(
					`[autonomous-scheduler] runAgent ${def.name}`,
					err,
				),
			)
		})
		this.tasks.set(def.name, task)
	}

	private async runAgent(def: AgentDefinition): Promise<void> {
		// Per-agent mutex — overlapping ticks of the SAME agent drop.
		if (this.inFlight.has(def.name)) {
			this.logger.log(
				`[autonomous-scheduler] ${def.name} already in flight — skipping tick`,
			)
			return
		}

		// (1) Daily budget gate — cheap GET-vs-GET (no Redis writes).
		// Fires FIRST so a runaway day cannot waste concurrent slots on
		// agents that will instantly bounce.
		const startedAt = new Date()
		const dateKey = dateKeyForUtc(startedAt)
		const dailyGate = await checkDailyBudget(this.redis, dateKey)
		if (!dailyGate.allowed) {
			this.logger.log(
				`[autonomous-scheduler] ${def.name} blocked: ${dailyGate.reason}`,
			)
			return // No inbox flood when budget is full (plan Test 7 contract).
		}

		// (2) Concurrent cap gate — atomic INCR + GET + DECR rollback.
		const concurrentGate = await checkAndIncrementConcurrent(this.redis)
		if (!concurrentGate.allowed) {
			this.logger.log(
				`[autonomous-scheduler] ${def.name} blocked: ${concurrentGate.reason}`,
			)
			return // No inbox flood on cap reject either.
		}

		this.inFlight.add(def.name)
		let totalCostUsd = 0
		let resultText = ''
		let turns = 0
		let status: 'success' | 'error' | 'budget_exceeded' = 'success'

		// Per-run timeout — proportional to maxTurns but hard-capped at
		// MAX_TIMEOUT_MS (10min). Tracked here for symmetry — actual abort
		// would require an AbortController plumbed into the SDK, which is
		// deferred to Phase 165 polish. For v34 ship the timeout exists as
		// a budget signal for the logger.
		const timeoutMs = Math.min(
			def.maxTurns * DEFAULT_TIMEOUT_PER_TURN_MS,
			MAX_TIMEOUT_MS,
		)
		const timeoutHandle = setTimeout(() => {
			this.logger.error(
				`[autonomous-scheduler] ${def.name} run exceeded ${timeoutMs}ms (soft warning — abort not yet plumbed)`,
			)
		}, timeoutMs)

		try {
			// SDK spawn — CONTEXT.md lines 82-96 verbatim contract.
			//
			// Why dynamic-import the SDK? Mirrors auth-verifier.ts (Phase
			// 162-03) — keeps the test surface clean (tests inject
			// `queryImpl` and never trigger the import) and avoids paying
			// the SDK's startup cost on every livinityd boot when
			// autonomous is disabled (the default).
			const q =
				this.queryImpl ??
				((await import('@anthropic-ai/claude-agent-sdk')).query as SdkQueryFn)

			const messages = q({
				prompt: def.body,
				options: {
					cwd: this.vaultPath,
					settingSources: ['project'],
					mcpServers: buildMcpServers(def.mcpServers),
					allowedTools: def.allowedTools,
					maxTurns: def.maxTurns,
					maxBudgetUsd: def.maxBudgetUsd,
					model: def.model,
					permissionMode: 'acceptEdits',
					persistSession: false,
					env: {HOME: '/root', PATH: process.env.PATH},
				},
			})

			for await (const msg of messages as AsyncIterable<any>) {
				if (msg?.type === 'result') {
					totalCostUsd = (msg as any).total_cost_usd ?? 0
					resultText = (msg as any).result ?? ''
					turns = (msg as any).num_turns ?? 0
					break
				}
			}
		} catch (err: any) {
			status = 'error'
			resultText = `Agent execution failed: ${err?.message ?? String(err)}`
			this.logger.error(
				`[autonomous-scheduler] ${def.name}`,
				err,
			)
		} finally {
			clearTimeout(timeoutHandle)
			// CRITICAL: decrement + un-mutex in finally so a mid-stream
			// throw or timeout cannot leak the active_count slot forever.
			await decrementConcurrent(this.redis).catch((err) =>
				this.logger.error(
					`[autonomous-scheduler] decrement leak guard ${def.name}`,
					err,
				),
			)
			this.inFlight.delete(def.name)
		}

		const durationMs = Date.now() - startedAt.getTime()

		// Increment spend FIRST so even if inbox-write fails we keep
		// accounting honest. A NaN/negative cost is clamped to 0 so an
		// upstream SDK quirk cannot corrupt the counter.
		const cents = Number.isFinite(totalCostUsd) && totalCostUsd > 0
			? Math.round(totalCostUsd * 100)
			: 0
		if (cents > 0) {
			await incrementDailySpend(this.redis, dateKey, cents).catch((err) =>
				this.logger.error(
					`[autonomous-scheduler] spend increment ${def.name}`,
					err,
				),
			)
		}

		try {
			await this.inboxWriterImpl({
				vaultPath: this.vaultPath,
				agent: def.name,
				status,
				startedAt,
				durationMs,
				costUsd: totalCostUsd,
				turns,
				model: def.model,
				body: resultText,
				agentSourceRelPath: `livos-agents/${def.name}`,
			})
		} catch (err) {
			this.logger.error(
				`[autonomous-scheduler] inbox-write ${def.name}`,
				err,
			)
		}
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Build the SDK `mcpServers` map from the agent definition's MCP server
 * names. For v34 the autonomous agents inherit MCP servers from the
 * vault's `.claude/mcp.json` (created by Phase 162-01's vault scaffolder)
 * via `settingSources: ['project']` — so this returns an empty
 * programmatic map. Names from the agent definition are accepted but
 * unused — they're reserved for future selective wiring (Phase 165
 * Settings UI may add a per-agent MCP allowlist).
 *
 * Why `Record<string, unknown>` rather than the SDK's exported type? The
 * SDK's mcpServers type pulls in MCP transport types that would force a
 * tighter compile-time coupling; the loose shape here matches what the
 * SDK accepts at runtime (an object map). Same pattern used by
 * auth-verifier.ts's SdkQueryOptions.
 */
function buildMcpServers(names: string[]): Record<string, unknown> {
	void names
	return {}
}
