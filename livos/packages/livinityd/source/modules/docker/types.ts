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
