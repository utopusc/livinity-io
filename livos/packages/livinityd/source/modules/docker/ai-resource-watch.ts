// Phase 23 (AID-02) — proactive AI resource-pressure watcher.
//
// Runs as a built-in scheduler job (default schedule: every 5 minutes,
// default enabled=false). For every running container on the local
// socket, it computes:
//
//   - memoryPercent       (subtract cache from usage, divide by limit)
//   - throttledTimeDelta  (current throttled_time - last seen, in nanoseconds)
//   - restartCount        (from inspectContainer)
//
// then runs `isThresholdExceeded()` (pure function — see test cases for
// the truth table). If a kind/severity emerges and there isn't already an
// un-dismissed alert for the same (container_name, kind) within the last
// 60 minutes, it asks Kimi for a plain-English projection and persists
// the result to the `ai_alerts` PG table.
//
// Design notes:
//   - The handler runs against the LOCAL socket only. Multi-host watching
//     is deferred to v28 per Plan 22-01 D-06 (docker compose CLI is
//     host-bound; same constraint applies to the cumulative
//     throttled_time delta cache).
//   - The throttle delta cache is process-scoped (Map keyed on container
//     id). On container restart `throttled_time` resets to 0; the delta
//     would go negative, which we clamp to 0 (no false positive).
//   - Per-container errors are isolated. One stuck container can't fail
//     the whole job. Catastrophic errors (Kimi unreachable for the entire
//     run) are returned as `{status: 'failure'}` so the operator sees the
//     red row in the run-history table.
//   - Kimi is called at tier 'sonnet' with maxTokens 512 — projection
//     messages are short (one paragraph), no need for opus.

import Dockerode from 'dockerode'

import {listContainers, inspectContainer, getContainerLogs} from './docker.js'
import {callKimi, redactSecrets} from './ai-diagnostics.js'
import {findRecentAlertByKind, insertAiAlert, type AiAlertKind} from './ai-alerts.js'
import type {BuiltInJobHandler, JobRunResult} from '../scheduler/types.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEMORY_CRITICAL_PCT = 95
const MEMORY_WARNING_PCT = 80
const RESTART_LOOP_THRESHOLD = 3
const DEDUPE_WINDOW_MINUTES = 60
const LOG_TAIL_LINES = 50
const KIMI_TIER = 'sonnet' as const
const KIMI_MAX_TOKENS = 512

const RESOURCE_WATCH_SYSTEM_PROMPT =
	'You are a proactive Docker resource alert assistant. The user gives you JSON describing a container that just crossed a resource threshold (memory >80% or CPU throttling or restart loop). Project what will happen if no action is taken. Use this exact format (one paragraph total, max 60 words):\n\nWill <verb> in approximately <timeframe> unless <action>. Recommended: <one specific command>.\n\nExamples:\n- "Will OOM in approximately 10 minutes unless memory limit increased. Recommended: docker update --memory 2G my-postgres."\n- "Will continue throttling indefinitely unless cpu_quota raised. Recommended: docker update --cpus 2 my-app."'

// ---------------------------------------------------------------------------
// Module-scoped throttled-time cache
// ---------------------------------------------------------------------------
//
// Map<containerId, lastSeenThrottledTimeNanoseconds>. Since the scheduler
// fires every 5 minutes, the delta is the throttled time accrued in the
// last sampling window — any positive value means CPU throttling occurred
// during the window.
//
// On container restart `throttled_time` resets to 0; if currentThrottled
// < lastThrottled we clamp the delta to 0 so a restart doesn't masquerade
// as throttling.

const _throttledTimeCache = new Map<string, number>()

/** Test-only helper to reset the cache between handler invocations. */
export function _resetThrottleCacheForTests(): void {
	_throttledTimeCache.clear()
}

// ---------------------------------------------------------------------------
// Pure threshold logic (testable in isolation)
// ---------------------------------------------------------------------------

export interface ThresholdInput {
	memoryPercent: number
	throttledTimeDelta: number // nanoseconds, clamped >= 0
	restartCount: number
}

export interface ThresholdResult {
	kind: AiAlertKind
	severity: 'warning' | 'critical'
}

