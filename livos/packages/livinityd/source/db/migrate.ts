/**
 * Phase 202-01 / 203-04 — Idempotent LivOS DB migration runner.
 *
 * Reads `migrations/0002_livos_agents.sql` (Phase 202-01) +
 * `migrations/0003_livos_openui_apps.sql` (Phase 203-04) and applies them in
 * order to the livos DB via a pg client. All statements are CREATE/DROP-IF-
 * NOT-EXISTS so re-runs are no-ops (INV-203-07 — converges idempotently).
 *
 * Sibling of `modules/mastra/migrate.ts` — Mastra owns its tables, LivOS owns
 * the agent registry. Runs AFTER `runMastraMigrations` in the boot sequence
 * (D-202-01 reuses the same `livos` PG database).
 *
 * Threat mitigations:
 *   T-202-02-MIG — pg connection-string passwords NEVER appear in thrown
 *                  errors; redactPgUrl scrubs before re-throw.
 *   T-202-04-MIG — SQL file is a static literal under source control; zero
 *                  runtime string interpolation. pg client uses parameterized
 *                  queries for the pre/post existence checks.
 */

import {readFile} from 'node:fs/promises'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'

import {Client} from 'pg'

// Phase 203-08 — inlined from the deleted `modules/mastra/memory.ts`.
// redactPgUrl strips user:password from a postgres:// URL for safe logging:
//   postgres://user:pass@host:5432/db → postgres://***:***@host:5432/db
function redactPgUrl(url: string): string {
	let out = url.replace(/(postgres(ql)?:\/\/)([^:@/]+):([^@/]+)(@)/, '$1***:***$5')
	out = out.replace(/(postgres(ql)?:\/\/)([^:@/]+)(@)/, '$1***$4')
	return out
}

export interface LivOSMigrationResult {
	tablesCreated: number
	alreadyExisted: number
}

export interface LivOSMigrationOpts {
	databaseUrl: string
	dryRun?: boolean
}

const LIVOS_TABLES = [
	'livos_agents',
	// Phase 203-04
	'livos_openui_apps',
	'livos_openui_app_versions',
] as const

const LIVOS_MIGRATION_FILES = [
	'0002_livos_agents.sql',
	// Phase 203-04 — add openui apps + version-history sibling.
	'0003_livos_openui_apps.sql',
] as const

/**
 * Idempotent migration runner for LivOS-owned tables. Returns counts of
 * newly-created vs already-existed tables. On error, throws an Error whose
 * message has any postgres URL scrubbed via redactPgUrl().
 */
export async function runLivOSMigrations(
	opts: LivOSMigrationOpts,
): Promise<LivOSMigrationResult> {
	const client = new Client({connectionString: opts.databaseUrl})
	try {
		await client.connect()

		const before = await client.query(
			`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
			[Array.from(LIVOS_TABLES)],
		)
		const alreadyExisted = before.rows.length

		if (opts.dryRun) {
			return {tablesCreated: 0, alreadyExisted}
		}

		const migrationsDir = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			'migrations',
		)
		for (const file of LIVOS_MIGRATION_FILES) {
			const sqlPath = path.join(migrationsDir, file)
			const sql = await readFile(sqlPath, 'utf-8')
			await client.query(sql)
		}

		const after = await client.query(
			`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
			[Array.from(LIVOS_TABLES)],
		)
		const tablesCreated = after.rows.length - alreadyExisted
		return {tablesCreated, alreadyExisted}
	} catch (err) {
		const redacted = redactPgUrl(opts.databaseUrl)
		const inner = err instanceof Error ? err.message : String(err)
		const innerRedacted = redactPgUrl(inner)
		throw new Error(
			`Phase 202-01 / 203-04 runLivOSMigrations failed for ${redacted}: ${innerRedacted}`,
		)
	} finally {
		try {
			await client.end()
		} catch {
			/* swallow — best-effort teardown */
		}
	}
}
