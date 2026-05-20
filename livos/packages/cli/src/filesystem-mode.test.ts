import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {
  readItemsFromDisk,
  readTreeFromDisk,
  FilesystemModeMutationError,
} from './filesystem-mode.js'

describe('filesystem-mode', () => {
  let tmp: string
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'liv-fs-test-'))
  })
  afterEach(async () => {
    await rm(tmp, {recursive: true, force: true})
  })

  it('readItemsFromDisk returns [] when items/ missing', async () => {
    const items = await readItemsFromDisk({vaultRoot: tmp})
    expect(items).toEqual([])
  })

  it('readItemsFromDisk reads every items/<uuid>/item.json', async () => {
    await mkdir(join(tmp, 'items', 'aaa1'), {recursive: true})
    await mkdir(join(tmp, 'items', 'bbb2'), {recursive: true})
    await writeFile(
      join(tmp, 'items', 'aaa1', 'item.json'),
      JSON.stringify({id: 'aaa1', type: 'project', name: 'foo'}),
    )
    await writeFile(
      join(tmp, 'items', 'bbb2', 'item.json'),
      JSON.stringify({id: 'bbb2', type: 'agent', name: 'bar'}),
    )
    const items = await readItemsFromDisk({vaultRoot: tmp})
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.id).sort()).toEqual(['aaa1', 'bbb2'])
  })

  it('readItemsFromDisk skips dirs without item.json', async () => {
    await mkdir(join(tmp, 'items', 'partial'), {recursive: true})
    const items = await readItemsFromDisk({vaultRoot: tmp})
    expect(items).toEqual([])
  })

  it('readTreeFromDisk returns null when tree.json missing', async () => {
    const t = await readTreeFromDisk({vaultRoot: tmp})
    expect(t).toBeNull()
  })

  it('readTreeFromDisk parses tree.json when present', async () => {
    await writeFile(join(tmp, 'tree.json'), JSON.stringify({root: []}))
    const t = await readTreeFromDisk({vaultRoot: tmp})
    expect(t).toEqual({root: []})
  })

  it('FilesystemModeMutationError carries op name', () => {
    const err = new FilesystemModeMutationError('vault.items.create')
    expect(err.message).toContain('vault.items.create')
    expect(err.message).toContain('livinityd is offline')
    expect(err.name).toBe('FilesystemModeMutationError')
  })
})
