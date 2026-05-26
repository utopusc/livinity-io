// PUT and DELETE for a single app row. `id` segment maps to apps.slug
// (NOT the uuid primary key) — slug is the externally-stable handle.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth-admin';
import { db } from '@/lib/drizzle';
import { apps } from '@/db/schema';

const VALID_SECTIONS = ['app', 'webapp', 'native', 'ai', 'plugin'] as const;
type Section = (typeof VALID_SECTIONS)[number];

type UpdateBody = Partial<{
  name: string;
  tagline: string;
  description: string;
  category: string;
  section: Section;
  version: string;
  docker_compose: string;
  manifest: unknown;
  icon_url: string;
  featured: boolean;
  verified: boolean;
  sort_order: number | null;
}>;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAdmin(req);
  if (ctx instanceof NextResponse) return ctx;

  const { id } = await params;
  const [row] = await db.select().from(apps).where(eq(apps.slug, id)).limit(1);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(row);
}

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

  if (body.section && !VALID_SECTIONS.includes(body.section)) {
    return NextResponse.json(
      { error: `invalid section "${body.section}"` },
      { status: 400 },
    );
  }

  // Build PATCH update — only set fields explicitly provided.
  const patch: Record<string, unknown> = { updated_at: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.tagline !== undefined) patch.tagline = body.tagline;
  if (body.description !== undefined) patch.description = body.description;
  if (body.category !== undefined) patch.category = body.category;
  if (body.section !== undefined) patch.section = body.section;
  if (body.version !== undefined) patch.version = body.version;
  if (body.docker_compose !== undefined) patch.docker_compose = body.docker_compose;
  if (body.manifest !== undefined) patch.manifest = body.manifest;
  if (body.icon_url !== undefined) patch.icon_url = body.icon_url;
  if (body.featured !== undefined) patch.featured = body.featured;
  if (body.verified !== undefined) patch.verified = body.verified;

  try {
    const [updated] = await db
      .update(apps)
      .set(patch)
      .where(eq(apps.slug, id))
      .returning();
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
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
      .delete(apps)
      .where(eq(apps.slug, id))
      .returning({ slug: apps.slug });
    if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true, slug: deleted.slug });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