/**
 * Apply threshold rules in priority order. Returns null when the
 * container is healthy.
 *
 * Priority (highest first):
 *   1. memoryPercent >= 95           -> {memory-pressure, critical}
 *   2. memoryPercent >= 80           -> {memory-pressure, warning}
 *   3. restartCount >= 3             -> {restart-loop, warning}
 *   4. throttledTimeDelta > 0        -> {cpu-throttle, warning}
 *   else                             -> null
 *
 * Note: there is no critical CPU tier (Docker doesn't expose enough
 * signal to differentiate "occasional throttling" from "constant
 * throttling" reliably in a 5-min window without history). We elevate
 * to critical only when memory is the issue.
 */
export function isThresholdExceeded(input: ThresholdInput): ThresholdResult | null {
	if (input.memoryPercent >= MEMORY_CRITICAL_PCT) {
		return {kind: 'memory-pressure', severity: 'critical'}
	}
	if (input.memoryPercent >= MEMORY_WARNING_PCT) {
		return {kind: 'memory-pressure', severity: 'warning'}
	}
	if (input.restartCount >= RESTART_LOOP_THRESHOLD) {
		return {kind: 'restart-loop', severity: 'warning'}
	}
	if (input.throttledTimeDelta > 0) {
		return {kind: 'cpu-throttle', severity: 'warning'}
	}
	return null
}

// ---------------------------------------------------------------------------
// Raw stats fetch (Dockerode escape hatch — getContainerStats() in docker.ts
// strips throttling_data which we need)
// ---------------------------------------------------------------------------

interface RawStats {
	memory_stats?: {
		usage?: number
		limit?: number
		stats?: {cache?: number}
	}
	cpu_stats?: {
		cpu_usage?: {total_usage?: number; system_cpu_usage?: number; online_cpus?: number}
		system_cpu_usage?: number
		online_cpus?: number
		throttling_data?: {periods?: number; throttled_periods?: number; throttled_time?: number}
	}
	precpu_stats?: {
		cpu_usage?: {total_usage?: number; system_cpu_usage?: number}
		system_cpu_usage?: number
	}
}

async function getRawContainerStats(name: string): Promise<RawStats> {
	// Local socket only — multi-host watching is deferred per Plan 22-01 D-06.
	const docker = new Dockerode()
	const container = docker.getContainer(name)
	const stats = (await container.stats({stream: false})) as unknown as RawStats
	return stats
}

function computeMemoryPercent(stats: RawStats): {pct: number; usageMb: number; limitMb: number} {
	const usage = stats?.memory_stats?.usage ?? 0
	const cache = stats?.memory_stats?.stats?.cache ?? 0
	const limit = stats?.memory_stats?.limit ?? 0
	const adjUsage = Math.max(0, usage - cache)
	const pct = limit > 0 ? Math.round((adjUsage / limit) * 1000) / 10 : 0
	return {
		pct,
		usageMb: Math.round((adjUsage / 1024 / 1024) * 10) / 10,
		limitMb: Math.round((limit / 1024 / 1024) * 10) / 10,
	}
}

