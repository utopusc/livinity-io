'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronLeft,
  Download,
  Square,
  Play,
  Loader2,
  ExternalLink,
  Trash2,
  Grid2X2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Badge } from '@/components/ui';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { trpcReact } from '@/trpc/client';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { InView } from '@/components/motion-primitives/in-view';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { TransitionPanel } from '@/components/motion-primitives/transition-panel';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type View = 'discover' | 'category' | 'detail';

type CatalogApp = {
  id: string;
  name: string;
  icon: string;
  tagline?: string;
  description?: string;
  developer?: string;
  website?: string;
  version?: string;
  category?: string;
  port?: number;
  gallery?: string[];
  dependencies?: string[];
  releaseNotes?: string;
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FEATURED_SECTIONS = [
  { heading: 'Featured', apps: ['chromium', 'n8n'] },
  {
    heading: 'Popular Apps',
    apps: ['nextcloud', 'plex', 'jellyfin', 'home-assistant', 'vaultwarden', 'immich'],
  },
  {
    heading: 'For Developers',
    apps: ['gitea', 'code-server', 'portainer', 'grafana', 'uptime-kuma'],
  },
  { heading: 'AI & ML', apps: ['ollama', 'open-webui', 'localai'] },
  { heading: 'Media & Creators', apps: ['immich', 'photoprism', 'jellyfin', 'navidrome'] },
];

/* ------------------------------------------------------------------ */
/*  View index map for TransitionPanel                                 */
/* ------------------------------------------------------------------ */

const VIEW_INDEX: Record<View, number> = {
  discover: 0,
  category: 1,
  detail: 2,
};

const PANEL_VARIANTS = {
  enter: { opacity: 0, x: 24, filter: 'blur(4px)' },
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, x: -24, filter: 'blur(4px)' },
};

const PANEL_TRANSITION = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };

/* ------------------------------------------------------------------ */
/*  App Store Layout                                                   */
/* ------------------------------------------------------------------ */

export function AppStoreLayout() {
  const [view, setView] = useState<View>('discover');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch both builtin apps (primary) and registry (community)
  const { data: builtinData, isLoading: builtinLoading } =
    trpcReact.appStore.builtinApps.useQuery();
  const { data: registryData, isLoading: registryLoading } =
    trpcReact.appStore.registry.useQuery();

  const isLoading = builtinLoading || registryLoading;

  // Merge: builtinApps first, then add registry apps that aren't already present
  const catalog: CatalogApp[] = useMemo(() => {
    const builtins: CatalogApp[] = (builtinData ?? []).map((app: any) => ({
      id: app.id,
      name: app.name,
      icon: app.icon,
      tagline: app.tagline,
      description: app.description,
      developer: app.developer,
      website: app.website,
      version: app.version,
      category: app.category,
      port: app.port,
      gallery: app.gallery,
      dependencies: app.dependencies,
      releaseNotes: app.releaseNotes,
    }));

    const builtinIds = new Set(builtins.map((a) => a.id));

    const registryApps: CatalogApp[] = registryData
      ? Object.values(registryData)
          .filter((app: any) => !builtinIds.has(app.id))
          .map((app: any) => ({
            id: app.id,
            name: app.name,
            icon: app.icon,
            tagline: app.tagline,
            description: app.description,
            developer: app.developer,
            website: app.website,
            version: app.version,
            category: app.category,
            port: app.port,
            gallery: app.gallery,
            dependencies: app.dependencies,
            releaseNotes: app.releaseNotes,
          }))
      : [];

    return [...builtins, ...registryApps];
  }, [builtinData, registryData]);

  // Build an id -> app lookup for fast section resolution
  const catalogById = useMemo(() => {
    const map = new Map<string, CatalogApp>();
    catalog.forEach((a) => map.set(a.id, a));
    return map;
  }, [catalog]);

  const filteredApps = useMemo(() => {
    let apps = catalog;
    if (selectedCategory !== 'All') {
      apps = apps.filter(
        (a) => a.category?.toLowerCase() === selectedCategory.toLowerCase(),
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      apps = apps.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.tagline?.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q),
      );
    }
    return apps;
  }, [catalog, selectedCategory, searchQuery]);

  const selectedApp = catalogById.get(selectedAppId);

  const openDetail = useCallback((appId: string) => {
    setSelectedAppId(appId);
    setView('detail');
  }, []);

  const goBack = useCallback(() => {
    if (view === 'detail') {
      setView(selectedCategory === 'All' ? 'discover' : 'category');
    } else if (view === 'category') {
      setView('discover');
      setSelectedCategory('All');
    }
  }, [view, selectedCategory]);

  const openCategory = useCallback((cat: string) => {
    setSelectedCategory(cat);
    setView('category');
  }, []);

  const topBarTitle =
    view === 'discover'
      ? 'App Store'
      : view === 'category'
        ? selectedCategory
        : (selectedApp?.name ?? 'App');

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Top bar */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
        {view !== 'discover' && (
          <button
            aria-label="Go back"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-neutral-100 hover:text-text"
            onClick={goBack}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="text-sm font-semibold text-text">{topBarTitle}</h2>
        <div className="flex-1" />
        {/* Search */}
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-lg border border-border bg-neutral-50 pl-8 pr-3 text-xs text-text placeholder:text-text-tertiary outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-shadow"
            aria-label="Search apps"
          />
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <AppStoreSkeleton />
        ) : (
          <TransitionPanel
            activeIndex={VIEW_INDEX[view]}
            variants={PANEL_VARIANTS}
            transition={PANEL_TRANSITION}
            className="min-h-full"
          >
            {/* Panel 0: Discover */}
            <DiscoverView
              catalog={catalog}
              catalogById={catalogById}
              searchQuery={searchQuery}
              filteredApps={filteredApps}
              onOpenDetail={openDetail}
              onOpenCategory={openCategory}
            />

            {/* Panel 1: Category */}
            <CategoryView
              category={selectedCategory}
              filteredApps={filteredApps}
              searchQuery={searchQuery}
              onOpenDetail={openDetail}
            />

            {/* Panel 2: Detail */}
            <div>
              {selectedApp && (
                <AppDetail app={selectedApp} />
              )}
            </div>
          </TransitionPanel>
        )}
      </ScrollArea>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Discover View                                                      */
