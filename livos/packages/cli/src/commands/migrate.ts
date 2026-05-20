// Phase 172-03 — `liv migrate` skeleton.
//
// Vault rename + schema migration lands in Phase 173. For now the command
// surface exists but emits a deferred message so the contract is visible
// in `liv --help`.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import chalk from 'chalk'

export async function migrateHandler(_argv: any): Promise<void> {
  console.log(
    chalk.yellow(
      '[liv migrate] deferred to Phase 173 (vault rename + migration)',
    ),
  )
  process.exit(0)
}
