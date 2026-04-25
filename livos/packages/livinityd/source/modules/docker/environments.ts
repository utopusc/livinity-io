// Phase 22 MH-01 — Environments PG CRUD
//
// Stores one row per Docker host that this Livinity instance can manage.
// Three transport types:
//   - 'socket'  : local Unix socket (default — auto-seeded as the 'local' row)
//   - 'tcp-tls' : remote dockerd over TLS (host + port + CA + client cert + key)
//   - 'agent'   : outbound agent (Plan 22-03 — agent_id refs docker_agents)
//
// `seedLocalEnvironment()` is called from livinityd boot AFTER initDatabase
// so existing single-host installs keep working byte-for-byte (the route
// input `environmentId=null|'local'` resolves to this fixed-UUID row).

import {getPool} from '../database/index.js'

export const LOCAL_ENV_ID = '00000000-0000-0000-0000-000000000000'
export const LOCAL_ENV_NAME = 'local'

export type EnvironmentType = 'socket' | 'tcp-tls' | 'agent'

export interface Environment {
	id: string
	name: string
	type: EnvironmentType
	socketPath: string | null
	tcpHost: string | null
	tcpPort: number | null
	tlsCaPem: string | null
	tlsCertPem: string | null
	tlsKeyPem: string | null
	agentId: string | null
	agentStatus: 'online' | 'offline'
	lastSeen: Date | null
	createdBy: string | null
	createdAt: Date
	/** Phase 25 DOC-06 — operator-assigned labels (e.g. 'prod', 'us-east'). Filter chips UI ships in Plan 25-02. Defaults to [] for existing rows via PG DEFAULT '{}'. */
	tags: string[]
}

const SELECT_COLS = `id, name, type, socket_path, tcp_host, tcp_port,
	tls_ca_pem, tls_cert_pem, tls_key_pem, agent_id, agent_status,
	last_seen, created_by, created_at, tags`

function rowToEnvironment(row: any): Environment {
	return {
		id: row.id,
		name: row.name,
		type: row.type,
		socketPath: row.socket_path,
		tcpHost: row.tcp_host,
		tcpPort: row.tcp_port,
		tlsCaPem: row.tls_ca_pem,
		tlsCertPem: row.tls_cert_pem,
		tlsKeyPem: row.tls_key_pem,
		agentId: row.agent_id,
		agentStatus: row.agent_status,
		lastSeen: row.last_seen,
		createdBy: row.created_by,
		createdAt: row.created_at,
		// Defensive: PG DEFAULT '{}' guarantees an array post-bootstrap, but the
		// alias-resolution mirror in 22-01 D-04 hardens against any pg client
		// quirk where TEXT[] returns null for an empty literal.
		tags: row.tags ?? [],
	}
}

/**
 * Idempotent — INSERT … ON CONFLICT (name) DO NOTHING. Calling this twice
 * leaves exactly one row with id=LOCAL_ENV_ID, name='local', type='socket',
 * socket_path='/var/run/docker.sock'. Safe to call on every boot.
 */
export async function seedLocalEnvironment(): Promise<void> {
	const pool = getPool()
	if (!pool) return
	await pool.query(
		`INSERT INTO environments (id, name, type, socket_path)
		 VALUES ($1, $2, 'socket', '/var/run/docker.sock')
		 ON CONFLICT (name) DO NOTHING`,
		[LOCAL_ENV_ID, LOCAL_ENV_NAME],
	)
}

/**
 * List all environments. Local environment is always first (regardless of
 * created_at) so the UI selector can render it as the default option.
 */
