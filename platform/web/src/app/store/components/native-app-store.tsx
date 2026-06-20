'use client';

// Generic desktop-app store for the "Native" section. Browses a large
// upstream desktop-app catalog (categories + pagination + full-text search)
// and installs onto the LivOS box via the existing postMessage bridge.
//
// The install postMessage carries `section:"native"` + a
// `manifest.installMethod:"flathub"` so the already-shipped LivOS desktop
// bridge (v44.58) routes it to apps.native.installFlathub. Status round-trips
// through the SAME AppStatus map keyed on the app id (the package ref), so the
// per-card Installing/Installed/Open state reuses getAppStatus(app.appId).
//
// NOTE (operator rule): NO upstream brand names are surfaced to the user
// anywhere in this UI — it presents as a plain, generic app store.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store-provider';
import { AppIcon } from './app-icon';
import { Icon } from './icons';

interface NativeApp {
  appId: string;
  name: string;
  summary: string;
  iconUrl: string | null;
}

interface BrowseResult {
  apps: NativeApp[];
  hasMore: boolean;
}

const ALL = '__all__';

export function NativeAppStore() {
  const { isEmbedded, getAppStatus, getInstallProgress, sendInstall, sendOpen } = useStore();

  const [categories, setCategories] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [apps, setApps] = useState<NativeApp[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true); // first page / param change
  const [loadingMore, setLoadingMore] = useState(false); // appending pages
  const [error, setError] = useState<string | null>(null);

  // Guards out-of-order async responses (param changes fire new fetches while
  // older ones may still be in flight). Only the latest request id may commit.
  const reqIdRef = useRef(0);

  // Load the category chips once.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/flathub/categories')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => {
        if (!cancelled && Array.isArray(data)) setCategories(data);
      })
      .catch(() => {
        /* chips are optional — the grid still works without them */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Build the endpoint for a given page based on current search/category state.
  const endpointFor = useCallback(
    (p: number): string => {
      if (debouncedQuery) {
        return `/api/flathub/search?q=${encodeURIComponent(debouncedQuery)}&page=${p}`;
      }
      const cat = activeCat === ALL ? '' : activeCat;
      return `/api/flathub/browse?category=${encodeURIComponent(cat)}&page=${p}`;
    },
    [debouncedQuery, activeCat],
  );

  // Reset + load page 1 whenever the search query or category changes.
  useEffect(() => {
    const id = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setApps([]);
    setPage(1);
    fetch(endpointFor(1))
      .then((res) => {
        if (!res.ok) throw new Error('Could not load apps');
        return res.json();
      })
      .then((data: BrowseResult) => {
        if (reqIdRef.current !== id) return; // stale
        setApps(Array.isArray(data?.apps) ? data.apps : []);
        setHasMore(Boolean(data?.hasMore));
      })
      .catch((err) => {
        if (reqIdRef.current !== id) return;
        setError(err?.message || 'Could not load apps');
        setApps([]);
        setHasMore(false);
      })
      .finally(() => {
        if (reqIdRef.current === id) setLoading(false);
      });
  }, [endpointFor]);

  const loadMore = useCallback(() => {
    if (loadingMore || loading || !hasMore) return;
    const next = page + 1;
    const id = ++reqIdRef.current;
    setLoadingMore(true);
    fetch(endpointFor(next))
      .then((res) => {
        if (!res.ok) throw new Error('Could not load more apps');
        return res.json();
      })
      .then((data: BrowseResult) => {
        if (reqIdRef.current !== id) return;
        const more = Array.isArray(data?.apps) ? data.apps : [];
        // De-dupe by appId in case pages overlap upstream.
        setApps((prev) => {
          const seen = new Set(prev.map((a) => a.appId));
          return [...prev, ...more.filter((a) => !seen.has(a.appId))];
        });
        setHasMore(Boolean(data?.hasMore));
        setPage(next);
      })
      .catch(() => {
        /* keep the apps we already have; just stop offering more */
        if (reqIdRef.current === id) setHasMore(false);
      })
      .finally(() => {
        if (reqIdRef.current === id) setLoadingMore(false);
      });
  }, [endpointFor, page, hasMore, loading, loadingMore]);

  return (
    <div className="main">
      <div className="ph">
        <div>
          <div className="ph-eyebrow">Desktop apps</div>
          <h1 className="ph-title">
            A whole catalog of <em>desktop apps.</em>
          </h1>
          <p className="ph-sub">
            Browse thousands of apps and install them onto your LivOS desktop in
            one click. Everything runs on the hardware you already own.
          </p>
        </div>
      </div>

      {/* Search box (component-local — drives the catalog search) */}
      <div className="nstore-search">
        <Icon name="search" size={16} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apps…"
          aria-label="Search apps"
        />
        {query && (
          <button
            type="button"
            className="nstore-search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      {/* Category chips — hidden while searching (search spans all categories) */}
      {!debouncedQuery && categories.length > 0 && (
        <div className="nstore-chips" role="tablist" aria-label="Categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeCat === ALL}
            className={`nstore-chip${activeCat === ALL ? ' is-active' : ''}`}
            onClick={() => setActiveCat(ALL)}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={activeCat === cat}
              className={`nstore-chip${activeCat === cat ? ' is-active' : ''}`}
              onClick={() => setActiveCat(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Body: loading / error / empty / grid */}
      {loading ? (
        <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>Loading apps…</p>
      ) : error ? (
        <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>
          {error}. Please try again.
        </p>
      ) : apps.length === 0 ? (
        <p style={{ color: 'var(--fg-mute)', fontSize: 14 }}>
          {debouncedQuery
            ? `No apps found matching "${debouncedQuery}".`
            : 'No apps to show right now.'}
        </p>
      ) : (
        <>
          <div className="grid">
            {apps.map((app) => (
              <NativeAppCard
                key={app.appId}
                app={app}
                isEmbedded={isEmbedded}
                status={isEmbedded ? getAppStatus(app.appId) : 'not_installed'}
                progress={getInstallProgress(app.appId)}
                onInstall={() =>
                  sendInstall(app.appId, 'native', {
                    name: app.name,
                    iconUrl: app.iconUrl ?? undefined,
                    manifest: {
                      installMethod: 'flathub',
                      flatpakAppId: app.appId,
                    },
                  })
                }
                onOpen={() => sendOpen(app.appId)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="nstore-more">
              <button
                type="button"
                className="install ghost"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Per-card render. Mirrors the curated AppCard layout/classes so it reads as a
// native part of the store, but with no detail-page link (these apps have no
// catalog row) and the install action wired to the flathub install message.
function NativeAppCard({
  app,
  isEmbedded,
  status,
  progress,
  onInstall,
  onOpen,
}: {
  app: NativeApp;
  isEmbedded: boolean;
  status: 'running' | 'stopped' | 'not_installed' | 'installing' | 'uninstalling';
  progress: number;
  onInstall: () => void;
  onOpen: () => void;
}) {
  const isInstalled = status === 'running' || status === 'stopped';

  return (
    <div className="card">
      <AppIcon id={app.appId} name={app.name} iconUrl={app.iconUrl} size={48} />

      <div className="card-body">
        <div className="card-name">
          <span className="card-name-text">{app.name}</span>
          {isInstalled && <span className="tag installed dot">Installed</span>}
        </div>
        <div className="card-tag">{app.summary}</div>
      </div>

      {isEmbedded && (
        <div className="card-action">
          {status === 'not_installed' && (
            <button
              type="button"
              className="install primary card-install"
              onClick={onInstall}
            >
              Install
            </button>
          )}

          {status === 'installing' && (
            <div className="install installing card-install" aria-disabled="true">
              <span className="install-progress">
                <i style={{ width: `${Math.min(progress, 100)}%` }} />
              </span>
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--fg-mute)',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 28,
                  textAlign: 'right',
                }}
              >
                {progress}%
              </span>
            </div>
          )}

          {isInstalled && (
            <button
              type="button"
              className="install primary card-install"
              onClick={onOpen}
              title="Open"
            >
              <Icon name="open" size={12} /> Open
            </button>
          )}

          {status === 'uninstalling' && (
            <span
              className="install ghost card-install"
              aria-disabled="true"
              style={{ pointerEvents: 'none', opacity: 0.7 }}
            >
              Removing…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
