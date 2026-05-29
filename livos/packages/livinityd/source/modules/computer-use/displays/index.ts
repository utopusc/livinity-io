/**
 * Phase 248-01 — displays module barrel.
 *
 * Public surface consumed by:
 *   - Plan 248-02 (MCP tool registrations for computer_create_display etc.)
 *   - Plan 248-03 (TTL GC for idle displays — 4h since last_app_at)
 *
 * Follows the `.js` extension convention used by the rest of livinityd for
 * NodeNext / ESM resolution.
 */

export {createDisplayManager} from './display-manager.js'

export {
	DISPLAY_REDIS_PREFIX,
	DISPLAY_REDIS_SCAN_PATTERN,
	redisKeyForDisplay,
	redisKeyForDisplayApps,
} from './redis-keys.js'

export type {
	AttachAppInput,
	CreateDisplayInput,
	CreateDisplayResult,
	DisplayManager,
	DisplayManagerDeps,
	DisplayMode,
	DisplayRecord,
	DisplayRedisClient,
	DisplaySpawnFn,
	IsOwnerInput,
	KillDisplayResult,
	ProcessKillFn,
	SpawnHandle,
} from './types.js'
