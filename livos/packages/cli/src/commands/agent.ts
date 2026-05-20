// Phase 172-03 — `liv agent <subcmd>` handler.
//
// 'new' creates an agent Item via vault.items.create. Other subcommands
// (run/stop/inbox) are Phase 176/177 scope and emit a deferred message.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import chalk from 'chalk'
import {createQueryClient} from '../query-client.js'

export async function agentHandler(argv: any): Promise<void> {
  const subcmd = argv.subcmd as 'new' | 'run' | 'stop' | 'inbox'
  if (subcmd === 'new') {
    const client = await createQueryClient()
    const name = argv.name as string
    if (!name) {
      console.error(chalk.red('liv agent new: --name required'))
      process.exit(1)
    }
    const item = await client.create({
      type: 'agent',
      name,
      schedule: argv.schedule,
      parentId: argv.parentId ?? null,
    })
    console.log(JSON.stringify({item}))
    return
  }
  // run/stop/inbox are Phase 176/177 scope — emit a clear deferred message
  console.log(chalk.yellow(`[liv agent ${subcmd}] deferred to Phase 176/177`))
  process.exit(0)
}
