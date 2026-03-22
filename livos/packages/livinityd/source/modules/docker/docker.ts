import Dockerode from 'dockerode'

import stripAnsi from 'strip-ansi'

import {
	PROTECTED_CONTAINER_PATTERNS,
	type ContainerInfo,
	type PortMapping,
	type ContainerOperation,
	type ContainerDetail,
	type ContainerStats,
	type VolumeMount,
	type MountInfo,
	type ImageInfo,
	type VolumeInfo,
	type NetworkInfo,
	type NetworkDetail,
} from './types.js'

// Singleton Dockerode instance -- reused across all calls (not per-call like ai/routes.ts)
const docker = new Dockerode()

export function isProtectedContainer(name: string): boolean {
	const lower = name.toLowerCase()
	return PROTECTED_CONTAINER_PATTERNS.some((pattern) => lower.includes(pattern))
}

export async function listContainers(): Promise<ContainerInfo[]> {
	const containers = await docker.listContainers({all: true})
	return containers.map((c) => ({
		id: c.Id.slice(0, 12),
		name: c.Names[0]?.replace('/', '') ?? c.Id.slice(0, 12),
		image: c.Image,
		state: c.State,
		status: c.Status,
		ports: (c.Ports ?? []).map(
			(p): PortMapping => ({
				hostPort: p.PublicPort ?? null,
				containerPort: p.PrivatePort,
				protocol: p.Type ?? 'tcp',
			}),
		),
		created: c.Created,
		isProtected: isProtectedContainer(c.Names[0]?.replace('/', '') ?? ''),
	}))
}

export async function manageContainer(
	name: string,
	operation: ContainerOperation,
	force?: boolean,
): Promise<{success: boolean; message: string}> {
	// Server-side protected container enforcement (SEC-02)
	if (isProtectedContainer(name) && (operation === 'stop' || operation === 'remove')) {
		throw new Error(`[protected-container] Cannot ${operation} protected container: ${name}`)
	}

	const container = docker.getContainer(name)

	switch (operation) {
		case 'start':
			await container.start()
			break
		case 'stop':
			await container.stop()
			break
		case 'restart':
			await container.restart()
			break
		case 'remove':
			await container.remove({force: force ?? false})
			break
	}

	return {success: true, message: `Container ${name} ${operation === 'remove' ? 'removed' : operation + 'ed'} successfully`}
}

