// Phase 85 Wave 1 — migrations registry.
//
// livinityd does NOT yet have a real migration runner; the canonical schema
// lives in ../schema.sql and is applied at boot via initDatabase() with
// CREATE TABLE IF NOT EXISTS. The .sql files in this directory are
// documentation artifacts: each one is a discrete, reviewable, hand-runnable
// migration that mirrors what schema.sql adds.
//
// This registry exports the ordered list of migration filenames so a future
// migration runner (out of scope for v32) can discover them. For now it lets
// CI lint the directory (no orphan .sql files) and gives a single import
// surface for tooling.
//
// Order matters: schema migration runs before its seed migration.

export const V32_AGENTS_MIGRATIONS: ReadonlyArray<string> = [
	'2026-05-05-v32-agents.sql',
	'2026-05-05-v32-agents-seed.sql',
] as const

export const ALL_MIGRATIONS: ReadonlyArray<string> = [
	...V32_AGENTS_MIGRATIONS,
] as const
