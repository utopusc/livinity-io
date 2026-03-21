import { NextRequest, NextResponse } from 'next/server';
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
    .from(apps);

  return NextResponse.json(rows);
}
