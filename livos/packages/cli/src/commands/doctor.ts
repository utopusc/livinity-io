// Phase 172-05 — complete `liv doctor` handler.
// Replaces the Plan 172-03 skeleton. Same export name so cli.ts wiring is preserved.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import chalk from 'chalk'
import {promises as fs} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

export interface DoctorCheck {
  name: string
  status: 'ok' | 'stale' | 'error'
  note?: string
  count?: number
}

export interface DoctorReport {
  vaultRoot: string
  checks: DoctorCheck[]
  status: 'ok' | 'yellow' | 'error'
}

const EXPECTED_SCHEMA_VERSION = 1

const REQUIRED_ITEM_FIELDS = ['id', 'type', 'name', 'parentId', 'createdAt'] as const

function resolveVaultRoot(
  env: Record<string, string | undefined> = process.env,
  home = homedir(),
): string {
  return env.LIV_VAULT_ROOT ?? join(home, 'liv')
}

async function existsAsync(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch (err: any) {
    if (err.code === 'ENOENT') return false
    throw err
  }
}

/**
 * Pure doctor implementation — DI-friendly for tests via opts.vaultRoot.
 *
 * Emits 6 named checks:
 *   1. vault_json_exists — file present + parses + schemaVersion key present
 *   2. tree_json_exists  — file present + parses
 *   3. settings_dir      — settings/ has liv-rootagent.md + mcp-servers.json + theme.json
 *   4. items_schema      — every items/<uuid>/ has a valid item.json with required fields
 *   5. schema_version    — vault.json.schemaVersion === EXPECTED_SCHEMA_VERSION (1)
 *   6. tree_freshness    — tree.json mtime >= max item.json mtime (stale if drift; not error)
 *
 * Status roll-up: any 'error' → 'error'; any 'stale' (no error) → 'yellow'; else 'ok'.
 */
