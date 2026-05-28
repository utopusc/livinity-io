// Phase 243-01 Task 3 — pty-sessions module barrel.
//
// Public surface consumed by Plan 243-02 (WS endpoint at /livos/terminal/ws).
// Follows the `.js` extension convention used by cli-installer for
// NodeNext / ESM resolution.

export {PtySession} from './session.js'
export type {PtySessionDeps, MinimalPty} from './session.js'

export {
	writeSessionMetadata,
	readSessionMetadata,
	deleteSessionMetadata,
	PTY_SESSION_REDIS_PREFIX,
} from './metadata.js'

export type {
	PtySessionMetadata,
	PtySpawnOptions,
	SessionEventMap,
	PtyMetadataRedisClient,
} from './types.js'
