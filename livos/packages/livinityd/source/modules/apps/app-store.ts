import type Livinityd from '../../index.js'

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
}
