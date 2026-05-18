/**
 * Phase 148 — install handler contracts (SPEC §4).
 *
 * Section-aware install dispatcher infrastructure. Each v37 section
 * (app / webapp / native / ai / plugin) has its own InstallHandler
 * implementation; the InstallDispatcher routes by section.
 *
 * NOTE: the existing `installForUser` path in apps.ts handles the
 * legacy `section='app'` (Docker compose) flow and is not affected by
 * this file. New handlers (P150-B native, P152-B ai, P153 plugin) live
 * alongside it.
 */

import type pg from 'pg'

// ─── Sections + IDs ──────────────────────────────────────────────────────

export type Section = 'app' | 'webapp' | 'native' | 'ai' | 'plugin'

export const VALID_SECTIONS: readonly Section[] = [
	'app',
	'webapp',
	'native',
	'ai',
	'plugin',
] as const

// ─── Catalog row (subset relevant to install handlers) ───────────────────

/**
 * The bits of a Supabase `apps` row that an install handler needs. The
 * full DB row has more columns (description, version, icon_url, etc.);
 * handlers can fetch them via the catalog API if they need to. Keeping
 * this slim makes the contract testable without a real Supabase client.
 */
export interface AppCatalogRow {
	id: string // apps.slug — the externally-stable handle
	name: string
	section: Section
	category: string
	manifest: unknown // section-specific JSON; each handler re-parses
}

// ─── Logger contract (subset; livinityd has a richer one) ────────────────

export interface InstallLogger {
	info: (msg: string, extra?: unknown) => void
	warn: (msg: string, extra?: unknown) => void
	error: (msg: string, extra?: unknown) => void
}

// ─── Redis surface used by handlers ──────────────────────────────────────

export interface InstallRedisLike {
	set(key: string, value: string): Promise<string | 'OK' | null>
	get(key: string): Promise<string | null>
	del(key: string): Promise<number>
	keys(pattern: string): Promise<string[]>
	publish(channel: string, message: string): Promise<number>
}

// ─── Context passed to every handler ─────────────────────────────────────

export interface InstallContext {
	userId: string // livos DB users.id
	apiKey: string // user's liv_k_* key (for marketplace callbacks)
	redis: InstallRedisLike
	pg: pg.Pool
	logger: InstallLogger
}

// ─── Progress events ─────────────────────────────────────────────────────

export interface InstallProgressEvent {
	appId: string
	section: Section
	pct: number // 0–100
	message: string
	done: boolean
	error?: string
}

export type ProgressEmitter = (e: InstallProgressEvent) => void

// ─── Outcomes ────────────────────────────────────────────────────────────

export type InstallErrorCode =
	| 'manifest_invalid'
	| 'signature_invalid'
	| 'capability_denied'
	| 'dependency_missing'
	| 'network_failed'
	| 'disk_full'
	| 'apt_failed'
	| 'sudo_denied'
	| 'docker_failed'
	| 'plugin_load_failed'
	| 'not_implemented'
	| 'unknown'

export interface InstallResult {
	appId: string
	section: Section
	ok: true
	details: {
		composeProjectName?: string // section='app'
		webappId?: string // section='webapp'
		desktopEntryPath?: string // section='native'
		binaryPath?: string // section='native'
		mcpServerName?: string // section='ai' kind='mcp'
		agentTemplateId?: string // section='ai' kind='agent'
		pluginId?: string // section='plugin'
		pluginMountPath?: string // section='plugin'
		[extra: string]: unknown
	}
}

export interface InstallError {
	appId: string
	section: Section
	ok: false
	code: InstallErrorCode
	message: string
	cause?: unknown
}

export type InstallOutcome = InstallResult | InstallError

// ─── Handler interface ───────────────────────────────────────────────────

export interface InstallHandler<S extends Section = Section> {
	readonly section: S
	install(
		app: AppCatalogRow,
		ctx: InstallContext,
		progress: ProgressEmitter,
	): Promise<InstallOutcome>
	uninstall(
		appId: string,
		ctx: InstallContext,
		progress: ProgressEmitter,
	): Promise<InstallOutcome>
}

// ─── Dispatcher ──────────────────────────────────────────────────────────

/**
 * Routes a catalog row to its section's handler. Handlers register
 * themselves at livinityd boot time; the dispatcher is held in the
 * service container alongside the existing Docker installer.
 */
export class InstallDispatcher {
	private readonly handlers = new Map<Section, InstallHandler>()

	register<S extends Section>(handler: InstallHandler<S>): void {
		if (this.handlers.has(handler.section)) {
			throw new Error(
				`InstallDispatcher: handler for "${handler.section}" already registered`,
			)
		}
		this.handlers.set(handler.section, handler)
	}

	hasHandler(section: Section): boolean {
		return this.handlers.has(section)
	}

	async install(
		app: AppCatalogRow,
		ctx: InstallContext,
		emit: ProgressEmitter,
	): Promise<InstallOutcome> {
		const h = this.handlers.get(app.section)
		if (!h) {
			return {
				appId: app.id,
				section: app.section,
				ok: false,
				code: 'not_implemented',
				message: `no install handler registered for section="${app.section}"`,
			}
		}
		try {
			return await h.install(app, ctx, emit)
		} catch (err) {
			return {
				appId: app.id,
				section: app.section,
				ok: false,
				code: 'unknown',
				message: err instanceof Error ? err.message : String(err),
				cause: err,
			}
		}
	}

	async uninstall(
		appId: string,
		section: Section,
		ctx: InstallContext,
		emit: ProgressEmitter,
	): Promise<InstallOutcome> {
		const h = this.handlers.get(section)
		if (!h) {
			return {
				appId,
				section,
				ok: false,
				code: 'not_implemented',
				message: `no uninstall handler registered for section="${section}"`,
			}
		}
		try {
			return await h.uninstall(appId, ctx, emit)
		} catch (err) {
			return {
				appId,
				section,
				ok: false,
				code: 'unknown',
				message: err instanceof Error ? err.message : String(err),
				cause: err,
			}
		}
	}
}

// ─── Small helpers handlers can reuse ────────────────────────────────────

export function progressFactory(
	emit: ProgressEmitter,
	appId: string,
	section: Section,
): (pct: number, message: string, done?: boolean, error?: string) => void {
	return (pct, message, done = false, error) =>
		emit({appId, section, pct, message, done, error})
}

export function ok<T extends InstallResult['details']>(
	appId: string,
	section: Section,
	details: T,
): InstallResult {
	return {appId, section, ok: true, details}
}

export function fail(
	appId: string,
	section: Section,
	code: InstallErrorCode,
	message: string,
	cause?: unknown,
): InstallError {
	return {appId, section, ok: false, code, message, cause}
}
