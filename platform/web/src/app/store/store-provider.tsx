'use client';

import { createContext, useContext, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { AppSummary, Section, StoreContextValue, StoreSort } from './types';
import { SECTIONS } from './types';
import { usePostMessage } from './hooks/use-post-message';

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

const VALID_SECTIONS: readonly Section[] = ['app', 'webapp', 'native', 'ai', 'plugin'];

function StoreProviderInner({
  children,
  initialApps,
}: {
  children: React.ReactNode;
  initialApps?: AppSummary[];
}) {
  const searchParams = useSearchParams();
  // Token rides in the URL on the iframe's first load, but Next.js client-side
  // navigation drops the query param. The middleware persists it as the
  // `liv_store_token` cookie on the first token-bearing request, so fall back to
  // that cookie when the URL no longer carries it (keeps /api/apps X-Api-Key calls
  // working after navigating into an app detail page). See middleware.ts.
  const token =
    searchParams.get('token') ??
    (typeof document !== 'undefined'
      ? (() => {
          const m = document.cookie.match(/(?:^|;\s*)liv_store_token=([^;]+)/);
          return m ? decodeURIComponent(m[1]) : null;
        })()
      : null);
  const instanceName = searchParams.get('instance');

  // Security (feedback 42ed3227): the token rides in the iframe's first-load URL
  // (?token=liv_k_…) to bootstrap the `liv_store_token` cookie. But that means
  // the PAGE's own URL contains the key — so hovering ANY relative link, even a
  // bare `href="#"` (the profile avatar), makes Chrome show the full current URL
  // *including the token* in the status bar. Removing the token from link hrefs
  // is not enough while it lingers in the address bar. Once the cookie is set
  // (middleware did this on the same first response), strip `token` from the URL
  // via replaceState so no hover — and no browser-history entry — ever exposes
  // it. Auth continues via the cookie + the in-memory `token` captured above.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('token')) {
      url.searchParams.delete('token');
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, []);
  // Section hint via URL — set by SectionTabs when navigating from a
  // detail page back to /store. Only read once at mount; subsequent
  // changes happen through setSelectedSection.
  const sectionHint = searchParams.get('section');
  // Phase 290 R3 REQ8 / M3 — deep-link guard. The hint must be BOTH a valid
  // `Section` (server still round-trips it) AND a section that currently has a
  // visible tab in SECTIONS. A removed-but-still-valid section like 'webapp'
  // (?section=webapp, an orphaned link from before the tab was removed) would
  // otherwise render an empty strip / placeholder, so fall back to 'app'.
  const VISIBLE_SECTIONS = SECTIONS.map((s) => s.key);
  // Default to the promoted 1st section (now 'native', the generic desktop-app
  // store). A removed-but-still-valid hint like ?section=webapp falls back here.
  const initialSection: Section =
    VALID_SECTIONS.includes(sectionHint as Section) &&
    VISIBLE_SECTIONS.includes(sectionHint as Section)
      ? (sectionHint as Section)
      : 'native';

  // Phase 289 WS-B — seed from the RSC server-prefetch so the real catalog
  // paints on first render. When seeded, start with loading=false so a seeded
  // mount never flashes the "Loading apps…"/"Soon" empty state. The client
  // useEffect below still runs as a refresh/fallback.
  const seeded = (initialApps?.length ?? 0) > 0;
  const [apps, setApps] = useState<AppSummary[]>(initialApps ?? []);
  const [loading, setLoading] = useState(seeded ? false : true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<Section>(initialSection);
  const [sortBy, setSortBy] = useState<StoreSort>('curated');
  const bridge = usePostMessage();

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Connect your LivOS instance to browse apps');
      return;
    }
    // Phase 289 WS-B — only show the loading screen when we did NOT seed from
    // the server prefetch. A seeded mount already shows real apps; this fetch
    // becomes a silent background refresh (no loading flash).
    if (apps.length === 0) setLoading(true);
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
        selectedSection,
        setSelectedSection,
        sortBy,
        setSortBy,
        token,
        instanceName,
        // postMessage bridge
        isEmbedded: bridge.isEmbedded,
        installedApps: bridge.installedApps,
        sendInstall: bridge.sendInstall,
        sendUninstall: bridge.sendUninstall,
        sendOpen: bridge.sendOpen,
        getAppStatus: bridge.getAppStatus,
        // Phase 287 — per-app provisioning flag (subdomain DNS not yet ready).
        getAppProvisioning: bridge.getAppProvisioning,
        // Progress & credentials (Phase 22)
        installProgress: bridge.installProgress,
        getInstallProgress: bridge.getInstallProgress,
        appCredentials: bridge.appCredentials,
        clearCredentials: bridge.clearCredentials,
        // Subdomain management
        getAppSubdomain: bridge.getAppSubdomain,
        getAppDefaultCreds: bridge.getAppDefaultCreds,
        sendUpdateSubdomain: bridge.sendUpdateSubdomain,
        // Custom URL → dock (Phase 151-B)
        sendInstallCustomWebapp: bridge.sendInstallCustomWebapp,
        // Instance info
        instanceInfo: bridge.instanceInfo,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function StoreProvider({
  children,
  initialApps,
}: {
  children: React.ReactNode;
  initialApps?: AppSummary[];
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-zinc-400">
          Loading store...
        </div>
      }
    >
      <StoreProviderInner initialApps={initialApps}>{children}</StoreProviderInner>
    </Suspense>
  );
}
