// Phase 172-03 — `liv chat [name]` handler.
//
// Creates a chat Item via vault.items.create. PTY attach wiring lands in
// Phase 174/176 (SidebarTree + CC PTY surface).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import chalk from 'chalk'
import {createQueryClient} from '../query-client.js'

export async function chatHandler(argv: any): Promise<void> {
  const name = (argv.name as string) ?? 'new-chat'
  const client = await createQueryClient()
  const item = await client.create({
    type: 'chat',
    name,
    parentId: argv.parentId ?? null,
  })
  console.log(JSON.stringify({item}))
  console.log(chalk.dim('[liv chat] PTY attach deferred to Phase 174/176'))
}
