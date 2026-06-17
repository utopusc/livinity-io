// Server-side data access for the PUBLIC docs site. Reads go straight through
// Drizzle `db` in RSC (no auth — published docs are public). Writes happen
// only in /api/admin/docs/* (requireAdmin gated).

import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/drizzle';
import { docsArticles, docsCategories } from '@/db/schema';
import { extractToc } from './toc';

export type NavArticle = { slug: string; title: string };
export type NavCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  articles: NavArticle[];
};

export type Article = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category_id: string;
  content: string;
  cover_url: string | null;
  featured: boolean;
  updated_at: string;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string;
};

// One published article, flattened for the client-side ⌘K search palette.
// `headings` are precomputed (text + slug id) so a heading match can deep-link
// straight to the on-page anchor. `content` is capped so the index stays small.
export type SearchDoc = {
  slug: string;
  title: string;
  description: string;
  category_slug: string;
  category_name: string;
  content: string;
  headings: { text: string; id: string }[];
};

const SEARCH_CONTENT_CAP = 6000;

// Full search index over published articles. Sent to the client (via the docs
// layout → nav) where filtering/ranking happens instantly with no round-trip.
export async function getSearchIndex(): Promise<SearchDoc[]> {
  const rows = await db
    .select({
      slug: docsArticles.slug,
      title: docsArticles.title,
      description: docsArticles.description,
      content: docsArticles.content,
      sort_order: docsArticles.sort_order,
      category_slug: docsCategories.slug,
      category_name: docsCategories.name,
    })
    .from(docsArticles)
    .innerJoin(docsCategories, eq(docsArticles.category_id, docsCategories.id))
    .where(eq(docsArticles.published, true))
    .orderBy(asc(docsArticles.sort_order), asc(docsArticles.title));

  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    description: r.description,
    category_slug: r.category_slug,
    category_name: r.category_name,
    content:
      r.content.length > SEARCH_CONTENT_CAP
        ? r.content.slice(0, SEARCH_CONTENT_CAP)
        : r.content,
    headings: extractToc(r.content).map((h) => ({ text: h.text, id: h.id })),
  }));
}

// Sidebar / index navigation: every category that has ≥1 published article,
// with its published articles in sort order.
export async function getDocsNav(): Promise<NavCategory[]> {
  const [cats, arts] = await Promise.all([
    db
      .select()
      .from(docsCategories)
      .orderBy(asc(docsCategories.sort_order), asc(docsCategories.name)),
    db
      .select({
        slug: docsArticles.slug,
        title: docsArticles.title,
        category_id: docsArticles.category_id,
        sort_order: docsArticles.sort_order,
      })
      .from(docsArticles)
      .where(eq(docsArticles.published, true))
      .orderBy(asc(docsArticles.sort_order), asc(docsArticles.title)),
  ]);

  const byCat = new Map<string, NavArticle[]>();
  for (const a of arts) {
    const list = byCat.get(a.category_id) ?? [];
    list.push({ slug: a.slug, title: a.title });
    byCat.set(a.category_id, list);
  }

  return cats
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      articles: byCat.get(c.id) ?? [],
    }))
    .filter((c) => c.articles.length > 0);
}

// Featured published articles for the docs home hero.
export async function getFeatured(limit = 6): Promise<(Article & { category_slug: string })[]> {
  const rows = await db
    .select({
      id: docsArticles.id,
      slug: docsArticles.slug,
      title: docsArticles.title,
      description: docsArticles.description,
      category_id: docsArticles.category_id,
      content: docsArticles.content,
      cover_url: docsArticles.cover_url,
      featured: docsArticles.featured,
      updated_at: docsArticles.updated_at,
      category_slug: docsCategories.slug,
    })
    .from(docsArticles)
    .innerJoin(docsCategories, eq(docsArticles.category_id, docsCategories.id))
    .where(eq(docsArticles.published, true))
    .orderBy(asc(docsArticles.sort_order), asc(docsArticles.title))
    .limit(limit);

  // Prefer featured; if none are flagged, the first few published act as featured.
  const flagged = rows.filter((r) => r.featured);
  const chosen = (flagged.length > 0 ? flagged : rows).slice(0, limit);
  return chosen.map((r) => ({ ...r, updated_at: String(r.updated_at) }));
}

// A single article + its category, addressed by category slug + article slug.
// By default only published articles resolve; pass `includeUnpublished` (set by
// the page for admin viewers) to also resolve drafts for preview. The returned
// `published` flag lets the page render a "Draft" banner.
export async function getArticle(
  categorySlug: string,
  articleSlug: string,
  opts: { includeUnpublished?: boolean } = {},
): Promise<{ article: Article; category: Category; published: boolean } | null> {
  const [cat] = await db
    .select()
    .from(docsCategories)
    .where(eq(docsCategories.slug, categorySlug))
    .limit(1);
  if (!cat) return null;

  const [a] = await db
    .select()
    .from(docsArticles)
    .where(eq(docsArticles.slug, articleSlug))
    .limit(1);
  if (!a || a.category_id !== cat.id) return null;
  if (!a.published && !opts.includeUnpublished) return null;

  return {
    category: { id: cat.id, slug: cat.slug, name: cat.name, description: cat.description },
    published: a.published,
    article: {
      id: a.id,
      slug: a.slug,
      title: a.title,
      description: a.description,
      category_id: a.category_id,
      content: a.content,
      cover_url: a.cover_url,
      featured: a.featured,
      updated_at: String(a.updated_at),
    },
  };
}
