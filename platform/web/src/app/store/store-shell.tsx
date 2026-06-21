'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { StoreProvider, useStore } from './store-provider';
import { Sidebar } from './components/sidebar';
import { Topbar } from './components/topbar';
import { SectionTabs } from './components/section-tabs';
import type { AppSummary } from './types';

// Outer chrome: Topbar (64px) → SectionTabs (52px) → grid {Sidebar | main}.
// On the /store list page, the curated-catalog sidebar is visible. On
// /store/[id] detail pages — AND on the Native section, which renders the
// self-contained generic store with its OWN category chips — the sidebar
// collapses and main spans full width (`.page.no-sidebar`).
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
  return (
    <div className="ab">
      <StoreProvider initialApps={initialApps}>
        <StoreShellInner>{children}</StoreShellInner>
      </StoreProvider>
    </div>
  );
}

// Inner shell — lives INSIDE StoreProvider so it can read `selectedSection`
// (the curated sidebar is hidden for the self-contained Native store).
function StoreShellInner({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { selectedSection } = useStore();
  const isListPage = pathname === '/store';
  // Native renders the generic store (its own chips + search), so the curated
  // Categories sidebar is irrelevant there → hide it and let main span full.
  const showSidebar = isListPage && selectedSection !== 'native';

  return (
    <>
      <Topbar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
      <SectionTabs />
      <div className={showSidebar ? 'page' : 'page no-sidebar'}>
        {showSidebar && (
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        )}
        {children}
      </div>
    </>
  );
}
