// Phase 25 Plan 25-02 — useTopCpu cross-environment fanout hook (DOC-05).
//
// Aggregates the top-N (default 10) running containers across ALL environments
// sorted by CPU% descending. Two-stage fanout:
//
//   Stage 1: per-env listContainers (5s polling) — filtered to state==='running'.
//   Stage 2: per-env take top PER_ENV_CANDIDATES=5 by created desc (proxy for
//            "likely-busy"), fan out containerStats only for those candidates.
//
// Bounded fanout: stats calls = envCount × 5 per 5s tick. With 5 envs that's
// 25 calls / 5s = 5/sec — well within Docker daemon load tolerance.
//
// RULES-OF-HOOKS (fixed 2026-06-08): BOTH fanouts use `trpcReact.useQueries`,
// which is ONE hook call regardless of array length. The previous version
// `.map()`-ed `useQuery` over `envList` and `candidates` directly — so the hook
// COUNT changed across renders (envs undefined→loaded grew the env queries;
// each resolving listContainers grew the stats queries). React threw "change in
// the order of Hooks" / "rendered more hooks than during the previous render",
// crashing the Docker dashboard on FIRST open (it only worked the second time
// because the queries were cached). The old header comment claimed an
// early-return guarded this, but no early return existed — and an early return
// BEFORE the fanout hooks would itself be a Rules-of-Hooks violation. useQueries
// is the correct primitive: the variable length lives inside one stable hook.

import {useEnvironments} from '@/hooks/use-environments'
import {trpcReact, type RouterOutput} from '@/trpc/trpc'

import {sortTopCpu, TOP_CPU_LIMIT, type TopCpuEntry} from './sort-top-cpu'

type ContainerInfo = RouterOutput['docker']['listContainers'][number]
type Environment = RouterOutput['docker']['listEnvironments'][number]
type ContainerStats = RouterOutput['docker']['containerStats']

/** Candidates per env — bounds the stats fanout (Plan 25-02 constraints). */
const PER_ENV_CANDIDATES = 5
const POLL_MS = 5000

export interface UseTopCpuResult {
	entries: TopCpuEntry[]
	isLoading: boolean
}

export function useTopCpu(): UseTopCpuResult {
	const {data: envs, isLoading: envsLoading} = useEnvironments()
	const envList: Environment[] = envs ?? []

	// Stage 1 — per-env listContainers fanout via useQueries (ONE hook call,
	// stable across renders regardless of envList length → no Rules-of-Hooks
	// violation when envs hydrates undefined→loaded or when the env set changes).
	const containerResults = trpcReact.useQueries((t) =>
		envList.map((env) =>
			t.docker.listContainers(
				{environmentId: env.id},
				{refetchInterval: POLL_MS, retry: false, staleTime: 2_500},
			),
		),
	)

	// Build the candidate list: top PER_ENV_CANDIDATES running per env by
	// `created` desc (recency proxy for "likely-busy"). Index-aligned with
	// envList because containerResults preserves the map order.
	const candidates: Array<{env: Environment; container: ContainerInfo}> = []
	envList.forEach((env, i) => {
		const data = containerResults[i]?.data as ContainerInfo[] | undefined
		const running = (data ?? []).filter((c) => c.state === 'running')
		const top = [...running].sort((a, b) => b.created - a.created).slice(0, PER_ENV_CANDIDATES)
		for (const c of top) candidates.push({env, container: c})
	})

	// Stage 2 — per-candidate containerStats fanout via useQueries (also ONE hook
	// call → the candidate count can grow/shrink freely between renders without
	// changing the hook count). queryKey carries name + environmentId so cross-env
	// containers with the same name don't collide in the React Query cache.
	const statsResults = trpcReact.useQueries((t) =>
		candidates.map(({env, container}) =>
			t.docker.containerStats(
				{name: container.name, environmentId: env.id},
				{refetchInterval: POLL_MS, retry: false, staleTime: 2_500},
			),
		),
	)

	const entries: TopCpuEntry[] = []
	candidates.forEach(({env, container}, i) => {
		const data = statsResults[i]?.data as ContainerStats | undefined
		if (data === undefined) return
		entries.push({
			envId: env.id,
			envName: env.name,
			containerId: container.id,
			containerName: container.name,
			image: container.image,
			cpuPercent: data.cpuPercent,
			memoryPercent: data.memoryPercent,
			isProtected: container.isProtected,
		})
	})

	return {
		entries: sortTopCpu(entries, TOP_CPU_LIMIT),
		// Loading is true while the env list itself is still loading OR while any
		// per-env containers query is in its initial load. Subsequent background
		// refetches don't flip isLoading (React Query semantics).
		isLoading: envsLoading || containerResults.some((q) => q.isLoading),
	}
}
