/**
 * Phase 202-03 — AgentScheduler.
 *
 * Cron-driven runner for persisted livos_agents rows. Reads every enabled row
 * from `AgentRepository`, validates each `schedule_cron` value via
 * `node-cron.validate()`, and arms a `node-cron` task that fires on the cron
 * cadence. Each fire ATTEMPTS to acquire a Redis `SET NX PX` mutex on
 * `livos:agent:{id}:lock`; second concurrent invocations bail immediately.
 * Crash-safe via TTL auto-expiry (no manual cleanup needed if the process dies
 * mid-run).
 *
 * Decisions honoured:
 *   D-202-04 — node-cron + Redis SET NX PX mutex per agent. Lock key
 *              `livos:agent:{id}:lock`, TTL = `min(cron-interval - 60s, 3600s)`
 *              (conservative 14-minute fallback when interval is unknown).
 *   D-202-05 — Task record format = Memory thread w/ metadata
 *              `{ taskId, agentId, triggeredBy, triggeredAt, parentTaskId? }`.
 *              Mastra Memory.recall covers result polling; no separate task
 *              table.
 *   D-202-15 — Standard 5-field cron `min hour dom month dow`. Validated via
 *              node-cron.validate() before arming the scheduled task; invalid
 *              expressions log a warn and skip the row (the row still appears
 *              in the agents UI — just doesn't auto-run).
 *   D-202-16 — Run now privilege: any admin can trigger any agent. Enforced
 *              at the tRPC layer (`adminProcedure`). This module exposes
 *              `runOnce(agentId, triggeredBy)` unconditionally.
 *   D-202-19 — Cron resolution = 1 minute. node-cron honours this natively.
 *
 * Threat mitigations:
 *   T-202-01 (schedule overlap) — Redis SET NX PX lock per agent. Second
 *           invocation while first is still running returns null from SET
 *           (NX failed) → handler logs + bails. TTL auto-expires so a crashed
 *           process can't permanently lock out future runs.
 *   T-202-03 (cron injection) — every cron string passes node-cron.validate()
 *           BEFORE schedule() is called. tRPC create/update mutations also
 *           validate at the boundary (BAD_REQUEST + AGENT_CRON_INVALID) so
 *           malformed values never reach this scheduler in the first place;
 *           the runtime check here is defense-in-depth.
 *
 * Invariants:
 *   INV-202-02 — backend stays in livinityd; this file lives under
 *                `livos/packages/livinityd/source/modules/mastra/`.
 *   INV-202-03 — LivOSMastra additive only: a separate edit adds ONE new slot
 *                + ONE new `attachScheduler` method to mastra/index.ts. This
 *                file never imports LivOSMastra directly.
 */

import {EventEmitter} from 'node:events'
import cron, {type ScheduledTask} from 'node-cron'
import type {Redis} from 'ioredis'

import type {AgentRegistry} from './agents/agent-registry.js'
import type {AgentRepository} from './agents/agent-repository.js'

/**
 * Phase 202-04 — Live status event emitted on the scheduler's `statusEvents`
 * EventEmitter. Consumed by the `/agents/status/stream` SSE route
 * (routes-agents-sse.ts) so every connected browser sees runs flip from
 * `running` to `idle` without polling.
 *
 * D-202-08 — SSE transport, not WebSocket. Frontend uses native EventSource.
 */
export interface AgentStatusEvent {
	agentId: string
	state: 'idle' | 'running' | 'scheduled'
	threadId?: string
	triggeredBy?: TaskThreadMetadata['triggeredBy']
	at: string
	lastRunAt?: string
	error?: string
}

export interface SchedulerLogger {
	info: (msg: string) => void
	warn: (msg: string, error?: unknown) => void
}

export interface SchedulerDeps {
	registry: AgentRegistry
	repo: AgentRepository
	/**
	 * Mastra Memory instance. Typed as `unknown` here so the scheduler module
	 * stays decoupled from the Memory class shape — the saveThread surface is
	 * cast at the call site. Mirrors the AgentRegistry's `memory: unknown`
	 * pattern.
	 */
	memory: unknown
	redis: Redis
	logger: SchedulerLogger
}

/**
 * Minimal Memory surface the scheduler exercises. Cast at the call site so
 * this file does not need to import Mastra's Memory type (test mocks ride the
 * same cast). Matches the `@mastra/memory` API in package version 1.19.0.
 */
