// Admin API for announcements CRUD (list + create). Operator-only
// (requireAdmin: session cookie OR x-api-key), mirrors /api/admin/docs.
// POST runs Layer-1 publish-time DOMPurify sanitize over any raw HTML before
// storage. Box-facing reads (Plan 04) only ever see raw_html_sanitized.
import { NextRequest, NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth-admin';
import { db } from '@/lib/drizzle';
import { announcements } from '@/db/schema';
import { sanitizeAnnouncementHtml } from '@/lib/sanitize-html';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UNDEFINED_TABLE = '42P01';

// Drizzle/pg can surface the Postgres error code on the error itself OR on its
// `.cause`. Check both so the defensive 42P01 path always fires.
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const rows = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.created_at));
    return NextResponse.json({ announcements: rows });
  } catch (err) {
    // The list must NEVER hard-500: a missing table (pre-migration) or any
    // transient DB hiccup degrades to an empty list so the admin page renders
    // and the admin can still create. Logged for diagnosis.
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

  try {
    const [inserted] = await db
      .insert(announcements)
      .values({
        title: body.title,
        slug: body.slug ?? null,
        kind: body.kind ?? 'announcement',
        blocks: Array.isArray(body.blocks) ? (body.blocks as unknown[]) : [],
        // Layer 1: store the sanitized HTML (served to the fleet) + the original
        // (raw_html_source, admin re-edit only, NEVER served — T-292-07).
        raw_html_source: rawHtml,
        raw_html_sanitized: rawHtml ? sanitizeAnnouncementHtml(rawHtml) : null,
        frequency: body.frequency ?? 'once_ever',
        frequency_n: body.frequency_n ?? null,
        priority: typeof body.priority === 'number' ? body.priority : 100,
        dismissible: body.dismissible ?? true,
        start_at: body.start_at ? new Date(body.start_at) : null,
        end_at: body.end_at ? new Date(body.end_at) : null,
        target_kind: body.target_kind ?? 'all',
        target_user_ids: Array.isArray(body.target_user_ids) ? body.target_user_ids : [],
        target_plan_tier: body.target_plan_tier ?? null,
        status: body.status ?? 'draft',
        published_at: isPublished ? new Date() : null,
        created_by: ctx.userId, // from the admin context, NEVER the body
      })
      .returning();
    return NextResponse.json(inserted, { status: 201 });
  } catch (err: unknown) {
    console.error('[admin/announcements POST] create failed:', err);
    if (pgCode(err) === UNDEFINED_TABLE) {
      return NextResponse.json(
        { error: 'announcements table not provisioned', code: 'ANNOUNCEMENTS_TABLE_MISSING' },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(message)) {
      return NextResponse.json({ error: `slug "${body.slug}" already exists` }, { status: 409 });
    }
    if (/foreign key/i.test(message)) {
      return NextResponse.json({ error: 'invalid reference' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
