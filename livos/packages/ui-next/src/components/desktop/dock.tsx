'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  dockAppsGroup1,
  dockAppsGroup2,
  type SystemApp,
} from '@/providers/apps';
import { useWindowManager } from '@/providers/window-manager';

/* ------------------------------------------------------------------ */
/*  Dock Item                                                          */
/* ------------------------------------------------------------------ */

type DockItemProps = {
  app: SystemApp;
  isActive?: boolean;
  onClick: () => void;
};

function DockItem({ app, isActive, onClick }: DockItemProps) {
  const [hovered, setHovered] = useState(false);
  const Icon = app.icon;

  return (
    <motion.button
      className={cn(
        'relative flex h-11 w-11 items-center justify-center rounded-xl',
        'transition-colors duration-150',
        isActive
          ? 'bg-brand/10 text-brand'
          : 'text-text-tertiary hover:bg-black/5 hover:text-text',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} />

      {/* Label tooltip on hover */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            className="pointer-events-none absolute -top-9 left-1/2 z-50 whitespace-nowrap rounded-lg bg-surface-0 px-2.5 py-1 text-xs font-medium text-text shadow-lg border border-border backdrop-blur-sm"
            initial={{ opacity: 0, y: 4, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 4, x: '-50%' }}
            transition={{ duration: 0.15 }}
          >
            {app.name}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active indicator dot */}
      {isActive && (
        <motion.div
          className="absolute -bottom-1 left-1/2 h-1 w-1 rounded-full bg-brand"
          layoutId="dock-active-dot"
          style={{ x: '-50%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        />
      )}
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Dock Divider                                                       */
/* ------------------------------------------------------------------ */

function DockDivider() {
  return <div className="mx-1 h-6 w-px bg-black/8" />;
}

/* ------------------------------------------------------------------ */
/*  Dock                                                               */
/* ------------------------------------------------------------------ */

export function Dock() {
  const wm = useWindowManager();

  const handleAppClick = useCallback(
    (app: SystemApp) => {
      if (app.id === 'LIVINITY_home') {
        // Minimize all windows (go to desktop)
        wm.windows.forEach((w) => wm.minimizeWindow(w.id));
        return;
      }

      // Check if window already exists
      const existing = wm.getWindowByAppId(app.id);
      if (existing) {
        if (existing.isMinimized) {
          wm.restoreWindow(existing.id);
        } else {
          wm.focusWindow(existing.id);
        }
        return;
      }

      // Open new window
      const route = getDefaultRoute(app.id);
      wm.openWindow(app.id, route, app.name, '');
    },
    [wm],
  );

  const isWindowOpen = useCallback(
    (appId: string) => {
      const w = wm.getWindowByAppId(appId);
      return w != null && !w.isMinimized;
    },
    [wm],
  );

  return (
    <motion.div
      className="fixed bottom-3 left-1/2 z-[var(--z-sticky)]"
      style={{ x: '-50%' }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className={cn(
          'flex items-center gap-0.5 rounded-2xl px-2 py-1.5',
          'bg-white/80 backdrop-blur-2xl',
          'border border-black/8',
          'shadow-float',
        )}
      >
        {/* Group 1: Home, Files, Settings, Usage, App Store */}
        {dockAppsGroup1.map((app) => (
          <DockItem
            key={app.id}
            app={app}
            isActive={isWindowOpen(app.id)}
            onClick={() => handleAppClick(app)}
          />
        ))}

        <DockDivider />

        {/* Group 2: AI Chat, Server, Agents, Schedules, Terminal */}
        {dockAppsGroup2.map((app) => (
          <DockItem
            key={app.id}
            app={app}
            isActive={isWindowOpen(app.id)}
            onClick={() => handleAppClick(app)}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getDefaultRoute(appId: string): string {
  switch (appId) {
    case 'LIVINITY_files':
      return '/files/Home';
    case 'LIVINITY_settings':
      return '/settings';
    case 'LIVINITY_app-store':
      return '/app-store';
    case 'LIVINITY_ai-chat':
      return '/ai-chat';
    case 'LIVINITY_server-control':
      return '/server-control';
    case 'LIVINITY_subagents':
      return '/subagents';
    case 'LIVINITY_schedules':
      return '/schedules';
    case 'LIVINITY_terminal':
      return '/terminal';
    case 'LIVINITY_live-usage':
      return '/live-usage';
    default:
      return '/';
  }
}
