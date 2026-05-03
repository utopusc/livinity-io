/**
 * Phase 59 Plan 59-01 — schema-migration.test.ts (RED phase).
 *
 * String-level assertions that schema.sql contains the api_keys block with
 * `IF NOT EXISTS` guards on every CREATE TABLE / CREATE INDEX, the locked
 * column shape from CONTEXT.md, and — critically — NO `CREATE EXTENSION`
 * line (RESEARCH.md Pitfall 6: pgcrypto is already available either via
 * Mini PC pre-installation or PG 13+ core).
 *
 * Test 9 (CREATE EXTENSION absence guard) closes RESEARCH.md Open Question 1
 * and locks in the codebase convention so a future schema edit that "helpfully"
 * adds `CREATE EXTENSION pgcrypto` is caught at CI before reaching Mini PC.
 *
 * Mirrors the usage-tracking/schema-migration.test.ts pattern (Phase 44 D-44-20).
 *
 * RED expectation: tests assert against a `CREATE TABLE IF NOT EXISTS api_keys`
 * block that does not yet exist in schema.sql; Wave 1 appends it.
 */

import {readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, test} from 'vitest'

const schemaPath = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'database',
	'schema.sql',
)
const sql = readFileSync(schemaPath, 'utf8')

describe('Phase 59 schema migration — api_keys (RED)', () => {
	test('T1 — schema.sql contains api_keys CREATE TABLE IF NOT EXISTS + idx_api_keys_user_id + partial idx_api_keys_active', () => {
		expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS api_keys/)
		expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_api_keys_user_id/)
		expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_api_keys_active/)
		// Partial index — covers only active keys (revoked_at IS NULL)
		expect(sql).toMatch(
			/CREATE INDEX IF NOT EXISTS idx_api_keys_active[\s\S]*?WHERE revoked_at IS NULL/,
		)
	})

	test('T2 — every CREATE in the api_keys block uses IF NOT EXISTS', () => {
		// Locate the api_keys section. The Wave 1 plan instructs the migration
		// to be appended with a clear comment header; we look for the table DDL
		// and walk forward to the next section header (or EOF).
		const tableIdx = sql.indexOf('CREATE TABLE IF NOT EXISTS api_keys')
		expect(tableIdx).toBeGreaterThan(-1) // section exists at all
		const apiKeysBlock = sql.slice(tableIdx)
		const creates = apiKeysBlock.match(/CREATE (TABLE|INDEX)[^\n]*/g) ?? []
		expect(creates.length).toBeGreaterThanOrEqual(3) // 1 table + 2 indexes minimum
		for (const c of creates.slice(0, 3)) {
			// Only assert on the api_keys-specific creates (first three after the
			// section header). If schema.sql later appends MORE sections, this test
			// must not bleed into them.
			expect(c).toMatch(/IF NOT EXISTS/)
		}
	})

	test('T3 — api_keys column shape matches CONTEXT.md FR-BROKER-B1-01 contract', () => {
		const match = sql.match(/CREATE TABLE IF NOT EXISTS api_keys[\s\S]*?\);/)
		expect(match).toBeTruthy()
		const block = match![0]
		// Column-existence assertions (without locking exact whitespace).
		expect(block).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/)
		expect(block).toMatch(
			/user_id\s+UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/,
		)
		expect(block).toMatch(/key_hash\s+CHAR\(64\) NOT NULL UNIQUE/)
		expect(block).toMatch(/key_prefix\s+VARCHAR\(16\) NOT NULL/)
		expect(block).toMatch(/name\s+VARCHAR\(64\) NOT NULL/)
		expect(block).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/)
		expect(block).toMatch(/last_used_at\s+TIMESTAMPTZ/)
		expect(block).toMatch(/revoked_at\s+TIMESTAMPTZ/)
	})

	test('T4 — schema.sql contains ZERO CREATE EXTENSION lines (RESEARCH.md Pitfall 6 — convention guard)', () => {
		// Drop-the-pgcrypto-line verdict from RESEARCH.md Open Question 1.
		// Existing schema uses gen_random_uuid() 14× without ANY CREATE EXTENSION
		// line — meaning Mini PC PG either has pgcrypto pre-enabled or runs
		// PG 13+ where the function is core. Wave 1 MUST follow this convention.
		// A future drift that adds `CREATE EXTENSION` is blocked here at CI.
		expect(sql.match(/CREATE EXTENSION/g)).toBeNull()
	})
})
