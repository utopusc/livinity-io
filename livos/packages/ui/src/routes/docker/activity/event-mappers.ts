// Phase 28 Plan 28-02 — pure mappers + merge/sort helper (DOC-14).
//
// Three pure functions translate three server-side shapes into ActivityEvent:
//   - DockerEvent  → mapDockerEvent  (returns ActivityEvent)
//   - ScheduledJob → mapScheduledJob (returns ActivityEvent | null)
//   - AiAlert      → mapAiAlert      (returns ActivityEvent)
// Plus mergeAndSort: concat all, dedup by id, sort DESC by timestamp, cap 500.
//
// Local input types mirror upstream verbatim (livinityd/source/modules/...);
// duplicated here so this module doesn't pull livinityd into UI tsconfig.
// Field types match the originals exactly — verified against:
//   - docker/types.ts             → DockerEvent
//   - scheduler/types.ts          → ScheduledJob, JobRunStatus
//   - docker/ai-alerts.ts         → AiAlert, AiAlertSeverity, AiAlertKind

import type {ActivityEvent, ActivitySeverity} from './activity-types'

// ---------------------------------------------------------------------------
// Input shapes — verbatim from server
// ---------------------------------------------------------------------------

export interface DockerEventInput {
	type: string
	action: string
	actor: string
	actorId: string
	time: number // unix SECONDS
	attributes: Record<string, string>
}

/**
 * NOTE: lastRun / nextRun / createdAt / updatedAt are typed as `Date | string`
 * because tRPC serializes Date → ISO string over the wire. The hook receives
 * strings; unit tests pass Date objects directly. mapScheduledJob accepts
 * either via a small inline normalizer.
 */
export interface ScheduledJobInput {
	id: string
	name: string
	schedule: string
	type: string // JobType union — but we accept any string; the mapper doesn't branch on it
	config: Record<string, unknown>
	enabled: boolean
	lastRun: Date | string | null
	lastRunStatus: 'success' | 'failure' | 'skipped' | 'running' | null
	lastRunError: string | null
	lastRunOutput?: unknown | null
	nextRun: Date | string | null
	createdAt: Date | string
	updatedAt: Date | string
}

export interface AiAlertInput {
	id: string
	containerName: string
	environmentId: string | null
	severity: 'info' | 'warning' | 'critical'
	kind: 'memory-pressure' | 'cpu-throttle' | 'restart-loop' | 'disk-pressure' | 'other'
	message: string
	payloadJson: Record<string, unknown>
	createdAt: string
	dismissedAt: string | null
}

// ---------------------------------------------------------------------------
// mapDockerEvent
// ---------------------------------------------------------------------------

/**
 * Closed lists — Docker's actual action verb set is finite (~30 verbs across
 * container/image/network/volume/daemon types). Anything not in these sets
 * defaults to 'info'. Per-bucket sets keep the lookup O(1).
 */
const DOCKER_ERROR_VERBS = new Set(['die', 'oom', 'kill', 'destroy'])
const DOCKER_WARN_VERBS = new Set(['stop', 'pause', 'unhealthy'])
// 'kill' lives in error-verbs (a kill is a forced terminate; severity=error).
// 'stop' is intentional (severity=warn). Documented in <behavior>.

function classifyDockerSeverity(action: string): ActivitySeverity {
	if (DOCKER_ERROR_VERBS.has(action)) return 'error'
	if (DOCKER_WARN_VERBS.has(action)) return 'warn'
	return 'info'
}

function dockerTitle(e: DockerEventInput): string {
	if (e.type === 'container') {
		// Use a friendly past-tense for the most common verbs; fall through to
		// generic "Container <action>: <actor>" for everything else.
		const friendly: Record<string, string> = {
			start: 'started',
			stop: 'stopped',
			create: 'created',
			destroy: 'destroyed',
			restart: 'restarted',
			pause: 'paused',
			unpause: 'unpaused',
			die: 'died',
			oom: 'OOM-killed',
			kill: 'killed',
			rename: 'renamed',
		}
		const verb = friendly[e.action] ?? e.action
		return `Container ${verb}: ${e.actor}`
	}
	// For image / network / volume / daemon: '<Type> <action>: <actor>'.
	const typeCased = e.type.charAt(0).toUpperCase() + e.type.slice(1)
	return `${typeCased} ${e.action}: ${e.actor}`
}

