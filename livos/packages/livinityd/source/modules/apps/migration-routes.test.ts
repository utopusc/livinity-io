// Phase 344-03 XFER-01 — offline unit tests for the appMigration route helpers:
// the progress singleton + single-flight guard (migration-progress.ts) and the guarded
// export/import runners + traversal-safe path resolution (migration-routes.ts).
//
// NO tRPC middleware, NO docker, NO network — the runners are exercised through their
// exported functions with plain stub livinityd objects. The full HTTP/adminProcedure/
// step-up wiring is asserted structurally (grep) + deferred to 344-HUMAN-UAT.

import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {
	beginMigrationFlight,
	endMigrationFlight,
	getMigrationKind,
	getMigrationProgress,
	updateMigrationProgress,
} from './migration-progress.js'
import {
	bundleFileNameSchema,
	migrationExportsDir,
	resolveBundleInDir,
	resolveGlobalAppForExport,
	runGuardedExport,
	runGuardedImport,
	type MigrationLivinityd,
} from './migration-routes.js'
import type {ExportableApp} from './app-bundle-export.js'

// Always start each test from an idle guard (a prior test may have left a flight running).
beforeEach(() => endMigrationFlight())
afterEach(() => endMigrationFlight())

function stubLivinityd(overrides: Partial<MigrationLivinityd> = {}): MigrationLivinityd {
	return {
		dataDirectory: '/tmp/livos-migration-test',
		versionName: 'test-version',
		apps: {
			instances: [] as ExportableApp[],
			getAllSubdomains: async () => [],
			importAppBundle: async () => ({ok: true as const, appId: 'stub'}),
			...(overrides.apps ?? {}),
		},
		...overrides,
	}
}

describe('migration-progress single-flight guard', () => {
	// Test 1 — begin is single-flight: first true, second (while running) false, and a
	// fresh begin after end is true again.
	test('beginMigrationFlight is single-flight', () => {
		expect(beginMigrationFlight('export')).toBe(true)
		expect(getMigrationProgress().running).toBe(true)
		expect(getMigrationKind()).toBe('export')
		// A second claim while running is refused WITHOUT resetting the running flight.
		expect(beginMigrationFlight('import')).toBe(false)
		expect(getMigrationKind()).toBe('export')
		// After ending, a new flight can begin again.
		endMigrationFlight()
		expect(getMigrationProgress().running).toBe(false)
		expect(getMigrationKind()).toBe(null)
		expect(beginMigrationFlight('import')).toBe(true)
		expect(getMigrationKind()).toBe('import')
	})

	// Test 2 — updateMigrationProgress merges partials (never flips running); endMigrationFlight
	// with an error clears running, keeps progress where it stalled, and records the message.
	test('updateMigrationProgress merges + endMigrationFlight sets error', () => {
		expect(beginMigrationFlight('export')).toBe(true)
		updateMigrationProgress({progress: 42, description: 'Packing volume data'})
		let s = getMigrationProgress()
		expect(s.progress).toBe(42)
		expect(s.description).toBe('Packing volume data')
		expect(s.running).toBe(true) // update never flips running
		endMigrationFlight({error: '[bundle-tar-failed]'})
		s = getMigrationProgress()
		expect(s.running).toBe(false)
		expect(s.progress).toBe(42) // stalled progress preserved on error (not forced to 100)
		expect(s.error).toBe('[bundle-tar-failed]')
		// A clean end (no error) forces progress to 100 and clears error.
		beginMigrationFlight('import')
		updateMigrationProgress({progress: 30})
		endMigrationFlight()
		s = getMigrationProgress()
		expect(s.progress).toBe(100)
		expect(s.error).toBe(false)
	})
})

describe('bundle filename traversal safety', () => {
	// Test 3 — the schema + resolveBundleInDir reject traversal / absolute / non-basename
	// filenames; a plain basename resolves inside the exports dir.
	test('deleteBundle-style filename validation rejects traversal', () => {
		// Schema rejects anything with a slash or the wrong extension.
		for (const bad of ['../evil', '/etc/passwd', '../../x.livbundle', 'a/b.livbundle', 'evil', 'x.tar.gz']) {
			expect(bundleFileNameSchema.safeParse(bad).success).toBe(false)
		}
		// A valid basename passes the schema.
		expect(bundleFileNameSchema.safeParse('immich-1720000000000.livbundle').success).toBe(true)

		const exportsDir = migrationExportsDir(stubLivinityd())
		// The resolve assert ALSO rejects traversal even if a name slipped past (defense-in-depth).
		for (const bad of ['../evil.livbundle', '../../etc/x.livbundle', 'sub/x.livbundle']) {
			expect(() => resolveBundleInDir(exportsDir, bad)).toThrow('[invalid-bundle-path]')
		}
		// A plain basename resolves strictly inside the exports dir (compare via path.resolve
		// so the assertion is OS-path-normalization agnostic — Windows backslashes / drive).
		const resolved = resolveBundleInDir(exportsDir, 'immich-1.livbundle')
		expect(path.dirname(resolved)).toBe(path.resolve(exportsDir))
		expect(path.basename(resolved)).toBe('immich-1.livbundle')
	})
})

describe('guarded runners', () => {
	// Test 4 — exportApp on an unknown appId throws '[app-not-found]' and leaves NO dangling
	// flight (the resolve happens before the guard is claimed).
	test('runGuardedExport on an unknown appId throws [app-not-found]', async () => {
		const livinityd = stubLivinityd() // empty instances
		await expect(runGuardedExport(livinityd, 'does-not-exist')).rejects.toThrow('[app-not-found]')
		expect(getMigrationProgress().running).toBe(false) // no flight was claimed
		// resolveGlobalAppForExport is the pure gate under it.
		expect(() => resolveGlobalAppForExport([], 'nope')).toThrow('[app-not-found]')
	})

	// Test 5 — importBundle refuses a second concurrent flight: with an export flight already
	// running, runGuardedImport short-circuits with '[migration-in-progress]' (before any fs).
	test('runGuardedImport refuses a second concurrent flight', async () => {
		expect(beginMigrationFlight('export')).toBe(true) // an export is in flight
		const livinityd = stubLivinityd()
		await expect(runGuardedImport(livinityd, 'some-bundle.livbundle')).rejects.toThrow(
			'[migration-in-progress]',
		)
		// The original export flight is untouched by the refused import.
		expect(getMigrationProgress().running).toBe(true)
		expect(getMigrationKind()).toBe('export')
	})
})
