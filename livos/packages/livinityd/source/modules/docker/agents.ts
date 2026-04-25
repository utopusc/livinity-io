// Phase 22 MH-04, MH-05 — docker_agents PG CRUD.
//
// One row per agent token. createAgent() returns the cleartext token ONCE;
// only SHA-256(token) is persisted, so a leaked DB never reveals tokens.
// Verification path:  hashToken(presentedToken) -> findAgentByTokenHash() ->
// row WHERE revoked_at IS NULL.
//
// Token format: 32 random bytes hex-encoded (64 chars, ~256 bits of entropy).
// Hash format:  SHA-256 hex (64 chars). Stored in token_hash (UNIQUE).

import {createHash, randomBytes} from 'node:crypto'

import {getPool} from '../database/index.js'

export interface DockerAgentRow {
	id: string
	envId: string
	tokenHash: string
	createdBy: string | null
	createdAt: Date
	lastSeen: Date | null
	revokedAt: Date | null
}

const SELECT_COLS = `id, env_id, token_hash, created_by, created_at, last_seen, revoked_at`

function rowToAgent(row: any): DockerAgentRow {
	return {
		id: row.id,
		envId: row.env_id,
		tokenHash: row.token_hash,
		createdBy: row.created_by,
		createdAt: row.created_at,
		lastSeen: row.last_seen,
		revokedAt: row.revoked_at,
	}
}

/**
 * Hash a cleartext token for storage / lookup. Exposed because the WS
 * authentication path on registration also hashes the presented token before
 * the lookup (saves a separate `findAgentByToken` round-trip if a caller
 * already has the hash — e.g. tests that pin a known token).
 */
export function hashToken(token: string): string {
	return createHash('sha256').update(token, 'utf-8').digest('hex')
}

/**
 * Generate a fresh 64-char hex token, store its SHA-256 hash, return BOTH the
 * row and the cleartext token. The cleartext is shown to the user ONCE — never
 * retrievable later. Backfills `environments.agent_id` so the env row links to
 * this agent for buildClient() resolution in docker-clients.ts.
 */
export async function createAgent(opts: {
	envId: string
	createdBy: string | null
}): Promise<{agent: DockerAgentRow; token: string}> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	const token = randomBytes(32).toString('hex') // 64-char hex
	const tokenHash = hashToken(token)

	const {rows} = await pool.query(
		`INSERT INTO docker_agents (env_id, token_hash, created_by)
		 VALUES ($1, $2, $3)
		 RETURNING ${SELECT_COLS}`,
		[opts.envId, tokenHash, opts.createdBy],
	)
	const agent = rowToAgent(rows[0])

	// Backfill environments.agent_id so the factory can match this env -> agent
	await pool.query(`UPDATE environments SET agent_id = $1 WHERE id = $2`, [agent.id, opts.envId])

	return {agent, token}
}

/**
 * List agents (optionally filtered by env). Most-recent-first.
 */
export async function listAgents(envId?: string): Promise<DockerAgentRow[]> {
	const pool = getPool()
	if (!pool) return []
	if (envId) {
		const {rows} = await pool.query(
			`SELECT ${SELECT_COLS} FROM docker_agents WHERE env_id = $1 ORDER BY created_at DESC`,
			[envId],
		)
		return rows.map(rowToAgent)
	}
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM docker_agents ORDER BY created_at DESC`,
	)
	return rows.map(rowToAgent)
}

/**
 * Look up an agent row by its token hash, IFF not revoked.
 * Returns null if no matching row OR row is revoked.
 */
export async function findAgentByTokenHash(tokenHash: string): Promise<DockerAgentRow | null> {
	const pool = getPool()
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM docker_agents WHERE token_hash = $1 AND revoked_at IS NULL`,
		[tokenHash],
	)
	if (rows.length === 0) return null
	return rowToAgent(rows[0])
}

/**
 * Convenience: hash the cleartext token then look up.
 */
export async function findAgentByToken(token: string): Promise<DockerAgentRow | null> {
	return findAgentByTokenHash(hashToken(token))
}

/**
 * Revoke an agent token. Idempotent — only sets revoked_at if not already set
 * (so the recorded revocation timestamp is the FIRST revoke call, not the
 * latest). Subsequent findAgentByToken() calls will return null.
 */
export async function revokeAgent(id: string): Promise<void> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')
	await pool.query(
		`UPDATE docker_agents SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`,
		[id],
	)
}

/**
 * Bump last_seen — called on each successful WS handshake AND on each pong.
 */
export async function touchLastSeen(id: string): Promise<void> {
	const pool = getPool()
	if (!pool) return
	await pool.query(`UPDATE docker_agents SET last_seen = NOW() WHERE id = $1`, [id])
}
