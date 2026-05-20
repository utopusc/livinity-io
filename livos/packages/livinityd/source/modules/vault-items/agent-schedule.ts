// Phase 177-01 — per-Agent cron schedule registry.
// ADDITIVE to Phase 164 autonomous-scheduler — scheduler.ts NOT touched.
// Reads AgentItem.schedule (Phase 171 types) and registers node-cron tasks.
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.
// vault-items/index.ts barrel is sacred — exports flow through
// autonomous-scheduler/index.ts instead (additive re-export block appended there).

import * as cron from 'node-cron'
import type {ItemStore} from './item-store.js'

export interface BootSweepResult {
	registered: number
	skipped: number
}

/**
 * Registry wrapping a Map of agentId → node-cron ScheduledTask.
 * Passed by caller to keep functions pure and easily testable.
 */
export class AgentScheduleRegistry {
	readonly tasks = new Map<string, cron.ScheduledTask>()
}

/**
 * Schedule a cron task for the given agent.
 * Validates the cron expression first; stops any existing task for the same
 * agentId before re-registering (idempotent update).
 */
export function scheduleAgent(
	agentId: string,
	cronExpr: string,
	callback: () => void,
	registry: AgentScheduleRegistry,
): {ok: true} | {ok: false; reason: 'invalid_cron'} {
	if (!cron.validate(cronExpr)) {
		return {ok: false, reason: 'invalid_cron'}
	}
	// Idempotent: stop existing task before re-registering
	const existing = registry.tasks.get(agentId)
	if (existing) {
		try {
			existing.stop()
		} catch {
			/* swallow — best-effort cleanup */
		}
	}
	const task = cron.schedule(cronExpr, callback)
	registry.tasks.set(agentId, task)
	return {ok: true}
}

/**
 * Stop and remove the cron task for the given agent.
 * Returns {ok: false, reason: 'not_found'} when no task is registered.
 */
export function unscheduleAgent(
	agentId: string,
	registry: AgentScheduleRegistry,
): {ok: true} | {ok: false; reason: 'not_found'} {
	const task = registry.tasks.get(agentId)
	if (!task) return {ok: false, reason: 'not_found'}
	try {
		task.stop()
	} catch {
		/* swallow */
	}
	registry.tasks.delete(agentId)
	return {ok: true}
}

/**
 * Walk all active Items in the store, register cron tasks for AgentItems
 * that carry a non-empty `schedule` field.
 *
 * @param store     ItemStore instance (vault-items/item-store.ts)
 * @param registry  AgentScheduleRegistry to populate
 * @param runFn     Injected callback invoked when cron fires — Plan 177-02
 *                  wires the real AgentRunner.runAgent here; tests pass vi.fn().
 * @returns         {registered, skipped} counts
 */
export async function bootSweepAgentSchedules(
	store: ItemStore,
	registry: AgentScheduleRegistry,
	runFn: (agentId: string) => void,
): Promise<BootSweepResult> {
	const items = await store.list({archived: false})
	let registered = 0
	let skipped = 0
	for (const item of items) {
		if (item.type !== 'agent') {
			skipped++
			continue
		}
		const schedule = item.schedule
		if (!schedule || schedule.trim() === '') {
			skipped++
			continue
		}
		const result = scheduleAgent(item.id, schedule, () => runFn(item.id), registry)
		if (result.ok) {
			registered++
		} else {
			// Invalid cron string — skip this agent (T-177-01-02 DoS mitigation)
			skipped++
		}
	}
	return {registered, skipped}
}