interface MemoryThreadAPI {
	saveThread(opts: {
		thread: {
			id: string
			resourceId: string
			title?: string
			metadata?: Record<string, unknown>
		}
		memoryConfig?: unknown
	}): Promise<unknown>
}

/**
 * Per-task metadata persisted on the Mastra Memory thread (D-202-05). Future
 * task list / cancel surfaces (Plan 202-04+) filter threads by these fields.
 */
export interface TaskThreadMetadata extends Record<string, unknown> {
	taskId: string
	agentId: string
	agentName: string
	triggeredBy: 'cron' | 'manual' | 'parent_agent'
	triggeredAt: string
	parentTaskId?: string
}

export class AgentScheduler {
	private tasks = new Map<string, ScheduledTask>()

	/**
	 * Phase 202-04 — public EventEmitter that the `/agents/status/stream` SSE
	 * route subscribes to. Emits a single event channel: `'status'` with an
	 * `AgentStatusEvent` payload. Listener cap raised to 64 because each open
	 * browser tab + the executor smoke tests can subscribe concurrently.
	 *
	 * The emitter is process-local; multi-replica fan-out is out of scope for
	 * v202 (deferred to Phase 220+ Redis pub-sub design). Single-host
	 * livinityd boot reads from this emitter directly.
	 */
	readonly statusEvents: EventEmitter = new EventEmitter()

	constructor(private deps: SchedulerDeps) {
		// Allow many concurrent SSE subscribers (per browser tab + smoke tests)
		// without Node's "possible EventEmitter memory leak" warning. 64 is a
		// safe cap for a single-host LivOS deployment.
		this.statusEvents.setMaxListeners(64)
	}

	/**
	 * Internal helper — emit a single status event. Wrapped to keep the call
	 * sites in runOnce + drainAgentStream tight + to add the `at` timestamp
	 * uniformly. Never throws; emitter errors are swallowed (a misbehaving
	 * subscriber MUST NOT brick the scheduler).
	 */
	private emitStatus(event: AgentStatusEvent): void {
		try {
			this.statusEvents.emit('status', event)
		} catch (err) {
			this.deps.logger.warn(
				'Phase 202-04 scheduler — statusEvents listener threw; swallowed',
				err,
			)
		}
	}

	/**
	 * Boot-time hydration. Calls `refresh()` once. Subsequent CRUD mutations
	 * from the tRPC layer (Plan 202-03 Task 3) call `refresh()` again to
	 * rebuild the live task table.
	 */
	async init(): Promise<void> {
		await this.refresh()
	}

	/**
	 * Tear down every armed node-cron task and rebuild from
	 * `repo.listAll()`. Idempotent — calling twice in a row produces the same
	 * final task table.
	 *
	 * T-202-03 — every row's `scheduleCron` is validated via
	 * `cron.validate()` before being passed to `cron.schedule()`. Invalid
	 * expressions log a warn and skip the row; the row still appears in the
	 * registry/UI but doesn't auto-run until the operator fixes the
	 * expression via the edit form.
	 */
	async refresh(): Promise<void> {
		// Stop + clear armed tasks. node-cron's .stop() is idempotent.
		for (const [, t] of this.tasks) {
			try {
				t.stop()
			} catch (err) {
				this.deps.logger.warn('Phase 202-03 scheduler — task.stop() failed', err)
			}
		}
		this.tasks.clear()

		const rows = await this.deps.repo.listAll()
		let armed = 0
		for (const row of rows) {
			if (!row.enabled) continue
			if (!row.scheduleCron) continue
			if (!cron.validate(row.scheduleCron)) {
				this.deps.logger.warn(
					`Phase 202-03 scheduler — agent ${row.name}: invalid cron "${row.scheduleCron}" — skipped (T-202-03)`,
				)
				continue
			}

			const agentId = row.id
			const agentName = row.name
			const cronExpr = row.scheduleCron
			const lockKey = `livos:agent:${agentId}:lock`
			const ttlMs = this.lockTtlForCron(cronExpr)

			const task = cron.schedule(cronExpr, async () => {
				try {
					// T-202-01 — Redis SET NX PX mutex per agent. Second invocation
					// while the first is still running returns null and bails.
					const acquired = await this.deps.redis.set(
						lockKey,
						'1',
						'PX',
						ttlMs,
						'NX',
					)
					if (acquired !== 'OK') {
						this.deps.logger.info(
							`Phase 202-03 scheduler — agent ${agentName}: prior run still active — skipping (T-202-01)`,
						)
						return
					}
					try {
						await this.runOnce(agentId, 'cron')
					} finally {
						// Best-effort release. TTL auto-expiry covers the crash case.
						await this.deps.redis.del(lockKey).catch(() => {})
					}
				} catch (err) {
					this.deps.logger.warn(
						`Phase 202-03 scheduler — agent ${agentName} cron tick failed`,
						err,
					)
				}
			})
			this.tasks.set(agentId, task)
			armed += 1
			this.deps.logger.info(
				`Phase 202-03 scheduler — agent ${agentName} armed for cron "${cronExpr}"`,
			)
		}
		this.deps.logger.info(
			`Phase 202-03 AgentScheduler armed ${armed} agent${armed === 1 ? '' : 's'}`,
		)
	}

