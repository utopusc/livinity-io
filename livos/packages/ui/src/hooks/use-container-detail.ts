import {trpcReact} from '@/trpc/trpc'

export function useContainerDetail(containerName: string | null, options?: {tail?: number; timestamps?: boolean}) {
	// Only enable queries when containerName is non-null (Sheet is open)
	const enabled = containerName !== null
	const tailLines = options?.tail ?? 500
	const timestamps = options?.timestamps ?? true

	const inspectQuery = trpcReact.docker.inspectContainer.useQuery({name: containerName!}, {enabled, retry: false})

	const logsQuery = trpcReact.docker.containerLogs.useQuery(
		{name: containerName!, tail: tailLines, timestamps},
		{enabled, retry: false, refetchInterval: 2000},
	)

	const statsQuery = trpcReact.docker.containerStats.useQuery(
		{name: containerName!},
		{enabled, retry: false, refetchInterval: 3000},
	)

	return {
		detail: inspectQuery.data ?? null,
		detailLoading: inspectQuery.isLoading && enabled,
		detailError: inspectQuery.error,

		logs: logsQuery.data ?? '',
		logsLoading: logsQuery.isLoading && enabled,
		logsError: logsQuery.error,
		refetchLogs: logsQuery.refetch,

		stats: statsQuery.data ?? null,
		statsLoading: statsQuery.isLoading && enabled,
		statsError: statsQuery.error,
	}
}
