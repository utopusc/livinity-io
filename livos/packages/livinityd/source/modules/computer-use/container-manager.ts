/**
 * ComputerUseContainerManager — Phase 71 (CU-FOUND-06).
 *
 * Owns Bytebot container lifecycle for every user. Single entry point for:
 * - 71-05 gateway middleware (calls ensureContainer when desktop subdomain is hit)
 * - /computer standalone route tRPC procedures (71-06)
 * - Future P72 BytebotBridge.executeAction (calls bumpActivity per tool execution)
 *
 * Reaper: 5-min interval scans for active tasks idle >30min, stops them.
 *
 * DI seams (constructor `deps`):
 * - apps: Apps — re-uses installForUser/uninstallForUser (NEVER re-implements compose generation)
 * - pool: Pool — pg connection used by 71-03 task-repository (re-exported via database/index.js)
 * - logger: Livinityd['logger'] — child-logged as 'computer-use-container-manager'
 * - dockerInspect?: DockerInspectFn — defaults to execa `docker inspect`; overridden in tests
 *
 * Concurrency: per-user max-1 enforced by 71-03's `computer_use_tasks_user_active_idx`
 * partial unique index. createActiveTask translates 23505 → "already active for user".
 */
import {$} from 'execa'
import type {Pool} from 'pg'

import type Apps from '../apps/apps.js'
import type Livinityd from '../../index.js'
import {
	createActiveTask,
	getActiveTask,
	updateContainerInfo,
	bumpActivity as repoBumpActivity,
	markStopped,
	findIdleCandidates,
	getUserAppInstance,
} from '../database/index.js'

export const IDLE_THRESHOLD_MS = 30 * 60 * 1000 // CU-FOUND-06 — 30 minute idle timeout
export const TICK_INTERVAL_MS = 5 * 60 * 1000 // D-09 — 5-min reaper cadence
export const SPAWN_BUDGET_MS = 15_000 // CU-FOUND-07 — 15s budget

const BYTEBOT_APP_ID = 'bytebot-desktop'
const BYTEBOT_SUBDOMAIN = 'desktop'

export type ContainerStatus = 'running' | 'idle' | 'stopped' | 'absent'

export type EnsureContainerResult = {
	taskId: string
	containerId: string
	port: number
	subdomain: string
}

export type DockerInspectFn = (containerId: string) => Promise<{running: boolean}>

const defaultDockerInspect: DockerInspectFn = async (containerId) => {
	try {
		// Greppable: `docker inspect --format` (T-71-04-01: execa template literal
		// auto-escapes containerId — NOT shell-eval, no command injection).
		const result = await $`docker inspect --format={{.State.Running}} ${containerId}`
		return {running: result.stdout.trim() === 'true'}
	} catch {
		return {running: false}
	}
}

type Deps = {
	apps: Apps
	pool: Pool
	logger: Livinityd['logger']
	dockerInspect?: DockerInspectFn
}

export class ComputerUseContainerManager {
	private apps: Apps
	private pool: Pool
	private logger: Livinityd['logger']
	private dockerInspect: DockerInspectFn
	private intervalHandle: NodeJS.Timeout | null = null

	constructor(deps: Deps) {
		this.apps = deps.apps
		this.pool = deps.pool
		this.logger = deps.logger.createChildLogger('computer-use-container-manager')
		this.dockerInspect = deps.dockerInspect ?? defaultDockerInspect
	}

