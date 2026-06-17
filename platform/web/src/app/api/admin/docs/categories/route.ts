// Admin API for docs categories. Operator-only (requireAdmin).

import { NextRequest, NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth-admin';
import { db } from '@/lib/drizzle';
import { docsCategories } from '@/db/schema';

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const rows = await db
    .select()
    .from(docsCategories)
    .orderBy(asc(docsCategories.sort_order), asc(docsCategories.name));

  return NextResponse.json(rows);
}

type CreateBody = {
  slug: string;
  name: string;
  description?: string;
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

  if (!body.slug || !body.name) {
    return NextResponse.json({ error: 'slug and name are required' }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(body.slug)) {
    return NextResponse.json(
      { error: 'slug must be lowercase letters, digits and hyphens' },
      { status: 400 },
    );
  }

  try {
    const [inserted] = await db
      .insert(docsCategories)
      .values({
        slug: body.slug,
        name: body.name,
        description: body.description ?? '',
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
