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

export type ContainerOperation = 'start' | 'stop' | 'restart' | 'remove' | 'kill' | 'pause' | 'unpause'

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

export interface ImageInfo {
	id: string // first 12 chars of image ID (strip sha256: prefix)
	repoTags: string[] // e.g. ["nginx:latest", "nginx:1.25"]
	size: number // bytes
	created: number // unix timestamp
}

export interface ImageHistoryEntry {
	id: string // layer ID (first 12 chars, or '<missing>')
	created: number // unix timestamp
	createdBy: string // the Dockerfile command that created this layer
	size: number // bytes added by this layer
	comment: string // optional comment
}

export interface VolumeInfo {
	name: string
	driver: string // e.g. "local"
	mountpoint: string // host path
	createdAt: string // ISO date string
}

export interface VolumeUsageInfo {
	containerName: string
	mountPath: string // container path where volume is mounted
}

export interface NetworkInfo {
	id: string // first 12 chars
	name: string
	driver: string // e.g. "bridge", "host", "overlay"
	scope: string // "local" | "swarm" | "global"
	containerCount: number
}

export interface NetworkContainer {
	name: string
	ipv4: string
	macAddress: string
}

export interface NetworkDetail {
	id: string
	name: string
	driver: string
	scope: string
	containers: NetworkContainer[]
}

// -----------------------------------------------------------------------
// Stack management (Phase 45)
// -----------------------------------------------------------------------

export interface StackInfo {
	name: string // compose project name
	status: 'running' | 'stopped' | 'partial' // all running / all stopped / mixed
	containerCount: number
	containers: StackContainer[]
}

export interface StackContainer {
	id: string
	name: string
	image: string
	state: string
	status: string
}

export type StackControlOperation = 'up' | 'down' | 'stop' | 'start' | 'restart' | 'pull-and-up'

export interface ContainerCreateInput {
	// General (CREATE-01)
	name: string
	image: string
	command?: string[]
	entrypoint?: string[]
	workingDir?: string
	user?: string
	hostname?: string
	domainname?: string
	tty?: boolean
	openStdin?: boolean

	// Ports (CREATE-02)
	ports?: Array<{
		hostPort: number
		containerPort: number
		protocol: 'tcp' | 'udp'
	}>

	// Volumes (CREATE-03)
	volumes?: Array<{
		hostPath?: string
		containerPath: string
		readOnly?: boolean
		type: 'bind' | 'volume' | 'tmpfs'
		volumeName?: string
	}>

	// Environment (CREATE-04)
	env?: Array<{key: string; value: string}>
	labels?: Array<{key: string; value: string}>

	// Restart Policy (CREATE-05)
	restartPolicy?: {
		name: 'no' | 'always' | 'on-failure' | 'unless-stopped'
		maximumRetryCount?: number
	}

	// Resources (CREATE-06)
	resources?: {
		memoryLimit?: number // bytes
		cpuLimit?: number // nanoCPUs (1e9 = 1 CPU)
		cpuShares?: number
	}

	// Health Check (CREATE-07)
	healthCheck?: {
		test?: string[] // e.g. ["CMD-SHELL", "curl -f http://localhost/ || exit 1"]
		interval?: number // nanoseconds
		timeout?: number // nanoseconds
		retries?: number
		startPeriod?: number // nanoseconds
	}

	// Network (CREATE-08)
	networkMode?: string // bridge | host | none | <network-name>
	dns?: string[]
	extraHosts?: string[] // ["host:ip", ...]

	// Pull behavior
	pullImage?: boolean // default true -- pull image before creating
	autoStart?: boolean // default true -- start container after creating
}

// -----------------------------------------------------------------------
// Docker Events (Phase 46)
// -----------------------------------------------------------------------

export interface DockerEvent {
	type: string // container | image | network | volume | daemon
	action: string // create | destroy | start | stop | die | pull | remove | connect | disconnect | etc.
	actor: string // container name, image name, network name, etc.
	actorId: string // full ID of the actor
	time: number // unix timestamp (seconds)
	attributes: Record<string, string> // extra attributes from Docker
}

// -----------------------------------------------------------------------
// Docker Engine Info (Phase 46)
// -----------------------------------------------------------------------

export interface EngineInfo {
	version: string
	apiVersion: string
	os: string
	architecture: string
	kernelVersion: string
	storageDriver: string
	loggingDriver: string
	cpus: number
	totalMemory: number // bytes
	dockerRootDir: string
	containers: number // total container count
	images: number // total image count
	serverTime: string // ISO date string
}
