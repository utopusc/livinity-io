import {useState, useEffect, useRef} from 'react'

import {trpcReact} from '@/trpc/trpc'

const HISTORY_SIZE = 30

interface NetworkHistoryPoint {
	time: number
	rxSec: number
	txSec: number
}

interface DiskIOHistoryPoint {
	time: number
	rIOSec: number
	wIOSec: number
}

export function useNetworkStats() {
	const [history, setHistory] = useState<NetworkHistoryPoint[]>([])
	const prevDataRef = useRef<string>('')

	const query = trpcReact.monitoring.networkStats.useQuery(undefined, {
		retry: false,
		refetchInterval: 2000,
	})

	useEffect(() => {
		if (!query.data) return

		// Deduplicate -- only add if data actually changed
		const dataKey = JSON.stringify(query.data)
		if (dataKey === prevDataRef.current) return
		prevDataRef.current = dataKey

		// Sum all interfaces' rxSec/txSec
		let rxSec = 0
		let txSec = 0
		for (const iface of query.data) {
			rxSec += iface.rxSec ?? 0
			txSec += iface.txSec ?? 0
		}

		setHistory((prev) => {
			const next = [...prev, {time: Date.now(), rxSec, txSec}]
			if (next.length > HISTORY_SIZE) return next.slice(-HISTORY_SIZE)
			return next
		})
	}, [query.data])

	return {
		data: query.data ?? [],
		history,
		isLoading: query.isLoading,
	}
}

export function useDiskIO() {
	const [history, setHistory] = useState<DiskIOHistoryPoint[]>([])
	const prevDataRef = useRef<string>('')

	const query = trpcReact.monitoring.diskIO.useQuery(undefined, {
		retry: false,
		refetchInterval: 5000,
	})

	useEffect(() => {
		if (!query.data) return

		const dataKey = JSON.stringify(query.data)
		if (dataKey === prevDataRef.current) return
		prevDataRef.current = dataKey

		const rIOSec = query.data.rIOSec ?? 0
		const wIOSec = query.data.wIOSec ?? 0

		setHistory((prev) => {
			const next = [...prev, {time: Date.now(), rIOSec, wIOSec}]
			if (next.length > HISTORY_SIZE) return next.slice(-HISTORY_SIZE)
			return next
		})
	}, [query.data])

	return {
		data: query.data ?? null,
		history,
		isLoading: query.isLoading,
	}
}

export function useProcesses(sortBy: 'cpu' | 'memory') {
	const query = trpcReact.monitoring.processes.useQuery({sortBy}, {
		retry: false,
		refetchInterval: 5000,
	})

	return {
		processes: query.data ?? [],
		isLoading: query.isLoading,
	}
}
