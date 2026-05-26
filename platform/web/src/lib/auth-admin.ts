import { NextRequest, NextResponse } from 'next/server';
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

export async function getSessionUserWithAdmin(req: NextRequest): Promise<SessionUserWithAdmin | null> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await getSession(token);
  if (!session) return null;

  const result = await pool.query<{ is_admin: boolean }>(
    'SELECT is_admin FROM users WHERE id = $1 LIMIT 1',
    [session.userId],
  );

  const isAdmin = result.rows[0]?.is_admin === true;

  // Best-effort last_seen_at touch — never blocks the request.
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
