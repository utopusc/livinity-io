import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { DocsNav } from './_components/docs-nav';
import { DocsShell } from './_components/docs-shell';
import { getSearchIndex, getDocsNav } from './_lib/docs-data';
import './docs.css';

// Read the search index fresh per request so an admin publish shows up in ⌘K
// without a redeploy (mirrors the force-dynamic docs pages).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Docs — Livinity',
  description:
    'Install guides, app walkthroughs, and how-tos for LivOS — your self-hosted AI server, accessible anywhere via livinity.io.',
  alternates: { canonical: '/docs' },
};

export default async function DocsLayout({ children }: { children: ReactNode }) {
  const [searchIndex, nav] = await Promise.all([getSearchIndex(), getDocsNav()]);

  return (
    <div className="docs-root">
      <DocsNav searchIndex={searchIndex} />
      <DocsShell nav={nav}>{children}</DocsShell>
      <footer className="docs-footer">
        <div className="docs-footer-inner">
          <span>© Livinity</span>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">livinity.io</a>
          <Link href="/docs">Docs</Link>
          <Link href="/legal">Legal</Link>
          <span style={{ marginLeft: 'auto' }}>
            Your personal AI server, accessible anywhere.
          </span>
        </div>
      </footer>
    </div>
  );
}
