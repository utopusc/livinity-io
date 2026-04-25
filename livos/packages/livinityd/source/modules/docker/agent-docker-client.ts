// Phase 22 MH-04 — AgentDockerClient: Dockerode-shaped wrapper that proxies
// every method call over the WS to a connected docker-agent.
//
// Surface area covers ALL methods that `docker.ts` actually invokes (verified
// by grep over docker.ts for `docker.X` and `getContainer().X`). Any method
// the file would call but that requires bidirectional streaming (exec, attach,
// follow:true logs, stream:true stats) throws [agent-streaming-unsupported] —
// these are explicit v28.0 follow-ups documented in the SUMMARY.
//
// Type contract: this class is cast to `Dockerode` at the docker-clients.ts
// call site. We control every callsite of the cast (only docker.ts uses the
// returned client), so the structural-typing risk is bounded. If docker.ts
// ever calls a method we don't implement, it'll throw at runtime with a clear
// `is not a function` (or [agent-streaming-unsupported] if listed below).

import {agentRegistry} from './agent-registry.js'

class AgentContainerHandle {
	constructor(
		private agentId: string,
		private id: string,
	) {}

	start = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'container.start', [this.id, opts])
	stop = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'container.stop', [this.id, opts])
	restart = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'container.restart', [this.id, opts])
	kill = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'container.kill', [this.id, opts])
	pause = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'container.pause', [this.id, opts])
	unpause = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'container.unpause', [this.id, opts])
	remove = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'container.remove', [this.id, opts])
	rename = (opts: any) =>
		agentRegistry.sendRequest(this.agentId, 'container.rename', [this.id, opts])
	inspect = () => agentRegistry.sendRequest(this.agentId, 'container.inspect', [this.id])

	stats = (opts?: any) => {
		if (opts?.stream) {
			throw new Error(
				'[agent-streaming-unsupported] container.stats stream not supported in v27.0',
			)
		}
		return agentRegistry.sendRequest(this.agentId, 'container.stats', [
			this.id,
			{stream: false},
		])
	}

	logs = async (opts?: any) => {
		if (opts?.follow) {
			throw new Error(
				'[agent-streaming-unsupported] container.logs follow not supported in v27.0',
			)
		}
		// proxy.ts on the agent side base64-encodes the buffer to preserve binary
		// over JSON. Decode here so callers get a Buffer just like local Dockerode.
		const b64 = (await agentRegistry.sendRequest(this.agentId, 'container.logs', [
			this.id,
			opts,
		])) as string
		return Buffer.from(b64, 'base64')
	}

	exec = () => {
		throw new Error(
			'[agent-streaming-unsupported] container.exec not supported in v27.0 — see v28 follow-up',
		)
	}
	putArchive = () => {
		throw new Error(
			'[agent-streaming-unsupported] container.putArchive not supported in v27.0',
		)
	}
	getArchive = () => {
		throw new Error(
			'[agent-streaming-unsupported] container.getArchive not supported in v27.0',
		)
	}
	attach = () => {
		throw new Error(
			'[agent-streaming-unsupported] container.attach not supported in v27.0',
		)
	}
}

class AgentImageHandle {
	constructor(
		private agentId: string,
		private id: string,
	) {}

	tag = (opts: any) => agentRegistry.sendRequest(this.agentId, 'image.tag', [this.id, opts])
	remove = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'image.remove', [this.id, opts])
	history = () => agentRegistry.sendRequest(this.agentId, 'image.history', [this.id])
	inspect = () => agentRegistry.sendRequest(this.agentId, 'image.inspect', [this.id])
}

class AgentNetworkHandle {
	constructor(
		private agentId: string,
		private id: string,
	) {}

	inspect = () => agentRegistry.sendRequest(this.agentId, 'network.inspect', [this.id])
	remove = () => agentRegistry.sendRequest(this.agentId, 'network.remove', [this.id])
	disconnect = (opts: any) =>
		agentRegistry.sendRequest(this.agentId, 'network.disconnect', [this.id, opts])
	connect = (opts: any) =>
		agentRegistry.sendRequest(this.agentId, 'network.connect', [this.id, opts])
}

class AgentVolumeHandle {
	constructor(
		private agentId: string,
		private name: string,
	) {}

	remove = () => agentRegistry.sendRequest(this.agentId, 'volume.remove', [this.name])
	inspect = () => agentRegistry.sendRequest(this.agentId, 'volume.inspect', [this.name])
}

/**
 * Dockerode-shaped wrapper. Methods proxy through agentRegistry; handle
 * factories (getContainer/getImage/getNetwork/getVolume) return per-id Handle
 * objects whose methods also proxy. The shape matches what docker.ts uses;
 * any other Dockerode method either:
 *   - is on the v28 streaming follow-up list, or
 *   - throws naturally at runtime if invoked (caller bug)
 */
