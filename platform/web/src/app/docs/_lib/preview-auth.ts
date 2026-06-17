// Admin detection for the PUBLIC docs RSC — lets a logged-in admin preview
// unpublished drafts on the real /docs URL (everyone else still gets a 404).
// Mirrors the is_admin check in lib/auth-admin.ts, but reads the session from
// cookies() (Next 16 async) instead of a NextRequest. Best-effort: any failure
// resolves to "not admin" so a transient error can never expose a draft.

import { cookies } from 'next/headers';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function isAdminViewer(): Promise<boolean> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    if (!token) return false;

    const session = await getSession(token);
    if (!session) return false;

    const result = await pool.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1 LIMIT 1',
      [session.userId],
    );
    return result.rows[0]?.is_admin === true;
  } catch {
    return false;
  }
}
