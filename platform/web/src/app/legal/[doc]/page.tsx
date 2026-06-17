import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { LEGAL_DOCS, getLegalDoc } from '../_content';
import { DocsMarkdown } from '../../docs/_components/markdown';

// Static set of legal documents — pre-render each at build time.
export function generateStaticParams() {
  return LEGAL_DOCS.map((d) => ({ doc: d.slug }));
}

export const dynamicParams = false;

type Params = { params: Promise<{ doc: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { doc } = await params;
  const d = getLegalDoc(doc);
  if (!d) return { title: 'Not found — Livinity Legal' };
  return { title: `${d.title} — Livinity`, description: d.summary };
}

export default async function LegalDocPage({ params }: Params) {
  const { doc } = await params;
  const d = getLegalDoc(doc);
  if (!d) notFound();

  return (
    <main className="docs-content" style={{ maxWidth: 880, margin: '0 auto', width: '100%' }}>
      <article className="docs-article">
        <div className="docs-breadcrumb">
          <Link href="/legal">Legal</Link>
          <span>/</span>
          <span>{d.title}</span>
        </div>

        <h1 className="docs-article-title">{d.title}</h1>
        <div className="docs-article-meta">
          Last updated {d.updated} · Governing law: State of Delaware, USA
        </div>

        <DocsMarkdown content={d.body} />

        <div className="docs-article-foot">
          Questions about this policy? Contact{' '}
          <a
            href="mailto:everything@livinity.io"
            className="docs-side-link"
            style={{ display: 'inline', padding: 0 }}
          >
            everything@livinity.io
          </a>
          .
        </div>
      </article>
    </main>
  );
}