export class AgentDockerClient {
	constructor(private agentId: string) {}

	listContainers = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'listContainers', [opts])
	listImages = (opts?: any) =>
		agentRegistry.sendRequest(this.agentId, 'listImages', [opts])
	listVolumes = () => agentRegistry.sendRequest(this.agentId, 'listVolumes', [])
	listNetworks = () => agentRegistry.sendRequest(this.agentId, 'listNetworks', [])
	info = () => agentRegistry.sendRequest(this.agentId, 'info', [])
	version = () => agentRegistry.sendRequest(this.agentId, 'version', [])
	pruneImages = () => agentRegistry.sendRequest(this.agentId, 'pruneImages', [])
	pruneContainers = () => agentRegistry.sendRequest(this.agentId, 'pruneContainers', [])
	pruneVolumes = () => agentRegistry.sendRequest(this.agentId, 'pruneVolumes', [])
	pruneNetworks = () => agentRegistry.sendRequest(this.agentId, 'pruneNetworks', [])

	createContainer = async (opts: any) => {
		const result = (await agentRegistry.sendRequest(this.agentId, 'createContainer', [
			opts,
		])) as {id: string}
		// Return a Handle whose methods proxy — matches Dockerode.createContainer
		// which returns a Container object, not just an id.
		return new AgentContainerHandle(this.agentId, result.id) as unknown as {
			id: string
			start: (...args: any[]) => Promise<unknown>
		}
	}

	createNetwork = async (opts: any) => {
		const result = (await agentRegistry.sendRequest(this.agentId, 'createNetwork', [
			opts,
		])) as {id: string}
		return new AgentNetworkHandle(this.agentId, result.id) as unknown as {id: string}
	}

	createVolume = (opts: any) =>
		agentRegistry.sendRequest(this.agentId, 'createVolume', [opts])

	getContainer = (id: string) => new AgentContainerHandle(this.agentId, id)
	getImage = (id: string) => new AgentImageHandle(this.agentId, id)
	getNetwork = (id: string) => new AgentNetworkHandle(this.agentId, id)
	getVolume = (name: string) => new AgentVolumeHandle(this.agentId, name)

	/**
	 * pull: Dockerode signature is `pull(image, callback)` where callback gets
	 * (err, stream) and the caller invokes `modem.followProgress(stream, ...)`
	 * to wait for the pull to complete. We synthesise that signature: fire the
	 * `pull` request to the agent (which waits server-side), then synthesise a
	 * stream that ends immediately so `followProgress` resolves.
	 *
	 * Streaming pull progress is a v28 follow-up.
	 */
	pull = (image: string, callback: (err: any, stream: any) => void) => {
		agentRegistry
			.sendRequest(this.agentId, 'pull', [image])
			.then(() => {
				const fakeStream = {
					on: (event: string, fn: any) => {
						if (event === 'end') setImmediate(fn)
					},
					pipe: () => {
						/* no-op */
					},
				}
				callback(null, fakeStream)
			})
			.catch((err) => callback(err, null))
	}

	modem = {
		followProgress: (stream: any, onFinished: (err: any) => void) => {
			stream.on('end', () => onFinished(null))
		},
	}

	/**
	 * getEvents — one-shot only (until-bounded). Streaming event-bus is a v28
	 * follow-up. The agent collects events for up to 5s and returns them as an
	 * array; we surface them as a stream-shaped object so docker.ts's existing
	 * stream-iteration code keeps working.
	 *
	 * The current docker.ts caller iterates with `stream.on('data', ...)`; we
	 * synthesise that by emitting each event then 'end'.
	 */
	getEvents = async (opts: any) => {
		const events = (await agentRegistry.sendRequest(this.agentId, 'getEvents', [
			opts,
		])) as unknown[]
		// Return a stream-shaped object that emits events then ends.
		const handlers: Record<string, ((arg?: unknown) => void)[]> = {}
		const stream: any = {
			on(event: string, fn: (arg?: unknown) => void) {
				;(handlers[event] ??= []).push(fn)
				return stream
			},
			destroy() {
				/* no-op */
			},
		}
		// Dispatch synchronously after the next microtask so callers attach handlers first.
		setImmediate(() => {
			for (const event of events) {
				const buf = Buffer.from(JSON.stringify(event) + '\n', 'utf-8')
				;(handlers['data'] ?? []).forEach((fn) => fn(buf))
			}
			;(handlers['end'] ?? []).forEach((fn) => fn())
		})
		return stream
	}
}