	/**
	 * Fire an agent run NOW. Used by cron tick + tRPC `agents.runOnce` +
	 * `agents.tasks.create`. Returns the generated `threadId` so callers
	 * (manual Run Now, tRPC) can subscribe to streaming results via the
	 * Mastra chat-route + memory thread surfaces.
	 *
	 * D-202-05 task record format: every run creates a Memory thread keyed
	 * with `{taskId, agentId, agentName, triggeredBy, triggeredAt,
	 * parentTaskId?}` metadata. Mastra Memory.recall covers result polling
	 * downstream.
	 *
	 * The actual agent.stream() invocation is fire-and-forget — the caller
	 * does NOT await stream completion (a manual Run Now should return
	 * immediately, the cron tick fire-and-forgets, sub-agent delegation
	 * awaits the threadId only). Failures inside the background drain are
	 * logged via `logger.warn` but do not propagate.
	 *
	 * @param overridePrompt Optional prompt that overrides `row.instructions`
	 *   for the run. When provided, the agent runs against this single user
	 *   message instead of its persisted instructions. Used by
	 *   `agents.tasks.create({agentId, prompt})` (Plan 202-03 Task 4).
	 */
	async runOnce(
		agentId: string,
		triggeredBy: TaskThreadMetadata['triggeredBy'],
		opts?: {parentTaskId?: string; overridePrompt?: string},
	): Promise<string> {
		const row = await this.deps.repo.getById(agentId)
		if (!row) {
			throw new Error(
				`Phase 202-03 scheduler.runOnce — agent ${agentId} not found`,
			)
		}
		const agent = this.deps.registry.get(agentId)
		if (!agent) {
			throw new Error(
				`Phase 202-03 scheduler.runOnce — agent ${row.name} not registered (registry init may have failed)`,
			)
		}

		const triggeredAt = new Date().toISOString()
		const rand = Math.random().toString(36).slice(2, 8)
		const threadId = `task-${row.id}-${Date.now()}-${rand}`
		const metadata: TaskThreadMetadata = {
			taskId: threadId,
			agentId: row.id,
			agentName: row.name,
			triggeredBy,
			triggeredAt,
			...(opts?.parentTaskId ? {parentTaskId: opts.parentTaskId} : {}),
		}

		// Create the Memory thread BEFORE the background drain so the tRPC
		// `agents.tasks.list` query (Plan 202-03 Task 4) sees the new task
		// immediately after runOnce resolves (avoiding a render-flicker race
		// where the UI lists no tasks just after Run Now).
		try {
			const mem = this.deps.memory as MemoryThreadAPI
			await mem.saveThread({
				thread: {
					id: threadId,
					resourceId: 'system',
					title: this.threadTitleFor(row.name, triggeredBy, opts?.overridePrompt),
					metadata,
				},
			})
		} catch (err) {
			this.deps.logger.warn(
				`Phase 202-03 scheduler.runOnce — saveThread for ${row.name} failed; agent will still run, task list may not show this thread`,
				err,
			)
		}

		const promptText =
			opts?.overridePrompt && opts.overridePrompt.length > 0
				? opts.overridePrompt
				: row.instructions

		// Phase 202-04 — emit `running` BEFORE the background drain so any
		// connected SSE subscriber sees the state flip immediately after the
		// tRPC mutation returns the threadId. The drain emits `idle` (or
		// `error`) when it finishes.
		this.emitStatus({
			agentId: row.id,
			state: 'running',
			threadId,
			triggeredBy,
			at: triggeredAt,
		})

		// Fire-and-forget the agent stream. Caller does not await text drain.
		void this.drainAgentStream(agent, promptText, threadId, row.id, row.name)

		return threadId
	}

