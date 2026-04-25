// Phase 22 MH-04 — Local Dockerode dispatcher for the outbound agent.
//
// Receives AgentRequest{method, args} over WS, calls the matching local
// Dockerode method, returns AgentResponse{result|error}. The dispatch table
// mirrors AgentDockerClient on the server side (any method added there must
// have a matching handler here).
//
// container.logs returns BASE64-ENCODED Buffer because raw bytes don't
// survive JSON serialisation. AgentDockerClient.logs() on the server side
// decodes back to a Buffer.
//
// Streaming methods (exec, attach, follow:true logs, stream:true stats,
// follow getEvents) are NOT in the dispatch table — the server-side client
// throws [agent-streaming-unsupported] before the request is even sent. v28.

import Dockerode from 'dockerode'

import type {AgentRequest, AgentResponse} from './protocol.js'

const docker = new Dockerode()

type Handler = (args: unknown[]) => Promise<unknown>

const handlers: Record<string, Handler> = {
	listContainers: async ([opts]) => docker.listContainers(opts as any),
	listImages: async ([opts]) => docker.listImages(opts as any),
	listVolumes: async () => docker.listVolumes(),
	listNetworks: async () => docker.listNetworks(),
	info: async () => docker.info(),
	version: async () => docker.version(),
	pruneImages: async () => docker.pruneImages(),
	pruneContainers: async () => docker.pruneContainers(),
	pruneVolumes: async () => docker.pruneVolumes(),
	pruneNetworks: async () => docker.pruneNetworks(),

	createContainer: async ([opts]) => {
		const c = await docker.createContainer(opts as any)
		return {id: c.id}
	},
	createNetwork: async ([opts]) => {
		const n = await docker.createNetwork(opts as any)
		return {id: n.id}
	},
	createVolume: async ([opts]) => {
		await docker.createVolume(opts as any)
		return {success: true}
	},

	pull: async ([image]) => {
		// Sync-style: wait for pull to complete server-side, return success.
		// Streaming pull progress is a v28 follow-up.
		await new Promise<void>((resolve, reject) => {
			docker.pull(image as string, (err: any, stream: any) => {
				if (err) return reject(err)
				docker.modem.followProgress(stream, (followErr: any) =>
					followErr ? reject(followErr) : resolve(),
				)
			})
		})
		return {success: true}
	},

	getEvents: async ([opts]) => {
		// One-shot: collect events for up to 5s, return as an array. The server
		// AgentDockerClient.getEvents() synthesises a stream that emits these.
		const o = (opts as any) ?? {}
		const stream = (await docker.getEvents(o)) as unknown as NodeJS.ReadableStream & {
			destroy?: () => void
		}
		return new Promise<unknown[]>((resolve, reject) => {
			const chunks: Buffer[] = []
			let settled = false
			const finish = () => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				try {
					stream.destroy?.()
				} catch {
					/* ignore */
				}
				const text = Buffer.concat(chunks).toString('utf-8')
				const lines = text.split('\n').filter(Boolean)
				const events: unknown[] = []
				for (const line of lines) {
					try {
						events.push(JSON.parse(line))
					} catch {
						// skip malformed
					}
				}
				resolve(events)
			}
			const timer = setTimeout(finish, 5_000)
			stream.on('data', (c: Buffer) => chunks.push(c))
			stream.on('end', finish)
			stream.on('error', (err: Error) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				reject(err)
			})
		})
	},

	// Container handles
	'container.start': async ([id]) => {
		await docker.getContainer(id as string).start()
		return {success: true}
	},
	'container.stop': async ([id]) => {
		await docker.getContainer(id as string).stop()
		return {success: true}
	},
	'container.restart': async ([id]) => {
		await docker.getContainer(id as string).restart()
		return {success: true}
	},
	'container.kill': async ([id]) => {
		await docker.getContainer(id as string).kill()
		return {success: true}
	},
	'container.pause': async ([id]) => {
		await docker.getContainer(id as string).pause()
		return {success: true}
	},
	'container.unpause': async ([id]) => {
		await docker.getContainer(id as string).unpause()
		return {success: true}
	},
	'container.remove': async ([id, opts]) => {
		await docker.getContainer(id as string).remove(opts as any)
		return {success: true}
	},
	'container.rename': async ([id, opts]) => {
		await docker.getContainer(id as string).rename(opts as any)
		return {success: true}
	},
	'container.inspect': async ([id]) => docker.getContainer(id as string).inspect(),
	'container.stats': async ([id, opts]) =>
		docker.getContainer(id as string).stats({...((opts as any) ?? {}), stream: false}),
	'container.logs': async ([id, opts]) => {
		const buf = (await docker
			.getContainer(id as string)
			.logs({...((opts as any) ?? {}), follow: false})) as unknown as Buffer
		// base64 to preserve binary safely over JSON. Server side decodes back to Buffer.
		return Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(String(buf)).toString('base64')
	},

	// Image handles
	'image.tag': async ([id, opts]) => {
		await docker.getImage(id as string).tag(opts as any)
		return {success: true}
	},
	'image.remove': async ([id, opts]) => docker.getImage(id as string).remove(opts as any),
	'image.history': async ([id]) => docker.getImage(id as string).history(),
	'image.inspect': async ([id]) => docker.getImage(id as string).inspect(),

	// Network handles
	'network.inspect': async ([id]) => docker.getNetwork(id as string).inspect(),
	'network.remove': async ([id]) => {
		await docker.getNetwork(id as string).remove()
		return {success: true}
	},
	'network.disconnect': async ([id, opts]) => {
		await docker.getNetwork(id as string).disconnect(opts as any)
		return {success: true}
	},
	'network.connect': async ([id, opts]) => {
		await docker.getNetwork(id as string).connect(opts as any)
		return {success: true}
	},

	// Volume handles
	'volume.remove': async ([name]) => {
		await docker.getVolume(name as string).remove()
		return {success: true}
	},
	'volume.inspect': async ([name]) => docker.getVolume(name as string).inspect(),
}

/**
 * Translate an AgentRequest into a Dockerode call and return the response.
 * Always returns an AgentResponse — never throws (errors are wrapped).
 */
export async function dispatch(req: AgentRequest): Promise<AgentResponse> {
	const handler = handlers[req.method]
	if (!handler) {
		return {
			type: 'response',
			requestId: req.requestId,
			error: {
				message: `unknown-method: ${req.method}`,
				code: 'METHOD_NOT_FOUND',
			},
		}
	}
	try {
		const result = await handler(req.args)
		return {type: 'response', requestId: req.requestId, result}
	} catch (err: any) {
		return {
			type: 'response',
			requestId: req.requestId,
			error: {
				message: err?.message ?? String(err),
				statusCode: err?.statusCode,
				code: err?.code,
			},
		}
	}
}

/**
 * Used by the agent's register handshake to advertise the local Docker
 * version. Best-effort — falls back to undefined if the daemon is unreachable.
 */
export async function getDockerVersion(): Promise<string | undefined> {
	try {
		const v = await docker.version()
		return v.Version
	} catch {
		return undefined
	}
}
