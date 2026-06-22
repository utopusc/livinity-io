import type { ReactNode } from 'react';
import { getDocsNav } from '../_lib/docs-data';
import { DocsSidebar } from '../_components/sidebar';

// The sidebar lives HERE (the [category] layout), not inside each article page.
// App Router reuses a shared layout across navigations within its segment, so the
// sidebar stays mounted when you click between articles — its own overflow-y
// scroll position (and its filter box) is preserved instead of re-mounting and
// snapping back to the top (the reported bug). The /docs home page is outside this
// segment, so it keeps its sidebar-less landing layout.
//
// force-dynamic mirrors the pages so a fresh admin publish appears without a redeploy.
export const dynamic = 'force-dynamic';

export default async function DocsCategoryLayout({ children }: { children: ReactNode }) {
  const nav = await getDocsNav();

  return (
    <div className="docs-shell">
      <DocsSidebar nav={nav} />
      {children}
    </div>
  );
}
