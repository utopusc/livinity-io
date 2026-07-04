import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await getSession(token);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // Phase 213: enrich with is_admin so client-side admin gates can route on it.
  // Also surface free_byod so the post-signup flow can route a free-tier user
  // to their setup screen (/dashboard/install) instead of /pricing.
  let is_admin = false;
  let free_byod = false;
  try {
    const r = await pool.query<{ is_admin: boolean; free_byod: boolean }>(
      'SELECT is_admin, free_byod FROM users WHERE id = $1 LIMIT 1',
      [user.userId],
    );
    is_admin = r.rows[0]?.is_admin === true;
    free_byod = r.rows[0]?.free_byod === true;
  } catch {
    // free_byod column may be absent on an un-migrated DB — never break /me.
    const r = await pool.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1 LIMIT 1',
      [user.userId],
    );
    is_admin = r.rows[0]?.is_admin === true;
  }

  return NextResponse.json({ user: { ...user, is_admin, free_byod } });
}
