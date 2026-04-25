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
//   type='agent'   → new AgentDockerClient(env.agentId) — Dockerode-shaped wrapper
//                    that proxies Docker API calls over an outbound WebSocket
//                    (Plan 22-03; replaces the [agent-not-implemented] placeholder).

import Dockerode from 'dockerode'

import {AgentDockerClient} from './agent-docker-client.js'
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
			if (!env.agentId) {
				throw new Error(
					`[env-misconfigured] agent env '${env.name}' has no agent_id — generate a token via Settings > Environments`,
				)
			}
			// AgentDockerClient implements the subset of Dockerode methods that
			// docker.ts uses. Cast through `unknown` because TypeScript can't
			// statically verify the structural match (we control every callsite
			// of the cast — only docker.ts uses the returned client).
			return new AgentDockerClient(env.agentId) as unknown as Dockerode
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
