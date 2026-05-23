/**
 * Phase 202-01 — Idempotent LivOS DB migration runner.
 *
 * Reads `migrations/0002_livos_agents.sql` (the only LivOS-owned migration so
 * far) and applies it to the livos DB via pg client. All statements are
 * CREATE/DROP-IF-NOT-EXISTS so re-runs are no-ops.
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

import {redactPgUrl} from '../modules/mastra/memory.js'

export interface LivOSMigrationResult {
	tablesCreated: number
	alreadyExisted: number
}

export interface LivOSMigrationOpts {
	databaseUrl: string
	dryRun?: boolean
}

const LIVOS_TABLES = ['livos_agents'] as const

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

		const sqlPath = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			'migrations',
			'0002_livos_agents.sql',
		)
		const sql = await readFile(sqlPath, 'utf-8')
		await client.query(sql)

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
			`Phase 202-01 runLivOSMigrations failed for ${redacted}: ${innerRedacted}`,
		)
	} finally {
		try {
			await client.end()
		} catch {
			/* swallow — best-effort teardown */
		}
	}
}
