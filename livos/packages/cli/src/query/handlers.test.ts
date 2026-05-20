// Phase 172-03 — command-to-tRPC mapping assertions.
//
// We mock query-client.js so the handlers can dispatch without booting
// livinityd. Each test verifies that a registry.dispatch(name, args, flags)
// call lands on the right QueryClient method with the right shape.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import {describe, it, expect, vi, beforeEach} from 'vitest'

// Mock the query-client module so we can capture calls without a live daemon.
// Note: arrays declared inside the factory closure — vitest hoists vi.mock to
// the top of the file, so module-level let/const declarations defined BELOW
// the vi.mock() call are undefined at the time the factory runs.
const createCalls: any[] = []
const listCalls: any[] = []
const moveCalls: any[] = []
const archiveCalls: any[] = []

vi.mock('../query-client.js', () => ({
  createQueryClient: async () => ({
    list: async (input?: any) => {
      listCalls.push(input)
      return []
    },
    get: async (id: string) => ({id, type: 'project', name: 'mock'}),
    create: async (input: any) => {
      createCalls.push(input)
      return {id: 'fake-id', ...input}
    },
    update: async () => ({}),
    move: async (id: string, newParentId: string | null) => {
      moveCalls.push({id, newParentId})
      return {item: {id}, warn: null}
    },
    archive: async (id: string) => {
      archiveCalls.push(id)
      return {id}
    },
    delete: async () => ({ok: true}),
    lastUsedFilesystemMode: () => false,
  }),
}))

import {buildDefaultRegistry} from './handlers.js'

describe('query handlers — command-to-tRPC mapping', () => {
  beforeEach(() => {
    createCalls.length = 0
    listCalls.length = 0
    moveCalls.length = 0
    archiveCalls.length = 0
  })

  it('item.create-project → client.create({type:project, ...})', async () => {
    const r = buildDefaultRegistry()
    await r.dispatch(
      'item.create-project',
      [],
      {name: 'foo', cwd: '/tmp/x'},
      {projectDir: '.'},
    )
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]).toMatchObject({type: 'project', name: 'foo', cwd: '/tmp/x'})
  })

  it('item.create-agent → client.create({type:agent, schedule})', async () => {
    const r = buildDefaultRegistry()
    await r.dispatch(
      'item.create-agent',
      [],
      {name: 'bar', schedule: '0 * * * *'},
      {projectDir: '.'},
    )
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]).toMatchObject({
      type: 'agent',
      name: 'bar',
      schedule: '0 * * * *',
    })
  })

  it('item.create-chat → client.create({type:chat})', async () => {
    const r = buildDefaultRegistry()
    await r.dispatch('item.create-chat', [], {name: 'baz'}, {projectDir: '.'})
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]).toMatchObject({type: 'chat', name: 'baz'})
  })

  it('tree.list with --archived=true forwards filter to client.list', async () => {
    const r = buildDefaultRegistry()
    await r.dispatch('tree.list', [], {archived: true}, {projectDir: '.'})
    expect(listCalls).toHaveLength(1)
    expect(listCalls[0]).toEqual({archived: true})
  })

  it('item.move → client.move(id, newParentId) with null coercion', async () => {
    const r = buildDefaultRegistry()
    await r.dispatch('item.move', ['abc123', 'null'], {}, {projectDir: '.'})
    expect(moveCalls[0]).toEqual({id: 'abc123', newParentId: null})
  })

  it('item.archive → client.archive(id)', async () => {
    const r = buildDefaultRegistry()
    await r.dispatch('item.archive', ['xyz789'], {}, {projectDir: '.'})
    expect(archiveCalls).toEqual(['xyz789'])
  })

  it('item.create-project rejects missing --name with thrown Error', async () => {
    const r = buildDefaultRegistry()
    await expect(
      r.dispatch('item.create-project', [], {}, {projectDir: '.'}),
    ).rejects.toThrow(/--name required/)
  })
})
