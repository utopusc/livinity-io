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
          <div className="text-center">
            <TextEffect
              as="h1"
              per="word"
              preset="fade-in-blur"
              className="text-display-sm font-bold tracking-tight text-text sm:text-display-md"
              speedReveal={1.4}
            >
              {greeting}
            </TextEffect>

            {version && (
              <motion.p
                className="mt-2 text-sm text-text-tertiary"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.4 }}
              >
                {version.name} v{version.version}
              </motion.p>
            )}
          </div>

          {/* Cmd+K hint */}
          <motion.div
            className="mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
          >
            <button
              className="flex items-center gap-2 rounded-xl bg-black/5 px-4 py-2 text-sm text-text-secondary backdrop-blur-sm transition-colors hover:bg-black/8 hover:text-text"
              onClick={() => {
                // Dispatch Cmd+K
                window.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
                );
              }}
            >
              <span>Search</span>
              <kbd className="rounded bg-black/8 px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary">
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
