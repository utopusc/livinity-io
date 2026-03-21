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

  const rows = await db
    .select({ docker_compose: apps.docker_compose })
    .from(apps)
    .where(eq(apps.id, id))
    .limit(1);

  if (rows.length === 0) {
    return NextResponse.json({ error: 'App not found' }, { status: 404 });
  }

  return new NextResponse(rows[0].docker_compose, {
    status: 200,
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
    },
  });
}
