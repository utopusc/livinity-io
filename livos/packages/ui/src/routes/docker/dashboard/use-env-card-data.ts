// Phase 25 Plan 25-01 — per-env dashboard data composition hook.
//
// Composes 6 tRPC queries scoped to an explicit envId (NOT the global
// useSelectedEnvironmentId — each EnvCard displays its OWN env's metrics
// regardless of which env the rest of the Docker app is currently scoped to).
//
// Polling intervals are fixed per CONTEXT.md decisions / Plan 25-01 constraints:
//   - containers : 5_000ms  — most dynamic; user expectations are 5-7s
//   - events     : 10_000ms — recent activity, less time-critical
//   - images     : 30_000ms — listImages on a 357-image env is expensive
//   - stacks     : 30_000ms — `docker compose ls` shells out, slower
//   - volumes    : 30_000ms — slow-moving
//   - networks   : 30_000ms — slow-moving
//
// `isError` aggregates from containers ONLY: containers being unreachable is
// the canonical 'env down' signal. The other 5 queries may legitimately return
// empty (e.g. a brand-new env has 0 images / 0 stacks) — that's not an error.
//
// Each query's `staleTime` is set to half the refetchInterval so React Query
// doesn't fire a duplicate fetch on tab focus right after the polling tick.

import {useMemo} from 'react'

import {trpcReact, type RouterOutput} from '@/trpc/trpc'

type ContainerInfo = RouterOutput['docker']['listContainers'][number]
type DockerEvent = RouterOutput['docker']['dockerEvents'][number]

export interface EnvCardData {
	containers: ContainerInfo[] | undefined
	imageCount: number | undefined
	stackCount: number | undefined
	volumeCount: number | undefined
	networkCount: number | undefined
	events: DockerEvent[] | undefined
	isError: boolean
	isLoading: boolean
	/**
	 * Refetches all 6 underlying queries in parallel. Called by EnvCard's
	 * Unreachable banner Retry button (Plan 25-02 DOC-04 polish) — scoped to
	 * a single env's queries, NOT the entire grid, so other envs keep
	 * polling normally during the retry.
	 */
	refetch: () => void
}

export function useEnvCardData(envId: string): EnvCardData {
	// Compute the events `since` window once per render — last 1h is the
	// dashboard sweet spot. Rounded to the nearest 10s so the queryKey is
	// stable across the 10s polling tick (otherwise every render = new key).
	const eventsInput = useMemo(() => {
		const now = Math.floor(Date.now() / 1000)
		const since = Math.floor((now - 3600) / 10) * 10
		return {environmentId: envId, since, until: now}
	}, [envId])

	const containersQ = trpcReact.docker.listContainers.useQuery(
		{environmentId: envId},
		{refetchInterval: 5_000, retry: false, staleTime: 2_500},
	)

	const imagesQ = trpcReact.docker.listImages.useQuery(
		{environmentId: envId},
		{refetchInterval: 30_000, retry: false, staleTime: 15_000},
	)

	const stacksQ = trpcReact.docker.listStacks.useQuery(
		{environmentId: envId},
		{refetchInterval: 30_000, retry: false, staleTime: 15_000},
	)

	const volumesQ = trpcReact.docker.listVolumes.useQuery(
		{environmentId: envId},
		{refetchInterval: 30_000, retry: false, staleTime: 15_000},
	)

	const networksQ = trpcReact.docker.listNetworks.useQuery(
		{environmentId: envId},
		{refetchInterval: 30_000, retry: false, staleTime: 15_000},
	)

	const eventsQ = trpcReact.docker.dockerEvents.useQuery(eventsInput, {
		refetchInterval: 10_000,
		retry: false,
		staleTime: 5_000,
	})

	const refetch = () => {
		// Fire all 6 in parallel — fire-and-forget; React Query manages the
		// resulting state on each query independently. Errors on one query
		// don't block the others.
		void containersQ.refetch()
		void imagesQ.refetch()
		void stacksQ.refetch()
		void volumesQ.refetch()
		void networksQ.refetch()
		void eventsQ.refetch()
	}

	return {
		containers: containersQ.data,
		imageCount: imagesQ.data?.length,
		stackCount: stacksQ.data?.length,
		volumeCount: volumesQ.data?.length,
		networkCount: networksQ.data?.length,
		events: eventsQ.data,
		// Containers being unreachable signals env-down. Other counts may
		// legitimately empty out without indicating an error condition.
		isError: containersQ.isError,
		isLoading: containersQ.isLoading,
		refetch,
	}
}