	/**
	 * Ensures a Bytebot container exists and is running for `userId`.
	 *
	 * Flow:
	 *   1. If active task row exists + dockerInspect(containerId) reports running →
	 *      return cached {taskId, containerId, port, subdomain}.
	 *   2. If active task row exists but container NOT running → restart via
	 *      docker compose pointed at the existing per-user compose path.
	 *   3. If no active row → createActiveTask (max-1 partial unique index race
	 *      handled below) + apps.installForUser('bytebot-desktop', userId) +
	 *      updateContainerInfo with the assigned port/containerName.
	 *
	 * Race-condition retry: if createActiveTask throws "already active" AND
	 * a follow-up getActiveTask still returns null, throw "Bytebot container
	 * state inconsistent" — explicit error rather than infinite loop.
	 *
	 * Time budget: wraps the whole flow in a Promise.race against a 15s timer
	 * (CU-FOUND-07 / ROADMAP P71 success #1). On overrun, rejects with
	 * `Error('Bytebot spawn exceeded 15s budget')`.
	 */
	async ensureContainer(userId: string): Promise<EnsureContainerResult> {
		const work = (async (): Promise<EnsureContainerResult> => {
			const existing = await getActiveTask(this.pool, userId)
			if (existing && existing.containerId) {
				const inspectResult = await this.dockerInspect(existing.containerId)
				if (inspectResult.running) {
					return {
						taskId: existing.id,
						containerId: existing.containerId,
						port: existing.port ?? 0,
						subdomain: BYTEBOT_SUBDOMAIN,
					}
				}
				// Container stopped externally — restart via existing per-user compose.
				const instance = await getUserAppInstance(userId, BYTEBOT_APP_ID)
				if (instance) {
					await $`docker compose --file ${instance.volumePath}/docker-compose.yml --project-name ${BYTEBOT_APP_ID}-user-${userId} up -d`
					return {
						taskId: existing.id,
						containerId: existing.containerId,
						port: existing.port ?? instance.port,
						subdomain: BYTEBOT_SUBDOMAIN,
					}
				}
			}

			// No active task → create one + spawn fresh container.
			let task
			try {
				task = await createActiveTask(this.pool, userId)
			} catch (e: any) {
				if (/already active/.test(e?.message ?? '')) {
					// Race: another caller created it concurrently. Re-fetch once.
					const retried = await getActiveTask(this.pool, userId)
					if (!retried) throw new Error('Bytebot container state inconsistent')
					task = retried
				} else {
					throw e
				}
			}

			// Use existing apps.ts:installForUser path — it handles compose
			// generation, port allocation via allocatePort(), volume setup,
			// docker compose up. We do NOT re-implement that logic.
			await this.apps.installForUser(BYTEBOT_APP_ID, userId)

			// Read back the assigned port + container name.
			const instance = await getUserAppInstance(userId, BYTEBOT_APP_ID)
			if (!instance) throw new Error('Bytebot container state inconsistent')

			await updateContainerInfo(this.pool, task.id, instance.containerName, instance.port)

			return {
				taskId: task.id,
				containerId: instance.containerName,
				port: instance.port,
				subdomain: BYTEBOT_SUBDOMAIN,
			}
		})()

		return Promise.race([
			work,
			new Promise<EnsureContainerResult>((_, reject) =>
				setTimeout(
					() => reject(new Error('Bytebot spawn exceeded 15s budget')),
					SPAWN_BUDGET_MS,
				),
			),
		])
	}

	/**
	 * Stops the user's Bytebot container if any active task exists.
	 * Tolerates the absent-row case (no-op).
	 */
	async stopContainer(userId: string): Promise<void> {
		const task = await getActiveTask(this.pool, userId)
		if (!task) return // no-op for absent

		const instance = await getUserAppInstance(userId, BYTEBOT_APP_ID)
		if (instance) {
			await $`docker compose --file ${instance.volumePath}/docker-compose.yml --project-name ${BYTEBOT_APP_ID}-user-${userId} stop`.catch(
				(e: unknown) => {
					this.logger.error(`docker compose stop failed for user ${userId}`, e as Error)
				},
			)
		}
		await markStopped(this.pool, task.id)
	}

	/**
	 * Returns the live container status for `userId`:
	 *   - 'absent'  — no active task row
	 *   - 'idle'    — task row exists, no containerId yet (or task.status='idle')
	 *   - 'running' — dockerInspect reports running
	 *   - 'stopped' — container exists but not running
	 */
	async getStatus(userId: string): Promise<ContainerStatus> {
		const task = await getActiveTask(this.pool, userId)
		if (!task) return 'absent'
		if (!task.containerId) return 'idle'
		const inspectResult = await this.dockerInspect(task.containerId)
		if (inspectResult.running) return 'running'
		return task.status === 'idle' ? 'idle' : 'stopped'
	}

	/**
	 * Bumps last_activity on the user's active task. Called per
	 * tool-execution by P72 BytebotBridge so the idle reaper sees fresh
	 * activity timestamps.
	 */
	async bumpActivity(userId: string): Promise<void> {
		await repoBumpActivity(this.pool, userId)
	}

	/**
	 * Idle reaper tick: stops every container whose last_activity is older
	 * than IDLE_THRESHOLD_MS. Errors are caught and logged — never thrown
	 * to the interval (otherwise unhandled rejections would crash livinityd).
	 */
	async tickIdleTimeouts(): Promise<void> {
		try {
			const candidates = await findIdleCandidates(this.pool, IDLE_THRESHOLD_MS)
			for (const task of candidates) {
				this.logger.log(
					`Stopping idle bytebot container for user ${task.userId} (last_activity=${task.lastActivity.toISOString()})`,
				)
				await this.stopContainer(task.userId).catch((e: unknown) => {
					this.logger.error(
						`tickIdleTimeouts: stopContainer failed for user ${task.userId}`,
						e as Error,
					)
				})
			}
		} catch (e) {
			this.logger.error('tickIdleTimeouts iteration failed', e as Error)
		}
	}

	/**
	 * Boots the 5-min reaper interval. Idempotent — second call no-ops.
	 * Called by livinityd startup (71-05 wires this in).
	 */
	start(): void {
		if (this.intervalHandle) return
		this.intervalHandle = setInterval(() => {
			this.tickIdleTimeouts().catch((e: unknown) => {
				this.logger.error('tickIdleTimeouts interval', e as Error)
			})
		}, TICK_INTERVAL_MS)
	}

	/**
	 * Clears the reaper interval — called on graceful shutdown.
	 */
	stop(): void {
		if (this.intervalHandle) {
			clearInterval(this.intervalHandle)
			this.intervalHandle = null
		}
	}
}
