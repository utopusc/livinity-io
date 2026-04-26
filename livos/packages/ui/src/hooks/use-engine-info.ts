import {useSelectedEnvironmentId} from '@/stores/environment-store'
import {trpcReact} from '@/trpc/trpc'

export function useEngineInfo() {
	const environmentId = useSelectedEnvironmentId()
	const engineQuery = trpcReact.docker.engineInfo.useQuery(
		{environmentId},
		{
			retry: false,
			staleTime: 60000, // engine info rarely changes, cache for 1 min
		},
	)

	return {
		engineInfo: engineQuery.data ?? null,
		isLoading: engineQuery.isLoading,
		isError: engineQuery.isError,
		error: engineQuery.error,
		// Round 2 hot-patch: StatusFooter "Live" indicator uses dataUpdatedAt
		// to render a truthful "fresh" badge instead of the broken WS-readyState
		// poll (Docker UI mostly routes via httpOnly tRPC paths, so wsClient
		// state is meaningless for the user-visible "is data flowing" question).
		dataUpdatedAt: engineQuery.dataUpdatedAt,
	}
}
