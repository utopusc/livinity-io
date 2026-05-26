import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import pool from './db';
import { getSession, SESSION_COOKIE_NAME } from './auth';

export interface AdminContext {
  userId: string;
  username: string;
  email: string;
  isAdmin: true;
}

export interface SessionUserWithAdmin {
  userId: string;
  username: string;
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
}

async function resolveAdminViaSessionCookie(req: NextRequest): Promise<SessionUserWithAdmin | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await getSession(token);
  if (!session) return null;

  const result = await pool.query<{ is_admin: boolean }>(
    'SELECT is_admin FROM users WHERE id = $1 LIMIT 1',
    [session.userId],
  );

  const isAdmin = result.rows[0]?.is_admin === true;

  pool
    .query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [session.userId])
    .catch((err) => console.warn('[auth-admin] last_seen_at touch failed:', err?.message ?? err));

  return {
    userId: session.userId,
    username: session.username,
    email: session.email,
    emailVerified: session.emailVerified,
    isAdmin,
  };
}

async function resolveAdminViaApiKey(req: NextRequest): Promise<SessionUserWithAdmin | null> {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !apiKey.startsWith('liv_k_')) return null;

  const apiResult = await pool.query<{ key_hash: string; user_id: string }>(
    'SELECT key_hash, user_id FROM api_keys',
  );

  let matchedUserId: string | null = null;
  for (const row of apiResult.rows) {
    if (await bcrypt.compare(apiKey, row.key_hash)) {
      matchedUserId = row.user_id;
      break;
    }
  }
  if (!matchedUserId) return null;

  const userResult = await pool.query<{
    id: string;
    username: string;
    email: string;
    email_verified: boolean;
    is_admin: boolean;
  }>(
    'SELECT id, username, email, email_verified, is_admin FROM users WHERE id = $1 LIMIT 1',
    [matchedUserId],
  );

  const row = userResult.rows[0];
  if (!row) return null;

  pool
    .query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [matchedUserId])
    .catch((err) => console.warn('[auth-admin] last_seen_at touch (api-key) failed:', err?.message ?? err));

  return {
    userId: row.id,
    username: row.username,
    email: row.email,
    emailVerified: row.email_verified,
    isAdmin: row.is_admin === true,
  };
}

export async function getSessionUserWithAdmin(req: NextRequest): Promise<SessionUserWithAdmin | null> {
  // Prefer session-cookie path; fall back to x-api-key (legacy admin shell).
  const cookieUser = await resolveAdminViaSessionCookie(req);
  if (cookieUser) return cookieUser;
  return resolveAdminViaApiKey(req);
}

export async function requireAdmin(req: NextRequest): Promise<AdminContext | NextResponse> {
  const user = await getSessionUserWithAdmin(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.isAdmin) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }
  return {
    userId: user.userId,
    username: user.username,
    email: user.email,
    isAdmin: true,
  };
}
