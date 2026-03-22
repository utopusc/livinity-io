// Protected PM2 process names -- processes matching these CANNOT be stopped.
// Server-side enforcement. Never rely on frontend-only guards.
export const PROTECTED_PM2_PROCESSES = ['livos', 'nexus-core'] as const

export interface PM2ProcessInfo {
	name: string
	pm_id: number
	status: string // 'online' | 'stopped' | 'errored' | 'launching'
	cpu: number // percentage (0-100)
	memory: number // bytes
	uptime: number // milliseconds since process started (0 if stopped)
	restarts: number // restart count
	isProtected: boolean // true if name matches PROTECTED_PM2_PROCESSES
}

export interface PM2ProcessDetail {
	name: string
	pm_id: number
	pid: number // OS process ID (0 if stopped)
	script: string // script path
	cwd: string // working directory
	nodeVersion: string // e.g. "v20.11.0" or "N/A"
	execMode: string // "fork" or "cluster"
	status: string
	restarts: number
	uptime: number // milliseconds
	createdAt: number // unix timestamp ms
}

export type PM2Operation = 'start' | 'stop' | 'restart'
