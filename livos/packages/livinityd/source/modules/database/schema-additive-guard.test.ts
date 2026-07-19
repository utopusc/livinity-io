// Phase 348 (ABUPD-02, clause 2) — enforce the ADDITIVE-ONLY SCHEMA INVARIANT.
//
// The operator-locked prose in migrations/index.ts (Phase 311 / UPDSAFE-04)
// mandates that schema.sql — applied idempotently at every livinityd boot —
// NEVER contains a destructive statement: all three rollback layers restore
// code+deps+systemd (and, since 348, optionally a pre-update DB dump), so a
// code-only rollback silently relies on old code staying compatible with a
// forward-migrated schema. Until this test, that invariant was UNENFORCED.
//
// This guard statically scans schema.sql (comments and string literals
// stripped so prose like "truncated to LAST 16 KB" can never false-positive)
// and fails on any destructive DDL/DML. If a destructive change is ever truly
// required, it must ship through a dedicated, operator-ratified migration
// design — NOT by weakening this test in the same change.
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, test} from 'vitest'

const SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql')

/** Strip -- line comments, C-style block comments, and single-quoted SQL string
 * literals ('' escapes included) so only executable statement text remains. */
export function stripSqlNoise(sql: string): string {
	return sql
		.replace(/'(?:[^']|'')*'/g, "''") // string literals (keeps statement shape)
		.replace(/--[^\n]*/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
}

const DESTRUCTIVE_PATTERNS: Array<{name: string; re: RegExp}> = [
	{name: 'DROP TABLE', re: /\bDROP\s+TABLE\b/i},
	{name: 'DROP COLUMN', re: /\bDROP\s+COLUMN\b/i},
	{name: 'DROP SCHEMA', re: /\bDROP\s+SCHEMA\b/i},
	{name: 'DROP DATABASE', re: /\bDROP\s+DATABASE\b/i},
	{name: 'ALTER TABLE … DROP', re: /\bALTER\s+TABLE\b[^;]*\bDROP\b/i},
	{name: 'TRUNCATE', re: /\bTRUNCATE\b/i},
	{name: 'DELETE FROM', re: /\bDELETE\s+FROM\b/i},
]

describe('schema.sql additive-only invariant (348 enforcement of 311 UPDSAFE-04)', () => {
	const raw = readFileSync(SCHEMA_PATH, 'utf8')
	const executable = stripSqlNoise(raw)

	test('schema.sql exists and is non-trivial', () => {
		expect(raw.length).toBeGreaterThan(1000)
	})

	for (const {name, re} of DESTRUCTIVE_PATTERNS) {
		test(`contains no ${name} statement`, () => {
			const match = executable.match(re)
			expect(
				match,
				match
					? `Destructive statement "${match[0]}" found in schema.sql — the additive-only invariant ` +
							`(migrations/index.ts, Phase 311 UPDSAFE-04) forbids it: every rollback layer assumes old ` +
							`code runs against a forward-migrated schema. Ship destructive changes via an ` +
							`operator-ratified migration design instead.`
					: undefined,
			).toBeNull()
		})
	}

	test('stripSqlNoise removes comments and literals but keeps DDL (self-check)', () => {
		const sample = "-- DROP TABLE in a comment\nCREATE TABLE x (note TEXT DEFAULT 'DELETE FROM y');\n/* TRUNCATE too */"
		const cleaned = stripSqlNoise(sample)
		expect(cleaned).not.toMatch(/DROP\s+TABLE/i)
		expect(cleaned).not.toMatch(/DELETE\s+FROM/i)
		expect(cleaned).not.toMatch(/TRUNCATE/i)
		expect(cleaned).toMatch(/CREATE\s+TABLE\s+x/)
	})
})
