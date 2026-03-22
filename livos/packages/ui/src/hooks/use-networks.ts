import {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export function useNetworks() {
	const [inspectedNetwork, setInspectedNetwork] = useState<string | null>(null)

	const networksQuery = trpcReact.docker.listNetworks.useQuery(undefined, {
		retry: false,
		refetchInterval: 15000,
	})

	const inspectQuery = trpcReact.docker.inspectNetwork.useQuery(
		{id: inspectedNetwork!},
		{enabled: !!inspectedNetwork, retry: false},
	)

	const inspectNetwork = (id: string) => {
		setInspectedNetwork(id)
	}

	const clearInspect = () => {
		setInspectedNetwork(null)
	}

	const networks = networksQuery.data ?? []
	const totalCount = networks.length

	return {
		networks,
		isLoading: networksQuery.isLoading,
		isError: networksQuery.isError,
		error: networksQuery.error,
		isFetching: networksQuery.isFetching,
		refetch: networksQuery.refetch,
		inspectNetwork,
		clearInspect,
		inspectedNetworkData: inspectQuery.data,
		isInspecting: inspectQuery.isFetching,
		totalCount,
	}
}
