import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { DocsNav } from './_components/docs-nav';
import './docs.css';

export const metadata: Metadata = {
  title: 'Docs — Livinity',
  description:
    'Install guides, app walkthroughs, and how-tos for LivOS — your self-hosted AI server, accessible anywhere via livinity.io.',
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-root">
      <DocsNav />
      {children}
      <footer className="docs-footer">
        <div className="docs-footer-inner">
          <span>© Livinity</span>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">livinity.io</a>
          <Link href="/docs">Docs</Link>
          <span style={{ marginLeft: 'auto' }}>
            Your personal AI server, accessible anywhere.
          </span>
        </div>
      </footer>
    </div>
  );
}
