'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Dock,
  DockItem,
  DockLabel,
  DockIcon,
} from '@/components/motion-primitives/dock';
import {
  dockAppsGroup1,
  dockAppsGroup2,
  type SystemApp,
} from '@/providers/apps';
import { useWindowManager } from '@/providers/window-manager';

/* ------------------------------------------------------------------ */
/*  Dock Item                                                          */
/* ------------------------------------------------------------------ */

type AppDockItemProps = {
  app: SystemApp;
  isActive: boolean;
  onClick: () => void;
};

function AppDockItem({ app, isActive, onClick }: AppDockItemProps) {
  const Icon = app.icon;

  return (
    <DockItem
      className="relative flex flex-col items-center justify-end pb-1"
      onClick={onClick}
    >
      <DockLabel
        className="bg-white border border-black/[0.06] shadow-md text-neutral-700 text-xs font-medium rounded-lg px-2 py-0.5"
      >
        {app.name}
      </DockLabel>

      <DockIcon className="flex items-center justify-center">
        <Icon
          className="h-5 w-5 text-neutral-600"
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </DockIcon>

      {/* Active indicator dot */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            key="active-dot"
            className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          />
        )}
      </AnimatePresence>
    </DockItem>
  );
}

/* ------------------------------------------------------------------ */
/*  Dock Divider                                                       */
/* ------------------------------------------------------------------ */

// Accepts and discards any extra props injected by parent wrappers (e.g. width, isHovered).
function DockDivider(_props: Record<string, unknown>) {
  return (
    <div
      className="self-center mx-0.5 h-6 w-px shrink-0 bg-black/[0.08]"
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop Dock                                                       */
/* ------------------------------------------------------------------ */

export function DesktopDock() {
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
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <Dock
        className="bg-white/70 backdrop-blur-2xl border border-black/[0.06] shadow-lg"
        magnification={68}
        distance={140}
        panelHeight={52}
      >
        {/* Group 1: Home, Files, Settings, Usage, App Store */}
        {dockAppsGroup1.map((app) => (
          <AppDockItem
            key={app.id}
            app={app}
            isActive={isWindowOpen(app.id)}
            onClick={() => handleAppClick(app)}
          />
        ))}

        <DockDivider />

        {/* Group 2: AI Chat, Server, Agents, Schedules, Terminal */}
        {dockAppsGroup2.map((app) => (
          <AppDockItem
            key={app.id}
            app={app}
            isActive={isWindowOpen(app.id)}
            onClick={() => handleAppClick(app)}
          />
        ))}
      </Dock>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Returns the default route to open when launching a system app window.
 * Route is not used for rendering (content is determined by appId in
 * window-content.tsx), so we always return '/'.
 */
function getDefaultRoute(_appId: string): string {
  return '/';
}
