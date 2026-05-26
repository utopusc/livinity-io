import { NextRequest, NextResponse } from 'next/server';
import { asc, eq, sql } from 'drizzle-orm';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { db } from '@/lib/drizzle';
import { apps } from '@/db/schema';

// Phase 148 — section enum values valid for the `?section=` filter.
const VALID_SECTIONS = ['app', 'webapp', 'native', 'ai', 'plugin'] as const;
type Section = (typeof VALID_SECTIONS)[number];

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error);
  }

  const sectionParam = req.nextUrl.searchParams.get('section');
  if (sectionParam !== null && !VALID_SECTIONS.includes(sectionParam as Section)) {
    return NextResponse.json(
      {
        error: `invalid section "${sectionParam}" — must be one of ${VALID_SECTIONS.join(', ')}`,
      },
      { status: 400 },
    );
  }

  const builder = db
    .select({
      id: apps.slug,
      name: apps.name,
      tagline: apps.tagline,
      category: apps.category,
      section: apps.section,
      icon_url: apps.icon_url,
      featured: apps.featured,
      verified: apps.verified,
      version: apps.version,
      // CARRY-P214-STORE-SEARCH — sort dropdown reads created_at for the
      // "newly added" option. Cheap to ship in the existing list payload.
      created_at: apps.created_at,
    })
    .from(apps);

  const filtered = sectionParam
    ? builder.where(eq(apps.section, sectionParam as Section))
    : builder;

  const rows = await filtered.orderBy(
    asc(sql`COALESCE(sort_order, 100)`),
    asc(apps.name),
  );

  return NextResponse.json(rows);
}