export async function runDoctor(
  opts: {vaultRoot?: string} = {},
): Promise<DoctorReport> {
  const vaultRoot = opts.vaultRoot ?? resolveVaultRoot()
  const checks: DoctorCheck[] = []

  // 1. vault.json exists + parses + schemaVersion present
  let vaultObj: any = null
  const vaultJsonPath = join(vaultRoot, 'vault.json')
  if (await existsAsync(vaultJsonPath)) {
    try {
      vaultObj = JSON.parse(await fs.readFile(vaultJsonPath, 'utf8'))
      if (!('schemaVersion' in vaultObj)) {
        checks.push({
          name: 'vault_json_exists',
          status: 'error',
          note: 'vault.json missing schemaVersion key',
        })
      } else {
        checks.push({name: 'vault_json_exists', status: 'ok'})
      }
    } catch (err: any) {
      checks.push({
        name: 'vault_json_exists',
        status: 'error',
        note: `parse failed: ${err.message}`,
      })
    }
  } else {
    checks.push({
      name: 'vault_json_exists',
      status: 'error',
      note: 'vault.json missing — run `liv init` first',
    })
  }

  // 2. tree.json exists + parses
  const treeJsonPath = join(vaultRoot, 'tree.json')
  let treeStat: any = null
  if (await existsAsync(treeJsonPath)) {
    try {
      JSON.parse(await fs.readFile(treeJsonPath, 'utf8'))
      treeStat = await fs.stat(treeJsonPath)
      checks.push({name: 'tree_json_exists', status: 'ok'})
    } catch (err: any) {
      checks.push({
        name: 'tree_json_exists',
        status: 'error',
        note: `parse failed: ${err.message}`,
      })
    }
  } else {
    checks.push({name: 'tree_json_exists', status: 'error', note: 'tree.json missing'})
  }

  // 3. settings/ dir + 3 expected files
  const settingsDir = join(vaultRoot, 'settings')
  const missingSettings: string[] = []
  for (const name of ['liv-rootagent.md', 'mcp-servers.json', 'theme.json']) {
    if (!(await existsAsync(join(settingsDir, name)))) missingSettings.push(name)
  }
  if (missingSettings.length === 0) {
    checks.push({name: 'settings_dir', status: 'ok'})
  } else {
    checks.push({
      name: 'settings_dir',
      status: 'error',
      note: `missing settings files: ${missingSettings.join(', ')}`,
    })
  }

  // 4. items_schema — every items/<uuid>/ has a valid item.json with required fields
  const itemsDir = join(vaultRoot, 'items')
  let itemCount = 0
  let itemsLatestMtime = 0
  const itemErrors: string[] = []
  if (await existsAsync(itemsDir)) {
    const entries = await fs.readdir(itemsDir)
    for (const entry of entries) {
      const itemDirPath = join(itemsDir, entry)
      const entryStat = await fs.stat(itemDirPath)
      if (!entryStat.isDirectory()) continue
      const itemJsonPath = join(itemDirPath, 'item.json')
      if (!(await existsAsync(itemJsonPath))) {
        itemErrors.push(`${entry}: missing item.json`)
        continue
      }
      try {
        const raw = await fs.readFile(itemJsonPath, 'utf8')
        const item = JSON.parse(raw)
        let fieldsOk = true
        for (const field of REQUIRED_ITEM_FIELDS) {
          if (!(field in item)) {
            itemErrors.push(`${entry}: item.json missing field '${field}'`)
            fieldsOk = false
            break
          }
        }
        const st = await fs.stat(itemJsonPath)
        if (st.mtimeMs > itemsLatestMtime) itemsLatestMtime = st.mtimeMs
        if (fieldsOk) itemCount++
      } catch (err: any) {
        itemErrors.push(`${entry}: ${err.message}`)
      }
    }
  }
  if (itemErrors.length === 0) {
    checks.push({name: 'items_schema', status: 'ok', count: itemCount})
  } else {
    checks.push({
      name: 'items_schema',
      status: 'error',
      count: itemCount,
      note: itemErrors.join('; '),
    })
  }

  // 5. schema_version — vault.json.schemaVersion === 1
  if (vaultObj) {
    if (vaultObj.schemaVersion === EXPECTED_SCHEMA_VERSION) {
      checks.push({name: 'schema_version', status: 'ok'})
    } else {
      checks.push({
        name: 'schema_version',
        status: 'error',
        note: `expected ${EXPECTED_SCHEMA_VERSION}, got ${vaultObj.schemaVersion}`,
      })
    }
  } else {
    checks.push({
      name: 'schema_version',
      status: 'error',
      note: 'vault.json unreadable',
    })
  }

  // 6. tree_freshness — if any item.json mtime > tree.json mtime → stale (not error)
  if (treeStat && itemsLatestMtime > 0) {
    if (itemsLatestMtime > treeStat.mtimeMs) {
      checks.push({
        name: 'tree_freshness',
        status: 'stale',
        note: `tree.json older than latest item.json by ${Math.round(
          itemsLatestMtime - treeStat.mtimeMs,
        )}ms — daemon will rebuild`,
      })
    } else {
      checks.push({name: 'tree_freshness', status: 'ok'})
    }
  } else if (treeStat) {
    // No items yet — tree.json is trivially fresh
    checks.push({name: 'tree_freshness', status: 'ok'})
  }

  // Roll-up status: worst-of
  let rollup: 'ok' | 'yellow' | 'error' = 'ok'
  for (const c of checks) {
    if (c.status === 'error') {
      rollup = 'error'
      break
    }
    if (c.status === 'stale' && rollup === 'ok') rollup = 'yellow'
  }

  return {vaultRoot, checks, status: rollup}
}

export async function doctorHandler(argv: any): Promise<void> {
  const vaultRoot =
    typeof argv['vault-root'] === 'string'
      ? argv['vault-root']
      : typeof argv.vaultRoot === 'string'
        ? argv.vaultRoot
        : undefined
  const report = await runDoctor({vaultRoot})
  console.log(JSON.stringify(report, null, 2))
  // Color summary on stderr so JSON stdout stays clean for piping
  const color =
    report.status === 'ok'
      ? chalk.green
      : report.status === 'yellow'
        ? chalk.yellow
        : chalk.red
  console.error(
    color(
      `[liv doctor] vault=${report.vaultRoot} status=${report.status} (${report.checks.length} checks)`,
    ),
  )
  if (report.status === 'error') process.exit(1)
  process.exit(0)
}
