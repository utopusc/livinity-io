export interface NetworkStat {
	iface: string // interface name e.g. "eth0"
	rxBytes: number // total bytes received
	txBytes: number // total bytes transmitted
	rxSec: number | null // bytes/sec received (null on first call)
	txSec: number | null // bytes/sec transmitted (null on first call)
}

export interface DiskIO {
	rIO: number // total read operations
	wIO: number // total write operations
	rIOSec: number | null // read bytes/sec (null on first call)
	wIOSec: number | null // write bytes/sec (null on first call)
}

export interface ProcessInfo {
	pid: number
	name: string
	cpu: number // percentage 0-100
	memory: number // percentage 0-100
	state: string // e.g. "running", "sleeping"
}
