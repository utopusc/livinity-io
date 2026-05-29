/**
 * Phase 243-01 Task 1 — shared types for the pty-sessions module.
 *
 * D-243-PER-USER-READY: `user_id` field present from day one in
 * `PtySessionMetadata` so v44+ multi-user does not require a schema migration.
 *
 * D-243-NO-ROOT (L-243-B): `PtySpawnOptions.username` is any non-root desktop
 * user (Phase 252-02 widened the literal `'bruce'` to `string`); the runtime
 * guard in `PtySession.start()` rejects ONLY root/uid-0 as defense-in-depth
 * backing the WS-layer `livos:desktop:user` lookup.
 */

import {PtySession} from './session.js'

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
	/**
	 * Any non-root desktop user (Phase 252-02 widened from literal `'bruce'`);
	 * the runtime guard rejects root/uid-0. Resolved at the WS layer from
	 * `livos:desktop:user` with a `'bruce'` fallback.
	 */
	username: string
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

/**
 * Phase 246-01 — multi-session record.
 * `pty` is the live PtySession instance (composed, not extended).
 * Stripped to SessionSummary before serializing to clients or admin UI.
 */
export interface Session {
	id: string
	name: string
	pty: PtySession
	createdAt: string
	lastAttachAt: string
}

/** Serializable shape — `pty` removed. Returned by SessionManager.list() and the admin tRPC query (246-05). */
export interface SessionSummary {
	id: string
	name: string
	createdAt: string
	lastAttachAt: string
}

export interface SessionManagerDeps {
	ptySessionFactory?: (opts: PtySpawnOptions) => PtySession
	nowFn?: () => string
}
