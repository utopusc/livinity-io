// Phase 172-05 — complete `liv init` handler.
// Replaces the Plan 172-03 skeleton. Same export name + signature so the
// Plan 172-03 cli.ts wiring is preserved.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import chalk from 'chalk'
import {homedir} from 'node:os'
import {resolve, join} from 'node:path'
import {bootstrapVault} from '../vault-bootstrap.js'

function resolveVaultPath(arg: unknown): string {
  if (typeof arg === 'string' && arg.length > 0) {
    // Expand ~ to HOME
    if (arg === '~') {
      return homedir()
    }
    if (arg.startsWith('~/') || arg.startsWith('~\\')) {
      return resolve(homedir(), arg.slice(2))
    }
    return resolve(arg)
  }
  // Default per D-V38-A: ~/liv/
  return join(homedir(), 'liv')
}

export async function initHandler(argv: any): Promise<void> {
  const target = resolveVaultPath(argv.path)
  const force = argv.force === true
  try {
    const result = await bootstrapVault({path: target, force})
    console.log(JSON.stringify({ok: true, ...result}))
    console.error(chalk.green(`[liv init] vault initialized at ${target}`))
  } catch (err: any) {
    console.error(chalk.red(`[liv init] ${err.message}`))
    process.exit(1)
  }
}
