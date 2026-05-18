/**
 * Phase 153 — plugin loader + hot-reload Express dispatcher.
 *
 * Responsibilities:
 *   1. Scan /opt/livos/plugins/*.json on boot, load active plugins.
 *   2. Dynamic-import each plugin's backend ES module, build its
 *      runtime API (scoped redis/fs per capability), call onActivate.
 *   3. Maintain a routing table: requests under /p/<id>/ are dispatched
 *      to the loaded plugin's handler. Hot-unmount happens by removing
 *      the plugin from the table — no Express route surgery required.
 *   4. On install, version bump, or uninstall, re-scan and update the
 *      routing table live. Broadcast `plugin:installed` /
 *      `plugin:uninstalled` over the WebSocket channel that the UI
 *      shell listens on for hot widget injection.
 */

import {promises as fs} from 'fs'
import * as path from 'path'
import {pathToFileURL} from 'url'

import {PluginManifestSchema, type PluginManifest} from './manifest-schema.js'
import {
	type PluginBackendModule,
	type PluginRuntimeApi,
	type PluginRuntimeLogger,
	type RawRedisLike,
	type ExpressLikeHandler,
	type SlashCommandHandler,
	buildRuntimeApi,
} from './runtime-api.js'

import type pg from 'pg'

// ─── Loaded plugin record ────────────────────────────────────────────────

export interface LoadedPlugin {
	id: string
	manifest: PluginManifest
	module: PluginBackendModule
	api: PluginRuntimeApi
	mountedAt: number
	pluginDir: string
	uiBundleUrl: string | null // URL clients fetch to hot-mount widgets
}

// ─── Loader ──────────────────────────────────────────────────────────────

export interface PluginLoaderOptions {
	pluginsDir: string // typically /opt/livos/plugins
	rawRedis: RawRedisLike
	pgPool: pg.Pool
	logger: PluginRuntimeLogger
	onBroadcast?: (event: 'plugin:installed' | 'plugin:uninstalled', id: string) => void
}

export class PluginLoader {
	private readonly plugins = new Map<string, LoadedPlugin>()
	private readonly opts: PluginLoaderOptions

	constructor(opts: PluginLoaderOptions) {
		this.opts = opts
	}

	getPlugin(id: string): LoadedPlugin | undefined {
		return this.plugins.get(id)
	}

	listPlugins(): readonly LoadedPlugin[] {
		return Array.from(this.plugins.values())
	}

