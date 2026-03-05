'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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
        {/* Desktop content — greeting + clock */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-20">
          <div className="text-center">
            <TextEffect
              as="h1"
              per="word"
              preset="fade-in-blur"
              className="text-display-sm font-bold tracking-tight text-white drop-shadow-sm sm:text-display-md"
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
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 18) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}
