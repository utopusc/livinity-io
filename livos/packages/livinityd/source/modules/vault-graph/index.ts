/**
 * Phase 169-01 — Vault graph module barrel.
 *
 * Re-exports the walker + parser primitives so downstream consumers
 * (169-02 builder + routes, 169-05 boot wire-up) can `import {...}
 * from '../vault-graph/index.js'` without reaching past the boundary.
 */

export {walkVault} from './walker.js'
export type {VaultFile} from './walker.js'
export {parseFrontmatter, extractWikilinks} from './parser.js'
