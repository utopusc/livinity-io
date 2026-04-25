// Phase 22 MH-03 — Environments React Query hooks.
//
// Wraps trpc.docker.listEnvironments + the CRUD mutations so the Server
// Control header dropdown and the Settings > Environments section share a
// single cache. Re-runs every 10s so agent_status (Plan 22-03) feels live.
//
// useGenerateAgentToken is a defensive wrapper — Plan 22-03 lands the real
// `docker.generateAgentToken` mutation. Until then this hook returns a stub
// that throws a friendly "agent transport not yet enabled" message so the UI
// can ship 22-02 without 22-03.

import {trpcReact, type RouterOutput} from '@/trpc/trpc'

/** Inferred from the tRPC route shape — single source of truth via RouterOutput. */
export type Environment = RouterOutput['docker']['listEnvironments'][number]

export function useEnvironments() {
	return trpcReact.docker.listEnvironments.useQuery(undefined, {
		// Refetch every 10s so agent_status flips reflect in the dropdown
		refetchInterval: 10_000,
		staleTime: 5_000,
	})
}

/**
 * Phase 25 Plan 25-01 — derives a single environment row from the existing
 * useEnvironments() cache. Zero extra requests: it just runs `find` on the
 * data array React Query already populated. Returns undefined while the list
 * query is loading or when the id is not in the list (e.g. the env was
 * deleted in another tab and the local store still points at it).
 *
 * Used by EnvCard to look up its own metadata when the parent component only
 * passes the env id (e.g. inside a list mapper that doesn't carry the row).
 */
export function useEnvironment(envId: string): Environment | undefined {
	const {data} = useEnvironments()
	return data?.find((e) => e.id === envId)
}

export function useCreateEnvironment() {
	const utils = trpcReact.useUtils()
	return trpcReact.docker.createEnvironment.useMutation({
		onSuccess: () => utils.docker.listEnvironments.invalidate(),
	})
}

export function useUpdateEnvironment() {
	const utils = trpcReact.useUtils()
	return trpcReact.docker.updateEnvironment.useMutation({
		onSuccess: () => utils.docker.listEnvironments.invalidate(),
	})
}

export function useDeleteEnvironment() {
	const utils = trpcReact.useUtils()
	return trpcReact.docker.deleteEnvironment.useMutation({
		onSuccess: () => utils.docker.listEnvironments.invalidate(),
	})
}

// Stub for Plan 22-03 — will resolve to a real route in 22-03. The real route
// will return {token: string, agentId: string}; this stub throws so the dialog
// can show a friendly toast and the user can return after upgrading.
//
// Shape mirrors the tRPC mutation interface (mutateAsync, isPending, etc.).
export function useGenerateAgentToken() {
	const route = (trpcReact.docker as any).generateAgentToken
	if (route?.useMutation) {
		return route.useMutation() as {
			mutateAsync: (input: {environmentId: string}) => Promise<{token: string; agentId: string}>
			isPending: boolean
			isError: boolean
			error: any
		}
	}
	return {
		mutateAsync: async () => {
			throw new Error('Agent transport not yet enabled — install Plan 22-03 to use agent environments')
		},
		isPending: false,
		isError: false,
		error: null,
	} as any
}
