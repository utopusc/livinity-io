import Link from 'next/link';
import { DocsSearch } from './search';
import type { SearchDoc } from '../_lib/docs-data';

// NOTE: the live homepage at "/" is the static public/index.html SPA (not the
// Next app/page.tsx), so links to the homepage use a plain <a> for a full
// navigation — a Next <Link> would client-route to the shadowed page.tsx.
export function DocsNav({ searchIndex }: { searchIndex: SearchDoc[] }) {
  return (
    <nav className="docs-nav">
      <div className="docs-nav-inner">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="docs-brand">
          <span className="docs-brand-mark" aria-hidden="true" />
          <span>Livinity</span>
        </a>
        <div className="docs-nav-links">
          <DocsSearch index={searchIndex} />
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/#apps">App Library</a>
          <Link href="/pricing">Pricing</Link>
          <Link href="/docs" className="is-active">
            Docs
          </Link>
          <Link href="/login" className="docs-nav-cta">
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  );
}
