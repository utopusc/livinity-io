import {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export function useNetworks() {
	const [inspectedNetwork, setInspectedNetwork] = useState<string | null>(null)
	const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null)

	const networksQuery = trpcReact.docker.listNetworks.useQuery(undefined, {
		retry: false,
		refetchInterval: 15000,
	})

	const inspectQuery = trpcReact.docker.inspectNetwork.useQuery(
		{id: inspectedNetwork!},
		{enabled: !!inspectedNetwork, retry: false},
	)

	const createNetworkMutation = trpcReact.docker.createNetwork.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			networksQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const removeNetworkMutation = trpcReact.docker.removeNetwork.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			networksQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const disconnectNetworkMutation = trpcReact.docker.disconnectNetwork.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			networksQuery.refetch()
			inspectQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const inspectNetwork = (id: string) => {
		setInspectedNetwork(id)
	}

	const clearInspect = () => {
		setInspectedNetwork(null)
	}

	const createNetwork = (input: {name: string; driver: string; subnet?: string; gateway?: string; internal?: boolean}) => {
		setActionResult(null)
		createNetworkMutation.mutate(input)
	}

	const removeNetwork = (id: string) => {
		setActionResult(null)
		removeNetworkMutation.mutate({id})
	}

	const disconnectNetwork = (networkId: string, containerId: string) => {
		setActionResult(null)
		disconnectNetworkMutation.mutate({networkId, containerId})
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
		createNetwork,
		isCreatingNetwork: createNetworkMutation.isPending,
		removeNetwork,
		isRemovingNetwork: removeNetworkMutation.isPending,
		disconnectNetwork,
		isDisconnecting: disconnectNetworkMutation.isPending,
		actionResult,
	}
}
