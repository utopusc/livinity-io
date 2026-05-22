/**
 * Phase 197-03 — Idempotent Mastra-table migration runner.
 *
 * Reads `migrations/001-mastra-tables.sql` and applies it to the livos DB via
 * pg client. All statements are CREATE-IF-NOT-EXISTS so re-runs are no-ops.
 *
 * Threat mitigations:
 *   T-197-03-02 (I): pg connection-string passwords NEVER appear in thrown
 *                    errors — redactPgUrl scrubs before re-throw.
 *   T-197-03-03 (T): SQL file is a static literal under source control; zero
 *                    runtime string interpolation. pg client uses parameterized
 *                    queries for the pre/post existence checks.
 */

import {readFile} from 'node:fs/promises'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'

import {Client} from 'pg'

import {redactPgUrl} from './memory.js'

export interface MigrationResult {
	tablesCreated: number
	alreadyExisted: number
}

export interface MigrationOpts {
	databaseUrl: string
	dryRun?: boolean
}

const MASTRA_TABLES = [
	'mastra_threads',
	'mastra_messages',
	'mastra_working_memory',
	'mastra_workflow_runs',
] as const

/**
 * Idempotent migration runner. Returns counts of newly-created vs already-existed
 * tables. On error, throws an Error whose message has any postgres URL scrubbed
 * via redactPgUrl().
 */
export async function runMastraMigrations(opts: MigrationOpts): Promise<MigrationResult> {
	const client = new Client({connectionString: opts.databaseUrl})
	try {
		await client.connect()

		const before = await client.query(
			`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
			[Array.from(MASTRA_TABLES)],
		)
		const alreadyExisted = before.rows.length

		if (opts.dryRun) {
			return {tablesCreated: 0, alreadyExisted}
		}

		const sqlPath = path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			'migrations',
			'001-mastra-tables.sql',
		)
		const sql = await readFile(sqlPath, 'utf-8')
		await client.query(sql)

		const after = await client.query(
			`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
			[Array.from(MASTRA_TABLES)],
		)
		const tablesCreated = after.rows.length - alreadyExisted
		return {tablesCreated, alreadyExisted}
	} catch (err) {
		const redacted = redactPgUrl(opts.databaseUrl)
		const inner = err instanceof Error ? err.message : String(err)
		const innerRedacted = redactPgUrl(inner)
		throw new Error(
			`Phase 197-03 runMastraMigrations failed for ${redacted}: ${innerRedacted}`,
		)
	} finally {
		try {
			await client.end()
		} catch {
			/* swallow — best-effort teardown */
		}
	}
}
