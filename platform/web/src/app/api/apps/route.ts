import { NextRequest, NextResponse } from 'next/server';
import { asc, sql } from 'drizzle-orm';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { db } from '@/lib/drizzle';
import { apps } from '@/db/schema';

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  const rows = await db
    .select({
      id: apps.slug,
      name: apps.name,
      tagline: apps.tagline,
      category: apps.category,
      icon_url: apps.icon_url,
      featured: apps.featured,
      version: apps.version,
    })
    .from(apps)
    .orderBy(asc(sql`COALESCE(sort_order, 100)`), asc(apps.name));

  return NextResponse.json(rows);
}
