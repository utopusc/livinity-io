import path from 'node:path'

import {$} from 'execa'
import fse from 'fs-extra'

/**
 * Backup-completeness (2026-07-03) — capture the box's out-of-tree state INTO the
 * dataDirectory so the existing Kopia snapshot (which only covers dataDirectory)
 * becomes a complete, self-sufficient restore point.
 *
 * Three stores live outside dataDirectory and were in NO backup path:
 *   1. the `livos` Postgres DB — users, user_app_instances, subdomain-routing
 *      metadata, AND Liv's memory (mastra + pgvector). THE biggest gap: without
 *      this, a rebuild loses Liv's built-up context and the records that tie app
 *      instances + routing together.
 *   2. /opt/liv-assistant/data — AionUi (Liv AI chat) history + skills.
 * We fold both into `${dataDirectory}/system-state/` right before each snapshot,
 * and restore them on the first boot after a restore, BEFORE apps/routing init.
 *
 * Everything here is BEST-EFFORT + NON-FATAL: a capture failure must never abort
 * the file snapshot (a files-only backup still beats none). All shell-outs use
 * execa array form (the DATABASE_URL is never shell-interpolated).
 */

const SYSTEM_STATE_DIRNAME = 'system-state'
const DB_DUMP_FILE = 'livos-db.dump' // pg_dump custom format (compressed, pg_restore-able)
const LIV_ASSISTANT_DATA_DIR = '/opt/liv-assistant/data'
const LIV_ASSISTANT_TAR_FILE = 'liv-assistant-data.tar.gz'

export interface SystemStateLogger {
	log: (message: string) => void
	error: (message: string, error?: unknown) => void
}

/**
 * Positive selection of what a backup includes, chosen by the operator in
 * Settings › Backups. Files + bind-mount app data are ALWAYS in the snapshot
 * (they ARE the dataDirectory); these govern the extra out-of-tree captures.
 */
export interface BackupScope {
	/** livos Postgres DB — users, app instances, subdomain routing, AND Liv's memory. */
	systemDatabase: boolean
	/** /opt/liv-assistant/data — Liv AI chat history + skills. */
	livAssistantData: boolean
}

export const DEFAULT_BACKUP_SCOPE: BackupScope = {
	systemDatabase: true,
	livAssistantData: true,
}

function systemStateDir(dataDirectory: string): string {
	return path.join(dataDirectory, SYSTEM_STATE_DIRNAME)
}

/**
 * Pre-snapshot capture. Runs before `kopia snapshot create ${dataDirectory}`.
 * Writes the DB dump + AionUi data tar under `${dataDirectory}/system-state/`
 * (overwritten each backup — Kopia dedups, so no unbounded growth).
 */
