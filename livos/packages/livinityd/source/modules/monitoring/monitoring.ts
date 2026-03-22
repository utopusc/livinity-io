import systemInformation from 'systeminformation'

import type {NetworkStat, DiskIO, ProcessInfo} from './types.js'

export async function getNetworkStats(): Promise<NetworkStat[]> {
	const stats = await systemInformation.networkStats()

	return stats
		.filter((stat) => stat.iface !== 'lo')
		.map((stat) => ({
			iface: stat.iface,
			rxBytes: stat.rx_bytes,
			txBytes: stat.tx_bytes,
			rxSec: stat.rx_sec,
			txSec: stat.tx_sec,
		}))
}

export async function getDiskIO(): Promise<DiskIO> {
	const result = await systemInformation.disksIO()

	return {
		rIO: result.rIO,
		wIO: result.wIO,
		rIOSec: result.rIO_sec,
		wIOSec: result.wIO_sec,
	}
}

export async function getProcesses(sortBy: 'cpu' | 'memory' = 'cpu'): Promise<ProcessInfo[]> {
	const result = await systemInformation.processes()

	const sortField = sortBy === 'cpu' ? 'cpu' : 'mem'

	return result.list
		.sort((a, b) => b[sortField] - a[sortField])
		.slice(0, 20)
		.map((p) => ({
			pid: p.pid,
			name: p.name,
			cpu: p.cpu,
			memory: p.mem,
			state: p.state,
		}))
}
