/**
 * PATCH /api/admin/feedback/[id] — admin triage update.
 *
 * Body: { status?, admin_note? }
 *   status ∈ new|seen|in_progress|resolved|wont_fix (anything else → 400)
 *
 * Both fields are COALESCE-updated, so omitting one leaves it untouched.
 * updated_at is bumped to NOW().
 *
 * Response 200: the updated feedback row
 * Response 400: invalid uuid / invalid status / empty body
 * Response 404: no such row
 * Response 503: feedback table not provisioned yet (42P01 — defensive)
 */

import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['new', 'seen', 'in_progress', 'resolved', 'wont_fix']);
const MAX_NOTE = 20000;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctxParam: RouteContext) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await ctxParam.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid feedback id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // status: only validate when present; reject unknown values.
  let status: string | null = null;
  if (body.status !== undefined && body.status !== null) {
    if (typeof body.status !== 'string' || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    status = body.status;
  }

  // admin_note: allow clearing to empty string; null/undefined → leave as-is.
  let adminNote: string | null = null;
  if (body.admin_note !== undefined && body.admin_note !== null) {
    if (typeof body.admin_note !== 'string') {
      return NextResponse.json({ error: 'Invalid admin_note' }, { status: 400 });
    }
    adminNote = body.admin_note.slice(0, MAX_NOTE);
  }

  if (status === null && adminNote === null) {
    return NextResponse.json(
      { error: 'Nothing to update (status or admin_note required)' },
      { status: 400 },
    );
  }

  try {
    const result = await pool.query(
      `UPDATE feedback
          SET status = COALESCE($2, status),
              admin_note = COALESCE($3, admin_note),
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, user_id, username, type, severity, area, title, message,
                  steps, contact, app_version, user_agent, page_url, status,
                  admin_note, created_at, updated_at`,
      [id, status, adminNote],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0], {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === UNDEFINED_TABLE) {
      return NextResponse.json(
        {
          error: 'Feedback is not available yet.',
          code: 'FEEDBACK_TABLE_MISSING',
        },
        { status: 503 },
      );
    }
    console.error('[admin/feedback/:id] update failed:', (err as Error)?.message ?? err);
    return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 });
  }
}
