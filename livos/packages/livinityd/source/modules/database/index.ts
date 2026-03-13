import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'

import pg from 'pg'

import type Livinityd from '../../index.js'

const {Pool} = pg

const DEFAULT_DATABASE_URL = 'postgresql://livos:LivPostgres2024!@localhost:5432/livos'

// Read schema SQL at module load time
const currentFilename = fileURLToPath(import.meta.url)
const currentDirname = dirname(currentFilename)
const schemaSql = readFileSync(join(currentDirname, 'schema.sql'), 'utf8')

export type DatabaseUser = {
	id: string
	username: string
	displayName: string
	hashedPassword: string
	role: 'admin' | 'member' | 'guest'
	avatarColor: string
	isActive: boolean
	createdAt: Date
	updatedAt: Date
}

export type CurrentUser = {
	id: string
	username: string
	role: string
}

let pool: pg.Pool | null = null
let initialized = false

/**
 * Get or create the PostgreSQL connection pool.
 * Returns null if DATABASE_URL is not set and default connection fails.
 */
export function getPool(): pg.Pool | null {
	return pool
}

/**
 * Initialize the database: create pool, run schema, return success.
 * Safe to call multiple times -- only initializes once.
 */
export async function initDatabase(logger: Livinityd['logger']): Promise<boolean> {
	if (initialized && pool) return true

	const databaseUrl = process.env.DATABASE_URL || DEFAULT_DATABASE_URL

	try {
		pool = new Pool({
			connectionString: databaseUrl,
			max: 10,
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: 5_000,
		})

		// Test connection
		const client = await pool.connect()
		try {
			// Run schema (idempotent -- uses IF NOT EXISTS)
			await client.query(schemaSql)
			logger.log('Database schema applied successfully')
		} finally {
			client.release()
		}

		initialized = true
		logger.log(`Database connected: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`)
		return true
	} catch (error) {
		logger.error('Failed to initialize database', error)
		// Clean up failed pool
		if (pool) {
			await pool.end().catch(() => {})
			pool = null
		}
		return false
	}
}

/**
 * Migrate existing YAML user data into PostgreSQL.
 * Creates an admin user from the YAML store if one doesn't already exist in the DB.
 */
export async function migrateFromYaml(store: Livinityd['store'], logger: Livinityd['logger']): Promise<boolean> {
	if (!pool) {
		logger.error('Cannot migrate: database not initialized')
		return false
	}

	try {
		// Check if any users already exist in the DB
		const {rows: existingUsers} = await pool.query('SELECT id FROM users LIMIT 1')
		if (existingUsers.length > 0) {
			logger.log('Database already has users, skipping YAML migration')
			return true
		}

		// Read YAML user data
		const userName = await store.get('user.name' as any)
		const hashedPassword = await store.get('user.hashedPassword' as any)

		if (!userName || !hashedPassword) {
			logger.log('No YAML user data found to migrate')
			return true
		}

		// Create admin user from YAML data
		// Use the name as the username (lowercased, spaces replaced with hyphens)
		const username = String(userName).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
		const displayName = String(userName)

		const {rows} = await pool.query(
			`INSERT INTO users (username, display_name, hashed_password, role)
			 VALUES ($1, $2, $3, 'admin')
			 RETURNING id`,
			[username || 'admin', displayName || 'Admin', hashedPassword],
		)

		logger.log(`Migrated YAML user "${displayName}" to database as admin (id: ${rows[0].id})`)
		return true
	} catch (error) {
		logger.error('Failed to migrate YAML user data', error)
		return false
	}
}

/**
 * Find a user by ID.
 */
export async function findUserById(id: string): Promise<DatabaseUser | null> {
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT id, username, display_name, hashed_password, role, avatar_color, is_active, created_at, updated_at
		 FROM users WHERE id = $1`,
		[id],
	)
	if (rows.length === 0) return null
	return rowToUser(rows[0])
}

/**
 * Find a user by username.
 */
export async function findUserByUsername(username: string): Promise<DatabaseUser | null> {
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT id, username, display_name, hashed_password, role, avatar_color, is_active, created_at, updated_at
		 FROM users WHERE username = $1`,
		[username],
	)
	if (rows.length === 0) return null
	return rowToUser(rows[0])
}

/**
 * Get the first admin user (used for legacy token fallback).
 */
