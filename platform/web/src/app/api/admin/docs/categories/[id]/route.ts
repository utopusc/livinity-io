// PUT / DELETE a single docs category. The `id` segment is the category UUID.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth-admin';
import { db } from '@/lib/drizzle';
import { docsCategories } from '@/db/schema';

type UpdateBody = Partial<{
  name: string;
  description: string;
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
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;

  try {
    const [updated] = await db
      .update(docsCategories)
      .set(patch)
      .where(eq(docsCategories.id, id))
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
      .delete(docsCategories)
      .where(eq(docsCategories.id, id))
      .returning({ id: docsCategories.id });
    if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true, id: deleted.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // FK ON DELETE RESTRICT — category still has articles.
    if (/foreign key|violates/i.test(message)) {
      return NextResponse.json(
        { error: 'Category still has articles — move or delete them first.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
