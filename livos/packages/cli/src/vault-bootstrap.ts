// Phase 172-05 — pure vault bootstrap module for `liv init`.
//
// Materializes the D-V38-T folder layout at a target path. Pure async
// function with all I/O ops via fs.promises — no globals beyond the
// injected options. Used by:
//   - src/commands/init.ts (production entry point)
//   - src/commands/init.test.ts (unit tests against tmpdir)
//   - src/commands/e2e.test.ts (init+doctor smoke)
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import {promises as fs} from 'node:fs'
import {basename, join} from 'node:path'
import {uuidv7} from 'uuidv7'

export interface BootstrapOptions {
  /** Target vault root absolute path */
  path: string
  /** Allow writing into a non-empty directory (default false) */
  force?: boolean
  /** Override timestamp for determinism in tests */
  now?: Date
  /** Override uuid generator for determinism in tests */
  vaultId?: string
}

export interface VaultBootstrapResult {
  path: string
  vaultId: string
  createdAt: string
  /** Relative paths created by this bootstrap (dirs end with '/') */
  created: string[]
}

const SETTINGS_DEFAULTS: Record<string, string> = {
  'liv-rootagent.md': '',
  'mcp-servers.json': '{}\n',
  'theme.json': '{}\n',
}

const SUBDIRS = ['items', 'commands', 'skills', 'inbox', 'settings'] as const

async function dirIsEmpty(p: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(p)
    return entries.length === 0
  } catch (err: any) {
    if (err.code === 'ENOENT') return true
    throw err
  }
}

/**
 * Materialize a fresh LivOS vault skeleton at `opts.path`.
 *
 * Refuses to write into a non-empty directory unless `opts.force` is true.
 * Idempotency note: with `force=true`, existing files are NOT overwritten —
 * only missing files/dirs are created.
 */
export async function bootstrapVault(
  opts: BootstrapOptions,
): Promise<VaultBootstrapResult> {
  const {path: vaultPath, force = false} = opts
  const now = opts.now ?? new Date()
  const vaultId = opts.vaultId ?? uuidv7()
  const createdAt = now.toISOString()
  const vaultName = basename(vaultPath)

  // Pre-flight: must be empty unless --force
  if (!force) {
    if (!(await dirIsEmpty(vaultPath))) {
      throw new Error(
        `[liv init] ${vaultPath} is not empty. Use --force to bootstrap anyway.`,
      )
    }
  }

  const created: string[] = []

  // 1. Vault root
  await fs.mkdir(vaultPath, {recursive: true})

  // 2. Subdirectories
  for (const sub of SUBDIRS) {
    await fs.mkdir(join(vaultPath, sub), {recursive: true})
    created.push(sub + '/')
  }

  // 3. vault.json (skip if exists in --force mode)
  const vaultJsonPath = join(vaultPath, 'vault.json')
  try {
    await fs.stat(vaultJsonPath)
    // Exists; honor existing content
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err
    await fs.writeFile(
      vaultJsonPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          vaultId,
          vaultName,
          createdAt,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )
    created.push('vault.json')
  }

  // 4. tree.json — empty cache; daemon rebuilds on first item create
  const treeJsonPath = join(vaultPath, 'tree.json')
  try {
    await fs.stat(treeJsonPath)
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err
    await fs.writeFile(treeJsonPath, '{}\n', 'utf8')
    created.push('tree.json')
  }

  // 5. settings/ default files
  for (const [name, content] of Object.entries(SETTINGS_DEFAULTS)) {
    const p = join(vaultPath, 'settings', name)
    try {
      await fs.stat(p)
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err
      await fs.writeFile(p, content, 'utf8')
      created.push(`settings/${name}`)
    }
  }

  return {
    path: vaultPath,
    vaultId,
    createdAt,
    created,
  }
}
