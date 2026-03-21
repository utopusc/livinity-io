import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { db } from '@/lib/drizzle';
import { apps } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  const { id } = await params;

  // Look up by slug first (primary identifier for LivOS), fallback to UUID
  let rows = await db.select().from(apps).where(eq(apps.slug, id)).limit(1);
  if (rows.length === 0) {
    rows = await db.select().from(apps).where(eq(apps.id, id)).limit(1);
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  // Return slug as id for LivOS compatibility
  const app = rows[0];
  return NextResponse.json({ ...app, id: app.slug });
}