	/** Scan plugins directory and load every plugin found. */
	async scan(): Promise<void> {
		await fs.mkdir(this.opts.pluginsDir, {recursive: true})
		const entries = await fs.readdir(this.opts.pluginsDir, {withFileTypes: true})
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name.startsWith('.')) continue
			const pluginDir = path.join(this.opts.pluginsDir, entry.name)
			try {
				await this.loadFromDir(pluginDir)
			} catch (err) {
				this.opts.logger.error(`failed to load plugin from ${pluginDir}`, err)
			}
		}
	}

	/**
	 * Load (or reload) a plugin from its directory. The directory must
	 * contain `plugin-manifest.json` and `backend/index.mjs`. The
	 * manifest signature is presumed already verified at install time
	 * by `plugin-installer.ts`; this function trusts the on-disk state.
	 */
	async loadFromDir(pluginDir: string): Promise<LoadedPlugin> {
		const manifestPath = path.join(pluginDir, 'plugin-manifest.json')
		const manifestRaw = await fs.readFile(manifestPath, 'utf8')
		const parsed = PluginManifestSchema.parse(JSON.parse(manifestRaw))

		// If an older version is already mounted, deactivate it first.
		const existing = this.plugins.get(parsed.id)
		if (existing) {
			await this.callDeactivate(existing)
			this.plugins.delete(parsed.id)
		}

		// Cache-busted dynamic import — appending a query string forces a
		// fresh module evaluation. Node's ESM cache is keyed by URL, so
		// the new bundle is fully isolated from the previous version.
		const backendPath = path.join(pluginDir, 'backend/index.mjs')
		const moduleUrl =
			pathToFileURL(backendPath).href + `?v=${Date.now()}`
		const imported = (await import(moduleUrl)) as {
			default?: PluginBackendModule
		}
		const module = imported.default
		if (!module) {
			throw new Error(`${parsed.id}: backend/index.mjs has no default export`)
		}

		const api = buildRuntimeApi(
			parsed.id,
			parsed,
			this.opts.rawRedis,
			this.opts.pgPool,
			this.scopedLogger(parsed.id),
			(name: string, payload: unknown) =>
				this.opts.logger.info(`[event:${parsed.id}] ${name}`, payload),
		)

		if (module.onActivate) {
			await module.onActivate(api)
		}

		const uiBundleEntry = parsed.uiBundle?.entry ?? 'ui/bundle.umd.js'
		const uiBundlePath = path.join(pluginDir, uiBundleEntry)
		let uiBundleUrl: string | null = null
		try {
			await fs.stat(uiBundlePath)
			// Plugins ship UI bundles at /p/<id>/_ui — the dispatcher
			// serves them statically. Path is namespaced so widgets can
			// reference each other safely.
			uiBundleUrl = `/p/${parsed.id}/_ui/${path.basename(uiBundleEntry)}`
		} catch {
			// no UI bundle — backend-only plugin
		}

		const loaded: LoadedPlugin = {
			id: parsed.id,
			manifest: parsed,
			module,
			api,
			mountedAt: Date.now(),
			pluginDir,
			uiBundleUrl,
		}
		this.plugins.set(parsed.id, loaded)
		this.opts.onBroadcast?.('plugin:installed', parsed.id)
		this.opts.logger.info(`plugin "${parsed.id}" v${parsed.version} mounted`)
		return loaded
	}

	/** Unload a plugin — calls onDeactivate, removes from routing table. */
	async unload(id: string): Promise<void> {
		const existing = this.plugins.get(id)
		if (!existing) return
		await this.callDeactivate(existing)
		this.plugins.delete(id)
		this.opts.onBroadcast?.('plugin:uninstalled', id)
		this.opts.logger.info(`plugin "${id}" unmounted`)
	}

	/**
	 * Dispatch an incoming HTTP request to the matching plugin's handler.
	 * Mounts on Express as a single catchall: `app.use('/p/:id/*', ...)`.
	 * Look up the plugin by `:id`, find the matching route from its
	 * manifest, call its handler.
	 */
	async dispatchRequest(
		pluginId: string,
		method: string,
		subPath: string,
		req: Parameters<ExpressLikeHandler>[0],
		res: Parameters<ExpressLikeHandler>[1],
	): Promise<boolean> {
		const plugin = this.plugins.get(pluginId)
		if (!plugin) return false

		// Special path: serve static assets at /_ui/* and /_assets/*.
		if (subPath.startsWith('/_ui/') || subPath.startsWith('/_assets/')) {
			// The actual file serving lives in the parent Express
			// middleware — return true here so the caller knows not to
			// 404. Implementation note: parent middleware uses
			// express.static() rooted at `${plugin.pluginDir}/ui` or
			// `/assets`.
			return true
		}

		const routes = plugin.manifest.hooks.routes ?? []
		const matched = routes.find(
			(r: {path: string; method: string; handler: string}) => {
				if (r.method !== '*' && r.method !== method) return false
				return r.path === subPath
			},
		)
		if (!matched) return false

		const handler = plugin.module.handlers?.[matched.handler]
		if (!handler) {
			this.opts.logger.warn(
				`plugin "${pluginId}" route ${matched.path} → handler "${matched.handler}" missing`,
			)
			return false
		}
		await handler(req, res)
		return true
	}

	/**
	 * Slash-command dispatcher. AI Chat's command bar calls this when
	 * the user types `/foo`. Returns the string the chat injects as a
	 * tool result.
	 */
	async dispatchCommand(
		slash: string,
		args: string,
		ctx: {userId: string; sessionId: string},
	): Promise<{ok: true; result: string} | {ok: false; reason: string}> {
		for (const plugin of this.plugins.values()) {
			const cmd = plugin.manifest.hooks.commands?.find(
				(c: {slash: string; handler: string; description: string}) => c.slash === slash,
			)
			if (!cmd) continue
			const handler = plugin.module.commands?.[cmd.handler] as
				| SlashCommandHandler
				| undefined
			if (!handler) return {ok: false, reason: 'handler missing in backend module'}
			try {
				const result = await handler(args, ctx)
				return {ok: true, result}
			} catch (err) {
				return {
					ok: false,
					reason: err instanceof Error ? err.message : String(err),
				}
			}
		}
		return {ok: false, reason: `no plugin owns slash command "${slash}"`}
	}

	// ── internals ────────────────────────────────────────────────────────

	private async callDeactivate(plugin: LoadedPlugin): Promise<void> {
		if (plugin.module.onDeactivate) {
			try {
				await plugin.module.onDeactivate(plugin.api)
			} catch (err) {
				this.opts.logger.error(
					`plugin "${plugin.id}" onDeactivate threw — continuing anyway`,
					err,
				)
			}
		}
	}

	private scopedLogger(pluginId: string): PluginRuntimeLogger {
		const base = this.opts.logger
		const prefix = `[plugin:${pluginId}]`
		return {
			info: (msg: string, extra?: unknown) => base.info(`${prefix} ${msg}`, extra),
			warn: (msg: string, extra?: unknown) => base.warn(`${prefix} ${msg}`, extra),
			error: (msg: string, extra?: unknown) => base.error(`${prefix} ${msg}`, extra),
		}
	}
}
