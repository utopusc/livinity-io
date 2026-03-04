'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ChevronLeft,
  Download,
  Square,
  Play,
  Loader2,
  ExternalLink,
  Trash2,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Input, Badge } from '@/components/ui';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpcReact } from '@/trpc/client';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type View = 'discover' | 'category' | 'detail';

type RegistryApp = {
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
/*  Categories                                                         */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  'All',
  'Media',
  'Productivity',
  'Developer',
  'Security',
  'Network',
  'Home Automation',
  'Finance',
  'Social',
  'Other',
];

/* ------------------------------------------------------------------ */
/*  App Store Layout                                                   */
/* ------------------------------------------------------------------ */

export function AppStoreLayout() {
  const [view, setView] = useState<View>('discover');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: registryData, isLoading } = trpcReact.appStore.registry.useQuery();

  const registry: RegistryApp[] = useMemo(() => {
    if (!registryData) return [];
    return Object.values(registryData).map((app: any) => ({
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
  }, [registryData]);

  const filteredApps = useMemo(() => {
    let apps = registry;
    if (selectedCategory !== 'All') {
      apps = apps.filter((a) => a.category === selectedCategory);
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
  }, [registry, selectedCategory, searchQuery]);

  const selectedApp = registry.find((a) => a.id === selectedAppId);

  const openDetail = useCallback((appId: string) => {
    setSelectedAppId(appId);
    setView('detail');
  }, []);

  const goBack = useCallback(() => {
    if (view === 'detail') setView(selectedCategory === 'All' ? 'discover' : 'category');
    else if (view === 'category') { setView('discover'); setSelectedCategory('All'); }
  }, [view, selectedCategory]);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5">
        {view !== 'discover' && (
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-white/8 hover:text-text"
            onClick={goBack}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="text-sm font-semibold text-text">
          {view === 'discover' ? 'App Store' : view === 'category' ? selectedCategory : selectedApp?.name ?? 'App'}
        </h2>
        <div className="flex-1" />
        <div className="relative w-48">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-full rounded-lg bg-white/5 pl-8 pr-3 text-xs text-text placeholder:text-text-tertiary outline-none border border-white/10 focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
          </div>
        ) : view === 'detail' && selectedApp ? (
          <AppDetail app={selectedApp} />
        ) : (
          <div className="p-4">
            {/* Category tabs */}
            {view === 'discover' && (
              <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    className={cn(
                      'shrink-0 rounded-lg px-3 py-1.5 text-xs transition-colors',
                      cat === selectedCategory
                        ? 'bg-white/10 text-text'
                        : 'text-text-tertiary hover:bg-white/5 hover:text-text-secondary',
                    )}
                    onClick={() => {
                      setSelectedCategory(cat);
                      if (cat !== 'All') setView('category');
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* App grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredApps.map((app) => (
                <AppCard key={app.id} app={app} onClick={() => openDetail(app.id)} />
              ))}
            </div>

            {filteredApps.length === 0 && (
              <p className="py-12 text-center text-xs text-text-tertiary">
                {searchQuery ? 'No apps match your search.' : 'No apps available.'}
              </p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App Card                                                           */
/* ------------------------------------------------------------------ */

function AppCard({ app, onClick }: { app: RegistryApp; onClick: () => void }) {
  return (
    <button
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl p-3 text-center',
        'bg-white/3 transition-all hover:bg-white/6',
        'border border-white/5',
      )}
      onClick={onClick}
    >
      <div className="h-12 w-12 overflow-hidden rounded-xl bg-white/5">
        {app.icon ? (
          <img src={app.icon} alt={app.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-tertiary">
            <Download className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 w-full">
        <p className="truncate text-xs font-medium text-text">{app.name}</p>
        {app.tagline && (
          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{app.tagline}</p>
        )}
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  App Detail                                                         */
/* ------------------------------------------------------------------ */

function AppDetail({ app }: { app: RegistryApp }) {
  return (
    <div className="p-4 space-y-6">
      {/* Hero */}
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-white/5">
          {app.icon ? (
            <img src={app.icon} alt={app.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-text-tertiary">
              <Download className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-text">{app.name}</h3>
          {app.developer && <p className="text-xs text-text-tertiary">{app.developer}</p>}
          {app.tagline && <p className="mt-1 text-xs text-text-secondary">{app.tagline}</p>}
          <div className="mt-2 flex items-center gap-2">
            {app.version && <Badge>{app.version}</Badge>}
            {app.category && <Badge variant="outline">{app.category}</Badge>}
          </div>
        </div>
        <AppInstallButton appId={app.id} />
      </div>

      {/* Gallery */}
      {app.gallery && app.gallery.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-text">Screenshots</h4>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {app.gallery.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Screenshot ${i + 1}`}
                className="h-32 rounded-lg border border-white/5 object-cover"
              />
            ))}
          </div>
        </div>
      )}

      {/* Description */}
      {app.description && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-text">About</h4>
          <p className="text-xs leading-relaxed text-text-secondary">{app.description}</p>
        </div>
      )}

      {/* Release Notes */}
      {app.releaseNotes && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-text">Release Notes</h4>
          <p className="text-xs text-text-tertiary">{app.releaseNotes}</p>
        </div>
      )}

      {/* Dependencies */}
      {app.dependencies && app.dependencies.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-text">Dependencies</h4>
          <div className="flex flex-wrap gap-1">
            {app.dependencies.map((dep) => (
              <Badge key={dep} variant="outline">{dep}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-text">Info</h4>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {app.port && (
            <>
              <dt className="text-text-tertiary">Port</dt>
              <dd className="text-text-secondary">{app.port}</dd>
            </>
          )}
          {app.website && (
            <>
              <dt className="text-text-tertiary">Website</dt>
              <dd>
                <a href={app.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                  Visit <ExternalLink className="h-3 w-3" />
                </a>
              </dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Install Button                                                     */
/* ------------------------------------------------------------------ */

function AppInstallButton({ appId }: { appId: string }) {
  const { data: stateData } = trpcReact.apps.state.useQuery({ appId }, { refetchInterval: 2000 });
  const utils = trpcReact.useUtils();

  const installMutation = trpcReact.apps.install.useMutation({
    onSuccess: () => utils.apps.state.invalidate({ appId }),
  });
  const uninstallMutation = trpcReact.apps.uninstall.useMutation({
    onSuccess: () => utils.apps.state.invalidate({ appId }),
  });
  const startMutation = trpcReact.apps.start.useMutation({
    onSuccess: () => utils.apps.state.invalidate({ appId }),
  });
  const stopMutation = trpcReact.apps.stop.useMutation({
    onSuccess: () => utils.apps.state.invalidate({ appId }),
  });

  const state = stateData?.state ?? stateData ?? 'unknown';

  const isInstalling = state === 'installing' || state === 'updating';
  const isRunning = state === 'running' || state === 'ready';
  const isStopped = state === 'stopped';
  const isInstalled = isRunning || isStopped;

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
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => stopMutation.mutate({ appId })}>
          <Square className="mr-1 h-3 w-3" /> Stop
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { if (confirm('Uninstall?')) uninstallMutation.mutate({ appId }); }}>
          <Trash2 className="h-3 w-3 text-error" />
        </Button>
      </div>
    );
  }

  if (isStopped) {
    return (
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" onClick={() => startMutation.mutate({ appId })}>
          <Play className="mr-1 h-3 w-3" /> Start
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { if (confirm('Uninstall?')) uninstallMutation.mutate({ appId }); }}>
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
    >
      <Download className="mr-1.5 h-3.5 w-3.5" />
      Install
    </Button>
  );
}
