// Phase 28 Plan 28-02 — useActivityFeed (DOC-14).
//
// Composes three existing tRPC queries (no new server routes) and runs the
// pure mappers from Task 1 to produce a single descending ActivityEvent
// stream for the Activity Timeline section.
//
// Three queries — all polling at 5s (matches CONTEXT.md decision; staleTime
// 2.5s = half-interval, mirrors Plan 25-01 D-01 precedent so React Query
// flips cached→fresh state ~once per cycle without thrashing):
//   - docker.dockerEvents     — env-scoped via input.environmentId
//   - scheduler.listJobs      — global by design (scheduler manages local
//                               backups/prunes; not env-aware)
//   - docker.listAiAlerts     — NOT env-scoped at the route (Phase 23 returns
//                               all alerts to admin). We filter client-side
//                               below: keep alerts where environmentId ===
//                               selected envId OR environmentId === null.
//                               This is the T-28-09 mitigation — server-side
//                               scoping is Phase 30+.
//
// Mapping logic is exhaustively unit-tested in event-mappers.unit.test.ts;
// this hook is the orchestration shim — same waiver pattern as Plan 24-02
// D-12 / Plan 25-01 Task 3 / Plan 28-01 Task 3 (presentation/composition
// files don't get their own tests; the helpers underneath do).

import {useMemo} from 'react'

import {useSelectedEnvironmentId} from '@/stores/environment-store'
import {trpcReact} from '@/trpc/trpc'

import type {ActivityEvent} from './activity-types'
import {
	type AiAlertInput,
	type DockerEventInput,
	type ScheduledJobInput,
	mapAiAlert,
	mapDockerEvent,
	mapScheduledJob,
	mergeAndSort,
} from './event-mappers'

const POLL_INTERVAL_MS = 5_000
const STALE_TIME_MS = 2_500

/** Look back 1 hour for docker events; older history lives elsewhere. */
const DOCKER_EVENTS_LOOKBACK_SEC = 3_600

/** Cap matches Phase 23 listAiAlerts max (z.number().int().min(1).max(200)). */
const AI_ALERTS_LIMIT = 200

export interface UseActivityFeedResult {
	/** Merged + DESC-sorted feed, capped at 500 rows by mergeAndSort. */
	events: ActivityEvent[]
	/** True until ANY of the three initial queries resolves. */
	isLoading: boolean
	/** True if ANY query errored on its latest tick. */
	isError: boolean
	/** Diagnostics — viewer can render a subtle banner if any source failed. */
	errorMessages: string[]
}

export function useActivityFeed(): UseActivityFeedResult {
	const envId = useSelectedEnvironmentId()

	const eventsQuery = trpcReact.docker.dockerEvents.useQuery(
		{
			environmentId: envId,
			since: Math.floor(Date.now() / 1000) - DOCKER_EVENTS_LOOKBACK_SEC,
		},
		{
			refetchInterval: POLL_INTERVAL_MS,
			staleTime: STALE_TIME_MS,
			retry: false,
		},
	)

	const jobsQuery = trpcReact.scheduler.listJobs.useQuery(undefined, {
		refetchInterval: POLL_INTERVAL_MS,
		staleTime: STALE_TIME_MS,
		retry: false,
	})

	const alertsQuery = trpcReact.docker.listAiAlerts.useQuery(
		{limit: AI_ALERTS_LIMIT},
		{
			refetchInterval: POLL_INTERVAL_MS,
			staleTime: STALE_TIME_MS,
			retry: false,
		},
	)

	const events = useMemo<ActivityEvent[]>(() => {
		const dockerOnes = ((eventsQuery.data ?? []) as DockerEventInput[]).map((e) =>
			mapDockerEvent(e, envId),
		)

		const jobOnes = ((jobsQuery.data ?? []) as ScheduledJobInput[]).flatMap((j) => {
			const m = mapScheduledJob(j)
			return m ? [m] : []
		})

		// Cross-env semantics for AI alerts: listAiAlerts is NOT env-scoped on
		// the server (Phase 23 returns ALL alerts to admin). Keep alerts whose
		// environmentId matches the currently selected env, OR is null
		// (legacy / unscoped alerts surface in every env). Server-side env
		// scoping is a Phase 30+ enhancement (T-28-09).
		const filteredAlerts = ((alertsQuery.data ?? []) as AiAlertInput[]).filter(
			(a) => a.environmentId === envId || a.environmentId === null,
		)
		const alertOnes = filteredAlerts.map(mapAiAlert)

		return mergeAndSort(dockerOnes, jobOnes, alertOnes)
	}, [eventsQuery.data, jobsQuery.data, alertsQuery.data, envId])

	const isLoading = eventsQuery.isLoading || jobsQuery.isLoading || alertsQuery.isLoading
	const isError = eventsQuery.isError || jobsQuery.isError || alertsQuery.isError
	const errorMessages: string[] = []
	if (eventsQuery.error) errorMessages.push(`docker events: ${eventsQuery.error.message}`)
	if (jobsQuery.error) errorMessages.push(`scheduler: ${jobsQuery.error.message}`)
	if (alertsQuery.error) errorMessages.push(`ai alerts: ${alertsQuery.error.message}`)

	return {events, isLoading, isError, errorMessages}
}
