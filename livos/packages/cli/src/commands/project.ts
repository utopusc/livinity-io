// Phase 172-03 — `liv project <subcmd>` handler.
//
// Maps to vault.items.* tRPC calls via createQueryClient. Same call shape
// is also exposed under `liv query item.create-project` for skill callers.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import chalk from 'chalk'
import {createQueryClient} from '../query-client.js'

export async function projectHandler(argv: any): Promise<void> {
  const subcmd = argv.subcmd as 'new' | 'list' | 'open'
  const client = await createQueryClient()
  switch (subcmd) {
    case 'new': {
      const name = argv.name as string
      if (!name) {
        console.error(chalk.red('liv project new: --name required'))
        process.exit(1)
      }
      const item = await client.create({
        type: 'project',
        name,
        cwd: argv.cwd,
        parentId: argv.parentId ?? null,
      })
      console.log(JSON.stringify({item}))
      return
    }
    case 'list': {
      const items = await client.list({archived: false})
      const projects = items.filter((i) => i.type === 'project')
      console.log(JSON.stringify({items: projects}))
      return
    }
    case 'open': {
      const id = argv.id as string
      if (!id) {
        console.error(chalk.red('liv project open: --id required'))
        process.exit(1)
      }
      const item = await client.get(id)
      console.log(JSON.stringify({item}))
      return
    }
    default:
      console.error(chalk.red(`liv project: unknown subcmd '${subcmd}'`))
      process.exit(1)
  }
}
