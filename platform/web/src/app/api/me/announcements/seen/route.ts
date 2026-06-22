/**
 * POST /api/me/announcements/seen
 *
 * The cross-instance "show once per user" ledger. A box reports that the
 * authenticated user has seen (or dismissed) an announcement; the per-user
 * seen_count increments atomically. Because every box a user owns shares the
 * same API key → same CLOUD users.id, this central ledger is authoritative
 * across ALL of a user's instances (DEC-03).
 *
 * Body: { announcement_id: string, dismissed?: boolean }
 * Response: { ok: true, seen_count } | clean 503 if the table isn't applied yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';
const FK_VIOLATION = '23503';

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  let body: { announcement_id?: unknown; dismissed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const announcementId =
    typeof body.announcement_id === 'string' ? body.announcement_id.trim() : '';
  if (!announcementId) {
    return NextResponse.json({ error: 'announcement_id required' }, { status: 400 });
  }
  const dismissed = body.dismissed === true;

  // IDENTITY: user_id is the CLOUD users.id resolved from the API key — it is
  // NEVER read from the request body (T-292-18). The body supplies only
  // announcement_id / dismissed.
  try {
    const result = await pool.query<{ seen_count: number }>(
      `INSERT INTO announcement_seen
         (announcement_id, user_id, seen_count, first_seen_at, last_seen_at, dismissed_at)
       VALUES ($1, $2, 1, now(), now(), CASE WHEN $3 THEN now() ELSE NULL END)
       ON CONFLICT (announcement_id, user_id)
       DO UPDATE SET seen_count = announcement_seen.seen_count + 1,
                     last_seen_at = now(),
                     dismissed_at = CASE WHEN $3 THEN now() ELSE announcement_seen.dismissed_at END
       RETURNING seen_count`,
      [announcementId, auth.userId, dismissed],
    );
    return NextResponse.json({ ok: true, seen_count: result.rows[0]?.seen_count ?? 1 });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === UNDEFINED_TABLE) {
      return NextResponse.json(
        { ok: false, code: 'ANNOUNCEMENT_SEEN_TABLE_MISSING' },
        { status: 503 },
      );
    }
    if (code === FK_VIOLATION) {
      return NextResponse.json({ error: 'Unknown announcement_id' }, { status: 400 });
    }
    console.error('[announcements/seen] failed', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
