import {describe, it, expect} from 'vitest'
import {createQueryClient, FilesystemModeMutationError} from './query-client.js'

// Helper: build a fake fetch that records the last request and returns a tRPC envelope.
function makeFakeFetch(envelope: any, captured: {url?: string; init?: RequestInit} = {}) {
  return async (url: string, init?: RequestInit) => {
    captured.url = url
    captured.init = init
    return new Response(JSON.stringify(envelope), {
      status: 200,
      headers: {'content-type': 'application/json'},
    })
  }
}

function makeRefusingFetch() {
  return async () => {
    const e: any = new Error('connect ECONNREFUSED 127.0.0.1:3001')
    e.cause = {code: 'ECONNREFUSED'}
    throw e
  }
}

describe('query-client tRPC HTTP', () => {
  it('injects X-Livinity-Api-Key header from opts.apiKey', async () => {
    const captured: any = {}
    const client = await createQueryClient({
      endpoint: 'http://test/trpc',
      apiKey: 'test-key-xyz',
      fetchImpl: makeFakeFetch({result: {data: {json: {items: []}}}}, captured) as any,
    })
    await client.list()
    expect(captured.init?.headers).toBeDefined()
    expect((captured.init!.headers as any)['x-livinity-api-key']).toBe('test-key-xyz')
  })

  it('list() targets POST /trpc/vault.items.list URL path (query via GET)', async () => {
    const captured: any = {}
    const client = await createQueryClient({
      endpoint: 'http://test/trpc',
      apiKey: 'k',
      fetchImpl: makeFakeFetch({result: {data: {json: {items: []}}}}, captured) as any,
    })
    await client.list()
    expect(captured.url).toContain('/trpc/vault.items.list')
  })

  it('create() targets POST /trpc/vault.items.create with {json:...} body', async () => {
    const captured: any = {}
    const client = await createQueryClient({
      endpoint: 'http://test/trpc',
      apiKey: 'k',
      fetchImpl: makeFakeFetch(
        {result: {data: {json: {item: {id: 'x', type: 'project', name: 'foo'}}}}},
        captured,
      ) as any,
    })
    const item = await client.create({type: 'project', name: 'foo'})
    expect(captured.url).toContain('/trpc/vault.items.create')
    expect(captured.init?.method).toBe('POST')
    const body = JSON.parse(captured.init!.body as string)
    expect(body).toHaveProperty('json.type', 'project')
    expect(item).toEqual({id: 'x', type: 'project', name: 'foo'})
  })

  it('list() falls back to filesystem-mode on ECONNREFUSED', async () => {
    // Use a vault root with no items/ → returns []
    const client = await createQueryClient({
      endpoint: 'http://test/trpc',
      apiKey: 'k',
      vaultRoot: '/nonexistent/vault/path',
      fetchImpl: makeRefusingFetch() as any,
    })
    const items = await client.list()
    expect(items).toEqual([])
    expect(client.lastUsedFilesystemMode()).toBe(true)
  })

  it('create() throws FilesystemModeMutationError on ECONNREFUSED', async () => {
    const client = await createQueryClient({
      endpoint: 'http://test/trpc',
      apiKey: 'k',
      fetchImpl: makeRefusingFetch() as any,
    })
    await expect(client.create({type: 'project', name: 'foo'})).rejects.toBeInstanceOf(
      FilesystemModeMutationError,
    )
  })

  it('non-200 HTTP responses surface as Error', async () => {
    const failingFetch = async () =>
      new Response('forbidden', {status: 403})
    const client = await createQueryClient({
      endpoint: 'http://test/trpc',
      apiKey: 'k',
      fetchImpl: failingFetch as any,
    })
    await expect(client.list()).rejects.toThrow(/HTTP 403/)
  })

  it('default endpoint is http://localhost:3001/trpc when LIVINITY_TRPC_ENDPOINT unset', async () => {
    const prev = process.env.LIVINITY_TRPC_ENDPOINT
    delete process.env.LIVINITY_TRPC_ENDPOINT
    try {
      const captured: any = {}
      const client = await createQueryClient({
        apiKey: 'k',
        fetchImpl: makeFakeFetch({result: {data: {json: {items: []}}}}, captured) as any,
      })
      await client.list()
      expect(captured.url).toMatch(/^http:\/\/localhost:3001\/trpc\/vault\.items\.list/)
    } finally {
      if (prev !== undefined) process.env.LIVINITY_TRPC_ENDPOINT = prev
    }
  })

  it('all 7 vault.items.* methods exist on the client surface', async () => {
    const client = await createQueryClient({
      endpoint: 'http://test/trpc',
      apiKey: 'k',
      fetchImpl: makeFakeFetch({result: {data: {json: {}}}}) as any,
    })
    for (const m of ['list', 'get', 'create', 'update', 'move', 'archive', 'delete']) {
      expect(typeof (client as any)[m]).toBe('function')
    }
  })
})
