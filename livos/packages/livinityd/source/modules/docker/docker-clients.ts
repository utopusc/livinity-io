// Phase 22 MH-02 — Dockerode factory
//
// Replaces the module-level `const docker = new Dockerode()` singleton with a
// per-environment cached factory. `getDockerClient(envId)` returns a Dockerode
// instance built from the environments PG row; subsequent calls hit the cache
// (keyed by env.id, so 'local' alias and the canonical LOCAL_ENV_ID share one
// instance). `invalidateClient(envId)` evicts the cache after an environments
// row is updated/deleted so the next call rebuilds with fresh config.
//
// Connection strategies:
//   type='socket'  → new Dockerode({socketPath})
//   type='tcp-tls' → new Dockerode({host, port:..., protocol:'https', ca, cert, key})
//   type='agent'   → THROWS [agent-not-implemented] until Plan 22-03 lands
//                    AgentDockerClient (a Dockerode-shaped wrapper that proxies
//                    Docker API calls over an outbound WebSocket).

import Dockerode from 'dockerode'

import {getEnvironment, type Environment} from './environments.js'

// Cache by env.id (UUID string). Alias 'local' is canonicalised to LOCAL_ENV_ID
// before insertion, so the local client is shared across both lookups.
const clientCache = new Map<string, Dockerode>()

function buildClient(env: Environment): Dockerode {
	switch (env.type) {
		case 'socket':
			return new Dockerode({socketPath: env.socketPath ?? '/var/run/docker.sock'})

		case 'tcp-tls':
			if (
				!env.tcpHost ||
				!env.tcpPort ||
				!env.tlsCaPem ||
				!env.tlsCertPem ||
				!env.tlsKeyPem
			) {
				throw new Error(
					`[env-misconfigured] tcp-tls env '${env.name}' missing connection fields`,
				)
			}
			return new Dockerode({
				host: env.tcpHost,
				port: env.tcpPort,
				protocol: 'https',
				ca: env.tlsCaPem,
				cert: env.tlsCertPem,
				key: env.tlsKeyPem,
			})

		case 'agent':
			// Plan 22-03 will replace this with `new AgentDockerClient(env.agentId, ...)`.
			// Until then, agent envs cannot be used as targets — surface a clear error
			// rather than silently falling back to the local socket.
			throw new Error(
				`[agent-not-implemented] env '${env.name}' is an agent env — agent transport ships in Plan 22-03`,
			)
	}
}

/**
 * Resolve an environment id (or alias `null` / `'local'`) to a Dockerode
 * instance. Cached after first build per env.id. Throws `[env-not-found]` if
 * the env doesn't exist; throws `[agent-not-implemented]` for agent envs
 * (until Plan 22-03 wires AgentDockerClient).
 */
export async function getDockerClient(
	envIdOrAlias: string | null | undefined,
): Promise<Dockerode> {
	const env = await getEnvironment(envIdOrAlias)
	if (!env) {
		throw new Error(
			`[env-not-found] environment ${envIdOrAlias ?? '<null>'} not found`,
		)
	}
	const cached = clientCache.get(env.id)
	if (cached) return cached
	const client = buildClient(env)
	clientCache.set(env.id, client)
	return client
}

/**
 * Drop the cached Dockerode for a given env id. Call this after the env row
 * is updated or deleted so the next `getDockerClient` rebuilds from the new
 * connection fields.
 */
export function invalidateClient(envId: string): void {
	clientCache.delete(envId)
}

/**
 * Drop ALL cached clients. Used in tests; never called from production code.
 */
export function clearAllClients(): void {
	clientCache.clear()
}
