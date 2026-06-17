import Link from 'next/link';
import { getDocsNav, getFeatured } from './_lib/docs-data';

// Always read fresh from Supabase so an admin publish appears immediately.
export const dynamic = 'force-dynamic';

export default async function DocsHome() {
  const [nav, featured] = await Promise.all([getDocsNav(), getFeatured()]);

  if (nav.length === 0) {
    return (
      <main className="docs-home">
        <div className="docs-empty">
          <h2>Documentation is on its way</h2>
          <p>We&apos;re writing the guides. Check back soon.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="docs-home">
      <div className="docs-home-eyebrow">Livinity Documentation</div>
      <h1 className="docs-home-title">Everything you need to run LivOS.</h1>
      <p className="docs-home-sub">
        Install guides, app walkthroughs, and how-tos — straight from the team.
      </p>

      <div className="docs-cat-grid">
        {nav.map((c) => {
          const first = c.articles[0];
          const href = first ? `/docs/${c.slug}/${first.slug}` : '/docs';
          return (
            <Link key={c.id} href={href} className="docs-cat-card">
              <h3>{c.name}</h3>
              <p>{c.description || 'Browse this section.'}</p>
              <span className="docs-cat-card-count">
                {c.articles.length} article{c.articles.length === 1 ? '' : 's'}
              </span>
            </Link>
          );
        })}
      </div>

      {featured.length > 0 && (
        <>
          <div className="docs-home-section-label">Popular</div>
          <div className="docs-featured-list">
            {featured.map((a) => (
              <Link
                key={a.id}
                href={`/docs/${a.category_slug}/${a.slug}`}
                className="docs-featured-item"
              >
                <div>
                  <div className="ttl">{a.title}</div>
                  {a.description && <div className="dsc">{a.description}</div>}
                </div>
                <span className="arrow">→</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
