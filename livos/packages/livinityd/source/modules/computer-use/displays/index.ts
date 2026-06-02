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

export {
	createDisplayManager,
	// Phase 254 (decision #3) — shared default display resolution so the host
	// `:1` creation in index.ts matches the MCP display-creation default size.
	DEFAULT_DISPLAY_WIDTH,
	DEFAULT_DISPLAY_HEIGHT,
} from './display-manager.js'

export {
	createDisplayTtlGc,
	DISPLAY_TTL_GC_DEFAULT_IDLE_MS,
	DISPLAY_TTL_GC_DEFAULT_SWEEP_MS,
} from './display-ttl-gc.js'

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
	RegisterExistingInput,
	SpawnHandle,
} from './types.js'

export type {DisplayTtlGcDeps, IdleDisplaySweep} from './display-ttl-gc.js'
