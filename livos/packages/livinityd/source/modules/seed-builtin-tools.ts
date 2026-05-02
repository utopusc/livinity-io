// Phase 50 (v29.5 A1) — Defensive eager seed of built-in tools.
//
// Writes the 9 BUILT_IN_TOOL_IDS to nexus:cap:tool:* on livinityd boot.
// Survives factory resets and the v29.4 syncAll() stub (D-WAVE5-SYNCALL-STUB).
//
// nexus's CapabilityRegistry.syncTools() will OVERWRITE these manifests with
// the real tool descriptions when it runs (pipeline.set is unconditional).
// This seed is the fallback floor — keys are always present.

import {BUILT_IN_TOOL_IDS} from './diagnostics/capabilities.js'

// Minimal RedisLike interface — matches the subset used by this module.
// Avoids cross-package type import; ioredis-compatible.
export interface RedisLike {
	set(key: string, value: string): Promise<unknown>
}

// Manifest shape mirrors nexus CapabilityManifest. Duplicated locally to
// avoid cross-package coupling — Phase 50 explicitly does NOT depend on
// nexus types at compile time.
interface SeedManifest {
	id: string
	type: 'tool'
	name: string
	description: string
	semantic_tags: string[]
	triggers: string[]
	provides_tools: string[]
	requires: string[]
	conflicts: string[]
	context_cost: number
	tier: 'any'
	source: 'system'
	status: 'active'
	last_used_at: number
	registered_at: number
}

// Hardcoded fallback descriptions. Real descriptions arrive when nexus's
// syncTools() overwrites these. Keep these short — they only show up if
// the user hits the registry before syncTools has run.
const FALLBACK_DESCRIPTIONS: Record<string, string> = {
	shell: 'Execute shell commands on the host',
	docker_run: 'Run a Docker container',
	docker_ps: 'List running Docker containers',
	docker_logs: 'Read logs from a Docker container',
	docker_stop: 'Stop a Docker container',
	files_read: 'Read a file from the local filesystem',
	files_write: 'Write a file to the local filesystem',
	files_search: 'Search for files matching a pattern',
	web_search: 'Search the web for information',
}

const REDIS_PREFIX = 'nexus:cap:'
const SENTINEL_KEY = `${REDIS_PREFIX}_meta:lastSeedAt`

/**
 * Idempotent — calling twice produces identical Redis state. SET overwrites
 * on every call; sentinel key updates each time. Safe to invoke on every
 * livinityd boot.
 */
export async function seedBuiltinTools(redis: RedisLike): Promise<void> {
	const now = Date.now()
	for (const id of BUILT_IN_TOOL_IDS) {
		// IDs are 'tool:shell', 'tool:docker_run', etc. — strip prefix for
		// the name field and the Redis key suffix.
		const name = id.replace(/^tool:/, '')
		const description = FALLBACK_DESCRIPTIONS[name] ?? `Built-in ${name} tool`
		const manifest: SeedManifest = {
			id,
			type: 'tool',
			name,
			description,
			semantic_tags: [],
			triggers: [],
			provides_tools: [name],
			requires: [],
			conflicts: [],
			context_cost: 0,
			tier: 'any',
			source: 'system',
			status: 'active',
			last_used_at: 0,
			registered_at: now,
		}
		await redis.set(`${REDIS_PREFIX}tool:${name}`, JSON.stringify(manifest))
	}
	await redis.set(SENTINEL_KEY, new Date(now).toISOString())
}
