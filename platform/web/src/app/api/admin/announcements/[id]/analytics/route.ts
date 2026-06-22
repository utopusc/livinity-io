// Admin analytics aggregation for one announcement (DEC-06). Admin-gated +
// 42P01-defensive so the dashboard renders an empty state before the migration
// is applied. Aggregates announcement_seen + announcement_feedback (Plan 05).
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';

type RouteParams = { params: Promise<{ id: string }> };

const EMPTY = {
  seen: { users_seen: 0, impressions: 0, dismissed: 0 },
  votes: [] as { block_id: string | null; vote_option: string; votes: number }[],
  feedback: [] as { block_id: string | null; free_text: string; created_at: string }[],
  series: [] as { day: string; users: number }[],
};

export async function GET(req: NextRequest, { params }: RouteParams) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  try {
    const seenQ = await pool.query<{ users_seen: number; impressions: number; dismissed: number }>(
      `SELECT count(*)::int AS users_seen,
              COALESCE(sum(seen_count), 0)::int AS impressions,
              count(dismissed_at)::int AS dismissed
         FROM announcement_seen
        WHERE announcement_id = $1`,
      [id],
    );
    const votesQ = await pool.query<{ block_id: string | null; vote_option: string; votes: number }>(
      `SELECT block_id, vote_option, count(*)::int AS votes
         FROM announcement_feedback
        WHERE announcement_id = $1 AND vote_option IS NOT NULL
        GROUP BY block_id, vote_option
        ORDER BY block_id, votes DESC`,
      [id],
    );
    const feedbackQ = await pool.query<{ block_id: string | null; free_text: string; created_at: string }>(
      `SELECT block_id, free_text, created_at
         FROM announcement_feedback
        WHERE announcement_id = $1 AND free_text IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 500`,
      [id],
    );
    // Seen-over-time: one announcement_seen row per (announcement, user), so this
    // is "users whose last view landed on day D" — a lightweight engagement trend.
    const seriesQ = await pool.query<{ day: string; users: number }>(
      `SELECT to_char(date_trunc('day', last_seen_at), 'YYYY-MM-DD') AS day,
              count(*)::int AS users
         FROM announcement_seen
        WHERE announcement_id = $1
        GROUP BY 1
        ORDER BY 1
        LIMIT 180`,
      [id],
    );
    return NextResponse.json({
      seen: seenQ.rows[0] ?? EMPTY.seen,
      votes: votesQ.rows,
      feedback: feedbackQ.rows,
      series: seriesQ.rows,
    });
  } catch (err) {
    // Pre-migration (tables absent) → clean empty dashboard, not a 500.
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
      return NextResponse.json(EMPTY);
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