/* ------------------------------------------------------------------ */

function DiscoverView({
  catalog,
  catalogById,
  searchQuery,
  filteredApps,
  onOpenDetail,
  onOpenCategory,
}: {
  catalog: CatalogApp[];
  catalogById: Map<string, CatalogApp>;
  searchQuery: string;
  filteredApps: CatalogApp[];
  onOpenDetail: (id: string) => void;
  onOpenCategory: (cat: string) => void;
}) {
  // If a search query is active, show flat search results instead
  if (searchQuery.trim()) {
    return (
      <div className="p-4">
        <p className="mb-3 text-xs text-text-tertiary">
          {filteredApps.length} result{filteredApps.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
        </p>
        {filteredApps.length > 0 ? (
          <AnimatedGroup
            preset="blur-slide"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            {filteredApps.map((app) => (
              <AppCard key={app.id} app={app} onClick={() => onOpenDetail(app.id)} />
            ))}
          </AnimatedGroup>
        ) : (
          <p className="py-12 text-center text-xs text-text-tertiary">No apps match your search.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Category pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {['Media', 'Developer', 'Productivity', 'Home Automation', 'Security'].map((cat) => (
          <button
            key={cat}
            onClick={() => onOpenCategory(cat)}
            className="shrink-0 rounded-full border border-border bg-neutral-100 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-brand hover:text-white hover:border-brand"
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Featured sections */}
      {FEATURED_SECTIONS.map((section) => {
        const sectionApps = section.apps
          .map((id) => catalogById.get(id))
          .filter((a): a is CatalogApp => Boolean(a));

        if (sectionApps.length === 0) return null;

        return (
          <InView
            key={section.heading}
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            viewOptions={{ margin: '0px 0px -40px 0px' }}
            once
          >
            <section>
              <div className="mb-3 flex items-center justify-between">
                <TextEffect
                  as="h3"
                  preset="fade"
                  className="text-sm font-semibold text-text"
                  speedReveal={2}
                >
                  {section.heading}
                </TextEffect>
              </div>
              <AnimatedGroup
                preset="blur-slide"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
              >
                {sectionApps.map((app) => (
                  <AppCard key={app.id} app={app} onClick={() => onOpenDetail(app.id)} />
                ))}
              </AnimatedGroup>
            </section>
          </InView>
        );
      })}

      {/* All apps fallback if no sections matched */}
      {FEATURED_SECTIONS.every(
        (s) => s.apps.every((id) => !catalogById.has(id)),
      ) && catalog.length > 0 && (
        <InView
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.3 }}
          once
        >
          <section>
            <h3 className="mb-3 text-sm font-semibold text-text">All Apps</h3>
            <AnimatedGroup
              preset="blur-slide"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {catalog.map((app) => (
                <AppCard key={app.id} app={app} onClick={() => onOpenDetail(app.id)} />
              ))}
            </AnimatedGroup>
          </section>
        </InView>
      )}

      {catalog.length === 0 && (
        <p className="py-12 text-center text-xs text-text-tertiary">No apps available.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Category View                                                      */
/* ------------------------------------------------------------------ */

function CategoryView({
  category,
  filteredApps,
  searchQuery,
  onOpenDetail,
}: {
  category: string;
  filteredApps: CatalogApp[];
  searchQuery: string;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <div className="p-4">
      {filteredApps.length > 0 ? (
        <AnimatedGroup
          preset="blur-slide"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {filteredApps.map((app) => (
            <AppCard key={app.id} app={app} onClick={() => onOpenDetail(app.id)} />
          ))}
        </AnimatedGroup>
      ) : (
        <p className="py-12 text-center text-xs text-text-tertiary">
          {searchQuery ? 'No apps match your search.' : `No apps in ${category}.`}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App Card                                                           */
/* ------------------------------------------------------------------ */

function AppCard({ app, onClick }: { app: CatalogApp; onClick: () => void }) {
  return (
    <button
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl p-3 text-center text-left',
        'bg-white border border-border shadow-sm',
        'transition-all duration-150 hover:shadow-md hover:border-border-subtle hover:bg-neutral-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      )}
      onClick={onClick}
      aria-label={`View ${app.name}`}
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100 shadow-sm">
        {app.icon ? (
          <img src={app.icon} alt={app.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-tertiary">
            <Grid2X2 className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 w-full">
        <p className="truncate text-xs font-medium text-text">{app.name}</p>
        {app.tagline && (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-text-tertiary">
            {app.tagline}
          </p>
        )}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  App Detail                                                         */
/* ------------------------------------------------------------------ */

function AppDetail({ app }: { app: CatalogApp }) {
  return (
    <div className="space-y-6 p-4">
      {/* Hero */}
      <InView
        variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.25 }}
        once
      >
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 border border-border shadow-sm">
            {app.icon ? (
              <img src={app.icon} alt={app.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-text-tertiary">
                <Grid2X2 className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-text">{app.name}</h3>
            {app.developer && (
              <p className="text-xs text-text-tertiary">{app.developer}</p>
            )}
            {app.tagline && (
              <p className="mt-1 text-xs text-text-secondary">{app.tagline}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {app.version && <Badge>{app.version}</Badge>}
              {app.category && <Badge variant="outline">{app.category}</Badge>}
            </div>
          </div>
          <AppInstallButton appId={app.id} />
        </div>
      </InView>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Gallery */}
      {app.gallery && app.gallery.length > 0 && (
        <InView
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.25, delay: 0.05 }}
          once
        >
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text">Screenshots</h4>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {app.gallery.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Screenshot ${i + 1}`}
                  className="h-32 rounded-xl border border-border object-cover shadow-sm"
                />
              ))}
            </div>
          </div>
        </InView>
      )}

      {/* Description */}
      {app.description && (
        <InView
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.25, delay: 0.08 }}
          once
        >
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text">About</h4>
            <p className="text-xs leading-relaxed text-text-secondary">{app.description}</p>
          </div>
        </InView>
      )}

      {/* Release Notes */}
      {app.releaseNotes && (
        <InView
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.25, delay: 0.1 }}
          once
        >
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text">Release Notes</h4>
            <p className="text-xs text-text-tertiary">{app.releaseNotes}</p>
          </div>
        </InView>
      )}

      {/* Dependencies */}
      {app.dependencies && app.dependencies.length > 0 && (
        <InView
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.25, delay: 0.1 }}
          once
        >
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text">Dependencies</h4>
            <div className="flex flex-wrap gap-1">
              {app.dependencies.map((dep) => (
                <Badge key={dep} variant="outline">{dep}</Badge>
              ))}
            </div>
          </div>
        </InView>
      )}

      {/* Info table */}
      <InView
        variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.25, delay: 0.12 }}
        once
      >
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-text">Info</h4>
          <div className="rounded-xl border border-border bg-neutral-50 divide-y divide-border">
            {app.port && (
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-text-tertiary">Port</span>
                <span className="text-xs font-medium text-text-secondary">{app.port}</span>
              </div>
            )}
            {app.version && (
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-text-tertiary">Version</span>
                <span className="text-xs font-medium text-text-secondary">{app.version}</span>
              </div>
            )}
            {app.developer && (
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-text-tertiary">Developer</span>
                <span className="text-xs font-medium text-text-secondary">{app.developer}</span>
              </div>
            )}
            {app.website && (
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs text-text-tertiary">Website</span>
                <a
                  href={app.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                >
                  Visit <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      </InView>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Install Button                                                     */
/* ------------------------------------------------------------------ */

function AppInstallButton({ appId }: { appId: string }) {
  const { data: stateData } = trpcReact.apps.state.useQuery({ appId }, { refetchInterval: 2000 });
  const utils = trpcReact.useUtils();

  const invalidate = useCallback(() => utils.apps.state.invalidate({ appId }), [utils, appId]);

  const installMutation = trpcReact.apps.install.useMutation({ onSuccess: invalidate });
  const uninstallMutation = trpcReact.apps.uninstall.useMutation({ onSuccess: invalidate });
  const startMutation = trpcReact.apps.start.useMutation({ onSuccess: invalidate });
  const stopMutation = trpcReact.apps.stop.useMutation({ onSuccess: invalidate });

  const state = stateData?.state ?? stateData ?? 'unknown';

  const isInstalling = state === 'installing' || state === 'updating';
  const isRunning = state === 'running' || state === 'ready';
  const isStopped = state === 'stopped';

  if (isInstalling) {
    return (
      <Button size="sm" disabled>
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        Installing...
      </Button>
    );
  }

  if (isRunning) {
    return (
      <div className="flex shrink-0 gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => stopMutation.mutate({ appId })}
          disabled={stopMutation.isPending}
          aria-label="Stop app"
        >
          <Square className="mr-1 h-3 w-3" />
          Stop
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm('Uninstall this app?')) uninstallMutation.mutate({ appId });
          }}
          disabled={uninstallMutation.isPending}
          aria-label="Uninstall app"
        >
          <Trash2 className="h-3 w-3 text-error" />
        </Button>
      </div>
    );
  }

  if (isStopped) {
    return (
      <div className="flex shrink-0 gap-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => startMutation.mutate({ appId })}
          disabled={startMutation.isPending}
          aria-label="Start app"
        >
          <Play className="mr-1 h-3 w-3" />
          Start
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (confirm('Uninstall this app?')) uninstallMutation.mutate({ appId });
          }}
          disabled={uninstallMutation.isPending}
          aria-label="Uninstall app"
        >
          <Trash2 className="h-3 w-3 text-error" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      onClick={() => installMutation.mutate({ appId })}
      loading={installMutation.isPending}
      aria-label={`Install ${appId}`}
    >
      <Download className="mr-1.5 h-3.5 w-3.5" />
      Install
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function AppStoreSkeleton() {
  return (
    <div className="space-y-6 p-4">
      {/* Category pills skeleton */}
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 rounded-full" style={{ width: `${60 + i * 8}px` }} />
        ))}
      </div>

      {/* Section skeleton x2 */}
      {[0, 1].map((s) => (
        <div key={s} className="space-y-3">
          <Skeleton className="h-4 w-32 rounded" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-3 shadow-sm"
              >
                <Skeleton className="h-12 w-12 rounded-xl" />
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-2.5 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
