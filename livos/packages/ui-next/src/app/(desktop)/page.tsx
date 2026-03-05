'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  ExternalLink,
  Play,
  Square,
  RotateCcw,
  Store,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { trpcReact } from '@/trpc/client';
import {
  Dock,
  WindowsContainer,
  WindowContent,
  DesktopContextMenu,
  CommandPalette,
  WallpaperPicker,
} from '@/components/desktop';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { SlidingNumber } from '@/components/motion-primitives/sliding-number';
import { type WindowState } from '@/providers/window-manager';
import { useApps, type UserApp } from '@/providers/apps';
import { useWindowManager } from '@/providers/window-manager';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Live Clock                                                         */
/* ------------------------------------------------------------------ */

function LiveClock() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    // Sync to the next full second before starting interval
    const now = new Date();
    const msToNextSecond = 1000 - now.getMilliseconds();
    const timeout = setTimeout(() => {
      setTime(new Date());
      const interval = setInterval(() => setTime(new Date()), 1000);
      return () => clearInterval(interval);
    }, msToNextSecond);
    return () => clearTimeout(timeout);
  }, []);

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const isPM = hours >= 12;
  const displayHours = hours % 12 || 12;

  return (
    <motion.div
      className="mt-5 flex items-center justify-center gap-1 font-mono text-4xl font-light tracking-tight text-white/90 drop-shadow-sm sm:text-5xl"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      aria-label={`Current time: ${displayHours}:${String(minutes).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`}
    >
      {/* Hours */}
      <span className="inline-flex">
        <SlidingNumber value={displayHours} padStart />
      </span>

      {/* Blinking colon */}
      <motion.span
        className="mb-1 select-none text-white/60"
        animate={{ opacity: [1, 0.2, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        :
      </motion.span>

      {/* Minutes */}
      <span className="inline-flex">
        <SlidingNumber value={minutes} padStart />
      </span>

      {/* AM/PM */}
      <span className="mb-1 ml-2 self-end text-base font-normal text-white/50">
        {isPM ? 'PM' : 'AM'}
      </span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  App Context Menu                                                   */
/* ------------------------------------------------------------------ */

type AppMenuState = {
  app: UserApp;
  x: number;
  y: number;
} | null;

type AppContextMenuProps = {
  menuState: AppMenuState;
  onClose: () => void;
  onOpenAppStore: (appId: string) => void;
};

function AppContextMenu({ menuState, onClose, onOpenAppStore }: AppContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const utils = trpcReact.useUtils();

  const startMutation = trpcReact.apps.start.useMutation({
    onSettled: () => utils.apps.list.invalidate(),
  });
  const stopMutation = trpcReact.apps.stop.useMutation({
    onSettled: () => utils.apps.list.invalidate(),
  });
  const restartMutation = trpcReact.apps.restart.useMutation({
    onSettled: () => utils.apps.list.invalidate(),
  });
  const uninstallMutation = trpcReact.apps.uninstall.useMutation({
    onSettled: () => utils.apps.list.invalidate(),
  });

  // Reset confirm state when menu closes or switches app
  useEffect(() => {
    if (!menuState) setConfirmUninstall(false);
  }, [menuState]);

  // Close on click-outside or Escape
  useEffect(() => {
    if (!menuState) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Use capture so this fires before other handlers
    window.addEventListener('mousedown', handleClick, true);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick, true);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menuState, onClose]);

  if (!menuState) return null;

  const { app, x, y } = menuState;
  const isRunning = app.state === 'running';
  const isStopped = app.state === 'stopped';

  // Clamp position so the menu stays within viewport
  const menuWidth = 200;
  const menuHeight = confirmUninstall ? 96 : isRunning ? 200 : 168;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);

  const handleOpen = () => {
    window.open(getAppUrl(app), '_blank')?.focus();
    onClose();
  };

  const handleStart = () => {
    startMutation.mutate({ appId: app.id });
    onClose();
  };

  const handleStop = () => {
    stopMutation.mutate({ appId: app.id });
    onClose();
  };

  const handleRestart = () => {
    restartMutation.mutate({ appId: app.id });
    onClose();
  };

  const handleGoToStore = () => {
    onOpenAppStore(app.id);
    onClose();
  };

  const handleUninstallConfirm = () => {
    uninstallMutation.mutate({ appId: app.id });
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        key={`app-ctx-${app.id}`}
        className={cn(
          'fixed z-[var(--z-popover)] min-w-[200px] overflow-hidden rounded-lg py-1',
          'bg-white',
          'border border-black/[0.06]',
          'shadow-[0_8px_32px_oklch(0_0_0/0.12),0_2px_8px_oklch(0_0_0/0.06),0_0_0_0.5px_oklch(0_0_0/0.05)]',
        )}
        style={{ left, top }}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
        data-no-context-menu
        role="menu"
        aria-label={`${app.name} options`}
      >
        {confirmUninstall ? (
          /* Uninstall confirmation inline step */
          <div className="px-3 py-2">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" aria-hidden="true" />
              <span className="text-[12px] font-medium text-neutral-700">
                Uninstall {app.name}?
              </span>
            </div>
            <p className="mb-3 text-[11px] leading-snug text-neutral-400">
              All data for this app will be permanently removed.
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-md border border-black/[0.08] px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
                onClick={() => setConfirmUninstall(false)}
                role="menuitem"
              >
                Cancel
              </button>
              <button
                className="flex-1 rounded-md bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600 transition-colors"
                onClick={handleUninstallConfirm}
                role="menuitem"
              >
                Uninstall
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Open */}
            <MenuButton
              icon={ExternalLink}
              label="Open"
              onClick={handleOpen}
            />

            <div className="my-1 border-t border-black/[0.05]" />

            {/* Start / Stop */}
            {isStopped && (
              <MenuButton
                icon={Play}
                label="Start"
                onClick={handleStart}
                disabled={startMutation.isPending}
              />
            )}
            {isRunning && (
              <MenuButton
                icon={Square}
                label="Stop"
                onClick={handleStop}
                disabled={stopMutation.isPending}
              />
            )}

            {/* Restart — only when running */}
            {isRunning && (
              <MenuButton
                icon={RotateCcw}
                label="Restart"
                onClick={handleRestart}
                disabled={restartMutation.isPending}
              />
            )}

            <div className="my-1 border-t border-black/[0.05]" />

            {/* Go to App Store */}
            <MenuButton
              icon={Store}
              label="Go to App Store"
              onClick={handleGoToStore}
            />

            <div className="my-1 border-t border-black/[0.05]" />

            {/* Uninstall */}
            <MenuButton
              icon={Trash2}
              label="Uninstall"
              onClick={() => setConfirmUninstall(true)}
              destructive
            />
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

type MenuButtonProps = {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

function MenuButton({ icon: Icon, label, onClick, destructive, disabled }: MenuButtonProps) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left',
        'text-[13px] transition-colors duration-100',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        destructive
          ? 'text-red-500 hover:bg-red-50'
          : 'text-neutral-700 hover:bg-neutral-50',
      )}
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0',
          destructive ? 'text-red-400' : 'text-neutral-400',
        )}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop Page                                                       */
/* ------------------------------------------------------------------ */

export default function DesktopPage() {
  const { data: version } = trpcReact.system.version.useQuery();
  const { data: user } = trpcReact.user.get.useQuery();
  const { userApps } = useApps();
  const wm = useWindowManager();

  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);
  const [appMenu, setAppMenu] = useState<AppMenuState>(null);

  // Prevent body scroll on desktop
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, []);

  const renderWindowContent = useCallback(
    (win: WindowState) => <WindowContent window={win} />,
    [],
  );

  const handleAppContextMenu = useCallback(
    (app: UserApp, x: number, y: number) => {
      setAppMenu({ app, x, y });
    },
    [],
  );

  const closeAppMenu = useCallback(() => setAppMenu(null), []);

  const handleOpenAppStore = useCallback(
    (_appId: string) => {
      const appStoreId = 'LIVINITY_app-store';
      const existing = wm.getWindowByAppId(appStoreId);
      if (existing) {
        if (existing.isMinimized) {
          wm.restoreWindow(existing.id);
        } else {
          wm.focusWindow(existing.id);
        }
      } else {
        wm.openWindow(appStoreId, '/', 'App Store', '');
      }
    },
    [wm],
  );

  const greeting = user?.name
    ? getGreeting(user.name)
    : 'Welcome';

  return (
    <DesktopContextMenu onChangeWallpaper={() => setWallpaperPickerOpen(true)}>
      <div className="flex min-h-dvh flex-col">
        {/* Desktop content — greeting + clock + app grid */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-20">
          {/* Greeting & clock */}
          <div className="text-center">
            <TextEffect
              as="h1"
              per="word"
              preset="fade-in-blur"
              className="text-3xl font-bold tracking-tight text-white drop-shadow-sm sm:text-4xl"
              speedReveal={1.4}
            >
              {greeting}
            </TextEffect>

            <LiveClock />

            {version && (
              <motion.p
                className="mt-4 text-xs text-white/35"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.5 }}
              >
                {version.name} v{version.version}
              </motion.p>
            )}
          </div>

          {/* Installed app grid */}
          {userApps.length > 0 && (
            <motion.div
              className="mt-10 grid grid-cols-4 gap-6 sm:grid-cols-5 md:grid-cols-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0, duration: 0.4 }}
            >
              {userApps.map((app, i) => (
                <AppGridItem
                  key={app.id}
                  app={app}
                  index={i}
                  onContextMenu={handleAppContextMenu}
                />
              ))}
            </motion.div>
          )}
        </div>

        {/* Windows layer */}
        <WindowsContainer renderContent={renderWindowContent} />

        {/* Command Palette */}
        <CommandPalette />

        {/* Dock */}
        <Dock />

        {/* Wallpaper Picker */}
        <WallpaperPicker
          open={wallpaperPickerOpen}
          onClose={() => setWallpaperPickerOpen(false)}
        />

        {/* App context menu — rendered at the top level so it overlays everything */}
        <AppContextMenu
          menuState={appMenu}
          onClose={closeAppMenu}
          onOpenAppStore={handleOpenAppStore}
        />
      </div>
    </DesktopContextMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  App Grid Item                                                      */
/* ------------------------------------------------------------------ */

type AppGridItemProps = {
  app: UserApp;
  index: number;
  onContextMenu: (app: UserApp, x: number, y: number) => void;
};

function AppGridItem({ app, index, onContextMenu }: AppGridItemProps) {
  const [imgError, setImgError] = useState(false);

  const handleClick = () => {
    window.open(getAppUrl(app), '_blank')?.focus();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Stop propagation so the DesktopContextMenu does not also open
    e.stopPropagation();
    onContextMenu(app, e.clientX, e.clientY);
  };

  return (
    <motion.button
      className="flex flex-col items-center gap-2 rounded-2xl p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.0 + index * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.96 }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      aria-label={`Open ${app.name}`}
      title={app.name}
      data-no-context-menu
    >
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/20 shadow-lg ring-1 ring-white/10 backdrop-blur-sm transition-all duration-150 hover:ring-2 hover:ring-white/40">
        {app.icon && !imgError ? (
          <img
            src={app.icon}
            alt={app.name}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <Package className="h-7 w-7 text-white/70" strokeWidth={1.5} aria-hidden="true" />
        )}
      </div>

      {/* Label */}
      <span className="max-w-[72px] truncate text-center text-xs font-medium text-white/80 drop-shadow-sm">
        {app.name}
      </span>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getAppUrl(app: UserApp): string {
  const { protocol, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:${app.port}`;
  }
  // Production: subdomain-based routing
  const domain = hostname.split('.').slice(-2).join('.');
  return `${protocol}//${app.id}.${domain}${app.path ?? ''}`;
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 18) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}
