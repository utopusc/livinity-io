// Phase 172-02 — API key resolver for @livos/cli.
//
// Resolution priority (D-V38-H):
//   1. process.env.LIV_API_KEY (highest — wins over file)
//   2. ~/.livos/api-key (single-line file, trimmed)
//   3. null (caller decides: read-only via filesystem-mode, or exit 1)
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + all Phase 162-171 source UNCHANGED.

import {readFile} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'

export interface ResolveApiKeyOptions {
  /** Override the home dir for testing. Defaults to os.homedir(). */
  home?: string
  /** Override the env source for testing. Defaults to process.env. */
  env?: Record<string, string | undefined>
}

/**
 * Return the resolved API key or null if neither source supplied one.
 * Pure async function — no globals beyond os.homedir() / process.env
 * unless overridden via opts.
 */
export async function resolveApiKey(
  opts: ResolveApiKeyOptions = {},
): Promise<string | null> {
  const env = opts.env ?? process.env
  const home = opts.home ?? homedir()

  // 1. env wins
  const fromEnv = env.LIV_API_KEY
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim()
  }

  // 2. ~/.livos/api-key file fallback
  const keyPath = join(home, '.livos', 'api-key')
  try {
    const content = await readFile(keyPath, 'utf8')
    const trimmed = content.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch (err: any) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}
