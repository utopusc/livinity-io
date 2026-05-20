// Phase 172-03 — `liv config <action> [key] [value]` handler.
//
// Dispatches to the same config.get/config.set query handlers used by
// `liv query config.get/set` — filesystem-only (~/.livos/config.json).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import {buildDefaultRegistry} from '../query/handlers.js'

export async function configHandler(argv: any): Promise<void> {
  const action = argv.action as 'get' | 'set'
  const registry = buildDefaultRegistry()
  const key = argv.key as string | undefined
  const value = argv.value as string | undefined
  if (action === 'get') {
    const result = await registry.dispatch(
      'config.get',
      key ? [key] : [],
      {},
      {projectDir: process.cwd()},
    )
    console.log(JSON.stringify(result))
    return
  }
  if (action === 'set') {
    if (!key || value === undefined) {
      console.error('liv config set: <key> <value> required')
      process.exit(1)
    }
    const result = await registry.dispatch(
      'config.set',
      [key, value],
      {},
      {projectDir: process.cwd()},
    )
    console.log(JSON.stringify(result))
  }
}
