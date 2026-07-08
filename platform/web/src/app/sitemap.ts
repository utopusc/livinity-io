import type { MetadataRoute } from 'next';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/drizzle';
import { docsArticles, docsCategories } from '@/db/schema';
import { LEGAL_DOCS } from '@/app/legal/_content';

const BASE = 'https://livinity.io';

// ISR hourly so newly published docs appear without a redeploy, without
// paying a DB query on every crawler hit.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/pricing`, changeFrequency: 'monthly', priority: 0.9 },
    // /download is deliberately absent — the desktop-agent page is
    // deprecated (noindex'd) and its binaries were never shipped.
    { url: `${BASE}/docs`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/developers`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/legal`, changeFrequency: 'yearly', priority: 0.3 },
    ...LEGAL_DOCS.map((d) => ({
      url: `${BASE}/legal/${d.slug}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
    // /store is deliberately absent: the Edge middleware admin-gates it and
    // 307s anonymous requests to the sign-in page. apps.livinity.io is also
    // absent — cross-host URLs in a livinity.io sitemap are ignored by Google.
  ];

  // All published docs — same published=true filter as the public docs pages,
  // so drafts can never leak. Fail soft: a DB error returns the static
  // entries instead of failing the sitemap (this also runs at build time).
  try {
    const rows = await db
      .select({
        slug: docsArticles.slug,
        updated_at: docsArticles.updated_at,
        category_slug: docsCategories.slug,
      })
      .from(docsArticles)
      .innerJoin(docsCategories, eq(docsArticles.category_id, docsCategories.id))
      .where(eq(docsArticles.published, true))
      .orderBy(asc(docsArticles.sort_order), asc(docsArticles.title));

    const docEntries: MetadataRoute.Sitemap = rows.map((r) => ({
      url: `${BASE}/docs/${r.category_slug}/${r.slug}`,
      lastModified: new Date(r.updated_at),
      changeFrequency: 'monthly',
      priority: 0.7,
    }));

    return [...staticEntries, ...docEntries];
  } catch {
    return staticEntries;
  }
}
