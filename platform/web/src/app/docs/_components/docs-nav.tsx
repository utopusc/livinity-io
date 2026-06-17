import Link from 'next/link';

export function DocsNav() {
  return (
    <nav className="docs-nav">
      <div className="docs-nav-inner">
        <Link href="/docs" className="docs-brand">
          <span className="docs-brand-mark" aria-hidden="true" />
          <span>Livinity</span>
          <span className="docs-brand-tag">Docs</span>
        </Link>
        <div className="docs-nav-links">
          <Link href="/">Home</Link>
          <Link href="/docs" className="is-active">
            Docs
          </Link>
          <Link href="/download">Download</Link>
          <Link href="/login" className="docs-nav-cta">
            Sign in
          </Link>
        </div>
      </div>
    </nav>
  );
}
