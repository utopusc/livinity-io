// Phase 25 Plan 25-01 — Pure formatters for the EnvCard recent-events list.
//
// Three exports + one verb-map constant. No side effects, no side imports —
// these run inside React render bodies and inside the format-events.unit.test
// suite (jsdom-but-pure). Tests live in the adjacent format-events.unit.test.ts
// (16 cases lock down the verb table + timestamp boundaries + slice math).
//
// EVENT_VERB_MAP covers the docker action lexicon documented in livinityd's
// types.ts:216 (DockerEvent.action). Unknown actions echo verbatim — never
// throw — so a daemon emitting a future Docker version's action shows the raw
// string rather than crashing the card.

/** Past-tense human strings for the docker event verbs we render. */
export const EVENT_VERB_MAP: Record<string, string> = {
	// container lifecycle
	start: 'started',
	stop: 'stopped',
	restart: 'restarted',
	die: 'died',
	kill: 'killed',
	create: 'created',
	destroy: 'destroyed',
	remove: 'removed',
	pause: 'paused',
	unpause: 'unpaused',
	rename: 'renamed',
	// image lifecycle
	pull: 'pulled',
	push: 'pushed',
	import: 'imported',
	tag: 'tagged',
	untag: 'untagged',
	// network/volume lifecycle
	connect: 'connected',
	disconnect: 'disconnected',
	mount: 'mounted',
	unmount: 'unmounted',
	// exec
	exec_create: 'exec created',
	exec_start: 'exec started',
	exec_die: 'exec exited',
}

/**
 * Returns a past-tense human verb for a docker event action. Unmapped actions
 * are echoed verbatim (defensive — Docker can introduce new actions in any
 * minor release; we'd rather show 'oom_kill' raw than crash).
 */
export function formatEventVerb(action: string): string {
	return EVENT_VERB_MAP[action] ?? action
}

/**
 * Bucket a docker event's unix-second timestamp to a human relative string.
 *   - delta < 60s        → 'just now'
 *   - delta < 60min      → 'Nm ago'
 *   - delta < 24h        → 'Nh ago'
 *   - delta >= 24h       → 'Nd ago'
 *
 * `now` is injectable so the unit tests can pin time without mocking Date.
 */
export function formatEventTimestamp(unixSeconds: number, now: number = Date.now()): string {
	const deltaMs = now - unixSeconds * 1000
	const seconds = Math.floor(deltaMs / 1000)
	if (seconds < 60) return 'just now'
	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`
	const hours = Math.floor(minutes / 60)
	if (hours < 24) return `${hours}h ago`
	const days = Math.floor(hours / 24)
	return `${days}d ago`
}

/**
 * Sort by `time` descending and slice to the first `limit` entries. Returns
 * a new array — does not mutate the input. Used by EnvCard to render the
 * 'last 8 events' list from the server's already-filtered event slice.
 */
export function takeLastEvents<T extends {time: number}>(events: T[], limit: number): T[] {
	if (events.length === 0) return []
	return events
		.slice() // defensive copy — never mutate caller-owned arrays
		.sort((a, b) => b.time - a.time)
		.slice(0, limit)
}
