// Admin API for announcements CRUD (list + create). Operator-only (requireAdmin:
// session cookie OR x-api-key), mirrors /api/admin/docs. POST runs Layer-1
// publish-time DOMPurify sanitize over any raw HTML before storage. Box-facing
// reads (Plan 04) only ever see raw_html_sanitized.
//
// Uses the raw pg `pool` (NOT Drizzle) on purpose: the announcements table has a
// `uuid[]` column (target_user_ids) which Drizzle 0.45 mishandles on read/write
// (caused 500s on both list + create). The poll/seen/feedback routes already use
// raw SQL for the same reason. The Drizzle mirror in schema.ts stays for typing.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';
import { sanitizeAnnouncementHtml } from '@/lib/sanitize-html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const result = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC');
    return NextResponse.json({ announcements: result.rows });
  } catch (err) {
    // The list must NEVER hard-500: missing table / transient hiccup → empty list
    // so the admin page renders and the admin can still create. Logged.
    console.error('[admin/announcements GET] list failed, returning empty:', err);
    return NextResponse.json({ announcements: [] });
  }
}

type CreateBody = {
  title?: string;
  slug?: string | null;
  kind?: string;
  blocks?: unknown;
  raw_html?: string | null;
  frequency?: string;
  frequency_n?: number | null;
  priority?: number;
  dismissible?: boolean;
  start_at?: string | null;
  end_at?: string | null;
  target_kind?: string;
  target_user_ids?: string[];
  target_plan_tier?: string | null;
  status?: string;
};

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (body.slug && !/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, digits and hyphens' },
      { status: 400 },
    );
  }

  const rawHtml = typeof body.raw_html === 'string' ? body.raw_html : null;
  const isPublished = body.status === 'published';
  const blocks = Array.isArray(body.blocks) ? body.blocks : [];
  const targetUserIds = Array.isArray(body.target_user_ids) ? body.target_user_ids : [];

  try {
    const result = await pool.query(
      `INSERT INTO announcements
         (title, slug, kind, blocks, raw_html_sanitized, raw_html_source, frequency,
          frequency_n, priority, dismissible, start_at, end_at, target_kind,
          target_user_ids, target_plan_tier, status, published_at, created_by)
       VALUES
         ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14::uuid[], $15, $16, $17, $18)
       RETURNING *`,
      [
        body.title,
        body.slug ?? null,
        body.kind ?? 'announcement',
        JSON.stringify(blocks),
        // Layer 1: store sanitized HTML (served) + the original (quarantined, T-292-07).
        rawHtml ? sanitizeAnnouncementHtml(rawHtml) : null,
        rawHtml,
        body.frequency ?? 'once_ever',
        body.frequency_n ?? null,
        typeof body.priority === 'number' ? body.priority : 100,
        body.dismissible ?? true,
        body.start_at ? new Date(body.start_at) : null,
        body.end_at ? new Date(body.end_at) : null,
        body.target_kind ?? 'all',
        targetUserIds,
        body.target_plan_tier ?? null,
        body.status ?? 'draft',
        isPublished ? new Date() : null,
        ctx.userId, // from the admin context, NEVER the body
      ],
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err: unknown) {
    console.error('[admin/announcements POST] create failed:', err);
    const code = pgCode(err);
    if (code === UNDEFINED_TABLE) {
      return NextResponse.json(
        { error: 'announcements table not provisioned', code: 'ANNOUNCEMENTS_TABLE_MISSING' },
        { status: 503 },
      );
    }
    if (code === '23505') {
      return NextResponse.json({ error: `slug "${body.slug}" already exists` }, { status: 409 });
    }
    if (code === '23503') {
      return NextResponse.json({ error: 'invalid reference' }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
