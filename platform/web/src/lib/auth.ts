import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import pool from './db';

export const SESSION_COOKIE_NAME = 'liv_session';
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

export const RESERVED_USERNAMES = new Set([
  'admin', 'www', 'api', 'app', 'relay', 'status', 'help', 'support',
  'billing', 'dashboard', 'login', 'register', 'signup', 'signin',
  'auth', 'account', 'settings', 'profile', 'mail', 'ftp', 'ssh',
  'root', 'test', 'demo', 'internal', 'system', 'platform', 'cdn',
  'static', 'assets', 'docs', 'blog', 'about', 'contact', 'pricing',
]);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (username.length > 30) {
    return { valid: false, error: 'Username must be at most 30 characters' };
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(username) && !/^[a-z0-9]$/.test(username)) {
    return { valid: false, error: 'Username must be lowercase alphanumeric with hyphens, cannot start or end with a hyphen' };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return { valid: false, error: 'This username is reserved' };
  }
  return { valid: true };
}

export async function createSession(
  userId: string,
  ip?: string,
  userAgent?: string,
): Promise<string> {
  const token = nanoid(48);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);

  await pool.query(
    `INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, token, expiresAt, ip ?? null, userAgent ?? null],
  );

  return token;
}

export interface SessionUser {
  userId: string;
  username: string;
  email: string;
  emailVerified: boolean;
}

export async function getSession(token: string): Promise<SessionUser | null> {
  if (!token) return null;

  const result = await pool.query<{
    user_id: string;
    username: string;
    email: string;
    email_verified: boolean;
  }>(
    `SELECT u.id AS user_id, u.username, u.email, u.email_verified
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [token],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    userId: row.user_id,
    username: row.username,
    email: row.email,
    emailVerified: row.email_verified,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
}
