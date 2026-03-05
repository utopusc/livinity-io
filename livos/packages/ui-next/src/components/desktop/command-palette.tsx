'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatedBackground } from '@/components/motion-primitives/animated-background';
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
    if (open) {
      // Small delay so AnimatePresence mounts first
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
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

  // The active id for AnimatedBackground — tracks keyboard selection
  const activeId = filteredApps[selectedIndex]?.id ?? null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — very subtle */}
          <motion.div
            className="fixed inset-0 z-[var(--z-overlay)] bg-black/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          />

          {/* Palette */}
          <motion.div
            className={cn(
              'fixed left-1/2 top-[14%] z-[var(--z-modal)] w-full max-w-lg -translate-x-1/2',
              'overflow-hidden rounded-xl',
              'bg-white',
              'border border-black/[0.06]',
              'shadow-[0_24px_64px_oklch(0_0_0/0.18),0_4px_16px_oklch(0_0_0/0.08),0_0_0_0.5px_oklch(0_0_0/0.06)]',
            )}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Search input row */}
            <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-3.5">
              <Search className="h-4 w-4 shrink-0 text-neutral-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search apps..."
                className="flex-1 bg-transparent text-[13px] text-neutral-900 placeholder:text-neutral-400 outline-none"
              />
              <div className="flex items-center gap-1">
                <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                  ESC
                </kbd>
              </div>
            </div>

            {/* Results list */}
            <div className="max-h-[320px] overflow-y-auto py-1.5">
              {filteredApps.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-neutral-400">
                  No results for &ldquo;{query}&rdquo;
                </p>
              ) : (
                <div className="px-1.5">
                  {/* AnimatedBackground slides the highlight between items */}
                  <AnimatedBackground
                    defaultValue={activeId ?? undefined}
                    className="rounded-lg bg-neutral-100"
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 30,
                    }}
                    enableHover
                    onValueChange={(id) => {
                      const idx = filteredApps.findIndex((a) => a.id === id);
                      if (idx !== -1) setSelectedIndex(idx);
                    }}
                  >
                    {filteredApps.map((app, i) => {
                      const Icon = app.icon;
                      const isSelected = i === selectedIndex;
                      return (
                        <button
                          key={app.id}
                          data-id={app.id}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left',
                            'transition-colors duration-100',
                            isSelected ? 'text-neutral-900' : 'text-neutral-600',
                          )}
                          onClick={() => handleSelect(app)}
                          onMouseEnter={() => setSelectedIndex(i)}
                          aria-selected={isSelected}
                        >
                          {/* App icon container */}
                          <div
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                              'transition-colors duration-100',
                              isSelected
                                ? 'bg-brand/10 text-brand'
                                : 'bg-neutral-100 text-neutral-500',
                            )}
                          >
                            <Icon className="h-[15px] w-[15px]" />
                          </div>

                          {/* App name */}
                          <span className="flex-1 text-[13px] font-medium">
                            {app.name}
                          </span>

                          {/* Enter hint — only on selected row */}
                          {isSelected && (
                            <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                              <kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium">
                                Enter
                              </kbd>
                              <ArrowRight className="h-3 w-3 text-neutral-300" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </AnimatedBackground>
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-3 border-t border-black/[0.04] px-4 py-2">
              <span className="text-[10px] text-neutral-400">
                <kbd className="mr-1 rounded bg-neutral-100 px-1 py-0.5 font-medium text-neutral-500">
                  ↑↓
                </kbd>
                navigate
              </span>
              <span className="text-[10px] text-neutral-400">
                <kbd className="mr-1 rounded bg-neutral-100 px-1 py-0.5 font-medium text-neutral-500">
                  ↵
                </kbd>
                open
              </span>
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
