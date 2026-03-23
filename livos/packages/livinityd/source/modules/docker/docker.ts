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
	type ImageHistoryEntry,
	type VolumeInfo,
	type VolumeUsageInfo,
	type NetworkInfo,
	type NetworkDetail,
	type ContainerCreateInput,
	type DockerEvent,
	type EngineInfo,
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
	// Protected containers cannot be stopped, removed, or paused (must stay running)
	if (isProtectedContainer(name) && (operation === 'stop' || operation === 'remove' || operation === 'pause')) {
		throw new Error(`[protected-container] Cannot ${operation} protected container: ${name}`)
	}

	const container = docker.getContainer(name)

	const pastTense: Record<ContainerOperation, string> = {
		start: 'started',
		stop: 'stopped',
		restart: 'restarted',
		remove: 'removed',
		kill: 'killed',
		pause: 'paused',
		unpause: 'resumed',
	}

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
		case 'kill':
			await container.kill()
			break
		case 'pause':
			await container.pause()
			break
		case 'unpause':
			await container.unpause()
			break
	}

	return {success: true, message: `Container ${name} ${pastTense[operation]} successfully`}
}

export async function bulkManageContainers(
	names: string[],
	operation: ContainerOperation,
	force?: boolean,
): Promise<Array<{name: string; success: boolean; message: string}>> {
	const results = await Promise.allSettled(
		names.map((name) => manageContainer(name, operation, force)),
	)

	return results.map((result, index) => {
		if (result.status === 'fulfilled') {
			return {name: names[index], ...result.value}
		}
		return {
			name: names[index],
			success: false,
			message: result.reason?.message || `Failed to ${operation} container ${names[index]}`,
		}
	})
}

export async function createContainer(
	input: ContainerCreateInput,
): Promise<{success: boolean; message: string; containerId: string}> {
	// Optionally pull image first (default: true)
	if (input.pullImage !== false) {
		await new Promise<void>((resolve, reject) => {
			docker.pull(input.image, (err: any, stream: any) => {
				if (err) return reject(err)
				docker.modem.followProgress(stream, (err: any) => {
					if (err) return reject(err)
					resolve()
				})
			})
		})
	}

	// Build ExposedPorts and PortBindings from input.ports
	const exposedPorts: Record<string, object> = {}
	const portBindings: Record<string, Array<{HostPort: string}>> = {}
	if (input.ports) {
		for (const p of input.ports) {
			const key = `${p.containerPort}/${p.protocol}`
			exposedPorts[key] = {}
			if (!portBindings[key]) portBindings[key] = []
			portBindings[key].push({HostPort: String(p.hostPort)})
		}
	}

	// Build Binds (for bind mounts) and Mounts (for named volumes and tmpfs)
	const binds: string[] = []
	const mounts: Array<{Type: string; Source: string; Target: string; ReadOnly: boolean}> = []
	if (input.volumes) {
		for (const v of input.volumes) {
			if (v.type === 'bind') {
				const mode = v.readOnly ? 'ro' : 'rw'
				binds.push(`${v.hostPath || ''}:${v.containerPath}:${mode}`)
			} else {
				// Named volumes and tmpfs use Mounts
				mounts.push({
					Type: v.type,
					Source: v.type === 'volume' ? (v.volumeName || '') : '',
					Target: v.containerPath,
					ReadOnly: v.readOnly ?? false,
				})
			}
		}
	}

	// Build Env array
	const env = input.env?.map((e) => `${e.key}=${e.value}`)

	// Build Labels object
	const labels: Record<string, string> | undefined = input.labels
		? Object.fromEntries(input.labels.map((l) => [l.key, l.value]))
		: undefined

	// Build dockerode ContainerCreateOptions
	const opts: Dockerode.ContainerCreateOptions = {
		name: input.name,
		Image: input.image,
		Cmd: input.command || undefined,
		Entrypoint: input.entrypoint || undefined,
		WorkingDir: input.workingDir || undefined,
		User: input.user || undefined,
		Hostname: input.hostname || undefined,
		Domainname: input.domainname || undefined,
		Tty: input.tty || false,
		OpenStdin: input.openStdin || false,
		Env: env,
		Labels: labels,
		ExposedPorts: Object.keys(exposedPorts).length > 0 ? exposedPorts : undefined,
		Healthcheck: input.healthCheck
			? {
					Test: input.healthCheck.test,
					Interval: input.healthCheck.interval,
					Timeout: input.healthCheck.timeout,
					Retries: input.healthCheck.retries,
					StartPeriod: input.healthCheck.startPeriod,
				}
			: undefined,
		HostConfig: {
			PortBindings: Object.keys(portBindings).length > 0 ? portBindings : undefined,
			Binds: binds.length > 0 ? binds : undefined,
			Mounts: mounts.length > 0 ? (mounts as any) : undefined,
			RestartPolicy: input.restartPolicy
				? {
						Name: input.restartPolicy.name,
						MaximumRetryCount: input.restartPolicy.maximumRetryCount || 0,
					}
				: undefined,
			Memory: input.resources?.memoryLimit || undefined,
			NanoCpus: input.resources?.cpuLimit || undefined,
			CpuShares: input.resources?.cpuShares || undefined,
			NetworkMode: input.networkMode || undefined,
			Dns: input.dns || undefined,
			ExtraHosts: input.extraHosts || undefined,
		},
	}

	try {
		const container = await docker.createContainer(opts)

		// Optionally start container (default: true)
		if (input.autoStart !== false) {
			await container.start()
		}

		return {
			success: true,
			message: `Container '${input.name}' created successfully`,
			containerId: container.id.slice(0, 12),
		}
	} catch (err: any) {
		if (err.statusCode === 404) {
			throw new Error(`[image-not-found] Image not found: ${input.image}`)
		}
		throw err
	}
}

