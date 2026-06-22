'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { DocsSidebar } from './sidebar';
import type { NavCategory } from '../_lib/docs-data';

// Wraps article pages in the 3-column docs-shell with the sidebar, and renders the
// /docs home bare. This lives in app/docs/layout.tsx — which never unmounts across
// ANY /docs navigation — so the SAME <DocsSidebar> instance stays mounted when you
// move between articles in DIFFERENT categories, preserving its overflow-y scroll.
// (The earlier app/docs/[category]/layout.tsx remounted whenever the [category] param
// changed, which reset the sidebar scroll on every cross-category jump.)
export function DocsShell({ nav, children }: { nav: NavCategory[]; children: ReactNode }) {
  const pathname = usePathname();
  // Article routes are /docs/<category>/<slug> (3+ segments); /docs (home) is bare.
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const isArticle = segments[0] === 'docs' && segments.length >= 3;

  if (!isArticle) return <>{children}</>;

  return (
    <div className="docs-shell">
      <DocsSidebar nav={nav} />
      {children}
    </div>
  );
}
