// Phase 172-02 — tRPC HTTP client for @livos/cli.
//
// Wraps native fetch() to talk to livinityd's tRPC surface at
// POST /trpc/vault.items.<proc>. Auth via X-Livinity-Api-Key header
// (resolved via auth.ts: LIV_API_KEY env > ~/.livos/api-key file).
//
// Fallback contract (D-V38-H): if the daemon is unreachable
// (ECONNREFUSED), read-only methods (list / get) fall through to
// filesystem-mode. Mutation methods throw FilesystemModeMutationError.
//
// tRPC v11 wire shape:
//   - mutation: POST /trpc/<path>  body = {"json": <input>}
//   - query:    GET  /trpc/<path>?input=<urlencoded({"json":<input>})>
//   - response: {"result":{"data":{"json":<output>}}}
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import {resolveApiKey} from './auth.js'
import {
  FilesystemModeMutationError,
  readItemsFromDisk,
  readTreeFromDisk,
  type FilesystemModeOptions,
} from './filesystem-mode.js'

export interface QueryClientOptions {
  /** Default: process.env.LIVINITY_TRPC_ENDPOINT || 'http://localhost:3001/trpc' */
  endpoint?: string
  /** Override api key (else resolved via auth.ts) */
  apiKey?: string
  /** Vault root for filesystem-mode fallback (default: ~/liv/) */
  vaultRoot?: string
  /** Inject fetch for tests */
  fetchImpl?: typeof fetch
}

export interface QueryClient {
  list(input?: {archived?: boolean; parentId?: string | null}): Promise<any[]>
  get(id: string): Promise<any>
  create(input: any): Promise<any>
  update(id: string, patch: any): Promise<any>
  move(id: string, newParentId: string | null): Promise<{item: any; warn: string | null}>
  archive(id: string): Promise<any>
  delete(id: string): Promise<{ok: boolean}>
  /** True if last call fell back to filesystem-mode */
  lastUsedFilesystemMode(): boolean
}

const READ_OPS = new Set(['list', 'get'])

function defaultEndpoint(env: Record<string, string | undefined>): string {
  return env.LIVINITY_TRPC_ENDPOINT ?? 'http://localhost:3001/trpc'
}

function isConnectionError(err: any): boolean {
  // Node fetch surfaces these as { cause: { code: 'ECONNREFUSED' | 'ENOTFOUND' } }
  const code = err?.cause?.code ?? err?.code
  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'EHOSTUNREACH'
  )
}

export async function createQueryClient(
  opts: QueryClientOptions = {},
): Promise<QueryClient> {
  const env = process.env
  const endpoint = (opts.endpoint ?? defaultEndpoint(env)).replace(/\/+$/, '')
  const fetchFn = opts.fetchImpl ?? fetch
  const apiKey = opts.apiKey ?? (await resolveApiKey())
  const fsOpts: FilesystemModeOptions = {vaultRoot: opts.vaultRoot}

  let lastFallback = false

  async function callMutation(proc: string, input: any): Promise<any> {
    const url = `${endpoint}/vault.items.${proc}`
    const headers: Record<string, string> = {'content-type': 'application/json'}
    if (apiKey) headers['x-livinity-api-key'] = apiKey
    let resp: Response
    try {
      resp = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({json: input}),
      })
    } catch (err) {
      if (isConnectionError(err)) {
        throw new FilesystemModeMutationError(`vault.items.${proc}`)
      }
      throw err
    }
    lastFallback = false
    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`[liv] tRPC vault.items.${proc} → HTTP ${resp.status}: ${body}`)
    }
    const json: any = await resp.json()
    return json.result?.data?.json
  }

  async function callQuery(proc: string, input?: any): Promise<any> {
    const url = new URL(`${endpoint}/vault.items.${proc}`)
    if (input !== undefined) {
      url.searchParams.set('input', JSON.stringify({json: input}))
    }
    const headers: Record<string, string> = {}
    if (apiKey) headers['x-livinity-api-key'] = apiKey
    let resp: Response
    try {
      resp = await fetchFn(url.toString(), {method: 'GET', headers})
    } catch (err) {
      if (isConnectionError(err)) {
        lastFallback = true
        // Read-only fallback
        if (proc === 'list') {
          const items = await readItemsFromDisk(fsOpts)
          const filter = input ?? {}
          return items.filter((it) => {
            if (filter.archived === false && it.archivedAt) return false
            if (filter.archived === true && !it.archivedAt) return false
            if (filter.parentId !== undefined && it.parentId !== filter.parentId) return false
            return true
          })
        }
        if (proc === 'get') {
          const items = await readItemsFromDisk(fsOpts)
          const item = items.find((it) => it.id === input.id)
          return item ?? null
        }
        throw err
      }
      throw err
    }
    lastFallback = false
    if (!resp.ok) {
      const body = await resp.text()
      throw new Error(`[liv] tRPC vault.items.${proc} → HTTP ${resp.status}: ${body}`)
    }
    const json: any = await resp.json()
    return json.result?.data?.json
  }

  return {
    async list(input) {
      const result = await callQuery('list', input ?? {})
      // Daemon returns {items: [...]}; fallback returns the raw array.
      if (lastFallback) return result as any[]
      return result?.items ?? []
    },
    async get(id) {
      const result = await callQuery('get', {id})
      if (lastFallback) return result
      return result?.item ?? null
    },
    async create(input) {
      const result = await callMutation('create', input)
      return result?.item
    },
    async update(id, patch) {
      const result = await callMutation('update', {id, patch})
      return result?.item
    },
    async move(id, newParentId) {
      return await callMutation('move', {id, newParentId})
    },
    async archive(id) {
      const result = await callMutation('archive', {id})
      return result?.item
    },
    async delete(id) {
      return await callMutation('delete', {id})
    },
    lastUsedFilesystemMode() {
      return lastFallback
    },
  }
}

// Re-export FilesystemModeMutationError so callers only need one import path.
export {FilesystemModeMutationError, readTreeFromDisk}
