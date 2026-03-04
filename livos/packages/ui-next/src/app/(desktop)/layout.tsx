'use client';

import { EnsureLoggedIn } from '@/providers/auth-guard';
import { WallpaperProvider, WallpaperBackground } from '@/providers/wallpaper';
import { WindowManagerProvider } from '@/providers/window-manager';
import { AppsProvider } from '@/providers/apps';

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return (
    <EnsureLoggedIn>
      <WallpaperProvider>
        <WindowManagerProvider>
          <AppsProvider>
            <WallpaperBackground />
            <div className="relative z-[var(--z-base)] min-h-dvh">
              {children}
            </div>
          </AppsProvider>
        </WindowManagerProvider>
      </WallpaperProvider>
    </EnsureLoggedIn>
  );
}
