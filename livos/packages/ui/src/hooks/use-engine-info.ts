import {trpcReact} from '@/trpc/trpc'

export function useEngineInfo() {
	const engineQuery = trpcReact.docker.engineInfo.useQuery(undefined, {
		retry: false,
		staleTime: 60000, // engine info rarely changes, cache for 1 min
	})

	return {
		engineInfo: engineQuery.data ?? null,
		isLoading: engineQuery.isLoading,
		isError: engineQuery.isError,
		error: engineQuery.error,
	}
}
