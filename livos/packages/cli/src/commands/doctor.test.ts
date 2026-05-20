// Phase 172-05 — unit tests for runDoctor (pure module backing `liv doctor`).
//
// Covers: green path, missing vault.json, orphan items dir, missing required field,
// stale tree.json. 5 assertions.

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {mkdtemp, mkdir, writeFile, rm, utimes} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {bootstrapVault} from '../vault-bootstrap.js'
import {runDoctor} from './doctor.js'

describe('runDoctor', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'liv-doctor-test-'))
  })
  afterEach(async () => {
    await rm(tmp, {recursive: true, force: true})
  })

  it('returns status=ok + all checks=ok on freshly init vault', async () => {
    const vault = join(tmp, 'fresh')
    await bootstrapVault({path: vault})
    const report = await runDoctor({vaultRoot: vault})
    expect(report.status).toBe('ok')
    for (const c of report.checks) {
      expect(c.status).toBe('ok')
    }
    // Verify the 5 mandatory check names appear
    const names = report.checks.map((c) => c.name)
    expect(names).toContain('vault_json_exists')
    expect(names).toContain('tree_json_exists')
    expect(names).toContain('settings_dir')
    expect(names).toContain('items_schema')
    expect(names).toContain('schema_version')
  })

  it('returns status=error when vault.json missing', async () => {
    const vault = join(tmp, 'novault')
    await mkdir(vault, {recursive: true})
    const report = await runDoctor({vaultRoot: vault})
    expect(report.status).toBe('error')
    const vc = report.checks.find((c) => c.name === 'vault_json_exists')
    expect(vc?.status).toBe('error')
  })

  it('flags items_schema=error when items/<uuid>/ lacks item.json', async () => {
    const vault = join(tmp, 'orphan-item')
    await bootstrapVault({path: vault})
    await mkdir(join(vault, 'items', 'orphan-dir'), {recursive: true})
    const report = await runDoctor({vaultRoot: vault})
    const check = report.checks.find((c) => c.name === 'items_schema')
    expect(check?.status).toBe('error')
    expect(check?.note).toContain('orphan-dir')
    expect(report.status).toBe('error')
  })

  it('flags items_schema=error when item.json missing required field', async () => {
    const vault = join(tmp, 'bad-schema')
    await bootstrapVault({path: vault})
    await mkdir(join(vault, 'items', 'item-a'), {recursive: true})
    // Missing required field 'parentId'
    await writeFile(
      join(vault, 'items', 'item-a', 'item.json'),
      JSON.stringify({
        id: 'item-a',
        type: 'project',
        name: 'foo',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    )
    const report = await runDoctor({vaultRoot: vault})
    const check = report.checks.find((c) => c.name === 'items_schema')
    expect(check?.status).toBe('error')
    expect(check?.note).toContain('parentId')
  })

  it('flags tree_freshness=stale when item.json mtime > tree.json mtime', async () => {
    const vault = join(tmp, 'stale')
    await bootstrapVault({path: vault})
    // Force tree.json to be older
    const oldTime = new Date('2020-01-01T00:00:00.000Z')
    await utimes(join(vault, 'tree.json'), oldTime, oldTime)
    // Create a fresh item
    await mkdir(join(vault, 'items', 'aaa'), {recursive: true})
    await writeFile(
      join(vault, 'items', 'aaa', 'item.json'),
      JSON.stringify({
        id: 'aaa',
        type: 'project',
        name: 'fresh',
        parentId: null,
        createdAt: '2026-05-20T00:00:00.000Z',
      }),
    )
    const report = await runDoctor({vaultRoot: vault})
    const check = report.checks.find((c) => c.name === 'tree_freshness')
    expect(check?.status).toBe('stale')
    // Stale doesn't escalate to error; roll-up should be 'yellow'
    expect(report.status).toBe('yellow')
  })
})
