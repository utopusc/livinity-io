/**
 * Phase 44 Plan 44-02 — IP → container_name reverse lookup.
 *
 * Best-effort observability source for the broker_usage.app_id column. Per
 * D-44-07 this is observability only; the column is nullable and the function
 * returns null on any failure rather than throwing.
 *
 * 60s in-memory TTL cache prevents one Docker socket round-trip per broker
 * request from the same container. Cache misses fall through to a single
 * `listContainers({all: false})` call (~10-50ms on Mini PC) and the result
 * (including null misses) is cached for 60s to avoid retry storms.
 */

import Dockerode from 'dockerode'

type CacheEntry = {containerName: string | null; expiresAt: number}

const TTL_MS = 60_000
const cache = new Map<string, CacheEntry>()

/**
 * Resolve the Docker container name for a given source IP, or null if no
 * match (loopback, host network, livinityd-internal calls, listContainers
 * failure, etc.).
 *
 * Strips IPv4-mapped IPv6 prefix `::ffff:`. Loopback addresses (127.0.0.1,
 * ::1) short-circuit to null.
 */
export async function resolveAppIdFromIp(ip: string): Promise<string | null> {
	if (!ip) return null
	const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip
	if (cleanIp === '127.0.0.1' || cleanIp === '::1') return null

	const cached = cache.get(cleanIp)
	if (cached && cached.expiresAt > Date.now()) return cached.containerName

	try {
		const docker = new Dockerode({socketPath: '/var/run/docker.sock'})
		const containers = await docker.listContainers({all: false})
		let found: string | null = null
		for (const c of containers) {
			const networks = c.NetworkSettings?.Networks ?? {}
			for (const net of Object.values(networks)) {
				if ((net as {IPAddress?: string}).IPAddress === cleanIp) {
					found = c.Names?.[0]?.replace(/^\//, '') ?? null
					break
				}
			}
			if (found) break
		}
		cache.set(cleanIp, {containerName: found, expiresAt: Date.now() + TTL_MS})
		return found
	} catch {
		cache.set(cleanIp, {containerName: null, expiresAt: Date.now() + TTL_MS})
		return null
	}
}

/** Test-only helper to reset cache between integration test cases. */
export function _clearContainerResolverCache(): void {
	cache.clear()
}