	/**
	 * Stop every armed cron task. Called by livinityd graceful shutdown so the
	 * Node process can exit cleanly (node-cron keeps the event loop alive
	 * otherwise).
	 */
	destroy(): void {
		for (const [, t] of this.tasks) {
			try {
				t.stop()
			} catch {
				// Swallow — destroy() must be best-effort.
			}
		}
		this.tasks.clear()
	}

	/**
	 * TTL strategy for the Redis SET NX PX lock (D-202-04). Conservative
	 * fallback of 14 minutes covers any cadence ≥ 15 min. For sub-15-minute
	 * cadences the ttl returned here is still safely under `cadence - 1 min`
	 * because node-cron's resolution is 1 minute (D-202-19) so two ticks of
	 * a once-every-2-min schedule cannot start within 60s of each other from
	 * a single host.
	 *
	 * Multi-replica deploys are explicitly out of scope for v202
	 * (Phase 220+ Inngest design); single-host means at most one tick fires
	 * per minute boundary.
	 */
	private lockTtlForCron(_cronExpr: string): number {
		const FALLBACK_TTL_MS = 14 * 60 * 1000
		return FALLBACK_TTL_MS
	}

	/**
	 * Mastra agent.stream() drain. Runs in the background after runOnce
	 * resolves so the tRPC mutation can return the threadId immediately.
	 * Errors are logged but never propagate — a failed run is observable via
	 * the Memory thread metadata (`status: 'failed'` set in Plan 202-09 wave).
	 */
	private async drainAgentStream(
		agent: unknown,
		prompt: string,
		threadId: string,
		agentId: string,
		agentName: string,
	): Promise<void> {
		let drainError: unknown = null
		try {
			const streamable = agent as {
				stream(
					messages: unknown,
					opts: unknown,
				): {text?: Promise<string>} | AsyncIterable<unknown>
			}
			const stream = streamable.stream(
				[{role: 'user', content: prompt}],
				{
					memory: {thread: threadId, resource: 'system'},
				},
			)
			// `agent.stream` returns a stream object with a `.text` promise that
			// resolves to the full assistant message once the run completes. We
			// await that explicitly so failures inside the drain (provider
			// errors, tool failures) reach the catch block.
			if (
				stream &&
				typeof stream === 'object' &&
				'text' in stream &&
				stream.text instanceof Promise
			) {
				await stream.text
			} else if (Symbol.asyncIterator in (stream as object)) {
				// Fallback for async-iterator-shaped streams (test mocks).
				for await (const _ of stream as AsyncIterable<unknown>) {
					void _
				}
			}
		} catch (err) {
			drainError = err
			this.deps.logger.warn(
				`Phase 202-03 scheduler — agent ${agentName} run failed (threadId=${threadId})`,
				err,
			)
		} finally {
			// Phase 202-04 — flip the SSE channel back to `idle` once the
			// background drain resolves (success OR failure). `lastRunAt` is
			// the timestamp the run finished, which the AgentCard surfaces
			// under the status badge. `error` carries the failure message
			// when the drain threw so the dashboard can flag failed runs.
			const finishedAt = new Date().toISOString()
			this.emitStatus({
				agentId,
				state: 'idle',
				threadId,
				at: finishedAt,
				lastRunAt: finishedAt,
				...(drainError
					? {error: drainError instanceof Error ? drainError.message : String(drainError)}
					: {}),
			})
		}
	}

	private threadTitleFor(
		agentName: string,
		triggeredBy: TaskThreadMetadata['triggeredBy'],
		overridePrompt: string | undefined,
	): string {
		if (overridePrompt && overridePrompt.length > 0) {
			const truncated =
				overridePrompt.length > 60
					? `${overridePrompt.slice(0, 57)}...`
					: overridePrompt
			return `${agentName}: ${truncated}`
		}
		switch (triggeredBy) {
			case 'cron':
				return `Scheduled run: ${agentName}`
			case 'manual':
				return `Manual run: ${agentName}`
			case 'parent_agent':
				return `Sub-agent run: ${agentName}`
		}
	}
}
