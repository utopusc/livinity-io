// Phase 20 — Scheduler runner
//
// Owns the node-cron task registry, the in-flight mutex, and the run-and-record
// loop. Lifecycle is driven by Livinityd.start()/stop() — start() seeds default
// jobs, loads enabled rows, and registers cron tasks; stop() unregisters every
// task. reload() and runNow() are reserved for the Plan 20-02 admin tRPC routes.

import * as cron from 'node-cron'

import {BUILT_IN_HANDLERS} from './jobs.js'
import {getJob, listEnabledJobs, recordRunResult, seedDefaults} from './store.js'
import type {ScheduledJob, SchedulerLogger} from './types.js'

interface CreateLoggerLike extends SchedulerLogger {
	createChildLogger: (name: string) => CreateLoggerLike
}

export default class Scheduler {
	private logger: CreateLoggerLike
	private tasks = new Map<string, cron.ScheduledTask>()
	private inFlight = new Set<string>() // job IDs currently running (mutex)
	private started = false

	constructor({logger}: {logger: CreateLoggerLike}) {
		this.logger = logger.createChildLogger('scheduler')
	}

	async start(): Promise<void> {
		if (this.started) return
		try {
			// 1. Seed default jobs (idempotent — ON CONFLICT (name) DO NOTHING)
			await seedDefaults()

			// 2. Load every enabled row + register a cron task for each
			const jobs = await listEnabledJobs()
			for (const job of jobs) {
				this.registerTask(job)
			}
			this.started = true
			this.logger.log(`Scheduler started — ${this.tasks.size} job(s) registered`)
		} catch (err) {
			// Non-fatal: livinityd continues without scheduler rather than crashing.
			this.logger.error('Scheduler failed to start', err)
		}
	}

	async stop(): Promise<void> {
		for (const [, task] of this.tasks) {
			try {
				task.stop()
			} catch (err) {
				this.logger.error('Failed to stop cron task', err)
			}
		}
		this.tasks.clear()
		this.started = false
		this.logger.log('Scheduler stopped')
	}

	/**
	 * Re-read DB and re-register all tasks. Called after upsert/delete from
	 * tRPC routes (Plan 20-02 will wire these).
	 */
	async reload(): Promise<void> {
		await this.stop()
		await this.start()
	}

	/**
	 * Trigger a job immediately, bypassing schedule. Used by `runNow` tRPC route
	 * (Plan 20-02). Bypasses cron entirely — feeds straight into runJob().
	 */
	async runNow(jobId: string): Promise<{success: boolean; message: string}> {
		const job = await getJob(jobId)
		if (!job) return {success: false, message: 'Job not found'}
		await this.runJob(job)
		return {success: true, message: `Job ${job.name} executed`}
	}

	private registerTask(job: ScheduledJob): void {
		if (!cron.validate(job.schedule)) {
			this.logger.error(`Invalid cron schedule for job ${job.name}: ${job.schedule}`)
			return
		}
		const task = cron.schedule(job.schedule, () => {
			this.runJob(job).catch((err) =>
				this.logger.error(`Job ${job.name} unhandled error`, err),
			)
		})
		this.tasks.set(job.id, task)
	}

	private async runJob(job: ScheduledJob): Promise<void> {
		// Mutex: drop concurrent firings while a previous run is still executing
		if (this.inFlight.has(job.id)) {
			this.logger.log(`Job ${job.name} already running — skipping concurrent fire`)
			return
		}
		this.inFlight.add(job.id)

		try {
			// Re-fetch the row — config / enabled may have changed since registration
			const fresh = await getJob(job.id)
			if (!fresh || !fresh.enabled) return

			await recordRunResult(job.id, {status: 'running'})

			const handler = BUILT_IN_HANDLERS[fresh.type]
			if (!handler) {
				await recordRunResult(job.id, {
					status: 'failure',
					error: `No handler for type ${fresh.type}`,
				})
				return
			}

			try {
				const result = await handler(fresh, {logger: this.logger})
				await recordRunResult(job.id, {
					status: result.status,
					error: result.error ?? null,
					output: result.output ?? null,
				})
				this.logger.log(`Job ${fresh.name} -> ${result.status}`)
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				await recordRunResult(job.id, {status: 'failure', error: msg})
				this.logger.error(`Job ${fresh.name} failed`, err)
			}
		} finally {
			this.inFlight.delete(job.id)
		}
	}
}

export type {Scheduler}
