/**
 * Phase 243-01 Task 1 — shared types for the pty-sessions module.
 *
 * D-243-PER-USER-READY: `user_id` field present from day one in
 * `PtySessionMetadata` so v44+ multi-user does not require a schema migration.
 *
 * D-243-NO-ROOT (L-243-B): `PtySpawnOptions.username` is the literal string
 * `'bruce'` — typed at compile-time as defense-in-depth backing the runtime
 * guard in `PtySession.start()`.
 */

/** Session metadata persisted at Redis key `livos:pty:session:{id}`. */
export interface PtySessionMetadata {
	/** v43 MVP: always the bruce user uid. v44+ multi-user populates per-user. */
	user_id: string
	/** Human-readable session label (e.g. "shell", "logs"). */
	name: string
	/** ISO-8601 UTC string. */
	createdAt: string
	/** ISO-8601 UTC string — updated on every attach. */
	lastAttachAt: string
	/** Working directory the PTY was spawned in. */
	cwd: string
}

/** Spawn options for a new PTY session. */
export interface PtySpawnOptions {
	/** D-243-NO-ROOT: literal `'bruce'` only. Runtime guard enforces. */
	username: 'bruce'
	cols: number
	rows: number
	cwd?: string
}

/** EventEmitter event surface exposed by `PtySession.on(...)`. */
export interface SessionEventMap {
	data: (chunk: string) => void
	exit: (info: {exitCode: number; signal: string | null}) => void
}

/**
 * Narrow Redis surface consumed by `metadata.ts`.
 *
 * Mirrors the `ConfigRedisClient` idiom from `config-router.ts` — only the
 * hset/hgetall/del calls used by writeSessionMetadata / readSessionMetadata /
 * deleteSessionMetadata. ioredis instances satisfy this shape structurally.
 */
export interface PtyMetadataRedisClient {
	hset(key: string, fields: Record<string, string>): Promise<number>
	hgetall(key: string): Promise<Record<string, string>>
	del(key: string): Promise<number>
	/** Reserved for v44+ TTL GC; not used in v43 MVP. */
	expire?(key: string, seconds: number): Promise<number>
}
