// Phase 344-03 XFER-01 — the `appMigration` tRPC router. Exposes the 344-01 export
// engine and the 344-02 import engine behind the project's existing procedure tiers:
//   - exportApp / migrationStatus / listBundles / deleteBundle → adminProcedure
//   - importBundle → stepUpAdminProcedure (+ httpOnlyPaths) — it executes an uploaded
//     compose and writes app data, the same risk tier as system.luksFormat / apps.uninstall
//     (D-344-7). A fresh 5-min step-up grant is required.
//
// Single-flight: one export OR import at a time, enforced by the process-scoped guard in
// migration-progress.ts (migrationStatus precedent). No box-to-box networking — the only
// new listening surface is the admin-gated GET download route in migration-api.ts.
//
// The route bodies delegate to the exported `runGuardedExport` / `runGuardedImport`
// functions so unit tests can exercise the guard + engine wiring WITHOUT standing up the
// adminProcedure / stepUp / audit middleware stack.

import path from 'node:path'

import fse from 'fs-extra'
import {z} from 'zod'

import {router, adminProcedure, stepUpAdminProcedure} from '../server/trpc/trpc.js'
import {
	exportAppBundle,
	listBundleFiles,
	type ExportableApp,
} from './app-bundle-export.js'
import {
	beginMigrationFlight,
	endMigrationFlight,
	getMigrationProgress,
	updateMigrationProgress,
} from './migration-progress.js'

// ---------------------------------------------------------------------------
// Path handling — bundle filenames are validated to a strict basename charset
// (NO slashes → no traversal) AND re-resolved inside the exports dir with a
// dirname assert (belt-and-suspenders, T-344-13).
// ---------------------------------------------------------------------------

/** A bundle filename: basename only (no slashes), ending in `.livbundle`. */
export const bundleFileNameSchema = z
	.string()
	.regex(/^[a-zA-Z0-9._-]+\.livbundle$/, 'invalid bundle filename')

/** The dedicated per-box exports dir every bundle route reads/writes. */
export function migrationExportsDir(livinityd: {dataDirectory: string}): string {
	return path.join(livinityd.dataDirectory, 'app-migration', 'exports')
}

/**
 * The staging subdir the dedicated upload route (migration-api.ts) streams a temp file
 * into BEFORE renaming the completed bundle up into the exports dir — so a half-uploaded
 * file never appears as a valid `.livbundle` in the listed exports dir.
 */
export function migrationIncomingDir(livinityd: {dataDirectory: string}): string {
	return path.join(migrationExportsDir(livinityd), 'incoming')
}

/**
 * Resolve a bundle filename strictly inside `exportsDir`. `file` MUST already have passed
 * bundleFileNameSchema (no slashes); this re-asserts the resolved dirname === exportsDir so
 * a crafted name can never escape the dir. Throws '[invalid-bundle-path]' on any mismatch.
 */
export function resolveBundleInDir(exportsDir: string, file: string): string {
	const dir = path.resolve(exportsDir)
	const resolved = path.resolve(dir, file)
	if (path.dirname(resolved) !== dir || path.basename(resolved) !== file) {
		throw new Error('[invalid-bundle-path]')
	}
	return resolved
}

// ---------------------------------------------------------------------------
// Structural livinityd surface the guarded runners need (keeps the runners unit-testable
// with a plain stub — the real Livinityd satisfies this shape).
// ---------------------------------------------------------------------------

export interface MigrationLivinityd {
	dataDirectory: string
	versionName: string
	apps: {
		instances: ExportableApp[]
		getAllSubdomains: () => Promise<{appId: string}[]>
		importAppBundle: (input: {
			bundlePath: string
		}) => Promise<{ok: true; appId: string} | {ok: false; reason: string}>
	}
}

/** Resolve a GLOBAL app instance by id (D-344-7 global-only) or throw '[app-not-found]'. */
export function resolveGlobalAppForExport(instances: ExportableApp[], appId: string): ExportableApp {
	const app = instances.find((a) => a.id === appId)
	if (!app) throw new Error('[app-not-found]')
	return app
}

/** Summary the exportApp mutation returns to the UI (bundle file + manifest highlights). */
export interface ExportSummary {
	bundleFile: string
	bytes: number
	appId: string
	appVersion: string
	strippedSecrets: string[]
	hasSubdomain: boolean
	createdAt: number
}

/**
 * Guarded export: resolve the app (throws '[app-not-found]' BEFORE claiming the guard, so a
 * bad appId leaves no dangling flight), claim the single-flight guard, run the 344-01 engine
 * reporting progress into the shared singleton, and always clear the guard.
 */