export async function listEnvironments(): Promise<Environment[]> {
	const pool = getPool()
	if (!pool) return []
	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM environments
		 ORDER BY (name = '${LOCAL_ENV_NAME}') DESC, created_at ASC`,
	)
	return rows.map(rowToEnvironment)
}

/**
 * Look up an environment by id, with alias resolution:
 *   - null / undefined / 'local' → the LOCAL_ENV_ID row
 *   - a UUID                     → direct lookup
 * Returns null if not found (NEVER throws — caller decides how to handle it).
 */
export async function getEnvironment(
	idOrAlias: string | null | undefined,
): Promise<Environment | null> {
	const pool = getPool()
	if (!pool) return null

	// Alias resolution: null / undefined / 'local' → LOCAL_ENV_ID
	const id = !idOrAlias || idOrAlias === LOCAL_ENV_NAME ? LOCAL_ENV_ID : idOrAlias

	const {rows} = await pool.query(
		`SELECT ${SELECT_COLS} FROM environments WHERE id = $1`,
		[id],
	)
	if (rows.length === 0) return null
	return rowToEnvironment(rows[0])
}

export type CreateEnvironmentInput = {
	name: string
	type: EnvironmentType
	socketPath?: string
	tcpHost?: string
	tcpPort?: number
	tlsCaPem?: string
	tlsCertPem?: string
	tlsKeyPem?: string
	agentId?: string
	/** Phase 25 DOC-06 — optional tag list. Undefined defaults to [] (PG TEXT[] default '{}'). Length-bounded by Zod at the route layer (max 20 tags × 50 chars). */
	tags?: string[]
}

/**
 * Create a new environment row. Validates the per-type required fields:
 *   - 'socket'  → socketPath required
 *   - 'tcp-tls' → tcpHost + tcpPort + tlsCaPem + tlsCertPem + tlsKeyPem required
 *   - 'agent'   → agentId required (caller passes docker_agents.id from 22-03)
 *
 * Throws `[validation-error]` on missing required fields.
 */
export async function createEnvironment(
	input: CreateEnvironmentInput,
	createdBy: string | null,
): Promise<Environment> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	if (input.type === 'socket') {
		if (!input.socketPath) {
			throw new Error('[validation-error] socketPath is required for type=socket')
		}
	} else if (input.type === 'tcp-tls') {
		if (!input.tcpHost || !input.tcpPort || !input.tlsCaPem || !input.tlsCertPem || !input.tlsKeyPem) {
			throw new Error(
				'[validation-error] tcpHost, tcpPort, tlsCaPem, tlsCertPem, tlsKeyPem are all required for type=tcp-tls',
			)
		}
	} else if (input.type === 'agent') {
		if (!input.agentId) {
			throw new Error('[validation-error] agentId is required for type=agent')
		}
	}

	const {rows} = await pool.query(
		`INSERT INTO environments
			(name, type, socket_path, tcp_host, tcp_port,
			 tls_ca_pem, tls_cert_pem, tls_key_pem, agent_id, created_by, tags)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING ${SELECT_COLS}`,
		[
			input.name,
			input.type,
			input.socketPath ?? null,
			input.tcpHost ?? null,
			input.tcpPort ?? null,
			input.tlsCaPem ?? null,
			input.tlsCertPem ?? null,
			input.tlsKeyPem ?? null,
			input.agentId ?? null,
			createdBy,
			// Phase 25 DOC-06: undefined → [] (matches PG DEFAULT '{}')
			input.tags ?? [],
		],
	)
	return rowToEnvironment(rows[0])
}

export type UpdateEnvironmentInput = {
	name?: string
	socketPath?: string
	tcpHost?: string
	tcpPort?: number
	tlsCaPem?: string
	tlsCertPem?: string
	tlsKeyPem?: string
	/** Phase 25 DOC-06 — pass [] to clear; undefined leaves tags untouched. */
	tags?: string[]
}

/**
 * Partial update. Cannot mutate `type` (delete-and-recreate to change the
 * transport). Cannot mutate the local row's connection fields — throws
 * `[cannot-modify-local]` if the id is LOCAL_ENV_ID.
 *
 * Throws `[not-found]` if no row matches the id.
 */
export async function updateEnvironment(
	id: string,
	input: UpdateEnvironmentInput,
	_updatedBy: string | null,
): Promise<Environment> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	if (id === LOCAL_ENV_ID) {
		throw new Error("[cannot-modify-local] Cannot modify the built-in 'local' environment")
	}

	// Build SET clause incrementally — only update fields that were provided.
	const sets: string[] = []
	const values: any[] = []
	let i = 1

	if (input.name !== undefined) {
		sets.push(`name = $${i++}`)
		values.push(input.name)
	}
	if (input.socketPath !== undefined) {
		sets.push(`socket_path = $${i++}`)
		values.push(input.socketPath)
	}
	if (input.tcpHost !== undefined) {
		sets.push(`tcp_host = $${i++}`)
		values.push(input.tcpHost)
	}
	if (input.tcpPort !== undefined) {
		sets.push(`tcp_port = $${i++}`)
		values.push(input.tcpPort)
	}
	if (input.tlsCaPem !== undefined) {
		sets.push(`tls_ca_pem = $${i++}`)
		values.push(input.tlsCaPem)
	}
	if (input.tlsCertPem !== undefined) {
		sets.push(`tls_cert_pem = $${i++}`)
		values.push(input.tlsCertPem)
	}
	if (input.tlsKeyPem !== undefined) {
		sets.push(`tls_key_pem = $${i++}`)
		values.push(input.tlsKeyPem)
	}
	if (input.tags !== undefined) {
		// Phase 25 DOC-06 — passing [] clears tags; passing a non-empty array
		// replaces them. Tag length and per-tag char limits are enforced by the
		// Zod schema at the route layer (T-25-01 mitigation).
		sets.push(`tags = $${i++}`)
		values.push(input.tags)
	}

	if (sets.length === 0) {
		// No fields to update — just return the current row
		const current = await getEnvironment(id)
		if (!current) throw new Error(`[not-found] Environment ${id} not found`)
		return current
	}

	values.push(id)
	const {rows} = await pool.query(
		`UPDATE environments SET ${sets.join(', ')} WHERE id = $${i}
		 RETURNING ${SELECT_COLS}`,
		values,
	)
	if (rows.length === 0) throw new Error(`[not-found] Environment ${id} not found`)
	return rowToEnvironment(rows[0])
}

/**
 * Delete an environment. Throws `[cannot-delete-local]` if id is LOCAL_ENV_ID
 * (the built-in 'local' row is protected — without it, single-host installs
 * would have no fallback target).
 *
 * Throws `[not-found]` if no row matches the id.
 */
export async function deleteEnvironment(id: string): Promise<void> {
	const pool = getPool()
	if (!pool) throw new Error('Database not initialized')

	if (id === LOCAL_ENV_ID) {
		throw new Error("[cannot-delete-local] Cannot delete the built-in 'local' environment")
	}

	const result = await pool.query(`DELETE FROM environments WHERE id = $1`, [id])
	if ((result.rowCount ?? 0) === 0) {
		throw new Error(`[not-found] Environment ${id} not found`)
	}
}
