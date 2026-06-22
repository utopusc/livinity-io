/**
 * POST /api/me/announcements/feedback
 *
 * Box→central write-back for votes/polls + free-text feedback. One editable
 * ledger row per (announcement, user, block) via UPSERT — a user can change
 * their vote, but cannot stuff the ballot (DEC-07). user_id is the CLOUD
 * users.id from the API key, never the body. Aggregated by Plan 08 analytics.
 *
 * Body: { announcement_id: string, block_id?: string|null,
 *         vote_option?: string, free_text?: string }
 * Response: { ok: true } | clean 503 if the table isn't applied yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';
const FK_VIOLATION = '23503';
const MAX_FREE_TEXT = 8000;
const MAX_VOTE_OPTION = 256;
// Sentinel for announcement-level (no block) feedback. Postgres treats NULLs as
// distinct in a UNIQUE constraint, so a NULL block_id would allow unlimited rows
// per user (ballot stuffing). Coercing to a constant keeps it one editable row.
const ROOT_BLOCK = '__root__';

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  let body: {
    announcement_id?: unknown;
    block_id?: unknown;
    vote_option?: unknown;
    free_text?: unknown;
  };
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

  const voteOption = clampStr(body.vote_option, MAX_VOTE_OPTION);
  const freeText = clampStr(body.free_text, MAX_FREE_TEXT);
  if (!voteOption && !freeText) {
    return NextResponse.json({ error: 'vote_option or free_text required' }, { status: 400 });
  }
  // null/absent block_id → sentinel so announcement-level feedback is one
  // editable row per user (DEC-07).
  const blockId = clampStr(body.block_id, 256) ?? ROOT_BLOCK;

  // IDENTITY: user_id is the CLOUD users.id from the API key — NEVER the body (T-292-18).
  try {
    await pool.query(
      `INSERT INTO announcement_feedback
         (announcement_id, user_id, block_id, vote_option, free_text)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (announcement_id, user_id, block_id)
       DO UPDATE SET vote_option = EXCLUDED.vote_option,
                     free_text   = EXCLUDED.free_text,
                     created_at  = now()`,
      [announcementId, auth.userId, blockId, voteOption, freeText],
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === UNDEFINED_TABLE) {
      return NextResponse.json(
        { ok: false, code: 'ANNOUNCEMENT_FEEDBACK_TABLE_MISSING' },
        { status: 503 },
      );
    }
    if (code === FK_VIOLATION) {
      return NextResponse.json({ error: 'Unknown announcement_id' }, { status: 400 });
    }
    console.error('[announcements/feedback] failed', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
