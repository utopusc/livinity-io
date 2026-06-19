'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { StoreProvider } from './store-provider';
import { Sidebar } from './components/sidebar';
import { Topbar } from './components/topbar';
import { SectionTabs } from './components/section-tabs';
import type { AppSummary } from './types';

// Outer chrome: Topbar (64px) → SectionTabs (52px) → grid {Sidebar | main}.
// On the /store list page, sidebar is visible. On /store/[id] detail
// pages, the sidebar collapses and main spans full width (matches the
// Claude Design `.page.no-sidebar` mode).
export function StoreShell({
  children,
  // Phase 289 WS-B — server-prefetched catalog from the RSC layout. Receiving
  // server-fetched data as a prop in a 'use client' component is fine; we just
  // hand it straight to StoreProvider to seed first-paint state.
  initialApps,
}: {
  children: React.ReactNode;
  initialApps?: AppSummary[];
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const isListPage = pathname === '/store';

  return (
    <div className="ab">
      <StoreProvider initialApps={initialApps}>
        <Topbar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
        <SectionTabs />
        <div className={isListPage ? 'page' : 'page no-sidebar'}>
          {isListPage && (
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          )}
          {children}
        </div>
      </StoreProvider>
    </div>
  );
}
