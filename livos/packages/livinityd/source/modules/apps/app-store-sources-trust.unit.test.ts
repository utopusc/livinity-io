// Phase 341-01 (REPO-01, D-341-3) — trust-stamp + namespacing on the resolution
// path. Drives AppStore.getFederatedCatalog with a MOCKED fetchFederatedCatalog
// and an in-memory fake store, so the box's trust stamping is exercised without
// any network. The headline invariant: trust is stamped `false` in ONE place, a
// literal, NEVER read from the (mocked) payload.
import {vi, describe, it, expect, beforeEach} from 'vitest'

// Mock ONLY the network fetch — namespacing/id helpers stay real.
vi.mock('./federated-catalog.js', () => ({
	fetchFederatedCatalog: vi.fn(),
}))

import {fetchFederatedCatalog} from './federated-catalog.js'
import AppStore from './app-store.js'
import {deriveSourceId, namespacedAppId, parseFederatedAppId, type AppStoreSource} from './app-store-sources.js'

const mockFetch = vi.mocked(fetchFederatedCatalog)

function makeFakeLivinityd(initialSources: AppStoreSource[]) {
	const data: Record<string, unknown> = {appStoreSources: initialSources}
	const store = {
		async get(key: string, def?: unknown) {
			return key in data ? data[key] : def
		},
		async set(key: string, val: unknown) {
			data[key] = val
			return true
		},
		async getWriteLock(job: (m: {get: any; set: any; delete: any}) => Promise<void>) {
			return job({get: store.get, set: store.set, delete: async () => true})
		},
	}
	const livinityd = {
		logger: {createChildLogger: () => ({log() {}, error() {}})},
		store,
	}
	return {livinityd: livinityd as any, data}
}

function source(url: string, name: string, enabled = true): AppStoreSource {
	return {id: deriveSourceId(url), url, name, enabled, addedAt: 1}
}

beforeEach(() => {
	mockFetch.mockReset()
})

describe('AppStore.getFederatedCatalog: trust stamping (D-341-3)', () => {
	it('stamps trusted=false even when the payload manifest claims verified/trusted=true', async () => {
		const src = source('https://a.example.com/catalog.json', 'A')
		const {livinityd} = makeFakeLivinityd([src])
		mockFetch.mockResolvedValue([
			{
				catalogSlug: 'immich',
				// hostile: self-declared trust — must be ignored by the box stamp
				manifest: {id: 'immich', verified: true, trusted: true} as any,
				dockerCompose: 'x',
			},
		])
		const store = new AppStore(livinityd, {defaultAppStoreRepo: ''})
		const apps = await store.getFederatedCatalog()
		expect(apps).toHaveLength(1)
		expect(apps[0].trusted).toBe(false)
	})
})

describe('AppStore.getFederatedCatalog: id namespacing (D-341-3)', () => {
	it('namespaces a slug "immich" to fed-<sourceId>-immich (never bare immich)', async () => {
		const src = source('https://a.example.com/catalog.json', 'A')
		const {livinityd} = makeFakeLivinityd([src])
		mockFetch.mockResolvedValue([{catalogSlug: 'immich', manifest: {} as any, dockerCompose: 'x'}])
		const store = new AppStore(livinityd, {defaultAppStoreRepo: ''})
		const apps = await store.getFederatedCatalog()
		expect(apps[0].id).toBe(namespacedAppId(src.id, 'immich'))
		expect(apps[0].id).not.toBe('immich')
		expect(apps[0].sourceId).toBe(src.id)
	})

	it('a slug that itself looks like "fed-x" stays confined under THIS source id (no forgery)', async () => {
		// N2: the slug regex ACCEPTS "fed-x" (it is a valid slug), so this is not a
		// rejection — it is safely re-namespaced. The leading 12-hex is always the
		// true box-derived sourceId, so a source can never forge another namespace.
		const src = source('https://a.example.com/catalog.json', 'A')
		const {livinityd} = makeFakeLivinityd([src])
		mockFetch.mockResolvedValue([{catalogSlug: 'fed-x', manifest: {} as any, dockerCompose: 'x'}])
		const store = new AppStore(livinityd, {defaultAppStoreRepo: ''})
		const apps = await store.getFederatedCatalog()
		expect(apps[0].id).toBe(`fed-${src.id}-fed-x`)
		// round-trips back to THIS source, never impersonating another
		expect(parseFederatedAppId(apps[0].id)).toEqual({sourceId: src.id, catalogSlug: 'fed-x'})
	})
})

describe('AppStore.getFederatedCatalog: fail-soft per source (A1)', () => {
	it('one errored source does not sink another; bookkeeping stamps ok/error', async () => {
		const a = source('https://a.example.com/catalog.json', 'A')
		const b = source('https://b.example.com/catalog.json', 'B')
		const {livinityd, data} = makeFakeLivinityd([a, b])
		mockFetch.mockImplementation(async (url: string) => {
			if (url === a.url) throw new Error('boom')
			return [{catalogSlug: 'appb', manifest: {} as any, dockerCompose: 'x'}]
		})
		const store = new AppStore(livinityd, {defaultAppStoreRepo: ''})
		const apps = await store.getFederatedCatalog()
		// only B contributed
		expect(apps.map((x) => x.sourceId)).toEqual([b.id])
		// bookkeeping persisted
		const persisted = data.appStoreSources as AppStoreSource[]
		expect(persisted.find((s) => s.id === a.id)?.lastFetchStatus).toBe('error')
		expect(persisted.find((s) => s.id === b.id)?.lastFetchStatus).toBe('ok')
	})

	it('skips a disabled source entirely (never fetched)', async () => {
		const a = source('https://a.example.com/catalog.json', 'A', false)
		const {livinityd} = makeFakeLivinityd([a])
		const store = new AppStore(livinityd, {defaultAppStoreRepo: ''})
		const apps = await store.getFederatedCatalog()
		expect(apps).toHaveLength(0)
		expect(mockFetch).not.toHaveBeenCalled()
	})
})
