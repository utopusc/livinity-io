// Phase 172-03 — `liv query <argv...>` handler.
//
// Dispatches to the query registry via longest-prefix routing. Skill
// callers use this as the canonical entry-point (mirrors gsd-sdk query).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import chalk from 'chalk'
import {resolveQueryArgv} from '../query/registry.js'
import {buildDefaultRegistry} from '../query/handlers.js'

export async function queryHandler(argv: any): Promise<void> {
  const tokens = (argv.argv as string[]) ?? []
  if (tokens.length === 0) {
    console.error(chalk.red('liv query: at least one argv token required'))
    process.exit(1)
  }
  const registry = buildDefaultRegistry()
  const matched = resolveQueryArgv(tokens, registry)
  if (!matched) {
    console.error(
      chalk.red(`liv query: no handler for argv ${JSON.stringify(tokens)}`),
    )
    console.error(chalk.dim('Registered handlers:'))
    for (const c of registry.commands().sort()) console.error(chalk.dim(`  - ${c}`))
    process.exit(1)
  }
  // Pass through yargs flags (everything not in tokens) via argv object.
  // yargs already extracted flags into argv.*; pluck the ones the handler may consume.
  const flags: Record<string, string | boolean> = {}
  for (const [k, v] of Object.entries(argv)) {
    if (k === '_' || k === '$0' || k === 'argv') continue
    if (typeof v === 'string' || typeof v === 'boolean') flags[k] = v
  }
  try {
    const result = await registry.dispatch(
      matched.cmd,
      matched.args,
      flags,
      {projectDir: process.cwd()},
    )
    console.log(JSON.stringify(result))
  } catch (err: any) {
    console.error(chalk.red(`[liv query ${matched.cmd}] ${err.message}`))
    process.exit(1)
  }
}
