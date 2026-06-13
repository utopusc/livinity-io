/**
 * GET /api/admin/feedback — admin-only feedback list.
 *
 * Query:
 *   ?status   optional filter (new|seen|in_progress|resolved|wont_fix|…)
 *   ?limit    clamp 1..500, default 100
 *
 * Response: { items: FeedbackRow[], limit, counts }
 *   counts = best-effort { <status>: <n> } map for the filter chips.
 *
 * DEFENSIVE: the `feedback` table is operator-applied separately. If it is
 * missing (42P01) we return { items: [], limit, counts: {} } instead of a hard
 * 500 — the admin page renders an empty state.
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_LIMIT;
  const status = searchParams.get('status'); // optional filter

  const params: unknown[] = [];
  let where = '';
  if (status && status !== 'all') {
    params.push(status);
    where = `WHERE status = $${params.length}`;
  }
  params.push(limit);

  try {
    const result = await pool.query(
      `SELECT id, user_id, username, type, severity, area, title, message,
              steps, contact, app_version, user_agent, page_url, status,
              admin_note, created_at, updated_at
         FROM feedback
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
      params,
    );

    // Best-effort status counts (un-filtered) for the filter chips. A failure
    // here must not break the list response.
    let counts: Record<string, number> = {};
    try {
      const countRes = await pool.query<{ status: string; n: string }>(
        `SELECT COALESCE(status, 'new') AS status, COUNT(*)::text AS n
           FROM feedback GROUP BY COALESCE(status, 'new')`,
      );
      counts = Object.fromEntries(
        countRes.rows.map((r) => [r.status, Number(r.n)]),
      );
    } catch (countErr) {
      console.warn(
        '[admin/feedback] counts skipped:',
        (countErr as Error)?.message ?? countErr,
      );
    }

    return NextResponse.json(
      { items: result.rows, limit, counts },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === UNDEFINED_TABLE) {
      // Not provisioned yet — return an empty, well-shaped payload.
      return NextResponse.json(
        { items: [], limit, counts: {} },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    console.error('[admin/feedback] list failed:', (err as Error)?.message ?? err);
    return NextResponse.json({ error: 'Failed to load feedback' }, { status: 500 });
  }
}