export async function recreateContainer(
	name: string,
	input: ContainerCreateInput,
): Promise<{success: boolean; message: string; containerId: string}> {
	if (isProtectedContainer(name)) {
		throw new Error(`[protected-container] Cannot recreate protected container: ${name}`)
	}

	try {
		const container = docker.getContainer(name)
		await container.inspect() // verify it exists

		// Stop the container if running (ignore errors if already stopped)
		await container.stop().catch(() => {})

		// Remove the old container
		await container.remove({force: true})

		// Ensure the recreated container keeps the same name
		input.name = name

		// Create and start the new container with updated config
		return await createContainer(input)
	} catch (err: any) {
		if (err.statusCode === 404 || err.reason === 'no such container') {
			throw new Error(`[not-found] Container not found: ${name}`)
		}
		throw err
	}
}

export async function renameContainer(
	name: string,
	newName: string,
): Promise<{success: boolean; message: string}> {
	if (isProtectedContainer(name)) {
		throw new Error(`[protected-container] Cannot rename protected container: ${name}`)
	}

	if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(newName)) {
		throw new Error(`Invalid container name '${newName}'. Must start with alphanumeric and contain only [a-zA-Z0-9_.-]`)
	}

	try {
		const container = docker.getContainer(name)
		await container.rename({name: newName})
		return {success: true, message: `Container '${name}' renamed to '${newName}'`}
	} catch (err: any) {
		if (err.statusCode === 404 || err.reason === 'no such container') {
			throw new Error(`[not-found] Container not found: ${name}`)
		}
		if (err.statusCode === 409) {
			throw new Error(`[conflict] Container name '${newName}' is already in use`)
		}
		throw err
	}
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

