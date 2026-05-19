// Phase 162-01 + 162-03 — claude-runner module barrel.
//
// Re-exports the canonical scaffoldVault (Phase 162-01) and smokeAuthCheck
// (Phase 162-03) APIs so callers (livinityd start()) can do:
//   import {scaffoldVault, smokeAuthCheck} from './modules/claude-runner/index.js'

export {scaffoldVault} from './vault-scaffolder.js'
export type {ScaffoldVaultOptions, ScaffoldResult} from './vault-scaffolder.js'

export {smokeAuthCheck} from './auth-verifier.js'
export type {AuthVerifierOptions, AuthVerifierResult} from './auth-verifier.js'
