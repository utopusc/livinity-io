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
  const adminResult = await pool.query<{ is_admin: boolean }>(
    'SELECT is_admin FROM users WHERE id = $1 LIMIT 1',
    [user.userId],
  );
  const is_admin = adminResult.rows[0]?.is_admin === true;

  return NextResponse.json({ user: { ...user, is_admin } });
}
