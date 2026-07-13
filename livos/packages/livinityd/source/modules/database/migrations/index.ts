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
//
// Phase 311 (UPDSAFE-04) — ADDITIVE-ONLY SCHEMA INVARIANT (operator-locked).
// The update-safety rollback mechanism (update.sh Layer-A/B + the standalone
// livos-manual-rollback.sh) restores CODE + node_modules + systemd units, but
// performs NO literal DB rollback: there is still no down-migration runner, and
// Postgres holds live multi-user data that cannot be blindly time-traveled.
// Therefore every schema.sql change in this milestone MUST be additive /
// expand-only — CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS-shaped —
// and MUST NOT include a same-release destructive ALTER/DROP that a code-only
// rollback could not un-migrate (the expand/contract pattern). A rollback
// leaves the forward-migrated schema in place; additive-only changes keep that
// schema backward-compatible with the rolled-back (older) code.

export const V32_AGENTS_MIGRATIONS: ReadonlyArray<string> = [
	'2026-05-05-v32-agents.sql',
	'2026-05-05-v32-agents-seed.sql',
] as const

// Phase 131-02 — pinned_windows table (D-131-A: Postgres).
export const V36_P131_PINNED_WINDOWS_MIGRATIONS: ReadonlyArray<string> = [
	'2026-05-15-p131-pinned-windows.sql',
] as const

export const ALL_MIGRATIONS: ReadonlyArray<string> = [
	...V32_AGENTS_MIGRATIONS,
	...V36_P131_PINNED_WINDOWS_MIGRATIONS,
] as const