export async function getAdminUser(): Promise<DatabaseUser | null> {
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT id, username, display_name, hashed_password, role, avatar_color, is_active, created_at, updated_at
		 FROM users WHERE role = 'admin' AND is_active = TRUE
		 ORDER BY created_at ASC LIMIT 1`,
	)
	if (rows.length === 0) return null
	return rowToUser(rows[0])
}

/**
 * Create a new user in the database.
 */
export async function createUser(data: {
	username: string
	displayName: string
	hashedPassword: string
	role?: string
	avatarColor?: string
}): Promise<DatabaseUser> {
	if (!pool) throw new Error('Database not initialized')
	const {rows} = await pool.query(
		`INSERT INTO users (username, display_name, hashed_password, role, avatar_color)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, username, display_name, hashed_password, role, avatar_color, is_active, created_at, updated_at`,
		[data.username, data.displayName, data.hashedPassword, data.role || 'member', data.avatarColor || '#6366f1'],
	)
	return rowToUser(rows[0])
}

/**
 * List all users.
 */
export async function listUsers(): Promise<DatabaseUser[]> {
	if (!pool) return []
	const {rows} = await pool.query(
		`SELECT id, username, display_name, hashed_password, role, avatar_color, is_active, created_at, updated_at
		 FROM users ORDER BY created_at ASC`,
	)
	return rows.map(rowToUser)
}

/**
 * Update a user's role.
 */
export async function updateUserRole(userId: string, role: string): Promise<DatabaseUser | null> {
	if (!pool) return null
	const {rows} = await pool.query(
		`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2
		 RETURNING id, username, display_name, hashed_password, role, avatar_color, is_active, created_at, updated_at`,
		[role, userId],
	)
	if (rows.length === 0) return null
	return rowToUser(rows[0])
}

/**
 * Toggle a user's active status.
 */
export async function toggleUserActive(userId: string, isActive: boolean): Promise<DatabaseUser | null> {
	if (!pool) return null
	const {rows} = await pool.query(
		`UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2
		 RETURNING id, username, display_name, hashed_password, role, avatar_color, is_active, created_at, updated_at`,
		[isActive, userId],
	)
	if (rows.length === 0) return null
	return rowToUser(rows[0])
}

/**
 * Update a user's display name.
 */
export async function updateUserDisplayName(userId: string, displayName: string): Promise<DatabaseUser | null> {
	if (!pool) return null
	const {rows} = await pool.query(
		`UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2
		 RETURNING id, username, display_name, hashed_password, role, avatar_color, is_active, created_at, updated_at`,
		[displayName, userId],
	)
	if (rows.length === 0) return null
	return rowToUser(rows[0])
}

/**
 * Invite token types.
 */
export type DatabaseInvite = {
	id: string
	tokenHash: string
	createdBy: string
	role: string
	expiresAt: Date
	usedAt: Date | null
	usedBy: string | null
}

/**
 * Create an invite in the database.
 */
export async function createInvite(data: {
	tokenHash: string
	createdBy: string
	role: string
	expiresAt: Date
}): Promise<DatabaseInvite> {
	if (!pool) throw new Error('Database not initialized')
	const {rows} = await pool.query(
		`INSERT INTO invites (token_hash, created_by, role, expires_at)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, token_hash, created_by, role, expires_at, used_at, used_by`,
		[data.tokenHash, data.createdBy, data.role, data.expiresAt],
	)
	return rowToInvite(rows[0])
}

/**
 * Find an invite by token hash that is still valid (not used, not expired).
 */
export async function findValidInvite(tokenHash: string): Promise<DatabaseInvite | null> {
	if (!pool) return null
	const {rows} = await pool.query(
		`SELECT id, token_hash, created_by, role, expires_at, used_at, used_by
		 FROM invites
		 WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
		[tokenHash],
	)
	if (rows.length === 0) return null
	return rowToInvite(rows[0])
}

/**
 * Mark an invite as used.
 */
export async function markInviteUsed(inviteId: string, usedBy: string): Promise<void> {
	if (!pool) return
	await pool.query(
		`UPDATE invites SET used_at = NOW(), used_by = $1 WHERE id = $2`,
		[usedBy, inviteId],
	)
}

/**
 * Gracefully close the database pool.
 */
export async function closeDatabase(): Promise<void> {
	if (pool) {
		await pool.end()
		pool = null
		initialized = false
	}
}

/**
 * Convert a database row to a DatabaseUser object.
 */
function rowToUser(row: any): DatabaseUser {
	return {
		id: row.id,
		username: row.username,
		displayName: row.display_name,
		hashedPassword: row.hashed_password,
		role: row.role,
		avatarColor: row.avatar_color,
		isActive: row.is_active,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	}
}

/**
 * Convert a database row to a DatabaseInvite object.
 */
function rowToInvite(row: any): DatabaseInvite {
	return {
		id: row.id,
		tokenHash: row.token_hash,
		createdBy: row.created_by,
		role: row.role,
		expiresAt: row.expires_at,
		usedAt: row.used_at,
		usedBy: row.used_by,
	}
}
