// Phase 162-01 + 162-03 — claude-runner module barrel.
//
// Re-exports the canonical scaffoldVault (Phase 162-01) and smokeAuthCheck
// (Phase 162-03) APIs so callers (livinityd start()) can do:
//   import {scaffoldVault, smokeAuthCheck} from './modules/claude-runner/index.js'

export {scaffoldVault} from './vault-scaffolder.js'
export type {ScaffoldVaultOptions, ScaffoldResult} from './vault-scaffolder.js'

export {smokeAuthCheck} from './auth-verifier.js'
export type {AuthVerifierOptions, AuthVerifierResult} from './auth-verifier.js'

// Phase 163-01 — surface-context vault scaffolder (per-app CLAUDE.md).
export {writeSurfaceContext, removeSurfaceContext} from './surface-context.js'
export type {
	SurfaceKind,
	SurfaceMetadata,
	WriteSurfaceContextOptions,
	WriteSurfaceContextResult,
	RemoveSurfaceContextOptions,
	RemoveSurfaceContextResult,
} from './surface-context.js'

// Phase 165-01 — idle CC session reaper. Polls every 5 min; aborts
// AgentSessionManager sessions whose last user WS-message is older than
// `liv:config:idle_reap_min` minutes (default 30). Reaper accesses session
// state ONLY through the injected SessionActivityProvider interface
// implemented by ws-agent.ts (createSessionActivityProvider). The
// liv-core agent-session.ts file is UNCHANGED — see Phase 165 quality gate.
export {IdleSessionReaper} from './idle-reaper.js'
export type {
	IdleSessionReaperOptions,
	SessionActivityProvider,
	SessionSnapshot,
	IdleReaperLogger,
} from './idle-reaper.js'
