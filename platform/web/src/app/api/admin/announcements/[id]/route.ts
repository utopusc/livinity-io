// Admin API for a single announcement (get-for-edit / update / delete).
// Operator-only (requireAdmin). PUT re-runs Layer-1 sanitize when raw HTML
// changes. GET is the ONE place raw_html_source is exposed (admin re-edit only).
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth-admin';
import { db } from '@/lib/drizzle';
import { announcements } from '@/db/schema';
import { sanitizeAnnouncementHtml } from '@/lib/sanitize-html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  try {
    const [row] = await db
      .select()
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    // Admin-only: includes raw_html_source for re-editing — never box-facing.
    return NextResponse.json(row);
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
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

  // Build a partial update from only the provided fields.
  const set: Record<string, unknown> = { updated_at: new Date() };
  if (body.title !== undefined) set.title = body.title;
  if (body.slug !== undefined) set.slug = body.slug;
  if (body.kind !== undefined) set.kind = body.kind;
  if (body.blocks !== undefined) set.blocks = Array.isArray(body.blocks) ? body.blocks : [];
  if (body.raw_html !== undefined) {
    const rawHtml = typeof body.raw_html === 'string' ? body.raw_html : null;
    set.raw_html_source = rawHtml; // never served
    set.raw_html_sanitized = rawHtml ? sanitizeAnnouncementHtml(rawHtml) : null; // Layer 1 re-sanitize
  }
  if (body.frequency !== undefined) set.frequency = body.frequency;
  if (body.frequency_n !== undefined) set.frequency_n = body.frequency_n;
  if (body.priority !== undefined) set.priority = body.priority;
  if (body.dismissible !== undefined) set.dismissible = body.dismissible;
  if (body.start_at !== undefined) set.start_at = body.start_at ? new Date(body.start_at) : null;
  if (body.end_at !== undefined) set.end_at = body.end_at ? new Date(body.end_at) : null;
  if (body.target_kind !== undefined) set.target_kind = body.target_kind;
  if (body.target_user_ids !== undefined) {
    set.target_user_ids = Array.isArray(body.target_user_ids) ? body.target_user_ids : [];
  }
  if (body.target_plan_tier !== undefined) set.target_plan_tier = body.target_plan_tier;
  if (body.status !== undefined) {
    set.status = body.status;
    // Stamp published_at on the transition to published.
    if (body.status === 'published') set.published_at = new Date();
  }

  try {
    const [updated] = await db
      .update(announcements)
      .set(set)
      .where(eq(announcements.id, id))
      .returning();
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
      return NextResponse.json({ error: 'announcements table not provisioned' }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(message)) {
      return NextResponse.json({ error: `slug "${body.slug}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;

  try {
    // ON DELETE CASCADE (migration 0025) removes the seen/feedback rows too.
    await db.delete(announcements).where(eq(announcements.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string })?.code === UNDEFINED_TABLE) {
      return NextResponse.json({ error: 'announcements table not provisioned' }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
