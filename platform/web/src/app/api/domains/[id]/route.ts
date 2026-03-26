import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { db } from '@/lib/drizzle';
import { customDomains } from '@/db/schema';

async function getUser(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return getSession(token);
}

/** GET /api/domains/[id] -- Get a single domain by ID */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const [domain] = await db
    .select()
    .from(customDomains)
    .where(and(eq(customDomains.id, id), eq(customDomains.user_id, user.userId)))
    .limit(1);

  if (!domain) {
    return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
  }

  return NextResponse.json({ domain });
}

/** DELETE /api/domains/[id] -- Remove a domain */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const deleted = await db
    .delete(customDomains)
    .where(and(eq(customDomains.id, id), eq(customDomains.user_id, user.userId)))
    .returning({ id: customDomains.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, deleted: deleted[0].id });
}
