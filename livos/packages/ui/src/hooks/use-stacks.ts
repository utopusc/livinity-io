import {useState} from 'react'

import {trpcReact} from '@/trpc/trpc'

export function useStacks() {
	const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null)

	const stacksQuery = trpcReact.docker.listStacks.useQuery(undefined, {
		retry: false,
		refetchInterval: 15000,
	})

	const deployStackMutation = trpcReact.docker.deployStack.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			stacksQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const editStackMutation = trpcReact.docker.editStack.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			stacksQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const controlStackMutation = trpcReact.docker.controlStack.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			stacksQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const removeStackMutation = trpcReact.docker.removeStack.useMutation({
		onSuccess: (data) => {
			setActionResult({type: 'success', message: data.message})
			stacksQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setTimeout(() => setActionResult(null), 5000)
		},
	})

	const deployStack = (input: {
		name: string
		composeYaml: string
		envVars?: Array<{key: string; value: string; secret?: boolean}>
	}) => {
		setActionResult(null)
		deployStackMutation.mutate(input)
	}

	const editStack = (input: {
		name: string
		composeYaml: string
		envVars?: Array<{key: string; value: string; secret?: boolean}>
	}) => {
		setActionResult(null)
		editStackMutation.mutate(input)
	}

	const controlStack = (
		name: string,
		operation: 'up' | 'down' | 'stop' | 'start' | 'restart' | 'pull-and-up',
	) => {
		setActionResult(null)
		controlStackMutation.mutate({name, operation})
	}

	const removeStack = (name: string, removeVolumes: boolean) => {
		setActionResult(null)
		removeStackMutation.mutate({name, removeVolumes})
	}

	const stacks = stacksQuery.data ?? []

	return {
		stacks,
		isLoading: stacksQuery.isLoading,
		isError: stacksQuery.isError,
		error: stacksQuery.error,
		isFetching: stacksQuery.isFetching,
		refetch: stacksQuery.refetch,
		deployStack,
		isDeploying: deployStackMutation.isPending,
		editStack,
		isEditing: editStackMutation.isPending,
		controlStack,
		isControlling: controlStackMutation.isPending,
		removeStack,
		isRemoving: removeStackMutation.isPending,
		actionResult,
	}
}