function dockerSourceType(type: string): ActivityEvent['sourceType'] {
	if (type === 'container') return 'container'
	if (type === 'image') return 'image'
	if (type === 'network') return 'network'
	if (type === 'volume') return 'volume'
	if (type === 'daemon') return 'daemon'
	// Unknown docker event type — surface under 'daemon' (catch-all). Server
	// shouldn't emit these, but the mapper stays total.
	return 'daemon'
}

export function mapDockerEvent(e: DockerEventInput, envId: string): ActivityEvent {
	return {
		id: `docker:${e.actorId}:${e.time}:${e.action}`,
		source: 'docker',
		severity: classifyDockerSeverity(e.action),
		timestamp: e.time * 1000,
		title: dockerTitle(e),
		body: '',
		sourceType: dockerSourceType(e.type),
		sourceId: e.actor,
		envId,
	}
}

// ---------------------------------------------------------------------------
// mapScheduledJob
// ---------------------------------------------------------------------------

const JOB_BODY_MAX = 200

export function mapScheduledJob(job: ScheduledJobInput): ActivityEvent | null {
	if (!job.lastRun || !job.lastRunStatus) return null
	if (job.lastRunStatus === 'running') return null

	// tRPC serializes Date → ISO string over the wire; unit tests pass Date.
	// Normalize either form to a ms epoch.
	const ts = job.lastRun instanceof Date ? job.lastRun.getTime() : Date.parse(job.lastRun)
	const id = `scheduler:${job.id}:${ts}`

	const base = {
		id,
		source: 'scheduler' as const,
		timestamp: ts,
		body: '',
		sourceType: 'job' as const,
		sourceId: job.id,
		envId: null,
	}

	if (job.lastRunStatus === 'success') {
		return {
			...base,
			severity: 'info',
			title: `Job succeeded: ${job.name}`,
		}
	}
	if (job.lastRunStatus === 'skipped') {
		return {
			...base,
			severity: 'warn',
			title: `Job skipped: ${job.name}`,
		}
	}
	// failure
	const errBody = (job.lastRunError ?? '').slice(0, JOB_BODY_MAX)
	return {
		...base,
		severity: 'error',
		title: `Job failed: ${job.name}`,
		body: errBody,
	}
}

// ---------------------------------------------------------------------------
// mapAiAlert
// ---------------------------------------------------------------------------

function collapseAiSeverity(s: AiAlertInput['severity']): ActivitySeverity {
	if (s === 'critical') return 'error'
	if (s === 'warning') return 'warn'
	return 'info'
}

export function mapAiAlert(a: AiAlertInput): ActivityEvent {
	return {
		id: `ai:${a.id}`,
		source: 'ai',
		severity: collapseAiSeverity(a.severity),
		timestamp: Date.parse(a.createdAt),
		title: `AI alert: ${a.kind}`,
		body: a.message,
		sourceType: 'ai-alert',
		sourceId: a.containerName,
		envId: a.environmentId,
	}
}

// ---------------------------------------------------------------------------
// mergeAndSort
// ---------------------------------------------------------------------------

/** Cap on the unified timeline. Older history lives in per-resource views. */
export const ACTIVITY_FEED_MAX = 500

/**
 * Concatenate the input arrays, deduplicate by id (last write wins), then
 * sort by timestamp DESC and cap at ACTIVITY_FEED_MAX (500). Stable sort —
 * equal timestamps preserve input array order (predictable click-through
 * targets in busy 1s windows).
 */
export function mergeAndSort(...arrays: ActivityEvent[][]): ActivityEvent[] {
	// Dedup: keep insertion order via Map. Last write wins per id.
	const byId = new Map<string, ActivityEvent>()
	let order = 0
	const orderById = new Map<string, number>()
	for (const arr of arrays) {
		for (const ev of arr) {
			byId.set(ev.id, ev)
			if (!orderById.has(ev.id)) orderById.set(ev.id, order++)
		}
	}

	// Sort DESC by timestamp; equal timestamps fall back to original
	// insertion order (the Map preserves insertion order across overwrites,
	// so .values() is already in stable order — but Array.prototype.sort is
	// only guaranteed stable in modern engines; we make the tie-break
	// explicit by remembering the first-seen insertion index).
	const all = Array.from(byId.values())
	all.sort((a, b) => {
		if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp
		return (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0)
	})

	if (all.length > ACTIVITY_FEED_MAX) all.length = ACTIVITY_FEED_MAX
	return all
}
