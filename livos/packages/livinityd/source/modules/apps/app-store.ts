import type Livinityd from '../../index.js'
// Phase 341-01 (REPO-01) — federated app-store source model + SSRF-guarded fetch.
import {
	deriveSourceId,
	namespacedAppId,
	type AppStoreSource,
	type FederatedCatalogApp,
} from './app-store-sources.js'
import {fetchFederatedCatalog} from './federated-catalog.js'

// Phase 276 (WS1-A): the community git-clone app store was removed (the
// `utopusc/livinity-apps` repo was deleted). Browse now lives entirely in the
// `https://livinity.io/store` iframe (reads Supabase); install resolves via
// Step 1 (builtin, generateAppTemplate) + Step 2 (Supabase /api/apps/<id>).
//
// This class is kept as a THIN SHELL because index.ts still does
// `new AppStore(...)` / `.start()` / `.stop()` and routes.ts still exposes
// `registry` / `addRepository` / `removeRepository`. `registry()` returns `[]`
// so the desktop-wide AvailableAppsProvider resolves empty (never throws) and
// the `RegistryApp` type (derived from the registry route output) still holds.
export default class AppStore {
	#livinityd: Livinityd
	logger: Livinityd['logger']
	// Kept as a harmless field — index.ts's constructor still passes it and
	// factory-reset historically assigned it. Unused by the shell.
	defaultAppStoreRepo: string

	constructor(livinityd: Livinityd, {defaultAppStoreRepo}: {defaultAppStoreRepo: string}) {
		this.#livinityd = livinityd
		const {name} = this.constructor
		this.logger = livinityd.logger.createChildLogger(name.toLowerCase())
		this.defaultAppStoreRepo = defaultAppStoreRepo
	}

	async start() {
		this.logger.log('App store initialised (registry disabled — browse is the web iframe)')
	}

	async stop() {}

	// Registry browse is the web iframe now; the native grid is gone. Returning
	// `[]` keeps the route output an array (RegistryApp type) and lets the
	// desktop-wide provider resolve empty without throwing.
	async registry() {
		return [] as Array<any>
	}

	// No-op — there are no git repositories to update. Still callable from the
	// post-restore reinstall path in apps.ts.
	async update() {
		/* registry disabled — nothing to update */
	}

	async addRepository(_url: string): Promise<boolean> {
		throw new Error('App repositories are no longer supported (the community git store was removed in Phase 276)')
	}

	async removeRepository(_url: string): Promise<boolean> {
		throw new Error('App repositories are no longer supported (the community git store was removed in Phase 276)')
	}

	// ── Phase 341-01 (REPO-01) — federated app-store sources ──────────────────
	//
	// A source is an admin-added HTTPS catalog-INDEX URL (D-341-1). These methods
	// are ADDITIVE — the legacy addRepository/removeRepository throwers above are
	// untouched. Trust is stamped here (getFederatedCatalog) in ONE place, from
	// the fetch path, NEVER from the catalog payload (D-341-3).

	async listSources(): Promise<AppStoreSource[]> {
		return (await this.#livinityd.store.get('appStoreSources', [])) as AppStoreSource[]
	}

	async addSource({
		url,
		name,
		addedBy,
	}: {
		url: string
		name: string
		addedBy?: string
	}): Promise<AppStoreSource> {
		// https-only (the fetch guard re-checks, but reject early with a clear msg).
		let u: URL
		try {
			u = new URL(url)
		} catch {
			throw new Error('Invalid catalog URL')
		}
		if (u.protocol !== 'https:') {
			throw new Error('Only https catalog URLs are allowed')
		}

		// Reachability + SSRF-safety probe at ADD time (D-341-4). If the source is
		// unreachable / private / oversize / invalid, reject the add — do NOT
		// persist an unusable source. This runs the SAME hardened fetch every
		// refresh uses.
		await fetchFederatedCatalog(url, {})

		const id = deriveSourceId(url)
		const source: AppStoreSource = {
			id,
			url,
			name,
			enabled: true,
			addedAt: Date.now(),
			addedBy,
			lastFetchedAt: Date.now(),
			lastFetchStatus: 'ok',
		}

		// Write under the store lock so a concurrent add/remove can't drop this
		// write (mirrors apps.ts's apps-array write discipline).
		await this.#livinityd.store.getWriteLock(async ({get, set}) => {
			const sources = ((await get('appStoreSources')) as AppStoreSource[] | undefined) ?? []
			if (sources.some((s) => s.id === id)) {
				throw new Error('This app-store source has already been added')
			}
			sources.push(source)
			await set('appStoreSources', sources)
		})
		return source
	}

	async removeSource(id: string): Promise<boolean> {
		let removed = false
		await this.#livinityd.store.getWriteLock(async ({get, set}) => {
			const sources = ((await get('appStoreSources')) as AppStoreSource[] | undefined) ?? []
			const next = sources.filter((s) => s.id !== id)
			removed = next.length !== sources.length
			if (removed) await set('appStoreSources', next)
		})
		// NOTE: does NOT uninstall already-installed federated apps — they keep
		// running, they just stop being installable from this source.
		return removed
	}

	async setSourceEnabled(id: string, enabled: boolean): Promise<boolean> {
		let found = false
		await this.#livinityd.store.getWriteLock(async ({get, set}) => {
			const sources = ((await get('appStoreSources')) as AppStoreSource[] | undefined) ?? []
			const next = sources.map((s) => {
				if (s.id === id) {
					found = true
					return {...s, enabled}
				}
				return s
			})
			if (found) await set('appStoreSources', next)
		})
		return found
	}

	/**
	 * Resolve the merged federated catalog across all ENABLED sources. Fail-soft
	 * per source: one unreachable/invalid source is stamped `error` and returns
	 * no apps, never sinking the others. Trust is stamped `false` HERE, as a
	 * literal — NEVER read from any payload field (D-341-3).
	 */
	async getFederatedCatalog(): Promise<FederatedCatalogApp[]> {
		const sources = await this.listSources()
		const out: FederatedCatalogApp[] = []
		// Accumulate the per-source bookkeeping and persist once at the end.
		const status = new Map<string, {lastFetchedAt: number; lastFetchStatus: 'ok' | 'error'; lastFetchError?: string}>()

		for (const src of sources) {
			if (!src.enabled) continue
			try {
				const apps = await fetchFederatedCatalog(src.url, {})
				status.set(src.id, {lastFetchedAt: Date.now(), lastFetchStatus: 'ok'})
				for (const a of apps) {
					out.push({
						id: namespacedAppId(src.id, a.catalogSlug),
						sourceId: src.id,
						sourceName: src.name,
						trusted: false, // NON-overridable — box-stamped from the fetch path
						catalogSlug: a.catalogSlug,
						manifest: a.manifest,
						iconUrl: a.iconUrl,
						// dockerCompose is intentionally NOT projected here — install
						// re-fetches (341-02); browse never carries compose content.
					})
				}
			} catch (e) {
				status.set(src.id, {
					lastFetchedAt: Date.now(),
					lastFetchStatus: 'error',
					lastFetchError: String((e as Error)?.message ?? e),
				})
				// fail-soft: this source contributes no apps
			}
		}

		// Persist the updated lastFetch* bookkeeping under the lock.
		if (status.size > 0) {
			await this.#livinityd.store.getWriteLock(async ({get, set}) => {
				const current = ((await get('appStoreSources')) as AppStoreSource[] | undefined) ?? []
				const next = current.map((s) => {
					const u = status.get(s.id)
					return u ? {...s, ...u} : s
				})
				await set('appStoreSources', next)
			})
		}
		return out
	}
}