export async function runGuardedExport(
	livinityd: MigrationLivinityd,
	appId: string,
): Promise<ExportSummary> {
	const app = resolveGlobalAppForExport(livinityd.apps.instances, appId)
	if (!beginMigrationFlight('export')) throw new Error('[migration-in-progress]')
	try {
		const exportsDir = migrationExportsDir(livinityd)
		const allSubs = await livinityd.apps.getAllSubdomains().catch(() => [] as {appId: string}[])
		const subdomainCapture = allSubs.find((s) => s.appId === appId) ?? null
		const {bundlePath, manifest} = await exportAppBundle(
			app,
			{
				boxRelease: livinityd.versionName,
				exportsDir,
				dataDirectory: livinityd.dataDirectory,
				subdomainCapture,
				keepLast: 5,
			},
			updateMigrationProgress,
		)
		const st = await fse.stat(bundlePath).catch(() => null)
		const summary: ExportSummary = {
			bundleFile: path.basename(bundlePath),
			bytes: st?.size ?? manifest.totalBytes,
			appId: manifest.appId,
			appVersion: manifest.appVersion,
			strippedSecrets: manifest.strippedSecrets,
			hasSubdomain: manifest.hasSubdomain,
			createdAt: manifest.createdAt,
		}
		endMigrationFlight()
		return summary
	} catch (err) {
		endMigrationFlight({error: err instanceof Error ? err.message : String(err)})
		throw err
	}
}

/**
 * Guarded import: resolve the uploaded bundle strictly inside the exports dir, claim the
 * single-flight guard (BEFORE any fs work, so an in-progress export/import short-circuits
 * with '[migration-in-progress]'), run the 344-02 engine, and always clear the guard.
 */
export async function runGuardedImport(
	livinityd: MigrationLivinityd,
	file: string,
): Promise<{ok: true; appId: string} | {ok: false; reason: string}> {
	const exportsDir = migrationExportsDir(livinityd)
	const bundlePath = resolveBundleInDir(exportsDir, file)
	if (!beginMigrationFlight('import')) throw new Error('[migration-in-progress]')
	try {
		await fse.ensureDir(exportsDir)
		if (!(await fse.pathExists(bundlePath))) {
			endMigrationFlight({error: '[bundle-not-found]'})
			return {ok: false, reason: '[bundle-not-found]'}
		}
		updateMigrationProgress({progress: 5, description: 'Importing bundle'})
		const result = await livinityd.apps.importAppBundle({bundlePath})
		endMigrationFlight(result.ok ? {} : {error: result.reason})
		return result
	} catch (err) {
		endMigrationFlight({error: err instanceof Error ? err.message : String(err)})
		throw err
	}
}

// ---------------------------------------------------------------------------
// The router.
// ---------------------------------------------------------------------------

export const appMigration = router({
	// Export ONE global app to a `.livbundle` (stop → pack → start; non-destructive). AWAITED
	// (rides HTTP, survives the WS window) — the UI polls migrationStatus for progress.
	// ctx.livinityd! — adminProcedure/stepUpAdminProcedure guarantee it at runtime; the `!`
	// keeps the merged (ws|express) Context's optional-livinityd from adding a tsc error
	// (backups/connectivity routes precedent).
	exportApp: adminProcedure
		.input(z.object({appId: z.string().regex(/^[a-zA-Z0-9-_]+$/)}))
		.mutation(async ({ctx, input}) => runGuardedExport(ctx.livinityd!, input.appId)),

	// Poll the shared progress singleton (running/progress/description/error).
	migrationStatus: adminProcedure.query(() => getMigrationProgress()),

	// List produced bundles in the exports dir (newest-first; basename + size + createdAt).
	listBundles: adminProcedure.query(async ({ctx}) => {
		const files = await listBundleFiles(migrationExportsDir(ctx.livinityd!))
		return files.map((f) => ({file: path.basename(f.path), bytes: f.bytes, createdAt: f.mtimeMs}))
	}),

	// Delete a bundle by validated basename, resolved strictly inside the exports dir.
	deleteBundle: adminProcedure
		.input(z.object({file: bundleFileNameSchema}))
		.mutation(async ({ctx, input}) => {
			const exportsDir = migrationExportsDir(ctx.livinityd!)
			const resolved = resolveBundleInDir(exportsDir, input.file)
			await fse.remove(resolved)
			return {ok: true as const, file: input.file}
		}),

	// Import a bundle the operator uploaded (via the dedicated upload route) into the exports
	// dir. stepUpAdminProcedure + httpOnlyPaths — executes an uploaded compose + writes app
	// data (D-344-7, luksFormat risk tier). Single-flight enforced by runGuardedImport.
	importBundle: stepUpAdminProcedure
		.input(z.object({file: bundleFileNameSchema}))
		.mutation(async ({ctx, input}) => runGuardedImport(ctx.livinityd!, input.file)),
})

export default appMigration
