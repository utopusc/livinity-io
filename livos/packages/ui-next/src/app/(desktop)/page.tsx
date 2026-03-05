'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Package } from 'lucide-react';
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
/*  Desktop Page                                                       */
/* ------------------------------------------------------------------ */

export default function DesktopPage() {
  const { data: version } = trpcReact.system.version.useQuery();
  const { data: user } = trpcReact.user.get.useQuery();
  const { userApps } = useApps();

  const [wallpaperPickerOpen, setWallpaperPickerOpen] = useState(false);

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
                <AppGridItem key={app.id} app={app} index={i} />
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
};

function AppGridItem({ app, index }: AppGridItemProps) {
  const [imgError, setImgError] = useState(false);

  const handleClick = () => {
    window.open(getAppUrl(app), '_blank')?.focus();
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
      aria-label={`Open ${app.name}`}
      title={app.name}
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
