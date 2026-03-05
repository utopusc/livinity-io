'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { systemApps, type SystemApp } from '@/providers/apps';
import { useWindowManager } from '@/providers/window-manager';

/* ------------------------------------------------------------------ */
/*  Command Palette                                                    */
/* ------------------------------------------------------------------ */

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wm = useWindowManager();

  // Cmd+K / Ctrl+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Filter apps
  const filteredApps = useMemo(() => {
    if (!query.trim()) return systemApps.filter((a) => a.id !== 'LIVINITY_home');
    const q = query.toLowerCase();
    return systemApps.filter(
      (a) =>
        a.id !== 'LIVINITY_home' && a.name.toLowerCase().includes(q),
    );
  }, [query]);

  // Keep selected index in bounds
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, filteredApps.length - 1)));
  }, [filteredApps.length]);

  const handleSelect = useCallback(
    (app: SystemApp) => {
      setOpen(false);
      // Open or focus the app
      const existing = wm.getWindowByAppId(app.id);
      if (existing) {
        if (existing.isMinimized) wm.restoreWindow(existing.id);
        else wm.focusWindow(existing.id);
      } else {
        const route = getRoute(app.id);
        wm.openWindow(app.id, route, app.name, '');
      }
    },
    [wm],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredApps.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filteredApps[selectedIndex]) {
        handleSelect(filteredApps[selectedIndex]);
      }
    },
    [filteredApps, selectedIndex, handleSelect],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — light overlay */}
          <motion.div
            className="fixed inset-0 z-[var(--z-overlay)] bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />

          {/* Palette */}
          <motion.div
            className={cn(
              'fixed left-1/2 top-[15%] z-[var(--z-modal)] w-full max-w-lg -translate-x-1/2',
              'rounded-2xl overflow-hidden',
              'bg-surface-0 backdrop-blur-2xl',
              'border border-border',
              'shadow-float',
            )}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-text-tertiary" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search apps..."
                className="flex-1 bg-transparent text-sm text-text placeholder:text-text-tertiary outline-none"
              />
              <kbd className="rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] text-text-tertiary">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[300px] overflow-y-auto py-1">
              {filteredApps.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-text-tertiary">
                  No results found
                </p>
              ) : (
                filteredApps.map((app, i) => {
                  const Icon = app.icon;
                  return (
                    <button
                      key={app.id}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2 text-left text-sm',
                        'transition-colors',
                        i === selectedIndex
                          ? 'bg-brand/8 text-text'
                          : 'text-text-secondary hover:bg-black/4',
                      )}
                      onClick={() => handleSelect(app)}
                      onMouseEnter={() => setSelectedIndex(i)}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/5">
                        <Icon className="h-4 w-4 text-text-secondary" />
                      </div>
                      <span className="font-medium">{app.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getRoute(appId: string): string {
  const routes: Record<string, string> = {
    'LIVINITY_files': '/files/Home',
    'LIVINITY_settings': '/settings',
    'LIVINITY_app-store': '/app-store',
    'LIVINITY_ai-chat': '/ai-chat',
    'LIVINITY_server-control': '/server-control',
    'LIVINITY_subagents': '/subagents',
    'LIVINITY_schedules': '/schedules',
    'LIVINITY_terminal': '/terminal',
    'LIVINITY_live-usage': '/live-usage',
  };
  return routes[appId] ?? '/';
}