export async function inspectContainer(name: string): Promise<ContainerDetail> {
	try {
		const container = docker.getContainer(name)
		const info = await container.inspect()

		const portBindings = info.NetworkSettings?.Ports || {}
		const ports: PortMapping[] = []
		for (const [containerPortProto, bindings] of Object.entries(portBindings)) {
			const [portStr, protocol] = containerPortProto.split('/')
			const containerPort = Number.parseInt(portStr, 10)
			if (bindings && Array.isArray(bindings)) {
				for (const binding of bindings) {
					ports.push({
						hostPort: binding.HostPort ? Number.parseInt(binding.HostPort, 10) : null,
						containerPort,
						protocol: protocol || 'tcp',
					})
				}
			} else {
				ports.push({hostPort: null, containerPort, protocol: protocol || 'tcp'})
			}
		}

		const rawMounts = info.Mounts || []
		const volumes: VolumeMount[] = rawMounts.map(
			(m: any): VolumeMount => ({
				type: m.Type || 'volume',
				source: m.Source || m.Name || '',
				destination: m.Destination || '',
				readOnly: !m.RW,
			}),
		)

		const mounts: MountInfo[] = rawMounts.map(
			(m: any): MountInfo => ({
				type: m.Type || 'volume',
				source: m.Source || m.Name || '',
				destination: m.Destination || '',
				mode: m.RW ? 'rw' : 'ro',
			}),
		)

		return {
			id: info.Id.slice(0, 12),
			name: info.Name.replace(/^\//, ''),
			image: info.Config?.Image || '',
			state: info.State?.Status || 'unknown',
			status: info.State?.Status || 'unknown',
			created: info.Created || '',
			platform: info.Platform || 'unknown',
			restartPolicy: info.HostConfig?.RestartPolicy?.Name || 'no',
			restartCount: info.RestartCount || 0,
			healthStatus: info.State?.Health?.Status ?? null,
			ports,
			volumes,
			envVars: info.Config?.Env || [],
			networks: Object.keys(info.NetworkSettings?.Networks || {}),
			mounts,
		}
	} catch (err: any) {
		if (err.statusCode === 404 || err.reason === 'no such container') {
			throw new Error(`[not-found] Container not found: ${name}`)
		}
		throw err
	}
}

/**
 * Strip Docker multiplexed stream 8-byte headers from each frame.
 * Format: [stream_type(1), 0, 0, 0, size(4)] per frame.
 */
function stripDockerStreamHeaders(buffer: Buffer): string {
	const chunks: string[] = []
	let offset = 0

	while (offset < buffer.length) {
		if (offset + 8 > buffer.length) {
			// Remaining bytes don't form a complete header -- include as-is
			chunks.push(buffer.subarray(offset).toString('utf-8'))
			break
		}

		const frameSize = buffer.readUInt32BE(offset + 4)
		offset += 8 // skip header

		if (offset + frameSize > buffer.length) {
			// Frame extends beyond buffer -- include what's available
			chunks.push(buffer.subarray(offset).toString('utf-8'))
			break
		}

		chunks.push(buffer.subarray(offset, offset + frameSize).toString('utf-8'))
		offset += frameSize
	}

	return chunks.join('')
}

export async function getContainerLogs(
	name: string,
	tail: number = 500,
	timestamps: boolean = true,
): Promise<string> {
	try {
		const container = docker.getContainer(name)
		const logBuffer = (await container.logs({
			stdout: true,
			stderr: true,
			tail,
			timestamps,
			follow: false,
		})) as unknown as Buffer

		// If it's a Buffer, strip Docker stream headers; otherwise use as-is
		const rawText = Buffer.isBuffer(logBuffer)
			? stripDockerStreamHeaders(logBuffer)
			: String(logBuffer)

		return stripAnsi(rawText)
	} catch (err: any) {
		if (err.statusCode === 404 || err.reason === 'no such container') {
			throw new Error(`[not-found] Container not found: ${name}`)
		}
		throw err
	}
}

export async function getContainerStats(name: string): Promise<ContainerStats> {
	try {
		const container = docker.getContainer(name)
		const stats: any = await container.stats({stream: false})

		// CPU calculation
		const cpuDelta =
			(stats.cpu_stats?.cpu_usage?.total_usage || 0) -
			(stats.precpu_stats?.cpu_usage?.total_usage || 0)
		const systemDelta =
			(stats.cpu_stats?.system_cpu_usage || 0) -
			(stats.precpu_stats?.system_cpu_usage || 0)
		const numCpus =
			stats.cpu_stats?.online_cpus ||
			stats.cpu_stats?.cpu_usage?.percpu_usage?.length ||
			1
		const cpuPercent =
			systemDelta > 0
				? Math.round(((cpuDelta / systemDelta) * numCpus * 100) * 100) / 100
				: 0

		// Memory calculation (subtract cache for accurate usage)
		const memoryUsage =
			(stats.memory_stats?.usage || 0) -
			(stats.memory_stats?.stats?.cache || 0)
		const memoryLimit = stats.memory_stats?.limit || 0
		const memoryPercent =
			memoryLimit > 0
				? Math.round((memoryUsage / memoryLimit) * 100 * 100) / 100
				: 0

		// Network: sum across all interfaces
		let networkRx = 0
		let networkTx = 0
		const networks = stats.networks || {}
		for (const iface of Object.values(networks) as any[]) {
			networkRx += iface.rx_bytes || 0
			networkTx += iface.tx_bytes || 0
		}

		return {
			cpuPercent,
			memoryUsage,
			memoryLimit,
			memoryPercent,
			networkRx,
			networkTx,
			pids: stats.pids_stats?.current || 0,
		}
	} catch (err: any) {
		if (err.statusCode === 404 || err.reason === 'no such container') {
			throw new Error(`[not-found] Container not found: ${name}`)
		}
		throw err
	}
}

// ---------------------------------------------------------------------------
// Image management
// ---------------------------------------------------------------------------

export async function listImages(): Promise<ImageInfo[]> {
	const images = await docker.listImages()
	return images
		.map((img): ImageInfo => ({
			id: img.Id.replace(/^sha256:/, '').slice(0, 12),
			repoTags: img.RepoTags && img.RepoTags.length > 0 ? img.RepoTags : ['<none>:<none>'],
			size: img.Size,
			created: img.Created,
		}))
		.sort((a, b) => b.created - a.created)
}

export async function removeImage(
	id: string,
	force: boolean,
): Promise<{success: boolean; message: string}> {
	try {
		await docker.getImage(id).remove({force})
		return {success: true, message: 'Image removed successfully'}
	} catch (err: any) {
		if (err.statusCode === 404) {
			throw new Error(`[not-found] Image not found: ${id}`)
		}
		if (err.statusCode === 409) {
			throw new Error('[in-use] Image is in use by a container')
		}
		throw err
	}
}

export async function pruneImages(): Promise<{spaceReclaimed: number; deletedCount: number}> {
	const result = await docker.pruneImages()
	return {
		spaceReclaimed: result.SpaceReclaimed || 0,
		deletedCount: (result.ImagesDeleted || []).length,
	}
}

// ---------------------------------------------------------------------------
// Volume management
// ---------------------------------------------------------------------------

export async function listVolumes(): Promise<VolumeInfo[]> {
	const result = await docker.listVolumes()
	const volumes = result.Volumes || []
	return volumes
		.map((vol): VolumeInfo => ({
			name: vol.Name,
			driver: vol.Driver,
			mountpoint: vol.Mountpoint,
			createdAt: (vol as any).CreatedAt || '',
		}))
		.sort((a, b) => a.name.localeCompare(b.name))
}

export async function removeVolume(
	name: string,
): Promise<{success: boolean; message: string}> {
	try {
		await docker.getVolume(name).remove()
		return {success: true, message: `Volume '${name}' removed successfully`}
	} catch (err: any) {
		if (err.statusCode === 404) {
			throw new Error(`[not-found] Volume not found: ${name}`)
		}
		if (err.statusCode === 409) {
			throw new Error('[in-use] Volume is in use')
		}
		throw err
	}
}

// ---------------------------------------------------------------------------
// Network management
// ---------------------------------------------------------------------------

export async function listNetworks(): Promise<NetworkInfo[]> {
	const networks = await docker.listNetworks()
	return networks
		.map((net): NetworkInfo => ({
			id: net.Id.slice(0, 12),
			name: net.Name,
			driver: net.Driver || '',
			scope: net.Scope || 'local',
			containerCount: Object.keys(net.Containers || {}).length,
		}))
		.sort((a, b) => a.name.localeCompare(b.name))
}

export async function inspectNetwork(id: string): Promise<NetworkDetail> {
	try {
		const info = await docker.getNetwork(id).inspect()
		const containers = Object.entries(info.Containers || {}).map(
			([, value]: [string, any]) => ({
				name: (value.Name || '').replace(/^\//, ''),
				ipv4: value.IPv4Address || '',
				macAddress: value.MacAddress || '',
			}),
		)
		return {
			id: info.Id.slice(0, 12),
			name: info.Name,
			driver: info.Driver || '',
			scope: info.Scope || 'local',
			containers,
		}
	} catch (err: any) {
		if (err.statusCode === 404) {
			throw new Error(`[not-found] Network not found: ${id}`)
		}
		throw err
	}
}
