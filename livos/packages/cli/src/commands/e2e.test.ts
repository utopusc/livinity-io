// Phase 172-05 — end-to-end smoke for `@livos/cli`: init → list (filesystem-mode) → doctor.
//
// Two layers:
//   1. Pure-module imports (fast, deterministic) — happy path, corruption detection,
//      stale-tree yellow path. 3 describe blocks.
//   2. Real-spawn validation via dist/cli.js — proves the bin shell-out works on a
//      truly fresh box. Compiled cli.js path resolved from __dirname.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import {describe, it, expect, beforeEach, afterEach, beforeAll} from 'vitest'
import {mkdtemp, mkdir, writeFile, rm, readFile, utimes, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {bootstrapVault} from '../vault-bootstrap.js'
import {readItemsFromDisk, readTreeFromDisk} from '../filesystem-mode.js'
import {runDoctor} from './doctor.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// __dirname points at src/commands/ during test (ts is run via vitest's transformer).
// The compiled bin lives at <pkg>/dist/cli.js.
const PKG_ROOT = resolve(__dirname, '..', '..')
const CLI_BIN = join(PKG_ROOT, 'dist', 'cli.js')

describe('Phase 172 E2E smoke — init → list (filesystem-mode) → doctor', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'liv-e2e-test-'))
  })
  afterEach(async () => {
    await rm(tmp, {recursive: true, force: true})
  })

  it('full sequence: init creates skeleton → list shows empty tree → doctor green', async () => {
    const vault = join(tmp, 'my-vault')

    // STEP 1: init
    const init = await bootstrapVault({path: vault})
    expect(init.vaultId).toBeTruthy()
    expect(init.created).toContain('vault.json')
    expect(init.created).toContain('tree.json')
    expect(init.created).toContain('settings/liv-rootagent.md')

    // STEP 2: list --tree (filesystem-mode reads disk)
    const items = await readItemsFromDisk({vaultRoot: vault})
    expect(items).toEqual([])
    const tree = await readTreeFromDisk({vaultRoot: vault})
    expect(tree).toEqual({})

    // STEP 3: doctor
    const report = await runDoctor({vaultRoot: vault})
    expect(report.status).toBe('ok')
    const errChecks = report.checks.filter((c) => c.status === 'error')
    expect(errChecks).toEqual([])

    // STEP 4: assertions on the vault.json contents
    const vaultJson = JSON.parse(await readFile(join(vault, 'vault.json'), 'utf8'))
    expect(vaultJson.schemaVersion).toBe(1)
    expect(vaultJson.vaultId).toBe(init.vaultId)
    expect(typeof vaultJson.createdAt).toBe('string')
  })

  it('detects a corrupted vault via doctor (item.json drift introduced post-init)', async () => {
    const vault = join(tmp, 'corrupted')
    await bootstrapVault({path: vault})

    // Simulate operator hand-editing an item folder without item.json
    await mkdir(join(vault, 'items', 'hand-created'), {recursive: true})
    // Deliberately no item.json

    const report = await runDoctor({vaultRoot: vault})
    expect(report.status).toBe('error')
    const itemsCheck = report.checks.find((c) => c.name === 'items_schema')
    expect(itemsCheck?.status).toBe('error')
    expect(itemsCheck?.note).toContain('hand-created')
  })

  it('doctor reports yellow (not error) on tree.json staleness from a valid item', async () => {
    const vault = join(tmp, 'stale-tree')
    await bootstrapVault({path: vault})

    // Create a valid item with a fresh mtime; backdate tree.json
    await mkdir(join(vault, 'items', 'valid'), {recursive: true})
    await writeFile(
      join(vault, 'items', 'valid', 'item.json'),
      JSON.stringify({
        id: 'valid',
        type: 'project',
        name: 'p',
        parentId: null,
        createdAt: '2026-05-20T00:00:00.000Z',
      }),
    )
    const old = new Date('2020-01-01T00:00:00.000Z')
    await utimes(join(vault, 'tree.json'), old, old)

    const report = await runDoctor({vaultRoot: vault})
    expect(report.status).toBe('yellow')
    const stale = report.checks.find((c) => c.name === 'tree_freshness')
    expect(stale?.status).toBe('stale')
  })
})

describe('Phase 172 E2E smoke — real spawn of dist/cli.js', () => {
  let cliExists = false
  let tmp: string

  beforeAll(async () => {
    try {
      await stat(CLI_BIN)
      cliExists = true
    } catch {
      cliExists = false
    }
  })

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'liv-e2e-spawn-'))
  })
  afterEach(async () => {
    await rm(tmp, {recursive: true, force: true})
  })

  it('liv init <tmpdir> via real spawn creates the D-V38-T skeleton + liv doctor returns ok', async () => {
    if (!cliExists) {
      throw new Error(
        `dist/cli.js not found at ${CLI_BIN} — run \`pnpm build\` before running e2e tests`,
      )
    }
    const vault = join(tmp, 'spawned-vault')

    // STEP 1: spawn `liv init <vault>`
    const initRes = spawnSync(process.execPath, [CLI_BIN, 'init', vault], {
      encoding: 'utf8',
      env: {...process.env, FORCE_COLOR: '0'},
    })
    expect(initRes.status).toBe(0)
    // stdout carries the JSON ok line
    const initParsed = JSON.parse(initRes.stdout.trim().split('\n')[0])
    expect(initParsed.ok).toBe(true)
    expect(initParsed.vaultId).toMatch(/^[0-9a-f-]{36}$/i)

    // STEP 2: assert canonical D-V38-T layout on disk
    const vaultJson = JSON.parse(await readFile(join(vault, 'vault.json'), 'utf8'))
    expect(vaultJson.schemaVersion).toBe(1)
    for (const sub of ['items', 'commands', 'skills', 'inbox', 'settings']) {
      const s = await stat(join(vault, sub))
      expect(s.isDirectory()).toBe(true)
    }
    expect(JSON.parse(await readFile(join(vault, 'tree.json'), 'utf8'))).toEqual({})

    // STEP 3: spawn `liv doctor` against the same vault root via LIV_VAULT_ROOT
    const doctorRes = spawnSync(process.execPath, [CLI_BIN, 'doctor'], {
      encoding: 'utf8',
      env: {...process.env, FORCE_COLOR: '0', LIV_VAULT_ROOT: vault},
    })
    expect(doctorRes.status).toBe(0)
    const doctorParsed = JSON.parse(doctorRes.stdout.trim())
    expect(doctorParsed.status).toBe('ok')
    expect(doctorParsed.checks.length).toBeGreaterThanOrEqual(5)
    for (const c of doctorParsed.checks) {
      expect(c.status).toBe('ok')
    }
  })
})
