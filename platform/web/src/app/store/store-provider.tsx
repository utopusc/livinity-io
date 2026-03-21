'use client';

import { createContext, useContext, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { AppSummary, StoreContextValue } from './types';
import { usePostMessage } from './hooks/use-post-message';

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

function StoreProviderInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const instanceName = searchParams.get('instance');

  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const bridge = usePostMessage();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Connect your LivOS instance to browse apps');
      return;
    }
    setLoading(true);
    fetch('/api/apps', { headers: { 'X-Api-Key': token } })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load apps');
        return res.json();
      })
      .then((data: AppSummary[]) => {
        setApps(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <StoreContext.Provider
      value={{
        apps,
        loading,
        error,
        searchQuery,
        setSearchQuery,
        selectedCategory,
        setSelectedCategory,
        token,
        instanceName,
        // postMessage bridge
        isEmbedded: bridge.isEmbedded,
        installedApps: bridge.installedApps,
        sendInstall: bridge.sendInstall,
        sendUninstall: bridge.sendUninstall,
        sendOpen: bridge.sendOpen,
        getAppStatus: bridge.getAppStatus,
        // Progress & credentials (Phase 22)
        installProgress: bridge.installProgress,
        getInstallProgress: bridge.getInstallProgress,
        appCredentials: bridge.appCredentials,
        clearCredentials: bridge.clearCredentials,
        // Subdomain management
        getAppSubdomain: bridge.getAppSubdomain,
        sendUpdateSubdomain: bridge.sendUpdateSubdomain,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-zinc-400">
          Loading store...
        </div>
      }
    >
      <StoreProviderInner>{children}</StoreProviderInner>
    </Suspense>
  );
}
