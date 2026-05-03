/**
 * Phase 44 Plan 44-05 — schema migration idempotency regression (D-44-20).
 *
 * String-level assertions that schema.sql contains the broker_usage block
 * with `IF NOT EXISTS` guards on every CREATE TABLE / CREATE INDEX. The
 * pattern matches the existing v7.0 multi-user idempotency convention so a
 * future schema edit that accidentally drops the guards is caught here.
 *
 * If a real PG test pool helper becomes available later (currently none in
 * livinityd), this test should be upgraded to actually run the SQL twice
 * against a fresh test database and assert no duplicate-table errors.
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

describe('Phase 44 schema migration — broker_usage idempotency (D-44-20)', () => {
	test('T1 — schema.sql contains broker_usage CREATE TABLE IF NOT EXISTS', () => {
		expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS broker_usage/)
		expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_broker_usage_user_created/)
		expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_broker_usage_app/)
	})

	test('T2 — broker_usage references users(id) ON DELETE CASCADE', () => {
		const match = sql.match(/CREATE TABLE IF NOT EXISTS broker_usage[\s\S]*?\);/)
		expect(match).toBeTruthy()
		expect(match![0]).toMatch(/REFERENCES users\(id\) ON DELETE CASCADE/)
	})

	test('T3 — every CREATE in the broker_usage block uses IF NOT EXISTS', () => {
		const brokerBlock = sql.slice(sql.indexOf('-- Broker Usage'))
		expect(brokerBlock.length).toBeGreaterThan(0) // section exists at all
		const creates = brokerBlock.match(/CREATE (TABLE|INDEX)[^\n]*/g) ?? []
		expect(creates.length).toBeGreaterThanOrEqual(3) // 1 table + 2 indexes minimum
		for (const c of creates) {
			expect(c).toMatch(/IF NOT EXISTS/)
		}
	})

	test('T4 — broker_usage column shape matches D-44-01 contract', () => {
		const match = sql.match(/CREATE TABLE IF NOT EXISTS broker_usage[\s\S]*?\);/)
		expect(match).toBeTruthy()
		const block = match![0]
		// Column-existence assertions (without locking exact whitespace)
		expect(block).toMatch(/id\s+UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/)
		expect(block).toMatch(/user_id\s+UUID NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/)
		expect(block).toMatch(/app_id\s+TEXT/)
		expect(block).toMatch(/model\s+TEXT NOT NULL/)
		expect(block).toMatch(/prompt_tokens\s+INTEGER NOT NULL DEFAULT 0/)
		expect(block).toMatch(/completion_tokens\s+INTEGER NOT NULL DEFAULT 0/)
		expect(block).toMatch(/request_id\s+TEXT/)
		expect(block).toMatch(/endpoint\s+TEXT NOT NULL/)
		expect(block).toMatch(/created_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/)
	})

	// =====================================================================
	// Phase 62 Plan 62-01 — FR-BROKER-E1-01: api_key_id column on broker_usage
	// =====================================================================
	test('FR-BROKER-E1-01: broker_usage has api_key_id column with FK to api_keys', () => {
		// 1. Header marker is present so future readers can find the migration block
		expect(sql).toMatch(/Phase 62 FR-BROKER-E1-01/)

		// 2. Idempotent ADD COLUMN block — wrapped in DO $$ ... END$$ per Phase 25 precedent.
		// Capture the full block from the marker through the partial index WHERE clause
		// (the index spans 3 lines: CREATE INDEX … ON … WHERE …).
		const phase62BlockMatch = sql.match(
			/Phase 62 FR-BROKER-E1-01[\s\S]*?WHERE api_key_id IS NOT NULL\s*;/,
		)
		expect(phase62BlockMatch).toBeTruthy()
		const block = phase62BlockMatch![0]

		// 3. ADD COLUMN IF NOT EXISTS api_key_id UUID
		expect(block).toMatch(/ADD COLUMN IF NOT EXISTS api_key_id UUID/)

		// 4. FK to api_keys(id) ON DELETE SET NULL — preserves history if key hard-deleted
		expect(block).toMatch(/REFERENCES api_keys\(id\) ON DELETE SET NULL/)

		// 5. Idempotent guard (DO-block + IF NOT EXISTS) — re-running schema.sql at boot is safe
		expect(block).toMatch(/DO \$\$/)
		expect(block).toMatch(/END\$\$/)

		// 6. Partial index on non-NULL rows only (matches Pattern 1 from RESEARCH.md)
		expect(block).toMatch(
			/CREATE INDEX IF NOT EXISTS idx_broker_usage_api_key_id\s+ON broker_usage\(api_key_id\)\s+WHERE api_key_id IS NOT NULL/,
		)
	})
})
