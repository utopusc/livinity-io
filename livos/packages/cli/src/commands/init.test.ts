// Phase 172-05 — unit tests for vault-bootstrap (pure module backing `liv init`).
//
// Covers: schema fields, subdir layout, settings defaults, refuse path,
// --force path, DI determinism. 7 assertions. No process.exit — `liv init`
// handler integration is exercised via the e2e.test.ts spawn path.

import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {mkdtemp, mkdir, writeFile, rm, readFile, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {bootstrapVault} from '../vault-bootstrap.js'

describe('bootstrapVault (init pure module)', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'liv-init-test-'))
  })
  afterEach(async () => {
    await rm(tmp, {recursive: true, force: true})
  })

  it('creates vault.json with schemaVersion=1 + vaultId + createdAt', async () => {
    const target = join(tmp, 'fresh')
    const result = await bootstrapVault({path: target})
    expect(result.vaultId).toMatch(/^[0-9a-f-]{36}$/i)
    const raw = await readFile(join(target, 'vault.json'), 'utf8')
    const vault = JSON.parse(raw)
    expect(vault).toMatchObject({
      schemaVersion: 1,
      vaultId: result.vaultId,
    })
    expect(vault.createdAt).toBeTruthy()
  })

  it('creates tree.json as empty object', async () => {
    const target = join(tmp, 'fresh')
    await bootstrapVault({path: target})
    const raw = await readFile(join(target, 'tree.json'), 'utf8')
    expect(JSON.parse(raw)).toEqual({})
  })

  it('creates all 5 required subdirectories', async () => {
    const target = join(tmp, 'fresh')
    await bootstrapVault({path: target})
    for (const sub of ['items', 'commands', 'skills', 'inbox', 'settings']) {
      const s = await stat(join(target, sub))
      expect(s.isDirectory()).toBe(true)
    }
  })

  it('creates settings/liv-rootagent.md as empty + mcp-servers.json + theme.json as {}', async () => {
    const target = join(tmp, 'fresh')
    await bootstrapVault({path: target})
    const rootAgent = await readFile(
      join(target, 'settings', 'liv-rootagent.md'),
      'utf8',
    )
    expect(rootAgent).toBe('')
    const mcp = await readFile(join(target, 'settings', 'mcp-servers.json'), 'utf8')
    expect(JSON.parse(mcp)).toEqual({})
    const theme = await readFile(join(target, 'settings', 'theme.json'), 'utf8')
    expect(JSON.parse(theme)).toEqual({})
  })

  it('refuses to bootstrap a non-empty directory without --force', async () => {
    const target = join(tmp, 'occupied')
    await mkdir(target, {recursive: true})
    await writeFile(join(target, 'existing.txt'), 'hello')
    await expect(bootstrapVault({path: target})).rejects.toThrow(/not empty/)
  })

  it('writes into non-empty directory with force=true (preserving existing files)', async () => {
    const target = join(tmp, 'force')
    await mkdir(target, {recursive: true})
    await writeFile(join(target, 'preexisting.md'), 'untouched')
    const result = await bootstrapVault({path: target, force: true})
    expect(result.created.length).toBeGreaterThan(0)
    // Pre-existing file untouched
    const preserved = await readFile(join(target, 'preexisting.md'), 'utf8')
    expect(preserved).toBe('untouched')
    // Vault skeleton present
    const vault = await readFile(join(target, 'vault.json'), 'utf8')
    expect(JSON.parse(vault).schemaVersion).toBe(1)
  })

  it('honors injected vaultId + now for deterministic tests', async () => {
    const target = join(tmp, 'deterministic')
    const result = await bootstrapVault({
      path: target,
      vaultId: '01234567-89ab-7cde-8fff-fedcba987654',
      now: new Date('2026-01-01T00:00:00.000Z'),
    })
    expect(result.vaultId).toBe('01234567-89ab-7cde-8fff-fedcba987654')
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
