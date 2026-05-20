// Phase 172-02 — filesystem-mode fallback for @livos/cli.
//
// When livinityd is unreachable (ECONNREFUSED), read-only commands
// (list, get) fall back to direct disk reads. Mutations are NEVER
// permitted in filesystem-mode — the daemon owns tmux + scheduling
// + Redis pub/sub, and writing directly to items/<uuid>/item.json
// would skip ItemStore's validation gates (cycle-check on move,
// type-discriminated field gating on create, etc.). Mutations in
// this mode throw `FilesystemModeMutationError` which the CLI maps
// to a red error message + exit 1 (T-V38-CLI-02 mitigation).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + Phase 171 vault-items source UNCHANGED. This file mirrors the
// on-disk layout (D-V38-T) without importing the livinityd modules.

import {readdir, readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

export class FilesystemModeMutationError extends Error {
  constructor(opName: string) {
    super(
      `[liv] livinityd is offline — '${opName}' requires the daemon to enforce ItemStore invariants. ` +
        `Boot livinityd or run a read-only command (list/get/config-get).`,
    )
    this.name = 'FilesystemModeMutationError'
  }
}

export interface FilesystemModeOptions {
  vaultRoot?: string
  env?: Record<string, string | undefined>
}

function resolveVaultRoot(opts: FilesystemModeOptions = {}): string {
  const env = opts.env ?? process.env
  if (opts.vaultRoot) return opts.vaultRoot
  return env.LIV_VAULT_ROOT ?? join(homedir(), 'liv')
}

/**
 * Read all item.json files under <vaultRoot>/items/. Tolerates missing
 * directory (returns []), bubbles any other I/O error.
 */
export async function readItemsFromDisk(
  opts: FilesystemModeOptions = {},
): Promise<any[]> {
  const root = resolveVaultRoot(opts)
  const itemsDir = join(root, 'items')
  let entries: string[]
  try {
    entries = await readdir(itemsDir)
  } catch (err: any) {
    if (err.code === 'ENOENT') return []
    throw err
  }
  const items: any[] = []
  for (const entry of entries) {
    const jsonPath = join(itemsDir, entry, 'item.json')
    try {
      const raw = await readFile(jsonPath, 'utf8')
      items.push(JSON.parse(raw))
    } catch (err: any) {
      if (err.code === 'ENOENT') continue
      throw err
    }
  }
  return items
}

/**
 * Read tree.json from <vaultRoot>/. Returns null if missing.
 */
export async function readTreeFromDisk(
  opts: FilesystemModeOptions = {},
): Promise<any | null> {
  const root = resolveVaultRoot(opts)
  const treePath = join(root, 'tree.json')
  try {
    const raw = await readFile(treePath, 'utf8')
    return JSON.parse(raw)
  } catch (err: any) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}
