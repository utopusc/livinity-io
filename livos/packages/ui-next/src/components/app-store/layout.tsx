'use client';

import { useState, useMemo, useCallback, memo } from 'react';
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
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { trpcReact } from '@/trpc/client';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { InView } from '@/components/motion-primitives/in-view';
import { TransitionPanel } from '@/components/motion-primitives/transition-panel';
import { Tilt } from '@/components/motion-primitives/tilt';
import { AnimatedBackground } from '@/components/motion-primitives/animated-background';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

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
  path?: string;
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

const CATEGORIES = ['All', 'Media', 'Developer', 'Productivity', 'Home Automation', 'Security'];

/* ------------------------------------------------------------------ */
/*  URL generation (mirrors desktop logic)                            */
/* ------------------------------------------------------------------ */

function getAppUrl(app: { id: string; port?: number; path?: string }): string {
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:${app.port}`;
  }
  const domain = hostname.split('.').slice(-2).join('.');
  return `${protocol}//${app.id}.${domain}${app.path ?? ''}`;
}

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

  // Fetch both builtin apps (priority) and registry (community)
  const { data: builtinData, isLoading: builtinLoading } =
    trpcReact.appStore.builtinApps.useQuery();
  // Registry returns Array<{ url, meta, apps: AppManifest[] }>
  const { data: registryData, isLoading: registryLoading } =
    trpcReact.appStore.registry.useQuery();

  const isLoading = builtinLoading || registryLoading;

  // Merge: builtinApps first, then add registry apps not already present.
  // registryData is an array of repo objects, each with an `apps` array.
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
      path: app.path,
      gallery: app.gallery,
      dependencies: app.dependencies,
      releaseNotes: app.releaseNotes,
    }));

    const builtinIds = new Set(builtins.map((a) => a.id));

    // registryData is Array<{ url, meta, apps: AppManifest[] }>
    // Flatten all apps from all repos, deduplicate against builtins.
    const registryApps: CatalogApp[] = Array.isArray(registryData)
      ? registryData
          .flatMap((repo: any) => (Array.isArray(repo?.apps) ? repo.apps : []))
          .filter((app: any) => app?.id && !builtinIds.has(app.id))
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
            path: app.path,
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

  // Search filters against name, tagline, and description.
  // Category filter only applies when not on the discover view (or when a
  // non-All category is explicitly selected).
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

  // When searching from discover, we want all-category search results.
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return catalog.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.tagline?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [catalog, searchQuery]);

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
      <div className="flex items-center gap-2.5 border-b border-black/[0.06] px-4 py-2.5">
        {view !== 'discover' && (
          <button
            aria-label="Go back"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            onClick={goBack}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="text-sm font-semibold text-neutral-900">{topBarTitle}</h2>
        <div className="flex-1" />
        {/* Search */}
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-lg border border-black/[0.06] bg-neutral-50 pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand focus:ring-1 focus:ring-brand/20 transition-shadow"
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
              searchResults={searchResults}
              filteredApps={filteredApps}
              selectedCategory={selectedCategory}
              onOpenDetail={openDetail}
              onOpenCategory={openCategory}
              onSelectCategory={setSelectedCategory}
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
  searchResults,
  filteredApps,
  selectedCategory,
  onOpenDetail,
  onOpenCategory,
  onSelectCategory,
}: {
  catalog: CatalogApp[];
  catalogById: Map<string, CatalogApp>;
  searchQuery: string;
  searchResults: CatalogApp[];
  filteredApps: CatalogApp[];
  selectedCategory: string;
  onOpenDetail: (id: string) => void;
  onOpenCategory: (cat: string) => void;
  onSelectCategory: (cat: string) => void;
}) {
  // If a search query is active, show flat search results across all apps
  if (searchQuery.trim()) {
    return (
      <div className="p-5">
        <p className="mb-4 text-xs text-neutral-400">
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
        </p>
        {searchResults.length > 0 ? (
          <AnimatedGroup
            preset="blur-slide"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            {searchResults.map((app) => (
              <AppCard key={app.id} app={app} onClick={() => onOpenDetail(app.id)} />
            ))}
          </AnimatedGroup>
        ) : (
          <p className="py-12 text-center text-xs text-neutral-400">No apps match your search.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-7 p-5">
      {/* Category pills with AnimatedBackground sliding highlight */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        <AnimatedBackground
          defaultValue={selectedCategory}
          className="rounded-md bg-neutral-900"
          transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
          onValueChange={(id) => {
            if (!id) return;
            if (id === 'All') {
              onSelectCategory('All');
            } else {
              onOpenCategory(id);
            }
          }}
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              data-id={cat}
              className={cn(
                'shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                'text-neutral-500 data-[checked=true]:text-white',
              )}
            >
              {cat}
            </button>
          ))}
        </AnimatedBackground>
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
                <h3 className="text-sm font-semibold text-neutral-900">{section.heading}</h3>
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

      {/* All apps fallback if no featured sections matched any catalog app */}
      {FEATURED_SECTIONS.every(
        (s) => s.apps.every((id) => !catalogById.has(id)),
      ) && catalog.length > 0 && (
        <InView
          variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.3 }}
          once
        >
          <section>
            <h3 className="mb-3 text-sm font-semibold text-neutral-900">All Apps</h3>
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
        <p className="py-12 text-center text-xs text-neutral-400">No apps available.</p>
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
    <div className="p-5">
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
        <p className="py-12 text-center text-xs text-neutral-400">
          {searchQuery ? 'No apps match your search.' : `No apps in ${category}.`}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App Card                                                           */
/* ------------------------------------------------------------------ */

const AppCard = memo(function AppCard({ app, onClick }: { app: CatalogApp; onClick: () => void }) {
  return (
    <Tilt rotationFactor={6} isRevese>
      <button
        className={cn(
          'flex w-full flex-col items-center gap-2.5 rounded-xl p-4 text-center',
          'border border-black/[0.06] bg-white',
          'transition-shadow duration-200 hover:shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        )}
        onClick={onClick}
        aria-label={`View ${app.name}`}
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
          {app.icon ? (
            <img src={app.icon} alt={app.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-400">
              <Grid2X2 className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 w-full">
          <p className="truncate text-xs font-medium text-neutral-900">{app.name}</p>
          {app.tagline && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-neutral-400">
              {app.tagline}
            </p>
          )}
        </div>
      </button>
    </Tilt>
  );
});

/* ------------------------------------------------------------------ */
/*  App Detail                                                         */
/* ------------------------------------------------------------------ */

function AppDetail({ app }: { app: CatalogApp }) {
  return (
    <div className="space-y-6 p-5">
      {/* Hero */}
      <InView
        variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
        transition={{ duration: 0.25 }}
        once
      >
        <div className="flex items-start gap-5">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 border border-black/[0.06]">
            {app.icon ? (
              <img src={app.icon} alt={app.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-400">
                <Grid2X2 className="h-7 w-7" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h3 className="text-lg font-semibold text-neutral-900">{app.name}</h3>
            {app.developer && (
              <p className="mt-0.5 text-xs text-neutral-400">{app.developer}</p>
            )}
            {app.tagline && (
              <p className="mt-1.5 text-sm text-neutral-500">{app.tagline}</p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {app.version && <Badge>{app.version}</Badge>}
              {app.category && <Badge variant="outline">{app.category}</Badge>}
            </div>
          </div>
          <div className="shrink-0 pt-1">
            <AppInstallButton app={app} />
          </div>
        </div>
      </InView>

      {/* Divider */}
      <div className="h-px bg-black/[0.06]" />

      {/* Gallery */}
      {app.gallery && app.gallery.length > 0 && (
        <InView
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={{ duration: 0.25, delay: 0.05 }}
          once
        >
          <div className="space-y-2.5">
            <h4 className="text-sm font-semibold text-neutral-900">Screenshots</h4>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {app.gallery.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Screenshot ${i + 1}`}
                  className="h-36 flex-shrink-0 rounded-xl border border-black/[0.06] object-cover"
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
          <div className="space-y-2.5">
            <h4 className="text-sm font-semibold text-neutral-900">About</h4>
            <p className="text-xs leading-relaxed text-neutral-500">{app.description}</p>
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
          <div className="space-y-2.5">
            <h4 className="text-sm font-semibold text-neutral-900">Release Notes</h4>
            <p className="text-xs leading-relaxed text-neutral-400">{app.releaseNotes}</p>
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
          <div className="space-y-2.5">
            <h4 className="text-sm font-semibold text-neutral-900">Dependencies</h4>
            <div className="flex flex-wrap gap-1.5">
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
        <div className="space-y-2.5">
          <h4 className="text-sm font-semibold text-neutral-900">Info</h4>
          <div className="overflow-hidden rounded-xl border border-black/[0.06] divide-y divide-black/[0.06]">
            {app.port && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-neutral-400">Port</span>
                <span className="text-xs font-medium text-neutral-600">{app.port}</span>
              </div>
            )}
            {app.version && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-neutral-400">Version</span>
                <span className="text-xs font-medium text-neutral-600">{app.version}</span>
              </div>
            )}
            {app.developer && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-neutral-400">Developer</span>
                <span className="text-xs font-medium text-neutral-600">{app.developer}</span>
              </div>
            )}
            {app.website && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-neutral-400">Website</span>
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
/*  Uninstall Confirmation Dialog                                      */
/* ------------------------------------------------------------------ */

function UninstallDialog({
  appName,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: {
  appName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <DialogTitle>Uninstall {appName}?</DialogTitle>
          <DialogDescription>
            This will stop and remove the app along with its data. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center rounded-lg border border-black/[0.08] bg-white px-4 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Uninstall
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Install Button                                                     */
/* ------------------------------------------------------------------ */

const TRANSITIONING_STATES = new Set([
  'installing',
  'updating',
  'starting',
  'restarting',
  'stopping',
  'uninstalling',
]);

function AppInstallButton({ app }: { app: CatalogApp }) {
  const appId = app.id;
  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);

  const { data: stateData } = trpcReact.apps.state.useQuery(
    { appId },
    {
      // Poll while an operation is in-flight; otherwise hold still.
      refetchInterval: (query) => {
        const s = (query.state.data as any)?.state ?? '';
        return TRANSITIONING_STATES.has(s) ? 2000 : false;
      },
    },
  );
  const utils = trpcReact.useUtils();

  const invalidate = useCallback(() => utils.apps.state.invalidate({ appId }), [utils, appId]);

  const installMutation = trpcReact.apps.install.useMutation({ onSuccess: invalidate });
  const uninstallMutation = trpcReact.apps.uninstall.useMutation({
    onSuccess: () => {
      setUninstallDialogOpen(false);
      invalidate();
    },
  });
  const startMutation = trpcReact.apps.start.useMutation({ onSuccess: invalidate });
  const stopMutation = trpcReact.apps.stop.useMutation({ onSuccess: invalidate });

  // stateData is always { state: string, progress: number } from the server
  const state: string = (stateData as any)?.state ?? 'unknown';

  const isTransitioning = TRANSITIONING_STATES.has(state);
  const isRunning = state === 'running' || state === 'ready';
  const isStopped = state === 'stopped';

  if (isTransitioning) {
    const label =
      state === 'installing' ? 'Installing...' :
      state === 'updating'   ? 'Updating...'   :
      state === 'starting'   ? 'Starting...'   :
      state === 'restarting' ? 'Restarting...' :
      state === 'stopping'   ? 'Stopping...'   :
      state === 'uninstalling' ? 'Uninstalling...' :
      'Working...';

    return (
      <button
        disabled
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white opacity-70"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {label}
      </button>
    );
  }

  if (isRunning) {
    return (
      <>
        <UninstallDialog
          appName={app.name}
          open={uninstallDialogOpen}
          onOpenChange={setUninstallDialogOpen}
          onConfirm={() => uninstallMutation.mutate({ appId })}
          isPending={uninstallMutation.isPending}
        />
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
            Running
          </span>
          <a
            href={getAppUrl(app)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open app in new tab"
            className="inline-flex items-center gap-1 rounded-lg border border-black/[0.06] bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
          <button
            onClick={() => stopMutation.mutate({ appId })}
            disabled={stopMutation.isPending}
            aria-label="Stop app"
            className="inline-flex items-center gap-1 rounded-lg border border-black/[0.06] bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-200 disabled:opacity-50"
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
          <button
            onClick={() => setUninstallDialogOpen(true)}
            disabled={uninstallMutation.isPending}
            aria-label="Uninstall app"
            className="inline-flex items-center justify-center rounded-lg border border-black/[0.06] bg-neutral-100 p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </>
    );
  }

  if (isStopped) {
    return (
      <>
        <UninstallDialog
          appName={app.name}
          open={uninstallDialogOpen}
          onOpenChange={setUninstallDialogOpen}
          onConfirm={() => uninstallMutation.mutate({ appId })}
          isPending={uninstallMutation.isPending}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600">
            Stopped
          </span>
          <button
            onClick={() => startMutation.mutate({ appId })}
            disabled={startMutation.isPending}
            aria-label="Start app"
            className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Play className="h-3 w-3" />
            Start
          </button>
          <button
            onClick={() => setUninstallDialogOpen(true)}
            disabled={uninstallMutation.isPending}
            aria-label="Uninstall app"
            className="inline-flex items-center justify-center rounded-lg border border-black/[0.06] bg-neutral-100 p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </>
    );
  }

  // Not installed state
  return (
    <button
      onClick={() => installMutation.mutate({ appId })}
      disabled={installMutation.isPending}
      aria-label={`Install ${appId}`}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {installMutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      Install
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function AppStoreSkeleton() {
  return (
    <div className="space-y-7 p-5">
      {/* Category pills skeleton */}
      <div className="flex gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 rounded-md bg-neutral-100" style={{ width: `${56 + i * 8}px` }} />
        ))}
      </div>

      {/* Section skeleton x2 */}
      {[0, 1].map((s) => (
        <div key={s} className="space-y-3">
          <Skeleton className="h-4 w-28 rounded bg-neutral-100" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-2.5 rounded-xl border border-black/[0.06] bg-white p-4"
              >
                <Skeleton className="h-12 w-12 rounded-xl bg-neutral-100" />
                <Skeleton className="h-3 w-20 rounded bg-neutral-100" />
                <Skeleton className="h-2.5 w-16 rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
