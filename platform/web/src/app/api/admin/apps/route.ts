// Admin API for apps CRUD. Operator-only (api-key gated, same as /api/apps).
// Wraps Drizzle with permissive schema — the admin trusts itself with the
// manifest JSON shape. Per-section validation happens client-side (and at
// install handler time on livinityd, which re-parses anyway).

import { NextRequest, NextResponse } from 'next/server';
import { asc, sql } from 'drizzle-orm';
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth';
import { db } from '@/lib/drizzle';
import { apps } from '@/db/schema';

const VALID_SECTIONS = ['app', 'webapp', 'native', 'ai', 'plugin'] as const;
type Section = (typeof VALID_SECTIONS)[number];

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) return unauthorizedResponse(auth.error);

  const rows = await db
    .select()
    .from(apps)
    .orderBy(asc(apps.section), asc(sql`COALESCE(sort_order, 100)`), asc(apps.name));

  return NextResponse.json(rows);
}

type CreateBody = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  section: Section;
  version: string;
  docker_compose?: string;
  manifest: unknown;
  icon_url: string;
  featured?: boolean;
  verified?: boolean;
  sort_order?: number | null;
};

export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.valid) return unauthorizedResponse(auth.error);

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.slug || !body.name || !body.section) {
    return NextResponse.json(
      { error: 'slug, name, section are required' },
      { status: 400 },
    );
  }

  if (!VALID_SECTIONS.includes(body.section)) {
    return NextResponse.json(
      { error: `invalid section "${body.section}"` },
      { status: 400 },
    );
  }

  // The apps.docker_compose column is NOT NULL — non-app sections substitute
  // a stub string so the row inserts cleanly. Matches the seed-time pattern
  // used in P150/151/152/154 migrations.
  const dockerCompose =
    body.section === 'app'
      ? body.docker_compose || ''
      : body.docker_compose || `# ${body.section} — no compose`;

  if (body.section === 'app' && !body.docker_compose) {
    return NextResponse.json(
      { error: 'docker_compose required for section=app' },
      { status: 400 },
    );
  }

  try {
    const [inserted] = await db
      .insert(apps)
      .values({
        slug: body.slug,
        name: body.name,
        tagline: body.tagline ?? '',
        description: body.description ?? '',
        category: body.category ?? 'productivity',
        section: body.section,
        version: body.version ?? '1.0.0',
        docker_compose: dockerCompose,
        manifest: body.manifest ?? {},
        icon_url: body.icon_url ?? '',
        featured: body.featured ?? false,
        verified: body.verified ?? false,
      })
      .returning();
    return NextResponse.json(inserted, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('apps_slug_unique')) {
      return NextResponse.json(
        { error: `slug "${body.slug}" already exists` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
