'use client';

import { useState } from 'react';
import { StoreProvider } from './store-provider';
import { Sidebar } from './components/sidebar';
import { Topbar } from './components/topbar';
import { SectionTabs } from './components/section-tabs';

// Outer chrome: Topbar (64px) → SectionTabs (52px) → grid {Sidebar | main}.
// Layout dimensions match the Claude Design DS bundle so the imported
// store.css applies one-to-one against this structure.
export function StoreShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="ab">
      <StoreProvider>
        <Topbar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
        <SectionTabs />
        <div className="page">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          {children}
        </div>
      </StoreProvider>
    </div>
  );
}
