// Phase 25 Plan 25-02 — useTopCpu cross-environment fanout hook (DOC-05).
//
// Aggregates the top-N (default 10) running containers across ALL environments
// sorted by CPU% descending. Two-stage fanout:
//
//   Stage 1: per-env listContainers (5s polling) — already exists, free with
//            React Query caching (Plan 22-01 D-08 envId fanout). Filter to
//            state==='running'.
//   Stage 2: per-env take top PER_ENV_CANDIDATES=5 by created desc (proxy for
//            "likely-busy"), fan out containerStats only for those candidates.
//
// Bounded fanout: stats calls = envCount × 5 per 5s tick. With 5 envs that's
// 25 calls / 5s = 5/sec — well within Docker daemon load tolerance. True
// global Top-10-by-CPU would require fanning out to ALL running containers,
// which scales linearly with cluster size (could be hundreds). v29 polish may
// add a docker.allEnvCpuTop tRPC aggregator (single round-trip per tick) when
// env+container counts grow.
//
// Hooks-in-loops: every iteration of `containerQueries.map(env => useQuery)`
// calls one hook. React's hooks rule forbids hooks inside CONDITIONAL
// branches, NOT inside loops over a STABLE array. We early-return when envs
// is undefined (loading) so the hook count is 0 → stable thereafter; envs
// changes only on discrete admin CRUD which triggers a full remount of the
// dashboard (env list query change → React Query identity-stable refetch).

import {useEnvironments} from '@/hooks/use-environments'
import {trpcReact, type RouterOutput} from '@/trpc/trpc'

import {sortTopCpu, TOP_CPU_LIMIT, type TopCpuEntry} from './sort-top-cpu'

type ContainerInfo = RouterOutput['docker']['listContainers'][number]
type Environment = RouterOutput['docker']['listEnvironments'][number]

/** Candidates per env — bounds the stats fanout (Plan 25-02 constraints). */
const PER_ENV_CANDIDATES = 5
const POLL_MS = 5000

export interface UseTopCpuResult {
	entries: TopCpuEntry[]
	isLoading: boolean
}

export function useTopCpu(): UseTopCpuResult {
	const {data: envs, isLoading: envsLoading} = useEnvironments()

	// Gate the fanout on envs being hydrated. While envs is undefined (initial
	// load), the hook count below is 0 — once envs loads, the count is stable
	// (envs only mutates on discrete admin CRUD). This is the airtight version
	// of the hooks-in-loops pattern (see header note).
	const envList: Environment[] = envs ?? []

	// Stage 1 — per-env listContainers fanout (5s polling, retry:false so a
	// flaky env doesn't blow up the dashboard).
	const containerQueries = envList.map((env) => ({
		env,
		q: trpcReact.docker.listContainers.useQuery(
			{environmentId: env.id},
			{refetchInterval: POLL_MS, retry: false, staleTime: 2_500},
		),
	}))

	// Build the candidate list: top PER_ENV_CANDIDATES running per env by
	// `created` desc (recency proxy for "likely-busy").
	const candidates: Array<{env: Environment; container: ContainerInfo}> = []
	for (const {env, q} of containerQueries) {
		const running = (q.data ?? []).filter((c) => c.state === 'running')
		const top = [...running].sort((a, b) => b.created - a.created).slice(0, PER_ENV_CANDIDATES)
		for (const c of top) candidates.push({env, container: c})
	}

	// Stage 2 — per-candidate containerStats fanout. queryKey carries both
	// name AND environmentId so cross-env containers with the same name don't
	// collide in the React Query cache.
	const statsQueries = candidates.map(({env, container}) => ({
		env,
		container,
		q: trpcReact.docker.containerStats.useQuery(
			{name: container.name, environmentId: env.id},
			{refetchInterval: POLL_MS, retry: false, staleTime: 2_500},
		),
	}))

	const entries: TopCpuEntry[] = []
	for (const {env, container, q} of statsQueries) {
		if (q.data === undefined) continue
		entries.push({
			envId: env.id,
			envName: env.name,
			containerId: container.id,
			containerName: container.name,
			image: container.image,
			cpuPercent: q.data.cpuPercent,
			memoryPercent: q.data.memoryPercent,
			isProtected: container.isProtected,
		})
	}

	return {
		entries: sortTopCpu(entries, TOP_CPU_LIMIT),
		// Loading is true while the env list itself is still loading OR while
		// any per-env containers query is in its initial load. Subsequent
		// background refetches don't flip isLoading (React Query semantics).
		isLoading: envsLoading || containerQueries.some((c) => c.q.isLoading),
	}
}
