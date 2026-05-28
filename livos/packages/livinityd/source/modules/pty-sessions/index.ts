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

// Phase 243-02 — WS endpoint factory + feature flag.
export {
	isTerminalPanelEnabled,
	TERMINAL_PANEL_REDIS_KEY,
} from './feature-flag.js'
export type {TerminalFlagRedisClient} from './feature-flag.js'

export {createPtyTerminalWsHandler} from './ws-handler.js'
export type {CreateHandlerDeps, PtySessionLike} from './ws-handler.js'
