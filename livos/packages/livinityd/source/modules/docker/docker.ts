import Dockerode from 'dockerode'

import {PROTECTED_CONTAINER_PATTERNS, type ContainerInfo, type PortMapping, type ContainerOperation} from './types.js'

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
