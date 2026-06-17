import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
// Reuse the shipped docs visual system (brand tokens, nav, prose, footer).
import '../docs/docs.css';

export const metadata: Metadata = {
  title: 'Legal — Livinity',
  description:
    'Terms of Service, Privacy Policy, Acceptable Use Policy, Cookie Policy, and Refund & Cancellation Policy for Livinity.',
};

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="docs-root">
      <nav className="docs-nav">
        <div className="docs-nav-inner">
          {/* The live homepage at "/" is the static SPA — a plain <a> does a full nav. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="docs-brand">
            <span className="docs-brand-mark" aria-hidden="true" />
            <span>Livinity</span>
          </a>
          <div className="docs-nav-links">
            <Link href="/docs">Docs</Link>
            <Link href="/legal" className="is-active">
              Legal
            </Link>
            <Link href="/login" className="docs-nav-cta">
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      {children}

      <footer className="docs-footer">
        <div className="docs-footer-inner">
          <span>© Livinity</span>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">livinity.io</a>
          <Link href="/docs">Docs</Link>
          <Link href="/legal">Legal</Link>
          <span style={{ marginLeft: 'auto' }}>Your personal AI server, accessible anywhere.</span>
        </div>
      </footer>
    </div>
  );
}
