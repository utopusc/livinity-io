// Admin API for a single announcement (get-for-edit / update / delete).
// Operator-only (requireAdmin). PUT re-runs Layer-1 sanitize when raw HTML
// changes. GET is the ONE place raw_html_source is exposed (admin re-edit only).
//
// Raw pg `pool` (NOT Drizzle) — the uuid[] column (target_user_ids) breaks
// Drizzle 0.45 read/write. See ../route.ts header.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAdmin } from '@/lib/auth-admin';
import { sanitizeAnnouncementHtml } from '@/lib/sanitize-html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';

type RouteParams = { params: Promise<{ id: string }> };

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  try {
    const result = await pool.query('SELECT * FROM announcements WHERE id = $1 LIMIT 1', [id]);
    if (result.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    // Admin-only: includes raw_html_source for re-editing — never box-facing.
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error('[admin/announcements/[id] GET] failed:', err);
    if (pgCode(err) === UNDEFINED_TABLE) {
      return NextResponse.json({ error: 'announcements table not provisioned' }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type UpdateBody = {
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

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (body.slug && !/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, digits and hyphens' },
      { status: 400 },
    );
  }

  // Build a partial UPDATE from only the provided fields.
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, val: unknown, cast = '') => {
    sets.push(`${col} = $${i}${cast}`);
    vals.push(val);
    i += 1;
  };

  if (body.title !== undefined) add('title', body.title);
  if (body.slug !== undefined) add('slug', body.slug);
  if (body.kind !== undefined) add('kind', body.kind);
  if (body.blocks !== undefined) add('blocks', JSON.stringify(Array.isArray(body.blocks) ? body.blocks : []), '::jsonb');
  if (body.raw_html !== undefined) {
    const rawHtml = typeof body.raw_html === 'string' ? body.raw_html : null;
    add('raw_html_sanitized', rawHtml ? sanitizeAnnouncementHtml(rawHtml) : null); // Layer 1 re-sanitize
    add('raw_html_source', rawHtml); // never served
  }
  if (body.frequency !== undefined) add('frequency', body.frequency);
  if (body.frequency_n !== undefined) add('frequency_n', body.frequency_n);
  if (body.priority !== undefined) add('priority', body.priority);
  if (body.dismissible !== undefined) add('dismissible', body.dismissible);
  if (body.start_at !== undefined) add('start_at', body.start_at ? new Date(body.start_at) : null);
  if (body.end_at !== undefined) add('end_at', body.end_at ? new Date(body.end_at) : null);
  if (body.target_kind !== undefined) add('target_kind', body.target_kind);
  if (body.target_user_ids !== undefined) {
    add('target_user_ids', Array.isArray(body.target_user_ids) ? body.target_user_ids : [], '::uuid[]');
  }
  if (body.target_plan_tier !== undefined) add('target_plan_tier', body.target_plan_tier);
  if (body.status !== undefined) {
    add('status', body.status);
    if (body.status === 'published') add('published_at', new Date());
  }

  sets.push('updated_at = now()');
  vals.push(id);

  try {
    const result = await pool.query(
      `UPDATE announcements SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals,
    );
    if (result.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (err: unknown) {
    console.error('[admin/announcements/[id] PUT] failed:', err);
    const code = pgCode(err);
    if (code === UNDEFINED_TABLE) {
      return NextResponse.json({ error: 'announcements table not provisioned' }, { status: 503 });
    }
    if (code === '23505') {
      return NextResponse.json({ error: `slug "${body.slug}" already exists` }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  try {
    // ON DELETE CASCADE (migration 0025) removes the seen/feedback rows too.
    await pool.query('DELETE FROM announcements WHERE id = $1', [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/announcements/[id] DELETE] failed:', err);
    if (pgCode(err) === UNDEFINED_TABLE) {
      return NextResponse.json({ error: 'announcements table not provisioned' }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
