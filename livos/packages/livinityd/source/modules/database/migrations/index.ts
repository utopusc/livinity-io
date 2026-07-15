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

// Phase 322-01 (IDENT-01) — groups + group_members (the single groups source
// consumed by OIDC claims 322-04, file ACLs 324/FILES-02, app sharing
// 323/IDENT-04). Additive-only per the expand-only invariant above.
export const V47_P322_GROUPS_MIGRATIONS: ReadonlyArray<string> = [
	'2026-07-14-p322-groups.sql',
] as const

// Phase 329-01 (APPS-04) — job_runs run-history table for custom-command jobs.
// Additive-only per the expand-only invariant above. Registered here (drift #7)
// — do NOT repeat the p325 quota file's omission from ALL_MIGRATIONS.
export const V47_P329_JOB_RUNS_MIGRATIONS: ReadonlyArray<string> = [
	'2026-07-15-p329-job-runs.sql',
] as const

// Phase 325 (STOR-02) — user quota_bytes column. INCIDENTAL CROSS-PHASE FIX
// (324-01): the migration file has shipped on disk since Phase 325 but was
// NEVER registered here — the exact drift-#7 omission the p329 comment above
// warns about. Left unregistered, the STOR-02 quota surface has no reviewable /
// hand-runnable artifact in ALL_MIGRATIONS even though schema.sql already
// applies the column at boot. Registered here so the migration-registration
// guard (share-tokens.test.ts) stays green and the artifact is discoverable.
export const V47_P325_USER_QUOTA_MIGRATIONS: ReadonlyArray<string> = [
	'2026-07-15-p325-user-quota.sql',
] as const

// Phase 324-01 (FILES-01) — file_shares public-share table. Registered here
// (drift #7 / 325 omission lesson) — additive-only per the expand invariant.
export const V47_P324_FILE_SHARES_MIGRATIONS: ReadonlyArray<string> = [
	'2026-07-15-p324-file-shares.sql',
] as const

export const ALL_MIGRATIONS: ReadonlyArray<string> = [
	...V32_AGENTS_MIGRATIONS,
	...V36_P131_PINNED_WINDOWS_MIGRATIONS,
	...V47_P322_GROUPS_MIGRATIONS,
	...V47_P329_JOB_RUNS_MIGRATIONS,
	...V47_P325_USER_QUOTA_MIGRATIONS, // incidental cross-phase fix (324-01)
	...V47_P324_FILE_SHARES_MIGRATIONS,
] as const
