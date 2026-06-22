import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getArticle } from '../../_lib/docs-data';
import { extractToc } from '../../_lib/toc';
import { isAdminViewer } from '../../_lib/preview-auth';
import { DocsToc } from '../../_components/toc';
import { DocsMarkdown } from '../../_components/markdown';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ category: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { category, slug } = await params;
  const admin = await isAdminViewer();
  const data = await getArticle(category, slug, { includeUnpublished: admin });
  if (!data) return { title: 'Not found — Livinity Docs' };
  return {
    title: `${data.article.title} — Livinity Docs`,
    description: data.article.description,
    openGraph: {
      title: data.article.title,
      description: data.article.description,
      images: data.article.cover_url ? [data.article.cover_url] : undefined,
    },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { category, slug } = await params;
  const admin = await isAdminViewer();
  const data = await getArticle(category, slug, { includeUnpublished: admin });
  if (!data) notFound();

  const { article, category: cat, published } = data;
  const toc = extractToc(article.content);

  return (
    <>
      <main className="docs-content">
        <article className="docs-article">
          {!published && (
            <div className="docs-draft-banner">
              <strong>Draft</strong>
              <span>Not published — only admins can see this preview.</span>
            </div>
          )}

          <div className="docs-breadcrumb">
            <Link href="/docs">Docs</Link>
            <span>/</span>
            <span>{cat.name}</span>
          </div>

          <h1 className="docs-article-title">{article.title}</h1>
          {article.description && <p className="docs-article-desc">{article.description}</p>}
          <div className="docs-article-meta">
            Updated{' '}
            {new Date(article.updated_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>

          {article.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="docs-cover" src={article.cover_url} alt={article.title} />
          )}

          <DocsMarkdown content={article.content} />

          <div className="docs-article-foot">
            Need a hand? Reach the team at{' '}
            <a href="mailto:hello@livinity.io" className="docs-side-link" style={{ display: 'inline', padding: 0 }}>
              hello@livinity.io
            </a>
            .
          </div>
        </article>
      </main>

      <DocsToc items={toc} />
    </>
  );
}
