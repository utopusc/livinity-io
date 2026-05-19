// Phase 162-01 — claude-runner module barrel.
//
// Re-exports the canonical scaffoldVault API so callers (livinityd start())
// can `import {scaffoldVault} from './modules/claude-runner/index.js'`.
// Future Phase 162-03 will add the auth-verifier export here.

export {scaffoldVault} from './vault-scaffolder.js'
export type {ScaffoldVaultOptions, ScaffoldResult} from './vault-scaffolder.js'
