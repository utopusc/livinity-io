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
import { type WindowState } from '@/providers/window-manager';

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
        {/* Desktop content — greeting area */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-20">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-display-sm font-bold tracking-tight text-white drop-shadow-lg sm:text-display-md">
              {greeting}
            </h1>
            {version && (
              <p className="mt-2 text-sm text-white/60 drop-shadow">
                {version.name} v{version.version}
              </p>
            )}
          </motion.div>

          {/* Cmd+K hint */}
          <motion.div
            className="mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <button
              className="flex items-center gap-2 rounded-xl bg-white/8 px-4 py-2 text-sm text-white/50 backdrop-blur-sm transition-colors hover:bg-white/12 hover:text-white/70"
              onClick={() => {
                // Dispatch Cmd+K
                window.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
                );
              }}
            >
              <span>Search</span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium">
                Ctrl+K
              </kbd>
            </button>
          </motion.div>
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
