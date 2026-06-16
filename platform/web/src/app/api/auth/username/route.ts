/**
 * POST /api/auth/username — claim a username for the logged-in user (Phase 274).
 *
 * Signup (email/password AND OAuth) now creates a user with username=NULL. This
 * endpoint is the one-time claim: it validates the candidate through the
 * canonical validateUsername() chain (format → reserved → app-collision → taken
 * → permanently-reserved) and sets it — but ONLY while the user's username is
 * still NULL. The `AND username IS NULL` predicate makes the claim:
 *   - one-shot: a username, once set, can never be changed here; and
 *   - race-safe: two concurrent claims for the same account serialize and the
 *     second sees 0 rows updated.
 *
 * The PERMANENT reservation (reserved_usernames) is written later, when a
 * subscription goes trialing|active (lib/stripe-sync.ts). Picking here is only a
 * temporary hold via the users.username UNIQUE index.
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { validateUsername } from '@/lib/username-validator';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await getSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.username) {
    // Already has one — usernames are permanent, never changed here.
    return NextResponse.json(
      { error: 'You already have a username.', code: 'already_set' },
      { status: 409 },
    );
  }

  let username: unknown;
  try {
    ({ username } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (typeof username !== 'string') {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const v = await validateUsername(username);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error, code: v.code }, { status: 409 });
  }

  try {
    const res = await pool.query(
      'UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2 AND username IS NULL',
      [v.normalized, session.userId],
    );
    if (res.rowCount === 0) {
      // Either the row already had a username (concurrent claim) or the user
      // vanished. Treat as already-set — usernames are permanent.
      return NextResponse.json(
        { error: 'You already have a username.', code: 'already_set' },
        { status: 409 },
      );
    }
  } catch (err) {
    // 23505 → the UNIQUE(username) index: someone claimed it between validate and
    // update. Surface as taken so the UI re-prompts.
    if ((err as { code?: string })?.code === '23505') {
      return NextResponse.json(
        { ok: false, error: `"${v.normalized}" is already taken.`, code: 'TAKEN' },
        { status: 409 },
      );
    }
    console.error('[auth] username claim error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, username: v.normalized });
}
