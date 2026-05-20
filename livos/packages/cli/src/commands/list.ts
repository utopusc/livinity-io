// Phase 172-03 — `liv list` handler.
//
// Calls vault.items.list. With --tree, builds a parent/children tree:
//   - filesystem-mode → reads tree.json directly off disk
//   - daemon-mode    → groups items by parentId and emits the root array
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import {createQueryClient} from '../query-client.js'
import {readTreeFromDisk} from '../filesystem-mode.js'

export async function listHandler(argv: any): Promise<void> {
  const client = await createQueryClient()
  const items = await client.list({archived: argv.archived === true})
  if (argv.tree) {
    if (client.lastUsedFilesystemMode()) {
      const tree = await readTreeFromDisk()
      console.log(JSON.stringify({tree, mode: 'filesystem'}))
      return
    }
    // Client-side tree build: group by parentId
    const byParent = new Map<string | null, any[]>()
    for (const item of items) {
      const key = item.parentId ?? null
      const arr = byParent.get(key) ?? []
      arr.push(item)
      byParent.set(key, arr)
    }
    console.log(JSON.stringify({tree: byParent.get(null) ?? [], mode: 'daemon'}))
    return
  }
  console.log(JSON.stringify({items}))
}
