import {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export function useVolumes() {
	const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null)

	const volumesQuery = trpcReact.docker.listVolumes.useQuery(undefined, {
		retry: false,
		refetchInterval: 10000,
	})

	const removeMutation = trpcReact.docker.removeVolume.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			volumesQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const removeVolume = (name: string, confirmName: string) => {
		setActionResult(null)
		removeMutation.mutate({name, confirmName})
	}

	const volumes = volumesQuery.data ?? []
	const totalCount = volumes.length

	return {
		volumes,
		isLoading: volumesQuery.isLoading,
		isError: volumesQuery.isError,
		error: volumesQuery.error,
		isFetching: volumesQuery.isFetching,
		refetch: volumesQuery.refetch,
		removeVolume,
		isRemoving: removeMutation.isPending,
		actionResult,
		totalCount,
	}
}
