// GET / PUT / DELETE a single docs article. The `id` segment maps to
// docs_articles.slug (the externally-stable handle), mirroring /api/admin/apps/[id].

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth-admin';
import { db } from '@/lib/drizzle';
import { docsArticles } from '@/db/schema';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const [row] = await db
    .select()
    .from(docsArticles)
    .where(eq(docsArticles.slug, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(row);
}

type UpdateBody = Partial<{
  title: string;
  description: string;
  category_id: string;
  content: string;
  cover_url: string | null;
  published: boolean;
  featured: boolean;
  sort_order: number;
}>;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.category_id !== undefined) patch.category_id = body.category_id;
  if (body.content !== undefined) patch.content = body.content;
  if (body.cover_url !== undefined) patch.cover_url = body.cover_url;
  if (body.published !== undefined) patch.published = body.published;
  if (body.featured !== undefined) patch.featured = body.featured;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;

  try {
    const [updated] = await db
      .update(docsArticles)
      .set(patch)
      .where(eq(docsArticles.slug, id))
      .returning();
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (/foreign key|category_id/i.test(message)) {
      return NextResponse.json({ error: 'invalid category' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  try {
    const [deleted] = await db
      .delete(docsArticles)
      .where(eq(docsArticles.slug, id))
      .returning({ slug: docsArticles.slug });
    if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true, slug: deleted.slug });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