export async function captureSystemState(
	dataDirectory: string,
	logger: SystemStateLogger,
	scope: BackupScope = DEFAULT_BACKUP_SCOPE,
): Promise<void> {
	const outDir = systemStateDir(dataDirectory)
	await fse.mkdirp(outDir).catch(() => {})

	// 1. Postgres — the biggest gap (Liv's memory + instance/routing records).
	const databaseUrl = process.env.DATABASE_URL
	if (!scope.systemDatabase) {
		// Operator opted out — remove any stale dump so the snapshot reflects the choice.
		await fse.remove(path.join(outDir, DB_DUMP_FILE)).catch(() => {})
		logger.log('[system-state] DB capture disabled by backup scope — skipping')
	} else if (databaseUrl) {
		const dumpTmp = path.join(outDir, `${DB_DUMP_FILE}.tmp`)
		const dumpFinal = path.join(outDir, DB_DUMP_FILE)
		try {
			// --format=custom → compressed + selective pg_restore; --no-owner/--no-acl →
			// portable across a fresh box where the role oid differs.
			await $`pg_dump --format=custom --no-owner --no-acl --file=${dumpTmp} ${databaseUrl}`
			await fse.move(dumpTmp, dumpFinal, {overwrite: true})
			logger.log('[system-state] captured livos Postgres DB (users + app instances + subdomain routing + Liv memory)')
		} catch (error) {
			await fse.remove(dumpTmp).catch(() => {})
			logger.error('[system-state] pg_dump failed — the DB (incl. Liv memory) will NOT be in this snapshot (non-fatal)', error)
		}
	} else {
		logger.error('[system-state] DATABASE_URL unset — skipping DB capture')
	}

	// 2. AionUi (Liv AI chat) data — history + skills, kept outside dataDirectory.
	if (!scope.livAssistantData) {
		await fse.remove(path.join(outDir, LIV_ASSISTANT_TAR_FILE)).catch(() => {})
		logger.log('[system-state] Liv AI data capture disabled by backup scope — skipping')
	} else if (await fse.pathExists(LIV_ASSISTANT_DATA_DIR).catch(() => false)) {
		const tarTmp = path.join(outDir, `${LIV_ASSISTANT_TAR_FILE}.tmp`)
		const tarFinal = path.join(outDir, LIV_ASSISTANT_TAR_FILE)
		try {
			await $`tar -czf ${tarTmp} -C ${path.dirname(LIV_ASSISTANT_DATA_DIR)} ${path.basename(LIV_ASSISTANT_DATA_DIR)}`
			await fse.move(tarTmp, tarFinal, {overwrite: true})
			logger.log('[system-state] captured /opt/liv-assistant/data (Liv AI chat history + skills)')
		} catch (error) {
			await fse.remove(tarTmp).catch(() => {})
			logger.error('[system-state] tar of /opt/liv-assistant/data failed (non-fatal)', error)
		}
	}
}

/**
 * First-boot-after-restore hook. Runs after the restore flag is set and BEFORE
 * apps/routing init, so the DB records exist before the apps reconcile + Caddy
 * regen. Restores whatever the snapshot carried; a missing file is a no-op
 * (older snapshot without system-state, or a capture that had failed).
 */
export async function restoreSystemState(dataDirectory: string, logger: SystemStateLogger): Promise<void> {
	const inDir = systemStateDir(dataDirectory)

	// 1. Postgres restore — pg_restore --clean --if-exists so a fresh-box DB
	//    (schema already created by migrations) is replaced by the snapshot's
	//    contents without erroring on absent objects.
	const dumpFinal = path.join(inDir, DB_DUMP_FILE)
	const databaseUrl = process.env.DATABASE_URL
	if (databaseUrl && (await fse.pathExists(dumpFinal).catch(() => false))) {
		try {
			await $`pg_restore --clean --if-exists --no-owner --no-acl --dbname=${databaseUrl} ${dumpFinal}`
			logger.log('[system-state] restored livos Postgres DB from snapshot (Liv memory + app instances + routing recovered)')
		} catch (error) {
			// pg_restore returns non-zero on benign warnings (e.g. DROP of an
			// absent object). Log but do not rethrow — a partial restore of the
			// DB is still better than none, and apps init proceeds regardless.
			logger.error('[system-state] pg_restore reported errors (may be benign DROP-IF-EXISTS warnings) — review if data looks incomplete', error)
		}
	} else if (!databaseUrl) {
		logger.error('[system-state] DATABASE_URL unset — skipping DB restore')
	}

	// 2. AionUi data restore.
	const tarFinal = path.join(inDir, LIV_ASSISTANT_TAR_FILE)
	if (await fse.pathExists(tarFinal).catch(() => false)) {
		try {
			await fse.mkdirp(path.dirname(LIV_ASSISTANT_DATA_DIR)).catch(() => {})
			await $`tar -xzf ${tarFinal} -C ${path.dirname(LIV_ASSISTANT_DATA_DIR)}`
			logger.log('[system-state] restored /opt/liv-assistant/data from snapshot (Liv AI chat history + skills)')
		} catch (error) {
			logger.error('[system-state] restore of /opt/liv-assistant/data failed (non-fatal)', error)
		}
	}
}
