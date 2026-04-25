import {useState, useMemo} from 'react'

import {useSelectedEnvironmentId} from '@/stores/environment-store'
import {trpcReact} from '@/trpc/trpc'

// Time range presets in seconds
const TIME_RANGES = {
	'1h': 3600,
	'6h': 21600,
	'24h': 86400,
	'7d': 604800,
} as const

export type TimeRangeKey = keyof typeof TIME_RANGES
export type EventTypeFilter = 'all' | 'container' | 'image' | 'network' | 'volume'

export function useDockerEvents() {
	const environmentId = useSelectedEnvironmentId()
	const [typeFilter, setTypeFilter] = useState<EventTypeFilter>('all')
	const [timeRange, setTimeRange] = useState<TimeRangeKey>('1h')

	const queryInput = useMemo(() => {
		const now = Math.floor(Date.now() / 1000)
		const since = now - TIME_RANGES[timeRange]
		return {
			since,
			until: now,
			filters: typeFilter !== 'all' ? {type: [typeFilter]} : undefined,
			environmentId,
		}
	}, [typeFilter, timeRange, environmentId])

	const eventsQuery = trpcReact.docker.dockerEvents.useQuery(queryInput, {
		retry: false,
		refetchInterval: 5000,
	})

	return {
		events: eventsQuery.data ?? [],
		isLoading: eventsQuery.isLoading,
		isError: eventsQuery.isError,
		error: eventsQuery.error,
		isFetching: eventsQuery.isFetching,
		refetch: eventsQuery.refetch,
		typeFilter,
		setTypeFilter,
		timeRange,
		setTimeRange,
	}
}
