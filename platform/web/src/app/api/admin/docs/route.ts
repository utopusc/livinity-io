// Admin API for docs articles CRUD. Operator-only (requireAdmin: session
// cookie OR x-api-key). Mirrors /api/admin/apps. Public reads happen in RSC
// via `db` directly (see src/app/docs), so there is no public articles route.

import { NextRequest, NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth-admin';
import { db } from '@/lib/drizzle';
import { docsArticles } from '@/db/schema';

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const rows = await db
    .select()
    .from(docsArticles)
    .orderBy(asc(docsArticles.sort_order), asc(docsArticles.title));

  return NextResponse.json(rows);
}

type CreateBody = {
  slug: string;
  title: string;
  description?: string;
  category_id: string;
  content?: string;
  cover_url?: string | null;
  published?: boolean;
  featured?: boolean;
  sort_order?: number;
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

  if (!body.slug || !body.title || !body.category_id) {
    return NextResponse.json(
      { error: 'slug, title, category_id are required' },
      { status: 400 },
    );
  }
  if (!/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, digits and hyphens' },
      { status: 400 },
    );
  }

  try {
    const [inserted] = await db
      .insert(docsArticles)
      .values({
        slug: body.slug,
        title: body.title,
        description: body.description ?? '',
        category_id: body.category_id,
        content: body.content ?? '',
        cover_url: body.cover_url ?? null,
        published: body.published ?? false,
        featured: body.featured ?? false,
        sort_order: body.sort_order ?? 100,
      })
      .returning();
    return NextResponse.json(inserted, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (/duplicate key|unique/i.test(message)) {
      return NextResponse.json(
        { error: `slug "${body.slug}" already exists` },
        { status: 409 },
      );
    }
    if (/foreign key|category_id/i.test(message)) {
      return NextResponse.json({ error: 'invalid category' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
