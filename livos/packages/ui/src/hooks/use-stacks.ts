import {useState} from 'react'

import {useSelectedEnvironmentId} from '@/stores/environment-store'
import {trpcReact} from '@/trpc/trpc'

export type DeployStackGitInput = {
	url: string
	branch?: string
	credentialId?: string | null
	composePath?: string
}

export type DeployStackInput = {
	name: string
	composeYaml?: string
	git?: DeployStackGitInput
	envVars?: Array<{key: string; value: string; secret?: boolean}>
}

export function useStacks() {
	const environmentId = useSelectedEnvironmentId()
	const [actionResult, setActionResult] = useState<{type: 'success' | 'error'; message: string} | null>(null)
	// Plan 21-02: capture webhookSecret from a successful deployStack so the form
	// can render the auto-generated webhook URL + copy buttons. YAML deploys leave
	// webhookSecret undefined, which the UI uses to skip the panel entirely.
	const [lastDeployResult, setLastDeployResult] = useState<{
		name: string
		webhookSecret?: string
	} | null>(null)

	// listStacks accepts envId — uses Dockerode under the hood (Plan 22-01 D-06).
	// deploy/edit/control/remove still shell out to host `docker compose` CLI so
	// they DO NOT take envId; multi-host stack deploy is v28.0.
	const stacksQuery = trpcReact.docker.listStacks.useQuery(
		{environmentId},
		{
			retry: false,
			refetchInterval: 15000,
		},
	)

	const deployStackMutation = trpcReact.docker.deployStack.useMutation({
		onSuccess: (data, variables) => {
			setActionResult({type: 'success', message: data.message})
			setLastDeployResult({name: variables.name, webhookSecret: data.webhookSecret})
			stacksQuery.refetch()
			setTimeout(() => setActionResult(null), 3000)
		},
		onError: (error) => {
			setActionResult({type: 'error', message: error.message})
			setLastDeployResult(null)
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

	const deployStack = (input: DeployStackInput) => {
		setActionResult(null)
		setLastDeployResult(null)
		deployStackMutation.mutate(input)
	}

	const editStack = (input: DeployStackInput) => {
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
		lastDeployResult,
		clearLastDeployResult: () => setLastDeployResult(null),
	}
}
