import {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export function useContainers() {
	const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null)

	const containersQuery = trpcReact.docker.listContainers.useQuery(undefined, {
		retry: false,
		refetchInterval: 5000, // 5s polling per CONTEXT.md decision
	})

	const manageMutation = trpcReact.docker.manageContainer.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			containersQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const manage = (
		name: string,
		operation: 'start' | 'stop' | 'restart' | 'remove',
		opts?: {force?: boolean; confirmName?: string},
	) => {
		setActionResult(null)
		manageMutation.mutate({name, operation, force: opts?.force, confirmName: opts?.confirmName})
	}

	const containers = containersQuery.data ?? []
	const runningCount = containers.filter((c) => c.state === 'running').length
	const totalCount = containers.length

	return {
		containers,
		isLoading: containersQuery.isLoading,
		isError: containersQuery.isError,
		error: containersQuery.error,
		isFetching: containersQuery.isFetching,
		refetch: containersQuery.refetch,
		manage,
		isManaging: manageMutation.isPending,
		actionResult,
		runningCount,
		totalCount,
	}
}
