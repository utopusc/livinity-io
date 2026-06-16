/**
 * GET /api/auth/username/check?u=<candidate> — live availability check for the
 * /username picker (Phase 274). Runs the canonical validateUsername() chain and
 * returns { available, reason?, error? } WITHOUT mutating anything.
 *
 * No mutation, idempotent, cheap — safe to call on every (debounced) keystroke.
 * Session-gated to keep it from being a free username-enumeration oracle for
 * anonymous callers (the same validator the claim endpoint uses).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { validateUsername } from '@/lib/username-validator';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await getSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const u = req.nextUrl.searchParams.get('u') ?? '';
  if (!u) {
    return NextResponse.json({ available: false, reason: 'FORMAT', error: 'Enter a username.' });
  }

  const v = await validateUsername(u);
  if (v.ok) {
    return NextResponse.json({ available: true, normalized: v.normalized });
  }
  return NextResponse.json({ available: false, reason: v.code, error: v.error });
}
