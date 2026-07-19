// Phase 344-03 XFER-01 — module-scoped progress singleton + a process single-flight
// guard shared by the export engine (344-01) and the import engine (344-02) behind the
// appMigration router (migration-routes.ts). Mirrors migration/migration.ts's
// `migrationStatus` singleton EXACTLY: one long op reports progress into a module-local
// ProgressStatus the UI polls, and ONLY ONE export OR import may run at a time — a second
// call while `running` is rejected by the caller (D-344-7 single-flight).
//
// Process-scoped by design (no StoreSchema key — plan decision): the guard lives in the
// livinityd process just like migrationStatus. A livinityd restart clears it, which is the
// correct behavior — an export/import cannot survive a process restart anyway.

import type {ProgressStatus} from './schema.js'

/** Which flight (if any) currently owns the guard. */
export type MigrationKind = 'export' | 'import'

// The single shared status (migration.ts:19 precedent). `kind` records which flight owns
// the guard so diagnostics/UI can distinguish an export from an import.
let state: ProgressStatus = {running: false, progress: 0, description: '', error: false}
let kind: MigrationKind | null = null

/** Current ProgressStatus snapshot (the appMigration.migrationStatus query returns this). */
export function getMigrationProgress(): ProgressStatus {
	return state
}

/** The in-flight kind (or null when idle) — for diagnostics/tests. */
export function getMigrationKind(): MigrationKind | null {
	return kind
}

/**
 * Merge a partial update into the shared status (the engines' `onProgress` callback).
 * Never flips `running` — that is owned by begin/endMigrationFlight so a stray progress
 * report can neither start nor stop a flight.
 */
export function updateMigrationProgress(partial: Partial<ProgressStatus>): void {
	state = {...state, ...partial, running: state.running}
}

/**
 * Single-flight guard. Returns false (WITHOUT mutating state) if an export/import is
 * already running — the caller rejects the second attempt with '[migration-in-progress]'.
 * Otherwise marks `running`, records the kind, and resets progress/error for the new flight.
 */
export function beginMigrationFlight(k: MigrationKind): boolean {
	if (state.running) return false
	kind = k
	state = {
		running: true,
		progress: 0,
		description: k === 'export' ? 'Starting export' : 'Starting import',
		error: false,
	}
	return true
}

/**
 * Clear the guard at the end of a flight. On success: running=false, progress=100, error
 * cleared. On error: running=false, progress LEFT where it stalled, error=<message> — so a
 * poller sees the failure reason instead of a misleading 100%.
 */
export function endMigrationFlight(opts: {error?: string} = {}): void {
	state = {
		...state,
		running: false,
		progress: opts.error ? state.progress : 100,
		error: opts.error ?? false,
	}
	kind = null
}
