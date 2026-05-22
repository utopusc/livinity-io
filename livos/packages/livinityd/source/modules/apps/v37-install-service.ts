/**
 * Phase 157 — v37 install service container.
 *
 * Wires the InstallDispatcher (Phase 148 SPEC §4) to its concrete
 * handlers: NativeInstaller (Phase 150-B), AiInstaller (Phase 152-B).
 *
 * PluginInstaller wiring + PluginLoader + Express /p/:id/* mount are
 * intentionally NOT wired here yet — they require boot-time scan of
 * /opt/livos/plugins/* with signed bundles. Phase 157 ships the
 * dispatch path so native/ai/webapp work end-to-end; the plugin slot
 * returns `not_implemented` via the dispatcher's default handler-miss
 * branch until a follow-up wires PluginInstaller in.
 *
 * The dispatcher + a small in-memory progress map are module-scope so
 * the trpc procedures (apps.installV37 / uninstallV37 / v37Progress) can
 * resolve them via getters without threading them through ctx.
 */

import type pg from 'pg'

import {
	InstallDispatcher,
	type InstallContext,
	type InstallProgressEvent,
	type Section,
} from './install-contracts.js'
import {NativeInstaller} from './native-installer.js'
import {AiInstaller, type McpConfigManagerLike} from './ai-installer.js'
import type {NativeAppConfigStore} from './native-app-config.js'

// ─── Module-scope singletons ─────────────────────────────────────────────

let dispatcher: InstallDispatcher | null = null

/**
 * Most-recent progress event per appId. The bridge polls this via
 * trpcClient.apps.v37Progress.query while an install is in flight. Events
 * stay in the map until the next install for the same appId overwrites
 * them — the bridge clears its local progress state on `installed`.
 */
const progressByAppId = new Map<string, InstallProgressEvent>()

// ─── Init (called from livinityd.start()) ────────────────────────────────

export interface InitV37Options {
	nativeAppConfigStore: NativeAppConfigStore
	mcpConfigManager: McpConfigManagerLike
}

export function initV37InstallService(opts: InitV37Options): InstallDispatcher {
	if (dispatcher) return dispatcher
	const d = new InstallDispatcher()
	d.register(new NativeInstaller(opts.nativeAppConfigStore))
	d.register(new AiInstaller(opts.mcpConfigManager))
	// Phase 157 follow-up: register PluginInstaller once PluginLoader.scan()
	// and Express /p/:id/* middleware are wired (currently deferred).
	dispatcher = d
	return d
}

export function getDispatcher(): InstallDispatcher | null {
	return dispatcher
}

export function recordProgress(event: InstallProgressEvent): void {
	progressByAppId.set(event.appId, event)
}

export function getProgress(appId: string): InstallProgressEvent | null {
	return progressByAppId.get(appId) ?? null
}

export function clearProgress(appId: string): void {
	progressByAppId.delete(appId)
}

// Test-only — reset state between tests.
export function _resetV37ServiceForTest(): void {
	dispatcher = null
	progressByAppId.clear()
}

// ─── InstallContext factory ──────────────────────────────────────────────

/**
 * Build an InstallContext from the bits livinityd has at procedure-call
 * time. The handlers consume `redis` (ioredis instance), `pg` (pg.Pool),
 * `logger`, `userId` (for $HOME path on native installs), and `apiKey`
 * (only consumed for marketplace callbacks; safe to leave blank in v37).
 */
export interface ContextDeps {
	userId: string
	apiKey?: string
	redis: InstallContext['redis']
	pg: pg.Pool
	logger: InstallContext['logger']
}

export function buildInstallContext(deps: ContextDeps): InstallContext {
	return {
		userId: deps.userId,
		apiKey: deps.apiKey ?? '',
		redis: deps.redis,
		pg: deps.pg,
		logger: deps.logger,
	}
}

// Re-export for downstream consumers (trpc routes).
export type {Section}
