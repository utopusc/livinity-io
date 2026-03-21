'use client';

import { useState } from 'react';
import { StoreProvider } from './store-provider';
import { Sidebar } from './components/sidebar';
import { Topbar } from './components/topbar';

export function StoreShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="store-layout flex h-screen bg-white">
      <StoreProvider>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </StoreProvider>
    </div>
  );
}
