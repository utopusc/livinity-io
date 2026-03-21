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
    .selectDistinct({ category: apps.category })
    .from(apps);

  const categories = rows.map(r => r.category).sort();

  return NextResponse.json(categories);
}