export async function pullImage(
	imageName: string,
): Promise<{success: boolean; message: string}> {
	try {
		await new Promise<void>((resolve, reject) => {
			docker.pull(imageName, (err: any, stream: any) => {
				if (err) {
					if (err.statusCode === 404) {
						return reject(new Error(`[image-not-found] Image not found: ${imageName}`))
					}
					return reject(err)
				}
				docker.modem.followProgress(stream, (err: any) => {
					if (err) {
						if (err.statusCode === 404 || err.message?.includes('not found')) {
							return reject(new Error(`[image-not-found] Image not found: ${imageName}`))
						}
						return reject(err)
					}
					resolve()
				})
			})
		})
		return {success: true, message: `Image '${imageName}' pulled successfully`}
	} catch (err: any) {
		if (err.message?.includes('[image-not-found]')) {
			throw err
		}
		if (err.statusCode === 404 || err.message?.includes('not found')) {
			throw new Error(`[image-not-found] Image not found: ${imageName}`)
		}
		throw err
	}
}

export async function tagImage(
	id: string,
	repo: string,
	tag: string,
): Promise<{success: boolean; message: string}> {
	try {
		await docker.getImage(id).tag({repo, tag})
		return {success: true, message: `Image tagged as ${repo}:${tag}`}
	} catch (err: any) {
		if (err.statusCode === 404) {
			throw new Error(`[not-found] Image not found: ${id}`)
		}
		throw err
	}
}

