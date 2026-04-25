// Phase 28 Plan 28-02 — Activity Timeline shared types (DOC-14).
//
// Three independent server-side shapes (DockerEvent, ScheduledJob, AiAlert)
// converge into ONE unified ActivityEvent shape that every UI surface in
// /routes/docker/activity/ consumes — filter chips, row component, hook.
//
// Order matters in ACTIVITY_SOURCES + ACTIVITY_SEVERITIES — those drive the
// chip render order in ActivityFilters. Don't reorder without coordinating.
//
// SEVERITY COLLAPSE: AiAlert ships severity as 'info' | 'warning' | 'critical'
// (verbatim from the AI provider). Activity Timeline normalizes those to
// 'info' | 'warn' | 'error' so a single severity-chip filter works across
// all three sources. The collapse mapping lives in mapAiAlert (event-mappers).

export const ACTIVITY_SOURCES = ['docker', 'scheduler', 'ai'] as const
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number]

export const ACTIVITY_SEVERITIES = ['info', 'warn', 'error'] as const
export type ActivitySeverity = (typeof ACTIVITY_SEVERITIES)[number]

/**
 * Subtype within a source. Drives click-through routing in
 * activity-section.tsx and the small zinc subtype-badge in activity-row.tsx.
 *
 *   docker subtypes: 'container' | 'image' | 'network' | 'volume' | 'daemon'
 *   scheduler:       'job'
 *   ai:              'ai-alert'
 */
export type ActivitySourceType =
	| 'container'
	| 'image'
	| 'network'
	| 'volume'
	| 'daemon'
	| 'job'
	| 'ai-alert'

export interface ActivityEvent {
	/** Deterministic dedup key. Stable React row key. */
	id: string
	source: ActivitySource
	severity: ActivitySeverity
	/** ms epoch — DockerEvent.time (seconds) is multiplied by 1000 in the mapper. */
	timestamp: number
	title: string
	body: string
	sourceType: ActivitySourceType
	/** Container name | job id | image id | network id | volume name. Used by click handlers. */
	sourceId: string
	envId: string | null
}
