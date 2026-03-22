import {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export function usePM2() {
	const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null)

	const processesQuery = trpcReact.pm2.list.useQuery(undefined, {
		retry: false,
		refetchInterval: 10_000, // 10s polling per CONTEXT.md decision
	})

	const manageMutation = trpcReact.pm2.manage.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			processesQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const manage = (name: string, operation: 'start' | 'stop' | 'restart') => {
		setActionResult(null)
		manageMutation.mutate({name, operation})
	}

	const processes = processesQuery.data ?? []
	const onlineCount = processes.filter((p) => p.status === 'online').length
	const totalCount = processes.length

	return {
		processes,
		isLoading: processesQuery.isLoading,
		isError: processesQuery.isError,
		error: processesQuery.error,
		isFetching: processesQuery.isFetching,
		refetch: processesQuery.refetch,
		manage,
		isManaging: manageMutation.isPending,
		actionResult,
		onlineCount,
		totalCount,
	}
}