function computeCpuPercent(stats: RawStats): number {
	const cpuDelta =
		(stats?.cpu_stats?.cpu_usage?.total_usage ?? 0) -
		(stats?.precpu_stats?.cpu_usage?.total_usage ?? 0)
	const systemDelta =
		(stats?.cpu_stats?.system_cpu_usage ?? 0) -
		(stats?.precpu_stats?.system_cpu_usage ?? 0)
	const numCpus = stats?.cpu_stats?.online_cpus || 1
	if (systemDelta <= 0) return 0
	return Math.round(((cpuDelta / systemDelta) * numCpus * 100) * 100) / 100
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

interface HandlerOutput {
	checked: number
	alertsCreated: number
	alertsSkippedDeduped: number
	errors: number
}

export const aiResourceWatchHandler: BuiltInJobHandler = async (job, ctx) => {
	ctx.logger.log(`[scheduler/ai-resource-watch] running job ${job.name}`)

	let containers: Awaited<ReturnType<typeof listContainers>>
	try {
		// null = local socket; multi-host watching deferred per 22-01 D-06
		containers = await listContainers(null)
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		ctx.logger.error(`[scheduler/ai-resource-watch] listContainers failed`, err)
		return {status: 'failure', error: `listContainers failed: ${msg}`}
	}

	const running = containers.filter((c) => c.state === 'running')
	const output: HandlerOutput = {
		checked: running.length,
		alertsCreated: 0,
		alertsSkippedDeduped: 0,
		errors: 0,
	}

	// If we hit Kimi-unavailable mid-loop, abort the rest of the run rather
	// than spam-retrying for every container. The next 5-min tick will retry.
	let kimiUnavailableAborted = false

	for (const c of running) {
		if (kimiUnavailableAborted) break
		try {
			const rawStats = await getRawContainerStats(c.name)

			// Memory percent
			const mem = computeMemoryPercent(rawStats)

			// Throttle delta — clamp negative (container restart) to 0
			const currentThrottled = rawStats?.cpu_stats?.throttling_data?.throttled_time ?? 0
			const cacheKey = c.id || c.name
			const lastThrottled = _throttledTimeCache.get(cacheKey) ?? currentThrottled
			const rawDelta = currentThrottled - lastThrottled
			const throttledTimeDelta = rawDelta > 0 ? rawDelta : 0
			_throttledTimeCache.set(cacheKey, currentThrottled)

			// Restart count via inspect
			const inspectInfo = await inspectContainer(c.name, null)
			const restartCount = inspectInfo.restartCount ?? 0

			// Threshold check
			const threshold = isThresholdExceeded({
				memoryPercent: mem.pct,
				throttledTimeDelta,
				restartCount,
			})
			if (!threshold) continue

			// Dedupe — skip if we already alerted in the last 60 minutes
			const recent = await findRecentAlertByKind(c.name, threshold.kind, DEDUPE_WINDOW_MINUTES)
			if (recent) {
				output.alertsSkippedDeduped++
				continue
			}

			// Kimi prompt — last 50 lines redacted, plus current numeric stats
			const cpuPercent = computeCpuPercent(rawStats)
			const logs = await getContainerLogs(c.name, LOG_TAIL_LINES, true, null)
			const recentLogs = redactSecrets(logs).slice(-4000)
			const userPayload = JSON.stringify(
				{
					containerName: c.name,
					kind: threshold.kind,
					severity: threshold.severity,
					stats: {
						memoryPercent: mem.pct,
						memoryUsageMb: mem.usageMb,
						memoryLimitMb: mem.limitMb,
						cpuPercent,
						throttledTimeDeltaMs: Math.round(throttledTimeDelta / 1_000_000),
					},
					recentLogs,
					image: c.image,
					restartCount,
				},
				null,
				2,
			)

			let kimi: Awaited<ReturnType<typeof callKimi>>
			try {
				kimi = await callKimi(RESOURCE_WATCH_SYSTEM_PROMPT, userPayload, {
					tier: KIMI_TIER,
					maxTokens: KIMI_MAX_TOKENS,
				})
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err)
				if (msg.includes('[ai-unavailable]')) {
					ctx.logger.error(
						`[scheduler/ai-resource-watch] Kimi unavailable — aborting remainder of run`,
						err,
					)
					kimiUnavailableAborted = true
					break
				}
				// Other Kimi errors: count as per-container error and continue.
				ctx.logger.error(`[scheduler/ai-resource-watch] Kimi error for ${c.name}: ${msg}`, err)
				output.errors++
				continue
			}

			await insertAiAlert({
				containerName: c.name,
				environmentId: null,
				severity: threshold.severity,
				kind: threshold.kind,
				message: kimi.text,
				payloadJson: {
					memoryPercent: mem.pct,
					cpuPercent,
					restartCount,
					throttledTimeDeltaMs: Math.round(throttledTimeDelta / 1_000_000),
					kimiInputTokens: kimi.inputTokens,
					kimiOutputTokens: kimi.outputTokens,
				},
			})
			output.alertsCreated++
			ctx.logger.log(
				`[scheduler/ai-resource-watch] alert created for ${c.name}: ${threshold.kind}/${threshold.severity}`,
			)
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err)
			ctx.logger.error(`[scheduler/ai-resource-watch] ${c.name}: ${msg}`, err)
			output.errors++
		}
	}

	if (kimiUnavailableAborted) {
		const result: JobRunResult = {
			status: 'failure',
			error: 'Kimi provider unavailable — cannot generate projections',
			output,
		}
		return result
	}

	ctx.logger.log(
		`[scheduler/ai-resource-watch] checked ${output.checked}; created ${output.alertsCreated}; deduped ${output.alertsSkippedDeduped}; errors ${output.errors}`,
	)
	return {status: 'success', output}
}
