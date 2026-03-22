// Protected container name patterns -- containers matching these CANNOT be stopped or removed.
// Server-side enforcement (per SEC-02). Never rely on frontend-only guards.
export const PROTECTED_CONTAINER_PATTERNS = [
	'redis',
	'postgres',
	'caddy',
	'livinityd',
	'livos_redis',
	'livos_postgres',
	'livos_tor',
	'livos_auth',
	'livos_dns',
	'app-environment',
] as const

export interface ContainerInfo {
	id: string // first 12 chars of container ID
	name: string // container name without leading /
	image: string // image name
	state: string // running | exited | paused | restarting | dead | created | removing
	status: string // human-readable status e.g. "Up 3 hours"
	ports: PortMapping[] // structured port mappings
	created: number // unix timestamp
	isProtected: boolean // true if matches PROTECTED_CONTAINER_PATTERNS
}

export interface PortMapping {
	hostPort: number | null
	containerPort: number
	protocol: string // tcp | udp
}

export type ContainerOperation = 'start' | 'stop' | 'restart' | 'remove'

export interface ContainerDetail {
	id: string
	name: string
	image: string
	state: string
	status: string
	created: string // ISO date string from inspect
	platform: string // e.g. "linux/amd64"
	restartPolicy: string // e.g. "always", "unless-stopped", "no"
	restartCount: number
	healthStatus: string | null // "healthy" | "unhealthy" | "starting" | null (no healthcheck)
	ports: PortMapping[]
	volumes: VolumeMount[]
	envVars: string[] // ["KEY=value", ...] from Config.Env
	networks: string[] // network names
	mounts: MountInfo[] // bind mounts and volume mounts with full detail
}

export interface VolumeMount {
	type: string // "volume" | "bind" | "tmpfs"
	source: string // host path or volume name
	destination: string // container path
	readOnly: boolean
}

export interface MountInfo {
	type: string
	source: string
	destination: string
	mode: string // "rw" | "ro"
}

export interface ContainerStats {
	cpuPercent: number // 0-100
	memoryUsage: number // bytes
	memoryLimit: number // bytes
	memoryPercent: number // 0-100
	networkRx: number // bytes received
	networkTx: number // bytes transmitted
	pids: number // number of processes
}