export async function imageHistory(
	id: string,
): Promise<ImageHistoryEntry[]> {
	try {
		const history = await docker.getImage(id).history()
		return history.map((entry: any): ImageHistoryEntry => ({
			id: entry.Id?.replace('sha256:', '').slice(0, 12) || '<missing>',
			created: entry.Created,
			createdBy: entry.CreatedBy || '',
			size: entry.Size,
			comment: entry.Comment || '',
		}))
	} catch (err: any) {
		if (err.statusCode === 404) {
			throw new Error(`[not-found] Image not found: ${id}`)
		}
		throw err
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

export async function createNetwork(input: {
	name: string
	driver: string
	subnet?: string
	gateway?: string
	internal?: boolean
	labels?: Record<string, string>
}): Promise<{success: boolean; message: string; id: string}> {
	try {
		const ipamConfig = input.subnet
			? [
					{
						Subnet: input.subnet,
						...(input.gateway ? {Gateway: input.gateway} : {}),
					},
				]
			: undefined

		const result = await docker.createNetwork({
			Name: input.name,
			Driver: input.driver || 'bridge',
			Internal: input.internal || false,
			Labels: input.labels || {},
			IPAM: ipamConfig ? {Config: ipamConfig} : undefined,
		})

		return {success: true, message: `Network '${input.name}' created`, id: result.id.slice(0, 12)}
	} catch (err: any) {
		if (err.statusCode === 409) {
			throw new Error(`[conflict] Network name '${input.name}' already exists`)
		}
		throw err
	}
}

export async function removeNetwork(
	id: string,
): Promise<{success: boolean; message: string}> {
	try {
		await docker.getNetwork(id).remove()
		return {success: true, message: 'Network removed successfully'}
	} catch (err: any) {
		if (err.statusCode === 404) {
			throw new Error(`[not-found] Network not found: ${id}`)
		}
		if (err.statusCode === 403) {
			throw new Error(`[forbidden] Cannot remove predefined network`)
		}
		if (err.statusCode === 409) {
			throw new Error(`[in-use] Network has active containers — disconnect them first`)
		}
		throw err
	}
}

export async function disconnectNetwork(
	networkId: string,
	containerId: string,
): Promise<{success: boolean; message: string}> {
	try {
		await docker.getNetwork(networkId).disconnect({Container: containerId})
		return {success: true, message: `Container disconnected from network`}
	} catch (err: any) {
		if (err.statusCode === 404) {
			throw new Error(`[not-found] Network or container not found`)
		}
		if (err.statusCode === 403) {
			throw new Error(`[forbidden] Cannot disconnect from this network`)
		}
		throw err
	}
}

export async function createVolume(input: {
	name: string
	driver?: string
	driverOpts?: Record<string, string>
}): Promise<{success: boolean; message: string}> {
	try {
		await docker.createVolume({
			Name: input.name,
			Driver: input.driver || 'local',
			DriverOpts: input.driverOpts || {},
		})
		return {success: true, message: `Volume '${input.name}' created`}
	} catch (err: any) {
		if (err.statusCode === 409) {
			throw new Error(`[conflict] Volume name '${input.name}' already exists`)
		}
		throw err
	}
}

export async function volumeUsage(
	volumeName: string,
): Promise<VolumeUsageInfo[]> {
	const containers = await docker.listContainers({all: true})
	const usage: VolumeUsageInfo[] = []

	for (const c of containers) {
		const mounts = c.Mounts || []
		for (const mount of mounts) {
			if (mount.Name === volumeName || mount.Source === volumeName) {
				usage.push({
					containerName: c.Names[0]?.replace('/', '') || '',
					mountPath: mount.Destination || '',
				})
			}
		}
	}

	return usage
}

// ---------------------------------------------------------------------------
// Docker Events (Phase 46)
// ---------------------------------------------------------------------------

export async function getDockerEvents(options: {
	since?: number
	until?: number
	filters?: {type?: string[]}
}): Promise<DockerEvent[]> {
	const now = Math.floor(Date.now() / 1000)
	const sinceTs = options.since ?? now - 3600
	const untilTs = options.until ?? now

	const query: Record<string, any> = {
		since: sinceTs,
		until: untilTs,
	}
	if (options.filters?.type && options.filters.type.length > 0) {
		query.filters = JSON.stringify({type: options.filters.type})
	}

	const stream = await docker.getEvents(query) as unknown as NodeJS.ReadableStream & {destroy?: () => void}

	const events = await new Promise<DockerEvent[]>((resolve, reject) => {
		const chunks: Buffer[] = []
		const timeout = setTimeout(() => {
			if (stream.destroy) stream.destroy()
			resolve(parseEventChunks(chunks))
		}, 10_000)

		stream.on('data', (chunk: Buffer) => {
			chunks.push(chunk)
		})

		stream.on('end', () => {
			clearTimeout(timeout)
			resolve(parseEventChunks(chunks))
		})

		stream.on('error', (err: Error) => {
			clearTimeout(timeout)
			reject(err)
		})
	})

	// Sort by time descending (most recent first) and cap at 200
	return events.sort((a, b) => b.time - a.time).slice(0, 200)
}

function parseEventChunks(chunks: Buffer[]): DockerEvent[] {
	const raw = Buffer.concat(chunks).toString('utf-8')
	const lines = raw.split('\n').filter((line) => line.trim().length > 0)
	const events: DockerEvent[] = []

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line)
			events.push({
				type: parsed.Type || '',
				action: parsed.Action || '',
				actor:
					parsed.Actor?.Attributes?.name ||
					parsed.Actor?.Attributes?.image ||
					parsed.Actor?.ID?.slice(0, 12) ||
					'unknown',
				actorId: parsed.Actor?.ID || '',
				time: parsed.time || (parsed.timeNano ? Math.floor(parsed.timeNano / 1e9) : 0),
				attributes: parsed.Actor?.Attributes || {},
			})
		} catch {
			// Skip malformed JSON lines
		}
	}

	return events
}

// ---------------------------------------------------------------------------
// Docker Engine Info (Phase 46)
// ---------------------------------------------------------------------------

export async function getEngineInfo(): Promise<EngineInfo> {
	const [info, version] = await Promise.all([docker.info(), docker.version()])

	return {
		version: version.Version,
		apiVersion: version.ApiVersion,
		os: info.OperatingSystem,
		architecture: info.Architecture,
		kernelVersion: info.KernelVersion,
		storageDriver: info.Driver,
		loggingDriver: info.LoggingDriver,
		cpus: info.NCPU,
		totalMemory: info.MemTotal,
		dockerRootDir: info.DockerRootDir,
		containers: info.Containers,
		images: info.Images,
		serverTime: info.SystemTime,
	}
}
